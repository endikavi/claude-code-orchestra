# Orchestra - Roadmap

> **Nota**: Orchestra está actualmente en **beta (0.1.x)**. Las funcionalidades marcadas como completadas están implementadas pero pueden requerir pulido, corrección de bugs y mejoras de UX.

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
- [ ] 🔧 Mejorar UX del cliente web
- [ ] 🔧 Optimizar reconexión WebSocket

### Security ✅
- [x] Password hashing (bcrypt)
- [x] IP allowlist/denylist
- [x] Rate limiting and lockouts
- [x] Audit logging
- [ ] 🔧 UI para gestión de reglas IP
- [ ] 🔧 Exportar audit logs

### Multi-Node Cluster ✅
- [x] Primary/Secondary node architecture
- [x] Shared secret authentication
- [x] Cross-node instance visibility
- [x] Remote instance creation
- [ ] 🔧 Mejorar manejo de desconexiones
- [ ] 🔧 UI de estado del cluster

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
- [ ] 🔧 Dashboard de métricas visual
- [ ] 🔧 Exportar reportes

### Git Integration ✅
- [x] GitStatusManager service
- [x] Real-time git status tracking
- [x] MCP tool for git queries
- [ ] 🔧 Visualización de git status en UI

---

## Phase 4: Session Management ✅ (Beta)

### Session Import ✅
- [x] ClaudeSessionImporter service
- [x] Scan existing Claude sessions
- [x] Batch import support
- [x] Conversation persistence
- [ ] 🔧 UI de importación mejorada

### Subagent Tracking ✅
- [x] SubagentTracker service
- [x] Monitor Task tool spawns
- [x] Parent-child relationships
- [ ] 🔧 Visualización de árbol de subagents

### Integrated Shell ✅
- [x] ShellInstance service
- [x] ShellDetector for available shells
- [x] Cross-platform support (bash, zsh, PowerShell, cmd)
- [x] Terminal emulation
- [ ] 🔧 Selección de shell preferido por proyecto

---

## Phase 5: Hooks & Permissions ✅ (Beta)

### Hook Integration ✅
- [x] HookManager service
- [x] Hook templates
- [x] Real-time hook activity
- [x] Dashboard integration hooks
- [ ] 🔧 Editor de hooks en UI
- [ ] 🔧 Más templates predefinidos

### Permission Management ✅
- [x] PermissionManager service
- [x] Rule-based permissions
- [x] Permission logging
- [ ] 🔧 UI para gestión de reglas
- [ ] 🔧 Perfiles de permisos predefinidos

### Skill Management ✅
- [x] SkillManager service
- [x] Install/remove skills
- [ ] 🔧 Catálogo de skills en UI
- [ ] 🔧 Skill marketplace integration

---

## Phase 6: MCP Integration ✅ (Beta)

### Built-in MCP Server ✅
- [x] JSON-RPC 2.0 implementation
- [x] Token-based authentication
- [x] Rate limiting
- [x] Project tools (git_get_status, project_get_info, project_list_instances)
- [ ] 🔧 Más herramientas MCP
- [ ] 🔧 UI de configuración MCP

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
- [ ] 🔧 Completar traducciones
- [ ] 🔧 Más idiomas

---

## Próximos Pasos (Post-Beta)

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

## Leyenda

- ✅ Implementado (puede requerir pulido)
- 🔧 Mejora pendiente de funcionalidad existente
- [ ] No implementado
