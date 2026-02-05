import express, { Request, Response, NextFunction } from 'express';
import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { join } from 'path';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
import { getSslCertificateService } from './SslCertificateService';
import { isElectronAvailable, isHeadlessMode } from '../utils/paths';

// Lazy load Electron app to support headless mode
function getElectronApp(): { isPackaged: boolean; getPath: (name: string) => string } | null {
  if (!isElectronAvailable()) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    return app;
  } catch {
    return null;
  }
}

import { IPC_CHANNELS } from '../ipc/channels';
import { getAuthService } from './AuthService';
import { DataStore } from './DataStore';
import { getProcessManager } from './ProcessManager';
import { getSubagentTracker } from './SubagentTracker';
import { getTaskTracker } from './TaskTracker';
import { getTeamFileWatcher } from './TeamFileWatcher';
import { getPlanFileWatcher } from './PlanFileWatcher';
import { getClusterManager } from './ClusterManager';
import { getAuditLogger } from './AuditLogger';
import { getStateSyncManager } from './managers/StateSyncManager';
import { getTerminalDimensionManager } from './TerminalDimensionManager';
import { McpServer } from './mcp/McpServer';
import { MetricsService } from './MetricsService';
import { GitStatusManager } from './GitStatusManager';
import { getRalphTaskLoop } from './RalphTaskLoop';
import type { McpRequest, McpToolContext } from '@shared/types/mcp';
import {
  createAuthRoutes,
  createProjectRoutes,
  createInstanceRoutes,
  createConversationRoutes,
  createHookRoutes,
  createProxyRoutes,
  createContextRoutes,
  createRalphTaskRoutes,
  type AuthenticatedRequest,
} from './routes';
import type {
  RemoteServerStatus,
  ServerToClientEvents,
  ClientToServerEvents,
  SyncState,
} from '@shared/types/remote';
import { DEFAULT_REMOTE_PORT } from '@shared/types/remote';
import type { StreamMessage, InstanceStatus, TrackedTask } from '@shared/types';
import type { TrackedTeam } from '@shared/types/teams';
import type { TrackedPlan } from '@shared/types/plans';
import type { SubagentInstance } from '@shared/types/orchestration';

// DevTools console entry interface (simplified for server-side storage)
interface ServerConsoleEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  source?: string;
  line?: number;
}

// DevTools memory limits
const DEVTOOLS_MAX_ENTRIES_PER_VIEW = 1000;
const DEVTOOLS_MAX_MESSAGE_SIZE = 10000; // 10KB max per message
const DEVTOOLS_TRUNCATION_SUFFIX = '... [truncated]';

export class WebServer extends EventEmitter {
  private static instance: WebServer | null = null;

  private app: express.Application;
  private httpServer: HttpServer | HttpsServer | null = null;
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;
  private isRunning = false;
  private isSslEnabled = false;
  private currentPort: number = DEFAULT_REMOTE_PORT;
  private currentBinding: string = '127.0.0.1'; // Default to localhost only
  private authenticatedSockets: Map<string, string> = new Map(); // socketId -> sessionId
  private socketSubscriptions: Map<string, Set<string>> = new Map(); // socketId -> Set<instanceId>
  private clusterStateHandler: (() => void) | null = null;
  private processManagerHandler: (() => void) | null = null;
  private mainWindow: import('electron').BrowserWindow | null = null;
  private mcpServer: McpServer | null = null;

  // DevTools state storage (for MCP tools access)
  private devToolsConsoleEntries: Map<string, ServerConsoleEntry[]> = new Map(); // viewId -> entries
  private devToolsInspectorState: Map<string, boolean> = new Map(); // viewId -> enabled
  private instanceViewMap: Map<string, string> = new Map(); // instanceId -> viewId
  private socketViewMap: Map<string, Set<string>> = new Map(); // socketId -> Set<viewId>

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

    // Logging middleware for debugging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      if (req.path.includes('ralph-tasks')) {
        console.log(`[WebServer] Incoming: ${req.method} ${req.path}`);
      }
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
   * Web access guard middleware
   * Blocks requests to web access routes when webAccessEnabled is false
   */
  private webAccessGuard = (_req: Request, res: Response, next: NextFunction): void => {
    const config = DataStore.getInstance().getRemoteConfig();
    if (!config.webAccessEnabled) {
      res.status(403).json({
        success: false,
        error: 'Web access is disabled',
      });
      return;
    }
    next();
  };

  private setupRoutes(): void {
    // ==================== INTERNAL ROUTES (always available) ====================
    // These routes are for local processes (hooks, MCP, health check)
    // They work even when webAccessEnabled is false

    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ success: true, status: 'ok' });
    });

    // Hook routes (no auth - local hook scripts)
    this.app.use(
      '/api/hooks',
      createHookRoutes({
        emitter: this,
        getIO: () => this.io,
        sendToRenderer: (channel, ...args) => this.sendToRenderer(channel, ...args),
      })
    );

    // Context routes (no auth - local instances share context)
    this.app.use(
      '/api/hooks/context',
      createContextRoutes({
        emitter: this,
        getIO: () => this.io,
        sendToRenderer: (channel, ...args) => this.sendToRenderer(channel, ...args),
      })
    );

    // MCP endpoint (token-based auth for Claude instances)
    this.setupMcpEndpoint();

    // Ralph Task CLI endpoints (no auth - called by Claude CLI instances)
    this.setupRalphTaskInternalRoutes();

    // ==================== WEB ACCESS ROUTES (require webAccessEnabled) ====================
    // These routes are for remote web clients and require webAccessEnabled to be true

    // Auth routes (protected by webAccessGuard)
    this.app.use(
      '/api/auth',
      this.webAccessGuard,
      createAuthRoutes({
        ipAccessMiddleware: this.ipAccessMiddleware,
        authMiddleware: this.authMiddleware,
        emitter: this,
      })
    );

    // Project routes (protected by webAccessGuard + auth)
    this.app.use(
      '/api/projects',
      this.webAccessGuard,
      createProjectRoutes({
        authMiddleware: this.authMiddleware,
        broadcastStateUpdate: () => this.broadcastStateUpdate(),
      })
    );

    // Instance routes (protected by webAccessGuard + auth)
    this.app.use(
      '/api/instances',
      this.webAccessGuard,
      createInstanceRoutes({
        authMiddleware: this.authMiddleware,
        broadcastStateUpdate: () => this.broadcastStateUpdate(),
      })
    );

    // Conversation routes (protected by webAccessGuard + auth)
    this.app.use(
      '/api/conversations',
      this.webAccessGuard,
      createConversationRoutes({
        authMiddleware: this.authMiddleware,
      })
    );

    // Ralph Task routes (protected by webAccessGuard + auth, except CLI endpoints)
    this.app.use(
      '/api/ralph-tasks',
      this.webAccessGuard,
      createRalphTaskRoutes({
        authMiddleware: this.authMiddleware,
        broadcastStateUpdate: () => this.broadcastStateUpdate(),
      })
    );

    // Sync endpoint (protected by webAccessGuard + auth)
    this.app.get(
      '/api/sync',
      this.webAccessGuard,
      this.authMiddleware,
      (_req: Request, res: Response) => {
        const state = this.getSyncState();
        res.json({ success: true, data: state });
      }
    );

    // Subagents endpoint (protected by webAccessGuard + auth)
    this.app.get(
      '/api/subagents',
      this.webAccessGuard,
      this.authMiddleware,
      (_req: Request, res: Response) => {
        const tracker = getSubagentTracker();
        const subagents = tracker.getAllSubagents();
        res.json({ success: true, data: subagents });
      }
    );

    // Tasks endpoint (protected by webAccessGuard + auth)
    this.app.get(
      '/api/tasks',
      this.webAccessGuard,
      this.authMiddleware,
      (_req: Request, res: Response) => {
        const tracker = getTaskTracker();
        const tasks = tracker.getAllTasks();
        res.json({ success: true, data: tasks });
      }
    );

    // Tasks by instance endpoint (protected by webAccessGuard + auth)
    this.app.get(
      '/api/tasks/:instanceId',
      this.webAccessGuard,
      this.authMiddleware,
      (req: Request, res: Response) => {
        const tracker = getTaskTracker();
        const instanceId = Array.isArray(req.params.instanceId)
          ? req.params.instanceId[0]
          : req.params.instanceId;
        const tasks = tracker.getTasks(instanceId);
        res.json({ success: true, data: tasks });
      }
    );

    // Teams endpoint (protected by webAccessGuard + auth)
    this.app.get(
      '/api/teams',
      this.webAccessGuard,
      this.authMiddleware,
      (_req: Request, res: Response) => {
        const watcher = getTeamFileWatcher();
        const teams = watcher.getAllTeams();
        res.json({ success: true, data: teams });
      }
    );

    // Plans endpoint (protected by webAccessGuard + auth)
    this.app.get(
      '/api/plans',
      this.webAccessGuard,
      this.authMiddleware,
      (_req: Request, res: Response) => {
        const watcher = getPlanFileWatcher();
        const plans = watcher.getAllPlans();
        res.json({ success: true, data: plans });
      }
    );

    // Proxy routes (protected by webAccessGuard + auth)
    this.app.use(
      '/api/proxy',
      this.webAccessGuard,
      createProxyRoutes({
        authMiddleware: this.authMiddleware,
      })
    );

    // Static files (web UI) - protected by webAccessGuard
    this.setupStaticFiles();
  }

  /**
   * Initialize the MCP server with dependencies
   */
  private initializeMcpServer(): McpServer {
    if (!this.mcpServer) {
      const metrics = MetricsService.getInstance();
      const processManager = getProcessManager();
      const dataStore = DataStore.getInstance();
      const gitStatusManager = GitStatusManager.getInstance();

      this.mcpServer = new McpServer(metrics, processManager, dataStore, gitStatusManager);
    }
    return this.mcpServer;
  }

  /**
   * Setup MCP endpoint for Claude CLI instances
   */
  private setupMcpEndpoint(): void {
    // MCP JSON-RPC endpoint
    this.app.post('/mcp', async (req: Request, res: Response) => {
      const token = req.headers['x-instance-token'] as string | undefined;
      const mcpServer = this.initializeMcpServer();

      // Authenticate request
      const context = mcpServer.authenticateRequest(token);
      if (!context) {
        res.status(401).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing instance token',
          },
        });
        return;
      }

      // Validate request body
      const request = req.body as McpRequest;
      if (!request || typeof request !== 'object') {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error: Invalid JSON',
          },
        });
        return;
      }

      try {
        const response = await mcpServer.handleRequest(request, context);
        res.json(response);
      } catch (error) {
        console.error('[WebServer] MCP request error:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          id: request.id || null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal server error',
          },
        });
      }
    });

    // MCP tools list endpoint (for debugging/discovery)
    this.app.get('/mcp/tools', (req: Request, res: Response) => {
      const token = req.headers['x-instance-token'] as string | undefined;
      const mcpServer = this.initializeMcpServer();

      const context = mcpServer.authenticateRequest(token);
      if (!context) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const response = mcpServer.handleRequest(
        { jsonrpc: '2.0', id: 'tools-list', method: 'tools/list' },
        context
      );
      res.json(response);
    });

    // MCP stats endpoint (for monitoring)
    this.app.get('/mcp/stats', (_req: Request, res: Response) => {
      const mcpServer = this.initializeMcpServer();
      res.json({ success: true, data: mcpServer.getStats() });
    });

    console.log('[WebServer] MCP endpoint configured at /mcp');
  }

  /**
   * Setup internal routes for Ralph Task CLI endpoints
   * These routes are available without webAccessGuard (called by Claude CLI instances)
   */
  private setupRalphTaskInternalRoutes(): void {
    const taskLoop = getRalphTaskLoop();

    // Complete a Ralph task (called by CLI) - NO AUTH REQUIRED for local CLI access
    this.app.post('/api/ralph-tasks/:id/complete', (req: Request, res: Response) => {
      const taskId = String(req.params.id);
      console.log(`[WebServer] Ralph task complete request: id=${taskId}, body=`, req.body);
      try {
        const summary = String(req.body?.summary || 'Task completed');
        console.log(
          `[WebServer] Completing task ${taskId} with summary: ${summary.substring(0, 50)}...`
        );
        const task = taskLoop.completeTask(taskId, summary);
        if (!task) {
          console.log(`[WebServer] Task ${taskId} not found`);
          res.status(404).json({ success: false, error: 'Task not found' });
          return;
        }
        console.log(`[WebServer] Task ${taskId} completed successfully`);
        res.json({ success: true, data: task });
        this.broadcastStateUpdate();
      } catch (error) {
        console.error(`[WebServer] Error completing task ${taskId}:`, error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message });
      }
    });

    // Request help for a Ralph task (called by CLI) - NO AUTH REQUIRED for local CLI access
    this.app.post('/api/ralph-tasks/:id/help', (req: Request, res: Response) => {
      try {
        const reason = req.body.reason || 'Help requested';
        const task = taskLoop.requestHelp(String(req.params.id), reason);
        if (!task) {
          res.status(404).json({ success: false, error: 'Task not found' });
          return;
        }
        res.json({ success: true, data: task });
        this.broadcastStateUpdate();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ success: false, error: message });
      }
    });

    console.log('[WebServer] Ralph Task internal endpoints configured');
  }

  /**
   * Setup static file serving for web UI
   * Protected by webAccessGuard - only available when webAccessEnabled is true
   */
  private setupStaticFiles(): void {
    const electronApp = getElectronApp();
    const isDev =
      process.env.NODE_ENV === 'development' ||
      isHeadlessMode() ||
      (electronApp ? !electronApp.isPackaged : true);

    let webBuildPath: string;
    if (isHeadlessMode()) {
      // In headless mode (tsx/ts-node), use dist/web from project root
      webBuildPath = join(process.cwd(), 'dist/web');
    } else if (isDev) {
      webBuildPath = join(__dirname, '../web');
    } else {
      webBuildPath = join(process.resourcesPath || __dirname, 'web');
    }

    // Check if web build directory exists (may not exist in dev mode with Vite)
    const indexPath = join(webBuildPath, 'index.html');
    if (!existsSync(indexPath)) {
      // In dev mode, frontend is served by Vite, so skip static file setup
      console.log('[WebServer] Web build not found, skipping static file serving (dev mode)');
      return;
    }

    // Static files protected by webAccessGuard
    this.app.use(this.webAccessGuard, express.static(webBuildPath));

    // SPA fallback - serve index.html for all non-API routes (protected by webAccessGuard)
    this.app.get('/{*splat}', this.webAccessGuard, (_req: Request, res: Response) => {
      res.sendFile(indexPath);
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
      // Check if web access is enabled
      const config = DataStore.getInstance().getRemoteConfig();
      if (!config.webAccessEnabled) {
        next(new Error('Web access is disabled'));
        return;
      }

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

      // Handle instance resize with validation and dimension synchronization
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

        // Update dimension tracking
        const clientId = `web:${socket.id}`;
        const dimManager = getTerminalDimensionManager();
        const result = dimManager.updateClientDimensions(instanceId, clientId, cols, rows);

        if (result.changed) {
          // Resize PTY to minimum dimensions
          const processManager = getProcessManager();
          processManager.resizeInstance(instanceId, result.min.cols, result.min.rows);

          // Broadcast synchronized dimensions to all web clients
          if (this.io) {
            this.io.emit('instance:dimensionSync', instanceId, result.min.cols, result.min.rows);
          }

          // Also send to Electron renderer via IPC
          if (this.mainWindow) {
            this.mainWindow.webContents.send(
              IPC_CHANNELS.INSTANCE_DIMENSION_SYNC,
              instanceId,
              result.min.cols,
              result.min.rows
            );
          }
        }
      });

      // Handle instance subscription (for focused real-time updates)
      socket.on('subscribe:instance', async (instanceId, callback) => {
        if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
          if (typeof callback === 'function') callback({ success: false });
          return;
        }
        await socket.join(`instance:${instanceId}`);

        // Track subscription for cleanup on disconnect
        let subscriptions = this.socketSubscriptions.get(socket.id);
        if (!subscriptions) {
          subscriptions = new Set();
          this.socketSubscriptions.set(socket.id, subscriptions);
        }
        subscriptions.add(instanceId);

        // Send current minimum dimensions to the new client (if available)
        const dimManager = getTerminalDimensionManager();
        const minDims = dimManager.getMinDimensions(instanceId);
        if (minDims) {
          socket.emit('instance:dimensionSync', instanceId, minDims.cols, minDims.rows);
        }

        // Confirm subscription to client
        if (typeof callback === 'function') {
          callback({ success: true });
        }
      });

      socket.on('unsubscribe:instance', async (instanceId, callback) => {
        if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
          if (typeof callback === 'function') callback({ success: false });
          return;
        }
        await socket.leave(`instance:${instanceId}`);

        // Remove from subscription tracking
        const subscriptions = this.socketSubscriptions.get(socket.id);
        if (subscriptions) {
          subscriptions.delete(instanceId);
        }

        // Remove from dimension tracking and recalculate
        const clientId = `web:${socket.id}`;
        const dimManager = getTerminalDimensionManager();
        const result = dimManager.removeClient(instanceId, clientId);

        // If minimum changed and there are still clients, resize PTY and broadcast
        if (result.changed && result.min) {
          const processManager = getProcessManager();
          processManager.resizeInstance(instanceId, result.min.cols, result.min.rows);

          if (this.io) {
            this.io.emit('instance:dimensionSync', instanceId, result.min.cols, result.min.rows);
          }

          // Also send to Electron renderer
          if (this.mainWindow) {
            this.mainWindow.webContents.send(
              IPC_CHANNELS.INSTANCE_DIMENSION_SYNC,
              instanceId,
              result.min.cols,
              result.min.rows
            );
          }
        }

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      });

      // Handle explicit sync request (e.g., after reconnection)
      socket.on('request:sync', () => {
        const state = this.getSyncState();
        socket.emit('sync:state', state);
      });

      // DevTools events (web preview console capture)
      socket.on('devtools:registerView', (data: { viewId: string; instanceId: string }) => {
        if (!data?.viewId || !data?.instanceId) return;
        this.registerProxyView(data.viewId, data.instanceId);
        // Track which socket registered this view for cleanup on disconnect
        let socketViews = this.socketViewMap.get(socket.id);
        if (!socketViews) {
          socketViews = new Set();
          this.socketViewMap.set(socket.id, socketViews);
        }
        socketViews.add(data.viewId);
      });

      socket.on('devtools:unregisterView', (data: { viewId: string }) => {
        if (!data?.viewId) return;
        this.unregisterProxyView(data.viewId);
        // Remove from socket tracking
        const socketViews = this.socketViewMap.get(socket.id);
        if (socketViews) {
          socketViews.delete(data.viewId);
        }
      });

      socket.on(
        'devtools:console',
        (data: {
          viewId: string;
          entry: {
            level: string;
            message: string;
            timestamp: number;
            source?: string;
            line?: number;
          };
        }) => {
          if (!data?.viewId || !data?.entry) return;
          this.addDevToolsConsoleEntry(data.viewId, {
            level: data.entry.level as 'log' | 'warn' | 'error' | 'info' | 'debug',
            message: data.entry.message,
            timestamp: data.entry.timestamp,
            source: data.entry.source,
            line: data.entry.line,
          });
        }
      );

      socket.on('devtools:clearConsole', (data: { viewId: string }) => {
        if (!data?.viewId) return;
        this.clearDevToolsConsoleEntries(data.viewId);
      });

      socket.on('devtools:toggleInspector', (data: { viewId: string; enabled?: boolean }) => {
        if (!data?.viewId) return;
        this.broadcastDevToolsCommand(undefined, {
          type:
            data.enabled === undefined
              ? 'toggle-inspector'
              : data.enabled
                ? 'enable-inspector'
                : 'disable-inspector',
          viewId: data.viewId,
        });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`[WebServer] Socket disconnected: ${socket.id}`);
        this.authenticatedSockets.delete(socket.id);

        // Clean up DevTools data for views registered by this socket
        const socketViews = this.socketViewMap.get(socket.id);
        if (socketViews) {
          for (const viewId of socketViews) {
            this.unregisterProxyView(viewId);
          }
          this.socketViewMap.delete(socket.id);
        }

        // Clean up dimension tracking for all subscribed instances
        const subscriptions = this.socketSubscriptions.get(socket.id);
        if (subscriptions) {
          const clientId = `web:${socket.id}`;
          const dimManager = getTerminalDimensionManager();
          const processManager = getProcessManager();

          for (const instanceId of subscriptions) {
            const result = dimManager.removeClient(instanceId, clientId);

            // If minimum changed and there are still clients, resize PTY and broadcast
            if (result.changed && result.min) {
              processManager.resizeInstance(instanceId, result.min.cols, result.min.rows);

              if (this.io) {
                this.io.emit(
                  'instance:dimensionSync',
                  instanceId,
                  result.min.cols,
                  result.min.rows
                );
              }

              // Also send to Electron renderer
              if (this.mainWindow) {
                this.mainWindow.webContents.send(
                  IPC_CHANNELS.INSTANCE_DIMENSION_SYNC,
                  instanceId,
                  result.min.cols,
                  result.min.rows
                );
              }
            }
          }

          this.socketSubscriptions.delete(socket.id);
        }
      });
    });
  }

  /**
   * Broadcast instance output to web clients
   * Note: Broadcast to ALL connected clients to avoid race conditions with subscription
   */
  public broadcastInstanceOutput(instanceId: string, data: StreamMessage): void {
    if (this.io) {
      this.io.emit('instance:output', instanceId, data);
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
   * Note: Broadcast to ALL connected clients to avoid race conditions with subscription
   */
  public broadcastInstanceError(instanceId: string, error: string): void {
    if (this.io) {
      this.io.emit('instance:error', instanceId, error);
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
   * Note: Broadcast to ALL connected clients to avoid race conditions with subscription
   */
  public broadcastInstanceRawOutput(instanceId: string, data: string): void {
    if (this.io) {
      this.io.emit('instance:rawOutput', instanceId, data);
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
   * Broadcast subagent started event to web clients
   */
  public broadcastSubagentStarted(instanceId: string, subagent: SubagentInstance): void {
    if (this.io) {
      this.io.emit('subagent:started', { instanceId, subagent });
    }
  }

  /**
   * Broadcast subagent completed event to web clients
   */
  public broadcastSubagentCompleted(instanceId: string, subagent: SubagentInstance): void {
    if (this.io) {
      this.io.emit('subagent:completed', { instanceId, subagent });
    }
  }

  /**
   * Broadcast task created event to web clients
   */
  public broadcastTaskCreated(instanceId: string, task: TrackedTask): void {
    if (this.io) {
      this.io.emit('task:created', { instanceId, task });
    }
  }

  /**
   * Broadcast task updated event to web clients
   */
  public broadcastTaskUpdated(instanceId: string, task: TrackedTask): void {
    if (this.io) {
      this.io.emit('task:updated', { instanceId, task });
    }
  }

  /**
   * Broadcast task list event to web clients
   */
  public broadcastTaskList(instanceId: string, tasks: TrackedTask[]): void {
    if (this.io) {
      this.io.emit('task:list', { instanceId, tasks });
    }
  }

  /**
   * Broadcast instance hook status update to web clients
   */
  public broadcastInstanceHookStatus(
    instanceId: string,
    data: { status: string; message?: string; progress?: number }
  ): void {
    if (this.io) {
      this.io.emit('instance:hookStatus', instanceId, data);
    }
  }

  /**
   * Broadcast hook activity event to web clients
   */
  public broadcastHookActivity(data: {
    instanceId: string;
    toolName?: string;
    files?: string[];
    timestamp: number;
  }): void {
    if (this.io) {
      this.io.emit('hook:activity', data);
    }
  }

  /**
   * Broadcast context instance update to web clients
   */
  public broadcastContextInstanceUpdate(
    projectId: string,
    context: import('@shared/types/sharedContext').SharedInstanceContext
  ): void {
    if (this.io) {
      this.io.emit('context:instanceUpdated', { projectId, context });
    }
  }

  /**
   * Broadcast context knowledge update to web clients
   */
  public broadcastContextKnowledgeUpdate(
    projectId: string,
    knowledge: import('@shared/types/sharedContext').ProjectSharedKnowledge
  ): void {
    if (this.io) {
      this.io.emit('context:knowledgeUpdated', { projectId, knowledge });
    }
  }

  /**
   * Broadcast generic context update event to web clients
   */
  public broadcastContextUpdate(
    event: import('@shared/types/sharedContext').ContextUpdateEvent
  ): void {
    if (this.io) {
      this.io.emit('context:updated', event);
    }
  }

  /**
   * Broadcast team created event to web clients
   */
  public broadcastTeamCreated(team: TrackedTeam): void {
    if (this.io) {
      this.io.emit('team:created', { team });
    }
  }

  /**
   * Broadcast team updated event to web clients
   */
  public broadcastTeamUpdated(team: TrackedTeam): void {
    if (this.io) {
      this.io.emit('team:updated', { team });
    }
  }

  /**
   * Broadcast team deleted event to web clients
   */
  public broadcastTeamDeleted(teamName: string): void {
    if (this.io) {
      this.io.emit('team:deleted', { teamName });
    }
  }

  /**
   * Broadcast plan created event to web clients
   */
  public broadcastPlanCreated(plan: TrackedPlan): void {
    if (this.io) {
      this.io.emit('plan:created', { plan });
    }
  }

  /**
   * Broadcast plan updated event to web clients
   */
  public broadcastPlanUpdated(plan: TrackedPlan): void {
    if (this.io) {
      this.io.emit('plan:updated', { plan });
    }
  }

  /**
   * Broadcast plan deleted event to web clients
   */
  public broadcastPlanDeleted(planName: string): void {
    if (this.io) {
      this.io.emit('plan:deleted', { planName });
    }
  }

  /**
   * Broadcast terminal dimension sync to all web clients
   */
  public broadcastDimensionSync(instanceId: string, cols: number, rows: number): void {
    if (this.io) {
      this.io.emit('instance:dimensionSync', instanceId, cols, rows);
    }
  }

  /**
   * Broadcast proxy open event to web clients (from MCP tool)
   */
  public broadcastProxyOpen(data: {
    port: number;
    path?: string;
    split?: boolean;
    title?: string;
    instanceId?: string;
  }): void {
    if (this.io) {
      this.io.emit('proxy:open', data);
    }
    // Also send to renderer process for desktop app
    this.sendToRenderer('proxy:open', data);
  }

  /**
   * Register a proxy view for an instance (for MCP tools to find views)
   */
  public registerProxyView(viewId: string, instanceId: string): void {
    this.instanceViewMap.set(instanceId, viewId);
    this.devToolsConsoleEntries.set(viewId, []);
    this.devToolsInspectorState.set(viewId, false);
  }

  /**
   * Unregister a proxy view
   */
  public unregisterProxyView(viewId: string): void {
    // Find and remove instance mapping
    for (const [instId, vId] of this.instanceViewMap) {
      if (vId === viewId) {
        this.instanceViewMap.delete(instId);
        break;
      }
    }
    this.devToolsConsoleEntries.delete(viewId);
    this.devToolsInspectorState.delete(viewId);
  }

  /**
   * Add console entry from a proxy view (received from renderer via IPC/Socket)
   */
  public addDevToolsConsoleEntry(viewId: string, entry: Omit<ServerConsoleEntry, 'id'>): void {
    const entries = this.devToolsConsoleEntries.get(viewId) || [];

    // Truncate message if too large to prevent memory spikes
    let message = entry.message;
    if (message.length > DEVTOOLS_MAX_MESSAGE_SIZE) {
      message =
        message.substring(0, DEVTOOLS_MAX_MESSAGE_SIZE - DEVTOOLS_TRUNCATION_SUFFIX.length) +
        DEVTOOLS_TRUNCATION_SUFFIX;
    }

    const newEntry: ServerConsoleEntry = {
      ...entry,
      message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    entries.push(newEntry);

    // Keep max entries per view
    if (entries.length > DEVTOOLS_MAX_ENTRIES_PER_VIEW) {
      entries.splice(0, entries.length - DEVTOOLS_MAX_ENTRIES_PER_VIEW);
    }

    this.devToolsConsoleEntries.set(viewId, entries);
  }

  /**
   * Get console entries for MCP tools
   */
  public getDevToolsConsoleEntries(
    instanceId: string | undefined,
    level: string = 'all',
    limit: number = 50
  ): ServerConsoleEntry[] {
    let viewId: string | undefined;

    if (instanceId) {
      viewId = this.instanceViewMap.get(instanceId);
    }

    // If no specific view, get entries from all views
    let entries: ServerConsoleEntry[] = [];

    if (viewId) {
      entries = this.devToolsConsoleEntries.get(viewId) || [];
    } else {
      // Combine entries from all views
      for (const viewEntries of this.devToolsConsoleEntries.values()) {
        entries = entries.concat(viewEntries);
      }
      // Sort by timestamp
      entries.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Filter by level
    if (level !== 'all') {
      entries = entries.filter((e) => e.level === level);
    }

    // Limit results (take most recent)
    if (entries.length > limit) {
      entries = entries.slice(-limit);
    }

    return entries;
  }

  /**
   * Clear console entries for a view
   */
  public clearDevToolsConsoleEntries(viewId: string): void {
    this.devToolsConsoleEntries.set(viewId, []);
  }

  /**
   * Broadcast devtools command to web clients (for MCP tools)
   */
  public broadcastDevToolsCommand(
    instanceId: string | undefined,
    command: { type: string; [key: string]: unknown }
  ): void {
    const viewId = instanceId ? this.instanceViewMap.get(instanceId) : undefined;

    if (command.type === 'toggle-inspector') {
      // Toggle the inspector state
      if (viewId) {
        const currentState = this.devToolsInspectorState.get(viewId) || false;
        this.devToolsInspectorState.set(viewId, !currentState);
      }
    } else if (command.type === 'enable-inspector') {
      if (viewId) {
        this.devToolsInspectorState.set(viewId, true);
      }
    } else if (command.type === 'disable-inspector') {
      if (viewId) {
        this.devToolsInspectorState.set(viewId, false);
      }
    } else if (command.type === 'clear-console') {
      if (viewId) {
        this.clearDevToolsConsoleEntries(viewId);
      } else {
        // Clear all console entries
        for (const vId of this.devToolsConsoleEntries.keys()) {
          this.devToolsConsoleEntries.set(vId, []);
        }
      }
    }

    // Broadcast to web clients
    if (this.io) {
      this.io.emit('devtools:command', { viewId, instanceId, command });
    }

    // Send to renderer for Electron
    this.sendToRenderer('devtools:command', { viewId, instanceId, command });
  }

  /**
   * Get inspector state for a view
   */
  public getDevToolsInspectorState(viewId: string): boolean {
    return this.devToolsInspectorState.get(viewId) || false;
  }

  /**
   * Broadcast full state update to all clients
   */
  public broadcastStateUpdate(): void {
    if (this.io) {
      const state = this.getSyncState();
      const socketCount = this.io.sockets.sockets.size;
      console.log(
        `[WebServer] Broadcasting sync:state to ${socketCount} sockets, ${state.instances?.length || 0} instances`
      );
      this.io.emit('sync:state', state);
    }
  }

  /**
   * Get current sync state (delegates to StateSyncManager)
   */
  private getSyncState(): SyncState {
    return getStateSyncManager().getSyncState();
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
   * @param port - Port to listen on
   * @param bindLocalhost - If true, bind to 127.0.0.1 only (default). If false, bind to 0.0.0.0
   */
  public async start(port: number, bindLocalhost: boolean = true): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }

    return new Promise((resolve, reject) => {
      // Get remote config to check SSL settings
      const dataStore = DataStore.getInstance();
      const config = dataStore.getRemoteConfig();

      try {
        if (config.ssl.enabled) {
          // Create HTTPS server
          const sslService = getSslCertificateService();
          const sslOptions = sslService.loadCertificates(config.ssl);
          this.httpServer = createHttpsServer(sslOptions, this.app);
          this.isSslEnabled = true;
          console.log('[WebServer] SSL/TLS enabled - using HTTPS');
        } else {
          // Create HTTP server
          this.httpServer = createHttpServer(this.app);
          this.isSslEnabled = false;
        }
      } catch (error) {
        console.error('[WebServer] Failed to load SSL certificates:', error);
        reject(
          new Error(
            `Failed to load SSL certificates: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
        return;
      }

      this.setupSocketIO();

      this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });

      const host = bindLocalhost ? '127.0.0.1' : '0.0.0.0';
      this.currentBinding = host;

      this.httpServer.listen(port, host, () => {
        this.isRunning = true;
        this.currentPort = port;
        const protocol = this.isSslEnabled ? 'https' : 'http';
        console.log(`[WebServer] Started on ${protocol}://${host}:${port}`);

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

      // Clear authenticated sockets and subscriptions
      this.authenticatedSockets.clear();
      this.socketSubscriptions.clear();

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
   * Update the server binding dynamically
   * @param bindAllInterfaces - If true, bind to 0.0.0.0. If false, bind to 127.0.0.1
   */
  public async updateBinding(bindAllInterfaces: boolean): Promise<void> {
    if (!this.isRunning) return;

    const newHost = bindAllInterfaces ? '0.0.0.0' : '127.0.0.1';
    if (this.currentBinding === newHost) return;

    const port = this.currentPort;
    console.log(`[WebServer] Changing binding from ${this.currentBinding} to ${newHost}`);
    await this.stop();
    await this.start(port, !bindAllInterfaces);
  }

  /**
   * Get current binding address
   */
  public get binding(): string {
    return this.currentBinding;
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
    const protocol = this.isSslEnabled ? 'https' : 'http';

    return {
      running: this.isRunning,
      port: this.currentPort,
      url: this.isRunning && localIp ? `${protocol}://${localIp}:${this.currentPort}` : null,
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
    const protocol = this.isSslEnabled ? 'https' : 'http';

    return {
      running: this.isRunning,
      port: this.currentPort,
      url: this.isRunning && localIp ? `${protocol}://${localIp}:${this.currentPort}` : null,
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

  /**
   * Check if SSL is enabled
   */
  public get sslEnabled(): boolean {
    return this.isSslEnabled;
  }

  /**
   * Register an MCP instance token
   */
  public registerMcpToken(token: string, context: McpToolContext): void {
    const mcpServer = this.initializeMcpServer();
    mcpServer.registerInstanceToken(token, context);
  }

  /**
   * Unregister an MCP instance token
   */
  public unregisterMcpToken(token: string): void {
    if (this.mcpServer) {
      this.mcpServer.unregisterInstanceToken(token);
    }
  }

  /**
   * Get MCP server instance
   */
  public getMcpServer(): McpServer {
    return this.initializeMcpServer();
  }
}

// Export singleton getter
export function getWebServer(): WebServer {
  return WebServer.getInstance();
}
