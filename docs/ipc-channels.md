# IPC Channels Documentation

This document describes all IPC (Inter-Process Communication) channels used between the main process and renderer process in Orchestra.

## Overview

Orchestra uses Electron's IPC mechanism for communication between the main process (Node.js) and renderer process (React). All channels are defined in `src/main/ipc/channels.ts`.

## Channel Naming Convention

Channels follow the format: `domain:action`

- `project:*` - Project management operations
- `instance:*` - Claude CLI instance operations
- `conversation:*` - Conversation persistence operations
- `config:*` - Configuration reading operations
- `window:*` - Window control operations
- `dialog:*` - Native dialog operations
- `shell:*` - Integrated shell operations
- `session:*` - Claude session import operations
- `remote:*` - Remote access server operations
- `cluster:*` - Multi-node cluster operations
- `uiSettings:*` - UI settings persistence
- `security:*` - Security configuration and audit
- `localSettings:*` - Local settings file operations
- `notification:*` - Notification system operations
- `hook:*` - Claude CLI hook integration
- `skill:*` - Skill management operations
- `permission:*` - Permission rule management
- `metrics:*` - Usage metrics and analytics
- `git:*` - Git status operations
- `subagent:*` - Subagent tracking operations

## Project Channels

### `project:create`
Creates a new project.

**Direction:** Renderer → Main

**Parameters:**
```typescript
{
  name: string;        // Project name (required)
  path: string;        // Absolute path to project directory (required)
  description?: string; // Optional description
  color?: string;      // Optional color for UI
  skipPermissions?: boolean; // Skip permission prompts
}
```

**Returns:** `Project` object with generated `id`, `createdAt`, and `updatedAt`

---

### `project:update`
Updates an existing project.

**Direction:** Renderer → Main

**Parameters:** Full `Project` object

**Returns:** Updated `Project` object

---

### `project:delete`
Deletes a project and kills all associated instances.

**Direction:** Renderer → Main

**Parameters:** `id: string` - Project ID

**Returns:** `void`

---

### `project:getAll`
Gets all projects.

**Direction:** Renderer → Main

**Parameters:** None

**Returns:** `Project[]` - Array of all projects sorted by `updatedAt` descending

---

### `project:getById`
Gets a project by ID.

**Direction:** Renderer → Main

**Parameters:** `id: string` - Project ID

**Returns:** `Project | null`

---

## Instance Channels

### `instance:create`
Creates and starts a new Claude CLI instance.

**Direction:** Renderer → Main

**Parameters:**
```typescript
{
  projectId: string;        // Associated project ID
  prompt: string;          // Initial prompt
  model: 'sonnet' | 'opus' | 'haiku'; // Claude model
  mode: 'interactive' | 'print' | 'stream-json'; // Output mode
}
```

**Returns:** `ClaudeInstance` object

---

### `instance:resume`
Resumes an existing Claude CLI session.

**Direction:** Renderer → Main

**Parameters:**
```typescript
{
  projectId: string;
  sessionId: string;  // Claude session ID for --resume
  model: ClaudeModel;
  mode: InstanceMode;
}
```

**Returns:** `ClaudeInstance` object

---

### `instance:kill`
Terminates a running instance.

**Direction:** Renderer → Main

**Parameters:** `id: string` - Instance ID

**Returns:** `void`

---

### `instance:sendInput`
Sends input to an interactive instance.

**Direction:** Renderer → Main

**Parameters:**
- `id: string` - Instance ID
- `input: string` - Input text

**Returns:** `void`

---

### `instance:getAll`
Gets all active instances.

**Direction:** Renderer → Main

**Returns:** `ClaudeInstance[]`

---

### `instance:getByProject`
Gets instances for a specific project.

**Direction:** Renderer → Main

**Parameters:** `projectId: string`

**Returns:** `ClaudeInstance[]`

---

### `instance:output` (Event)
Emitted when an instance produces output.

**Direction:** Main → Renderer

**Payload:**
- `instanceId: string`
- `data: StreamMessage`

---

### `instance:status` (Event)
Emitted when an instance's status changes.

**Direction:** Main → Renderer

**Payload:**
- `instanceId: string`
- `status: InstanceStatus`

---

### `instance:error` (Event)
Emitted when an instance encounters an error.

**Direction:** Main → Renderer

**Payload:**
- `instanceId: string`
- `error: string`

---

### `instance:exit` (Event)
Emitted when an instance process exits.

**Direction:** Main → Renderer

**Payload:**
- `instanceId: string`
- `code: number`

---

### `instance:rawOutput` (Event)
Emitted for raw PTY output (for terminal display).

**Direction:** Main → Renderer

**Payload:**
- `instanceId: string`
- `data: string`

---

### `instance:sessionId` (Event)
Emitted when a Claude session ID is received.

**Direction:** Main → Renderer

**Payload:**
- `instanceId: string`
- `sessionId: string`

---

## Conversation Channels

### `conversation:create`
Creates a new persisted conversation.

**Direction:** Renderer → Main

**Parameters:**
```typescript
{
  projectId: string;
  title: string;
  initialPrompt: string;
  model: ClaudeModel;
  mode: InstanceMode;
}
```

**Returns:** `Conversation` object

---

### `conversation:update`
Updates a conversation.

**Direction:** Renderer → Main

**Parameters:**
- `id: string` - Conversation ID
- `updates: Partial<{ sessionId, status, totalCostUsd, messageCount, title }>`

**Returns:** `Conversation | null`

---

### `conversation:delete`
Deletes a conversation and its messages.

**Direction:** Renderer → Main

**Parameters:** `id: string`

**Returns:** `void`

---

### `conversation:getByProject`
Gets conversations for a project.

**Direction:** Renderer → Main

**Parameters:** `projectId: string`

**Returns:** `Conversation[]`

---

### `conversation:getById`
Gets a specific conversation.

**Direction:** Renderer → Main

**Parameters:** `id: string`

**Returns:** `Conversation | null`

---

### `conversation:addMessage`
Adds a message to a conversation.

**Direction:** Renderer → Main

**Parameters:**
```typescript
{
  conversationId: string;
  type: string;
  content: string;
  costUsd?: number;
}
```

**Returns:** `ConversationMessage` object

---

### `conversation:getMessages`
Gets messages for a conversation.

**Direction:** Renderer → Main

**Parameters:** `conversationId: string`

**Returns:** `ConversationMessage[]`

---

## Config Channels

### `config:getClaudeSettings`
Gets global Claude settings.

**Direction:** Renderer → Main

**Returns:** `ClaudeSettings | null`

---

### `config:getMcpServers`
Gets configured MCP servers.

**Direction:** Renderer → Main

**Returns:** `McpServer[]`

---

## Window Channels

### `window:minimize`
Minimizes the application window.

**Direction:** Renderer → Main (one-way)

---

### `window:maximize`
Toggles window maximize state.

**Direction:** Renderer → Main (one-way)

---

### `window:close`
Closes the application window.

**Direction:** Renderer → Main (one-way)

---

## Dialog Channels

### `dialog:selectDirectory`
Opens a native directory selection dialog.

**Direction:** Renderer → Main

**Returns:** `string | null` - Selected path or null if cancelled

---

## Shell Channels

### `shell:create`
Creates an integrated shell instance.

**Direction:** Renderer → Main

**Parameters:**
```typescript
{
  projectId: string;  // Project ID for working directory
  shell?: string;     // Optional shell type (auto-detected if not provided)
}
```

**Returns:** `ShellInstance` object

---

### `shell:kill`
Terminates a shell instance.

**Direction:** Renderer → Main

**Parameters:** `id: string` - Shell ID

**Returns:** `void`

---

### `shell:sendInput`
Sends input to a shell instance.

**Direction:** Renderer → Main

**Parameters:**
- `id: string` - Shell ID
- `input: string` - Input text

**Returns:** `void`

---

### `shell:resize`
Resizes shell terminal.

**Direction:** Renderer → Main

**Parameters:**
- `id: string` - Shell ID
- `cols: number` - Column count
- `rows: number` - Row count

**Returns:** `void`

---

### `shell:rawOutput` (Event)
Emitted when shell produces output.

**Direction:** Main → Renderer

**Payload:**
- `shellId: string`
- `data: string`

---

### `shell:status` (Event)
Emitted when shell status changes.

**Direction:** Main → Renderer

**Payload:**
- `shellId: string`
- `status: ShellInstanceStatus`

---

### `shell:exit` (Event)
Emitted when shell process exits.

**Direction:** Main → Renderer

**Payload:**
- `shellId: string`
- `code: number`

---

### `shell:getAvailable`
Gets available shells on the system.

**Direction:** Renderer → Main

**Returns:** `AvailableShell[]` - List of detected shells

---

### `shell:openTerminal`
Opens external terminal at project path (legacy).

**Direction:** Renderer → Main

**Parameters:** `projectPath: string`

**Returns:** `void`

---

## Session Channels

### `session:getAvailable`
Gets available Claude sessions for import.

**Direction:** Renderer → Main

**Parameters:** `projectPath: string`

**Returns:** `SessionInfo[]`

---

### `session:getCount`
Gets count of available sessions.

**Direction:** Renderer → Main

**Parameters:** `projectPath: string`

**Returns:** `number`

---

### `session:import`
Imports a single Claude session.

**Direction:** Renderer → Main

**Parameters:**
- `projectId: string`
- `sessionInfo: SessionInfo`

**Returns:** `Conversation`

---

### `session:importBatch`
Imports multiple sessions at once.

**Direction:** Renderer → Main

**Parameters:**
- `projectId: string`
- `sessions: SessionInfo[]`

**Returns:** `Conversation[]`

---

### `session:checkInstalled`
Checks if Claude CLI is installed.

**Direction:** Renderer → Main

**Returns:** `boolean`

---

## Remote Access Channels

### `remote:getConfig`
Gets remote access configuration.

**Direction:** Renderer → Main

**Returns:** `RemoteConfig`

---

### `remote:updateConfig`
Updates remote access configuration.

**Direction:** Renderer → Main

**Parameters:** `config: Partial<RemoteConfig>`

**Returns:** `void`

---

### `remote:setPassword`
Sets the remote access password.

**Direction:** Renderer → Main

**Parameters:** `password: string`

**Returns:** `void`

---

### `remote:startServer`
Starts the remote access server.

**Direction:** Renderer → Main

**Returns:** `void`

---

### `remote:stopServer`
Stops the remote access server.

**Direction:** Renderer → Main

**Returns:** `void`

---

### `remote:getStatus`
Gets remote server status.

**Direction:** Renderer → Main

**Returns:** `RemoteServerStatus`

---

### `remote:kickSession`
Kicks a connected remote session.

**Direction:** Renderer → Main

**Parameters:**
- `sessionId: string`
- `reason?: string`

**Returns:** `void`

---

### `remote:getQrCode`
Generates QR code for remote access URL.

**Direction:** Renderer → Main

**Returns:** `string` - Base64 encoded QR code image

---

## Cluster Channels

### `cluster:getConfig`
Gets cluster configuration.

**Direction:** Renderer → Main

**Returns:** `ClusterConfig`

---

### `cluster:updateConfig`
Updates cluster configuration.

**Direction:** Renderer → Main

**Parameters:** `config: Partial<ClusterConfig>`

**Returns:** `void`

---

### `cluster:getStatus`
Gets current cluster status.

**Direction:** Renderer → Main

**Returns:** `ClusterStatus`

---

### `cluster:start`
Starts cluster mode.

**Direction:** Renderer → Main

**Returns:** `void`

---

### `cluster:stop`
Stops cluster mode.

**Direction:** Renderer → Main

**Returns:** `void`

---

### `cluster:generateSecret`
Generates a new cluster shared secret.

**Direction:** Renderer → Main

**Returns:** `string`

---

### `cluster:getGlobalProjects`
Gets projects from all cluster nodes.

**Direction:** Renderer → Main

**Returns:** `Project[]`

---

### `cluster:getGlobalInstances`
Gets instances from all cluster nodes.

**Direction:** Renderer → Main

**Returns:** `ClaudeInstance[]`

---

### `cluster:createRemoteInstance`
Creates an instance on a remote node.

**Direction:** Renderer → Main

**Parameters:** Instance creation config with target node

**Returns:** `ClaudeInstance`

---

### `cluster:stateChanged` (Event)
Emitted when cluster state changes.

**Direction:** Main → Renderer

**Payload:** `ClusterState`

---

### `cluster:nodeJoined` (Event)
Emitted when a node joins the cluster.

**Direction:** Main → Renderer

**Payload:** `NodeInfo`

---

### `cluster:nodeLeft` (Event)
Emitted when a node leaves the cluster.

**Direction:** Main → Renderer

**Payload:** `nodeId: string`

---

## UI Settings Channels

### `uiSettings:get`
Gets UI settings.

**Direction:** Renderer → Main

**Returns:** `UISettings`

---

### `uiSettings:update`
Updates UI settings.

**Direction:** Renderer → Main

**Parameters:** `settings: Partial<UISettings>`

**Returns:** `void`

---

## Security Channels

### `security:getConfig`
Gets security configuration.

**Direction:** Renderer → Main

**Returns:** `SecurityConfig`

---

### `security:updateConfig`
Updates security configuration.

**Direction:** Renderer → Main

**Parameters:** `config: Partial<SecurityConfig>`

**Returns:** `void`

---

### `security:getIpRules`
Gets IP access rules.

**Direction:** Renderer → Main

**Returns:** `IpAccessRule[]`

---

### `security:addIpRule`
Adds an IP access rule.

**Direction:** Renderer → Main

**Parameters:** `rule: IpAccessRule`

**Returns:** `IpAccessRule`

---

### `security:deleteIpRule`
Deletes an IP access rule.

**Direction:** Renderer → Main

**Parameters:** `id: string`

**Returns:** `void`

---

### `security:testIp`
Tests an IP against current rules.

**Direction:** Renderer → Main

**Parameters:** `ip: string`

**Returns:** `{ allowed: boolean; matchedRule?: IpAccessRule }`

---

### `security:getAuditLog`
Gets audit log entries.

**Direction:** Renderer → Main

**Parameters:** `options: { limit?: number; offset?: number; type?: string }`

**Returns:** `AuditLogEntry[]`

---

### `security:clearAuditLog`
Clears the audit log.

**Direction:** Renderer → Main

**Returns:** `void`

---

### `security:getLockouts`
Gets currently locked out IPs.

**Direction:** Renderer → Main

**Returns:** `Lockout[]`

---

### `security:unlockIp`
Removes IP from lockout.

**Direction:** Renderer → Main

**Parameters:** `ip: string`

**Returns:** `void`

---

## Local Settings Channels

### `localSettings:read`
Reads local settings file.

**Direction:** Renderer → Main

**Returns:** `LocalSettings | null`

---

### `localSettings:write`
Writes local settings file.

**Direction:** Renderer → Main

**Parameters:** `settings: LocalSettings`

**Returns:** `void`

---

## Notification Channels

### `notification:getAll`
Gets all notifications.

**Direction:** Renderer → Main

**Returns:** `Notification[]`

---

### `notification:getStats`
Gets notification statistics.

**Direction:** Renderer → Main

**Returns:** `{ total: number; unread: number }`

---

### `notification:markRead`
Marks a notification as read.

**Direction:** Renderer → Main

**Parameters:** `id: string`

**Returns:** `void`

---

### `notification:markAllRead`
Marks all notifications as read.

**Direction:** Renderer → Main

**Returns:** `void`

---

### `notification:dismiss`
Dismisses a notification.

**Direction:** Renderer → Main

**Parameters:** `id: string`

**Returns:** `void`

---

### `notification:clearAll`
Clears all notifications.

**Direction:** Renderer → Main

**Returns:** `void`

---

### `notification:getPreferences`
Gets notification preferences.

**Direction:** Renderer → Main

**Returns:** `NotificationPreferences`

---

### `notification:setPreferences`
Sets notification preferences.

**Direction:** Renderer → Main

**Parameters:** `prefs: NotificationPreferences`

**Returns:** `void`

---

### `notification:new` (Event)
Emitted when a new notification arrives.

**Direction:** Main → Renderer

**Payload:** `Notification`

---

## Hook Channels

### `hook:setupProject`
Sets up hooks for a project.

**Direction:** Renderer → Main

**Parameters:**
- `projectId: string`
- `template: string`

**Returns:** `void`

---

### `hook:removeProject`
Removes hooks from a project.

**Direction:** Renderer → Main

**Parameters:** `projectId: string`

**Returns:** `void`

---

### `hook:getTemplates`
Gets available hook templates.

**Direction:** Renderer → Main

**Returns:** `HookTemplate[]`

---

### `hook:getProjectSettings`
Gets hook settings for a project.

**Direction:** Renderer → Main

**Parameters:** `projectPath: string`

**Returns:** `HookSettings | null`

---

### `hook:hasConfigured`
Checks if a project has hooks configured.

**Direction:** Renderer → Main

**Parameters:** `projectPath: string`

**Returns:** `boolean`

---

### `hook:activity` (Event)
Emitted for real-time hook activity.

**Direction:** Main → Renderer

**Payload:** `HookActivity`

---

## Skill Channels

### `skill:getAvailable`
Gets available skills from registry.

**Direction:** Renderer → Main

**Returns:** `Skill[]`

---

### `skill:install`
Installs a skill.

**Direction:** Renderer → Main

**Parameters:** `skillId: string`

**Returns:** `void`

---

### `skill:remove`
Removes an installed skill.

**Direction:** Renderer → Main

**Parameters:** `skillId: string`

**Returns:** `void`

---

### `skill:getInstalled`
Gets installed skills.

**Direction:** Renderer → Main

**Returns:** `Skill[]`

---

## Permission Channels

### `permission:getConfig`
Gets permission configuration.

**Direction:** Renderer → Main

**Returns:** `PermissionConfig`

---

### `permission:setConfig`
Sets permission configuration.

**Direction:** Renderer → Main

**Parameters:** `config: PermissionConfig`

**Returns:** `void`

---

### `permission:addRule`
Adds a permission rule.

**Direction:** Renderer → Main

**Parameters:** `rule: PermissionRule`

**Returns:** `PermissionRule`

---

### `permission:updateRule`
Updates a permission rule.

**Direction:** Renderer → Main

**Parameters:**
- `id: string`
- `updates: Partial<PermissionRule>`

**Returns:** `PermissionRule`

---

### `permission:removeRule`
Removes a permission rule.

**Direction:** Renderer → Main

**Parameters:** `id: string`

**Returns:** `void`

---

### `permission:getLog`
Gets permission decision log.

**Direction:** Renderer → Main

**Returns:** `PermissionLogEntry[]`

---

### `permission:getStats`
Gets permission statistics.

**Direction:** Renderer → Main

**Returns:** `PermissionStats`

---

### `permission:clearLog`
Clears the permission log.

**Direction:** Renderer → Main

**Returns:** `void`

---

## Metrics Channels

### `metrics:getToolUsage`
Gets tool usage metrics.

**Direction:** Renderer → Main

**Returns:** `ToolUsageMetrics`

---

### `metrics:getSessions`
Gets session metrics.

**Direction:** Renderer → Main

**Returns:** `SessionMetrics`

---

### `metrics:getProjectSummary`
Gets project summary metrics.

**Direction:** Renderer → Main

**Parameters:** `projectId: string`

**Returns:** `ProjectMetricsSummary`

---

### `metrics:getTimeSeries`
Gets time series data.

**Direction:** Renderer → Main

**Parameters:** `options: TimeSeriesOptions`

**Returns:** `TimeSeriesData`

---

### `metrics:getDashboardSummary`
Gets dashboard summary.

**Direction:** Renderer → Main

**Returns:** `DashboardSummary`

---

### `metrics:getCostBreakdown`
Gets cost breakdown.

**Direction:** Renderer → Main

**Returns:** `CostBreakdown`

---

### `metrics:clear`
Clears all metrics.

**Direction:** Renderer → Main

**Returns:** `void`

---

## Git Channels

### `git:getStatus`
Gets git status for a project.

**Direction:** Renderer → Main

**Parameters:** `projectPath: string`

**Returns:** `GitStatus`

---

### `git:refresh`
Refreshes git status for a project.

**Direction:** Renderer → Main

**Parameters:** `projectPath: string`

**Returns:** `GitStatus`

---

### `git:statusChanged` (Event)
Emitted when git status changes.

**Direction:** Main → Renderer

**Payload:**
- `projectPath: string`
- `status: GitStatus`

---

## Subagent Channels

### `subagent:getByInstance`
Gets subagents for an instance.

**Direction:** Renderer → Main

**Parameters:** `instanceId: string`

**Returns:** `Subagent[]`

---

### `subagent:getAll`
Gets all tracked subagents.

**Direction:** Renderer → Main

**Returns:** `Subagent[]`

---

### `subagent:started` (Event)
Emitted when a subagent starts.

**Direction:** Main → Renderer

**Payload:** `Subagent`

---

### `subagent:completed` (Event)
Emitted when a subagent completes.

**Direction:** Main → Renderer

**Payload:**
- `subagentId: string`
- `result: SubagentResult`

---

## Types Reference

```typescript
type ClaudeModel = 'sonnet' | 'opus' | 'haiku';

type InstanceMode = 'interactive' | 'print' | 'stream-json';

type InstanceStatus =
  | 'starting'
  | 'running'
  | 'needs_permission'
  | 'tool_executing'
  | 'completed'
  | 'error'
  | 'killed';

type ConversationStatus = 'active' | 'completed' | 'error' | 'archived';
```

## Error Handling

All IPC handlers should:
1. Validate input parameters using validators from `src/main/ipc/validators.ts`
2. Log operations using the logger from `src/shared/utils/logger.ts`
3. Return meaningful errors that can be displayed to users

Example error handling pattern:
```typescript
ipcMain.handle('channel:name', async (_event, data) => {
  try {
    const validated = validators.validateData(data);
    return await processData(validated);
  } catch (error) {
    logger.error('Operation failed', error);
    throw error;
  }
});
```
