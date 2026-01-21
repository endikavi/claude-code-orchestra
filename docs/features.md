# Orchestra - Features

## Core Features

### Project Management
- **Add Projects**: Create projects by specifying a name and local directory path
- **Edit Projects**: Update project name, path, description, and color
- **Delete Projects**: Remove projects (kills associated instances)
- **Color Coding**: Assign colors to projects for easy identification
- **Persistence**: Projects stored in local SQLite database

### Instance Management
- **Create Instances**: Launch Claude CLI with custom prompt, model, and mode
- **Multiple Models**: Support for Claude Sonnet 4, Opus 4, and Haiku 3
- **Output Modes**:
  - Stream JSON: Structured output for parsing
  - Interactive: Full terminal interaction
  - Print: Non-interactive, result only
- **Kill Instances**: Terminate running instances
- **Send Input**: Interactive input to running instances

### Terminal View
- **xterm.js Integration**: Full terminal emulation
- **Color Support**: ANSI color codes rendered correctly
- **Scrollback**: 10,000 lines of history
- **Copy/Paste**: Standard terminal operations
- **Auto-resize**: Adapts to window size

### Structured View
- **Message Cards**: Parsed JSON displayed as cards
- **Content Blocks**: Text, tool use, thinking blocks
- **Status Badges**: Visual status indicators
- **Cost Tracking**: Display API costs per message
- **Collapsible Thinking**: Toggle thinking blocks

### Real-Time Status
- **Instance States**:
  - Starting (yellow)
  - Running (green, pulsing)
  - Needs Permission (orange)
  - Tool Executing (blue)
  - Completed (gray)
  - Error (red)
  - Killed (dark gray)
- **Status Dots**: Quick glance at instance states
- **Running Count**: Number of active instances

### Configuration Viewer
- **MCP Servers**: View configured servers and their status
- **Tools**: List enabled/disabled tools
- **Hooks**: View configured event hooks
- **Global & Project**: Read both global and project-level configs

### UI Features
- **Dark Theme**: Default dark mode
- **View Toggle**: Switch between terminal and structured views
- **Tabs**: Multiple instances per project
- **Context Menu**: Right-click actions on projects
- **Frameless Window**: Custom title bar with controls
- **Responsive**: Adapts to window size

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+N` | New project |
| `Ctrl/Cmd+T` | New instance (when project selected) |
| `Ctrl/Cmd+W` | Close current instance |
| `Ctrl/Cmd+Tab` | Next instance tab |
| `Ctrl/Cmd+Shift+Tab` | Previous instance tab |

## Coming Soon

- **Search**: Filter projects and instances
- **Logs**: Persistent log storage
- **Templates**: Saved prompt templates
- **Batch Operations**: Run same prompt across projects
- **Statistics**: Usage and cost tracking
