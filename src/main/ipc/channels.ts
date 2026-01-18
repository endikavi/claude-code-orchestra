// IPC Channel names - keep in sync between main and renderer
export const IPC_CHANNELS = {
  // Project operations
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_GET_ALL: 'project:getAll',
  PROJECT_GET_BY_ID: 'project:getById',

  // Instance operations
  INSTANCE_CREATE: 'instance:create',
  INSTANCE_KILL: 'instance:kill',
  INSTANCE_SEND_INPUT: 'instance:sendInput',
  INSTANCE_SET_TITLE: 'instance:setTitle',
  INSTANCE_GET_ALL: 'instance:getAll',
  INSTANCE_GET_BY_PROJECT: 'instance:getByProject',

  // Instance events (main -> renderer)
  INSTANCE_OUTPUT: 'instance:output',
  INSTANCE_STATUS: 'instance:status',
  INSTANCE_ERROR: 'instance:error',
  INSTANCE_EXIT: 'instance:exit',
  INSTANCE_RAW_OUTPUT: 'instance:rawOutput',
  INSTANCE_SESSION_ID: 'instance:sessionId',
  INSTANCE_TERMINAL_TITLE: 'instance:terminalTitle',
  INSTANCE_RESUME: 'instance:resume',
  INSTANCE_SYNC: 'instance:sync', // Sync all instances to renderer (for remote updates)

  // Conversation operations
  CONVERSATION_CREATE: 'conversation:create',
  CONVERSATION_UPDATE: 'conversation:update',
  CONVERSATION_DELETE: 'conversation:delete',
  CONVERSATION_GET_BY_PROJECT: 'conversation:getByProject',
  CONVERSATION_GET_BY_ID: 'conversation:getById',
  CONVERSATION_ADD_MESSAGE: 'conversation:addMessage',
  CONVERSATION_GET_MESSAGES: 'conversation:getMessages',

  // Config operations
  CONFIG_GET_CLAUDE_SETTINGS: 'config:getClaudeSettings',
  CONFIG_GET_MCP_SERVERS: 'config:getMcpServers',

  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Dialog operations
  DIALOG_SELECT_DIRECTORY: 'dialog:selectDirectory',

  // Session import operations
  SESSION_GET_AVAILABLE: 'session:getAvailable',
  SESSION_GET_COUNT: 'session:getCount',
  SESSION_IMPORT: 'session:import',
  SESSION_IMPORT_BATCH: 'session:importBatch',
  SESSION_CHECK_INSTALLED: 'session:checkInstalled',

  // Remote access operations
  REMOTE_GET_CONFIG: 'remote:getConfig',
  REMOTE_UPDATE_CONFIG: 'remote:updateConfig',
  REMOTE_SET_PASSWORD: 'remote:setPassword',
  REMOTE_START_SERVER: 'remote:startServer',
  REMOTE_STOP_SERVER: 'remote:stopServer',
  REMOTE_GET_STATUS: 'remote:getStatus',
  REMOTE_KICK_SESSION: 'remote:kickSession',
  REMOTE_GET_QR_CODE: 'remote:getQrCode',

  // Cluster operations
  CLUSTER_GET_CONFIG: 'cluster:getConfig',
  CLUSTER_UPDATE_CONFIG: 'cluster:updateConfig',
  CLUSTER_GET_STATUS: 'cluster:getStatus',
  CLUSTER_START: 'cluster:start',
  CLUSTER_STOP: 'cluster:stop',
  CLUSTER_GENERATE_SECRET: 'cluster:generateSecret',
  CLUSTER_GET_GLOBAL_PROJECTS: 'cluster:getGlobalProjects',
  CLUSTER_GET_GLOBAL_INSTANCES: 'cluster:getGlobalInstances',
  CLUSTER_CREATE_REMOTE_INSTANCE: 'cluster:createRemoteInstance',
  CLUSTER_SEND_REMOTE_INPUT: 'cluster:sendRemoteInput',
  CLUSTER_KILL_REMOTE_INSTANCE: 'cluster:killRemoteInstance',
  CLUSTER_CREATE_REMOTE_SHELL: 'cluster:createRemoteShell',
  CLUSTER_RESIZE_REMOTE_INSTANCE: 'cluster:resizeRemoteInstance',

  // Cluster events (main -> renderer)
  CLUSTER_STATE_CHANGED: 'cluster:stateChanged',
  CLUSTER_NODE_JOINED: 'cluster:nodeJoined',
  CLUSTER_NODE_LEFT: 'cluster:nodeLeft',
  CLUSTER_CONNECTED: 'cluster:connected',
  CLUSTER_DISCONNECTED: 'cluster:disconnected',
  CLUSTER_ERROR: 'cluster:error',

  // UI Settings operations
  UI_SETTINGS_GET: 'uiSettings:get',
  UI_SETTINGS_UPDATE: 'uiSettings:update',

  // Security operations
  SECURITY_GET_CONFIG: 'security:getConfig',
  SECURITY_UPDATE_CONFIG: 'security:updateConfig',
  SECURITY_GET_IP_RULES: 'security:getIpRules',
  SECURITY_ADD_IP_RULE: 'security:addIpRule',
  SECURITY_DELETE_IP_RULE: 'security:deleteIpRule',
  SECURITY_TEST_IP: 'security:testIp',
  SECURITY_GET_AUDIT_LOG: 'security:getAuditLog',
  SECURITY_GET_AUDIT_LOG_COUNT: 'security:getAuditLogCount',
  SECURITY_CLEAR_AUDIT_LOG: 'security:clearAuditLog',
  SECURITY_GET_LOCKOUTS: 'security:getLockouts',
  SECURITY_UNLOCK_IP: 'security:unlockIp',

  // Shell operations (external terminal - legacy)
  SHELL_OPEN_TERMINAL: 'shell:openTerminal',

  // Integrated shell operations
  SHELL_CREATE: 'shell:create',
  SHELL_KILL: 'shell:kill',
  SHELL_SEND_INPUT: 'shell:sendInput',
  SHELL_RESIZE: 'shell:resize',
  SHELL_RAW_OUTPUT: 'shell:rawOutput',
  SHELL_STATUS: 'shell:status',
  SHELL_EXIT: 'shell:exit',

  // Local Settings operations (settings.local.json)
  LOCAL_SETTINGS_READ: 'localSettings:read',
  LOCAL_SETTINGS_WRITE: 'localSettings:write',

  // System shell detection
  SHELL_GET_AVAILABLE: 'shell:getAvailable',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
