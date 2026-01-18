import type { Project, ClaudeInstance, Conversation, StreamMessage, InstanceStatus } from './index';

// Remote access configuration
export interface RemoteConfig {
  enabled: boolean;
  port: number;
  passwordHash: string;
  autoStart: boolean;
  allowAnyCors: boolean; // Allow connections from any origin (for LAN access)
  customHostname: string; // Custom hostname/domain for CORS (e.g., "orchestra.local")
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

// WebSocket events (Server -> Client)
export interface ServerToClientEvents {
  'instance:output': (instanceId: string, data: StreamMessage) => void;
  'instance:status': (instanceId: string, status: InstanceStatus) => void;
  'instance:error': (instanceId: string, error: string) => void;
  'instance:exit': (instanceId: string, code: number) => void;
  'instance:rawOutput': (instanceId: string, data: string) => void;
  'instance:sessionId': (instanceId: string, sessionId: string) => void;
  'sync:state': (state: SyncState) => void;
  'session:kicked': (reason: string) => void;
}

// WebSocket events (Client -> Server)
export interface ClientToServerEvents {
  'instance:input': (instanceId: string, input: string) => void;
  'instance:resize': (instanceId: string, cols: number, rows: number) => void;
  'subscribe:instance': (instanceId: string) => void;
  'unsubscribe:instance': (instanceId: string) => void;
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
  enabled: false,
  port: 3847,
  passwordHash: '',
  autoStart: false,
  allowAnyCors: false,
  customHostname: '',
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
