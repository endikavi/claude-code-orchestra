import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';
import { createHmac, timingSafeEqual } from 'crypto';
import { BrowserWindow } from 'electron';

import { DataStore } from './DataStore';
import { getProcessManager } from './ProcessManager';
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
} from '@shared/types/cluster';
import type { Project, ClaudeInstance } from '@shared/types';

// Heartbeat interval in milliseconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const RECONNECT_INTERVAL = 5000; // 5 seconds
const CONNECTION_TIMEOUT = 10000; // 10 seconds

export class ClusterManager extends EventEmitter {
  private static instance: ClusterManager | null = null;

  private dataStore: DataStore;
  private mainWindow: BrowserWindow | null = null;

  // State
  private nodes: Map<string, ClusterNode> = new Map();
  private localNodeId: string = '';
  private config: ClusterConfig | null = null;

  // Client socket (when acting as secondary)
  private clientSocket: Socket<ClusterServerToClientEvents, ClusterClientToServerEvents> | null =
    null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting: boolean = false;

  // Server-side state is managed by WebServer's cluster namespace

  private constructor() {
    super();
    this.dataStore = DataStore.getInstance();
    this.loadConfig();
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
  public setMainWindow(window: BrowserWindow): void {
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
      return true; // Primary is always "connected"
    }
    if (config.role === 'secondary') {
      return this.clientSocket?.connected ?? false;
    }
    return false;
  }

  /**
   * Start cluster mode
   */
  public start(): Promise<void> {
    const config = this.getConfig();

    if (!config.enabled) {
      console.log('[ClusterManager] Cluster mode is disabled');
      return Promise.resolve();
    }

    if (config.role === 'primary') {
      console.log('[ClusterManager] Starting as PRIMARY node');
      this.setupPrimaryMode();
    } else if (config.role === 'secondary') {
      console.log('[ClusterManager] Starting as SECONDARY node');
      this.connectToPrimary();
    }

    return Promise.resolve();
  }

  /**
   * Stop cluster mode
   */
  public stop(): void {
    console.log('[ClusterManager] Stopping cluster mode');

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

    // Disconnect client socket
    if (this.clientSocket) {
      this.clientSocket.disconnect();
      this.clientSocket = null;
    }

    // Clear nodes
    this.nodes.clear();

    this.emit('stopped');
    this.sendToRenderer('cluster:disconnected');
  }

  // ==================== Primary Node Functions ====================

  /**
   * Setup as primary node
   */
  private setupPrimaryMode(): void {
    // Add local node to the cluster
    this.addLocalNode();
    this.emit('started', 'primary');
    this.sendToRenderer('cluster:connected');
    this.broadcastClusterState();
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
    const node = this.nodes.get(nodeId);
    if (node) {
      node.projects = state.projects;
      node.instances = state.instances;
      node.lastSeen = Date.now();
      this.broadcastClusterState();
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

    try {
      const url = `http://${config.primaryHost}:${config.primaryPort}`;
      console.log(`[ClusterManager] Connecting to primary at ${url}`);

      this.clientSocket = io(url, {
        path: '/cluster',
        transports: ['websocket'],
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

      if (reason !== 'io client disconnect') {
        this.scheduleReconnect();
      }
    });

    this.clientSocket.on('connect_error', (error) => {
      console.error('[ClusterManager] Connection error:', error.message);
      this.isConnecting = false;
      this.sendToRenderer('cluster:error', error.message);
      this.scheduleReconnect();
    });

    // Handle registration response
    this.clientSocket.on('node:registered', (response) => {
      if (response.success && response.clusterState) {
        this.updateClusterState(response.clusterState);
        console.log('[ClusterManager] Successfully registered with primary');
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
    if (!this.clientSocket?.connected) return;

    const processManager = getProcessManager();
    this.clientSocket.emit('state:update', {
      projects: this.dataStore.getAllProjects(),
      instances: processManager.getAllInstances(),
    });
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
    return {
      nodes: Array.from(this.nodes.values()),
      localNodeId: this.localNodeId,
    };
  }

  /**
   * Update cluster state from primary
   */
  private updateClusterState(state: ClusterState): void {
    this.nodes.clear();
    state.nodes.forEach((node) => {
      this.nodes.set(node.id, node);
    });

    this.emit('stateChanged', state);
    this.sendToRenderer('cluster:stateChanged', state);
  }

  /**
   * Broadcast cluster state to all connected nodes (primary only)
   */
  private broadcastClusterState(): void {
    const state = this.getClusterState();
    this.emit('stateChanged', state);
    this.sendToRenderer('cluster:stateChanged', state);
  }

  /**
   * Get all projects from all nodes (global view)
   */
  public getAllGlobalProjects(): GlobalProject[] {
    const globalProjects: GlobalProject[] = [];

    for (const node of this.nodes.values()) {
      for (const project of node.projects) {
        globalProjects.push({
          ...project,
          nodeId: node.id,
          nodeName: node.name,
          isLocal: node.id === this.localNodeId,
        });
      }
    }

    return globalProjects;
  }

  /**
   * Get all instances from all nodes (global view)
   */
  public getAllGlobalInstances(): GlobalInstance[] {
    const globalInstances: GlobalInstance[] = [];

    for (const node of this.nodes.values()) {
      for (const instance of node.instances) {
        globalInstances.push({
          ...instance,
          nodeId: node.id,
          nodeName: node.name,
          isLocal: node.id === this.localNodeId,
        });
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
      // Request primary to route to correct node
      // For now, this is not implemented - would need additional protocol
      console.warn('[ClusterManager] Cross-node instance creation not yet implemented');
      return null;
    }

    return null;
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
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
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
