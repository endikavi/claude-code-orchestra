import express, { Request, Response, NextFunction } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import { join } from 'path';
import { networkInterfaces } from 'os';
import { EventEmitter } from 'events';
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

import { getAuthService } from './AuthService';
import { DataStore } from './DataStore';
import { getProcessManager } from './ProcessManager';
import { getSubagentTracker } from './SubagentTracker';
import { getClusterManager } from './ClusterManager';
import { getAuditLogger } from './AuditLogger';
import { getStateSyncManager } from './managers/StateSyncManager';
import { McpServer } from './mcp/McpServer';
import { MetricsService } from './MetricsService';
import { GitStatusManager } from './GitStatusManager';
import type { McpRequest, McpToolContext } from '@shared/types/mcp';
import {
  createAuthRoutes,
  createProjectRoutes,
  createInstanceRoutes,
  createConversationRoutes,
  createHookRoutes,
  type AuthenticatedRequest,
} from './routes';
import type {
  RemoteServerStatus,
  ServerToClientEvents,
  ClientToServerEvents,
  SyncState,
} from '@shared/types/remote';
import { DEFAULT_REMOTE_PORT } from '@shared/types/remote';
import type { StreamMessage, InstanceStatus } from '@shared/types';
import type { SubagentInstance } from '@shared/types/orchestration';

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
  private mcpServer: McpServer | null = null;

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

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ success: true, status: 'ok' });
    });

    // Auth routes
    this.app.use(
      '/api/auth',
      createAuthRoutes({
        ipAccessMiddleware: this.ipAccessMiddleware,
        authMiddleware: this.authMiddleware,
        emitter: this,
      })
    );

    // Project routes
    this.app.use(
      '/api/projects',
      createProjectRoutes({
        authMiddleware: this.authMiddleware,
        broadcastStateUpdate: () => this.broadcastStateUpdate(),
      })
    );

    // Instance routes
    this.app.use(
      '/api/instances',
      createInstanceRoutes({
        authMiddleware: this.authMiddleware,
        broadcastStateUpdate: () => this.broadcastStateUpdate(),
      })
    );

    // Conversation routes
    this.app.use(
      '/api/conversations',
      createConversationRoutes({
        authMiddleware: this.authMiddleware,
      })
    );

    // Sync endpoint
    this.app.get('/api/sync', this.authMiddleware, (_req: Request, res: Response) => {
      const state = this.getSyncState();
      res.json({ success: true, data: state });
    });

    // Subagents endpoint (get all subagents across all instances)
    this.app.get('/api/subagents', this.authMiddleware, (_req: Request, res: Response) => {
      const tracker = getSubagentTracker();
      const subagents = tracker.getAllSubagents();
      res.json({ success: true, data: subagents });
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

    // MCP endpoint (token-based auth for Claude instances)
    this.setupMcpEndpoint();

    // Static files (web UI)
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
   * Setup static file serving for web UI
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

    this.app.use(express.static(webBuildPath));

    // SPA fallback - serve index.html for all non-API routes
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
      socket.on('subscribe:instance', async (instanceId, callback) => {
        if (typeof instanceId !== 'string' || instanceId.length === 0 || instanceId.length > 128) {
          if (typeof callback === 'function') callback({ success: false });
          return;
        }
        await socket.join(`instance:${instanceId}`);
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
        if (typeof callback === 'function') {
          callback({ success: true });
        }
      });

      // Handle explicit sync request (e.g., after reconnection)
      socket.on('request:sync', () => {
        const state = this.getSyncState();
        socket.emit('sync:state', state);
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
