# Orchestra - Architecture

## Overview

Orchestra is an Electron-based desktop application for managing multiple Claude Code CLI instances across different projects. It provides real-time visualization of instance states and a modern UI for interacting with Claude.

## High-Level Architecture

```
+------------------------------------------------------------------+
|                         ELECTRON APP                              |
+------------------------------------------------------------------+
|  RENDERER (React)              |    MAIN (Node.js)               |
|  +--------------------------+  |  +----------------------------+ |
|  | ProjectGrid              |  |  | ProcessManager             | |
|  |  - ProjectBox[]          |<--->|  - spawnInstance()         | |
|  |  - ContextMenu           |  |  |  - killInstance()          | |
|  +--------------------------+  |  |  - sendInput()             | |
|  | TerminalPanel (xterm.js) |<--->| ClaudeInstance (node-pty)  | |
|  +--------------------------+  |  +----------------------------+ |
|  | InstanceStatus           |  |  | StreamJSONParser           | |
|  | ConfigViewer             |<--->| ConfigReader               | |
|  +--------------------------+  |  | DataStore (SQLite)         | |
|            IPC (contextBridge) |  +----------------------------+ |
+------------------------------------------------------------------+
```

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Desktop Framework | Electron | Cross-platform desktop app |
| Frontend | React + TypeScript | UI components |
| Styling | Tailwind CSS | Utility-first styling |
| State Management | Zustand | Lightweight state |
| Database | better-sqlite3 | Local project storage |
| Terminal | xterm.js | Terminal emulation |
| PTY | node-pty | Process spawning |
| Build | Vite | Fast development/build |

## Main Process Components

### ProcessManager (`src/main/services/ProcessManager.ts`)
Orchestrates all Claude CLI instances:
- Spawns new instances with node-pty
- Routes events to renderer via IPC
- Manages instance lifecycle

### ClaudeInstance (`src/main/services/ClaudeInstance.ts`)
Represents a single Claude CLI process:
- Wraps node-pty process
- Parses stream-json output
- Emits status events

### StreamJSONParser (`src/main/services/StreamJSONParser.ts`)
Parses Claude CLI stream-json format:
- Extracts message types (system, assistant, user, result)
- Infers instance status from messages
- Handles content blocks (text, tool_use, thinking)

### DataStore (`src/main/services/DataStore.ts`)
SQLite database for persistence:
- Projects CRUD operations
- Uses better-sqlite3 for sync operations

### ConfigReader (`src/main/services/ConfigReader.ts`)
Reads Claude configuration:
- Global settings from ~/.claude.json
- Project settings from .claude/settings.json
- MCP servers, tools, hooks

## Renderer Components

### Layout
- **TitleBar**: Window controls, view mode toggle, theme
- **Sidebar**: Project list with status indicators
- **MainContent**: Instance tabs and content area

### Projects
- **ProjectList**: Grid of project cards with context menu
- **ProjectModal**: Create/edit project form

### Instances
- **InstanceTabs**: Tab bar for active instances
- **InstanceModal**: Create instance form (prompt, model, mode)

### Views
- **TerminalView**: xterm.js terminal emulation
- **StructuredView**: Parsed message cards

## State Management

Three Zustand stores:
1. **projectStore**: Project CRUD and selection
2. **instanceStore**: Instance management and output
3. **uiStore**: UI preferences (theme, view mode)

## IPC Communication

Communication between main and renderer via contextBridge:

### Channels
- `project:*`: Project CRUD operations
- `instance:*`: Instance management
- `config:*`: Configuration reading
- `window:*`: Window controls
- `dialog:*`: File dialogs

### Events (Main → Renderer)
- `instance:output`: Parsed JSON message
- `instance:rawOutput`: Raw terminal data
- `instance:status`: Status change
- `instance:error`: Error occurred
- `instance:exit`: Process exited

## Instance States

| State | Detection |
|-------|-----------|
| `starting` | Process created, awaiting `init` |
| `running` | Receiving `assistant` messages |
| `needs_permission` | `tool_use` pending approval |
| `tool_executing` | Tool in progress |
| `completed` | `type: "result"` received |
| `error` | `result.subtype === "error"` |
| `killed` | Terminated by user |

## Security

- Context isolation enabled
- Node integration disabled
- Preload script exposes limited API
- No remote content loading
