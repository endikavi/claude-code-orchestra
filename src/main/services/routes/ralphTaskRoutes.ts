import { Router, Request, Response, NextFunction } from 'express';
import { getRalphTaskManager } from '../RalphTaskManager';
import { getRalphTaskLoop } from '../RalphTaskLoop';
import type { ApiResponse } from '@shared/types/remote';
import type { AuthenticatedRequest } from './authRoutes';
import type {
  CreateRalphTaskInput,
  UpdateRalphTaskInput,
  RalphTaskStatus,
} from '@shared/types/ralphTasks';

export interface RalphTaskRoutesDeps {
  authMiddleware: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
  broadcastStateUpdate: () => void;
}

export function createRalphTaskRoutes(deps: RalphTaskRoutesDeps): Router {
  const router = Router();
  const taskManager = getRalphTaskManager();
  const taskLoop = getRalphTaskLoop();

  // Get all Ralph tasks for a project
  router.get('/', deps.authMiddleware, (req: Request, res: Response) => {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      res.status(400).json({ success: false, error: 'projectId query parameter is required' });
      return;
    }
    const tasks = taskManager.getTasksByProject(projectId);
    const response: ApiResponse = { success: true, data: tasks };
    res.json(response);
  });

  // Get a specific Ralph task by ID
  router.get('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    const task = taskManager.getTaskById(String(req.params.id));
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' });
      return;
    }
    res.json({ success: true, data: task });
  });

  // Create a new Ralph task
  router.post('/', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const input: CreateRalphTaskInput = {
        projectId: req.body.projectId,
        name: req.body.name,
        description: req.body.description,
        status: req.body.status,
      };

      if (!input.projectId || !input.name) {
        res.status(400).json({ success: false, error: 'projectId and name are required' });
        return;
      }

      const task = taskManager.createTask(input);
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Update a Ralph task
  router.patch('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const updates: UpdateRalphTaskInput = {};

      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.status !== undefined) updates.status = req.body.status as RalphTaskStatus;
      if (req.body.orderIndex !== undefined) updates.orderIndex = req.body.orderIndex;
      if (req.body.isPaused !== undefined) updates.isPaused = req.body.isPaused;

      const task = taskManager.updateTask(String(req.params.id), updates);
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Delete a Ralph task
  router.delete('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const success = taskManager.deleteTask(String(req.params.id));
      if (!success) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Start a Ralph task (move to "doing" and begin loop)
  router.post('/:id/start', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      // isInteractive: true = show terminal UI, false = run in background
      const isInteractive = req.body.isInteractive !== false; // Default to true
      const task = taskLoop.startTask(String(req.params.id), isInteractive);
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Stop a Ralph task loop
  router.post('/:id/stop', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const task = taskLoop.stopTask(String(req.params.id));
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Complete a Ralph task (called by CLI) - NO AUTH REQUIRED for CLI access
  router.post('/:id/complete', (req: Request, res: Response) => {
    const taskId = String(req.params.id);
    console.log(`[ralphTaskRoutes] Ralph task complete request (via router): id=${taskId}`);
    try {
      const summary = String(req.body?.summary || 'Task completed');
      const task = taskLoop.completeTask(taskId, summary);
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Request help for a Ralph task (called by CLI) - NO AUTH REQUIRED for CLI access
  router.post('/:id/help', (req: Request, res: Response) => {
    const taskId = String(req.params.id);
    console.log(
      `[ralphTaskRoutes] Ralph task help request: id=${taskId}, reason="${req.body.reason}"`
    );
    try {
      const reason = req.body.reason || 'Help requested';
      const task = taskLoop.requestHelp(String(req.params.id), reason);
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Respond to a help request and resume the task
  router.post('/:id/respond', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const response = req.body.response;
      if (!response) {
        res.status(400).json({ success: false, error: 'response is required' });
        return;
      }
      const task = taskLoop.respondToHelp(String(req.params.id), response);
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found or not paused' });
        return;
      }
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Process all pending tasks for a project
  router.post('/process-all', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const projectId = req.body.projectId;
      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId is required' });
        return;
      }
      taskLoop.processAll(projectId);
      res.json({ success: true, message: 'Processing started' });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Stop processing all tasks for a project
  router.post('/stop-all', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const projectId = req.body.projectId;
      if (!projectId) {
        res.status(400).json({ success: false, error: 'projectId is required' });
        return;
      }
      taskLoop.stopProcessAll(projectId);
      res.json({ success: true, message: 'Processing stopped' });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Reorder tasks (for drag-and-drop)
  router.post('/reorder', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const { projectId, tasks } = req.body;
      if (!projectId || !tasks || !Array.isArray(tasks)) {
        res.status(400).json({ success: false, error: 'projectId and tasks array are required' });
        return;
      }
      const reorderedTasks = taskManager.reorderTasks({ projectId, tasks });
      res.json({ success: true, data: reorderedTasks });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Move a task to a new status
  router.post('/:id/move', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const { newStatus, newOrderIndex } = req.body;
      if (!newStatus) {
        res.status(400).json({ success: false, error: 'newStatus is required' });
        return;
      }
      const task = taskManager.moveTask({
        id: String(req.params.id),
        newStatus: newStatus as RalphTaskStatus,
        newOrderIndex,
      });
      if (!task) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true, data: task });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
