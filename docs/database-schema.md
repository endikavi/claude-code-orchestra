# Database Schema Documentation

Orchestra uses SQLite (via better-sqlite3) for local data persistence. The database file is stored in the user's application data directory.

## Database Location

- **Windows:** `%APPDATA%/claude-code-orchestra/claude-code-orchestra.db`
- **macOS:** `~/Library/Application Support/claude-code-orchestra/claude-code-orchestra.db`
- **Linux:** `~/.config/claude-code-orchestra/claude-code-orchestra.db`

## Configuration

The database is configured with:
- **WAL mode** (`PRAGMA journal_mode = WAL`) for better concurrent read/write performance
- **Foreign keys enabled** (`PRAGMA foreign_keys = ON`) for referential integrity

## Tables

### projects

Stores project configurations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID generated on creation |
| `name` | TEXT | NOT NULL | Display name of the project |
| `path` | TEXT | NOT NULL, UNIQUE | Absolute path to project directory |
| `description` | TEXT | - | Optional project description |
| `color` | TEXT | - | Hex color for UI display (e.g., `#FF6B6B`) |
| `skipPermissions` | INTEGER | DEFAULT 0 | Boolean (0/1) for `--dangerously-skip-permissions` |
| `hostname` | TEXT | - | Hostname where project was created |
| `preferredShell` | TEXT | - | Preferred shell for this project |
| `enableMcp` | INTEGER | DEFAULT 0 | Boolean (0/1) for MCP integration |
| `createdAt` | INTEGER | NOT NULL | Unix timestamp (milliseconds) |
| `updatedAt` | INTEGER | NOT NULL | Unix timestamp (milliseconds) |

**Indexes:**
- `idx_projects_path` on `path` for fast path lookups

---

### conversations

Stores conversation metadata for persistence and resume functionality.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID generated on creation |
| `projectId` | TEXT | NOT NULL, FK | Reference to `projects.id` |
| `sessionId` | TEXT | - | Claude CLI session ID for `--resume` |
| `title` | TEXT | NOT NULL | Conversation title (usually first words of prompt) |
| `initialPrompt` | TEXT | NOT NULL | The initial user prompt |
| `model` | TEXT | NOT NULL | Claude model (`sonnet`, `opus`, `haiku`) |
| `mode` | TEXT | NOT NULL | Instance mode (`interactive`, `print`, `stream-json`) |
| `status` | TEXT | NOT NULL, DEFAULT 'active' | Current status |
| `totalCostUsd` | REAL | DEFAULT 0 | Accumulated cost in USD |
| `messageCount` | INTEGER | DEFAULT 0 | Number of messages |
| `createdAt` | INTEGER | NOT NULL | Unix timestamp (milliseconds) |
| `updatedAt` | INTEGER | NOT NULL | Unix timestamp (milliseconds) |

**Foreign Key:** `projectId` → `projects(id)` ON DELETE CASCADE

**Indexes:**
- `idx_conversations_projectId` on `projectId`
- `idx_conversations_updatedAt` on `updatedAt`

**Status Values:**
- `active` - Conversation is in progress
- `completed` - Conversation ended normally
- `error` - Conversation ended with an error
- `archived` - Conversation has been archived

---

### conversation_messages

Stores individual messages within conversations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID generated on creation |
| `conversationId` | TEXT | NOT NULL, FK | Reference to `conversations.id` |
| `type` | TEXT | NOT NULL | Message type from Claude CLI |
| `content` | TEXT | NOT NULL | JSON-serialized StreamMessage |
| `costUsd` | REAL | - | Cost for this message (if applicable) |
| `createdAt` | INTEGER | NOT NULL | Unix timestamp (milliseconds) |

**Foreign Key:** `conversationId` → `conversations(id)` ON DELETE CASCADE

**Indexes:**
- `idx_messages_conversationId` on `conversationId`

**Message Types:**
- `system` - System initialization message
- `assistant` - Claude's response
- `user` - User input or tool results
- `result` - Final result message

---

---

## Additional Tables

The database also includes tables for remote access, security, and cluster features:

| Table | Description |
|-------|-------------|
| `remote_config` | Remote access server configuration |
| `cluster_config` | Multi-node cluster settings |
| `instance_cluster_permissions` | Per-instance sharing permissions |
| `app_settings` | Application settings (JWT secret, etc.) |
| `security_config` | Security configuration (JSON) |
| `ip_access_rules` | IP allowlist/denylist rules |
| `audit_log` | Security audit trail |
| `ip_lockouts` | Rate limiting lockouts |

These tables support the remote access and cluster features documented in [Remote Access](./remote-access.md) and [Headless Deployment](./headless-deployment.md).

---

## Entity Relationship Diagram

```
┌─────────────────────┐
│      projects       │
├─────────────────────┤
│ id (PK)             │
│ name                │
│ path                │
│ description         │
│ color               │
│ skipPermissions     │
│ createdAt           │
│ updatedAt           │
└─────────┬───────────┘
          │
          │ 1:N
          ▼
┌─────────────────────┐
│    conversations    │
├─────────────────────┤
│ id (PK)             │
│ projectId (FK)      │──────┐
│ sessionId           │      │
│ title               │      │
│ initialPrompt       │      │
│ model               │      │
│ mode                │      │
│ status              │      │
│ totalCostUsd        │      │
│ messageCount        │      │
│ createdAt           │      │
│ updatedAt           │      │
└─────────┬───────────┘      │
          │                  │
          │ 1:N              │ CASCADE DELETE
          ▼                  │
┌─────────────────────┐      │
│conversation_messages│      │
├─────────────────────┤      │
│ id (PK)             │      │
│ conversationId (FK) │──────┘
│ type                │
│ content             │
│ costUsd             │
│ createdAt           │
└─────────────────────┘
```

## TypeScript Interfaces

```typescript
interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  color?: string;
  skipPermissions?: boolean;
  hostname?: string;
  preferredShell?: string;
  enableMcp?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Conversation {
  id: string;
  projectId: string;
  sessionId?: string;
  title: string;
  initialPrompt: string;
  model: 'sonnet' | 'opus' | 'haiku';
  mode: 'interactive' | 'print' | 'stream-json';
  status: 'active' | 'completed' | 'error' | 'archived';
  totalCostUsd: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface ConversationMessage {
  id: string;
  conversationId: string;
  type: 'system' | 'assistant' | 'user' | 'result';
  content: string; // JSON serialized StreamMessage
  costUsd?: number;
  createdAt: number;
}
```

## Data Access

All database operations are performed through the `DataStore` class (`src/main/services/DataStore.ts`), which implements the Singleton pattern.

### Usage Example

```typescript
import { DataStore } from './services/DataStore';

const dataStore = DataStore.getInstance();

// Create a project
const project = dataStore.createProject({
  name: 'My Project',
  path: '/path/to/project',
  description: 'A sample project',
});

// Get all projects
const projects = dataStore.getAllProjects();

// Create a conversation
const conversation = dataStore.createConversation({
  projectId: project.id,
  title: 'New conversation',
  initialPrompt: 'Help me with...',
  model: 'sonnet',
  mode: 'interactive',
});
```

## Migrations

Database migrations are handled automatically on startup. Current migrations:

1. **skipPermissions column** - Added to `projects` table for existing databases

Migration code is in `DataStore.migrateAddSkipPermissions()`.

## Best Practices

1. **Always use parameterized queries** - The `DataStore` class uses prepared statements to prevent SQL injection
2. **Handle cascade deletes** - Deleting a project automatically deletes all related conversations and messages
3. **Use transactions for batch operations** - better-sqlite3 supports transactions via `db.transaction()`
4. **Close the database on app exit** - Call `dataStore.close()` when the application terminates
