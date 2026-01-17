# Orchestra - Roadmap

## Phase 1: MVP (Current)

### Setup ✅
- [x] Project structure
- [x] Electron + Vite + React + TypeScript
- [x] Tailwind CSS configuration
- [x] Documentation

### Project Management ✅
- [x] SQLite database with better-sqlite3
- [x] Project CRUD operations
- [x] Project list with color coding
- [x] Context menu actions

### Instance Management ✅
- [x] ProcessManager with node-pty
- [x] StreamJSONParser for output
- [x] IPC communication
- [x] Instance creation modal

### Visualization ✅
- [x] xterm.js terminal view
- [x] Structured message view
- [x] Status indicators
- [x] Tab system

### Configuration ✅
- [x] ConfigReader service
- [x] MCP servers viewer
- [x] Tools and hooks viewer

---

## Phase 2: Enhanced UX

### Search & Filter
- [ ] Project search
- [ ] Instance filtering by status
- [ ] Full-text search in output

### Improved Terminal
- [ ] Multiple terminal tabs per instance
- [ ] Split view for parallel instances
- [ ] Terminal themes selection

### Notifications
- [ ] Desktop notifications for status changes
- [ ] Sound alerts for completion/error
- [ ] System tray integration

### Keyboard Navigation
- [ ] Vim-style navigation
- [ ] Command palette (Ctrl+P)
- [ ] Customizable shortcuts

---

## Phase 3: Productivity

### Templates
- [ ] Save prompt templates
- [ ] Template variables
- [ ] Template sharing

### Batch Operations
- [ ] Run prompt across multiple projects
- [ ] Parallel execution
- [ ] Results aggregation

### History
- [ ] Persistent instance history
- [ ] Replay past instances
- [ ] Export conversation

### Statistics
- [ ] Token usage tracking
- [ ] Cost analytics
- [ ] Time tracking

---

## Phase 4: Advanced Features

### Collaboration
- [ ] Export/import project configs
- [ ] Shared templates
- [ ] Team settings sync

### Automation
- [ ] Scheduled tasks
- [ ] Auto-retry on error
- [ ] Webhook integrations

### AI Enhancements
- [ ] Smart prompt suggestions
- [ ] Context-aware completions
- [ ] Output summarization

### Plugin System
- [ ] Custom view plugins
- [ ] Tool integrations
- [ ] Theme plugins

---

## Phase 5: Polish

### Performance
- [ ] Large output handling
- [ ] Memory optimization
- [ ] Lazy loading

### Accessibility
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Keyboard-only navigation

### Packaging
- [ ] Windows installer (NSIS)
- [ ] macOS DMG
- [ ] Linux AppImage
- [ ] Auto-updates

### Testing
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests with Playwright
