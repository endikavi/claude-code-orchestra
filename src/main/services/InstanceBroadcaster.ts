import { IPC_CHANNELS } from '../ipc/channels';
import type { StreamMessage, InstanceStatus, ShellInstanceStatus } from '@shared/types';

// BrowserWindow type for optional Electron dependency
type BrowserWindowType = import('electron').BrowserWindow;

// Lazy import to avoid circular dependencies
let webServerModule: typeof import('./WebServer') | null = null;
async function getWebServerModule() {
  if (!webServerModule) {
    webServerModule = await import('./WebServer');
  }
  return webServerModule;
}

let clusterManagerModule: typeof import('./ClusterManager') | null = null;
async function getClusterManagerModule() {
  if (!clusterManagerModule) {
    clusterManagerModule = await import('./ClusterManager');
  }
  return clusterManagerModule;
}

export type InstanceEventType =
  | 'output'
  | 'status'
  | 'error'
  | 'exit'
  | 'rawOutput'
  | 'sessionId'
  | 'terminalTitle';

/**
 * Handles broadcasting instance events to all destinations:
 * - Renderer process (via IPC)
 * - Web server (for remote clients)
 * - Cluster (for multi-node setups)
 */
export class InstanceBroadcaster {
  private mainWindow: BrowserWindowType | null = null;

  private static instance: InstanceBroadcaster | null = null;

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
    };
    return channelMap[event] || null;
  }

  /**
   * Broadcast an instance event to all destinations (renderer, webserver, cluster)
   */
  broadcastInstanceEvent(event: InstanceEventType, instanceId: string, data: unknown): void {
    const channel = this.getChannel(event);
    if (channel) {
      this.sendToRenderer(channel, instanceId, data);
    }
    this.sendToWebServer(event, instanceId, data);
    this.sendToCluster(event, instanceId, data);
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
        }
      })
      .catch(() => {
        // WebServer not available, ignore
      });
  }

  /**
   * Send instance events to cluster for distribution to other nodes
   */
  private sendToCluster(event: string, instanceId: string, data: unknown): void {
    getClusterManagerModule()
      .then(({ getClusterManager }) => {
        const clusterManager = getClusterManager();
        const config = clusterManager.getConfig();

        // Only forward events if we're a secondary node connected to primary
        if (config.role !== 'secondary' || !clusterManager.isConnected()) {
          return;
        }

        clusterManager.forwardInstanceEvent(event, instanceId, data);
      })
      .catch(() => {
        // ClusterManager not available, ignore
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
