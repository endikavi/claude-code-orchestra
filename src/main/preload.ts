import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels';
import type {
  Project,
  ClaudeInstance,
  ShellInstance,
  ShellInstanceStatus,
  ClaudeModel,
  InstanceMode,
  ClaudeSettings,
  McpServer,
  InstanceStatus,
  StreamMessage,
  Conversation,
  ConversationMessage,
  ConversationStatus,
  ClaudeSessionInfo,
  SessionImportResult,
  SessionImportBatchResult,
  SecurityConfig,
  IpAccessRule,
  AuditLogEntry,
  AuditLogQueryOptions,
  DashboardNotification,
  NotificationFilterOptions,
  NotificationStats,
  NotificationPreferences,
  HookTemplate,
  DashboardHookSettings,
  HookTemplateType,
  GlobalPermissionConfig,
  PermissionRule,
  PermissionLogEntry,
  PermissionStats,
  PermissionLogQueryOptions,
  ToolUsageMetric,
  SessionMetric,
  ProjectMetricsSummary,
  MetricsTimeSeries,
  DashboardMetricsSummary,
  CostBreakdown,
  UsageTrends,
  MetricsQueryOptions,
  MetricsPeriod,
  GitStatus,
  SubagentInstance,
  TrackedTask,
  ProxyConfig,
  AllowedPort,
  RalphTask,
  CreateRalphTaskInput,
  UpdateRalphTaskInput,
  MoveRalphTaskInput,
  ReorderRalphTasksInput,
  RalphTaskHelpRequest,
} from '@shared/types';
import type { RemoteConfig, RemoteServerStatus } from '@shared/types/remote';
import type {
  ClusterConfig,
  ClusterStatus,
  ClusterState,
  ClusterNode,
  GlobalProject,
  GlobalInstance,
  RemoteInstanceRequest,
  ClusterNodePrivacy,
  InstanceClusterPermissions,
  ClusterPermissionChangeEvent,
} from '@shared/types/cluster';
import type { UISettings } from '@shared/types/uiSettings';
import type { TerminalPoolConfig, TerminalPoolStats } from '@shared/types/pool';
import type {
  SharedInstanceContext,
  ProjectSharedKnowledge,
  ProjectContextSummary,
  ContextUpdateEvent,
} from '@shared/types/sharedContext';
import type { InstancePreset, CreatePresetInput, UpdatePresetInput } from '@shared/types/presets';
import type { IpcRendererEvent } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Project operations
  project: {
    create: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, data),

    update: (project: Project): Promise<Project> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_UPDATE, project),

    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_DELETE, id),

    getAll: (): Promise<Project[]> => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET_ALL),

    getById: (id: string): Promise<Project | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET_BY_ID, id),
  },

  // Instance operations
  instance: {
    create: (config: {
      projectId: string;
      model: ClaudeModel;
      mode: InstanceMode;
      prompt?: string;
      planMode?: boolean;
      verbose?: boolean;
      skipPermissions?: boolean;
      usePermissionPromptTool?: boolean;
    }): Promise<ClaudeInstance> => ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_CREATE, config),

    // Create a pending instance without starting Claude (for structured view deferred flow)
    createPending: (config: {
      projectId: string;
      model: ClaudeModel;
      mode: InstanceMode;
      planMode?: boolean;
      verbose?: boolean;
      skipPermissions?: boolean;
      usePermissionPromptTool?: boolean;
    }): Promise<ClaudeInstance & { conversationId?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_CREATE_PENDING, config),

    // Activate a pending instance with the first user message
    activate: (id: string, prompt: string): Promise<ClaudeInstance> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_ACTIVATE, id, prompt),

    kill: (id: string, force?: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_KILL, id, force),

    sendInput: (id: string, input: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_SEND_INPUT, id, input),

    // Send JSON-formatted message for stream-json mode (structured view)
    sendJsonMessage: (id: string, message: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_SEND_JSON_MESSAGE, id, message),

    getAll: (): Promise<ClaudeInstance[]> => ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_GET_ALL),

    getByProject: (projectId: string): Promise<ClaudeInstance[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_GET_BY_PROJECT, projectId),

    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('instance:resize', id, cols, rows),

    // Force repaint for experimental TUI fix options
    forceRepaint: (id: string, method: 'fake-resize' | 'ansi-clear'): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_FORCE_REPAINT, id, method),

    // Event listeners
    onOutput: (callback: (instanceId: string, data: StreamMessage) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        instanceId: string,
        data: StreamMessage
      ) => callback(instanceId, data);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_OUTPUT, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_OUTPUT, listener);
    },

    onStatus: (callback: (instanceId: string, status: InstanceStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        instanceId: string,
        status: InstanceStatus
      ) => callback(instanceId, status);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_STATUS, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_STATUS, listener);
    },

    onError: (callback: (instanceId: string, error: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instanceId: string, error: string) =>
        callback(instanceId, error);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_ERROR, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_ERROR, listener);
    },

    onExit: (callback: (instanceId: string, code: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instanceId: string, code: number) =>
        callback(instanceId, code);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_EXIT, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_EXIT, listener);
    },

    onRawOutput: (callback: (instanceId: string, data: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instanceId: string, data: string) =>
        callback(instanceId, data);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_RAW_OUTPUT, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_RAW_OUTPUT, listener);
    },

    onSessionId: (callback: (instanceId: string, sessionId: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instanceId: string, sessionId: string) =>
        callback(instanceId, sessionId);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_SESSION_ID, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_SESSION_ID, listener);
    },

    onTerminalTitle: (callback: (instanceId: string, title: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instanceId: string, title: string) =>
        callback(instanceId, title);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_TERMINAL_TITLE, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_TERMINAL_TITLE, listener);
    },

    onDimensionSync: (callback: (instanceId: string, cols: number, rows: number) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        instanceId: string,
        cols: number,
        rows: number
      ) => callback(instanceId, cols, rows);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_DIMENSION_SYNC, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_DIMENSION_SYNC, listener);
    },

    setTitle: (id: string, title: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_SET_TITLE, id, title),

    onSync: (callback: (instances: ClaudeInstance[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instances: ClaudeInstance[]) =>
        callback(instances);
      ipcRenderer.on(IPC_CHANNELS.INSTANCE_SYNC, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.INSTANCE_SYNC, listener);
    },

    resume: (config: {
      projectId: string;
      sessionId: string;
      model: ClaudeModel;
      mode: InstanceMode;
      prompt?: string;
    }): Promise<ClaudeInstance> => ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_RESUME, config),
  },

  // Conversation operations
  conversation: {
    create: (data: {
      projectId: string;
      title: string;
      initialPrompt: string;
      model: ClaudeModel;
      mode: InstanceMode;
    }): Promise<Conversation> => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_CREATE, data),

    update: (
      id: string,
      updates: Partial<{
        sessionId: string;
        status: ConversationStatus;
        totalCostUsd: number;
        messageCount: number;
        title: string;
      }>
    ): Promise<Conversation | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_UPDATE, id, updates),

    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, id),

    getByProject: (projectId: string): Promise<Conversation[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_GET_BY_PROJECT, projectId),

    getById: (id: string): Promise<Conversation | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_GET_BY_ID, id),

    addMessage: (data: {
      conversationId: string;
      type: string;
      content: string;
      costUsd?: number;
    }): Promise<ConversationMessage> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_ADD_MESSAGE, data),

    getMessages: (conversationId: string): Promise<ConversationMessage[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_GET_MESSAGES, conversationId),
  },

  // Config operations
  config: {
    getClaudeSettings: (): Promise<ClaudeSettings | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_CLAUDE_SETTINGS),

    getMcpServers: (): Promise<McpServer[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET_MCP_SERVERS),
  },

  // Window operations
  window: {
    minimize: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  },

  // Dialog operations
  dialog: {
    selectDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY),
  },

  // Session import operations
  session: {
    getAvailable: (projectPath: string): Promise<ClaudeSessionInfo[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_AVAILABLE, projectPath),

    getCount: (projectPath: string): Promise<number> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_GET_COUNT, projectPath),

    import: (
      sessionId: string,
      projectId: string,
      projectPath: string
    ): Promise<SessionImportResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_IMPORT, sessionId, projectId, projectPath),

    importBatch: (
      sessionIds: string[],
      projectId: string,
      projectPath: string
    ): Promise<SessionImportBatchResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_IMPORT_BATCH, sessionIds, projectId, projectPath),

    checkInstalled: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.SESSION_CHECK_INSTALLED),
  },

  // Remote access operations
  remote: {
    getConfig: (): Promise<RemoteConfig> => ipcRenderer.invoke(IPC_CHANNELS.REMOTE_GET_CONFIG),

    updateConfig: (config: Partial<RemoteConfig>): Promise<RemoteConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.REMOTE_UPDATE_CONFIG, config),

    setPassword: (password: string): Promise<RemoteConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.REMOTE_SET_PASSWORD, password),

    startServer: (
      port?: number
    ): Promise<{ success: boolean; status?: RemoteServerStatus; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.REMOTE_START_SERVER, port),

    stopServer: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.REMOTE_STOP_SERVER),

    getStatus: (): Promise<RemoteServerStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.REMOTE_GET_STATUS),

    kickSession: (sessionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.REMOTE_KICK_SESSION, sessionId),

    getQrCode: (): Promise<{ success: boolean; qrCode?: string; url?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.REMOTE_GET_QR_CODE),
  },

  // Cluster operations
  cluster: {
    getConfig: (): Promise<ClusterConfig> => ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_GET_CONFIG),

    updateConfig: (config: Partial<ClusterConfig>): Promise<ClusterConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_UPDATE_CONFIG, config),

    getStatus: (): Promise<ClusterStatus> => ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_GET_STATUS),

    start: (): Promise<{ success: boolean; status?: ClusterStatus; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_START),

    stop: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_STOP),

    generateSecret: (): Promise<{ success: boolean; secret?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_GENERATE_SECRET),

    getGlobalProjects: (): Promise<GlobalProject[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_GET_GLOBAL_PROJECTS),

    getGlobalInstances: (): Promise<GlobalInstance[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_GET_GLOBAL_INSTANCES),

    createRemoteInstance: (
      request: RemoteInstanceRequest
    ): Promise<{ success: boolean; data?: ClaudeInstance; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_CREATE_REMOTE_INSTANCE, request),

    sendRemoteInput: (
      instanceId: string,
      nodeId: string,
      input: string
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_SEND_REMOTE_INPUT, instanceId, nodeId, input),

    killRemoteInstance: (instanceId: string, nodeId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_KILL_REMOTE_INSTANCE, instanceId, nodeId),

    createRemoteShell: (
      nodeId: string,
      projectId: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_CREATE_REMOTE_SHELL, nodeId, projectId),

    resizeRemoteInstance: (
      instanceId: string,
      nodeId: string,
      cols: number,
      rows: number
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(
        IPC_CHANNELS.CLUSTER_RESIZE_REMOTE_INSTANCE,
        instanceId,
        nodeId,
        cols,
        rows
      ),

    // Event listeners
    onStateChanged: (callback: (state: ClusterState) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, state: ClusterState) => callback(state);
      ipcRenderer.on(IPC_CHANNELS.CLUSTER_STATE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLUSTER_STATE_CHANGED, listener);
    },

    onNodeJoined: (callback: (node: ClusterNode) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, node: ClusterNode) => callback(node);
      ipcRenderer.on(IPC_CHANNELS.CLUSTER_NODE_JOINED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLUSTER_NODE_JOINED, listener);
    },

    onNodeLeft: (callback: (nodeId: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, nodeId: string) => callback(nodeId);
      ipcRenderer.on(IPC_CHANNELS.CLUSTER_NODE_LEFT, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLUSTER_NODE_LEFT, listener);
    },

    onConnected: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.CLUSTER_CONNECTED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLUSTER_CONNECTED, listener);
    },

    onDisconnected: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.CLUSTER_DISCONNECTED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLUSTER_DISCONNECTED, listener);
    },

    onError: (callback: (error: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on(IPC_CHANNELS.CLUSTER_ERROR, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLUSTER_ERROR, listener);
    },

    onPermissionsChanged: (callback: (event: ClusterPermissionChangeEvent) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        permEvent: ClusterPermissionChangeEvent
      ) => callback(permEvent);
      ipcRenderer.on(IPC_CHANNELS.CLUSTER_PERMISSIONS_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLUSTER_PERMISSIONS_CHANGED, listener);
    },

    // Privacy methods
    getPrivacy: (): Promise<ClusterNodePrivacy> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_GET_PRIVACY),

    updatePrivacy: (privacy: Partial<ClusterNodePrivacy>): Promise<ClusterNodePrivacy> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLUSTER_UPDATE_PRIVACY, privacy),

    // Instance cluster permissions
    getInstancePermissions: (instanceId: string): Promise<InstanceClusterPermissions> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_GET_CLUSTER_PERMISSIONS, instanceId),

    setInstancePermissions: (
      instanceId: string,
      perms: Partial<InstanceClusterPermissions>
    ): Promise<InstanceClusterPermissions> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_SET_CLUSTER_PERMISSIONS, instanceId, perms),
  },

  // UI Settings operations
  uiSettings: {
    get: (): Promise<UISettings> => ipcRenderer.invoke(IPC_CHANNELS.UI_SETTINGS_GET),

    update: (settings: Partial<UISettings>): Promise<UISettings> =>
      ipcRenderer.invoke(IPC_CHANNELS.UI_SETTINGS_UPDATE, settings),
  },

  // Security operations
  security: {
    getConfig: (): Promise<SecurityConfig> => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_GET_CONFIG),

    updateConfig: (config: Partial<SecurityConfig>): Promise<SecurityConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_UPDATE_CONFIG, config),

    getIpRules: (): Promise<IpAccessRule[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_GET_IP_RULES),

    addIpRule: (rule: Omit<IpAccessRule, 'id' | 'createdAt'>): Promise<IpAccessRule> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_ADD_IP_RULE, rule),

    deleteIpRule: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_DELETE_IP_RULE, id),

    testIp: (ip: string): Promise<{ allowed: boolean; reason?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_TEST_IP, ip),

    getAuditLog: (options?: AuditLogQueryOptions): Promise<AuditLogEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_GET_AUDIT_LOG, options),

    getAuditLogCount: (): Promise<number> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_GET_AUDIT_LOG_COUNT),

    clearAuditLog: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_CLEAR_AUDIT_LOG),

    getLockouts: (): Promise<
      Array<{ ip: string; lockedAt: number; expiresAt: number; attempts: number }>
    > => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_GET_LOCKOUTS),

    unlockIp: (ip: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_UNLOCK_IP, ip),
  },

  // Shell operations
  shell: {
    // External terminal (legacy)
    openTerminal: (path: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_TERMINAL, path),

    // Open external URL in default browser
    openExternal: (url: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),

    // Integrated shell
    create: (projectId: string): Promise<ShellInstance> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_CREATE, projectId),

    kill: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.SHELL_KILL, id),

    sendInput: (id: string, input: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_SEND_INPUT, id, input),

    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC_CHANNELS.SHELL_RESIZE, id, cols, rows),

    // Get available shells on the system
    getAvailable: (): Promise<
      Array<{
        id: string;
        name: string;
        path: string;
        isDefault: boolean;
        canRunClaude: boolean;
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.SHELL_GET_AVAILABLE),

    onRawOutput: (callback: (shellId: string, data: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, shellId: string, data: string) =>
        callback(shellId, data);
      ipcRenderer.on(IPC_CHANNELS.SHELL_RAW_OUTPUT, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHELL_RAW_OUTPUT, listener);
    },

    onStatus: (callback: (shellId: string, status: ShellInstanceStatus) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        shellId: string,
        status: ShellInstanceStatus
      ) => callback(shellId, status);
      ipcRenderer.on(IPC_CHANNELS.SHELL_STATUS, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHELL_STATUS, listener);
    },

    onExit: (callback: (shellId: string, code: number) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, shellId: string, code: number) =>
        callback(shellId, code);
      ipcRenderer.on(IPC_CHANNELS.SHELL_EXIT, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SHELL_EXIT, listener);
    },
  },

  // Local Settings operations (settings.local.json)
  localSettings: {
    read: (
      projectPath: string
    ): Promise<{ success: boolean; content?: string | null; exists?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SETTINGS_READ, projectPath),

    write: (projectPath: string, content: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_SETTINGS_WRITE, projectPath, content),
  },

  // Notification operations
  notification: {
    getAll: (options?: NotificationFilterOptions): Promise<DashboardNotification[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_GET_ALL, options),

    getStats: (): Promise<NotificationStats> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_GET_STATS),

    markRead: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_MARK_READ, id),

    markAllRead: (): Promise<number> => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_MARK_ALL_READ),

    dismiss: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_DISMISS, id),

    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_DELETE, id),

    clearAll: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_CLEAR_ALL),

    getPreferences: (): Promise<NotificationPreferences> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_GET_PREFERENCES),

    setPreferences: (prefs: Partial<NotificationPreferences>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SET_PREFERENCES, prefs),

    // Event listeners
    onNew: (callback: (notification: DashboardNotification) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, notification: DashboardNotification) =>
        callback(notification);
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_NEW, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_NEW, listener);
    },

    onUpdated: (callback: (notification: DashboardNotification) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, notification: DashboardNotification) =>
        callback(notification);
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_UPDATED, listener);
    },

    onDismissed: (callback: (id: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_DISMISSED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_DISMISSED, listener);
    },

    onDeleted: (callback: (id: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_DELETED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_DELETED, listener);
    },

    onCleared: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_CLEARED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_CLEARED, listener);
    },

    onAllRead: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_ALL_READ, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_ALL_READ, listener);
    },

    onClicked: (callback: (id: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_CLICKED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_CLICKED, listener);
    },
  },

  // Hook operations
  hook: {
    getTemplates: (): Promise<HookTemplate[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOK_GET_TEMPLATES),

    setupProject: (
      projectPath: string,
      settings: DashboardHookSettings,
      templateId?: HookTemplateType
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOK_SETUP_PROJECT, projectPath, settings, templateId),

    removeProject: (projectPath: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOK_REMOVE_PROJECT, projectPath),

    getProjectSettings: (projectPath: string): Promise<DashboardHookSettings | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOK_GET_PROJECT_SETTINGS, projectPath),

    hasConfigured: (projectPath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.HOOK_HAS_CONFIGURED, projectPath),

    // Event listener for real-time activity tracking
    onActivity: (
      callback: (
        event: Electron.IpcRendererEvent,
        data: { instanceId: string; toolName?: string; files?: string[]; timestamp: number }
      ) => void
    ) => {
      const listener = (
        event: Electron.IpcRendererEvent,
        data: { instanceId: string; toolName?: string; files?: string[]; timestamp: number }
      ) => callback(event, data);
      ipcRenderer.on(IPC_CHANNELS.HOOK_ACTIVITY, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.HOOK_ACTIVITY, listener);
    },
  },

  // Orchestration operations
  orchestration: {
    setupAgentMd: (
      projectPath: string
    ): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ORCHESTRATION_SETUP_AGENT_MD, projectPath),
  },

  // Agent discovery operations
  agent: {
    discover: (
      projectPath: string
    ): Promise<Array<{ name: string; path: string; source: 'project' | 'global' }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_DISCOVER, projectPath),
    validateFile: (agentPath: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.AGENT_VALIDATE_FILE, agentPath),
  },

  // Skill operations
  skill: {
    getAvailable: (): Promise<Array<{ id: string; name: string; description: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_AVAILABLE),

    install: (
      projectPath: string,
      skillIds: string[]
    ): Promise<{ success: boolean; installed: string[]; errors: string[] }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_INSTALL, projectPath, skillIds),

    remove: (projectPath: string, skillId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_REMOVE, projectPath, skillId),

    getInstalled: (projectPath: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_INSTALLED, projectPath),
  },

  // Permission operations
  permission: {
    getConfig: (): Promise<GlobalPermissionConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_CONFIG),

    setConfig: (config: Partial<GlobalPermissionConfig>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_SET_CONFIG, config),

    addRule: (
      rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
    ): Promise<PermissionRule> => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_ADD_RULE, rule),

    updateRule: (id: string, updates: Partial<PermissionRule>): Promise<PermissionRule | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_UPDATE_RULE, id, updates),

    removeRule: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_REMOVE_RULE, id),

    getLog: (options?: PermissionLogQueryOptions): Promise<PermissionLogEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_LOG, options),

    getStats: (): Promise<PermissionStats> => ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_GET_STATS),

    clearLog: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_CLEAR_LOG),
  },

  // Permission Prompt operations (for --permission-prompt-tool support in structured view)
  permissionPrompt: {
    // Listen for permission requests from Claude instances
    onRequest: (
      callback: (request: {
        id: string;
        instanceId: string;
        toolName: string;
        toolInput: Record<string, unknown>;
        createdAt: number;
      }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: {
          id: string;
          instanceId: string;
          toolName: string;
          toolInput: Record<string, unknown>;
          createdAt: number;
        }
      ) => callback(request);
      ipcRenderer.on(IPC_CHANNELS.PERMISSION_PROMPT_REQUEST, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PERMISSION_PROMPT_REQUEST, listener);
    },

    // Listen for timeout events
    onTimeout: (
      callback: (request: {
        id: string;
        instanceId: string;
        toolName: string;
        toolInput: Record<string, unknown>;
        createdAt: number;
      }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: {
          id: string;
          instanceId: string;
          toolName: string;
          toolInput: Record<string, unknown>;
          createdAt: number;
        }
      ) => callback(request);
      ipcRenderer.on(IPC_CHANNELS.PERMISSION_PROMPT_TIMEOUT, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PERMISSION_PROMPT_TIMEOUT, listener);
    },

    // Respond to a permission request (allow/deny)
    respond: (
      permissionId: string,
      response: {
        allowed: boolean;
        updatedInput?: Record<string, unknown>;
        message?: string;
      }
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_PROMPT_RESPOND, permissionId, response),

    // Cancel a permission request
    cancel: (permissionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PERMISSION_PROMPT_CANCEL, permissionId),
  },

  // Metrics operations
  metrics: {
    getToolUsage: (options?: MetricsQueryOptions): Promise<ToolUsageMetric[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_TOOL_USAGE, options),

    getSessions: (options?: MetricsQueryOptions): Promise<SessionMetric[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_SESSIONS, options),

    getProjectSummary: (projectId: string): Promise<ProjectMetricsSummary> =>
      ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_PROJECT_SUMMARY, projectId),

    getTimeSeries: (options?: MetricsQueryOptions): Promise<MetricsTimeSeries> =>
      ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_TIME_SERIES, options),

    getDashboardSummary: (): Promise<DashboardMetricsSummary> =>
      ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_DASHBOARD_SUMMARY),

    getCostBreakdown: (options?: MetricsQueryOptions): Promise<CostBreakdown> =>
      ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_COST_BREAKDOWN, options),

    getUsageTrends: (period?: MetricsPeriod): Promise<UsageTrends> =>
      ipcRenderer.invoke(IPC_CHANNELS.METRICS_GET_USAGE_TRENDS, period),

    clear: (): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC_CHANNELS.METRICS_CLEAR),
  },

  // Git status operations
  git: {
    getStatus: (projectId: string): Promise<GitStatus | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_GET_STATUS, projectId),

    refresh: (projectId: string): Promise<GitStatus | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REFRESH, projectId),

    onStatusChanged: (callback: (projectId: string, status: GitStatus) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, projectId: string, status: GitStatus) =>
        callback(projectId, status);
      ipcRenderer.on(IPC_CHANNELS.GIT_STATUS_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.GIT_STATUS_CHANGED, listener);
    },
  },

  // Subagent operations (native Claude Task tool tracking)
  subagent: {
    getByInstance: (instanceId: string): Promise<SubagentInstance[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SUBAGENT_GET_BY_INSTANCE, instanceId),

    getAll: (): Promise<SubagentInstance[]> => ipcRenderer.invoke(IPC_CHANNELS.SUBAGENT_GET_ALL),

    // Event listeners
    onStarted: (callback: (instanceId: string, subagent: SubagentInstance) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        instanceId: string,
        subagent: SubagentInstance
      ) => callback(instanceId, subagent);
      ipcRenderer.on(IPC_CHANNELS.SUBAGENT_STARTED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SUBAGENT_STARTED, listener);
    },

    onCompleted: (callback: (instanceId: string, subagent: SubagentInstance) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        instanceId: string,
        subagent: SubagentInstance
      ) => callback(instanceId, subagent);
      ipcRenderer.on(IPC_CHANNELS.SUBAGENT_COMPLETED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SUBAGENT_COMPLETED, listener);
    },
  },

  // Task operations (Claude Code TaskCreate/TaskUpdate/TaskList tools)
  task: {
    getByInstance: (instanceId: string): Promise<TrackedTask[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_GET_BY_INSTANCE, instanceId),

    getAll: (): Promise<TrackedTask[]> => ipcRenderer.invoke(IPC_CHANNELS.TASK_GET_ALL),

    // Event listeners
    onCreated: (callback: (instanceId: string, task: TrackedTask) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instanceId: string, task: TrackedTask) =>
        callback(instanceId, task);
      ipcRenderer.on(IPC_CHANNELS.TASK_CREATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_CREATED, listener);
    },

    onUpdated: (callback: (instanceId: string, task: TrackedTask) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, instanceId: string, task: TrackedTask) =>
        callback(instanceId, task);
      ipcRenderer.on(IPC_CHANNELS.TASK_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_UPDATED, listener);
    },

    onList: (callback: (instanceId: string, tasks: TrackedTask[]) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        instanceId: string,
        tasks: TrackedTask[]
      ) => callback(instanceId, tasks);
      ipcRenderer.on(IPC_CHANNELS.TASK_LIST, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_LIST, listener);
    },
  },

  // Proxy operations (web preview tunneling)
  proxy: {
    getConfig: (): Promise<{ success: boolean; data?: ProxyConfig; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_GET_CONFIG),

    updateConfig: (
      config: Partial<ProxyConfig>
    ): Promise<{ success: boolean; data?: ProxyConfig; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_UPDATE_CONFIG, config),

    getPorts: (): Promise<{ success: boolean; data?: AllowedPort[]; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_GET_PORTS),

    addPort: (
      port: number,
      description?: string
    ): Promise<{ success: boolean; data?: AllowedPort; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_ADD_PORT, port, description),

    removePort: (port: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROXY_REMOVE_PORT, port),

    // Event listener for proxy:open from MCP
    onOpen: (
      callback: (data: {
        port: number;
        path?: string;
        split?: boolean;
        title?: string;
        instanceId?: string;
      }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: {
          port: number;
          path?: string;
          split?: boolean;
          title?: string;
          instanceId?: string;
        }
      ) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.PROXY_OPEN, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.PROXY_OPEN, listener);
    },
  },

  // DevTools operations (for web preview)
  devtools: {
    registerView: (viewId: string, instanceId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVTOOLS_REGISTER_VIEW, viewId, instanceId),

    unregisterView: (viewId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVTOOLS_UNREGISTER_VIEW, viewId),

    addConsoleEntry: (
      viewId: string,
      entry: {
        level: 'log' | 'warn' | 'error' | 'info' | 'debug';
        message: string;
        timestamp: number;
        source?: string;
        line?: number;
      }
    ): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVTOOLS_ADD_CONSOLE_ENTRY, viewId, entry),

    clearConsole: (viewId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVTOOLS_CLEAR_CONSOLE, viewId),

    toggleInspector: (viewId: string, enabled?: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVTOOLS_TOGGLE_INSPECTOR, viewId, enabled),

    sendToTerminal: (
      instanceId: string,
      html: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DEVTOOLS_SEND_TO_TERMINAL, instanceId, html),

    onCommand: (
      callback: (data: { viewId?: string; instanceId?: string; command: { type: string } }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { viewId?: string; instanceId?: string; command: { type: string } }
      ) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.DEVTOOLS_COMMAND, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.DEVTOOLS_COMMAND, listener);
    },
  },

  // Terminal Pool operations (local-only, never exposed to web/cluster)
  pool: {
    getConfig: (): Promise<TerminalPoolConfig> => ipcRenderer.invoke(IPC_CHANNELS.POOL_GET_CONFIG),

    updateConfig: (config: Partial<TerminalPoolConfig>): Promise<TerminalPoolConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.POOL_UPDATE_CONFIG, config),

    getStats: (): Promise<TerminalPoolStats> => ipcRenderer.invoke(IPC_CHANNELS.POOL_GET_STATS),

    resetStats: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.POOL_RESET_STATS),
  },

  // Shared Context operations
  context: {
    getInstances: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET_INSTANCES, projectId),

    getInstance: (instanceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET_INSTANCE, instanceId),

    getProjectKnowledge: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET_PROJECT_KNOWLEDGE, projectId),

    getSummary: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET_SUMMARY, projectId),

    getStats: () => ipcRenderer.invoke(IPC_CHANNELS.CONTEXT_GET_STATS),

    onUpdated: (callback: (event: ContextUpdateEvent) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: ContextUpdateEvent) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CONTEXT_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CONTEXT_UPDATED, listener);
    },

    onInstanceUpdated: (
      callback: (projectId: string, context: SharedInstanceContext) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        projectId: string,
        context: SharedInstanceContext
      ) => callback(projectId, context);
      ipcRenderer.on(IPC_CHANNELS.CONTEXT_INSTANCE_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CONTEXT_INSTANCE_UPDATED, listener);
    },

    onKnowledgeUpdated: (
      callback: (projectId: string, knowledge: ProjectSharedKnowledge) => void
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        projectId: string,
        knowledge: ProjectSharedKnowledge
      ) => callback(projectId, knowledge);
      ipcRenderer.on(IPC_CHANNELS.CONTEXT_KNOWLEDGE_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CONTEXT_KNOWLEDGE_UPDATED, listener);
    },
  },

  // SSL/TLS operations
  ssl: {
    validateCert: (
      certPath: string
    ): Promise<{
      valid: boolean;
      error?: string;
      subject?: string;
      issuer?: string;
      validFrom?: Date;
      validTo?: Date;
      daysRemaining?: number;
      isSelfSigned?: boolean;
      fingerprint?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.SSL_VALIDATE_CERT, certPath),

    generateSelfSigned: (
      hostname?: string,
      days?: number
    ): Promise<{ success: boolean; certPath?: string; keyPath?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSL_GENERATE_SELF_SIGNED, hostname, days),

    getCertInfo: (
      certPath: string
    ): Promise<{
      success: boolean;
      info?: {
        subject: {
          commonName?: string;
          organization?: string;
          organizationalUnit?: string;
          country?: string;
        };
        issuer: { commonName?: string; organization?: string };
        validFrom: Date;
        validTo: Date;
        serialNumber: string;
        fingerprint: string;
        isSelfSigned: boolean;
      };
      error?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.SSL_GET_CERT_INFO, certPath),

    validateCertKeyPair: (
      certPath: string,
      keyPath: string,
      passphrase?: string
    ): Promise<{ valid: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSL_VALIDATE_CERT_KEY_PAIR, certPath, keyPath, passphrase),

    generateLetsEncrypt: (
      domain: string,
      email?: string
    ): Promise<{ success: boolean; certPath?: string; keyPath?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SSL_GENERATE_LETS_ENCRYPT, domain, email),
  },

  // Update operations
  update: {
    check: (): Promise<{
      updateAvailable: boolean;
      currentVersion: string;
      latestVersion: string;
      releaseNotes?: string;
      releaseUrl?: string;
      publishedAt?: string;
    }> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),

    download: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),

    install: (): void => {
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL);
    },

    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_VERSION),

    onChecking: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('update:checking', listener);
      return () => ipcRenderer.removeListener('update:checking', listener);
    },

    onAvailable: (
      callback: (data: { version: string; releaseNotes?: string; releaseDate?: string }) => void
    ) => {
      const listener = (_event: IpcRendererEvent, data: { version: string }) => callback(data);
      ipcRenderer.on('update:available', listener);
      return () => ipcRenderer.removeListener('update:available', listener);
    },

    onNotAvailable: (callback: (data: { version: string }) => void) => {
      const listener = (_event: IpcRendererEvent, data: { version: string }) => callback(data);
      ipcRenderer.on('update:not-available', listener);
      return () => ipcRenderer.removeListener('update:not-available', listener);
    },

    onProgress: (
      callback: (data: {
        percent: number;
        bytesPerSecond: number;
        total: number;
        transferred: number;
      }) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        data: { percent: number; bytesPerSecond: number; total: number; transferred: number }
      ) => callback(data);
      ipcRenderer.on('update:progress', listener);
      return () => ipcRenderer.removeListener('update:progress', listener);
    },

    onDownloaded: (callback: (data: { version: string }) => void) => {
      const listener = (_event: IpcRendererEvent, data: { version: string }) => callback(data);
      ipcRenderer.on('update:downloaded', listener);
      return () => ipcRenderer.removeListener('update:downloaded', listener);
    },

    onError: (callback: (data: { message: string }) => void) => {
      const listener = (_event: IpcRendererEvent, data: { message: string }) => callback(data);
      ipcRenderer.on('update:error', listener);
      return () => ipcRenderer.removeListener('update:error', listener);
    },

    onStartupAvailable: (
      callback: (data: {
        updateAvailable: boolean;
        currentVersion: string;
        latestVersion: string;
        releaseNotes?: string;
        releaseUrl?: string;
      }) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        data: {
          updateAvailable: boolean;
          currentVersion: string;
          latestVersion: string;
          releaseNotes?: string;
          releaseUrl?: string;
        }
      ) => callback(data);
      ipcRenderer.on('update:startup-available', listener);
      return () => ipcRenderer.removeListener('update:startup-available', listener);
    },
  },

  // Ralph Task operations
  ralphTask: {
    create: (input: CreateRalphTaskInput): Promise<RalphTask> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_CREATE, input),

    update: (id: string, updates: UpdateRalphTaskInput): Promise<RalphTask | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_UPDATE, id, updates),

    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_DELETE, id),

    getByProject: (projectId: string): Promise<RalphTask[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_GET_BY_PROJECT, projectId),

    getById: (id: string): Promise<RalphTask | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_GET_BY_ID, id),

    move: (input: MoveRalphTaskInput): Promise<RalphTask | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_MOVE, input),

    reorder: (input: ReorderRalphTasksInput): Promise<RalphTask[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_REORDER, input),

    start: (taskId: string, isInteractive?: boolean): Promise<RalphTask | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_START, taskId, isInteractive),

    stop: (taskId: string): Promise<RalphTask | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_STOP, taskId),

    respondToHelp: (taskId: string, response: string): Promise<RalphTask | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_RESPOND_HELP, taskId, response),

    processAll: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL, projectId),

    stopAll: (projectId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.RALPH_TASK_STOP_ALL, projectId),

    // Event listeners
    onCreated: (callback: (task: RalphTask) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, task: RalphTask) => callback(task);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_CREATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_CREATED, listener);
    },

    onUpdated: (callback: (task: RalphTask) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, task: RalphTask) => callback(task);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_UPDATED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_UPDATED, listener);
    },

    onDeleted: (callback: (taskId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, taskId: string) => callback(taskId);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_DELETED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_DELETED, listener);
    },

    onHelpRequested: (callback: (request: RalphTaskHelpRequest) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, request: RalphTaskHelpRequest) =>
        callback(request);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_HELP_REQUESTED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_HELP_REQUESTED, listener);
    },

    onLoopStarted: (callback: (taskId: string, loopCount: number) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, taskId: string, loopCount: number) =>
        callback(taskId, loopCount);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_LOOP_STARTED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_LOOP_STARTED, listener);
    },

    onLoopCompleted: (callback: (taskId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, taskId: string) => callback(taskId);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_LOOP_COMPLETED, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_LOOP_COMPLETED, listener);
    },

    onProcessAllStarted: (callback: (projectId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, projectId: string) => callback(projectId);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_STARTED, listener);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_STARTED, listener);
    },

    onProcessAllCompleted: (callback: (projectId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, projectId: string) => callback(projectId);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_COMPLETED, listener);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_COMPLETED, listener);
    },

    onProcessAllStopped: (callback: (projectId: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, projectId: string) => callback(projectId);
      ipcRenderer.on(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_STOPPED, listener);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_STOPPED, listener);
    },
  },

  // Instance Preset operations
  preset: {
    create: (data: CreatePresetInput): Promise<InstancePreset> =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESET_CREATE, data),

    update: (id: string, updates: UpdatePresetInput): Promise<InstancePreset | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESET_UPDATE, id, updates),

    delete: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESET_DELETE, id),

    getById: (id: string): Promise<InstancePreset | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESET_GET_BY_ID, id),

    getByProject: (projectId: string): Promise<InstancePreset[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESET_GET_BY_PROJECT, projectId),

    getGlobal: (): Promise<InstancePreset[]> => ipcRenderer.invoke(IPC_CHANNELS.PRESET_GET_GLOBAL),

    getAll: (): Promise<InstancePreset[]> => ipcRenderer.invoke(IPC_CHANNELS.PRESET_GET_ALL),

    duplicate: (id: string, newName: string): Promise<InstancePreset | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.PRESET_DUPLICATE, id, newName),
  },
});

// Type declarations for renderer
declare global {
  interface Window {
    electronAPI: {
      project: {
        create: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
        update: (project: Project) => Promise<Project>;
        delete: (id: string) => Promise<void>;
        getAll: () => Promise<Project[]>;
        getById: (id: string) => Promise<Project | null>;
      };
      instance: {
        create: (config: {
          projectId: string;
          model: ClaudeModel;
          mode: InstanceMode;
          prompt?: string;
          planMode?: boolean;
          verbose?: boolean;
          skipPermissions?: boolean;
          usePermissionPromptTool?: boolean;
        }) => Promise<ClaudeInstance>;
        kill: (id: string, force?: boolean) => Promise<void>;
        sendInput: (id: string, input: string) => Promise<void>;
        getAll: () => Promise<ClaudeInstance[]>;
        getByProject: (projectId: string) => Promise<ClaudeInstance[]>;
        resize: (id: string, cols: number, rows: number) => void;
        forceRepaint: (id: string, method: 'fake-resize' | 'ansi-clear') => Promise<boolean>;
        resume: (config: {
          projectId: string;
          sessionId: string;
          model: ClaudeModel;
          mode: InstanceMode;
          prompt?: string;
        }) => Promise<ClaudeInstance>;
        onOutput: (callback: (instanceId: string, data: StreamMessage) => void) => () => void;
        onStatus: (callback: (instanceId: string, status: InstanceStatus) => void) => () => void;
        onError: (callback: (instanceId: string, error: string) => void) => () => void;
        onExit: (callback: (instanceId: string, code: number) => void) => () => void;
        onRawOutput: (callback: (instanceId: string, data: string) => void) => () => void;
        onSessionId: (callback: (instanceId: string, sessionId: string) => void) => () => void;
        onTerminalTitle: (callback: (instanceId: string, title: string) => void) => () => void;
        onDimensionSync: (
          callback: (instanceId: string, cols: number, rows: number) => void
        ) => () => void;
        onSync: (callback: (instances: ClaudeInstance[]) => void) => () => void;
        setTitle: (id: string, title: string) => Promise<void>;
      };
      conversation: {
        create: (data: {
          projectId: string;
          title: string;
          initialPrompt: string;
          model: ClaudeModel;
          mode: InstanceMode;
        }) => Promise<Conversation>;
        update: (
          id: string,
          updates: Partial<{
            sessionId: string;
            status: ConversationStatus;
            totalCostUsd: number;
            messageCount: number;
            title: string;
          }>
        ) => Promise<Conversation | null>;
        delete: (id: string) => Promise<void>;
        getByProject: (projectId: string) => Promise<Conversation[]>;
        getById: (id: string) => Promise<Conversation | null>;
        addMessage: (data: {
          conversationId: string;
          type: string;
          content: string;
          costUsd?: number;
        }) => Promise<ConversationMessage>;
        getMessages: (conversationId: string) => Promise<ConversationMessage[]>;
      };
      config: {
        getClaudeSettings: () => Promise<ClaudeSettings | null>;
        getMcpServers: () => Promise<McpServer[]>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      dialog: {
        selectDirectory: () => Promise<string | null>;
      };
      session: {
        getAvailable: (projectPath: string) => Promise<ClaudeSessionInfo[]>;
        getCount: (projectPath: string) => Promise<number>;
        import: (
          sessionId: string,
          projectId: string,
          projectPath: string
        ) => Promise<SessionImportResult>;
        importBatch: (
          sessionIds: string[],
          projectId: string,
          projectPath: string
        ) => Promise<SessionImportBatchResult>;
        checkInstalled: () => Promise<boolean>;
      };
      remote: {
        getConfig: () => Promise<RemoteConfig>;
        updateConfig: (config: Partial<RemoteConfig>) => Promise<RemoteConfig>;
        setPassword: (password: string) => Promise<RemoteConfig>;
        startServer: (
          port?: number
        ) => Promise<{ success: boolean; status?: RemoteServerStatus; error?: string }>;
        stopServer: () => Promise<{ success: boolean }>;
        getStatus: () => Promise<RemoteServerStatus>;
        kickSession: (sessionId: string) => Promise<{ success: boolean }>;
        getQrCode: () => Promise<{
          success: boolean;
          qrCode?: string;
          url?: string;
          error?: string;
        }>;
      };
      cluster: {
        getConfig: () => Promise<ClusterConfig>;
        updateConfig: (config: Partial<ClusterConfig>) => Promise<ClusterConfig>;
        getStatus: () => Promise<ClusterStatus>;
        start: () => Promise<{ success: boolean; status?: ClusterStatus; error?: string }>;
        stop: () => Promise<{ success: boolean; error?: string }>;
        generateSecret: () => Promise<{ success: boolean; secret?: string }>;
        getGlobalProjects: () => Promise<GlobalProject[]>;
        getGlobalInstances: () => Promise<GlobalInstance[]>;
        createRemoteInstance: (
          request: RemoteInstanceRequest
        ) => Promise<{ success: boolean; data?: ClaudeInstance; error?: string }>;
        sendRemoteInput: (
          instanceId: string,
          nodeId: string,
          input: string
        ) => Promise<{ success: boolean }>;
        killRemoteInstance: (instanceId: string, nodeId: string) => Promise<{ success: boolean }>;
        createRemoteShell: (
          nodeId: string,
          projectId: string
        ) => Promise<{ success: boolean; error?: string }>;
        resizeRemoteInstance: (
          instanceId: string,
          nodeId: string,
          cols: number,
          rows: number
        ) => Promise<{ success: boolean }>;
        onStateChanged: (callback: (state: ClusterState) => void) => () => void;
        onNodeJoined: (callback: (node: ClusterNode) => void) => () => void;
        onNodeLeft: (callback: (nodeId: string) => void) => () => void;
        onConnected: (callback: () => void) => () => void;
        onDisconnected: (callback: () => void) => () => void;
        onError: (callback: (error: string) => void) => () => void;
        onPermissionsChanged: (
          callback: (event: ClusterPermissionChangeEvent) => void
        ) => () => void;
        getPrivacy: () => Promise<ClusterNodePrivacy>;
        updatePrivacy: (privacy: Partial<ClusterNodePrivacy>) => Promise<ClusterNodePrivacy>;
        getInstancePermissions: (instanceId: string) => Promise<InstanceClusterPermissions>;
        setInstancePermissions: (
          instanceId: string,
          perms: Partial<InstanceClusterPermissions>
        ) => Promise<InstanceClusterPermissions>;
      };
      uiSettings: {
        get: () => Promise<UISettings>;
        update: (settings: Partial<UISettings>) => Promise<UISettings>;
      };
      security: {
        getConfig: () => Promise<SecurityConfig>;
        updateConfig: (config: Partial<SecurityConfig>) => Promise<SecurityConfig>;
        getIpRules: () => Promise<IpAccessRule[]>;
        addIpRule: (rule: Omit<IpAccessRule, 'id' | 'createdAt'>) => Promise<IpAccessRule>;
        deleteIpRule: (id: string) => Promise<{ success: boolean }>;
        testIp: (ip: string) => Promise<{ allowed: boolean; reason?: string }>;
        getAuditLog: (options?: AuditLogQueryOptions) => Promise<AuditLogEntry[]>;
        getAuditLogCount: () => Promise<number>;
        clearAuditLog: () => Promise<{ success: boolean }>;
        getLockouts: () => Promise<
          Array<{ ip: string; lockedAt: number; expiresAt: number; attempts: number }>
        >;
        unlockIp: (ip: string) => Promise<{ success: boolean }>;
      };
      shell: {
        openTerminal: (path: string) => Promise<{ success: boolean; error?: string }>;
        openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
        create: (projectId: string) => Promise<ShellInstance>;
        kill: (id: string) => Promise<void>;
        sendInput: (id: string, input: string) => Promise<void>;
        resize: (id: string, cols: number, rows: number) => void;
        getAvailable: () => Promise<
          Array<{
            id: string;
            name: string;
            path: string;
            isDefault: boolean;
            canRunClaude: boolean;
          }>
        >;
        onRawOutput: (callback: (shellId: string, data: string) => void) => () => void;
        onStatus: (callback: (shellId: string, status: ShellInstanceStatus) => void) => () => void;
        onExit: (callback: (shellId: string, code: number) => void) => () => void;
      };
      localSettings: {
        read: (projectPath: string) => Promise<{
          success: boolean;
          content?: string | null;
          exists?: boolean;
          error?: string;
        }>;
        write: (
          projectPath: string,
          content: string
        ) => Promise<{ success: boolean; error?: string }>;
      };
      notification: {
        getAll: (options?: NotificationFilterOptions) => Promise<DashboardNotification[]>;
        getStats: () => Promise<NotificationStats>;
        markRead: (id: string) => Promise<boolean>;
        markAllRead: () => Promise<number>;
        dismiss: (id: string) => Promise<boolean>;
        delete: (id: string) => Promise<boolean>;
        clearAll: () => Promise<{ success: boolean }>;
        getPreferences: () => Promise<NotificationPreferences>;
        setPreferences: (prefs: Partial<NotificationPreferences>) => Promise<{ success: boolean }>;
        onNew: (callback: (notification: DashboardNotification) => void) => () => void;
        onUpdated: (callback: (notification: DashboardNotification) => void) => () => void;
        onDismissed: (callback: (id: string) => void) => () => void;
        onDeleted: (callback: (id: string) => void) => () => void;
        onCleared: (callback: () => void) => () => void;
        onAllRead: (callback: () => void) => () => void;
        onClicked: (callback: (id: string) => void) => () => void;
      };
      hook: {
        getTemplates: () => Promise<HookTemplate[]>;
        setupProject: (
          projectPath: string,
          settings: DashboardHookSettings,
          templateId?: HookTemplateType
        ) => Promise<{ success: boolean; error?: string }>;
        removeProject: (projectPath: string) => Promise<{ success: boolean; error?: string }>;
        getProjectSettings: (projectPath: string) => Promise<DashboardHookSettings | null>;
        hasConfigured: (projectPath: string) => Promise<boolean>;
        onActivity: (
          callback: (
            event: Electron.IpcRendererEvent,
            data: { instanceId: string; toolName?: string; files?: string[]; timestamp: number }
          ) => void
        ) => () => void;
      };
      orchestration: {
        setupAgentMd: (
          projectPath: string
        ) => Promise<{ success: boolean; path?: string; error?: string }>;
      };
      agent: {
        discover: (
          projectPath: string
        ) => Promise<Array<{ name: string; path: string; source: 'project' | 'global' }>>;
        validateFile: (agentPath: string) => Promise<boolean>;
      };
      skill: {
        getAvailable: () => Promise<Array<{ id: string; name: string; description: string }>>;
        install: (
          projectPath: string,
          skillIds: string[]
        ) => Promise<{ success: boolean; installed: string[]; errors: string[] }>;
        remove: (
          projectPath: string,
          skillId: string
        ) => Promise<{ success: boolean; error?: string }>;
        getInstalled: (projectPath: string) => Promise<string[]>;
      };
      permission: {
        getConfig: () => Promise<GlobalPermissionConfig>;
        setConfig: (config: Partial<GlobalPermissionConfig>) => Promise<{ success: boolean }>;
        addRule: (
          rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
        ) => Promise<PermissionRule>;
        updateRule: (
          id: string,
          updates: Partial<PermissionRule>
        ) => Promise<PermissionRule | null>;
        removeRule: (id: string) => Promise<boolean>;
        getLog: (options?: PermissionLogQueryOptions) => Promise<PermissionLogEntry[]>;
        getStats: () => Promise<PermissionStats>;
        clearLog: () => Promise<{ success: boolean }>;
      };
      permissionPrompt: {
        onRequest: (
          callback: (request: {
            id: string;
            instanceId: string;
            toolName: string;
            toolInput: Record<string, unknown>;
            createdAt: number;
          }) => void
        ) => () => void;
        onTimeout: (
          callback: (request: {
            id: string;
            instanceId: string;
            toolName: string;
            toolInput: Record<string, unknown>;
            createdAt: number;
          }) => void
        ) => () => void;
        respond: (
          permissionId: string,
          response: {
            allowed: boolean;
            updatedInput?: Record<string, unknown>;
            message?: string;
          }
        ) => Promise<{ success: boolean }>;
        cancel: (permissionId: string) => Promise<{ success: boolean }>;
      };
      metrics: {
        getToolUsage: (options?: MetricsQueryOptions) => Promise<ToolUsageMetric[]>;
        getSessions: (options?: MetricsQueryOptions) => Promise<SessionMetric[]>;
        getProjectSummary: (projectId: string) => Promise<ProjectMetricsSummary>;
        getTimeSeries: (options?: MetricsQueryOptions) => Promise<MetricsTimeSeries>;
        getDashboardSummary: () => Promise<DashboardMetricsSummary>;
        getCostBreakdown: (options?: MetricsQueryOptions) => Promise<CostBreakdown>;
        getUsageTrends: (period?: MetricsPeriod) => Promise<UsageTrends>;
        clear: () => Promise<{ success: boolean }>;
      };
      git: {
        getStatus: (projectId: string) => Promise<GitStatus | null>;
        refresh: (projectId: string) => Promise<GitStatus | null>;
        onStatusChanged: (callback: (projectId: string, status: GitStatus) => void) => () => void;
      };
      subagent: {
        getByInstance: (instanceId: string) => Promise<SubagentInstance[]>;
        getAll: () => Promise<SubagentInstance[]>;
        onStarted: (
          callback: (instanceId: string, subagent: SubagentInstance) => void
        ) => () => void;
        onCompleted: (
          callback: (instanceId: string, subagent: SubagentInstance) => void
        ) => () => void;
      };
      task: {
        getByInstance: (instanceId: string) => Promise<TrackedTask[]>;
        getAll: () => Promise<TrackedTask[]>;
        onCreated: (callback: (instanceId: string, task: TrackedTask) => void) => () => void;
        onUpdated: (callback: (instanceId: string, task: TrackedTask) => void) => () => void;
        onList: (callback: (instanceId: string, tasks: TrackedTask[]) => void) => () => void;
      };
      proxy: {
        getConfig: () => Promise<{ success: boolean; data?: ProxyConfig; error?: string }>;
        updateConfig: (
          config: Partial<ProxyConfig>
        ) => Promise<{ success: boolean; data?: ProxyConfig; error?: string }>;
        getPorts: () => Promise<{ success: boolean; data?: AllowedPort[]; error?: string }>;
        addPort: (
          port: number,
          description?: string
        ) => Promise<{ success: boolean; data?: AllowedPort; error?: string }>;
        removePort: (port: number) => Promise<{ success: boolean; error?: string }>;
        onOpen: (
          callback: (data: {
            port: number;
            path?: string;
            split?: boolean;
            title?: string;
            instanceId?: string;
          }) => void
        ) => () => void;
      };
      devtools: {
        registerView: (viewId: string, instanceId: string) => Promise<{ success: boolean }>;
        unregisterView: (viewId: string) => Promise<{ success: boolean }>;
        addConsoleEntry: (
          viewId: string,
          entry: {
            level: 'log' | 'warn' | 'error' | 'info' | 'debug';
            message: string;
            timestamp: number;
            source?: string;
            line?: number;
          }
        ) => Promise<{ success: boolean }>;
        clearConsole: (viewId: string) => Promise<{ success: boolean }>;
        toggleInspector: (viewId: string, enabled?: boolean) => Promise<{ success: boolean }>;
        sendToTerminal: (
          instanceId: string,
          html: string
        ) => Promise<{ success: boolean; error?: string }>;
        onCommand: (
          callback: (data: {
            viewId?: string;
            instanceId?: string;
            command: { type: string };
          }) => void
        ) => () => void;
      };
      pool: {
        getConfig: () => Promise<TerminalPoolConfig>;
        updateConfig: (config: Partial<TerminalPoolConfig>) => Promise<TerminalPoolConfig>;
        getStats: () => Promise<TerminalPoolStats>;
        resetStats: () => Promise<{ success: boolean }>;
      };
      context: {
        getInstances: (projectId: string) => Promise<SharedInstanceContext[]>;
        getInstance: (instanceId: string) => Promise<SharedInstanceContext | null>;
        getProjectKnowledge: (projectId: string) => Promise<ProjectSharedKnowledge | null>;
        getSummary: (projectId: string) => Promise<ProjectContextSummary>;
        getStats: () => Promise<{
          activeInstances: number;
          projectsWithKnowledge: number;
          totalConventions: number;
          totalImportantFiles: number;
          totalWarnings: number;
        }>;
        onUpdated: (callback: (event: ContextUpdateEvent) => void) => () => void;
        onInstanceUpdated: (
          callback: (projectId: string, context: SharedInstanceContext) => void
        ) => () => void;
        onKnowledgeUpdated: (
          callback: (projectId: string, knowledge: ProjectSharedKnowledge) => void
        ) => () => void;
      };
      ssl: {
        validateCert: (certPath: string) => Promise<{
          valid: boolean;
          error?: string;
          subject?: string;
          issuer?: string;
          validFrom?: Date;
          validTo?: Date;
          daysRemaining?: number;
          isSelfSigned?: boolean;
          fingerprint?: string;
        }>;
        generateSelfSigned: (
          hostname?: string,
          days?: number
        ) => Promise<{ success: boolean; certPath?: string; keyPath?: string; error?: string }>;
        getCertInfo: (certPath: string) => Promise<{
          success: boolean;
          info?: {
            subject: {
              commonName?: string;
              organization?: string;
              organizationalUnit?: string;
              country?: string;
            };
            issuer: { commonName?: string; organization?: string };
            validFrom: Date;
            validTo: Date;
            serialNumber: string;
            fingerprint: string;
            isSelfSigned: boolean;
          };
          error?: string;
        }>;
        validateCertKeyPair: (
          certPath: string,
          keyPath: string,
          passphrase?: string
        ) => Promise<{ valid: boolean; error?: string }>;
        generateLetsEncrypt: (
          domain: string,
          email?: string
        ) => Promise<{ success: boolean; certPath?: string; keyPath?: string; error?: string }>;
      };
      update: {
        check: () => Promise<{
          updateAvailable: boolean;
          currentVersion: string;
          latestVersion: string;
          releaseNotes?: string;
          releaseUrl?: string;
          publishedAt?: string;
        }>;
        download: () => Promise<void>;
        install: () => void;
        getVersion: () => Promise<string>;
        onChecking: (callback: () => void) => () => void;
        onAvailable: (
          callback: (data: { version: string; releaseNotes?: string; releaseDate?: string }) => void
        ) => () => void;
        onNotAvailable: (callback: (data: { version: string }) => void) => () => void;
        onProgress: (
          callback: (data: {
            percent: number;
            bytesPerSecond: number;
            total: number;
            transferred: number;
          }) => void
        ) => () => void;
        onDownloaded: (callback: (data: { version: string }) => void) => () => void;
        onError: (callback: (data: { message: string }) => void) => () => void;
        onStartupAvailable: (
          callback: (data: {
            updateAvailable: boolean;
            currentVersion: string;
            latestVersion: string;
            releaseNotes?: string;
            releaseUrl?: string;
          }) => void
        ) => () => void;
      };
      ralphTask: {
        create: (input: CreateRalphTaskInput) => Promise<RalphTask>;
        update: (id: string, updates: UpdateRalphTaskInput) => Promise<RalphTask | null>;
        delete: (id: string) => Promise<boolean>;
        getByProject: (projectId: string) => Promise<RalphTask[]>;
        getById: (id: string) => Promise<RalphTask | null>;
        move: (input: MoveRalphTaskInput) => Promise<RalphTask | null>;
        reorder: (input: ReorderRalphTasksInput) => Promise<RalphTask[]>;
        start: (taskId: string, isInteractive?: boolean) => Promise<RalphTask | null>;
        stop: (taskId: string) => Promise<RalphTask | null>;
        respondToHelp: (taskId: string, response: string) => Promise<RalphTask | null>;
        processAll: (projectId: string) => Promise<boolean>;
        stopAll: (projectId: string) => Promise<boolean>;
        onCreated: (callback: (task: RalphTask) => void) => () => void;
        onUpdated: (callback: (task: RalphTask) => void) => () => void;
        onDeleted: (callback: (taskId: string) => void) => () => void;
        onHelpRequested: (callback: (request: RalphTaskHelpRequest) => void) => () => void;
        onLoopStarted: (callback: (taskId: string, loopCount: number) => void) => () => void;
        onLoopCompleted: (callback: (taskId: string) => void) => () => void;
        onProcessAllStarted: (callback: (projectId: string) => void) => () => void;
        onProcessAllCompleted: (callback: (projectId: string) => void) => () => void;
        onProcessAllStopped: (callback: (projectId: string) => void) => () => void;
      };
      preset: {
        create: (data: CreatePresetInput) => Promise<InstancePreset>;
        update: (id: string, updates: UpdatePresetInput) => Promise<InstancePreset | null>;
        delete: (id: string) => Promise<{ success: boolean }>;
        getById: (id: string) => Promise<InstancePreset | null>;
        getByProject: (projectId: string) => Promise<InstancePreset[]>;
        getGlobal: () => Promise<InstancePreset[]>;
        getAll: () => Promise<InstancePreset[]>;
        duplicate: (id: string, newName: string) => Promise<InstancePreset | null>;
      };
    };
  }
}
