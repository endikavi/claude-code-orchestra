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
