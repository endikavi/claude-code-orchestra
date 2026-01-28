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
  INSTANCE_CREATE_PENDING: 'instance:createPending', // Create instance without starting Claude process
  INSTANCE_ACTIVATE: 'instance:activate', // Activate pending instance with first message
  INSTANCE_KILL: 'instance:kill',
  INSTANCE_SEND_INPUT: 'instance:sendInput',
  INSTANCE_SET_TITLE: 'instance:setTitle',
  INSTANCE_GET_ALL: 'instance:getAll',
  INSTANCE_GET_BY_PROJECT: 'instance:getByProject',
  INSTANCE_FORCE_REPAINT: 'instance:forceRepaint', // Experimental TUI repaint

  // Instance events (main -> renderer)
  INSTANCE_OUTPUT: 'instance:output',
  INSTANCE_STATUS: 'instance:status',
  INSTANCE_ERROR: 'instance:error',
  INSTANCE_EXIT: 'instance:exit',
  INSTANCE_RAW_OUTPUT: 'instance:rawOutput',
  INSTANCE_SESSION_ID: 'instance:sessionId',
  INSTANCE_TERMINAL_TITLE: 'instance:terminalTitle',
  INSTANCE_DIMENSION_SYNC: 'instance:dimensionSync', // Terminal dimension sync for multi-client
  INSTANCE_RESUME: 'instance:resume',
  INSTANCE_SYNC: 'instance:sync', // Sync all instances to renderer (for remote updates)
  INSTANCE_HOOK_STATUS: 'instance:hookStatus', // Hook status updates from dashboard integration

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

  // External link operations
  OPEN_EXTERNAL: 'shell:openExternal',

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
  CLUSTER_PERMISSIONS_CHANGED: 'cluster:permissionsChanged',
  CLUSTER_PERMISSION_DENIED: 'cluster:permissionDenied',

  // Cluster privacy operations
  CLUSTER_GET_PRIVACY: 'cluster:getPrivacy',
  CLUSTER_UPDATE_PRIVACY: 'cluster:updatePrivacy',

  // Instance cluster permission operations
  INSTANCE_GET_CLUSTER_PERMISSIONS: 'instance:getClusterPermissions',
  INSTANCE_SET_CLUSTER_PERMISSIONS: 'instance:setClusterPermissions',

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

  // Notification operations
  NOTIFICATION_GET_ALL: 'notification:getAll',
  NOTIFICATION_GET_STATS: 'notification:getStats',
  NOTIFICATION_MARK_READ: 'notification:markRead',
  NOTIFICATION_MARK_ALL_READ: 'notification:markAllRead',
  NOTIFICATION_DISMISS: 'notification:dismiss',
  NOTIFICATION_DELETE: 'notification:delete',
  NOTIFICATION_CLEAR_ALL: 'notification:clearAll',
  NOTIFICATION_GET_PREFERENCES: 'notification:getPreferences',
  NOTIFICATION_SET_PREFERENCES: 'notification:setPreferences',

  // Notification events (main -> renderer)
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_UPDATED: 'notification:updated',
  NOTIFICATION_DISMISSED: 'notification:dismissed',
  NOTIFICATION_DELETED: 'notification:deleted',
  NOTIFICATION_CLEARED: 'notification:cleared',
  NOTIFICATION_ALL_READ: 'notification:allRead',
  NOTIFICATION_CLICKED: 'notification:clicked',

  // Hook operations
  HOOK_SETUP_PROJECT: 'hook:setupProject',
  HOOK_REMOVE_PROJECT: 'hook:removeProject',
  HOOK_GET_TEMPLATES: 'hook:getTemplates',
  HOOK_GET_PROJECT_SETTINGS: 'hook:getProjectSettings',
  HOOK_HAS_CONFIGURED: 'hook:hasConfigured',

  // Orchestration operations
  ORCHESTRATION_SETUP_AGENT_MD: 'orchestration:setupAgentMd',

  // Agent discovery operations
  AGENT_DISCOVER: 'agent:discover',
  AGENT_VALIDATE_FILE: 'agent:validateFile',

  // Hook events (main -> renderer)
  HOOK_ACTIVITY: 'hook:activity', // Real-time activity tracking from hooks

  // Skill operations
  SKILL_GET_AVAILABLE: 'skill:getAvailable',
  SKILL_INSTALL: 'skill:install',
  SKILL_REMOVE: 'skill:remove',
  SKILL_GET_INSTALLED: 'skill:getInstalled',

  // Permission operations
  PERMISSION_GET_CONFIG: 'permission:getConfig',
  PERMISSION_SET_CONFIG: 'permission:setConfig',
  PERMISSION_ADD_RULE: 'permission:addRule',
  PERMISSION_UPDATE_RULE: 'permission:updateRule',
  PERMISSION_REMOVE_RULE: 'permission:removeRule',
  PERMISSION_GET_LOG: 'permission:getLog',
  PERMISSION_GET_STATS: 'permission:getStats',
  PERMISSION_CLEAR_LOG: 'permission:clearLog',

  // Permission Prompt operations (for --permission-prompt-tool support)
  PERMISSION_PROMPT_REQUEST: 'permissionPrompt:request', // Event: main -> renderer (permission needed)
  PERMISSION_PROMPT_RESPOND: 'permissionPrompt:respond', // Action: renderer -> main (user decision)
  PERMISSION_PROMPT_CANCEL: 'permissionPrompt:cancel', // Action: renderer -> main (cancel request)
  PERMISSION_PROMPT_TIMEOUT: 'permissionPrompt:timeout', // Event: main -> renderer (request timed out)

  // Metrics operations
  METRICS_GET_TOOL_USAGE: 'metrics:getToolUsage',
  METRICS_GET_SESSIONS: 'metrics:getSessions',
  METRICS_GET_PROJECT_SUMMARY: 'metrics:getProjectSummary',
  METRICS_GET_TIME_SERIES: 'metrics:getTimeSeries',
  METRICS_GET_DASHBOARD_SUMMARY: 'metrics:getDashboardSummary',
  METRICS_GET_COST_BREAKDOWN: 'metrics:getCostBreakdown',
  METRICS_GET_USAGE_TRENDS: 'metrics:getUsageTrends',
  METRICS_CLEAR: 'metrics:clear',

  // Git status operations
  GIT_GET_STATUS: 'git:getStatus',
  GIT_REFRESH: 'git:refresh',
  GIT_STATUS_CHANGED: 'git:statusChanged', // Event: main -> renderer

  // Subagent operations (native Claude Task tool tracking)
  SUBAGENT_GET_BY_INSTANCE: 'subagent:getByInstance',
  SUBAGENT_GET_ALL: 'subagent:getAll',

  // Subagent events (main -> renderer)
  SUBAGENT_STARTED: 'subagent:started',
  SUBAGENT_COMPLETED: 'subagent:completed',

  // Task operations (Claude Code TaskCreate/TaskUpdate/TaskList tools)
  TASK_GET_BY_INSTANCE: 'task:getByInstance',
  TASK_GET_ALL: 'task:getAll',

  // Task events (main -> renderer)
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_LIST: 'task:list',

  // Proxy operations (web preview tunneling)
  PROXY_GET_CONFIG: 'proxy:getConfig',
  PROXY_UPDATE_CONFIG: 'proxy:updateConfig',
  PROXY_GET_PORTS: 'proxy:getPorts',
  PROXY_ADD_PORT: 'proxy:addPort',
  PROXY_REMOVE_PORT: 'proxy:removePort',

  // Proxy events (main -> renderer)
  PROXY_OPEN: 'proxy:open',

  // DevTools operations
  DEVTOOLS_REGISTER_VIEW: 'devtools:registerView',
  DEVTOOLS_UNREGISTER_VIEW: 'devtools:unregisterView',
  DEVTOOLS_ADD_CONSOLE_ENTRY: 'devtools:addConsoleEntry',
  DEVTOOLS_CLEAR_CONSOLE: 'devtools:clearConsole',
  DEVTOOLS_TOGGLE_INSPECTOR: 'devtools:toggleInspector',
  DEVTOOLS_SEND_TO_TERMINAL: 'devtools:sendToTerminal',

  // DevTools events (main -> renderer)
  DEVTOOLS_COMMAND: 'devtools:command',

  // Terminal Pool operations (local-only, never exposed to web/cluster)
  POOL_GET_CONFIG: 'pool:getConfig',
  POOL_UPDATE_CONFIG: 'pool:updateConfig',
  POOL_GET_STATS: 'pool:getStats',
  POOL_RESET_STATS: 'pool:resetStats',

  // Shared Context operations
  CONTEXT_GET_INSTANCES: 'context:getInstances',
  CONTEXT_GET_INSTANCE: 'context:getInstance',
  CONTEXT_GET_PROJECT_KNOWLEDGE: 'context:getProjectKnowledge',
  CONTEXT_GET_SUMMARY: 'context:getSummary',
  CONTEXT_GET_STATS: 'context:getStats',

  // Shared Context events (main -> renderer)
  CONTEXT_INSTANCE_UPDATED: 'context:instanceUpdated',
  CONTEXT_KNOWLEDGE_UPDATED: 'context:knowledgeUpdated',
  CONTEXT_UPDATED: 'context:updated',

  // SSL/TLS operations
  SSL_VALIDATE_CERT: 'ssl:validateCert',
  SSL_GENERATE_SELF_SIGNED: 'ssl:generateSelfSigned',
  SSL_GENERATE_LETS_ENCRYPT: 'ssl:generateLetsEncrypt',
  SSL_GET_CERT_INFO: 'ssl:getCertInfo',
  SSL_VALIDATE_CERT_KEY_PAIR: 'ssl:validateCertKeyPair',

  // Update operations
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_GET_VERSION: 'update:getVersion',

  // Update events (main -> renderer)
  UPDATE_CHECKING: 'update:checking',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_NOT_AVAILABLE: 'update:notAvailable',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ERROR: 'update:error',
  UPDATE_STARTUP_AVAILABLE: 'update:startupAvailable',

  // Ralph Task operations
  RALPH_TASK_CREATE: 'ralphTask:create',
  RALPH_TASK_UPDATE: 'ralphTask:update',
  RALPH_TASK_DELETE: 'ralphTask:delete',
  RALPH_TASK_GET_BY_PROJECT: 'ralphTask:getByProject',
  RALPH_TASK_GET_BY_ID: 'ralphTask:getById',
  RALPH_TASK_MOVE: 'ralphTask:move',
  RALPH_TASK_REORDER: 'ralphTask:reorder',
  RALPH_TASK_START: 'ralphTask:start',
  RALPH_TASK_STOP: 'ralphTask:stop',
  RALPH_TASK_RESPOND_HELP: 'ralphTask:respondHelp',
  RALPH_TASK_PROCESS_ALL: 'ralphTask:processAll',
  RALPH_TASK_STOP_ALL: 'ralphTask:stopAll',

  // Ralph Task events (main -> renderer)
  RALPH_TASK_CREATED: 'ralphTask:created',
  RALPH_TASK_UPDATED: 'ralphTask:updated',
  RALPH_TASK_DELETED: 'ralphTask:deleted',
  RALPH_TASK_HELP_REQUESTED: 'ralphTask:helpRequested',
  RALPH_TASK_LOOP_STARTED: 'ralphTask:loopStarted',
  RALPH_TASK_LOOP_COMPLETED: 'ralphTask:loopCompleted',
  RALPH_TASK_PROCESS_ALL_STARTED: 'ralphTask:processAllStarted',
  RALPH_TASK_PROCESS_ALL_COMPLETED: 'ralphTask:processAllCompleted',
  RALPH_TASK_PROCESS_ALL_STOPPED: 'ralphTask:processAllStopped',

  // Instance Preset operations
  PRESET_CREATE: 'preset:create',
  PRESET_UPDATE: 'preset:update',
  PRESET_DELETE: 'preset:delete',
  PRESET_GET_BY_ID: 'preset:getById',
  PRESET_GET_BY_PROJECT: 'preset:getByProject',
  PRESET_GET_GLOBAL: 'preset:getGlobal',
  PRESET_GET_ALL: 'preset:getAll',
  PRESET_DUPLICATE: 'preset:duplicate',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
