import { IPC_CHANNELS } from '../ipc/channels';
import type {
  StreamMessage,
  InstanceStatus,
  ShellInstanceStatus,
  TrackedTask,
} from '@shared/types';
import type { SubagentInstance } from '@shared/types/orchestration';
import type { HookStatusUpdate } from '@shared/types/remote';
import type {
  SharedInstanceContext,
  ProjectSharedKnowledge,
  ContextUpdateEvent,
} from '@shared/types/sharedContext';

// BrowserWindow type for optional Electron dependency
type BrowserWindowType = import('electron').BrowserWindow;

// Lazy import to avoid circular dependencies
let webServerModule: typeof import('./WebServer.js') | null = null;
async function getWebServerModule() {
  if (!webServerModule) {
    webServerModule = await import('./WebServer.js');
  }
  return webServerModule;
}

let clusterManagerModule: typeof import('./ClusterManager.js') | null = null;
async function getClusterManagerModule() {
  if (!clusterManagerModule) {
    clusterManagerModule = await import('./ClusterManager.js');
  }
  return clusterManagerModule;
}

let clusterPermissionValidatorModule: typeof import('./ClusterPermissionValidator.js') | null =
  null;
async function getClusterPermissionValidatorModule() {
  if (!clusterPermissionValidatorModule) {
    clusterPermissionValidatorModule = await import('./ClusterPermissionValidator.js');
  }
  return clusterPermissionValidatorModule;
}

let dataStoreModule: typeof import('./DataStore.js') | null = null;
async function getDataStoreModule() {
  if (!dataStoreModule) {
    dataStoreModule = await import('./DataStore.js');
  }
  return dataStoreModule;
}

export type InstanceEventType =
  | 'output'
  | 'status'
  | 'error'
  | 'exit'
  | 'rawOutput'
  | 'sessionId'
  | 'terminalTitle'
  | 'subagentStarted'
  | 'subagentCompleted'
  | 'taskCreated'
  | 'taskUpdated'
  | 'taskList'
  | 'hookStatus'
  | 'hookActivity'
  | 'contextInstanceUpdated'
  | 'contextKnowledgeUpdated'
  | 'contextUpdated';

/**
 * Handles broadcasting instance events to all destinations:
 * - Renderer process (via IPC)
 * - Web server (for remote clients)
 * - Cluster (for multi-node setups)
 */
export class InstanceBroadcaster {
  private mainWindow: BrowserWindowType | null = null;

  private static instance: InstanceBroadcaster | null = null;

  // Batching buffers for high-frequency raw output events
  private rawOutputBuffers: Map<string, string[]> = new Map();
  private flushScheduled = false;

  private constructor() {}

  public static getInstance(): InstanceBroadcaster {
    if (!InstanceBroadcaster.instance) {
      InstanceBroadcaster.instance = new InstanceBroadcaster();
    }
    return InstanceBroadcaster.instance;
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindowType): void {
    this.mainWindow = window;
  }

  /**
   * Map event types to IPC channels
   */
  private getChannel(event: InstanceEventType): string | null {
    const channelMap: Record<InstanceEventType, string> = {
      output: IPC_CHANNELS.INSTANCE_OUTPUT,
      status: IPC_CHANNELS.INSTANCE_STATUS,
      error: IPC_CHANNELS.INSTANCE_ERROR,
      exit: IPC_CHANNELS.INSTANCE_EXIT,
      rawOutput: IPC_CHANNELS.INSTANCE_RAW_OUTPUT,
      sessionId: IPC_CHANNELS.INSTANCE_SESSION_ID,
      terminalTitle: IPC_CHANNELS.INSTANCE_TERMINAL_TITLE,
      subagentStarted: IPC_CHANNELS.SUBAGENT_STARTED,
      subagentCompleted: IPC_CHANNELS.SUBAGENT_COMPLETED,
      taskCreated: IPC_CHANNELS.TASK_CREATED,
      taskUpdated: IPC_CHANNELS.TASK_UPDATED,
      taskList: IPC_CHANNELS.TASK_LIST,
      hookStatus: IPC_CHANNELS.INSTANCE_HOOK_STATUS,
      hookActivity: IPC_CHANNELS.HOOK_ACTIVITY,
      contextInstanceUpdated: IPC_CHANNELS.CONTEXT_INSTANCE_UPDATED,
      contextKnowledgeUpdated: IPC_CHANNELS.CONTEXT_KNOWLEDGE_UPDATED,
      contextUpdated: IPC_CHANNELS.CONTEXT_UPDATED,
    };
    return channelMap[event] || null;
  }

  /**
   * Broadcast an instance event to all destinations (renderer, webserver, cluster)
   * For high-frequency events like rawOutput, uses batching to reduce IPC overhead
   */
  broadcastInstanceEvent(event: InstanceEventType, instanceId: string, data: unknown): void {
    // Use batching for high-frequency raw output events
    if (event === 'rawOutput') {
      this.bufferRawOutput(instanceId, data as string);
      return;
    }

    const channel = this.getChannel(event);
    if (channel) {
      this.sendToRenderer(channel, instanceId, data);
    }
    this.sendToWebServer(event, instanceId, data);
    this.sendToCluster(event, instanceId, data);
  }

  /**
   * Buffer raw output data for batched sending
   * Uses setImmediate to flush buffers after current I/O cycle
   */
  private bufferRawOutput(instanceId: string, data: string): void {
    let buffer = this.rawOutputBuffers.get(instanceId);
    if (!buffer) {
      buffer = [];
      this.rawOutputBuffers.set(instanceId, buffer);
    }
    buffer.push(data);

    if (!this.flushScheduled) {
      this.flushScheduled = true;
      setImmediate(() => this.flushRawOutputBuffers());
    }
  }

  /**
   * Flush all buffered raw output to destinations
   */
  private flushRawOutputBuffers(): void {
    this.flushScheduled = false;

    for (const [instanceId, chunks] of this.rawOutputBuffers.entries()) {
      if (chunks.length === 0) continue;

      // Join all buffered chunks into one
      const batchedData = chunks.join('');
      this.rawOutputBuffers.set(instanceId, []);

      // Send the batched data
      const channel = this.getChannel('rawOutput');
      if (channel) {
        this.sendToRenderer(channel, instanceId, batchedData);
      }
      this.sendToWebServer('rawOutput', instanceId, batchedData);
      this.sendToCluster('rawOutput', instanceId, batchedData);
    }
  }

  /**
   * Send message to renderer process
   */
  sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  /**
   * Send message to web server for broadcasting to web clients
   */
  private sendToWebServer(event: string, instanceId: string, data: unknown): void {
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
          case 'terminalTitle':
            webServer.broadcastInstanceTerminalTitle(instanceId, data as string);
            break;
          case 'subagentStarted':
            webServer.broadcastSubagentStarted(instanceId, data as SubagentInstance);
            break;
          case 'subagentCompleted':
            webServer.broadcastSubagentCompleted(instanceId, data as SubagentInstance);
            break;
          case 'taskCreated':
            webServer.broadcastTaskCreated(instanceId, data as TrackedTask);
            break;
          case 'taskUpdated':
            webServer.broadcastTaskUpdated(instanceId, data as TrackedTask);
            break;
          case 'taskList':
            webServer.broadcastTaskList(instanceId, data as TrackedTask[]);
            break;
          case 'hookStatus':
            webServer.broadcastInstanceHookStatus(instanceId, data as HookStatusUpdate);
            break;
          case 'hookActivity':
            webServer.broadcastHookActivity(
              data as {
                instanceId: string;
                toolName?: string;
                files?: string[];
                timestamp: number;
              }
            );
            break;
        }
      })
      .catch(() => {
        // WebServer not available, ignore
      });
  }

  /**
   * Send instance events to cluster for distribution to other nodes
   * Checks permissions before sending to ensure privacy settings are respected
   */
  private sendToCluster(event: string, instanceId: string, data: unknown): void {
    Promise.all([
      getClusterManagerModule(),
      getClusterPermissionValidatorModule(),
      getDataStoreModule(),
    ])
      .then(([{ getClusterManager }, { getClusterPermissionValidator }, { DataStore }]) => {
        const clusterManager = getClusterManager();
        const config = clusterManager.getConfig();

        // Only forward events if we're a secondary node connected to primary
        if (config.role !== 'secondary' || !clusterManager.isConnected()) {
          return;
        }

        // Check if this instance should be shared with cluster
        const validator = getClusterPermissionValidator();
        const dataStore = DataStore.getInstance();

        // Get the instance's project ID from the database permissions table
        const instancePerms = dataStore.getInstanceClusterPermissions(instanceId);
        if (!instancePerms.shareWithCluster) {
          // Instance is private, don't forward to cluster
          return;
        }

        clusterManager.forwardInstanceEvent(event, instanceId, data);
      })
      .catch(() => {
        // ClusterManager or validator not available, ignore
      });
  }

  /**
   * Broadcast state update to all clients
   */
  broadcastStateUpdate(): void {
    getWebServerModule()
      .then(({ getWebServer }) => {
        const webServer = getWebServer();
        if (webServer.running) {
          webServer.broadcastStateUpdate();
        }
      })
      .catch(() => {
        // WebServer not available, ignore
      });
  }

  /**
   * Broadcast context instance update to all destinations
   */
  broadcastContextInstanceUpdate(projectId: string, context: SharedInstanceContext): void {
    // Send to renderer
    this.sendToRenderer(IPC_CHANNELS.CONTEXT_INSTANCE_UPDATED, projectId, context);

    // Send to web server
    getWebServerModule()
      .then(({ getWebServer }) => {
        const webServer = getWebServer();
        if (webServer.running) {
          webServer.broadcastContextInstanceUpdate(projectId, context);
        }
      })
      .catch(() => {});

    // Send to cluster
    this.sendContextToCluster('contextInstanceUpdated', projectId, context);
  }

  /**
   * Broadcast context knowledge update to all destinations
   */
  broadcastContextKnowledgeUpdate(projectId: string, knowledge: ProjectSharedKnowledge): void {
    // Send to renderer
    this.sendToRenderer(IPC_CHANNELS.CONTEXT_KNOWLEDGE_UPDATED, projectId, knowledge);

    // Send to web server
    getWebServerModule()
      .then(({ getWebServer }) => {
        const webServer = getWebServer();
        if (webServer.running) {
          webServer.broadcastContextKnowledgeUpdate(projectId, knowledge);
        }
      })
      .catch(() => {});

    // Send to cluster
    this.sendContextToCluster('contextKnowledgeUpdated', projectId, knowledge);
  }

  /**
   * Broadcast generic context update event
   */
  broadcastContextUpdate(event: ContextUpdateEvent): void {
    // Send to renderer
    this.sendToRenderer(IPC_CHANNELS.CONTEXT_UPDATED, event);

    // Send to web server
    getWebServerModule()
      .then(({ getWebServer }) => {
        const webServer = getWebServer();
        if (webServer.running) {
          webServer.broadcastContextUpdate(event);
        }
      })
      .catch(() => {});

    // Send to cluster
    this.sendContextToCluster('contextUpdated', event.projectId, event);
  }

  /**
   * Send context event to cluster
   */
  private sendContextToCluster(event: string, projectId: string, data: unknown): void {
    getClusterManagerModule()
      .then(({ getClusterManager }) => {
        const clusterManager = getClusterManager();
        const config = clusterManager.getConfig();

        // Forward context events if connected to cluster
        if (!clusterManager.isConnected()) {
          return;
        }

        // Context events are always shared within the cluster
        clusterManager.forwardContextEvent(event, projectId, data);
      })
      .catch(() => {
        // ClusterManager not available, ignore
      });
  }

  /**
   * Send shell instance event to renderer
   */
  sendShellEvent(event: 'data', shellId: string, data: string): void;
  sendShellEvent(event: 'status', shellId: string, data: ShellInstanceStatus): void;
  sendShellEvent(event: 'exit', shellId: string, data: number): void;
  sendShellEvent(event: 'data' | 'status' | 'exit', shellId: string, data: string | number): void {
    const channelMap: Record<string, string> = {
      data: IPC_CHANNELS.SHELL_RAW_OUTPUT,
      status: IPC_CHANNELS.SHELL_STATUS,
      exit: IPC_CHANNELS.SHELL_EXIT,
    };

    const channel = channelMap[event];
    if (channel) {
      this.sendToRenderer(channel, shellId, data);
    }
  }

  /**
   * Sync instance state to renderer
   */
  syncInstancesToRenderer(instances: unknown[]): void {
    this.sendToRenderer(IPC_CHANNELS.INSTANCE_SYNC, instances);
  }
}

// Export singleton getter
export function getInstanceBroadcaster(): InstanceBroadcaster {
  return InstanceBroadcaster.getInstance();
}
