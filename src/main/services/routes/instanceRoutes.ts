import { Router, Request, Response, NextFunction } from 'express';
import { DataStore } from '../DataStore';
import { getProcessManager } from '../ProcessManager';
import { getClusterManager } from '../ClusterManager';
import { getSubagentTracker } from '../SubagentTracker';
import { validators } from '../../ipc/validators';
import type { ClaudeModel, InstanceMode } from '@shared/types';
import type { AuthenticatedRequest } from './authRoutes';

export interface InstanceRoutesDeps {
  authMiddleware: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
  broadcastStateUpdate: () => void;
}

export function createInstanceRoutes(deps: InstanceRoutesDeps): Router {
  const router = Router();
  const dataStore = DataStore.getInstance();
  const processManager = getProcessManager();

  // Get all instances (with optional projectId filter)
  router.get('/', deps.authMiddleware, (req: Request, res: Response) => {
    const projectId = req.query.projectId as string | undefined;
    const includeOutputs = req.query.includeOutputs === 'true';

    // Filter by projectId if provided
    const instances = projectId
      ? processManager.getInstancesByProject(projectId)
      : processManager.getAllInstances();

    if (includeOutputs) {
      const allOutputs = processManager.getAllInstanceOutputs();
      const allConversations = processManager.getAllInstanceConversations();
      // Filter outputs and conversations to only include those for returned instances
      const outputs: Record<string, unknown> = {};
      const instanceConversations: Record<string, string> = {};
      instances.forEach((inst) => {
        if (allOutputs[inst.id]) {
          outputs[inst.id] = allOutputs[inst.id];
        }
        if (allConversations[inst.id]) {
          instanceConversations[inst.id] = allConversations[inst.id];
        }
      });
      res.json({ success: true, data: instances, outputs, instanceConversations });
    } else {
      res.json({ success: true, data: instances });
    }
  });

  // Get instance by ID
  router.get('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    const instance = processManager.getInstance(String(req.params.id));
    if (!instance) {
      res.status(404).json({ success: false, error: 'Instance not found' });
      return;
    }
    res.json({ success: true, data: instance });
  });

  // Create instance
  router.post('/', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const { prompt, ...instanceConfig } = req.body as {
        projectId: string;
        model: ClaudeModel;
        mode: InstanceMode;
        planMode?: boolean;
        prompt?: string;
      };

      // Validate instance configuration
      const validatedConfig = validators.instanceCreate(instanceConfig);

      // Check if this is a local project
      const localProject = dataStore.getProjectById(validatedConfig.projectId);

      if (!localProject) {
        // Project not found locally - check if it's a cluster project
        const cluster = getClusterManager();
        const clusterConfig = cluster.getConfig();
        if (clusterConfig.enabled) {
          const globalProjects = cluster.getAllGlobalProjects();
          const remoteProject = globalProjects.find((p) => p.id === validatedConfig.projectId);

          if (remoteProject && !remoteProject.isLocal) {
            // Create instance on the remote node
            const remoteInstance = cluster.createInstance({
              nodeId: remoteProject.nodeId,
              projectId: validatedConfig.projectId,
              model: validatedConfig.model,
              mode: validatedConfig.mode,
              planMode: validatedConfig.planMode,
            });

            res.json({
              success: true,
              data: remoteInstance || {
                id: 'pending',
                status: 'starting',
                projectId: validatedConfig.projectId,
              },
            });
            return;
          }
        }
        throw new Error(`Project with id ${validatedConfig.projectId} not found`);
      }

      // Local project - create instance locally
      const instance = processManager.createInstance(validatedConfig);

      // Create a conversation automatically for web clients
      const conversation = dataStore.createConversation({
        projectId: validatedConfig.projectId,
        title: prompt
          ? prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '')
          : `Session ${new Date().toLocaleString()}`,
        initialPrompt: prompt || '',
        model: validatedConfig.model,
        mode: validatedConfig.mode,
      });

      // Store the mapping in ProcessManager for later use
      processManager.setInstanceConversation(instance.id, conversation.id);

      res.json({
        success: true,
        data: instance,
        conversationId: conversation.id,
      });

      // Broadcast to all connected clients
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  });

  // Delete/kill instance
  router.delete('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    const instanceId = String(req.params.id);

    // Check if this is a remote instance
    const cluster = getClusterManager();
    const clusterConfig = cluster.getConfig();
    if (clusterConfig.enabled) {
      const globalInstances = cluster.getAllGlobalInstances();
      const remoteInstance = globalInstances.find((i) => i.id === instanceId && !i.isLocal);
      if (remoteInstance) {
        cluster.killInstance(instanceId, remoteInstance.nodeId);
        res.json({ success: true });
        return;
      }
    }

    // Local instance
    processManager.killInstance(instanceId);
    res.json({ success: true });
    deps.broadcastStateUpdate();
  });

  // Send input to instance
  router.post('/:id/input', deps.authMiddleware, (req: Request, res: Response) => {
    const instanceId = String(req.params.id);
    const { input } = req.body as { input: string };

    // Check if this is a remote instance
    const cluster = getClusterManager();
    const clusterConfig = cluster.getConfig();
    if (clusterConfig.enabled) {
      const globalInstances = cluster.getAllGlobalInstances();
      const remoteInstance = globalInstances.find((i) => i.id === instanceId && !i.isLocal);
      if (remoteInstance) {
        cluster.sendInput(instanceId, remoteInstance.nodeId, input);
        res.json({ success: true });
        return;
      }
    }

    // Local instance
    processManager.sendInput(instanceId, input);
    res.json({ success: true });
  });

  // Resume instance
  router.post('/resume', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const { projectId, sessionId, model, mode } = req.body as {
        projectId: string;
        sessionId: string;
        model: ClaudeModel;
        mode: InstanceMode;
      };

      const instance = processManager.resumeInstance({ projectId, sessionId, model, mode });
      res.json({ success: true, data: instance });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  });

  // Get subagents for a specific instance
  router.get('/:id/subagents', deps.authMiddleware, (req: Request, res: Response) => {
    const instanceId = String(req.params.id);
    const tracker = getSubagentTracker();
    const subagents = tracker.getSubagents(instanceId);
    res.json({ success: true, data: subagents });
  });

  return router;
}
