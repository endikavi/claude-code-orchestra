# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Development with hot reload (Electron + Vite)
npm run electron:dev

# Vite-only development (web preview)
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues
npm run lint:strict       # Zero warnings mode

# Formatting
npm run format            # Format all files
npm run format:check      # Check formatting

# Testing
npm run test              # Watch mode
npm run test:run          # Single run
npm run test:coverage     # With coverage report
npx vitest run src/path/to/file.test.ts  # Run single test file

# Building
npm run build             # Full build (TypeScript + Vite + Web + Electron)
npm run build:web         # Build standalone web client only
npm run build:cli         # Build headless CLI
npm run electron:build    # Package for current platform
npm run rebuild           # Rebuild native modules (node-pty, better-sqlite3)

# Headless server mode
npm run start:server      # Run as headless server (after build:cli)
```

## Architecture Overview

This is an Electron desktop application for managing multiple Claude Code CLI instances. It uses a multi-process architecture:

### Process Model

- **Main Process** (`src/main/`): Node.js runtime handling file system, database, and spawning Claude CLI processes via node-pty
- **Renderer Process** (`src/renderer/`): React frontend with xterm.js terminal emulation
- **Web Build** (`src/web/`): Standalone web client for remote access via WebSocket
- **Preload Script** (`src/main/preload.ts`): Exposes limited IPC API to renderer via contextBridge

### Key Services (Main Process)

- `ProcessManager`: Orchestrates Claude CLI instances, routes events to renderer
- `ClaudeInstance`: Wraps a single node-pty process, parses stream-json output
- `StreamJSONParser`: Parses Claude CLI stream-json format, infers instance status from messages
- `DataStore`: SQLite database (better-sqlite3) for projects and conversations
- `ConfigReader`: Reads Claude settings from `~/.claude.json` and project `.claude/settings.json`
- `WebServer`: Express + Socket.io server for remote web access
- `AuthService`: JWT-based authentication for remote access
- `ClusterManager`: Multi-node clustering with primary/secondary roles

### State Management (Renderer)

Three Zustand stores handle client-side state:
- `projectStore`: Project CRUD and selection
- `instanceStore`: Active instance management and output buffering
- `conversationStore`: Conversation history persistence
- `uiStore`: Theme, view mode, language preferences

### IPC Communication

All main/renderer communication uses typed IPC channels defined in `src/main/ipc/channels.ts`. Channel naming convention: `domain:operation` (e.g., `project:create`, `instance:kill`).

Events flow from main to renderer for: `instance:output`, `instance:status`, `instance:error`, `instance:exit`, `instance:rawOutput`.

### Instance Lifecycle States

Instances transition through: `starting` → `running` → (`needs_permission` | `tool_executing`) → `completed` | `error` | `killed`

Status is inferred from stream-json message types in `StreamJSONParser`.

## Path Aliases

Configured in `tsconfig.json` and `vitest.config.ts`:
- `@/*` → `src/*`
- `@main/*` → `src/main/*`
- `@renderer/*` → `src/renderer/*`
- `@shared/*` → `src/shared/*`

## Testing

Tests are colocated with source files using `.test.ts` or `.test.tsx` suffix. Test setup file: `src/test/setup.ts`. Electron mocks: `src/test/mocks/electron.ts`.

Coverage thresholds (beta): 15% statements/branches/lines, 20% functions.

## Code Conventions

- Files: camelCase for `.ts`, PascalCase for `.tsx` components
- Constants: SCREAMING_SNAKE_CASE (e.g., `IPC_CHANNELS`)
- Use functional components with hooks for React
- Shared types between main/renderer go in `src/shared/types/`
- Console logging allowed in main process files only
