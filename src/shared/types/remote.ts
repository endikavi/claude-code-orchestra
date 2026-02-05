import type {
  Project,
  ClaudeInstance,
  Conversation,
  StreamMessage,
  InstanceStatus,
  SubagentInstance,
  TrackedTask,
  TrackedTeam,
  TrackedPlan,
  SharedInstanceContext,
  ProjectSharedKnowledge,
  ContextUpdateEvent,
} from './index';
import type { SslConfig } from './ssl';

// Remote access configuration
export interface RemoteConfig {
  port: number;
  passwordHash: string;

  // Controls web access (auth, projects, instances routes)
  // When false, only internal routes (hooks, MCP, context) are accessible
  webAccessEnabled: boolean;

  // DEPRECATED: Ignored - server always starts automatically
  autoStart: boolean;

  // DEPRECATED: Use webAccessEnabled instead (kept for backwards compatibility)
  enabled: boolean;

  allowAnyCors: boolean; // Allow connections from any origin (for LAN access)
  customHostname: string; // Custom hostname/domain for CORS (e.g., "orchestra.local")
  ssl: SslConfig; // SSL/TLS configuration for HTTPS
}

// Remote session information
export interface RemoteSession {
  id: string;
  ip: string;
  userAgent: string;
  connectedAt: number;
  lastActivity: number;
}

// JWT token payload
export interface TokenPayload {
  sessionId: string;
  ip: string;
  iat: number;
  exp: number;
}

// Hook status update data
export interface HookStatusUpdate {
  status: string;
  message?: string;
  progress?: number;
}

// WebSocket events (Server -> Client)
export interface ServerToClientEvents {
  'instance:output': (instanceId: string, data: StreamMessage) => void;
  'instance:status': (instanceId: string, status: InstanceStatus) => void;
  'instance:error': (instanceId: string, error: string) => void;
  'instance:exit': (instanceId: string, code: number) => void;
  'instance:rawOutput': (instanceId: string, data: string) => void;
  'instance:sessionId': (instanceId: string, sessionId: string) => void;
  'instance:terminalTitle': (instanceId: string, title: string) => void;
  'instance:hookStatus': (instanceId: string, data: HookStatusUpdate) => void;
  'instance:dimensionSync': (instanceId: string, cols: number, rows: number) => void;
  'hook:activity': (data: {
    instanceId: string;
    toolName?: string;
    files?: string[];
    timestamp: number;
  }) => void;
  'sync:state': (state: SyncState) => void;
  'session:kicked': (reason: string) => void;
  // Subagent events (native Claude Task tool tracking)
  'subagent:started': (data: { instanceId: string; subagent: SubagentInstance }) => void;
  'subagent:completed': (data: { instanceId: string; subagent: SubagentInstance }) => void;
  // Task events (Claude Code TaskCreate/TaskUpdate/TaskList tools)
  'task:created': (data: { instanceId: string; task: TrackedTask }) => void;
  'task:updated': (data: { instanceId: string; task: TrackedTask }) => void;
  'task:list': (data: { instanceId: string; tasks: TrackedTask[] }) => void;
  // Proxy events (for web preview tunneling)
  'proxy:open': (data: {
    port: number;
    path?: string;
    split?: boolean;
    title?: string;
    instanceId?: string;
  }) => void;
  // DevTools events (for web preview console/inspector)
  'devtools:command': (data: {
    viewId?: string;
    instanceId?: string;
    command: { type: string; [key: string]: unknown };
  }) => void;
  // Shared context events
  'context:instanceUpdated': (data: { projectId: string; context: SharedInstanceContext }) => void;
  'context:knowledgeUpdated': (data: {
    projectId: string;
    knowledge: ProjectSharedKnowledge;
  }) => void;
  'context:updated': (event: ContextUpdateEvent) => void;
  'context:sessionStarted': (data: { instanceId: string; projectId: string }) => void;
  // Team events
  'team:created': (data: { team: TrackedTeam }) => void;
  'team:updated': (data: { team: TrackedTeam }) => void;
  'team:deleted': (data: { teamName: string }) => void;
  // Plan events
  'plan:created': (data: { plan: TrackedPlan }) => void;
  'plan:updated': (data: { plan: TrackedPlan }) => void;
  'plan:deleted': (data: { planName: string }) => void;
}

// Subscription callback response
export interface SubscriptionResponse {
  success: boolean;
}

// WebSocket events (Client -> Server)
export interface ClientToServerEvents {
  'instance:input': (instanceId: string, input: string) => void;
  'instance:resize': (instanceId: string, cols: number, rows: number) => void;
  'subscribe:instance': (
    instanceId: string,
    callback?: (response: SubscriptionResponse) => void
  ) => void;
  'unsubscribe:instance': (
    instanceId: string,
    callback?: (response: SubscriptionResponse) => void
  ) => void;
  'request:sync': () => void;
  // DevTools events (from web client to server)
  'devtools:registerView': (data: { viewId: string; instanceId: string }) => void;
  'devtools:unregisterView': (data: { viewId: string }) => void;
  'devtools:console': (data: {
    viewId: string;
    entry: {
      level: string;
      message: string;
      timestamp: number;
      source?: string;
      line?: number;
    };
  }) => void;
  'devtools:clearConsole': (data: { viewId: string }) => void;
  'devtools:toggleInspector': (data: { viewId: string; enabled?: boolean }) => void;
}

// Output buffer for instance synchronization
export interface InstanceOutputBuffer {
  messages: StreamMessage[];
  rawOutput: string;
}

// Sync state sent to web clients
export interface SyncState {
  projects: Project[];
  instances: ClaudeInstance[];
  conversations: Conversation[];
  outputs?: Record<string, InstanceOutputBuffer>; // Output buffers for each instance
  instanceConversations?: Record<string, string>; // Mapping: instanceId -> conversationId
}

// Login request/response
export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  error?: string;
}

// API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Remote server status
export interface RemoteServerStatus {
  running: boolean;
  port: number;
  url: string | null;
  localIp: string | null;
  activeSessions: number;
  sessions: RemoteSession[];
}

// Default remote config values
export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  port: 3847,
  passwordHash: '',
  webAccessEnabled: false, // Web access disabled by default, internal routes always available
  autoStart: false, // DEPRECATED - server always starts
  enabled: false, // DEPRECATED - use webAccessEnabled
  allowAnyCors: false,
  customHostname: '',
  ssl: {
    enabled: false,
    selfSigned: false,
  },
};

// Default port for remote access
export const DEFAULT_REMOTE_PORT = 3847;

// JWT expiration time (24 hours)
export const JWT_EXPIRATION = '24h';

// Rate limiting config
export const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 5, // 5 attempts per minute
};
