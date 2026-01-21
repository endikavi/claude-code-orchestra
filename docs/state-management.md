# State Management Guide

Claude Code Orchestra uses Zustand for client-side state management. This document explains the store architecture and patterns.

## Store Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Renderer Process                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                      Zustand Stores                      │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │ projectStore │  │instanceStore │  │ clusterStore │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │ conversation │  │   uiStore    │  │  gitStore    │   │ │
│  │  │    Store     │  │              │  │              │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │metricsStore  │  │notification  │  │ permission   │   │ │
│  │  │              │  │   Store      │  │   Store      │   │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │ │
│  │  ┌──────────────┐                                       │ │
│  │  │orchestration │                                       │ │
│  │  │   Store      │                                       │ │
│  │  └──────────────┘                                       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
           ▲                    ▲
           │      IPC           │
           ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                        Main Process                          │
│        DataStore    ProcessManager    ClusterManager         │
└─────────────────────────────────────────────────────────────┘
```

## Stores

### projectStore
**Location:** `src/renderer/stores/projectStore.ts`

Manages project data and selection.

**State:**
```typescript
interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  isLoading: boolean;
  error: string | null;
}
```

**Actions:**
- `loadProjects()` - Fetch projects from main process
- `createProject(data)` - Create new project
- `updateProject(data)` - Update existing project
- `deleteProject(id)` - Delete project
- `selectProject(id)` - Set selected project
- `getSelectedProject()` - Get current project

**Usage:**
```typescript
import { useProjectStore } from '../stores/projectStore';

function ProjectList() {
  const { projects, selectedProjectId, selectProject } = useProjectStore();

  return (
    <ul>
      {projects.map(p => (
        <li
          key={p.id}
          onClick={() => selectProject(p.id)}
          className={p.id === selectedProjectId ? 'selected' : ''}
        >
          {p.name}
        </li>
      ))}
    </ul>
  );
}
```

### instanceStore
**Location:** `src/renderer/stores/instanceStore.ts`

Manages Claude and shell instances, including output buffers.

**State:**
```typescript
interface InstanceState {
  instances: ClaudeInstance[];
  shellInstances: ShellInstance[];
  selectedInstanceId: string | null;
  selectedShellId: string | null;
  outputs: Record<string, StreamMessage[]>;
  rawOutputs: Record<string, string>;
  shellOutputs: Record<string, string>;
}
```

**Actions:**
- `createInstance(config)` - Start new Claude instance
- `killInstance(id)` - Terminate instance
- `sendInput(id, text)` - Send input to instance
- `selectInstance(id)` - Select active instance
- `getInstanceOutput(id)` - Get parsed output
- `getRawOutput(id)` - Get raw terminal output
- `createShellInstance(projectId)` - Start shell
- `killShellInstance(id)` - Terminate shell

**IPC Event Listeners:**
The store sets up listeners for real-time updates:
- `instance:output` - Parsed message received
- `instance:status` - Status change
- `instance:rawOutput` - Raw terminal data
- `instance:exit` - Process terminated
- `shell:output` - Shell output data

### conversationStore
**Location:** `src/renderer/stores/conversationStore.ts`

Manages conversation history persistence.

**State:**
```typescript
interface ConversationState {
  conversations: Conversation[];
  selectedConversationId: string | null;
  messages: Record<string, Message[]>;
}
```

**Actions:**
- `loadConversations(projectId)` - Fetch conversations
- `createConversation(data)` - Create conversation
- `loadMessages(conversationId)` - Fetch messages
- `selectConversation(id)` - Select active conversation

### clusterStore
**Location:** `src/renderer/stores/clusterStore.ts`

Manages cluster connectivity and global state.

**State:**
```typescript
interface ClusterState {
  config: ClusterConfig;
  isConnected: boolean;
  globalProjects: Project[];
  globalInstances: ClaudeInstance[];
  nodeStatus: Record<string, NodeStatus>;
}
```

**Actions:**
- `loadConfig()` - Fetch cluster configuration
- `updateConfig(data)` - Save configuration
- `connect()` / `disconnect()` - Manage connection
- `getGlobalProjects()` - Get all projects across nodes

### uiStore
**Location:** `src/renderer/stores/uiStore.ts`

Manages UI state and preferences.

**State:**
```typescript
interface UIState {
  theme: 'light' | 'dark' | 'system';
  viewMode: 'terminal' | 'structured';
  language: string;
  showInstanceModal: boolean;
  sidebarCollapsed: boolean;
}
```

**Actions:**
- `setTheme(theme)` - Change theme
- `setViewMode(mode)` - Switch view
- `toggleSidebar()` - Toggle sidebar
- `setShowInstanceModal(show)` - Control modal visibility

### gitStore
**Location:** `src/renderer/stores/gitStore.ts`

Manages git repository status for projects.

**State:**
```typescript
interface GitState {
  statuses: Record<string, GitStatus>;  // Keyed by project path
  isLoading: Record<string, boolean>;
}
```

**Actions:**
- `loadStatus(projectPath)` - Fetch git status
- `refreshStatus(projectPath)` - Force refresh
- `getStatus(projectPath)` - Get cached status

**IPC Event Listeners:**
- `git:statusChanged` - Git status updates

### metricsStore
**Location:** `src/renderer/stores/metricsStore.ts`

Manages usage metrics and analytics data.

**State:**
```typescript
interface MetricsState {
  toolUsage: ToolUsageMetrics | null;
  dashboardSummary: DashboardSummary | null;
  costBreakdown: CostBreakdown | null;
  isLoading: boolean;
}
```

**Actions:**
- `loadToolUsage()` - Fetch tool usage stats
- `loadDashboardSummary()` - Fetch dashboard summary
- `loadCostBreakdown()` - Fetch cost breakdown
- `clearMetrics()` - Clear all metrics

### notificationStore
**Location:** `src/renderer/stores/notificationStore.ts`

Manages notification state and preferences.

**State:**
```typescript
interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  preferences: NotificationPreferences;
}
```

**Actions:**
- `loadNotifications()` - Fetch all notifications
- `markRead(id)` - Mark notification as read
- `markAllRead()` - Mark all as read
- `dismiss(id)` - Dismiss notification
- `clearAll()` - Clear all notifications

**IPC Event Listeners:**
- `notification:new` - New notification arrived
- `notification:updated` - Notification updated

### permissionStore
**Location:** `src/renderer/stores/permissionStore.ts`

Manages permission rules and configuration.

**State:**
```typescript
interface PermissionState {
  config: PermissionConfig | null;
  rules: PermissionRule[];
  log: PermissionLogEntry[];
  stats: PermissionStats | null;
}
```

**Actions:**
- `loadConfig()` - Fetch permission config
- `addRule(rule)` - Add permission rule
- `updateRule(id, updates)` - Update rule
- `removeRule(id)` - Remove rule
- `loadLog()` - Fetch permission log
- `loadStats()` - Fetch permission stats

### orchestrationStore
**Location:** `src/renderer/stores/orchestrationStore.ts`

Manages multi-instance orchestration state.

**State:**
```typescript
interface OrchestrationState {
  subagents: Record<string, Subagent[]>;  // Keyed by parent instance ID
  activeDirectors: string[];
}
```

**Actions:**
- `loadSubagents(instanceId)` - Fetch subagents for instance
- `getSubagentsByInstance(instanceId)` - Get cached subagents

**IPC Event Listeners:**
- `subagent:started` - Subagent spawned
- `subagent:completed` - Subagent finished

## Patterns

### Selector Pattern

Use selectors to derive data from state:

```typescript
// In store definition
getInstancesByProject: (projectId: string) => {
  return get().instances.filter(i => i.projectId === projectId);
}

// In component
const { getInstancesByProject } = useInstanceStore();
const projectInstances = getInstancesByProject(selectedProjectId);
```

### Async Actions

Async actions use try/catch with error state:

```typescript
createProject: async (data: CreateProjectData) => {
  set({ isLoading: true, error: null });
  try {
    const project = await window.electronAPI.createProject(data);
    set(state => ({
      projects: [...state.projects, project],
      isLoading: false
    }));
    return project;
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : 'Unknown error',
      isLoading: false
    });
    throw error;
  }
}
```

### IPC Integration

Stores integrate with IPC for main process communication:

```typescript
// Setup listener in store
setupListeners: () => {
  const handleOutput = (instanceId: string, message: StreamMessage) => {
    get().addOutput(instanceId, message);
  };

  window.electronAPI.onInstanceOutput(handleOutput);

  // Return cleanup function
  return () => {
    window.electronAPI.removeInstanceOutputListener(handleOutput);
  };
}

// Use in component
useEffect(() => {
  const cleanup = useInstanceStore.getState().setupListeners();
  return cleanup;
}, []);
```

### Persistence

UI preferences are persisted to localStorage:

```typescript
// Using Zustand persist middleware
import { persist } from 'zustand/middleware';

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'system',
      // ...
    }),
    {
      name: 'ui-settings',
      partialize: (state) => ({
        theme: state.theme,
        viewMode: state.viewMode,
        language: state.language,
      }),
    }
  )
);
```

## Web Client Considerations

The web client uses a different state synchronization approach via WebSocket:

```typescript
// Web client receives full state sync
socket.on('sync:state', (state: SyncState) => {
  useProjectStore.setState({ projects: state.projects });
  useInstanceStore.setState({ instances: state.instances });
});

// Real-time updates for instance events
socket.on('instance:output', (instanceId, message) => {
  useInstanceStore.getState().addOutput(instanceId, message);
});
```

## Testing Stores

Use Zustand's vanilla store for testing:

```typescript
import { createStore } from 'zustand';
import { projectStoreCreator } from '../stores/projectStore';

describe('projectStore', () => {
  let store: ReturnType<typeof createStore<ProjectState>>;

  beforeEach(() => {
    store = createStore(projectStoreCreator);
  });

  it('should add project', () => {
    const project = { id: '1', name: 'Test' };
    store.getState().addProject(project);
    expect(store.getState().projects).toContain(project);
  });
});
```
