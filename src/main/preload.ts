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
    }): Promise<ClaudeInstance> => ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_CREATE, config),

    kill: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_KILL, id),

    sendInput: (id: string, input: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_SEND_INPUT, id, input),

    getAll: (): Promise<ClaudeInstance[]> => ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_GET_ALL),

    getByProject: (projectId: string): Promise<ClaudeInstance[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.INSTANCE_GET_BY_PROJECT, projectId),

    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('instance:resize', id, cols, rows),

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
        }) => Promise<ClaudeInstance>;
        kill: (id: string) => Promise<void>;
        sendInput: (id: string, input: string) => Promise<void>;
        getAll: () => Promise<ClaudeInstance[]>;
        getByProject: (projectId: string) => Promise<ClaudeInstance[]>;
        resize: (id: string, cols: number, rows: number) => void;
        resume: (config: {
          projectId: string;
          sessionId: string;
          model: ClaudeModel;
          mode: InstanceMode;
        }) => Promise<ClaudeInstance>;
        onOutput: (callback: (instanceId: string, data: StreamMessage) => void) => () => void;
        onStatus: (callback: (instanceId: string, status: InstanceStatus) => void) => () => void;
        onError: (callback: (instanceId: string, error: string) => void) => () => void;
        onExit: (callback: (instanceId: string, code: number) => void) => () => void;
        onRawOutput: (callback: (instanceId: string, data: string) => void) => () => void;
        onSessionId: (callback: (instanceId: string, sessionId: string) => void) => () => void;
        onTerminalTitle: (callback: (instanceId: string, title: string) => void) => () => void;
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
    };
  }
}
