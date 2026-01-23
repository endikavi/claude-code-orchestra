import { EventEmitter } from 'events';
import { ClaudeInstance, ClaudeInstanceConfig } from './ClaudeInstance';
import { ShellInstance } from './ShellInstance';
import { DataStore } from './DataStore';
import { getInstanceBroadcaster, type InstanceEventType } from './InstanceBroadcaster';
import { getClusterPermissionValidator } from './ClusterPermissionValidator';
import { getTerminalPool } from './TerminalPool';
import type {
  ClaudeInstance as ClaudeInstanceType,
  ShellInstance as ShellInstanceType,
  ShellInstanceStatus,
  InstanceStatus,
  StreamMessage,
  ClaudeModel,
  InstanceMode,
} from '@shared/types';
import type { SubagentInstance } from '@shared/types/orchestration';
import type { InstanceOutputBuffer } from '@shared/types/remote';

// Internal buffer type using array for better performance (avoids repeated string concatenation)
interface InternalOutputBuffer {
  messages: StreamMessage[];
  rawOutputChunks: string[];
  rawOutputLength: number;
}
import type { InstanceClusterPermissions } from '@shared/types/cluster';

// BrowserWindow type for optional Electron dependency
type BrowserWindowType = import('electron').BrowserWindow;

// Lazy import to avoid circular dependencies
let fileLockManagerModule: typeof import('./FileLockManager.js') | null = null;
async function getFileLockManagerModule() {
  if (!fileLockManagerModule) {
    fileLockManagerModule = await import('./FileLockManager.js');
  }
  return fileLockManagerModule;
}

export class ProcessManager extends EventEmitter {
  private instances: Map<string, ClaudeInstance> = new Map();
  private shellInstances: Map<string, ShellInstance> = new Map();
  private shellOutputs: Map<string, string> = new Map(); // shellId -> raw output buffer
  private instanceConversations: Map<string, string> = new Map(); // instanceId -> conversationId
  private instanceOutputs: Map<string, InternalOutputBuffer> = new Map(); // instanceId -> output buffer
  private pendingSessionIds: Map<string, string> = new Map(); // instanceId -> sessionId (for race condition fix)
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map(); // instanceId -> cleanup timer
  private dataStore: DataStore;
  private mainWindow: BrowserWindowType | null = null;

  // Max raw output buffer size (to prevent memory issues)
  private static readonly MAX_RAW_OUTPUT_SIZE = 500000; // 500KB
  // Delay before auto-cleaning up exited instances (allows UI to show completion status)
  private static readonly CLEANUP_DELAY_MS = 60000; // 1 minute

  constructor() {
    super();
    this.dataStore = DataStore.getInstance();
  }

  /**
   * Set the conversation ID for an instance (used by web clients)
   */
  setInstanceConversation(instanceId: string, conversationId: string): void {
    this.instanceConversations.set(instanceId, conversationId);

    // Check if there's a pending sessionId that arrived before this mapping was set (race condition fix)
    const pendingSessionId = this.pendingSessionIds.get(instanceId);
    if (pendingSessionId) {
      console.log(
        `[ProcessManager] Applying pending sessionId for instance ${instanceId}: ${pendingSessionId}`
      );
      this.dataStore.updateConversation(conversationId, { sessionId: pendingSessionId });
      this.pendingSessionIds.delete(instanceId);
    }
  }

  /**
   * Get the conversation ID for an instance
   */
  getInstanceConversation(instanceId: string): string | undefined {
    return this.instanceConversations.get(instanceId);
  }

  /**
   * Store a pending sessionId for an instance (used by API route when hook sends sessionId)
   * This handles the race condition where the sessionId arrives before the conversation mapping is set
   */
  setPendingSessionId(instanceId: string, sessionId: string): void {
    this.pendingSessionIds.set(instanceId, sessionId);
    console.log(
      `[ProcessManager] Stored pending sessionId for instance ${instanceId}: ${sessionId}`
    );
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindowType): void {
    this.mainWindow = window;
    // Also set on broadcaster
    getInstanceBroadcaster().setMainWindow(window);
  }

  /**
   * Create and start a new Claude instance
   * @param config Instance configuration
   * @param isLocal Whether this is a local request (true) or remote/cluster request (false)
   *                Terminal pool is ONLY used for local requests for security
   */
  createInstance(
    config: Omit<ClaudeInstanceConfig, 'projectPath' | 'skipPermissions'>,
    isLocal: boolean = true
  ): ClaudeInstanceType {
    // Get project from database
    const project = this.dataStore.getProjectById(config.projectId);
    if (!project) {
      throw new Error(`Project with id ${config.projectId} not found`);
    }

    console.log(
      `[ProcessManager] Creating instance for project ${project.name}, enableMcp=${project.enableMcp}, isLocal=${isLocal}`
    );

    // SECURITY: Only use terminal pool for LOCAL requests
    // Remote/cluster requests MUST use direct spawn
    let pooledTerminal = undefined;
    if (isLocal) {
      try {
        pooledTerminal = getTerminalPool().acquire() ?? undefined;
        if (pooledTerminal) {
          console.log(`[ProcessManager] Acquired pooled terminal ${pooledTerminal.id}`);
        }
      } catch (error) {
        // Pool not initialized or disabled - fall back to direct spawn
        console.log(`[ProcessManager] Pool not available, using direct spawn:`, error);
      }
    }

    const instance = new ClaudeInstance({
      projectId: config.projectId,
      projectPath: project.path,
      model: config.model,
      mode: config.mode,
      prompt: config.prompt,
      skipPermissions: project.skipPermissions,
      enableMcp: project.enableMcp,
      resumeSessionId: config.resumeSessionId,
      planMode: config.planMode,
      pooledTerminal,
    });

    this.setupInstanceListeners(instance);
    this.instances.set(instance.id, instance);

    // Set default cluster permissions for this instance
    this.dataStore.setInstanceClusterPermissions(instance.id, {
      shareWithCluster: true,
      allowRemoteInput: true,
    });

    // Start the instance
    instance.start();

    // Notify web clients of state change
    this.broadcastStateUpdate();
    this.emit('instanceCreated', instance.id);

    return instance.toJSON();
  }

  /**
   * Resume an existing Claude session
   */
  resumeInstance(config: {
    projectId: string;
    sessionId: string;
    model: ClaudeModel;
    mode: InstanceMode;
  }): ClaudeInstanceType {
    // Get project from database
    const project = this.dataStore.getProjectById(config.projectId);
    if (!project) {
      throw new Error(`Project with id ${config.projectId} not found`);
    }

    const instance = new ClaudeInstance({
      projectId: config.projectId,
      projectPath: project.path,
      model: config.model,
      mode: config.mode,
      skipPermissions: project.skipPermissions,
      enableMcp: project.enableMcp,
      resumeSessionId: config.sessionId,
    });

    this.setupInstanceListeners(instance);
    this.instances.set(instance.id, instance);

    // Start the instance (will use --resume flag)
    instance.start();

    // Notify web clients of state change
    this.broadcastStateUpdate();
    this.emit('instanceCreated', instance.id);

    return instance.toJSON();
  }

  /**
   * Initialize output buffer for an instance
   */
  private initOutputBuffer(instanceId: string): void {
    if (!this.instanceOutputs.has(instanceId)) {
      this.instanceOutputs.set(instanceId, {
        messages: [],
        rawOutputChunks: [],
        rawOutputLength: 0,
      });
    }
  }

  /**
   * Add message to output buffer
   */
  private addToOutputBuffer(instanceId: string, message: StreamMessage): void {
    const buffer = this.instanceOutputs.get(instanceId);
    if (buffer) {
      buffer.messages.push(message);
    }
  }

  /**
   * Add raw output to buffer using array-based buffering
   * Reduces GC pressure by avoiding repeated string concatenation
   */
  private addToRawOutputBuffer(instanceId: string, data: string): void {
    const buffer = this.instanceOutputs.get(instanceId);
    if (buffer) {
      buffer.rawOutputChunks.push(data);
      buffer.rawOutputLength += data.length;

      // Compact only when exceeds threshold (1.5x max size)
      // This amortizes the cost of joining strings
      if (buffer.rawOutputLength > ProcessManager.MAX_RAW_OUTPUT_SIZE * 1.5) {
        const combined = buffer.rawOutputChunks.join('');
        buffer.rawOutputChunks = [combined.slice(-ProcessManager.MAX_RAW_OUTPUT_SIZE)];
        buffer.rawOutputLength = buffer.rawOutputChunks[0].length;
      }
    }
  }

  /**
   * Get all instance outputs (for sync state)
   * Converts internal array-based buffer to string format for external API
   */
  getAllInstanceOutputs(): Record<string, InstanceOutputBuffer> {
    const result: Record<string, InstanceOutputBuffer> = {};
    this.instanceOutputs.forEach((buffer, instanceId) => {
      result[instanceId] = {
        messages: buffer.messages,
        rawOutput: buffer.rawOutputChunks.join(''),
      };
    });
    return result;
  }

  /**
   * Get all instance-conversation mappings (for sync state)
   */
  getAllInstanceConversations(): Record<string, string> {
    const result: Record<string, string> = {};
    this.instanceConversations.forEach((conversationId, instanceId) => {
      result[instanceId] = conversationId;
    });
    return result;
  }

  /**
   * Setup event listeners for an instance
   */
  private setupInstanceListeners(instance: ClaudeInstance): void {
    // Initialize output buffer
    this.initOutputBuffer(instance.id);

    instance.on('output', (message: StreamMessage) => {
      // Store in buffer for late-connecting clients
      this.addToOutputBuffer(instance.id, message);

      // Persist message to conversation if linked (for web clients)
      // Persist BEFORE broadcasting to ensure data consistency
      const conversationId = this.instanceConversations.get(instance.id);
      if (conversationId) {
        try {
          this.dataStore.addMessage({
            conversationId,
            type: message.type,
            content: JSON.stringify(message),
            costUsd: message.cost_usd,
          });
        } catch (error) {
          console.error(
            `[ProcessManager] Failed to persist message for conversation ${conversationId}:`,
            error
          );
          this.emit('persistenceError', instance.id, message, error);
        }
      }

      // Broadcast to all destinations after persistence
      this.broadcastInstanceEvent('output', instance.id, message);
    });

    instance.on('status', (status: InstanceStatus) => {
      // Broadcast to all destinations
      this.broadcastInstanceEvent('status', instance.id, status);

      // Update conversation status if linked
      const conversationId = this.instanceConversations.get(instance.id);
      if (conversationId) {
        const convStatus =
          status === 'completed' || status === 'error' || status === 'killed'
            ? 'completed'
            : 'active';
        this.dataStore.updateConversation(conversationId, { status: convStatus });
      }
    });

    instance.on('error', (error: string) => {
      this.broadcastInstanceEvent('error', instance.id, error);
    });

    instance.on('exit', (code: number) => {
      // Broadcast to all destinations
      this.broadcastInstanceEvent('exit', instance.id, code);

      // Mark conversation as completed on exit
      const conversationId = this.instanceConversations.get(instance.id);
      if (conversationId) {
        this.dataStore.updateConversation(conversationId, { status: 'completed' });
      }

      // Clean up file locks for this instance
      getFileLockManagerModule()
        .then((module) => {
          const fileLockManager = module.getFileLockManager();
          fileLockManager.cleanupInstance(instance.id);
        })
        .catch((error) => {
          console.error('[ProcessManager] Failed to cleanup file locks:', error);
        });

      // Remove event listeners but schedule delayed cleanup
      // This allows the UI to show completion status before removing the instance
      instance.removeAllListeners();
      this.scheduleCleanup(instance.id);
    });

    instance.on('rawOutput', (data: string) => {
      // Store in buffer for late-connecting clients
      this.addToRawOutputBuffer(instance.id, data);

      // Broadcast to all destinations
      this.broadcastInstanceEvent('rawOutput', instance.id, data);
    });

    instance.on('sessionId', (sessionId: string) => {
      // Broadcast to all destinations
      this.broadcastInstanceEvent('sessionId', instance.id, sessionId);

      // Update conversation with sessionId if linked
      const conversationId = this.instanceConversations.get(instance.id);
      if (conversationId) {
        this.dataStore.updateConversation(conversationId, { sessionId });
      } else {
        // Store sessionId for later - conversation mapping may not exist yet (race condition fix)
        this.pendingSessionIds.set(instance.id, sessionId);
        console.log(
          `[ProcessManager] Stored pending sessionId for instance ${instance.id}: ${sessionId}`
        );
      }
    });

    // Subagent events (native Claude Task tool)
    instance.on('subagent:started', (data: { instanceId: string; subagent: SubagentInstance }) => {
      console.log(
        `[ProcessManager] Received subagent:started for instance ${data.instanceId}, subagent ${data.subagent.id}`
      );
      this.broadcastInstanceEvent('subagentStarted', data.instanceId, data.subagent);
    });

    instance.on(
      'subagent:completed',
      (data: { instanceId: string; subagent: SubagentInstance }) => {
        console.log(
          `[ProcessManager] Received subagent:completed for instance ${data.instanceId}, subagent ${data.subagent.id}`
        );
        this.broadcastInstanceEvent('subagentCompleted', data.instanceId, data.subagent);
      }
    );
  }

  /**
   * Broadcast an instance event to all destinations (renderer, webserver, cluster)
   * Delegates to InstanceBroadcaster for centralized broadcasting
   */
  private broadcastInstanceEvent(
    event: InstanceEventType,
    instanceId: string,
    data: unknown
  ): void {
    getInstanceBroadcaster().broadcastInstanceEvent(event, instanceId, data);
  }

  /**
   * Send message to renderer process (for local-only events)
   */
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    getInstanceBroadcaster().sendToRenderer(channel, ...args);
  }

  /**
   * Broadcast state update to all clients (web and renderer)
   */
  private broadcastStateUpdate(): void {
    // Send to renderer process
    this.syncToRenderer();
    // Send to web clients
    getInstanceBroadcaster().broadcastStateUpdate();
  }

  /**
   * Sync instance state to renderer process
   */
  private syncToRenderer(): void {
    const instances = this.getAllInstances();
    getInstanceBroadcaster().syncInstancesToRenderer(instances);
  }

  /**
   * Kill an instance
   */
  killInstance(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.kill();
      // Notify web clients of state change
      this.broadcastStateUpdate();
    }
  }

  /**
   * Send input to an instance
   */
  sendInput(id: string, input: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.sendInput(input);
    }
  }

  /**
   * Set terminal title for an instance and broadcast to all clients
   */
  setInstanceTitle(id: string, title: string): void {
    this.broadcastInstanceEvent('terminalTitle', id, title);
  }

  /**
   * Resize an instance terminal
   */
  resizeInstance(id: string, cols: number, rows: number): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.resize(cols, rows);
    }
  }

  /**
   * Get all instances
   */
  getAllInstances(): ClaudeInstanceType[] {
    return Array.from(this.instances.values()).map((i) => i.toJSON());
  }

  /**
   * Get instances for a specific project
   */
  getInstancesByProject(projectId: string): ClaudeInstanceType[] {
    return Array.from(this.instances.values())
      .filter((i) => i.projectId === projectId)
      .map((i) => i.toJSON());
  }

  /**
   * Get a specific instance
   */
  getInstance(id: string): ClaudeInstanceType | null {
    const instance = this.instances.get(id);
    return instance ? instance.toJSON() : null;
  }

  /**
   * Kill all instances for a project
   */
  killProjectInstances(projectId: string): void {
    for (const instance of this.instances.values()) {
      if (instance.projectId === projectId) {
        instance.kill();
      }
    }
    // Also kill shell instances for the project
    for (const shell of this.shellInstances.values()) {
      if (shell.projectId === projectId) {
        shell.kill();
      }
    }
  }

  // ==================== Shell Instance Methods ====================

  /**
   * Create and start a new shell instance
   */
  createShellInstance(projectId: string): ShellInstanceType {
    // Get project from database
    const project = this.dataStore.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project with id ${projectId} not found`);
    }

    const shell = new ShellInstance({
      projectId,
      projectPath: project.path,
      preferredShell: project.preferredShell,
    });

    this.setupShellListeners(shell);
    this.shellInstances.set(shell.id, shell);
    this.shellOutputs.set(shell.id, '');

    // Start the shell
    shell.start();

    return shell.toJSON();
  }

  /**
   * Setup event listeners for a shell instance
   */
  private setupShellListeners(shell: ShellInstance): void {
    const broadcaster = getInstanceBroadcaster();

    shell.on('data', (data: string) => {
      // Store in buffer
      let buffer = this.shellOutputs.get(shell.id) || '';
      buffer += data;
      // Trim if too large
      if (buffer.length > ProcessManager.MAX_RAW_OUTPUT_SIZE) {
        buffer = buffer.slice(-ProcessManager.MAX_RAW_OUTPUT_SIZE);
      }
      this.shellOutputs.set(shell.id, buffer);

      broadcaster.sendShellEvent('data', shell.id, data);
    });

    shell.on('status', (status: ShellInstanceStatus) => {
      broadcaster.sendShellEvent('status', shell.id, status);
    });

    shell.on('exit', (code: number) => {
      broadcaster.sendShellEvent('exit', shell.id, code);

      // Clean up shell listeners and buffers immediately
      shell.removeAllListeners();
      this.shellInstances.delete(shell.id);
      this.shellOutputs.delete(shell.id);
    });

    shell.on('error', (error: string) => {
      console.error(`Shell ${shell.id} error:`, error);
    });
  }

  /**
   * Kill a shell instance
   */
  killShellInstance(id: string): void {
    const shell = this.shellInstances.get(id);
    if (shell) {
      shell.kill();
    }
  }

  /**
   * Send input to a shell instance
   */
  sendShellInput(id: string, input: string): void {
    const shell = this.shellInstances.get(id);
    if (shell) {
      shell.sendInput(input);
    }
  }

  /**
   * Resize a shell instance terminal
   */
  resizeShellInstance(id: string, cols: number, rows: number): void {
    const shell = this.shellInstances.get(id);
    if (shell) {
      shell.resize(cols, rows);
    }
  }

  /**
   * Get all shell instances
   */
  getAllShellInstances(): ShellInstanceType[] {
    return Array.from(this.shellInstances.values()).map((s) => s.toJSON());
  }

  /**
   * Get shell instances for a specific project
   */
  getShellInstancesByProject(projectId: string): ShellInstanceType[] {
    return Array.from(this.shellInstances.values())
      .filter((s) => s.projectId === projectId)
      .map((s) => s.toJSON());
  }

  /**
   * Get shell output buffer for an instance
   */
  getShellOutput(id: string): string {
    return this.shellOutputs.get(id) || '';
  }

  /**
   * Kill all instances
   */
  killAll(): void {
    // Cancel all pending cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();

    // Kill all instances
    for (const instance of this.instances.values()) {
      instance.kill();
    }
    for (const shell of this.shellInstances.values()) {
      shell.kill();
    }
  }

  /**
   * Clean up completed/killed instances and their associated buffers
   */
  cleanup(): void {
    for (const [id, instance] of this.instances.entries()) {
      if (!instance.isRunning) {
        this.instances.delete(id);
        this.instanceOutputs.delete(id);
        this.instanceConversations.delete(id);
        this.pendingSessionIds.delete(id);
      }
    }
    for (const [id, shell] of this.shellInstances.entries()) {
      if (!shell.isRunning) {
        this.shellInstances.delete(id);
        this.shellOutputs.delete(id);
      }
    }
  }

  /**
   * Clean up a specific instance and its associated data
   */
  private cleanupInstance(id: string): void {
    // Cancel any pending cleanup timer
    const timer = this.cleanupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(id);
    }

    this.instances.delete(id);
    this.instanceOutputs.delete(id);
    this.instanceConversations.delete(id);
    this.pendingSessionIds.delete(id);
    // Clean up cluster permissions for this instance
    this.dataStore.deleteInstanceClusterPermissions(id);
    this.emit('instanceRemoved', id);
  }

  /**
   * Schedule delayed cleanup for an instance
   * This allows the UI to show completion status before removing the instance
   */
  private scheduleCleanup(instanceId: string): void {
    // Cancel any existing timer for this instance
    const existingTimer = this.cleanupTimers.get(instanceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.cleanupTimers.delete(instanceId);
      // Only cleanup if instance is no longer running
      const instance = this.instances.get(instanceId);
      if (instance && !instance.isRunning) {
        console.log(`[ProcessManager] Auto-cleaning up instance ${instanceId} after delay`);
        this.cleanupInstance(instanceId);
        this.broadcastStateUpdate();
      }
    }, ProcessManager.CLEANUP_DELAY_MS);

    this.cleanupTimers.set(instanceId, timer);
  }

  /**
   * Get count of running instances
   */
  getRunningCount(): number {
    let count = 0;
    for (const instance of this.instances.values()) {
      if (instance.isRunning) {
        count++;
      }
    }
    return count;
  }

  // ==================== Cluster Permission Methods ====================

  /**
   * Send input to an instance from a remote node
   * Validates permissions before sending
   * @returns true if input was sent, false if denied
   */
  sendRemoteInput(instanceId: string, input: string, sourceNodeId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.log(`[ProcessManager] sendRemoteInput: instance ${instanceId} not found`);
      return false;
    }

    const validator = getClusterPermissionValidator();
    const config = this.dataStore.getClusterConfig();

    // Validate permission
    const check = validator.validateAction('send_input', sourceNodeId, config.nodeId, instanceId);

    if (!check.allowed) {
      console.log(
        `[ProcessManager] sendRemoteInput denied for instance ${instanceId}: ${check.reason}`
      );
      return false;
    }

    // Permission granted, send input
    instance.sendInput(input);
    return true;
  }

  /**
   * Get cluster permissions for an instance
   */
  getInstanceClusterPermissions(instanceId: string): InstanceClusterPermissions {
    return this.dataStore.getInstanceClusterPermissions(instanceId);
  }

  /**
   * Update cluster permissions for an instance
   */
  setInstanceClusterPermissions(
    instanceId: string,
    perms: Partial<InstanceClusterPermissions>
  ): InstanceClusterPermissions {
    return this.dataStore.setInstanceClusterPermissions(instanceId, perms);
  }
}

// Singleton instance
let processManager: ProcessManager | null = null;

export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager();
  }
  return processManager;
}
