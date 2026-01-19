import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { join } from 'path';
import { networkInterfaces } from 'os';
import { app as electronApp } from 'electron';
import { EventEmitter } from 'events';

import { getAuthService } from './AuthService';
import { DataStore } from './DataStore';
import { getProcessManager } from './ProcessManager';
import { getClusterManager } from './ClusterManager';
import { getAuditLogger } from './AuditLogger';
import { getFileLockManager } from './FileLockManager';
import { validators, IpcValidationError } from '../ipc/validators';
import type {
  RemoteServerStatus,
  LoginRequest,
  LoginResponse,
  ApiResponse,
  ServerToClientEvents,
  ClientToServerEvents,
  SyncState,
  TokenPayload,
  RemoteSession,
} from '@shared/types/remote';
import { DEFAULT_REMOTE_PORT } from '@shared/types/remote';
import type {
  ClaudeModel,
  InstanceMode,
  StreamMessage,
  InstanceStatus,
  ToolUseEvent,
  StopEvent,
  StatusUpdateEvent,
  HookNotificationInput,
  PermissionCheckRequest,
  PermissionCheckResponse,
} from '@shared/types';
import { getNotificationManager } from './NotificationManager';
import { getPermissionManager } from './PermissionManager';
import { getMetricsService } from './MetricsService';

// Extend Express Request to include session info
interface AuthenticatedRequest extends Request {
  session?: RemoteSession;
  tokenPayload?: TokenPayload;
}

export class WebServer extends EventEmitter {
  private static instance: WebServer | null = null;

  private app: express.Application;
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;
  private isRunning = false;
  private currentPort: number = DEFAULT_REMOTE_PORT;
  private authenticatedSockets: Map<string, string> = new Map(); // socketId -> sessionId
  private clusterStateHandler: (() => void) | null = null;
  private processManagerHandler: (() => void) | null = null;
  private mainWindow: import('electron').BrowserWindow | null = null;

  private constructor() {
    super();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  public static getInstance(): WebServer {
    if (!WebServer.instance) {
      WebServer.instance = new WebServer();
    }
    return WebServer.instance;
  }

  /**
   * Set the main window for IPC communication
   */
  public setMainWindow(window: import('electron').BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Send event to renderer process via IPC
   */
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  private setupMiddleware(): void {
    // Dynamic CORS configuration - allows localhost, local IP, and optionally any origin
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests without origin (desktop apps, curl, etc.)
          if (!origin) {
            callback(null, true);
            return;
          }

          // Check if allowAnyCors is enabled in config
          const dataStore = DataStore.getInstance();
          const config = dataStore.getRemoteConfig();
          if (config.allowAnyCors) {
            callback(null, true);
            return;
          }

          const localIp = this.getLocalIp();
          const allowedOrigins = [
            'http://localhost:3847',
            'http://127.0.0.1:3847',
            `http://localhost:${this.currentPort}`,
            `http://127.0.0.1:${this.currentPort}`,
          ];

          if (localIp) {
            allowedOrigins.push(`http://${localIp}:${this.currentPort}`);
          }

          // Add custom hostname to allowed origins if configured
          if (config.customHostname) {
            const hostname = config.customHostname;
            // Add both http and https variants
            allowedOrigins.push(`http://${hostname}`);
            allowedOrigins.push(`https://${hostname}`);
            // Add with port (for non-standard ports)
            allowedOrigins.push(`http://${hostname}:${this.currentPort}`);
            allowedOrigins.push(`https://${hostname}:${this.currentPort}`);
          }

          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('CORS not allowed'));
          }
        },
        credentials: true,
      })
    );

    // Security headers middleware
    this.setupSecurityHeaders();

    // JSON body parser
    this.app.use(express.json());

    // Logging middleware
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[WebServer] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup security headers middleware
   */
  private setupSecurityHeaders(): void {
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      next();
    });
  }

  /**
   * Check if an IP matches a rule value (supports exact IP, CIDR, and wildcard patterns)
   */
  private ipMatchesRule(ip: string, ruleValue: string): boolean {
    // Normalize IP (remove ::ffff: prefix for IPv4-mapped IPv6)
    const normalizedIp = ip.replace(/^::ffff:/, '');

    // Exact match
    if (normalizedIp === ruleValue) {
      return true;
    }

    // CIDR notation check (e.g., 192.168.1.0/24)
    if (ruleValue.includes('/')) {
      try {
        const [subnet, maskBits] = ruleValue.split('/');
        const mask = parseInt(maskBits, 10);

        if (mask >= 0 && mask <= 32) {
          const ipParts = normalizedIp.split('.').map(Number);
          const subnetParts = subnet.split('.').map(Number);

          if (ipParts.length === 4 && subnetParts.length === 4) {
            const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
            const subnetNum =
              (subnetParts[0] << 24) |
              (subnetParts[1] << 16) |
              (subnetParts[2] << 8) |
              subnetParts[3];
            const maskNum = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;

            return (ipNum & maskNum) === (subnetNum & maskNum);
          }
        }
      } catch {
        // Invalid CIDR, fall through
      }
    }

    // Wildcard pattern (e.g., 192.168.1.*)
    if (ruleValue.includes('*')) {
      const regex = new RegExp('^' + ruleValue.replace(/\./g, '\\.').replace(/\*/g, '\\d+') + '$');
      return regex.test(normalizedIp);
    }

    return false;
  }

  /**
   * Check if an IP is allowed based on IP access rules
   */
  private isIpAllowed(ip: string): { allowed: boolean; reason?: string } {
    const dataStore = DataStore.getInstance();
    const config = dataStore.getSecurityConfig();

    // If IP access control is disabled, allow all
    if (!config.ipAccess.enabled) {
      return { allowed: true };
    }

    const rules = dataStore.getIpAccessRules();

    if (config.ipAccess.mode === 'allowlist') {
      // In allowlist mode, IP must match at least one allow rule
      if (rules.length === 0) {
        // No rules means no one is allowed
        return { allowed: false, reason: 'No IP addresses in allowlist' };
      }

      for (const rule of rules) {
        if (rule.type === 'allow' && this.ipMatchesRule(ip, rule.value)) {
          return { allowed: true };
        }
      }

      return { allowed: false, reason: 'IP not in allowlist' };
    } else {
      // In denylist mode, IP must not match any deny rule
      for (const rule of rules) {
        if (rule.type === 'deny' && this.ipMatchesRule(ip, rule.value)) {
          return {
            allowed: false,
            reason: `IP matches deny rule: ${rule.description || rule.value}`,
          };
        }
      }

      return { allowed: true };
    }
  }

  /**
   * IP access control middleware
   */
  private ipAccessMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    // Check if IP is locked out due to rate limiting
    const authService = getAuthService();
    if (authService.isIpLocked(ip)) {
      const lockout = authService.getIpLockout(ip);
      const remaining = lockout ? Math.ceil((lockout.expiresAt - Date.now()) / 60000) : 0;
      res.status(403).json({
        success: false,
        error: `IP temporarily blocked. Try again in ${remaining} minutes.`,
      });
      return;
    }

    // Check IP access rules
    const { allowed, reason } = this.isIpAllowed(ip);
    if (!allowed) {
      getAuditLogger().log('failed_login', ip, false, { details: `IP access denied: ${reason}` });
      res.status(403).json({ success: false, error: reason || 'Access denied' });
      return;
    }

    next();
  };

  /**
   * Authentication middleware
   */
  private authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const authService = getAuthService();
    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const session = authService.getSession(payload.sessionId);
    if (!session) {
      res.status(401).json({ success: false, error: 'Session not found' });
      return;
    }

    // Update session activity
    authService.updateSessionActivity(payload.sessionId);

    req.session = session;
    req.tokenPayload = payload;
    next();
  };

  /**
   * Extract file paths from tool input for activity tracking
   */
  private extractFilesFromToolInput(
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

  private setupRoutes(): void {
    const dataStore = DataStore.getInstance();
    const processManager = getProcessManager();
    const authService = getAuthService();

    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ success: true, status: 'ok' });
    });

    // Login endpoint with IP access control
    this.app.post('/api/auth/login', this.ipAccessMiddleware, (req: Request, res: Response) => {
      const { password } = req.body as LoginRequest;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const auditLogger = getAuditLogger();

      // Check rate limit (uses configurable settings from security config)
      if (authService.isRateLimited(ip)) {
        const lockout = authService.getIpLockout(ip);
        const remaining = lockout ? Math.ceil((lockout.expiresAt - Date.now()) / 60000) : 0;

        auditLogger.logFailedLogin(ip, 'Rate limited');

        const response: LoginResponse = {
          success: false,
          error:
            remaining > 0
              ? `Too many attempts. Try again in ${remaining} minutes.`
              : 'Too many attempts. Try again later.',
        };
        res.status(429).json(response);
        return;
      }

      // Get remote config from datastore
      const config = dataStore.getRemoteConfig();
      if (!config || !config.passwordHash) {
        const response: LoginResponse = { success: false, error: 'Remote access not configured' };
        res.status(403).json(response);
        return;
      }

      // Verify password
      if (!authService.verifyPassword(password, config.passwordHash)) {
        // Record failed attempt for rate limiting
        const { shouldLockout, attempts } = authService.recordFailedAttempt(ip);
        const securityConfig = authService.getSecurityConfig();

        auditLogger.logFailedLogin(ip, `Invalid password (attempt ${attempts})`);

        const response: LoginResponse = {
          success: false,
          error: shouldLockout
            ? `Too many failed attempts. IP locked for ${securityConfig.rateLimit.lockoutMinutes} minutes.`
            : 'Invalid password',
        };
        res.status(401).json(response);
        return;
      }

      // Check max concurrent sessions before creating new session
      const sessionCheck = authService.canCreateSession(ip);
      if (!sessionCheck.allowed) {
        auditLogger.logFailedLogin(ip, sessionCheck.reason || 'Max sessions reached');
        const response: LoginResponse = { success: false, error: sessionCheck.reason };
        res.status(403).json(response);
        return;
      }

      // Reset rate limit on successful login
      authService.resetRateLimit(ip);

      // Create session and generate token
      const userAgent = req.headers['user-agent'] || 'unknown';
      const session = authService.createSession(ip, userAgent);
      const token = authService.generateToken(session.id, ip);

      // Log successful login
      auditLogger.logLogin(ip, session.id, userAgent);

      const response: LoginResponse = { success: true, token };
      res.json(response);

      // Emit event for session tracking
      this.emit('session:created', session);
    });

    // Logout endpoint
    this.app.post(
      '/api/auth/logout',
      this.authMiddleware,
      (req: AuthenticatedRequest, res: Response) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';

        if (req.tokenPayload) {
          authService.deleteSession(req.tokenPayload.sessionId);
          this.emit('session:deleted', req.tokenPayload.sessionId);

          // Log logout
          getAuditLogger().logLogout(ip, req.tokenPayload.sessionId);
        }
        res.json({ success: true });
      }
    );

    // Get current user session
    this.app.get(
      '/api/auth/me',
      this.authMiddleware,
      (req: AuthenticatedRequest, res: Response) => {
        res.json({ success: true, data: req.session });
      }
    );

    // ==================== Projects API ====================

    this.app.get('/api/projects', this.authMiddleware, (_req: Request, res: Response) => {
      const projects = dataStore.getAllProjects();
      const response: ApiResponse = { success: true, data: projects };
      res.json(response);
    });

    this.app.get('/api/projects/:id', this.authMiddleware, (req: Request, res: Response) => {
      const project = dataStore.getProjectById(String(req.params.id));
      if (!project) {
        res.status(404).json({ success: false, error: 'Project not found' });
        return;
      }
      res.json({ success: true, data: project });
    });

    this.app.post('/api/projects', this.authMiddleware, (req: Request, res: Response) => {
      try {
        const projectData = validators.projectCreate(req.body);
        const project = dataStore.createProject(projectData);
        res.json({ success: true, data: project });
        this.broadcastStateUpdate();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = error instanceof IpcValidationError ? 400 : 500;
        res.status(status).json({ success: false, error: message });
      }
    });

    this.app.put('/api/projects/:id', this.authMiddleware, (req: Request, res: Response) => {
      try {
        const projectData = validators.projectUpdate(req.body);
        const project = dataStore.updateProject(projectData);
        if (!project) {
          res.status(404).json({ success: false, error: 'Project not found' });
          return;
        }
        res.json({ success: true, data: project });
        this.broadcastStateUpdate();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = error instanceof IpcValidationError ? 400 : 500;
        res.status(status).json({ success: false, error: message });
      }
    });

    this.app.delete('/api/projects/:id', this.authMiddleware, (req: Request, res: Response) => {
      try {
        dataStore.deleteProject(String(req.params.id));
        res.json({ success: true });
        this.broadcastStateUpdate();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ success: false, error: message });
      }
    });

    // ==================== Instances API ====================

    this.app.get('/api/instances', this.authMiddleware, (req: Request, res: Response) => {
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

    this.app.get('/api/instances/:id', this.authMiddleware, (req: Request, res: Response) => {
      const instance = processManager.getInstance(String(req.params.id));
      if (!instance) {
        res.status(404).json({ success: false, error: 'Instance not found' });
        return;
      }
      res.json({ success: true, data: instance });
    });

    this.app.post('/api/instances', this.authMiddleware, (req: Request, res: Response) => {
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
        this.broadcastStateUpdate();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ success: false, error: message });
      }
    });

    this.app.delete('/api/instances/:id', this.authMiddleware, (req: Request, res: Response) => {
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
      this.broadcastStateUpdate();
    });

    this.app.post(
      '/api/instances/:id/input',
      this.authMiddleware,
      (req: Request, res: Response) => {
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
      }
    );

    this.app.post('/api/instances/resume', this.authMiddleware, (req: Request, res: Response) => {
      try {
        const { projectId, sessionId, model, mode } = req.body as {
          projectId: string;
          sessionId: string;
          model: ClaudeModel;
          mode: InstanceMode;
        };

        const instance = processManager.resumeInstance({ projectId, sessionId, model, mode });
        res.json({ success: true, data: instance });
        this.broadcastStateUpdate();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(400).json({ success: false, error: message });
      }
    });

    // ==================== Conversations API ====================

    this.app.get('/api/conversations', this.authMiddleware, (req: Request, res: Response) => {
      const { projectId } = req.query;
      if (!projectId || typeof projectId !== 'string') {
        res.status(400).json({ success: false, error: 'projectId is required' });
        return;
      }
      const conversations = dataStore.getConversationsByProject(projectId);
      res.json({ success: true, data: conversations });
    });

    this.app.get('/api/conversations/:id', this.authMiddleware, (req: Request, res: Response) => {
      const conversation = dataStore.getConversationById(String(req.params.id));
      if (!conversation) {
        res.status(404).json({ success: false, error: 'Conversation not found' });
        return;
      }
      res.json({ success: true, data: conversation });
    });

    this.app.get(
      '/api/conversations/:id/messages',
      this.authMiddleware,
      (req: Request, res: Response) => {
        const messages = dataStore.getMessagesByConversation(String(req.params.id));
        res.json({ success: true, data: messages });
      }
    );

    this.app.post('/api/conversations', this.authMiddleware, (req: Request, res: Response) => {
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

    this.app.put('/api/conversations/:id', this.authMiddleware, (req: Request, res: Response) => {
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

    this.app.delete(
      '/api/conversations/:id',
      this.authMiddleware,
      (req: Request, res: Response) => {
        try {
          dataStore.deleteConversation(String(req.params.id));
          res.json({ success: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          res.status(400).json({ success: false, error: message });
        }
      }
    );

    this.app.post(
      '/api/conversations/:id/messages',
      this.authMiddleware,
      (req: Request, res: Response) => {
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
      }
    );

    // ==================== Sync endpoint ====================

    this.app.get('/api/sync', this.authMiddleware, (_req: Request, res: Response) => {
      const state = this.getSyncState();
      res.json({ success: true, data: state });
    });

    // ==================== Hooks API ====================
    // These endpoints receive events from Claude CLI hooks
    // They do NOT require auth because they come from local hook scripts

    // Notification endpoint - receives notifications from Claude CLI
    this.app.post('/api/hooks/notify', (req: Request, res: Response) => {
      try {
        const { instanceId, eventType, data, timestamp } = req.body as {
          instanceId: string;
          eventType: string;
          data: HookNotificationInput;
          timestamp: number;
        };

        console.log(`[WebServer] Hook notification from ${instanceId}: ${eventType}`);

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
        console.error('[WebServer] Hook notify error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Post-tool endpoint - receives tool use events after execution
    this.app.post('/api/hooks/post-tool', (req: Request, res: Response) => {
      try {
        const { instanceId, eventType, data, timestamp } = req.body as {
          instanceId: string;
          eventType: string;
          data?: {
            tool_name?: string;
            tool_input?: Record<string, unknown>;
            success?: boolean;
            duration_ms?: number;
          } | null;
          timestamp: number;
        };

        console.log(
          `[WebServer] Hook post-tool from ${instanceId}: ${data?.tool_name || 'unknown'}`
        );

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
        const files = this.extractFilesFromToolInput(toolName, data?.tool_input);

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
          if (
            typeof command === 'string' &&
            /\b(rm|mv|cp|mkdir|touch|chmod|chown)\b/.test(command)
          ) {
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
        this.emit('hook:toolUse', toolEvent);

        // Send activity update to renderer via IPC
        const activityData = {
          instanceId,
          toolName,
          files,
          timestamp: timestamp || Date.now(),
        };
        this.sendToRenderer('hook:activity', activityData);

        // Also broadcast to Socket.IO clients
        if (this.io) {
          this.io.emit('hook:activity', activityData);
        }

        res.json({ success: true, conflicts: conflictFiles });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] Hook post-tool error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // File lock query endpoint - check if a file has conflicts
    this.app.get('/api/hooks/file-lock', (req: Request, res: Response) => {
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
        console.error('[WebServer] File lock query error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // File lock stats endpoint - get overall lock statistics
    this.app.get('/api/hooks/file-lock/stats', (_req: Request, res: Response) => {
      try {
        const fileLockManager = getFileLockManager();
        const stats = fileLockManager.getStats();

        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] File lock stats error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Get active files for an instance
    this.app.get('/api/hooks/file-lock/instance/:instanceId', (req: Request, res: Response) => {
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
        console.error('[WebServer] Instance files query error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Pre-tool permission check endpoint
    this.app.post('/api/hooks/permission/check', (req: Request, res: Response) => {
      try {
        const { instanceId, toolName, toolInput, timestamp } = req.body as PermissionCheckRequest;

        console.log(`[WebServer] Permission check from ${instanceId}: ${toolName}`);

        const instance = processManager.getInstance(instanceId);
        const projectId = instance?.projectId || 'unknown';

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
        console.error('[WebServer] Hook permission check error:', message);
        // On error, return 'ask' to let Claude handle normally
        res.json({
          decision: 'ask',
          reason: 'Dashboard error: ' + message,
        } as PermissionCheckResponse);
      }
    });

    // Stop/stopped endpoint - instance stopped
    this.app.post('/api/hooks/stopped', (req: Request, res: Response) => {
      try {
        const { instanceId, eventType, data, timestamp } = req.body as {
          instanceId: string;
          eventType: string;
          data?: { reason?: string; total_cost_usd?: number; duration_ms?: number } | null;
          timestamp: number;
        };

        console.log(`[WebServer] Hook stopped from ${instanceId}`);

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

        this.emit('hook:stopped', stopEvent);

        res.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] Hook stopped error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Session start endpoint
    this.app.post('/api/hooks/session-start', (req: Request, res: Response) => {
      try {
        const { instanceId, data, timestamp } = req.body as {
          instanceId: string;
          data?: { session_id?: string } | null;
          timestamp: number;
        };

        console.log(`[WebServer] Hook session-start from ${instanceId}`);

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
        console.error('[WebServer] Hook session-start error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Session end endpoint
    this.app.post('/api/hooks/session-end', (req: Request, res: Response) => {
      try {
        const { instanceId, data, timestamp } = req.body as {
          instanceId: string;
          data?: { session_id?: string; total_cost_usd?: number } | null;
          timestamp: number;
        };

        console.log(`[WebServer] Hook session-end from ${instanceId}`);

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
        console.error('[WebServer] Hook session-end error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // User prompt submit endpoint
    this.app.post('/api/hooks/prompt-submit', (req: Request, res: Response) => {
      try {
        const { instanceId, data, timestamp } = req.body as {
          instanceId: string;
          data?: { prompt?: string; session_id?: string } | null;
          timestamp: number;
        };

        console.log(`[WebServer] Hook prompt-submit from ${instanceId}`);

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
        this.emit('hook:promptSubmit', {
          instanceId,
          projectId,
          prompt: data?.prompt,
          timestamp: timestamp || Date.now(),
        });

        res.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] Hook prompt-submit error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Pre-tool endpoint (generic tracking, separate from permission check)
    this.app.post('/api/hooks/pre-tool', (req: Request, res: Response) => {
      try {
        const { instanceId, data, timestamp } = req.body as {
          instanceId: string;
          data?: { tool_name?: string; tool_input?: Record<string, unknown> } | null;
          timestamp: number;
        };

        console.log(
          `[WebServer] Hook pre-tool from ${instanceId}: ${data?.tool_name || 'unknown'}`
        );

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

        // Emit event for real-time tracking
        this.emit('hook:preTool', {
          instanceId,
          projectId,
          toolName: data?.tool_name,
          toolInput: data?.tool_input,
          timestamp: timestamp || Date.now(),
        });

        res.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] Hook pre-tool error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Status update endpoint - for dashboard-status skill
    this.app.post('/api/hooks/status', (req: Request, res: Response) => {
      try {
        const { instanceId, status, message, progress } = req.body as StatusUpdateEvent;

        console.log(`[WebServer] Status update from ${instanceId}: ${status}`);

        const instance = processManager.getInstance(instanceId);

        // Emit status update event for UI
        this.emit('hook:status', { instanceId, status, message, progress, timestamp: Date.now() });

        // Broadcast to Socket.IO clients
        if (this.io) {
          this.io.emit('instance:hookStatus', instanceId, { status, message, progress });
        }

        res.json({ success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] Hook status error:', errorMessage);
        res.status(400).json({ success: false, error: errorMessage });
      }
    });

    // Context endpoint - fetch context for an instance (for fetch-context skill)
    this.app.get('/api/hooks/instance/:id/context', (req: Request, res: Response) => {
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
        console.error('[WebServer] Hook context error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Get active instances for a project (for collaborative-awareness skill)
    this.app.get('/api/hooks/instances', (req: Request, res: Response) => {
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
        console.error('[WebServer] Hook instances error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Activity reporting endpoint (for collaborative-awareness skill)
    this.app.post('/api/hooks/activity', (req: Request, res: Response) => {
      try {
        const { instanceId, action, files } = req.body as {
          instanceId: string;
          action: string;
          files: string[];
        };

        console.log(`[WebServer] Activity from ${instanceId}: ${action} on ${files.length} files`);

        // Store activity (could be extended to track file locks)
        this.emit('hook:activity', { instanceId, action, files, timestamp: Date.now() });

        res.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] Hook activity error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // File lock check endpoint (for collaborative-awareness skill)
    this.app.get('/api/hooks/file-lock', (req: Request, res: Response) => {
      try {
        // This is a placeholder - could be extended to actually track file locks
        // For now, just return that no files are locked
        res.json({ success: true, data: { locked: false } });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WebServer] Hook file-lock error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // Generic event endpoint (catch-all for unknown hook events)
    this.app.post('/api/hooks/event', (req: Request, res: Response) => {
      try {
        const { instanceId, eventType, data, timestamp } = req.body as {
          instanceId: string;
          eventType?: string;
          data?: unknown;
          timestamp?: number;
        };

        console.log(`[WebServer] Hook generic event from ${instanceId}: ${eventType || 'unknown'}`);

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
        console.error('[WebServer] Hook event error:', message);
        res.status(400).json({ success: false, error: message });
      }
    });

    // ==================== Static files (web UI) ====================

    // Serve static files from web build directory
    // In dev: __dirname is dist/main, so go up 2 levels to dist, then into web
    // In production: files are in resources/web
    const isDev = process.env.NODE_ENV === 'development' || !electronApp.isPackaged;
    const webBuildPath = isDev ? join(__dirname, '../web') : join(process.resourcesPath, 'web');

    this.app.use(express.static(webBuildPath));

    // SPA fallback - serve index.html for all non-API routes
    // Express 5 requires named wildcard parameters
    this.app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(join(webBuildPath, 'index.html'));
    });
  }

  /**
   * Setup Socket.IO server and events
   */
  private setupSocketIO(): void {
    if (!this.httpServer) return;

    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(this.httpServer, {
      cors: {
        origin: true,
        credentials: true,
      },
    });

    // Authentication middleware for Socket.IO
    this.io.use((socket, next) => {
      const authToken = socket.handshake.auth as { token?: string };
      const token: string | undefined =
        authToken.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        next(new Error('Authentication required'));
        return;
      }

      const authService = getAuthService();
      const payload = authService.verifyToken(token);

      if (!payload) {
        next(new Error('Invalid or expired token'));
        return;
      }

      const session = authService.getSession(payload.sessionId);
      if (!session) {
        next(new Error('Session not found'));
        return;
      }

      // Store session info on socket
      (socket as Socket & { sessionId?: string }).sessionId = payload.sessionId;
      this.authenticatedSockets.set(socket.id, payload.sessionId);

      next();
    });

    this.io.on('connection', (socket) => {
      console.log(`[WebServer] Socket connected: ${socket.id}`);

      // Send initial state after a tick to ensure client listeners are ready
      process.nextTick(() => {
        const state = this.getSyncState();
        socket.emit('sync:state', state);
      });

      // Handle instance input with validation
      socket.on('instance:input', (instanceId, input) => {
        // Validate input parameters
        if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
          return;
        }
        if (typeof input !== 'string' || input.length > 1000000) {
          return;
        }
        const processManager = getProcessManager();
        processManager.sendInput(instanceId, input);
      });

      // Handle instance resize with validation
      socket.on('instance:resize', (instanceId, cols, rows) => {
        // Validate resize parameters
        if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
          return;
        }
        if (typeof cols !== 'number' || typeof rows !== 'number') {
          return;
        }
        if (cols < 1 || cols > 1000 || rows < 1 || rows > 1000) {
          return;
        }
        const processManager = getProcessManager();
        processManager.resizeInstance(instanceId, cols, rows);
      });

      // Handle instance subscription (for focused real-time updates)
      socket.on('subscribe:instance', (instanceId) => {
        if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
          return;
        }
        void socket.join(`instance:${instanceId}`);
      });

      socket.on('unsubscribe:instance', (instanceId) => {
        if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
          return;
        }
        void socket.leave(`instance:${instanceId}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`[WebServer] Socket disconnected: ${socket.id}`);
        this.authenticatedSockets.delete(socket.id);
      });
    });
  }

  /**
   * Broadcast instance output to web clients
   */
  public broadcastInstanceOutput(instanceId: string, data: StreamMessage): void {
    if (this.io) {
      this.io.to(`instance:${instanceId}`).emit('instance:output', instanceId, data);
    }
  }

  /**
   * Broadcast instance status to web clients
   */
  public broadcastInstanceStatus(instanceId: string, status: InstanceStatus): void {
    if (this.io) {
      this.io.emit('instance:status', instanceId, status);
    }
  }

  /**
   * Broadcast instance error to web clients
   */
  public broadcastInstanceError(instanceId: string, error: string): void {
    if (this.io) {
      this.io.to(`instance:${instanceId}`).emit('instance:error', instanceId, error);
    }
  }

  /**
   * Broadcast instance exit to web clients
   */
  public broadcastInstanceExit(instanceId: string, code: number): void {
    if (this.io) {
      this.io.emit('instance:exit', instanceId, code);
    }
  }

  /**
   * Broadcast instance raw output to web clients
   */
  public broadcastInstanceRawOutput(instanceId: string, data: string): void {
    if (this.io) {
      this.io.to(`instance:${instanceId}`).emit('instance:rawOutput', instanceId, data);
    }
  }

  /**
   * Broadcast instance session ID to web clients
   */
  public broadcastInstanceSessionId(instanceId: string, sessionId: string): void {
    if (this.io) {
      this.io.emit('instance:sessionId', instanceId, sessionId);
    }
  }

  /**
   * Broadcast instance terminal title to web clients
   */
  public broadcastInstanceTerminalTitle(instanceId: string, title: string): void {
    if (this.io) {
      this.io.emit('instance:terminalTitle', instanceId, title);
    }
  }

  /**
   * Broadcast full state update to all clients
   */
  public broadcastStateUpdate(): void {
    if (this.io) {
      const state = this.getSyncState();
      this.io.emit('sync:state', state);
    }
  }

  /**
   * Get current sync state
   */
  private getSyncState(): SyncState {
    const dataStore = DataStore.getInstance();
    const processManager = getProcessManager();
    const clusterManager = getClusterManager();

    // Get local projects and instances
    const localProjects = dataStore.getAllProjects();
    const localInstances = processManager.getAllInstances();

    // Get active conversations (those linked to running instances)
    const activeConversations = this.getActiveConversations(
      processManager.getAllInstanceConversations(),
      dataStore
    );

    // Check if cluster is enabled and get global projects/instances
    const clusterConfig = clusterManager.getConfig();
    if (clusterConfig.enabled) {
      const globalProjects = clusterManager.getAllGlobalProjects();
      const globalInstances = clusterManager.getAllGlobalInstances();

      // Use global projects/instances directly - they already include all nodes with proper metadata
      return {
        projects: globalProjects,
        instances: globalInstances,
        conversations: activeConversations,
        outputs: processManager.getAllInstanceOutputs(),
        instanceConversations: processManager.getAllInstanceConversations(),
      };
    }

    return {
      projects: localProjects,
      instances: localInstances,
      conversations: activeConversations,
      outputs: processManager.getAllInstanceOutputs(), // Include output buffers for late-connecting clients
      instanceConversations: processManager.getAllInstanceConversations(), // Include instance-conversation mappings
    };
  }

  /**
   * Get active conversations linked to running instances
   */
  private getActiveConversations(
    instanceConversations: Record<string, string>,
    dataStore: DataStore
  ): import('@shared/types').Conversation[] {
    const conversations: import('@shared/types').Conversation[] = [];
    const seen = new Set<string>();

    for (const conversationId of Object.values(instanceConversations)) {
      if (seen.has(conversationId)) continue;
      seen.add(conversationId);

      try {
        const conversation = dataStore.getConversationById(conversationId);
        if (conversation) {
          conversations.push(conversation);
        }
      } catch (error) {
        console.error(`[WebServer] Failed to get conversation ${conversationId}:`, error);
      }
    }

    return conversations;
  }

  /**
   * Get local IP address
   */
  public getLocalIp(): string | null {
    const interfaces = networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      const addresses = interfaces[name];
      if (!addresses) continue;

      for (const addr of addresses) {
        // Skip internal (loopback) and non-IPv4 addresses
        if (addr.internal || addr.family !== 'IPv4') continue;

        // Return the first non-internal IPv4 address
        return addr.address;
      }
    }

    return null;
  }

  /**
   * Start the web server
   */
  public async start(port: number): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }

    return new Promise((resolve, reject) => {
      this.httpServer = createServer(this.app);
      this.setupSocketIO();

      this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });

      this.httpServer.listen(port, () => {
        this.isRunning = true;
        this.currentPort = port;
        console.log(`[WebServer] Started on port ${port}`);

        // Subscribe to cluster state changes to broadcast to web clients
        const clusterManager = getClusterManager();
        this.clusterStateHandler = () => {
          this.broadcastStateUpdate();
        };
        clusterManager.on('stateChanged', this.clusterStateHandler);

        // Subscribe to ProcessManager instance changes to broadcast to web clients
        const processManager = getProcessManager();
        this.processManagerHandler = () => {
          this.broadcastStateUpdate();
        };
        processManager.on('instanceCreated', this.processManagerHandler);
        processManager.on('instanceRemoved', this.processManagerHandler);

        this.emit('started', port);
        resolve();
      });
    });
  }

  /**
   * Stop the web server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      // Disconnect all sockets
      if (this.io) {
        this.io.disconnectSockets(true);
        void this.io.close();
        this.io = null;
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          this.isRunning = false;
          this.httpServer = null;
          console.log('[WebServer] Stopped');
          this.emit('stopped');
          resolve();
        });
      } else {
        this.isRunning = false;
        resolve();
      }

      // Clear authenticated sockets
      this.authenticatedSockets.clear();

      // Unsubscribe from cluster state changes
      if (this.clusterStateHandler) {
        const clusterManager = getClusterManager();
        clusterManager.off('stateChanged', this.clusterStateHandler);
        this.clusterStateHandler = null;
      }

      // Unsubscribe from ProcessManager events
      if (this.processManagerHandler) {
        const processManager = getProcessManager();
        processManager.off('instanceCreated', this.processManagerHandler);
        processManager.off('instanceRemoved', this.processManagerHandler);
        this.processManagerHandler = null;
      }

      // Clear all sessions
      getAuthService().clearAllSessions();
    });
  }

  /**
   * Kick a specific session
   */
  public kickSession(
    sessionId: string,
    reason: string = 'Kicked by administrator',
    _adminIp?: string
  ): void {
    const authService = getAuthService();
    const session = authService.getSession(sessionId);

    // Find sockets with this session
    for (const [socketId, sid] of this.authenticatedSockets) {
      if (sid === sessionId && this.io) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('session:kicked', reason);
          socket.disconnect(true);
        }
      }
    }

    // Log session kick
    if (session) {
      getAuditLogger().logSessionKick(session.ip, sessionId, reason);
    }

    // Delete the session
    authService.deleteSession(sessionId);
    this.emit('session:kicked', sessionId);
  }

  /**
   * Get server status
   * Note: Session details are limited to count only for security reasons.
   * Full session list is only accessible through admin-specific endpoints.
   */
  public getStatus(): RemoteServerStatus {
    const authService = getAuthService();
    const localIp = this.getLocalIp();

    return {
      running: this.isRunning,
      port: this.currentPort,
      url: this.isRunning && localIp ? `http://${localIp}:${this.currentPort}` : null,
      localIp,
      activeSessions: authService.getSessionCount(),
      // Omit detailed session info from general status for security
      // Session details can be managed through kick functionality
      sessions: [],
    };
  }

  /**
   * Get detailed server status including full session info (admin use only)
   */
  public getDetailedStatus(): RemoteServerStatus {
    const authService = getAuthService();
    const localIp = this.getLocalIp();

    return {
      running: this.isRunning,
      port: this.currentPort,
      url: this.isRunning && localIp ? `http://${localIp}:${this.currentPort}` : null,
      localIp,
      activeSessions: authService.getSessionCount(),
      sessions: authService.getAllSessions(),
    };
  }

  /**
   * Check if server is running
   */
  public get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get current port
   */
  public get port(): number {
    return this.currentPort;
  }
}

// Export singleton getter
export function getWebServer(): WebServer {
  return WebServer.getInstance();
}
