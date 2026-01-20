import { Router, Request, Response, NextFunction } from 'express';
import { DataStore } from '../DataStore';
import { validators, IpcValidationError } from '../../ipc/validators';
import type { ApiResponse } from '@shared/types/remote';
import type { AuthenticatedRequest } from './authRoutes';

export interface ProjectRoutesDeps {
  authMiddleware: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
  broadcastStateUpdate: () => void;
}

export function createProjectRoutes(deps: ProjectRoutesDeps): Router {
  const router = Router();
  const dataStore = DataStore.getInstance();

  // Get all projects
  router.get('/', deps.authMiddleware, (_req: Request, res: Response) => {
    const projects = dataStore.getAllProjects();
    const response: ApiResponse = { success: true, data: projects };
    res.json(response);
  });

  // Get project by ID
  router.get('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    const project = dataStore.getProjectById(String(req.params.id));
    if (!project) {
      res.status(404).json({ success: false, error: 'Project not found' });
      return;
    }
    res.json({ success: true, data: project });
  });

  // Create project
  router.post('/', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const projectData = validators.projectCreate(req.body);
      const project = dataStore.createProject(projectData);
      res.json({ success: true, data: project });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = error instanceof IpcValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  // Update project
  router.put('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const projectData = validators.projectUpdate(req.body);
      const project = dataStore.updateProject(projectData);
      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }
      res.json({ success: true, data: project });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = error instanceof IpcValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  // Delete project
  router.delete('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      dataStore.deleteProject(String(req.params.id));
      res.json({ success: true });
      deps.broadcastStateUpdate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  });

  return router;
}
