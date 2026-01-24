/**
 * Context Routes
 *
 * HTTP endpoints for shared context between Claude instances.
 * Allows instances to publish their context and query others.
 */

import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { Server as SocketIOServer } from 'socket.io';
import { SharedContextStore } from '../SharedContextStore';
import { getProcessManager } from '../ProcessManager';
import type { ServerToClientEvents, ClientToServerEvents } from '@shared/types/remote';
import type {
  PublishContextRequest,
  ContributeKnowledgeRequest,
} from '@shared/types/sharedContext';

export interface ContextRoutesDeps {
  emitter: EventEmitter;
  getIO: () => SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null;
  sendToRenderer: (channel: string, ...args: unknown[]) => void;
}

export function createContextRoutes(deps: ContextRoutesDeps): Router {
  const router = Router();
  const contextStore = SharedContextStore.getInstance();
  const processManager = getProcessManager();

  /**
   * POST /context/publish
   * Publish context for the calling instance
   */
  router.post('/publish', (req: Request, res: Response) => {
    try {
      const instanceId = req.headers['x-instance-id'] as string;
      if (!instanceId) {
        res.status(400).json({ success: false, error: 'X-Instance-Id header is required' });
        return;
      }

      // Get project ID from instance
      const instance = processManager.getInstance(instanceId);
      if (!instance) {
        res.status(404).json({ success: false, error: 'Instance not found' });
        return;
      }

      const request = req.body as PublishContextRequest;
      const context = contextStore.setInstanceContext(instanceId, instance.projectId, request);

      console.log(
        `[ContextRoutes] Context published by ${instanceId}: ${request.workStatus || 'update'}`
      );

      // Notify renderer and Socket.IO clients
      deps.sendToRenderer('context:instanceUpdated', instance.projectId, context);
      const io = deps.getIO();
      if (io) {
        io.emit('context:instanceUpdated', { projectId: instance.projectId, context });
      }

      res.json({ success: true, data: context });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Publish error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /context/instances
   * Get all instance contexts for a project
   */
  router.get('/instances', (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId query parameter is required' });
        return;
      }

      const contexts = contextStore.getAllInstanceContexts(projectId);

      res.json({ success: true, data: { instances: contexts } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Get instances error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /context/instance/:instanceId
   * Get context for a specific instance
   */
  router.get('/instance/:instanceId', (req: Request, res: Response) => {
    try {
      const instanceId = String(req.params.instanceId);
      const context = contextStore.getInstanceContext(instanceId);

      if (!context) {
        res.status(404).json({ success: false, error: 'Instance context not found' });
        return;
      }

      res.json({ success: true, data: context });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Get instance error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * POST /context/project/contribute
   * Contribute knowledge to the project
   */
  router.post('/project/contribute', (req: Request, res: Response) => {
    try {
      const instanceId = req.headers['x-instance-id'] as string;
      if (!instanceId) {
        res.status(400).json({ success: false, error: 'X-Instance-Id header is required' });
        return;
      }

      // Get project ID from instance
      const instance = processManager.getInstance(instanceId);
      if (!instance) {
        res.status(404).json({ success: false, error: 'Instance not found' });
        return;
      }

      const request = req.body as ContributeKnowledgeRequest;
      const knowledge = contextStore.contributeKnowledge(instance.projectId, instanceId, request);

      console.log(`[ContextRoutes] Knowledge contributed by ${instanceId}`);

      // Notify renderer and Socket.IO clients
      deps.sendToRenderer('context:knowledgeUpdated', instance.projectId, knowledge);
      const io = deps.getIO();
      if (io) {
        io.emit('context:knowledgeUpdated', { projectId: instance.projectId, knowledge });
      }

      res.json({ success: true, data: knowledge });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Contribute error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /context/project
   * Get project knowledge
   */
  router.get('/project', (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId query parameter is required' });
        return;
      }

      const knowledge = contextStore.getProjectKnowledge(projectId);

      res.json({ success: true, data: knowledge });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Get project error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /context/summary
   * Get complete context summary for a project
   */
  router.get('/summary', (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId query parameter is required' });
        return;
      }

      const summary = contextStore.getContextSummary(projectId);

      res.json({ success: true, data: summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Get summary error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /context/stats
   * Get context store statistics
   */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const stats = contextStore.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Get stats error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /context/instance/:instanceId
   * Clear context for an instance (usually called when instance terminates)
   */
  router.delete('/instance/:instanceId', (req: Request, res: Response) => {
    try {
      const instanceId = String(req.params.instanceId);
      contextStore.clearInstanceContext(instanceId);

      console.log(`[ContextRoutes] Context cleared for ${instanceId}`);

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Delete instance error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /context/project/:projectId
   * Clear project knowledge
   */
  router.delete('/project/:projectId', (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      contextStore.clearProjectKnowledge(projectId);

      console.log(`[ContextRoutes] Project knowledge cleared for ${projectId}`);

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ContextRoutes] Delete project error:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Listen for context updates and emit to clients
  contextStore.on('contextUpdated', (event) => {
    deps.sendToRenderer('context:updated', event);
    const io = deps.getIO();
    if (io) {
      io.emit('context:updated', event);
    }
  });

  return router;
}
