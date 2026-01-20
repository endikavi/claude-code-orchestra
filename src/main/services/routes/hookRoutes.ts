import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { Server as SocketIOServer } from 'socket.io';
import { getProcessManager } from '../ProcessManager';
import { getNotificationManager } from '../NotificationManager';
import { getPermissionManager } from '../PermissionManager';
import { getMetricsService } from '../MetricsService';
import { getFileLockManager } from '../FileLockManager';
import { getSubagentTracker } from '../SubagentTracker';
import { DataStore } from '../DataStore';
import { IPC_CHANNELS } from '../../ipc/channels';
import type {
  ToolUseEvent,
  StopEvent,
  StatusUpdateEvent,
  HookNotificationInput,
  PermissionCheckRequest,
  PermissionCheckResponse,
} from '@shared/types';
import type { ServerToClientEvents, ClientToServerEvents } from '@shared/types/remote';

export interface HookRoutesDeps {
  emitter: EventEmitter;
  getIO: () => SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null;
  sendToRenderer: (channel: string, ...args: unknown[]) => void;
}

/**
 * Extract file paths from tool input for activity tracking
 */
function extractFilesFromToolInput(
  toolName: string,
  toolInput: Record<string, unknown> | null | undefined
): string[] {
  if (!toolInput) return [];

  const files: string[] = [];

  switch (toolName) {
    case 'Write':
    case 'Edit':
    case 'Read':
      if (typeof toolInput.file_path === 'string') {
        files.push(toolInput.file_path);
      }
      break;

    case 'Bash': {
      // Heuristic: extract file paths from common command patterns
      const command = toolInput.command;
      if (typeof command === 'string') {
        // Match common file operations: cat, grep, sed, cp, mv, rm, touch, mkdir
        const filePattern =
          /(?:cat|grep|sed|cp|mv|rm|touch|mkdir|ls|chmod|chown|head|tail|less|more|vi|vim|nano|code|git\s+add|git\s+rm)\s+["']?([^\s"'|><&;]+)/g;
        let match;
        while ((match = filePattern.exec(command)) !== null) {
          const path = match[1];
          // Filter out flags and common non-file arguments
          if (
            (path && !path.startsWith('-') && !path.startsWith('$') && path.includes('/')) ||
            path.includes('.')
          ) {
            files.push(path);
          }
        }
      }
      break;
    }

    case 'Glob':
      if (typeof toolInput.pattern === 'string') {
        // For glob, include the pattern as a reference
        files.push(toolInput.pattern);
      }
      break;

    case 'NotebookEdit':
      if (typeof toolInput.notebook_path === 'string') {
        files.push(toolInput.notebook_path);
      }
      break;
  }

  return files.slice(0, 10); // Limit to 10 files
}

export function createHookRoutes(deps: HookRoutesDeps): Router {
  const router = Router();
  const processManager = getProcessManager();
  const dataStore = DataStore.getInstance();

  // Notification endpoint - receives notifications from Claude CLI
  router.post('/notify', (req: Request, res: Response) => {
    try {
      const { instanceId, data, timestamp } = req.body as {
        instanceId: string;
        eventType: string;
        data: HookNotificationInput;
        timestamp: number;
      };

      console.log(`[HookRoutes] Hook notification from ${instanceId}`);

      // Get project ID from instance
      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Create dashboard notification
      const notificationManager = getNotificationManager();
      notificationManager.handleHookNotification(data, instanceId, projectId);

      // Record metric
      const metricsService = getMetricsService();
      metricsService.recordHookEvent({
        instanceId,
        projectId: projectId || 'unknown',
        eventType: 'Notification',
        timestamp: timestamp || Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook notify error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Post-tool endpoint - receives tool use events after execution
  router.post('/post-tool', (req: Request, res: Response) => {
    try {
      const { instanceId, data, timestamp } = req.body as {
        instanceId: string;
        eventType: string;
        data?: {
          tool_name?: string;
          tool_input?: Record<string, unknown>;
          tool_use_id?: string;
          tool_result?: string;
          success?: boolean;
          duration_ms?: number;
        } | null;
        timestamp: number;
      };

      console.log(
        `[HookRoutes] Hook post-tool from ${instanceId}: ${data?.tool_name || 'unknown'}`
      );

      // Detect Task tool completion (subagent finished)
      if (data?.tool_name === 'Task') {
        const subagentTracker = getSubagentTracker();

        // Try to find and complete the subagent
        // First try by tool_use_id, then try by finding any running subagent for this instance
        let completedSubagent = null;

        if (data.tool_use_id) {
          completedSubagent = subagentTracker.completeSubagent(instanceId, {
            id: data.tool_use_id,
            result: data.tool_result || '',
            isError: data.success === false,
          });
        }

        // If no tool_use_id, try to complete the most recent running subagent
        if (!completedSubagent) {
          const runningSubagents = subagentTracker
            .getSubagents(instanceId)
            .filter((s) => s.status === 'running');
          if (runningSubagents.length > 0) {
            const lastRunning = runningSubagents[runningSubagents.length - 1];
            completedSubagent = subagentTracker.completeSubagent(instanceId, {
              id: lastRunning.id,
              result: data.tool_result || '',
              isError: data.success === false,
            });
          }
        }

        if (completedSubagent) {
          console.log(
            `[HookRoutes] Task tool completed! Subagent ${completedSubagent.id} for instance ${instanceId}`
          );

          // Emit event to renderer
          deps.sendToRenderer(IPC_CHANNELS.SUBAGENT_COMPLETED, instanceId, completedSubagent);

          // Also broadcast to Socket.IO clients
          const io = deps.getIO();
          if (io) {
            io.emit('subagent:completed', { instanceId, subagent: completedSubagent });
          }
        }
      }

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Record tool use metric (with null safety for data)
      const metricsService = getMetricsService();
      const toolName = data?.tool_name || 'unknown';
      const toolEvent: ToolUseEvent = {
        instanceId,
        projectId: projectId || 'unknown',
        toolName,
        toolInput: data?.tool_input || {},
        success: data?.success !== false,
        durationMs: data?.duration_ms,
        timestamp: timestamp || Date.now(),
      };
      metricsService.recordToolUse(toolEvent);

      // Extract files from tool input for activity tracking
      const files = extractFilesFromToolInput(toolName, data?.tool_input);

      // Track files with FileLockManager and check for conflicts
      const fileLockManager = getFileLockManager();
      const notificationManager = getNotificationManager();
      const conflictFiles: string[] = [];

      // Determine action type based on tool
      let fileAction: 'read' | 'write' | 'create' | 'delete' = 'read';
      if (toolName === 'Write') {
        fileAction = 'create';
      } else if (toolName === 'Edit' || toolName === 'NotebookEdit') {
        fileAction = 'write';
      } else if (toolName === 'Bash') {
        // Check for write-like commands
        const command = data?.tool_input?.command;
        if (typeof command === 'string' && /\b(rm|mv|cp|mkdir|touch|chmod|chown)\b/.test(command)) {
          fileAction = 'write';
        }
      }

      // Track each file and check for conflicts
      for (const file of files) {
        const conflict = fileLockManager.trackFile(
          instanceId,
          projectId || 'unknown',
          file,
          fileAction
        );
        if (conflict) {
          conflictFiles.push(file);
        }
      }

      // Notify if there are conflicts
      if (conflictFiles.length > 0 && projectId) {
        notificationManager.notifyCollaborationAlert(instanceId, projectId, conflictFiles);
      }

      // Emit event for real-time tracking
      deps.emitter.emit('hook:toolUse', toolEvent);

      // Send activity update to renderer via IPC
      const activityData = {
        instanceId,
        toolName,
        files,
        timestamp: timestamp || Date.now(),
      };
      deps.sendToRenderer('hook:activity', activityData);

      // Also broadcast to Socket.IO clients
      const io = deps.getIO();
      if (io) {
        io.emit('hook:activity', activityData);
      }

      res.json({ success: true, conflicts: conflictFiles });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook post-tool error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // File lock query endpoint - check if a file has conflicts
  router.get('/file-lock', (req: Request, res: Response) => {
    try {
      const fileParam = req.query.file;
      const instanceIdParam = req.query.instanceId;

      // Handle both string and string[] query params
      const file = Array.isArray(fileParam) ? fileParam[0] : fileParam;
      const instanceId = Array.isArray(instanceIdParam)
        ? instanceIdParam[0]
        : instanceIdParam || '';

      if (!file || typeof file !== 'string') {
        res.status(400).json({ success: false, error: 'File parameter is required' });
        return;
      }

      const fileLockManager = getFileLockManager();
      const conflicts = fileLockManager.detectConflicts(instanceId as string, file);

      res.json({
        success: true,
        data: {
          file,
          locked: conflicts !== null,
          conflicts: conflicts || [],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] File lock query error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // File lock stats endpoint - get overall lock statistics
  router.get('/file-lock/stats', (_req: Request, res: Response) => {
    try {
      const fileLockManager = getFileLockManager();
      const stats = fileLockManager.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] File lock stats error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Get active files for an instance
  router.get('/file-lock/instance/:instanceId', (req: Request, res: Response) => {
    try {
      const instanceId = req.params.instanceId as string;
      const fileLockManager = getFileLockManager();
      const files = fileLockManager.getActiveFilesByInstance(instanceId);

      res.json({
        success: true,
        data: {
          instanceId,
          files,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Instance files query error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Pre-tool permission check endpoint
  router.post('/permission/check', (req: Request, res: Response) => {
    try {
      const { instanceId, toolName, toolInput, timestamp } = req.body as PermissionCheckRequest;

      console.log(`[HookRoutes] Permission check from ${instanceId}: ${toolName}`);

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId || 'unknown';

      // Detect Task tool usage (subagent spawning) - do this BEFORE permission check
      if (toolName === 'Task' && toolInput) {
        const taskInput = toolInput as {
          description?: string;
          prompt?: string;
          subagent_type?: string;
        };

        // Generate a unique ID for this subagent
        const subagentId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        console.log(
          `[HookRoutes] Task tool detected via permission check! Starting subagent ${subagentId} for instance ${instanceId}`
        );

        const subagentTracker = getSubagentTracker();
        const subagent = subagentTracker.startSubagent(instanceId, {
          id: subagentId,
          description: taskInput.description || 'Unknown task',
          prompt: taskInput.prompt || '',
          subagentType: taskInput.subagent_type || 'general-purpose',
        });

        // Emit event to renderer
        deps.sendToRenderer(IPC_CHANNELS.SUBAGENT_STARTED, instanceId, subagent);

        // Also broadcast to Socket.IO clients
        const io = deps.getIO();
        if (io) {
          io.emit('subagent:started', { instanceId, subagent });
        }
      }

      // Check permission with PermissionManager
      const permissionManager = getPermissionManager();
      const result = permissionManager.checkPermission({
        instanceId,
        projectId,
        toolName,
        toolInput,
        timestamp: timestamp || Date.now(),
      });

      // Record the permission check
      const metricsService = getMetricsService();
      metricsService.recordPermissionCheck({
        instanceId,
        projectId,
        toolName,
        decision: result.decision,
        timestamp: timestamp || Date.now(),
      });

      const response: PermissionCheckResponse = {
        decision: result.decision,
        reason: result.reason,
        ruleId: result.ruleId,
      };

      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook permission check error:', message);
      // On error, return 'ask' to let Claude handle normally
      res.json({
        decision: 'ask',
        reason: 'Dashboard error: ' + message,
      } as PermissionCheckResponse);
    }
  });

  // Stop/stopped endpoint - instance stopped
  router.post('/stopped', (req: Request, res: Response) => {
    try {
      const { instanceId, data, timestamp } = req.body as {
        instanceId: string;
        eventType: string;
        data?: { reason?: string; total_cost_usd?: number; duration_ms?: number } | null;
        timestamp: number;
      };

      console.log(`[HookRoutes] Hook stopped from ${instanceId}`);

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Record stop event (with null safety for data)
      const metricsService = getMetricsService();
      const stopEvent: StopEvent = {
        instanceId,
        projectId: projectId || 'unknown',
        reason: data?.reason,
        totalCostUsd: data?.total_cost_usd,
        durationMs: data?.duration_ms,
        timestamp: timestamp || Date.now(),
      };
      metricsService.recordSessionEnd(stopEvent);

      // Create notification for task completion
      const notificationManager = getNotificationManager();
      if (projectId) {
        notificationManager.notifyTaskCompleted(
          instanceId,
          projectId,
          undefined,
          data?.total_cost_usd
        );
      }

      deps.emitter.emit('hook:stopped', stopEvent);

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook stopped error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Session start endpoint
  router.post('/session-start', (req: Request, res: Response) => {
    try {
      const { instanceId, data, timestamp } = req.body as {
        instanceId: string;
        data?: { session_id?: string } | null;
        timestamp: number;
      };

      console.log(`[HookRoutes] Hook session-start from ${instanceId}`);

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Record session start (with null safety for data)
      const metricsService = getMetricsService();
      metricsService.recordSessionStart({
        instanceId,
        projectId: projectId || 'unknown',
        sessionId: data?.session_id,
        timestamp: timestamp || Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook session-start error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Session end endpoint
  router.post('/session-end', (req: Request, res: Response) => {
    try {
      const { instanceId, data, timestamp } = req.body as {
        instanceId: string;
        data?: { session_id?: string; total_cost_usd?: number } | null;
        timestamp: number;
      };

      console.log(`[HookRoutes] Hook session-end from ${instanceId}`);

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Record session end (with null safety for data)
      const metricsService = getMetricsService();
      metricsService.recordSessionEnd({
        instanceId,
        projectId: projectId || 'unknown',
        sessionId: data?.session_id,
        totalCostUsd: data?.total_cost_usd,
        timestamp: timestamp || Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook session-end error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // User prompt submit endpoint
  router.post('/prompt-submit', (req: Request, res: Response) => {
    try {
      const { instanceId, data, timestamp } = req.body as {
        instanceId: string;
        data?: { prompt?: string; session_id?: string } | null;
        timestamp: number;
      };

      console.log(`[HookRoutes] Hook prompt-submit from ${instanceId}`);

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Record prompt event
      const metricsService = getMetricsService();
      metricsService.recordHookEvent({
        instanceId,
        projectId: projectId || 'unknown',
        eventType: 'UserPromptSubmit',
        timestamp: timestamp || Date.now(),
      });

      // Emit event for real-time tracking
      deps.emitter.emit('hook:promptSubmit', {
        instanceId,
        projectId,
        prompt: data?.prompt,
        timestamp: timestamp || Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook prompt-submit error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Pre-tool endpoint (generic tracking, separate from permission check)
  router.post('/pre-tool', (req: Request, res: Response) => {
    try {
      const { instanceId, data, timestamp } = req.body as {
        instanceId: string;
        data?: {
          tool_name?: string;
          tool_input?: Record<string, unknown>;
          tool_use_id?: string;
        } | null;
        timestamp: number;
      };

      console.log(`[HookRoutes] Hook pre-tool from ${instanceId}: ${data?.tool_name || 'unknown'}`);

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Record pre-tool event
      const metricsService = getMetricsService();
      metricsService.recordHookEvent({
        instanceId,
        projectId: projectId || 'unknown',
        eventType: 'PreToolUse',
        timestamp: timestamp || Date.now(),
      });

      // Detect Task tool usage (subagent spawning)
      if (data?.tool_name === 'Task' && data.tool_input) {
        const toolInput = data.tool_input as {
          description?: string;
          prompt?: string;
          subagent_type?: string;
        };

        // Generate a unique ID for this subagent (use tool_use_id if available)
        const subagentId =
          data.tool_use_id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        console.log(
          `[HookRoutes] Task tool detected! Starting subagent ${subagentId} for instance ${instanceId}`
        );

        const subagentTracker = getSubagentTracker();
        const subagent = subagentTracker.startSubagent(instanceId, {
          id: subagentId,
          description: toolInput.description || 'Unknown task',
          prompt: toolInput.prompt || '',
          subagentType: toolInput.subagent_type || 'general-purpose',
        });

        // Emit event to renderer
        deps.sendToRenderer(IPC_CHANNELS.SUBAGENT_STARTED, instanceId, subagent);

        // Also broadcast to Socket.IO clients
        const io = deps.getIO();
        if (io) {
          io.emit('subagent:started', { instanceId, subagent });
        }
      }

      // Emit event for real-time tracking
      deps.emitter.emit('hook:preTool', {
        instanceId,
        projectId,
        toolName: data?.tool_name,
        toolInput: data?.tool_input,
        timestamp: timestamp || Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook pre-tool error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Status update endpoint - for dashboard-status skill
  router.post('/status', (req: Request, res: Response) => {
    try {
      const { instanceId, status, message, progress } = req.body as StatusUpdateEvent;

      console.log(`[HookRoutes] Status update from ${instanceId}: ${status}`);

      // Emit status update event for UI
      deps.emitter.emit('hook:status', {
        instanceId,
        status,
        message,
        progress,
        timestamp: Date.now(),
      });

      // Broadcast to Socket.IO clients
      const io = deps.getIO();
      if (io) {
        io.emit('instance:hookStatus', instanceId, { status, message, progress });
      }

      res.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook status error:', errorMessage);
      res.status(400).json({ success: false, error: errorMessage });
    }
  });

  // Context endpoint - fetch context for an instance (for fetch-context skill)
  router.get('/instance/:id/context', (req: Request, res: Response) => {
    try {
      const instanceId = String(req.params.id);

      const instance = processManager.getInstance(instanceId);
      if (!instance) {
        res.status(404).json({ success: false, error: 'Instance not found' });
        return;
      }

      const project = dataStore.getProjectById(instance.projectId);

      // Get recent conversations for the project
      const recentConversations = dataStore
        .getConversationsByProject(instance.projectId)
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          title: c.title,
          summary: c.initialPrompt.substring(0, 100),
          createdAt: c.createdAt,
        }));

      // Get other active instances for the same project
      const activeInstances = processManager
        .getInstancesByProject(instance.projectId)
        .filter((i) => i.id !== instanceId && i.status === 'running')
        .map((i) => ({
          id: i.id,
          status: i.status,
          createdAt: i.createdAt,
        }));

      res.json({
        success: true,
        data: {
          projectId: instance.projectId,
          projectName: project?.name || 'Unknown',
          projectPath: project?.path,
          recentConversations,
          activeInstances,
          instanceCount: activeInstances.length + 1,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook context error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Get active instances for a project (for collaborative-awareness skill)
  router.get('/instances', (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;

      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId is required' });
        return;
      }

      const instances = processManager.getInstancesByProject(projectId).map((i) => ({
        id: i.id,
        status: i.status,
        startedAt: i.createdAt,
        lastActivity: Date.now(), // TODO: Track actual last activity
      }));

      res.json({ success: true, data: { instances } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook instances error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Activity reporting endpoint (for collaborative-awareness skill)
  router.post('/activity', (req: Request, res: Response) => {
    try {
      const { instanceId, action, files } = req.body as {
        instanceId: string;
        action: string;
        files: string[];
      };

      console.log(`[HookRoutes] Activity from ${instanceId}: ${action} on ${files.length} files`);

      // Store activity (could be extended to track file locks)
      deps.emitter.emit('hook:activity', { instanceId, action, files, timestamp: Date.now() });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook activity error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  // Generic event endpoint (catch-all for unknown hook events)
  router.post('/event', (req: Request, res: Response) => {
    try {
      const { instanceId, eventType, timestamp } = req.body as {
        instanceId: string;
        eventType?: string;
        data?: unknown;
        timestamp?: number;
      };

      console.log(`[HookRoutes] Hook generic event from ${instanceId}: ${eventType || 'unknown'}`);

      const instance = processManager.getInstance(instanceId);
      const projectId = instance?.projectId;

      // Record generic hook event
      const metricsService = getMetricsService();
      metricsService.recordHookEvent({
        instanceId,
        projectId: projectId || 'unknown',
        eventType: eventType || 'unknown',
        timestamp: timestamp || Date.now(),
      });

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[HookRoutes] Hook event error:', message);
      res.status(400).json({ success: false, error: message });
    }
  });

  return router;
}
