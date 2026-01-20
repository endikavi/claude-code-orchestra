# IPC Channels Reference

This document provides a reference for all IPC (Inter-Process Communication) channels used between the main process and renderer in Claude Code Orchestra.

## Overview

IPC channels follow the naming convention: `domain:operation`

| Domain | Description |
|--------|-------------|
| `project` | Project management |
| `instance` | Claude instance lifecycle |
| `shell` | Shell instance management |
| `conversation` | Conversation history |
| `config` | Configuration settings |
| `remote` | Remote access features |
| `cluster` | Multi-node cluster |
| `security` | Security settings |

## Channel Categories

### Invoke Channels (Request/Response)

These channels use `ipcRenderer.invoke()` and return promises.

### Event Channels (Push)

These channels use `ipcMain.emit()` and `ipcRenderer.on()` for one-way communication.

## Project Channels

### `project:getAll`
**Type:** Invoke
**Returns:** `Project[]`

Retrieves all projects from the database.

### `project:getById`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `Project | null`

Retrieves a project by ID.

### `project:create`
**Type:** Invoke
**Args:** `(data: CreateProjectData)`
**Returns:** `Project`

Creates a new project.

```typescript
interface CreateProjectData {
  name: string;
  path: string;
  skipPermissions?: boolean;
  preferredShell?: string;
}
```

### `project:update`
**Type:** Invoke
**Args:** `(data: UpdateProjectData)`
**Returns:** `Project`

Updates an existing project.

### `project:delete`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `void`

Deletes a project and associated data.

### `project:selectFolder`
**Type:** Invoke
**Returns:** `string | null`

Opens a folder picker dialog.

## Instance Channels

### `instance:create`
**Type:** Invoke
**Args:** `(config: InstanceConfig)`
**Returns:** `ClaudeInstance`

Creates and starts a new Claude instance.

```typescript
interface InstanceConfig {
  projectId: string;
  model: ClaudeModel;
  mode: InstanceMode;
  planMode?: boolean;
}
```

### `instance:resume`
**Type:** Invoke
**Args:** `(config: ResumeConfig)`
**Returns:** `ClaudeInstance`

Resumes an existing Claude session.

### `instance:kill`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `void`

Terminates an instance.

### `instance:input`
**Type:** Invoke
**Args:** `(id: string, input: string)`
**Returns:** `void`

Sends input to an instance.

### `instance:resize`
**Type:** Invoke
**Args:** `(id: string, cols: number, rows: number)`
**Returns:** `void`

Resizes the terminal.

### `instance:setTitle`
**Type:** Invoke
**Args:** `(id: string, title: string)`
**Returns:** `void`

Sets the terminal title for an instance.

### `instance:getAll`
**Type:** Invoke
**Returns:** `ClaudeInstance[]`

Retrieves all active instances.

### `instance:getByProject`
**Type:** Invoke
**Args:** `(projectId: string)`
**Returns:** `ClaudeInstance[]`

Retrieves instances for a project.

### `instance:output` (Event)
**Type:** Event
**Payload:** `(instanceId: string, message: StreamMessage)`

Emitted when instance produces parsed output.

### `instance:rawOutput` (Event)
**Type:** Event
**Payload:** `(instanceId: string, data: string)`

Emitted when instance produces raw terminal data.

### `instance:status` (Event)
**Type:** Event
**Payload:** `(instanceId: string, status: InstanceStatus)`

Emitted when instance status changes.

### `instance:error` (Event)
**Type:** Event
**Payload:** `(instanceId: string, error: string)`

Emitted when instance encounters an error.

### `instance:exit` (Event)
**Type:** Event
**Payload:** `(instanceId: string, code: number)`

Emitted when instance process exits.

### `instance:sessionId` (Event)
**Type:** Event
**Payload:** `(instanceId: string, sessionId: string)`

Emitted when session ID is captured.

### `instance:terminalTitle` (Event)
**Type:** Event
**Payload:** `(instanceId: string, title: string)`

Emitted when terminal title changes.

### `instance:sync` (Event)
**Type:** Event
**Payload:** `(instances: ClaudeInstance[])`

Full instance state sync.

## Shell Channels

### `shell:create`
**Type:** Invoke
**Args:** `(projectId: string)`
**Returns:** `ShellInstance`

Creates a new shell instance.

### `shell:kill`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `void`

Terminates a shell instance.

### `shell:input`
**Type:** Invoke
**Args:** `(id: string, input: string)`
**Returns:** `void`

Sends input to a shell.

### `shell:resize`
**Type:** Invoke
**Args:** `(id: string, cols: number, rows: number)`
**Returns:** `void`

Resizes shell terminal.

### `shell:getOutput`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `string`

Gets buffered shell output.

### `shell:rawOutput` (Event)
**Type:** Event
**Payload:** `(shellId: string, data: string)`

Emitted when shell produces output.

### `shell:status` (Event)
**Type:** Event
**Payload:** `(shellId: string, status: ShellInstanceStatus)`

Emitted when shell status changes.

### `shell:exit` (Event)
**Type:** Event
**Payload:** `(shellId: string, code: number)`

Emitted when shell process exits.

## Conversation Channels

### `conversation:getByProject`
**Type:** Invoke
**Args:** `(projectId: string)`
**Returns:** `Conversation[]`

Gets conversations for a project.

### `conversation:getById`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `Conversation | null`

Gets a conversation by ID.

### `conversation:create`
**Type:** Invoke
**Args:** `(data: CreateConversationData)`
**Returns:** `Conversation`

Creates a new conversation.

### `conversation:update`
**Type:** Invoke
**Args:** `(id: string, updates: ConversationUpdates)`
**Returns:** `Conversation`

Updates a conversation.

### `conversation:delete`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `void`

Deletes a conversation.

### `conversation:getMessages`
**Type:** Invoke
**Args:** `(conversationId: string)`
**Returns:** `Message[]`

Gets messages for a conversation.

### `conversation:addMessage`
**Type:** Invoke
**Args:** `(data: AddMessageData)`
**Returns:** `Message`

Adds a message to a conversation.

## Configuration Channels

### `config:getClaudeSettings`
**Type:** Invoke
**Returns:** `ClaudeSettings`

Gets Claude CLI configuration.

### `config:getCost`
**Type:** Invoke
**Returns:** `CostInfo`

Gets API cost information.

## Remote Access Channels

### `remote:getConfig`
**Type:** Invoke
**Returns:** `RemoteConfig`

Gets remote access configuration.

### `remote:setConfig`
**Type:** Invoke
**Args:** `(config: RemoteConfig)`
**Returns:** `void`

Updates remote access configuration.

### `remote:getStatus`
**Type:** Invoke
**Returns:** `RemoteServerStatus`

Gets remote server status.

### `remote:start`
**Type:** Invoke
**Args:** `(port: number)`
**Returns:** `void`

Starts the remote server.

### `remote:stop`
**Type:** Invoke
**Returns:** `void`

Stops the remote server.

### `remote:kickSession`
**Type:** Invoke
**Args:** `(sessionId: string, reason?: string)`
**Returns:** `void`

Kicks a remote session.

## Security Channels

### `security:getConfig`
**Type:** Invoke
**Returns:** `SecurityConfig`

Gets security configuration.

### `security:setConfig`
**Type:** Invoke
**Args:** `(config: SecurityConfig)`
**Returns:** `void`

Updates security configuration.

### `security:getIpRules`
**Type:** Invoke
**Returns:** `IpAccessRule[]`

Gets IP access rules.

### `security:addIpRule`
**Type:** Invoke
**Args:** `(rule: IpAccessRule)`
**Returns:** `void`

Adds an IP access rule.

### `security:removeIpRule`
**Type:** Invoke
**Args:** `(id: string)`
**Returns:** `void`

Removes an IP access rule.

### `security:getAuditLogs`
**Type:** Invoke
**Args:** `(options: AuditLogOptions)`
**Returns:** `AuditLogEntry[]`

Gets audit log entries.

## Cluster Channels

### `cluster:getConfig`
**Type:** Invoke
**Returns:** `ClusterConfig`

Gets cluster configuration.

### `cluster:setConfig`
**Type:** Invoke
**Args:** `(config: ClusterConfig)`
**Returns:** `void`

Updates cluster configuration.

### `cluster:connect`
**Type:** Invoke
**Returns:** `void`

Connects to cluster primary.

### `cluster:disconnect`
**Type:** Invoke
**Returns:** `void`

Disconnects from cluster.

### `cluster:getStatus`
**Type:** Invoke
**Returns:** `ClusterStatus`

Gets cluster connection status.

### `cluster:stateChanged` (Event)
**Type:** Event
**Payload:** `(state: ClusterState)`

Emitted when cluster state changes.

## Utility Channels

### `dialog:showMessage`
**Type:** Invoke
**Args:** `(options: MessageBoxOptions)`
**Returns:** `MessageBoxReturnValue`

Shows a native message dialog.

### `dialog:showError`
**Type:** Invoke
**Args:** `(title: string, content: string)`
**Returns:** `void`

Shows an error dialog.

## Using IPC Channels

### In Renderer (via preload)

```typescript
// The preload script exposes window.electronAPI
const projects = await window.electronAPI.getProjects();

// Listen to events
window.electronAPI.onInstanceOutput((instanceId, message) => {
  console.log('Output:', message);
});
```

### In Main Process

```typescript
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './ipc/channels';

// Handle invoke
ipcMain.handle(IPC_CHANNELS.PROJECT_GET_ALL, async () => {
  return dataStore.getAllProjects();
});

// Send event
mainWindow.webContents.send(IPC_CHANNELS.INSTANCE_OUTPUT, instanceId, message);
```

## Channel Constants

All channel names are defined in `src/main/ipc/channels.ts`:

```typescript
export const IPC_CHANNELS = {
  // Projects
  PROJECT_GET_ALL: 'project:getAll',
  PROJECT_GET_BY_ID: 'project:getById',
  PROJECT_CREATE: 'project:create',
  // ... etc
} as const;
```
