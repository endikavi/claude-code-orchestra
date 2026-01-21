import { EventEmitter } from 'events';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket as ServerSocket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { createHmac, timingSafeEqual } from 'crypto';
import { networkInterfaces } from 'os';

// BrowserWindow type for optional Electron dependency
type BrowserWindowType = import('electron').BrowserWindow;

import { DataStore } from './DataStore';
import { getProcessManager } from './ProcessManager';
import { getClusterPermissionValidator } from './ClusterPermissionValidator';
import type {
  ClusterConfig,
  ClusterNode,
  ClusterState,
  ClusterStatus,
  NodeRegistrationRequest,
  NodeRegistrationResponse,
  RemoteInstanceRequest,
  ClusterServerToClientEvents,
  ClusterClientToServerEvents,
  GlobalProject,
  GlobalInstance,
  ClusterPermissionChangeEvent,
} from '@shared/types/cluster';
import type { Project, ClaudeInstance, StreamMessage, InstanceStatus } from '@shared/types';
import type { HookStatusUpdate } from '@shared/types/remote';
import type { SubagentInstance } from '@shared/types/orchestration';
import { IPC_CHANNELS } from '../ipc/channels';

// Heartbeat interval in milliseconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const RECONNECT_INTERVAL = 5000; // 5 seconds
const CONNECTION_TIMEOUT = 10000; // 10 seconds

// Broadcast debounce settings
const BROADCAST_DEBOUNCE_MS = 100; // 100ms debounce
const BROADCAST_MAX_WAIT_MS = 500; // Max 2 broadcasts/second

// Node limits to prevent unbounded growth
const MAX_NODES = 100;

/**
 * Debounce utility with maxWait support
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
  options?: { maxWait?: number }
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime: number | null = null;
  let lastArgs: unknown[] | null = null;

  const maxWait = options?.maxWait;

  const invoke = () => {
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
      lastCallTime = null;
    }
  };

  const debounced = ((...args: unknown[]) => {
    lastArgs = args;
    const now = Date.now();

    if (lastCallTime === null) {
      lastCallTime = now;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Check if maxWait has been exceeded
    if (maxWait && now - lastCallTime >= maxWait) {
      invoke();
      lastCallTime = now;
    } else {
      timeoutId = setTimeout(() => {
        invoke();
        timeoutId = null;
      }, delay);
    }
  }) as T & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    lastCallTime = null;
  };

  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    invoke();
  };

  return debounced;
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

export class ClusterManager extends EventEmitter {
  private static instance: ClusterManager | null = null;

  private dataStore: DataStore;
  private mainWindow: BrowserWindowType | null = null;

  // State
  private nodes: Map<string, ClusterNode> = new Map();
  private localNodeId: string = '';
  private config: ClusterConfig | null = null;
  private stateVersion: number = 0;
  private lastReceivedVersion: number = 0;

  // Server (when acting as primary)
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer<ClusterClientToServerEvents, ClusterServerToClientEvents> | null =
    null;
  private clusterSockets: Map<string, string> = new Map(); // socketId -> nodeId
  private serverRunning: boolean = false;

  // Pending states for nodes that sent state:update before completing registration
  private pendingStates: Map<string, { projects: Project[]; instances: ClaudeInstance[] }> =
    new Map();

  // Client socket (when acting as secondary)
  private clientSocket: ClientSocket<
    ClusterServerToClientEvents,
    ClusterClientToServerEvents
  > | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting: boolean = false;
  private intentionalDisconnect: boolean = false;

  // Debounced broadcast function
  private debouncedBroadcast: (() => void) & { cancel: () => void; flush: () => void };

  private constructor() {
    super();
    this.dataStore = DataStore.getInstance();
    this.loadConfig();

    // Initialize debounced broadcast
    this.debouncedBroadcast = debounce(
      () => this.broadcastClusterStateImmediate(),
      BROADCAST_DEBOUNCE_MS,
      { maxWait: BROADCAST_MAX_WAIT_MS }
    );
  }

  public static getInstance(): ClusterManager {
    if (!ClusterManager.instance) {
      ClusterManager.instance = new ClusterManager();
    }
    return ClusterManager.instance;
  }

  /**
   * Set the main window for IPC communication
   */
  public setMainWindow(window: BrowserWindowType): void {
    this.mainWindow = window;
  }

  /**
   * Load configuration from database
   */
  private loadConfig(): void {
    this.config = this.dataStore.getClusterConfig();
    this.localNodeId = this.config.nodeId;
  }

  /**
   * Get current configuration
   */
  public getConfig(): ClusterConfig {
    if (!this.config) {
      this.loadConfig();
    }
    // After loadConfig, config is always set
    return this.config as ClusterConfig;
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<ClusterConfig>): ClusterConfig {
    this.config = this.dataStore.updateClusterConfig(updates);
    return this.config;
  }

  /**
   * Reload configuration from database (for when external changes occur)
   */
  public reloadConfig(): ClusterConfig {
    this.loadConfig();
    return this.config as ClusterConfig;
  }

  /**
   * Get cluster status
   */
  public getStatus(): ClusterStatus {
    const config = this.getConfig();

    return {
      enabled: config.enabled,
      role: config.role,
      connected: this.isConnected(),
      nodeCount: this.nodes.size + 1, // Include local node
      nodes: Array.from(this.nodes.values()),
      localNodeId: this.localNodeId,
      error: undefined,
    };
  }

  /**
   * Check if connected to cluster
   */
  public isConnected(): boolean {
    const config = this.getConfig();
    if (config.role === 'primary') {
      // Primary is connected only if the server is actually running
      return this.serverRunning;
    }
    if (config.role === 'secondary') {
      return this.clientSocket?.connected ?? false;
    }
    return false;
  }

  /**
   * Start cluster mode
   */
  public async start(): Promise<void> {
    const config = this.getConfig();

    if (!config.enabled) {
      console.log('[ClusterManager] Cluster mode is disabled');
      return;
    }

    if (config.role === 'primary') {
      console.log('[ClusterManager] Starting as PRIMARY node');
      await this.setupPrimaryMode();
    } else if (config.role === 'secondary') {
      console.log('[ClusterManager] Starting as SECONDARY node');
      this.intentionalDisconnect = false;
      this.connectToPrimary();
    }
  }

  /**
   * Stop cluster mode
   */
  public async stop(): Promise<void> {
    console.log('[ClusterManager] Stopping cluster mode');

    // Mark as intentional disconnect to prevent reconnection
    this.intentionalDisconnect = true;

    // Cancel any pending debounced broadcasts
    this.debouncedBroadcast.cancel();

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Stop reconnect attempts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Disconnect client socket (secondary mode)
    if (this.clientSocket) {
      this.clientSocket.disconnect();
      this.clientSocket = null;
    }

    // Stop server (primary mode)
    await this.stopServer();

    // Clear nodes and pending states
    this.nodes.clear();
    this.clusterSockets.clear();
    this.pendingStates.clear();

    this.emit('stopped');
    this.sendToRenderer('cluster:disconnected');
  }

  /**
   * Stop the cluster server (primary mode)
   */
  private async stopServer(): Promise<void> {
    if (!this.serverRunning) return;

    return new Promise((resolve) => {
      console.log('[ClusterManager] Stopping cluster server...');

      // Close Socket.io
      if (this.io) {
        void this.io.close();
        this.io = null;
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[ClusterManager] Cluster server stopped');
          this.httpServer = null;
          this.serverRunning = false;
          resolve();
        });
      } else {
        this.serverRunning = false;
        resolve();
      }
    });
  }

  // ==================== Primary Node Functions ====================

  /**
   * Setup as primary node - starts the cluster server
   */
  private async setupPrimaryMode(): Promise<void> {
    const config = this.getConfig();

    // Start the cluster server
    await this.startServer(config.primaryPort);

    // Add local node to the cluster
    this.addLocalNode();
    this.emit('started', 'primary');
    this.sendToRenderer('cluster:connected');
    this.broadcastClusterState();
  }

  /**
   * Start the cluster server (primary mode)
   */
  private async startServer(port: number): Promise<void> {
    if (this.serverRunning) {
      console.log('[ClusterManager] Server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Create HTTP server with health check endpoint
        this.httpServer = createServer((req, res) => {
          if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                status: 'ok',
                service: 'claude-orchestra-cluster',
                nodeId: this.localNodeId,
                nodeName: this.getConfig().nodeName,
                role: 'primary',
                timestamp: Date.now(),
              })
            );
          } else {
            res.writeHead(404);
            res.end();
          }
        });

        // Create Socket.io server
        this.io = new SocketIOServer(this.httpServer, {
          cors: {
            origin: '*',
            methods: ['GET', 'POST'],
          },
          transports: ['websocket', 'polling'],
        });

        // Setup socket handlers
        this.setupServerSocketHandlers();

        // Start listening on all interfaces (0.0.0.0)
        this.httpServer.listen(port, '0.0.0.0', () => {
          this.serverRunning = true;
          const localIp = this.getLocalIpAddress();
          console.log(`[ClusterManager] Cluster server started on port ${port}`);
          console.log(`[ClusterManager] Listening on http://0.0.0.0:${port}`);
          console.log(
            `[ClusterManager] Local IP: ${localIp} - Secondary nodes should connect to http://${localIp}:${port}`
          );
          resolve();
        });

        this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
          console.error('[ClusterManager] Server error:', error);
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${port} is already in use`));
          } else {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Setup socket handlers for the cluster server (primary mode)
   */
  private setupServerSocketHandlers(): void {
    if (!this.io) return;

    // Authentication middleware
    this.io.use((socket, next) => {
      const auth = socket.handshake.auth as { nodeId?: string; sharedSecret?: string };
      const { nodeId, sharedSecret } = auth;

      console.log('[ClusterManager] Auth attempt from node:', nodeId);
      console.log('[ClusterManager] Received secret length:', sharedSecret?.length || 0);
      console.log(
        '[ClusterManager] Received secret (first 8 chars):',
        sharedSecret?.substring(0, 8) || 'none'
      );

      if (!nodeId || !sharedSecret) {
        console.log('[ClusterManager] Rejected: Missing nodeId or sharedSecret');
        next(new Error('Authentication required'));
        return;
      }

      // Verify shared secret - reload config to get latest
      this.loadConfig();
      const config = this.getConfig();

      console.log('[ClusterManager] Expected secret length:', config.sharedSecret?.length || 0);
      console.log(
        '[ClusterManager] Expected secret (first 8 chars):',
        config.sharedSecret?.substring(0, 8) || 'none'
      );

      if (config.role !== 'primary') {
        console.log('[ClusterManager] Rejected: This node is not primary, role is:', config.role);
        next(new Error('This node is not a primary node'));
        return;
      }

      // Use timing-safe comparison to prevent timing attacks
      if (!config.sharedSecret || !safeCompare(sharedSecret, config.sharedSecret)) {
        console.log('[ClusterManager] Rejected: Secret mismatch');
        console.log('[ClusterManager] Secrets match check:', sharedSecret === config.sharedSecret);
        next(new Error('Invalid shared secret'));
        return;
      }

      console.log('[ClusterManager] Auth successful for node:', nodeId);
      // Store node info on socket
      (socket as ServerSocket & { nodeId?: string }).nodeId = nodeId;
      next();
    });

    this.io.on('connection', (socket) => {
      const nodeId = (socket as ServerSocket & { nodeId?: string }).nodeId;
      console.log(`[ClusterManager] Node connected: ${nodeId}`);

      // Handle node registration
      socket.on('node:register', (request: NodeRegistrationRequest) => {
        const response = this.handleNodeRegistration(request, socket.id);

        if (response.success) {
          this.clusterSockets.set(socket.id, request.nodeId);
          socket.emit('node:registered', response);

          // Notify other nodes
          socket.broadcast.emit('node:joined', {
            id: request.nodeId,
            name: request.nodeName,
            host: socket.handshake.address,
            port: 0,
            status: 'online',
            role: 'secondary',
            projects: request.projects,
            instances: request.instances,
            lastSeen: Date.now(),
          } as ClusterNode);

          // Broadcast updated cluster state
          const state = this.getClusterState();
          this.io?.emit('cluster:state', state);
        } else {
          socket.emit('node:rejected', response.error || 'Registration failed');
        }
      });

      // Handle heartbeat - only update lastSeen, don't overwrite projects/instances
      socket.on('node:heartbeat', () => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          const node = this.nodes.get(connectedNodeId);
          if (node) {
            node.lastSeen = Date.now();
            // Don't broadcast on heartbeat to avoid unnecessary traffic
          }
        }
      });

      // Handle state updates from secondary nodes
      socket.on('state:update', (state) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          // handleNodeStateUpdate calls broadcastClusterState which emits to all nodes
          this.handleNodeStateUpdate(connectedNodeId, state);
        } else {
          // Node not yet registered - store pending state
          // Extract nodeId from handshake auth
          const nodeId = (socket.handshake.auth as { nodeId?: string }).nodeId;
          if (nodeId) {
            console.log(`[ClusterManager] Storing pending state for unregistered node: ${nodeId}`);
            this.pendingStates.set(nodeId, state);
          }
        }
      });

      // Handle instance events from secondary nodes
      socket.on('instance:output', (instanceId: string, data: StreamMessage) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('output', connectedNodeId, instanceId, data);
          socket.broadcast.emit('instance:output', instanceId, connectedNodeId, data);
        }
      });

      socket.on('instance:status', (instanceId: string, status: InstanceStatus) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('status', connectedNodeId, instanceId, status);
          socket.broadcast.emit('instance:status', instanceId, connectedNodeId, status);
        }
      });

      socket.on('instance:error', (instanceId: string, error: string) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('error', connectedNodeId, instanceId, error);
          socket.broadcast.emit('instance:error', instanceId, connectedNodeId, error);
        }
      });

      socket.on('instance:exit', (instanceId: string, code: number) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('exit', connectedNodeId, instanceId, code);
          socket.broadcast.emit('instance:exit', instanceId, connectedNodeId, code);
        }
      });

      socket.on('instance:rawOutput', (instanceId: string, data: string) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('rawOutput', connectedNodeId, instanceId, data);
          socket.broadcast.emit('instance:rawOutput', instanceId, connectedNodeId, data);
        }
      });

      socket.on('instance:sessionId', (instanceId: string, sessionId: string) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('sessionId', connectedNodeId, instanceId, sessionId);
          socket.broadcast.emit('instance:sessionId', instanceId, connectedNodeId, sessionId);
        }
      });

      socket.on('instance:terminalTitle', (instanceId: string, title: string) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('terminalTitle', connectedNodeId, instanceId, title);
          socket.broadcast.emit('instance:terminalTitle', instanceId, connectedNodeId, title);
        }
      });

      // Handle cross-node instance creation request from secondary nodes
      socket.on('instance:createRequest', (request: RemoteInstanceRequest) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          console.log(
            `[ClusterManager] Received createRequest from ${connectedNodeId} for node ${request.nodeId}`
          );

          // Route to the correct node
          if (request.nodeId === this.localNodeId) {
            // Create locally on primary
            const processManager = getProcessManager();
            processManager.createInstance({
              projectId: request.projectId,
              model: request.model,
              mode: request.mode,
              planMode: request.planMode,
            });
            // Update local node state and broadcast to all nodes
            this.updateLocalNodeState();
            this.broadcastClusterState();
          } else {
            // Forward to target secondary node
            this.sendClusterCommand(
              request.nodeId,
              'instance:create',
              request,
              Date.now().toString()
            );
          }
        }
      });

      // Handle resize request from secondary nodes (route to correct node)
      socket.on('instance:resizeRequest', (instanceId, nodeId, cols, rows) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          console.log(
            `[ClusterManager] Received resizeRequest from ${connectedNodeId} for node ${nodeId}`
          );

          if (nodeId === this.localNodeId) {
            // Resize locally on primary
            getProcessManager().resizeInstance(instanceId, cols, rows);
          } else {
            // Forward to target secondary node
            this.sendClusterCommand(nodeId, 'instance:resize', instanceId, cols, rows);
          }
        }
      });

      // Handle shell creation request from secondary nodes
      socket.on('shell:createRequest', (nodeId: string, projectId: string) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          console.log(
            `[ClusterManager] Received shell:createRequest from ${connectedNodeId} for node ${nodeId}`
          );

          if (nodeId === this.localNodeId) {
            // Create shell locally on primary
            const processManager = getProcessManager();
            processManager.createShellInstance(projectId);
          } else {
            // Forward to target secondary node
            this.sendClusterCommand(nodeId, 'shell:create', projectId, Date.now().toString());
          }
        }
      });

      // Handle permission change notifications from secondary nodes
      socket.on('permissions:updated', (event: ClusterPermissionChangeEvent) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          console.log(
            `[ClusterManager] Received permissions:updated from ${connectedNodeId}:`,
            event.type
          );
          // Broadcast to all nodes including the sender
          this.io?.emit('permissions:changed', event);
          // Update local renderer
          this.sendToRenderer('cluster:permissionsChanged', event);
        }
      });

      // Handle hook status events from secondary nodes
      socket.on('instance:hookStatus', (instanceId: string, data: HookStatusUpdate) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.handleRemoteInstanceEvent('hookStatus', connectedNodeId, instanceId, data);
          socket.broadcast.emit('instance:hookStatus', instanceId, connectedNodeId, data);
        }
      });

      // Handle hook activity events from secondary nodes
      socket.on('hook:activity', (data) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.sendToRenderer(IPC_CHANNELS.HOOK_ACTIVITY, data);
          socket.broadcast.emit('hook:activity', connectedNodeId, data);
        }
      });

      // Handle subagent started events from secondary nodes
      socket.on('subagent:started', (data) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.sendToRenderer(IPC_CHANNELS.SUBAGENT_STARTED, data.instanceId, data.subagent);
          socket.broadcast.emit('subagent:started', connectedNodeId, data);
        }
      });

      // Handle subagent completed events from secondary nodes
      socket.on('subagent:completed', (data) => {
        const connectedNodeId = this.clusterSockets.get(socket.id);
        if (connectedNodeId) {
          this.sendToRenderer(IPC_CHANNELS.SUBAGENT_COMPLETED, data.instanceId, data.subagent);
          socket.broadcast.emit('subagent:completed', connectedNodeId, data);
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        const disconnectedNodeId = this.clusterSockets.get(socket.id);
        console.log(`[ClusterManager] Node disconnected: ${disconnectedNodeId}`);

        if (disconnectedNodeId) {
          this.handleNodeDisconnection(disconnectedNodeId);
          this.clusterSockets.delete(socket.id);

          // Notify other nodes
          socket.broadcast.emit('node:left', disconnectedNodeId);

          // Broadcast updated cluster state
          const state = this.getClusterState();
          this.io?.emit('cluster:state', state);
        }
      });
    });

    // Listen for internal events to send commands to nodes
    this.on('instance:createRemote', (request: RemoteInstanceRequest) => {
      this.sendClusterCommand(request.nodeId, 'instance:create', request, Date.now().toString());
    });

    this.on('instance:killRemote', (instanceId: string, nodeId: string) => {
      this.sendClusterCommand(nodeId, 'instance:kill', instanceId);
    });

    this.on('instance:inputRemote', (instanceId: string, nodeId: string, input: string) => {
      this.sendClusterCommand(nodeId, 'instance:input', instanceId, input);
    });
  }

  /**
   * Send a command to a specific cluster node
   */
  private sendClusterCommand(nodeId: string, event: string, ...args: unknown[]): void {
    if (!this.io) return;

    // Find the socket for this node
    for (const [socketId, nId] of this.clusterSockets) {
      if (nId === nodeId) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit(event as keyof ClusterServerToClientEvents, ...(args as [never, never]));
        }
        break;
      }
    }
  }

  /**
   * Broadcast to all cluster nodes
   */
  public broadcastToCluster(event: string, ...args: unknown[]): void {
    if (this.io) {
      this.io.emit(event as keyof ClusterServerToClientEvents, ...(args as [never]));
    }
  }

  /**
   * Get the local network IP address
   */
  public getLocalIpAddress(): string {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const nets = interfaces[name];
      if (!nets) continue;
      for (const net of nets) {
        // Skip loopback and non-IPv4
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return 'localhost';
  }

  /**
   * Get server running status
   */
  public isServerRunning(): boolean {
    return this.serverRunning;
  }

  /**
   * Add local node to cluster
   */
  private addLocalNode(): void {
    const config = this.getConfig();
    const processManager = getProcessManager();

    const localNode: ClusterNode = {
      id: this.localNodeId,
      name: config.nodeName,
      host: 'localhost',
      port: config.primaryPort,
      status: 'online',
      role: config.role,
      projects: this.dataStore.getAllProjects(),
      instances: processManager.getAllInstances(),
      lastSeen: Date.now(),
    };

    this.nodes.set(this.localNodeId, localNode);
  }

  /**
   * Update local node state with current projects and instances
   */
  private updateLocalNodeState(): void {
    const localNode = this.nodes.get(this.localNodeId);
    if (localNode) {
      const processManager = getProcessManager();
      localNode.projects = this.dataStore.getAllProjects();
      localNode.instances = processManager.getAllInstances();
      localNode.lastSeen = Date.now();
    }
  }

  /**
   * Public method to refresh local node state
   * Called by StateSyncManager before getting global state
   */
  public refreshLocalNodeState(): void {
    this.updateLocalNodeState();
  }

  /**
   * Handle registration from a secondary node
   * Called by WebServer's cluster namespace
   */
  public handleNodeRegistration(
    request: NodeRegistrationRequest,
    _socketId: string
  ): NodeRegistrationResponse {
    const config = this.getConfig();

    // Verify shared secret
    if (request.sharedSecret !== config.sharedSecret) {
      console.log('[ClusterManager] Node registration rejected: invalid shared secret');
      return { success: false, error: 'Invalid shared secret' };
    }

    // Check if node already exists
    const existingNode = this.nodes.get(request.nodeId);

    // Check node limit (excluding reconnections of existing nodes)
    if (!existingNode && this.nodes.size >= MAX_NODES) {
      console.log(`[ClusterManager] Node registration rejected: max nodes (${MAX_NODES}) reached`);
      return { success: false, error: `Maximum number of nodes (${MAX_NODES}) reached` };
    }
    if (existingNode && request.nodeId !== this.localNodeId) {
      existingNode.status = 'online';
      existingNode.projects = request.projects;
      existingNode.instances = request.instances;
      existingNode.lastSeen = Date.now();
      console.log(`[ClusterManager] Node ${request.nodeName} reconnected`);
    } else {
      // Add new node
      const newNode: ClusterNode = {
        id: request.nodeId,
        name: request.nodeName,
        host: '', // Will be set by WebServer
        port: 0,
        status: 'online',
        role: 'secondary',
        projects: request.projects,
        instances: request.instances,
        lastSeen: Date.now(),
      };

      this.nodes.set(request.nodeId, newNode);
      console.log(`[ClusterManager] Node ${request.nodeName} joined the cluster`);
      this.emit('nodeJoined', newNode);
      this.sendToRenderer('cluster:nodeJoined', newNode);
    }

    // Process any pending state updates for this node
    const pendingState = this.pendingStates.get(request.nodeId);
    if (pendingState) {
      console.log(`[ClusterManager] Processing pending state for node: ${request.nodeId}`);
      this.handleNodeStateUpdate(request.nodeId, pendingState);
      this.pendingStates.delete(request.nodeId);
    }

    // Broadcast updated state
    this.broadcastClusterState();

    return {
      success: true,
      clusterState: this.getClusterState(),
    };
  }

  /**
   * Handle node disconnection
   * Called by WebServer's cluster namespace
   */
  public handleNodeDisconnection(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node && nodeId !== this.localNodeId) {
      node.status = 'offline';
      node.lastSeen = Date.now();
      console.log(`[ClusterManager] Node ${node.name} disconnected`);
      this.emit('nodeLeft', nodeId);
      this.sendToRenderer('cluster:nodeLeft', nodeId);
      this.broadcastClusterState();
    }
  }

  /**
   * Handle state update from a secondary node
   */
  public handleNodeStateUpdate(
    nodeId: string,
    state: { projects: Project[]; instances: ClaudeInstance[] }
  ): void {
    console.log(
      `[ClusterManager] handleNodeStateUpdate from ${nodeId}: ${state.projects.length} projects, ${state.instances.length} instances`
    );
    const node = this.nodes.get(nodeId);
    if (node) {
      node.projects = state.projects;
      node.instances = state.instances;
      node.lastSeen = Date.now();
      this.broadcastClusterState();
    } else {
      console.log(`[ClusterManager] Node ${nodeId} not found in nodes map`);
    }
  }

  /**
   * Handle instance event from a secondary node
   */
  public handleRemoteInstanceEvent(
    event: string,
    nodeId: string,
    instanceId: string,
    data: unknown
  ): void {
    // Forward to renderer
    switch (event) {
      case 'output':
        this.sendToRenderer('instance:output', instanceId, data);
        break;
      case 'status':
        this.sendToRenderer('instance:status', instanceId, data);
        break;
      case 'error':
        this.sendToRenderer('instance:error', instanceId, data);
        break;
      case 'exit':
        this.sendToRenderer('instance:exit', instanceId, data);
        break;
      case 'rawOutput':
        this.sendToRenderer('instance:rawOutput', instanceId, data);
        break;
      case 'sessionId':
        this.sendToRenderer('instance:sessionId', instanceId, data);
        break;
      case 'hookStatus':
        this.sendToRenderer(IPC_CHANNELS.INSTANCE_HOOK_STATUS, instanceId, data);
        break;
    }

    // Emit for other listeners
    this.emit(`instance:${event}`, instanceId, nodeId, data);
  }

  // ==================== Secondary Node Functions ====================

  /**
   * Connect to primary node
   */
  private connectToPrimary(): void {
    const config = this.getConfig();

    if (!config.primaryHost) {
      console.error('[ClusterManager] No primary host configured');
      return;
    }

    if (this.isConnecting) {
      console.log('[ClusterManager] Already connecting...');
      return;
    }

    this.isConnecting = true;
    this.intentionalDisconnect = false;

    try {
      const url = `http://${config.primaryHost}:${config.primaryPort}`;
      console.log(`[ClusterManager] Connecting to primary at ${url}`);
      console.log(`[ClusterManager] Using nodeId: ${this.localNodeId}`);
      console.log(`[ClusterManager] Using secret length: ${config.sharedSecret?.length || 0}`);
      console.log(
        `[ClusterManager] Using secret (first 8 chars): ${config.sharedSecret?.substring(0, 8) || 'none'}`
      );

      this.clientSocket = io(url, {
        transports: ['websocket', 'polling'],
        timeout: CONNECTION_TIMEOUT,
        auth: {
          nodeId: this.localNodeId,
          sharedSecret: config.sharedSecret,
        },
      });

      this.setupClientSocketListeners();
    } catch (error) {
      console.error('[ClusterManager] Failed to connect:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Setup client socket event listeners
   */
  private setupClientSocketListeners(): void {
    if (!this.clientSocket) return;

    this.clientSocket.on('connect', () => {
      console.log('[ClusterManager] Connected to primary');
      this.isConnecting = false;
      this.registerWithPrimary();
      this.startHeartbeat();
      this.emit('connected');
      this.sendToRenderer('cluster:connected');
    });

    this.clientSocket.on('disconnect', (reason) => {
      console.log(`[ClusterManager] Disconnected from primary: ${reason}`);
      this.stopHeartbeat();
      this.emit('disconnected', reason);
      this.sendToRenderer('cluster:disconnected');

      // Only schedule reconnect if disconnect was not intentional
      if (!this.intentionalDisconnect && reason !== 'io client disconnect') {
        this.scheduleReconnect();
      }
    });

    this.clientSocket.on('connect_error', (error) => {
      console.error('[ClusterManager] Connection error:', error.message);
      console.error('[ClusterManager] Error details:', {
        name: error.name,
        message: error.message,
        cause: (error as Error & { cause?: unknown }).cause,
        description: (error as Error & { description?: string }).description,
      });
      this.isConnecting = false;
      this.sendToRenderer('cluster:error', error.message);
      this.scheduleReconnect();
    });

    // Handle registration response
    this.clientSocket.on('node:registered', (response) => {
      if (response.success && response.clusterState) {
        this.updateClusterState(response.clusterState);
        console.log('[ClusterManager] Successfully registered with primary');

        // Ensure local node is in the nodes map and send initial state
        this.addLocalNode();
        // Send our current projects to the primary to ensure sync
        this.sendStateUpdate();
      }
    });

    this.clientSocket.on('node:rejected', (error) => {
      console.error('[ClusterManager] Registration rejected:', error);
      this.sendToRenderer('cluster:error', error);
      this.clientSocket?.disconnect();
    });

    // Handle cluster state updates
    this.clientSocket.on('cluster:state', (state) => {
      this.updateClusterState(state);
    });

    this.clientSocket.on('node:joined', (node) => {
      this.nodes.set(node.id, node);
      this.emit('nodeJoined', node);
      this.sendToRenderer('cluster:nodeJoined', node);
    });

    this.clientSocket.on('node:left', (nodeId) => {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.status = 'offline';
      }
      this.emit('nodeLeft', nodeId);
      this.sendToRenderer('cluster:nodeLeft', nodeId);
    });

    this.clientSocket.on('node:updated', (node) => {
      this.nodes.set(node.id, node);
      this.sendToRenderer('cluster:stateChanged', this.getClusterState());
    });

    // Handle commands from primary
    this.clientSocket.on('instance:create', (request, requestId) => {
      this.handleCreateInstanceCommand(request, requestId);
    });

    this.clientSocket.on('instance:kill', (instanceId) => {
      const processManager = getProcessManager();
      processManager.killInstance(instanceId);
    });

    this.clientSocket.on('instance:input', (instanceId, input) => {
      const processManager = getProcessManager();
      processManager.sendInput(instanceId, input);
    });

    this.clientSocket.on('instance:resize', (instanceId, cols, rows) => {
      const processManager = getProcessManager();
      processManager.resizeInstance(instanceId, cols, rows);
    });

    // Handle shell creation command from primary
    this.clientSocket.on('shell:create', (projectId, _requestId) => {
      console.log('[ClusterManager] Received shell:create command for project', projectId);
      const processManager = getProcessManager();
      processManager.createShellInstance(projectId);
      // Notify primary of state change
      this.sendStateUpdate();
    });

    // Handle forwarded instance events (from other nodes)
    this.clientSocket.on('instance:output', (instanceId, nodeId, data) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer('instance:output', instanceId, data);
      }
    });

    this.clientSocket.on('instance:status', (instanceId, nodeId, status) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer('instance:status', instanceId, status);
      }
    });

    this.clientSocket.on('instance:rawOutput', (instanceId, nodeId, data) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer('instance:rawOutput', instanceId, data);
      }
    });

    this.clientSocket.on('instance:error', (instanceId, nodeId, error) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer('instance:error', instanceId, error);
      }
    });

    this.clientSocket.on('instance:exit', (instanceId, nodeId, code) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer('instance:exit', instanceId, code);
      }
    });

    this.clientSocket.on('instance:sessionId', (instanceId, nodeId, sessionId) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer('instance:sessionId', instanceId, sessionId);
      }
    });

    this.clientSocket.on('instance:terminalTitle', (instanceId, nodeId, title) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer('instance:terminalTitle', instanceId, title);
      }
    });

    // Handle permission change notifications from primary
    this.clientSocket.on('permissions:changed', (event: ClusterPermissionChangeEvent) => {
      console.log('[ClusterManager] Received permissions:changed:', event.type);
      // Forward to renderer
      this.sendToRenderer('cluster:permissionsChanged', event);
      this.emit('permissionsChanged', event);
    });

    // Handle permission denied notifications
    this.clientSocket.on('permissions:denied', (action: string, reason: string) => {
      console.log(`[ClusterManager] Permission denied: ${action} - ${reason}`);
      this.sendToRenderer('cluster:permissionDenied', { action, reason });
    });

    // Handle forwarded hook status events from other nodes
    this.clientSocket.on('instance:hookStatus', (instanceId, nodeId, data) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer(IPC_CHANNELS.INSTANCE_HOOK_STATUS, instanceId, data);
      }
    });

    // Handle forwarded hook activity events from other nodes
    this.clientSocket.on('hook:activity', (nodeId, data) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer(IPC_CHANNELS.HOOK_ACTIVITY, data);
      }
    });

    // Handle forwarded subagent started events from other nodes
    this.clientSocket.on('subagent:started', (nodeId, data) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer(IPC_CHANNELS.SUBAGENT_STARTED, data.instanceId, data.subagent);
      }
    });

    // Handle forwarded subagent completed events from other nodes
    this.clientSocket.on('subagent:completed', (nodeId, data) => {
      if (nodeId !== this.localNodeId) {
        this.sendToRenderer(IPC_CHANNELS.SUBAGENT_COMPLETED, data.instanceId, data.subagent);
      }
    });
  }

  /**
   * Register with primary node
   */
  private registerWithPrimary(): void {
    if (!this.clientSocket) return;

    const config = this.getConfig();
    const processManager = getProcessManager();

    const request: NodeRegistrationRequest = {
      nodeId: this.localNodeId,
      nodeName: config.nodeName,
      sharedSecret: config.sharedSecret,
      projects: this.dataStore.getAllProjects(),
      instances: processManager.getAllInstances(),
    };

    this.clientSocket.emit('node:register', request);
  }

  /**
   * Handle create instance command from primary
   */
  private handleCreateInstanceCommand(request: RemoteInstanceRequest, _requestId: string): void {
    try {
      const processManager = getProcessManager();
      const instance = processManager.createInstance({
        projectId: request.projectId,
        model: request.model,
        mode: request.mode,
        planMode: request.planMode,
      });

      // Setup listeners to forward events to primary
      this.setupInstanceEventForwarding(instance.id);

      // Notify primary of state change
      this.sendStateUpdate();
    } catch (error) {
      console.error('[ClusterManager] Failed to create instance:', error);
    }
  }

  /**
   * Setup event forwarding for a local instance to primary
   */
  private setupInstanceEventForwarding(_instanceId: string): void {
    // Note: Event forwarding is handled in the ProcessManager via the existing
    // event system. When this node sends state updates, the instance events
    // are broadcast to all connected nodes via the WebServer's cluster namespace.
    // This method is a placeholder for future direct event hooking if needed.
  }

  /**
   * Send state update to primary
   */
  public sendStateUpdate(): void {
    if (!this.clientSocket?.connected) {
      console.log('[ClusterManager] sendStateUpdate: not connected to primary');
      return;
    }

    const processManager = getProcessManager();
    const projects = this.dataStore.getAllProjects();
    const instances = processManager.getAllInstances();
    console.log(
      `[ClusterManager] sendStateUpdate: ${projects.length} projects, ${instances.length} instances`
    );
    this.clientSocket.emit('state:update', {
      projects,
      instances,
    });
  }

  /**
   * Notify cluster of project changes (create/update/delete)
   * This should be called after any project operation to sync across nodes
   */
  public notifyProjectChange(): void {
    const config = this.getConfig();

    console.log(
      '[ClusterManager] notifyProjectChange called, enabled:',
      config.enabled,
      'role:',
      config.role
    );

    // If cluster is not enabled, nothing to do
    if (!config.enabled) {
      return;
    }

    // Update the local node in memory with fresh project data
    const localNode = this.nodes.get(this.localNodeId);
    if (localNode) {
      localNode.projects = this.dataStore.getAllProjects();
      console.log('[ClusterManager] Updated local node projects:', localNode.projects.length);
    }

    if (config.role === 'primary' && this.serverRunning) {
      // If primary, broadcast updated state to all connected nodes
      console.log(
        '[ClusterManager] Broadcasting as primary to',
        this.clusterSockets.size,
        'connected nodes'
      );
      this.broadcastClusterState();
    } else if (config.role === 'secondary' && this.clientSocket?.connected) {
      // If secondary, send state update to primary
      console.log('[ClusterManager] Sending state update as secondary');
      this.sendStateUpdate();
    }
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.clientSocket?.connected) {
        this.clientSocket.emit('node:heartbeat');
      }
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    const config = this.getConfig();
    if (!config.enabled || config.role !== 'secondary') return;

    console.log(`[ClusterManager] Scheduling reconnect in ${RECONNECT_INTERVAL}ms`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connectToPrimary();
    }, RECONNECT_INTERVAL);
  }

  // ==================== Common Functions ====================

  /**
   * Get current cluster state
   */
  public getClusterState(): ClusterState {
    // Increment version on each state request (for broadcasts)
    this.stateVersion++;
    return {
      nodes: Array.from(this.nodes.values()),
      localNodeId: this.localNodeId,
      version: this.stateVersion,
      timestamp: Date.now(),
    };
  }

  /**
   * Update cluster state from primary
   * Ignores states with version <= last received version to prevent race conditions
   */
  private updateClusterState(state: ClusterState): void {
    // Ignore older or same-version states (race condition prevention)
    if (state.version <= this.lastReceivedVersion) {
      console.log(
        `[ClusterManager] Ignoring stale state: received v${state.version}, already have v${this.lastReceivedVersion}`
      );
      return;
    }

    this.lastReceivedVersion = state.version;
    this.nodes.clear();
    state.nodes.forEach((node) => {
      this.nodes.set(node.id, node);
    });

    this.emit('stateChanged', state);
    this.sendToRenderer('cluster:stateChanged', state);
  }

  /**
   * Broadcast cluster state to all connected nodes and local renderer (debounced)
   * Multiple calls within BROADCAST_DEBOUNCE_MS will be coalesced
   */
  private broadcastClusterState(): void {
    this.debouncedBroadcast();
  }

  /**
   * Immediate broadcast without debouncing (called by debounced function)
   */
  private broadcastClusterStateImmediate(): void {
    const state = this.getClusterState();

    console.log('[ClusterManager] broadcastClusterState - nodes:', state.nodes.length);
    state.nodes.forEach((n) => {
      console.log(
        `  - Node ${n.name} (${n.id}): ${n.projects.length} projects, ${n.instances.length} instances`
      );
    });

    // Emit to all connected Socket.io clients (when acting as primary)
    if (this.io && this.serverRunning) {
      console.log('[ClusterManager] Emitting cluster:state to Socket.io clients');
      this.io.emit('cluster:state', state);
    }

    this.emit('stateChanged', state);
    this.sendToRenderer('cluster:stateChanged', state);
  }

  /**
   * Get all projects from all nodes (global view)
   * Filters out projects that are not shared with the cluster based on permissions
   */
  public getAllGlobalProjects(): GlobalProject[] {
    const globalProjects: GlobalProject[] = [];
    const validator = getClusterPermissionValidator();

    for (const node of this.nodes.values()) {
      for (const project of node.projects) {
        // For local projects, include all; for remote, check if shared
        const isLocal = node.id === this.localNodeId;
        if (isLocal || validator.shouldShareProject(project)) {
          globalProjects.push({
            ...project,
            nodeId: node.id,
            nodeName: node.name,
            isLocal,
          });
        }
      }
    }

    return globalProjects;
  }

  /**
   * Get all instances from all nodes (global view)
   * Filters out instances that are not shared with the cluster based on permissions
   */
  public getAllGlobalInstances(): GlobalInstance[] {
    const globalInstances: GlobalInstance[] = [];
    const validator = getClusterPermissionValidator();

    for (const node of this.nodes.values()) {
      for (const instance of node.instances) {
        // For local instances, include all; for remote, check if shared
        const isLocal = node.id === this.localNodeId;
        if (isLocal || validator.shouldShareInstance(instance.id, instance.projectId)) {
          globalInstances.push({
            ...instance,
            nodeId: node.id,
            nodeName: node.name,
            isLocal,
          });
        }
      }
    }

    return globalInstances;
  }

  /**
   * Create instance (routing to correct node)
   */
  public createInstance(request: RemoteInstanceRequest): ClaudeInstance | null {
    const config = this.getConfig();

    // If it's a local project or we're standalone
    if (request.nodeId === this.localNodeId || config.role === 'standalone') {
      const processManager = getProcessManager();
      return processManager.createInstance({
        projectId: request.projectId,
        model: request.model,
        mode: request.mode,
        planMode: request.planMode,
      });
    }

    // If we're primary, send command to secondary node
    if (config.role === 'primary') {
      // This will be handled by WebServer's cluster namespace
      this.emit('instance:createRemote', request);
      return null; // Instance will be created asynchronously
    }

    // If we're secondary and request is for another node, forward to primary
    if (config.role === 'secondary' && this.clientSocket?.connected) {
      // Send request to primary to route to correct node
      console.log(
        '[ClusterManager] Sending instance:createRequest to primary for node',
        request.nodeId
      );
      this.clientSocket.emit('instance:createRequest', request);
      return null; // Instance will be created asynchronously
    }

    console.warn('[ClusterManager] Cannot create instance: not connected to cluster');
    return null;
  }

  /**
   * Create shell on remote node (routing to correct node)
   */
  public createRemoteShell(nodeId: string, projectId: string): void {
    const config = this.getConfig();

    // If it's a local project or we're standalone, create locally
    if (nodeId === this.localNodeId || config.role === 'standalone') {
      const processManager = getProcessManager();
      processManager.createShellInstance(projectId);
      return;
    }

    // If we're primary, send command to secondary node
    if (config.role === 'primary' && this.serverRunning) {
      console.log('[ClusterManager] Sending shell:create to node', nodeId);
      this.sendClusterCommand(nodeId, 'shell:create', projectId, Date.now().toString());
      return;
    }

    // If we're secondary, forward request to primary
    if (config.role === 'secondary' && this.clientSocket?.connected) {
      console.log('[ClusterManager] Sending shell:createRequest to primary for node', nodeId);
      this.clientSocket.emit('shell:createRequest', nodeId, projectId);
      return;
    }

    console.warn('[ClusterManager] Cannot create remote shell: not connected to cluster');
  }

  /**
   * Send input to instance (routing to correct node)
   */
  public sendInput(instanceId: string, nodeId: string, input: string): void {
    if (nodeId === this.localNodeId) {
      const processManager = getProcessManager();
      processManager.sendInput(instanceId, input);
    } else {
      // Forward to correct node via WebServer
      this.emit('instance:inputRemote', instanceId, nodeId, input);
    }
  }

  /**
   * Kill instance (routing to correct node)
   */
  public killInstance(instanceId: string, nodeId: string): void {
    if (nodeId === this.localNodeId) {
      const processManager = getProcessManager();
      processManager.killInstance(instanceId);
    } else {
      // Forward to correct node via WebServer
      this.emit('instance:killRemote', instanceId, nodeId);
    }
  }

  /**
   * Resize instance (routing to correct node)
   */
  public resizeRemoteInstance(
    instanceId: string,
    nodeId: string,
    cols: number,
    rows: number
  ): void {
    const config = this.getConfig();

    // If it's a local instance, resize directly
    if (nodeId === this.localNodeId) {
      getProcessManager().resizeInstance(instanceId, cols, rows);
      return;
    }

    // If we're primary, send command to the target secondary node
    if (config.role === 'primary' && this.serverRunning) {
      this.sendClusterCommand(nodeId, 'instance:resize', instanceId, cols, rows);
      return;
    }

    // If we're secondary, ask primary to route the resize
    if (config.role === 'secondary' && this.clientSocket?.connected) {
      this.clientSocket.emit('instance:resizeRequest', instanceId, nodeId, cols, rows);
      return;
    }

    console.warn('[ClusterManager] Cannot resize instance: not connected to cluster');
  }

  /**
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  /**
   * Forward instance event to primary node for distribution
   * Called by ProcessManager when instance events occur on secondary nodes
   */
  public forwardInstanceEvent(event: string, instanceId: string, data: unknown): void {
    if (!this.clientSocket?.connected) {
      return;
    }

    // Emit the event to primary node
    switch (event) {
      case 'output':
        this.clientSocket.emit('instance:output', instanceId, data as StreamMessage);
        break;
      case 'status':
        this.clientSocket.emit('instance:status', instanceId, data as InstanceStatus);
        break;
      case 'error':
        this.clientSocket.emit('instance:error', instanceId, data as string);
        break;
      case 'exit':
        this.clientSocket.emit('instance:exit', instanceId, data as number);
        break;
      case 'rawOutput':
        this.clientSocket.emit('instance:rawOutput', instanceId, data as string);
        break;
      case 'sessionId':
        this.clientSocket.emit('instance:sessionId', instanceId, data as string);
        break;
      case 'terminalTitle':
        this.clientSocket.emit('instance:terminalTitle', instanceId, data as string);
        break;
      case 'hookStatus':
        this.clientSocket.emit('instance:hookStatus', instanceId, data as HookStatusUpdate);
        break;
      case 'hookActivity':
        this.clientSocket.emit(
          'hook:activity',
          data as { instanceId: string; toolName?: string; files?: string[]; timestamp: number }
        );
        break;
      case 'subagentStarted':
        this.clientSocket.emit('subagent:started', {
          instanceId,
          subagent: data as SubagentInstance,
        });
        break;
      case 'subagentCompleted':
        this.clientSocket.emit('subagent:completed', {
          instanceId,
          subagent: data as SubagentInstance,
        });
        break;
    }
  }

  /**
   * Notify cluster of permission changes
   * Broadcasts permission change event to all connected nodes
   */
  public notifyPermissionChange(event: ClusterPermissionChangeEvent): void {
    const config = this.getConfig();

    console.log('[ClusterManager] notifyPermissionChange:', event.type);

    // If cluster is not enabled, nothing to do
    if (!config.enabled) {
      return;
    }

    if (config.role === 'primary' && this.serverRunning && this.io) {
      // If primary, broadcast to all connected nodes
      this.io.emit('permissions:changed', event);
    } else if (config.role === 'secondary' && this.clientSocket?.connected) {
      // If secondary, notify primary
      this.clientSocket.emit('permissions:updated', event);
    }

    // Also emit locally for UI update
    this.emit('permissionsChanged', event);
    this.sendToRenderer('cluster:permissionsChanged', event);

    // Broadcast cluster state to reflect permission changes
    this.broadcastClusterState();
  }

  /**
   * Generate HMAC signature for authentication
   */
  public generateSignature(challenge: string, secret: string): string {
    return createHmac('sha256', secret).update(challenge).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  public verifySignature(challenge: string, signature: string, secret: string): boolean {
    const expected = this.generateSignature(challenge, secret);
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}

// Export singleton getter
export function getClusterManager(): ClusterManager {
  return ClusterManager.getInstance();
}
