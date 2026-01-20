# MCP Integration Guide

Claude Code Orchestra includes a built-in MCP (Model Context Protocol) server that allows Claude CLI instances to interact directly with Orchestra's features.

## Overview

When MCP is enabled for a project, Claude instances can use specialized tools to:

- **Orchestration**: Propose and monitor worker instances (Director Mode)
- **Git Integration**: Query current git status before making changes
- **Project Info**: Access project configuration and metadata
- **Instance Monitoring**: List and monitor other Claude instances in the project

## Enabling MCP

### Via UI

1. Open the Project Modal (create new or edit existing project)
2. Check the "Enable MCP Server" checkbox
3. Save the project

### Via Database

Projects with `enableMcp: true` will automatically configure MCP for new instances.

## How It Works

1. **Instance Start**: When a Claude instance starts with MCP enabled:
   - Orchestra generates a unique authentication token
   - Writes MCP configuration to `.mcp.json` in the project root
   - Registers the token with the MCP server

2. **Tool Calls**: Claude can invoke MCP tools via the standard MCP protocol:
   - All requests go through `http://localhost:3847/mcp`
   - Authenticated via `X-Instance-Token` header
   - Returns JSON-RPC 2.0 responses

3. **Cleanup**: When the instance terminates:
   - Token is unregistered from MCP server
   - Rate limit counters are cleared

## Available Tools

### Orchestration Tools

#### `orchestra_propose_workers`
Propose worker instances for parallel task execution.

**Input:**
```json
{
  "workers": [
    {
      "task": "Implement user authentication",
      "model": "sonnet",
      "rationale": "Complex feature requiring careful implementation"
    }
  ]
}
```

**Output:**
```json
{
  "proposalId": "uuid",
  "status": "pending_approval",
  "workerCount": 1,
  "message": "Worker proposal submitted. Waiting for user approval."
}
```

#### `orchestra_get_workers`
Get status and output of all workers created by this director.

**Input:** `{}`

**Output:**
```json
{
  "workers": [
    {
      "workerId": "uuid",
      "task": "Implement user authentication",
      "model": "sonnet",
      "status": "running",
      "createdAt": 1700000000000,
      "output": null
    }
  ],
  "totalWorkers": 1,
  "completed": 0,
  "running": 1,
  "error": 0
}
```

#### `orchestra_get_shared_context`
Get shared context broadcasted from all workers.

**Input:** `{}`

**Output:**
```json
{
  "summaries": ["Worker completed authentication module"],
  "filesModified": ["src/auth/index.ts", "src/auth/middleware.ts"],
  "errors": []
}
```

### Project Tools

#### `git_get_status`
Get current git repository status.

**Input:** `{}`

**Output:**
```json
{
  "branch": "main",
  "remote": "origin/main",
  "ahead": 2,
  "behind": 0,
  "staged": ["src/index.ts"],
  "unstaged": ["README.md"],
  "untracked": ["new-file.ts"],
  "conflicts": []
}
```

#### `project_get_info`
Get information about the current project.

**Input:** `{}`

**Output:**
```json
{
  "id": "project-uuid",
  "name": "my-project",
  "path": "/path/to/project",
  "description": "Project description",
  "model": "sonnet",
  "mode": "stream-json",
  "settings": {}
}
```

#### `project_list_instances`
List all Claude instances running in this project.

**Input:** `{}`

**Output:**
```json
{
  "instances": [
    {
      "id": "instance-uuid",
      "status": "running",
      "model": "sonnet",
      "mode": "stream-json",
      "isDirector": true,
      "isWorker": false
    }
  ],
  "totalInstances": 1,
  "directors": 1,
  "workers": 0
}
```

## Security

### Authentication

- Each instance gets a unique token generated at startup
- Tokens are validated on every MCP request
- Invalid tokens receive 401 Unauthorized response
- Tokens are automatically invalidated when instances terminate

### Rate Limiting

- Maximum 100 requests per minute per instance
- Prevents abuse and ensures fair resource usage
- Rate limits reset after 1-minute sliding window

### Scope Restrictions

- MCP tools can only access the project associated with the instance
- Cannot create/modify other projects
- Cannot kill or control other instances

## Technical Details

### MCP Bridge

Orchestra uses a stdio-to-HTTP bridge for MCP communication. When MCP is enabled:

1. A bridge script is written to `%APPDATA%/claude-code-orchestra/mcp-bridge.js` (Windows) or `~/.claude-code-orchestra/mcp-bridge.js` (Unix)
2. The bridge reads JSON-RPC requests from stdin and forwards them to Orchestra's HTTP endpoint
3. Responses are written back to stdout

### Configuration Format

When MCP is enabled, Orchestra creates a `.mcp.json` file in the project root with the following format:

```json
{
  "mcpServers": {
    "orchestra": {
      "command": "node",
      "args": ["/path/to/mcp-bridge.js"],
      "env": {
        "ORCHESTRA_MCP_TOKEN": "instance-token",
        "ORCHESTRA_MCP_URL": "http://localhost:3847/mcp"
      }
    }
  }
}
```

> **Note**: Claude Code reads MCP servers from `.mcp.json` (project scope) or `~/.claude.json` (user scope), NOT from `.claude/settings.json`.

## Troubleshooting

### MCP Not Working

1. **Check WebServer is running**: Orchestra's web server must be active on port 3847
2. **Verify project has MCP enabled**: Check project settings in UI
3. **Check `.mcp.json`**: Verify MCP configuration was written to the project root

### Tools Not Available

1. **Wait for instance initialization**: MCP config is written async at startup
2. **Restart the instance**: If config was written after Claude started
3. **Check Orchestra logs**: Look for MCP-related error messages

### Authentication Errors

1. **Token expired**: Instance may have been killed and restarted
2. **Wrong token**: Check if `.mcp.json` has correct token
3. **Rate limited**: Wait 1 minute if making too many requests

## API Endpoints

### POST /mcp
Main MCP JSON-RPC endpoint.

### GET /mcp/tools
List available tools (requires authentication).

### GET /mcp/stats
Get MCP server statistics (no authentication required).

## Environment Variables

When MCP is enabled, these environment variables are set for the Claude process:

- `ORCHESTRA_MCP_ENABLED`: Set to `"true"`
- `ORCHESTRA_MCP_TOKEN`: The instance's authentication token
- `ORCHESTRA_MCP_URL`: The MCP endpoint URL (e.g., `http://localhost:3847/mcp`)
