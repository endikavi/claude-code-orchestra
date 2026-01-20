import { Router, Request, Response, NextFunction } from 'express';
import { DataStore } from '../DataStore';
import { validators, IpcValidationError } from '../../ipc/validators';
import type { AuthenticatedRequest } from './authRoutes';

export interface ConversationRoutesDeps {
  authMiddleware: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
}

export function createConversationRoutes(deps: ConversationRoutesDeps): Router {
  const router = Router();
  const dataStore = DataStore.getInstance();

  // Get conversations by project
  router.get('/', deps.authMiddleware, (req: Request, res: Response) => {
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
      res.status(400).json({ success: false, error: 'projectId is required' });
      return;
    }
    const conversations = dataStore.getConversationsByProject(projectId);
    res.json({ success: true, data: conversations });
  });

  // Get conversation by ID
  router.get('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    const conversation = dataStore.getConversationById(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    res.json({ success: true, data: conversation });
  });

  // Get messages for a conversation
  router.get('/:id/messages', deps.authMiddleware, (req: Request, res: Response) => {
    const messages = dataStore.getMessagesByConversation(String(req.params.id));
    res.json({ success: true, data: messages });
  });

  // Create conversation
  router.post('/', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const conversationData = validators.conversationCreate(req.body);
      const conversation = dataStore.createConversation(conversationData);
      res.json({ success: true, data: conversation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = error instanceof IpcValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  // Update conversation
  router.put('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const validated = validators.conversationUpdate(String(req.params.id), req.body);
      const conversation = dataStore.updateConversation(validated.id, validated.updates);
      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }
      res.json({ success: true, data: conversation });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = error instanceof IpcValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  // Delete conversation
  router.delete('/:id', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      dataStore.deleteConversation(String(req.params.id));
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ success: false, error: message });
    }
  });

  // Add message to conversation
  router.post('/:id/messages', deps.authMiddleware, (req: Request, res: Response) => {
    try {
      const validated = validators.conversationAddMessage({
        conversationId: String(req.params.id),
        ...req.body,
      });
      const message = dataStore.addMessage(validated);
      res.json({ success: true, data: message });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const status = error instanceof IpcValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: errorMsg });
    }
  });

  return router;
}
