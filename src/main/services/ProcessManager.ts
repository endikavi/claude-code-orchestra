import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { ClaudeInstance, ClaudeInstanceConfig } from './ClaudeInstance';
import { ShellInstance } from './ShellInstance';
import { DataStore } from './DataStore';
import { getInstanceBroadcaster, type InstanceEventType } from './InstanceBroadcaster';
import { getClusterPermissionValidator } from './ClusterPermissionValidator';
import { getTerminalPool } from './TerminalPool';
import { getTerminalDimensionManager } from './TerminalDimensionManager';
import { UISettingsStore } from './UISettingsStore';
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
import type { TrackedTask } from '@shared/types/tasks';
import type { TeamSpawnEvent, TeamMessageEvent } from '@shared/types/teams';
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

// Pending instance config (for deferred structured view flow)
interface PendingInstanceConfig {
  projectId: string;
  model: ClaudeModel;
  mode: InstanceMode;
  planMode?: boolean;
  verbose?: boolean;
  skipPermissions?: boolean;
  enableMcp?: boolean;
  agentFile?: string;
  agents?: import('@shared/types').CustomAgentsConfig;
  additionalDirs?: string[];
  useAgentsFlag?: boolean;
  usePermissionPromptTool?: boolean;
}

export class ProcessManager extends EventEmitter {
  private instances: Map<string, ClaudeInstance> = new Map();
  private shellInstances: Map<string, ShellInstance> = new Map();
  private shellOutputs: Map<string, string> = new Map(); // shellId -> raw output buffer
  private instanceConversations: Map<string, string> = new Map(); // instanceId -> conversationId
  private instanceOutputs: Map<string, InternalOutputBuffer> = new Map(); // instanceId -> output buffer
  private pendingSessionIds: Map<string, string> = new Map(); // instanceId -> sessionId (for race condition fix)
  private cleanupTimers: Map<string, NodeJS.Timeout> = new Map(); // instanceId -> cleanup timer
  private pendingInstances: Map<string, PendingInstanceConfig> = new Map(); // instanceId -> config (for deferred flow)
  private dataStore: DataStore;
  private mainWindow: BrowserWindowType | null = null;

  // Max raw output buffer size (to prevent memory issues)
  private static readonly MAX_RAW_OUTPUT_SIZE = 500000; // 500KB
  // Max number of structured messages per instance (to prevent memory bloat)
  private static readonly MAX_MESSAGE_COUNT = 1000;
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
  }

  /**
   * Set the session ID on an instance and start its watchers
   * Called from the /session-id API endpoint when the SessionStart hook fires
   */
  setInstanceSessionId(instanceId: string, sessionId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      console.log(`[ProcessManager] Instance ${instanceId} not found for setSessionId`);
      return false;
    }

    instance.setSessionId(sessionId);
    return true;
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
    config: Omit<ClaudeInstanceConfig, 'projectPath'> & { skipPermissions?: boolean },
    isLocal: boolean = true
  ): ClaudeInstanceType {
    // Get project from database
    const project = this.dataStore.getProjectById(config.projectId);
    if (!project) {
      throw new Error(`Project with id ${config.projectId} not found`);
    }

    // SECURITY: Only use terminal pool for LOCAL requests
    // Remote/cluster requests MUST use direct spawn
    let pooledTerminal = undefined;
    if (isLocal) {
      try {
        pooledTerminal = getTerminalPool().acquire() ?? undefined;
      } catch {
        // Pool not initialized or disabled - fall back to direct spawn
      }
    }

    // Check for agent files in project directory (orchestration instructions)
    // Priority: 1) provided agentFile, 2) claude-code-orchestrator in .claude/agents/, 3) legacy AGENT.md
    let agentFile = config.agentFile;
    if (!agentFile) {
      // Check for standard agent in .claude/agents/
      const orchestratorPath = path.join(
        project.path,
        '.claude',
        'agents',
        'claude-code-orchestrator.md'
      );
      if (fs.existsSync(orchestratorPath)) {
        agentFile = 'claude-code-orchestrator'; // Use agent name, not path
      } else {
        // Fall back to legacy AGENT.md
        const agentMdPath = path.join(project.path, 'AGENT.md');
        if (fs.existsSync(agentMdPath)) {
          agentFile = agentMdPath;
        }
      }
    }

    // skipPermissions: use instance config if provided, otherwise fall back to project setting
    // But only if project allows skipPermissions - instance cannot enable it if project doesn't allow
    const effectiveSkipPermissions = project.skipPermissions
      ? (config.skipPermissions ?? project.skipPermissions)
      : false;

    // Read tmuxMode from UI settings (persisted per-user)
    const uiSettings = UISettingsStore.getInstance().getSettings();

    const instance = new ClaudeInstance({
      projectId: config.projectId,
      projectPath: project.path,
      model: config.model,
      mode: config.mode,
      prompt: config.prompt,
      skipPermissions: effectiveSkipPermissions,
      verbose: config.verbose,
      enableMcp: project.enableMcp,
      resumeSessionId: config.resumeSessionId,
      planMode: config.planMode,
      pooledTerminal,
      agentFile,
      agents: config.agents || project.agents, // Custom agents from config or project
      additionalDirs: config.additionalDirs ?? project.additionalDirs, // Additional directories from config or project
      useAgentsFlag: project.agentDeliveryMethod === 'args', // Use --agents flag if project configured for args delivery
      isHidden: config.isHidden,
      ralphTaskId: config.ralphTaskId,
      usePermissionPromptTool: config.usePermissionPromptTool, // Enable MCP permission prompt for structured view
      tmuxMode: uiSettings.tmuxMode, // Spawn inside tmux if user enabled the setting
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
    prompt?: string; // Optional prompt to send when resuming
  }): ClaudeInstanceType {
    // Get project from database
    const project = this.dataStore.getProjectById(config.projectId);
    if (!project) {
      throw new Error(`Project with id ${config.projectId} not found`);
    }

    // Check for agent files in project directory (orchestration instructions)
    // Priority: 1) claude-code-orchestrator in .claude/agents/, 2) legacy AGENT.md
    let agentFile: string | undefined;
    const orchestratorPath = path.join(
      project.path,
      '.claude',
      'agents',
      'claude-code-orchestrator.md'
    );
    if (fs.existsSync(orchestratorPath)) {
      agentFile = 'claude-code-orchestrator'; // Use agent name, not path
    } else {
      const agentMdPath = path.join(project.path, 'AGENT.md');
      if (fs.existsSync(agentMdPath)) {
        agentFile = agentMdPath;
      }
    }

    const resumeUiSettings = UISettingsStore.getInstance().getSettings();

    const instance = new ClaudeInstance({
      projectId: config.projectId,
      projectPath: project.path,
      model: config.model,
      mode: config.mode,
      skipPermissions: project.skipPermissions,
      enableMcp: project.enableMcp,
      resumeSessionId: config.sessionId,
      prompt: config.prompt, // Pass prompt to use with -r session "prompt"
      agentFile,
      agents: project.agents, // Custom agents from project settings
      additionalDirs: project.additionalDirs, // Additional directories from project
      useAgentsFlag: project.agentDeliveryMethod === 'args', // Use --agents flag if project configured
      tmuxMode: resumeUiSettings.tmuxMode, // Spawn inside tmux if user enabled the setting
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
   * Create a pending instance without starting the Claude process.
   * Used for structured view deferred flow where user types the first message.
   */
  createPendingInstance(
    config: Omit<
      PendingInstanceConfig,
      'enableMcp' | 'useAgentsFlag' | 'additionalDirs' | 'agents'
    > & {
      skipPermissions?: boolean;
    }
  ): ClaudeInstanceType {
    // Get project from database
    const project = this.dataStore.getProjectById(config.projectId);
    if (!project) {
      throw new Error(`Project with id ${config.projectId} not found`);
    }

    // Generate a unique instance ID
    const instanceId = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Check for agent files in project directory
    // Priority: 1) provided agentFile, 2) claude-code-orchestrator in .claude/agents/, 3) legacy AGENT.md
    let agentFile = config.agentFile;
    if (!agentFile) {
      const orchestratorPath = path.join(
        project.path,
        '.claude',
        'agents',
        'claude-code-orchestrator.md'
      );
      if (fs.existsSync(orchestratorPath)) {
        agentFile = 'claude-code-orchestrator'; // Use agent name, not path
      } else {
        const agentMdPath = path.join(project.path, 'AGENT.md');
        if (fs.existsSync(agentMdPath)) {
          agentFile = agentMdPath;
        }
      }
    }

    // Store the config for later activation
    const pendingConfig: PendingInstanceConfig = {
      projectId: config.projectId,
      model: config.model,
      mode: config.mode,
      planMode: config.planMode,
      verbose: config.verbose,
      skipPermissions: project.skipPermissions
        ? (config.skipPermissions ?? project.skipPermissions)
        : false,
      enableMcp: project.enableMcp,
      agentFile,
      agents: project.agents,
      additionalDirs: project.additionalDirs,
      useAgentsFlag: project.agentDeliveryMethod === 'args',
      usePermissionPromptTool: config.usePermissionPromptTool,
    };

    this.pendingInstances.set(instanceId, pendingConfig);

    // Initialize output buffer
    this.initOutputBuffer(instanceId);

    // Set default cluster permissions
    this.dataStore.setInstanceClusterPermissions(instanceId, {
      shareWithCluster: true,
      allowRemoteInput: true,
    });

    // Create a placeholder instance object (not a real ClaudeInstance)
    const pendingInstance: ClaudeInstanceType = {
      id: instanceId,
      projectId: config.projectId,
      model: config.model,
      mode: config.mode,
      planMode: config.planMode,
      status: 'pending',
      createdAt: Date.now(),
    };

    // Notify web clients of state change
    this.broadcastStateUpdate();
    this.emit('instanceCreated', instanceId);

    return pendingInstance;
  }

  /**
   * Activate a pending instance by starting the Claude process with the given prompt.
   * @param id The pending instance ID
   * @param prompt The first user message to send to Claude
   * @returns The activated instance
   */
  activatePendingInstance(id: string, prompt: string): ClaudeInstanceType {
    const config = this.pendingInstances.get(id);
    if (!config) {
      throw new Error(`Pending instance with id ${id} not found`);
    }

    // Get project from database
    const project = this.dataStore.getProjectById(config.projectId);
    if (!project) {
      throw new Error(`Project with id ${config.projectId} not found`);
    }

    // Create the actual ClaudeInstance with the prompt
    const instance = new ClaudeInstance({
      projectId: config.projectId,
      projectPath: project.path,
      model: config.model,
      mode: config.mode,
      prompt: prompt, // The first user message
      skipPermissions: config.skipPermissions,
      verbose: config.verbose,
      enableMcp: config.enableMcp,
      planMode: config.planMode,
      agentFile: config.agentFile,
      agents: config.agents,
      additionalDirs: config.additionalDirs,
      useAgentsFlag: config.useAgentsFlag,
      usePermissionPromptTool: config.usePermissionPromptTool,
    });

    // Remove from pending
    this.pendingInstances.delete(id);

    // We need to use the same ID to maintain continuity
    // The ClaudeInstance generates its own ID, so we need to swap it
    // Actually, let's just create a new instance and transfer the data
    this.setupInstanceListeners(instance);
    this.instances.set(instance.id, instance);

    // Transfer the output buffer from pending to real instance
    const pendingBuffer = this.instanceOutputs.get(id);
    if (pendingBuffer) {
      this.instanceOutputs.set(instance.id, pendingBuffer);
      this.instanceOutputs.delete(id);
    }

    // Transfer conversation mapping if exists
    const conversationId = this.instanceConversations.get(id);
    if (conversationId) {
      this.instanceConversations.set(instance.id, conversationId);
      this.instanceConversations.delete(id);
    }

    // Transfer cluster permissions
    const oldPermissions = this.dataStore.getInstanceClusterPermissions(id);
    this.dataStore.deleteInstanceClusterPermissions(id);
    this.dataStore.setInstanceClusterPermissions(instance.id, oldPermissions);

    // Start the instance
    instance.start();

    // Notify web clients of state change
    this.broadcastStateUpdate();

    return instance.toJSON();
  }

  /**
   * Check if an instance is pending (not yet activated)
   */
  isPendingInstance(id: string): boolean {
    return this.pendingInstances.has(id);
  }

  /**
   * Get a pending instance config
   */
  getPendingInstanceConfig(id: string): PendingInstanceConfig | undefined {
    return this.pendingInstances.get(id);
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
   * Add message to output buffer (with limit to prevent memory bloat)
   */
  private addToOutputBuffer(instanceId: string, message: StreamMessage): void {
    const buffer = this.instanceOutputs.get(instanceId);
    if (buffer) {
      buffer.messages.push(message);

      // Enforce max message count by removing oldest messages
      if (buffer.messages.length > ProcessManager.MAX_MESSAGE_COUNT) {
        buffer.messages.splice(0, buffer.messages.length - ProcessManager.MAX_MESSAGE_COUNT);
      }
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
      // Capture instance ID before cleanup (in case it's needed after listeners are removed)
      const instanceId = instance.id;

      // Broadcast to all destinations
      this.broadcastInstanceEvent('exit', instanceId, code);

      // Emit for Ralph Task Loop and other listeners
      console.log(
        `[ProcessManager] Emitting instanceExited: instanceId=${instanceId}, code=${code}`
      );
      this.emit('instanceExited', instanceId, code);

      // Mark conversation as completed on exit
      const conversationId = this.instanceConversations.get(instanceId);
      if (conversationId) {
        this.dataStore.updateConversation(conversationId, { status: 'completed' });
      }

      // Schedule delayed cleanup to allow UI to show completion status
      // Use setImmediate to ensure all pending events in the current tick are processed
      // before removing listeners, preventing race conditions with in-flight events
      setImmediate(() => {
        // Remove listeners first to prevent any further event processing
        instance.removeAllListeners();

        // Clean up file locks (async, but doesn't need instance listeners)
        getFileLockManagerModule()
          .then((module) => {
            const fileLockManager = module.getFileLockManager();
            fileLockManager.cleanupInstance(instanceId);
          })
          .catch((error) => {
            console.error(
              `[ProcessManager] Failed to cleanup file locks for ${instanceId}:`,
              error
            );
          });

        // Schedule instance removal
        this.scheduleCleanup(instanceId);
      });
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
      }
    });

    // Subagent events (native Claude Task tool)
    instance.on('subagent:started', (data: { instanceId: string; subagent: SubagentInstance }) => {
      this.broadcastInstanceEvent('subagentStarted', data.instanceId, data.subagent);
    });

    instance.on(
      'subagent:completed',
      (data: { instanceId: string; subagent: SubagentInstance }) => {
        this.broadcastInstanceEvent('subagentCompleted', data.instanceId, data.subagent);
      }
    );

    // Task events (Claude Code TaskCreate/TaskUpdate/TaskList tools)
    instance.on('task:created', (data: { instanceId: string; task: TrackedTask }) => {
      this.broadcastInstanceEvent('taskCreated', data.instanceId, data.task);
    });

    instance.on('task:updated', (data: { instanceId: string; task: TrackedTask }) => {
      this.broadcastInstanceEvent('taskUpdated', data.instanceId, data.task);
    });

    instance.on('task:list', (data: { instanceId: string; tasks: TrackedTask[] }) => {
      this.broadcastInstanceEvent('taskList', data.instanceId, data.tasks);
    });

    // Team events (Teammate/SendMessage tools)
    instance.on('team:spawn_detected', (data: TeamSpawnEvent & { instanceId: string }) => {
      // Team spawn events are tracked via TeamFileWatcher watching the filesystem
      // This event is useful for associating teams with their parent instance
      this.emit('team:spawn_detected', data);
    });

    instance.on('team:message_detected', (data: TeamMessageEvent & { instanceId: string }) => {
      // Team message events for tracking inter-agent communication
      this.emit('team:message_detected', data);
    });
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
   * Kill an instance (graceful by default, force if specified)
   * @param id Instance ID
   * @param force If true, force kill immediately; if false, use graceful kill
   */
  async killInstance(id: string, force: boolean = false): Promise<void> {
    const instance = this.instances.get(id);
    if (instance) {
      if (force) {
        instance.kill();
      } else {
        await instance.gracefulKill();
      }
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
   * Send a JSON-formatted user message to an instance (for stream-json mode)
   * This is the proper way to send user input in non-interactive JSON mode
   */
  sendJsonMessage(id: string, message: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.sendJsonMessage(message);
    }
  }

  /**
   * Check if an instance uses JSON input format
   */
  instanceUsesJsonInput(id: string): boolean {
    const instance = this.instances.get(id);
    return instance ? instance.usesJsonInput() : false;
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
   * Force a terminal repaint for an instance using experimental methods
   * Used to fix visual glitches in Claude Code TUI
   * @param id Instance ID
   * @param method Repaint method: 'fake-resize' triggers SIGWINCH, 'ansi-clear' sends ANSI sequences
   * @returns true if instance was found and repaint was triggered
   */
  forceRepaintInstance(id: string, method: 'fake-resize' | 'ansi-clear'): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      return false;
    }
    instance.forceRepaint(method);
    return true;
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
   * Kill all instances for a project (graceful by default, force if specified)
   * @param projectId Project ID
   * @param force If true, force kill immediately; if false, use graceful kill
   */
  async killProjectInstances(projectId: string, force: boolean = false): Promise<void> {
    const killPromises: Promise<void>[] = [];

    for (const instance of this.instances.values()) {
      if (instance.projectId === projectId) {
        if (force) {
          instance.kill();
        } else {
          killPromises.push(instance.gracefulKill());
        }
      }
    }

    // Wait for graceful kills to complete
    if (killPromises.length > 0) {
      await Promise.all(killPromises);
    }

    // Also kill shell instances for the project (shells don't need graceful kill)
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
   * Kill all instances (graceful by default, force if specified)
   * @param force If true, force kill immediately; if false, use graceful kill
   */
  async killAll(force: boolean = false): Promise<void> {
    // Cancel all pending cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();

    // Kill all Claude instances
    if (force) {
      for (const instance of this.instances.values()) {
        instance.kill();
      }
    } else {
      const killPromises: Promise<void>[] = [];
      for (const instance of this.instances.values()) {
        killPromises.push(instance.gracefulKill());
      }
      await Promise.all(killPromises);
    }

    // Kill all shell instances (shells don't need graceful kill)
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
    // Clean up terminal dimension tracking for this instance
    getTerminalDimensionManager().cleanup(id);
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
      return false;
    }

    const validator = getClusterPermissionValidator();
    const config = this.dataStore.getClusterConfig();

    // Validate permission
    const check = validator.validateAction('send_input', sourceNodeId, config.nodeId, instanceId);

    if (!check.allowed) {
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
