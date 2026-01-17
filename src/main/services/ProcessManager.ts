import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { ClaudeInstance, ClaudeInstanceConfig } from './ClaudeInstance';
import { ShellInstance } from './ShellInstance';
import { DataStore } from './DataStore';
import { IPC_CHANNELS } from '../ipc/channels';
import type {
  ClaudeInstance as ClaudeInstanceType,
  ShellInstance as ShellInstanceType,
  ShellInstanceStatus,
  InstanceStatus,
  StreamMessage,
  ClaudeModel,
  InstanceMode,
} from '@shared/types';
import type { InstanceOutputBuffer } from '@shared/types/remote';

// Lazy import to avoid circular dependencies
let webServerModule: typeof import('./WebServer') | null = null;
async function getWebServerModule() {
  if (!webServerModule) {
    webServerModule = await import('./WebServer');
  }
  return webServerModule;
}

export class ProcessManager extends EventEmitter {
  private instances: Map<string, ClaudeInstance> = new Map();
  private shellInstances: Map<string, ShellInstance> = new Map();
  private shellOutputs: Map<string, string> = new Map(); // shellId -> raw output buffer
  private instanceConversations: Map<string, string> = new Map(); // instanceId -> conversationId
  private instanceOutputs: Map<string, InstanceOutputBuffer> = new Map(); // instanceId -> output buffer
  private dataStore: DataStore;
  private mainWindow: BrowserWindow | null = null;

  // Max raw output buffer size (to prevent memory issues)
  private static readonly MAX_RAW_OUTPUT_SIZE = 500000; // 500KB

  constructor() {
    super();
    this.dataStore = DataStore.getInstance();
  }

  /**
   * Set the conversation ID for an instance (used by web clients)
   */
  setInstanceConversation(instanceId: string, conversationId: string): void {
    this.instanceConversations.set(instanceId, conversationId);
  }

  /**
   * Get the conversation ID for an instance
   */
  getInstanceConversation(instanceId: string): string | undefined {
    return this.instanceConversations.get(instanceId);
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Create and start a new Claude instance
   */
  createInstance(
    config: Omit<ClaudeInstanceConfig, 'projectPath' | 'skipPermissions'>
  ): ClaudeInstanceType {
    // Get project from database
    const project = this.dataStore.getProjectById(config.projectId);
    if (!project) {
      throw new Error(`Project with id ${config.projectId} not found`);
    }

    const instance = new ClaudeInstance({
      ...config,
      projectPath: project.path,
      skipPermissions: project.skipPermissions,
    });

    this.setupInstanceListeners(instance);
    this.instances.set(instance.id, instance);

    // Start the instance
    instance.start();

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
      resumeSessionId: config.sessionId,
    });

    this.setupInstanceListeners(instance);
    this.instances.set(instance.id, instance);

    // Start the instance (will use --resume flag)
    instance.start();

    return instance.toJSON();
  }

  /**
   * Initialize output buffer for an instance
   */
  private initOutputBuffer(instanceId: string): void {
    if (!this.instanceOutputs.has(instanceId)) {
      this.instanceOutputs.set(instanceId, {
        messages: [],
        rawOutput: '',
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
   * Add raw output to buffer
   */
  private addToRawOutputBuffer(instanceId: string, data: string): void {
    const buffer = this.instanceOutputs.get(instanceId);
    if (buffer) {
      buffer.rawOutput += data;
      // Trim if too large (keep last part)
      if (buffer.rawOutput.length > ProcessManager.MAX_RAW_OUTPUT_SIZE) {
        buffer.rawOutput = buffer.rawOutput.slice(-ProcessManager.MAX_RAW_OUTPUT_SIZE);
      }
    }
  }

  /**
   * Get all instance outputs (for sync state)
   */
  getAllInstanceOutputs(): Record<string, InstanceOutputBuffer> {
    const result: Record<string, InstanceOutputBuffer> = {};
    this.instanceOutputs.forEach((buffer, instanceId) => {
      result[instanceId] = buffer;
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

      this.sendToRenderer(IPC_CHANNELS.INSTANCE_OUTPUT, instance.id, message);
      this.sendToWebServer('output', instance.id, message);

      // Persist message to conversation if linked (for web clients)
      const conversationId = this.instanceConversations.get(instance.id);
      if (conversationId) {
        this.dataStore.addMessage({
          conversationId,
          type: message.type,
          content: JSON.stringify(message),
          costUsd: message.cost_usd,
        });
      }
    });

    instance.on('status', (status: InstanceStatus) => {
      this.sendToRenderer(IPC_CHANNELS.INSTANCE_STATUS, instance.id, status);
      this.sendToWebServer('status', instance.id, status);

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
      this.sendToRenderer(IPC_CHANNELS.INSTANCE_ERROR, instance.id, error);
      this.sendToWebServer('error', instance.id, error);
    });

    instance.on('exit', (code: number) => {
      this.sendToRenderer(IPC_CHANNELS.INSTANCE_EXIT, instance.id, code);
      this.sendToWebServer('exit', instance.id, code);

      // Mark conversation as completed on exit
      const conversationId = this.instanceConversations.get(instance.id);
      if (conversationId) {
        this.dataStore.updateConversation(conversationId, { status: 'completed' });
      }

      // Clean up instance buffers after a short delay to allow final messages to be processed
      setTimeout(() => {
        this.cleanupInstance(instance.id);
      }, 5000);
    });

    instance.on('rawOutput', (data: string) => {
      // Store in buffer for late-connecting clients
      this.addToRawOutputBuffer(instance.id, data);

      this.sendToRenderer(IPC_CHANNELS.INSTANCE_RAW_OUTPUT, instance.id, data);
      this.sendToWebServer('rawOutput', instance.id, data);
    });

    instance.on('sessionId', (sessionId: string) => {
      this.sendToRenderer(IPC_CHANNELS.INSTANCE_SESSION_ID, instance.id, sessionId);
      this.sendToWebServer('sessionId', instance.id, sessionId);

      // Update conversation with sessionId if linked
      const conversationId = this.instanceConversations.get(instance.id);
      if (conversationId) {
        this.dataStore.updateConversation(conversationId, { sessionId });
      }
    });
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
   * Send message to web server for broadcasting to web clients
   */
  private sendToWebServer(event: string, instanceId: string, data: unknown): void {
    // Use dynamic import to avoid circular dependency
    getWebServerModule()
      .then(({ getWebServer }) => {
        const webServer = getWebServer();
        if (!webServer.running) return;

        switch (event) {
          case 'output':
            webServer.broadcastInstanceOutput(instanceId, data as StreamMessage);
            break;
          case 'status':
            webServer.broadcastInstanceStatus(instanceId, data as InstanceStatus);
            break;
          case 'error':
            webServer.broadcastInstanceError(instanceId, data as string);
            break;
          case 'exit':
            webServer.broadcastInstanceExit(instanceId, data as number);
            break;
          case 'rawOutput':
            webServer.broadcastInstanceRawOutput(instanceId, data as string);
            break;
          case 'sessionId':
            webServer.broadcastInstanceSessionId(instanceId, data as string);
            break;
        }
      })
      .catch(() => {
        // WebServer not available, ignore
      });
  }

  /**
   * Kill an instance
   */
  killInstance(id: string): void {
    const instance = this.instances.get(id);
    if (instance) {
      instance.kill();
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
    shell.on('data', (data: string) => {
      // Store in buffer
      let buffer = this.shellOutputs.get(shell.id) || '';
      buffer += data;
      // Trim if too large
      if (buffer.length > ProcessManager.MAX_RAW_OUTPUT_SIZE) {
        buffer = buffer.slice(-ProcessManager.MAX_RAW_OUTPUT_SIZE);
      }
      this.shellOutputs.set(shell.id, buffer);

      this.sendToRenderer(IPC_CHANNELS.SHELL_RAW_OUTPUT, shell.id, data);
    });

    shell.on('status', (status: ShellInstanceStatus) => {
      this.sendToRenderer(IPC_CHANNELS.SHELL_STATUS, shell.id, status);
    });

    shell.on('exit', (code: number) => {
      this.sendToRenderer(IPC_CHANNELS.SHELL_EXIT, shell.id, code);

      // Clean up after a short delay
      setTimeout(() => {
        this.shellInstances.delete(shell.id);
        this.shellOutputs.delete(shell.id);
      }, 5000);
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
    this.instances.delete(id);
    this.instanceOutputs.delete(id);
    this.instanceConversations.delete(id);
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
}

// Singleton instance
let processManager: ProcessManager | null = null;

export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager();
  }
  return processManager;
}
