# Services Overview

This document provides an overview of all main process services in Claude Code Orchestra.

## Architecture

Claude Code Orchestra follows a multi-process Electron architecture:

```
┌──────────────────────────────────────────────────────────┐
│                    Main Process                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              ProcessManager                          │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │ ClaudeInst  │  │ ClaudeInst  │  │ ShellInst   │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │  DataStore  │  │  WebServer  │  │ ClusterManager │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
└──────────────────────────────────────────────────────────┘
           │                │                │
           ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ Renderer │     │   Web    │     │  Other   │
    │ Process  │     │ Clients  │     │  Nodes   │
    └──────────┘     └──────────┘     └──────────┘
```

## Core Services

### ProcessManager
**Location:** `src/main/services/ProcessManager.ts`

Orchestrates all Claude CLI and shell instances. Manages instance lifecycle, event distribution, and state synchronization.

**Key Responsibilities:**
- Creates and manages ClaudeInstance and ShellInstance objects
- Maintains output buffers for late-connecting clients
- Maps instances to conversations
- Delegates broadcasting to InstanceBroadcaster
- Emits events: `instanceCreated`, `instanceRemoved`, `persistenceError`

**Usage:**
```typescript
import { getProcessManager } from './ProcessManager';

const pm = getProcessManager();
const instance = pm.createInstance({
  projectId: 'proj-123',
  model: 'claude-sonnet-4-20250514',
  mode: 'stream-json'
});
```

### InstanceBroadcaster
**Location:** `src/main/services/InstanceBroadcaster.ts`

Centralizes event broadcasting to all destinations (renderer, web clients, cluster nodes).

**Key Responsibilities:**
- Broadcasts instance events via IPC to renderer
- Forwards events to WebServer for Socket.IO clients
- Sends events to ClusterManager for multi-node setups
- Handles shell instance events separately

### ClaudeInstance
**Location:** `src/main/services/ClaudeInstance.ts`

Wraps a single Claude CLI process using node-pty for terminal emulation.

**Key Responsibilities:**
- Spawns Claude CLI with appropriate arguments
- Parses stream-json output via StreamJSONParser
- Manages PTY resize, input, and lifecycle
- Captures session ID from system messages

**Events Emitted:**
- `output` - Parsed StreamMessage
- `rawOutput` - Raw terminal data
- `status` - Instance status changes
- `sessionId` - When session ID is captured
- `exit` - Process termination

### ShellInstance
**Location:** `src/main/services/ShellInstance.ts`

Wraps a shell process (bash, PowerShell, etc.) for terminal access.

**Key Responsibilities:**
- Spawns shell with project directory as CWD
- Supports Windows (PowerShell/cmd) and Unix (bash/zsh)
- Manages PTY resize and input

### StreamJSONParser
**Location:** `src/main/services/StreamJSONParser.ts`

Parses Claude CLI stream-json format and infers instance status.

**Key Responsibilities:**
- Buffers incomplete JSON lines
- Parses message types (system, assistant, user, result)
- Infers status from message content (needs_permission, tool_executing, etc.)
- Emits structured messages and status changes

### DataStore
**Location:** `src/main/services/DataStore.ts`

SQLite database for persistent storage using better-sqlite3.

**Tables:**
- `projects` - Project definitions
- `conversations` - Chat sessions
- `messages` - Conversation messages
- `remote_config` - Remote access settings
- `security_config` - Security settings
- `ip_access_rules` - IP allowlist/denylist
- `cluster_config` - Multi-node configuration
- `audit_log` - Security audit trail
- `app_settings` - Application settings (JWT secret, etc.)

### WebServer
**Location:** `src/main/services/WebServer.ts`

Express + Socket.IO server for remote web access.

**Route Modules:**
- `authRoutes.ts` - Login, logout, session management
- `projectRoutes.ts` - Project CRUD operations
- `instanceRoutes.ts` - Instance lifecycle management
- `conversationRoutes.ts` - Conversation history
- `hookRoutes.ts` - Claude CLI hook integration

**Key Features:**
- JWT-based authentication
- IP access control (allowlist/denylist)
- CORS configuration
- Real-time updates via Socket.IO
- Static file serving for web UI

### StateSyncManager
**Location:** `src/main/services/managers/StateSyncManager.ts`

Manages state synchronization between main process and clients.

**Key Responsibilities:**
- Gathers sync state from DataStore, ProcessManager, ClusterManager
- Combines local and cluster data for unified view
- Provides active conversations linked to running instances

## Security Services

### AuthService
**Location:** `src/main/services/AuthService.ts`

Handles authentication and session management.

**Features:**
- Password hashing with bcrypt
- JWT token generation and verification
- Session management with configurable limits
- Rate limiting per IP
- IP lockout for failed attempts

### AuditLogger
**Location:** `src/main/services/AuditLogger.ts`

Security audit logging for compliance.

**Events Logged:**
- `login` - Successful logins
- `failed_login` - Authentication failures
- `logout` - User logouts
- `session_kick` - Admin session termination
- `remote_enabled` / `remote_disabled` - Server state changes

### PermissionManager
**Location:** `src/main/services/PermissionManager.ts`

Manages tool execution permissions for Claude instances.

**Features:**
- Rule-based permission checking
- Project-level permission rules
- Hook integration for pre-tool checks

## Collaboration Services

### ClusterManager
**Location:** `src/main/services/ClusterManager.ts`

Manages multi-node cluster connectivity and synchronization.

**Roles:**
- `standalone` - Single node (default)
- `primary` - Central node accepting secondary connections
- `secondary` - Node connecting to primary

**Features:**
- Socket.IO-based inter-node communication
- Shared secret authentication
- Global project/instance aggregation
- Event forwarding between nodes

### FileLockManager
**Location:** `src/main/services/FileLockManager.ts`

Tracks file access across instances to detect conflicts.

**Features:**
- Records file reads/writes per instance
- Detects concurrent access conflicts
- Time-based lock expiration
- Statistics for collaboration awareness

## Notification Services

### NotificationManager
**Location:** `src/main/services/NotificationManager.ts`

Manages desktop notifications and alerts.

**Notification Types:**
- Task completion
- Permission requests
- Collaboration alerts (file conflicts)
- Error notifications

### MetricsService
**Location:** `src/main/services/MetricsService.ts`

Collects metrics and statistics for dashboard display.

**Tracked Metrics:**
- Tool usage frequency
- Session duration
- API costs
- Hook events
- Permission decisions

## Configuration Services

### ConfigReader
**Location:** `src/main/services/ConfigReader.ts`

Reads Claude CLI configuration files.

**Sources:**
- `~/.claude.json` - Global settings
- `<project>/.claude/settings.json` - Project settings
- Environment variables

## Service Initialization

Services are initialized on demand using singleton patterns:

```typescript
// Most services use this pattern
let instance: MyService | null = null;

export function getMyService(): MyService {
  if (!instance) {
    instance = new MyService();
  }
  return instance;
}
```

The main process initialization in `main/index.ts` sets up required services and IPC handlers.

## Inter-Service Communication

Services communicate through:
1. **Direct calls** - Synchronous service-to-service calls
2. **Events** - EventEmitter for async notifications
3. **Lazy imports** - Dynamic imports to avoid circular dependencies

Example of lazy import pattern:
```typescript
let webServerModule: typeof import('./WebServer') | null = null;

async function getWebServerModule() {
  if (!webServerModule) {
    webServerModule = await import('./WebServer');
  }
  return webServerModule;
}
```
