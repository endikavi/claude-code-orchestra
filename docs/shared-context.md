# Shared Context - Multi-Instance Coordination

The Shared Context feature enables Claude instances to coordinate their work when multiple instances are active on the same project. Instances can share what they're working on, discover patterns and conventions, and contribute to a shared knowledge base.

## Overview

### Problem
When multiple Claude instances work on the same project concurrently, they may:
- Make conflicting changes to the same files
- Duplicate work that another instance already completed
- Miss important patterns or conventions discovered by other instances
- Lack awareness of the overall project state

### Solution
Shared Context provides:
- **Peer Awareness**: See what other instances are working on
- **Work Status Broadcasting**: Share current task and file changes
- **Project Knowledge Base**: Accumulate and share project conventions, architecture patterns, and important discoveries
- **Automatic Context Injection**: New instances receive a summary of current project state

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process                             │
│  ┌─────────────────────┐    ┌──────────────────────────┐    │
│  │  SharedContextStore │◄──►│    HTTP API Routes       │    │
│  │                     │    │    /api/hooks/context/*  │    │
│  │  - instanceContexts │    └──────────────────────────┘    │
│  │  - projectKnowledge │                                    │
│  │  - SQLite backing   │    ┌──────────────────────────┐    │
│  └─────────┬───────────┘    │    MCP Server Tools      │    │
│            │                │    context_*             │    │
│            ▼                └──────────────────────────┘    │
│  ┌─────────────────────┐                                    │
│  │ InstanceBroadcaster │──► Socket.io Events                │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                          │
│  ┌─────────────────────┐    ┌──────────────────────────┐    │
│  │    contextStore     │◄──►│   SharedContextPanel     │    │
│  │    (Zustand)        │    │   (UI Component)         │    │
│  └─────────────────────┘    └──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Context Publishing**:
   - Instance uses MCP tool or HTTP API to publish context
   - SharedContextStore updates in-memory state
   - InstanceBroadcaster emits Socket.io event
   - UI updates via contextStore

2. **Knowledge Contribution**:
   - Instance discovers convention/pattern
   - Contributes via MCP tool or HTTP API
   - Knowledge stored in SQLite for persistence
   - Broadcasted to all connected clients

3. **Context Injection**:
   - New instance starts
   - First tool call triggers context injection
   - Receives summary of active peers and project knowledge

## MCP Tools

When MCP is enabled, instances can use these tools:

### context_get_peers
Get information about other active instances on the project.

**Parameters**: None (uses instance's project)

**Response**:
```json
{
  "instances": [
    {
      "instanceId": "inst_abc123",
      "workStatus": "implementing",
      "currentTask": "Adding authentication to API routes",
      "currentFiles": ["src/auth/middleware.ts", "src/routes/api.ts"],
      "lastUpdate": 1706000000000
    }
  ]
}
```

### context_publish
Share your current context with other instances.

**Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| workStatus | string | No | Current status: idle, exploring, implementing, testing, reviewing, planning, waiting |
| currentTask | string | No | Description of current task |
| currentFiles | string[] | No | Files being modified |
| notesForOthers | string | No | Message for other instances |

**Example**:
```json
{
  "workStatus": "implementing",
  "currentTask": "Refactoring user service",
  "currentFiles": ["src/services/user.ts"],
  "notesForOthers": "Making breaking changes to UserService interface"
}
```

### context_get_project_knowledge
Get accumulated knowledge about the project.

**Response**:
```json
{
  "conventions": [
    {
      "type": "naming",
      "description": "Use PascalCase for component files",
      "contributedBy": "inst_abc123",
      "timestamp": 1706000000000
    }
  ],
  "warnings": [
    {
      "description": "Do not modify legacy/core.ts - deprecated but required",
      "severity": "high",
      "contributedBy": "inst_xyz789"
    }
  ],
  "importantFiles": [
    {
      "path": "src/config/constants.ts",
      "description": "Central configuration - changes affect all modules",
      "contributedBy": "inst_abc123"
    }
  ]
}
```

### context_contribute_knowledge
Share discoveries about the project.

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| convention | object | Code convention: `{type, description}` |
| warning | object | Important warning: `{description, severity}` |
| importantFile | object | Key file: `{path, description}` |

**Example - Adding a convention**:
```json
{
  "convention": {
    "type": "architecture",
    "description": "Services should not import from components"
  }
}
```

### context_get_summary
Get a human-readable summary of project context.

**Response**:
```json
{
  "summary": "2 instances active. inst_abc working on auth (implementing). Project has 3 conventions, 1 warning."
}
```

## HTTP API

Alternative to MCP tools for shell-based access.

### Publish Context
```bash
curl -X POST http://localhost:3847/api/hooks/context/publish \
  -H "Content-Type: application/json" \
  -H "X-Instance-Id: $CLAUDE_DASHBOARD_INSTANCE_ID" \
  -d '{
    "workStatus": "implementing",
    "currentTask": "Adding user validation",
    "currentFiles": ["src/validation.ts"]
  }'
```

### Get Active Instances
```bash
curl "http://localhost:3847/api/hooks/context/instances?projectId=$CLAUDE_DASHBOARD_PROJECT_ID"
```

### Get Project Knowledge
```bash
curl "http://localhost:3847/api/hooks/context/project?projectId=$CLAUDE_DASHBOARD_PROJECT_ID"
```

### Contribute Knowledge
```bash
# Add a convention
curl -X POST http://localhost:3847/api/hooks/context/project/contribute \
  -H "Content-Type: application/json" \
  -H "X-Instance-Id: $CLAUDE_DASHBOARD_INSTANCE_ID" \
  -d '{
    "convention": {
      "type": "style",
      "description": "Use 2-space indentation"
    }
  }'

# Add a warning
curl -X POST http://localhost:3847/api/hooks/context/project/contribute \
  -H "Content-Type: application/json" \
  -H "X-Instance-Id: $CLAUDE_DASHBOARD_INSTANCE_ID" \
  -d '{
    "warning": {
      "description": "Database migrations must run in sequence",
      "severity": "high"
    }
  }'
```

### Get Context Summary
```bash
curl "http://localhost:3847/api/hooks/context/summary?projectId=$CLAUDE_DASHBOARD_PROJECT_ID"
```

## Configuration

Settings are available in the Settings modal under the "Context" tab.

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Shared Context | true | Master toggle for the feature |
| Auto-publish Context | true | Automatically detect and share context from tool usage |
| Inject Context on Start | true | New instances receive context summary automatically |
| Show Context Panel | true | Display the context panel in the UI sidebar |
| Knowledge Retention | 30 days | How long to keep project knowledge in the database |

## UI Components

### Shared Context Panel
Located in the sidebar when enabled, shows:
- **Active Instances**: List of peer instances with status badges and current tasks
- **Project Conventions**: Discovered coding conventions and patterns
- **Warnings**: Important notes and caveats about the project
- **Important Files**: Key files that affect multiple components

Status badge colors:
- 🟢 Green: implementing
- 🔵 Blue: exploring
- 🟡 Yellow: testing
- 🟣 Purple: reviewing
- 🟠 Orange: planning
- ⚪ Gray: idle/waiting

## Skill Integration

The `shared-context` skill is automatically included in `collaborative` and `complete` hook templates. It provides Claude instances with instructions on how to use the context sharing features.

To install the skill manually:
```bash
# Via dashboard API
curl -X POST http://localhost:3847/api/skills/install \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/path/to/project",
    "skills": ["shared-context"]
  }'
```

## Best Practices

### For Users
1. **Enable for team projects**: Shared context is most valuable when multiple instances work concurrently
2. **Review knowledge periodically**: Check contributed conventions and warnings for accuracy
3. **Adjust retention**: Longer retention for stable projects, shorter for experimental ones

### For Claude Instances
1. **Check peers before major changes**: Use `context_get_peers` before refactoring
2. **Publish when changing files**: Let others know what you're modifying
3. **Contribute discoveries**: Share patterns and gotchas as you find them
4. **Read knowledge at start**: Use `context_get_project_knowledge` when beginning a task

## Cluster Mode

In cluster deployments, context is synchronized across nodes:
- Context updates are broadcast from the primary node to all secondaries
- Secondary nodes forward context contributions to the primary
- SQLite knowledge base is only written by the primary node
- All nodes receive real-time Socket.io updates

## Database Schema

Project knowledge is persisted in the `project_knowledge` table:

```sql
CREATE TABLE project_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'convention' | 'warning' | 'importantFile'
  data TEXT NOT NULL,           -- JSON blob
  contributed_by TEXT,          -- instance ID
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, type, data)
);
```

## Troubleshooting

### Context not sharing between instances
1. Verify "Enable Shared Context" is on in Settings
2. Check instances are on the same project
3. Verify API port (default 3847) is accessible

### Knowledge not persisting
1. Check database write permissions
2. Verify retention days setting
3. Check SQLite database location: `~/.claude-dashboard/data.db`

### UI not updating
1. Check "Show Context Panel" is enabled
2. Verify Socket.io connection in browser console
3. Try refreshing the context panel

## API Reference Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/hooks/context/publish` | POST | Publish instance context |
| `/api/hooks/context/instances` | GET | Get active instances |
| `/api/hooks/context/project` | GET | Get project knowledge |
| `/api/hooks/context/project/contribute` | POST | Add to knowledge base |
| `/api/hooks/context/summary` | GET | Get text summary |

| MCP Tool | Description |
|----------|-------------|
| `context_get_peers` | Get active peer instances |
| `context_publish` | Share current context |
| `context_get_project_knowledge` | Get project knowledge |
| `context_contribute_knowledge` | Add to knowledge base |
| `context_get_summary` | Get text summary |
