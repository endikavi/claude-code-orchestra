# Orchestra - Roadmap

> **Note**: Orchestra is currently in **beta (0.1.x)**. Features marked as complete are implemented but may require polish, bug fixes, and UX improvements.

---

## Phase 1: MVP ✅

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

## Phase 2: Remote Access & Collaboration ✅ (Beta)

### Web Access ✅
- [x] Express + Socket.IO web server
- [x] Standalone web client (React)
- [x] JWT-based authentication
- [x] Real-time instance synchronization
- [ ] 🔧 Improve web client UX
- [ ] 🔧 Optimize WebSocket reconnection

### Security ✅
- [x] Password hashing (bcrypt)
- [x] IP allowlist/denylist
- [x] Rate limiting and lockouts
- [x] Audit logging
- [ ] 🔧 UI for IP rule management
- [ ] 🔧 Export audit logs

### Multi-Node Cluster ✅
- [x] Primary/Secondary node architecture
- [x] Shared secret authentication
- [x] Cross-node instance visibility
- [x] Remote instance creation
- [ ] 🔧 Improve disconnection handling
- [ ] 🔧 Cluster status UI

---

## Phase 3: Notifications & Metrics ✅ (Beta)

### Notification System ✅
- [x] NotificationManager service
- [x] Desktop notifications
- [x] Notification preferences
- [x] Read/dismiss/clear operations
- [ ] 🔧 Sound alerts
- [ ] 🔧 System tray integration

### Metrics & Analytics ✅
- [x] MetricsService for tracking
- [x] Tool usage statistics
- [x] Cost breakdown by model/project
- [x] Session duration tracking
- [ ] 🔧 Visual metrics dashboard
- [ ] 🔧 Export reports

### Git Integration ✅
- [x] GitStatusManager service
- [x] Real-time git status tracking
- [x] MCP tool for git queries
- [ ] 🔧 Git status visualization in UI

---

## Phase 4: Session Management ✅ (Beta)

### Session Import ✅
- [x] ClaudeSessionImporter service
- [x] Scan existing Claude sessions
- [x] Batch import support
- [x] Conversation persistence
- [ ] 🔧 Improved import UI

### Subagent Tracking ✅
- [x] SubagentTracker service
- [x] Monitor Task tool spawns
- [x] Parent-child relationships
- [ ] 🔧 Subagent tree visualization

### Integrated Shell ✅
- [x] ShellInstance service
- [x] ShellDetector for available shells
- [x] Cross-platform support (bash, zsh, PowerShell, cmd)
- [x] Terminal emulation
- [ ] 🔧 Per-project preferred shell selection

---

## Phase 5: Hooks & Permissions ✅ (Beta)

### Hook Integration ✅
- [x] HookManager service
- [x] Hook templates
- [x] Real-time hook activity
- [x] Dashboard integration hooks
- [ ] 🔧 Hook editor in UI
- [ ] 🔧 More predefined templates

### Permission Management ✅
- [x] PermissionManager service
- [x] Rule-based permissions
- [x] Permission logging
- [ ] 🔧 UI for rule management
- [ ] 🔧 Predefined permission profiles

### Skill Management ✅
- [x] SkillManager service
- [x] Install/remove skills
- [ ] 🔧 Skills catalog in UI
- [ ] 🔧 Skill marketplace integration

---

## Phase 6: MCP Integration ✅ (Beta)

### Built-in MCP Server ✅
- [x] JSON-RPC 2.0 implementation
- [x] Token-based authentication
- [x] Rate limiting
- [x] Project tools (git_get_status, project_get_info, project_list_instances)
- [ ] 🔧 More MCP tools
- [ ] 🔧 MCP configuration UI

---

## Phase 7: Polish & Distribution ✅ (Beta)

### Packaging ✅
- [x] Windows installer (NSIS)
- [x] macOS DMG
- [x] Linux AppImage and .deb
- [x] Headless CLI mode
- [ ] Auto-updates
- [ ] Signed binaries

### Testing ✅
- [x] Vitest setup
- [x] Unit tests for core services
- [x] Test coverage reporting
- [ ] Integration tests
- [ ] E2E tests with Playwright

### Internationalization ✅
- [x] i18next integration
- [x] Language detection
- [ ] 🔧 Complete translations
- [ ] 🔧 More languages

---

## Next Steps (Post-Beta)

### Enhanced UX
- [ ] Project search and filtering
- [ ] Instance filtering by status
- [ ] Full-text search in output
- [ ] Command palette (Ctrl+P)
- [ ] Customizable keyboard shortcuts
- [ ] Terminal themes

### Templates & Automation
- [ ] Save prompt templates
- [ ] Template variables
- [ ] Run prompt across multiple projects
- [ ] Scheduled tasks
- [ ] Webhook integrations

### Performance
- [ ] Large output optimization
- [ ] Memory profiling
- [ ] Lazy loading improvements

### Accessibility
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Full keyboard navigation

---

## Legend

- ✅ Implemented (may require polish)
- 🔧 Pending improvement to existing functionality
- [ ] Not implemented
