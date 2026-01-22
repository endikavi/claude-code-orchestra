// Instance status types
export type InstanceStatus =
  | 'starting'
  | 'running'
  | 'waiting_input'
  | 'needs_permission'
  | 'tool_executing'
  | 'completed'
  | 'error'
  | 'killed';

// Shell instance status types
export type ShellInstanceStatus = 'running' | 'completed' | 'error' | 'killed';

// Split tab configuration for side-by-side terminal views
export interface SplitTab {
  id: string;
  leftInstanceId: string;
  rightInstanceId: string;
  leftType: 'instance' | 'shell';
  rightType: 'instance' | 'shell';
}

// Shell instance interface (for integrated terminal)
export interface ShellInstance {
  id: string;
  projectId: string;
  type: 'shell';
  status: ShellInstanceStatus;
  createdAt: number;
  pid?: number;
}

// Claude CLI models (using aliases)
export type ClaudeModel = 'sonnet' | 'opus' | 'haiku';

// Instance mode
export type InstanceMode = 'interactive' | 'print' | 'stream-json';

// Available shell info
export interface AvailableShell {
  id: string; // e.g., 'powershell', 'bash'
  name: string; // e.g., 'PowerShell', 'Bash'
  path: string; // e.g., 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
  isDefault: boolean; // Is the system default shell
  canRunClaude: boolean; // Can execute claude command (Windows: powershell recommended)
}

// Import cluster permissions types
import type { ProjectClusterPermissions } from './clusterPermissions';

// Project interface
export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  color?: string;
  hostname?: string; // Machine hostname where project is located
  skipPermissions?: boolean; // Launch instances with --dangerously-skip-permissions
  preferredShell?: string; // Preferred shell path for terminal instances
  enableMcp?: boolean; // Enable MCP server integration for Claude instances
  clusterPermissions?: ProjectClusterPermissions; // Cluster sharing and permission settings
  createdAt: number;
  updatedAt: number;
}

// Supported UI languages
export type Language = 'es' | 'en';

// Claude instance interface
export interface ClaudeInstance {
  id: string;
  projectId: string;
  prompt?: string; // Optional - user types first message in terminal
  model: ClaudeModel;
  mode: InstanceMode;
  planMode?: boolean; // Launch with --plan flag
  status: InstanceStatus;
  createdAt: number;
  pid?: number;
  error?: string;
  terminalTitle?: string; // Dynamic title set by Claude CLI via ANSI escape
}

// Stream JSON message types from Claude CLI
export interface StreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  message?: AssistantMessage;
  session_id?: string;
  tools?: string[];
  mcp_servers?: McpServer[];
  cost_usd?: number;
  is_error?: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  result?: string;
}

export interface AssistantMessage {
  id: string;
  type: 'message';
  role: 'assistant' | 'user';
  content: ContentBlock[];
  model: string;
  stop_reason?: string;
  stop_sequence?: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ThinkingBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface McpServer {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  tools?: string[];
}

// Conversation status types
export type ConversationStatus = 'active' | 'completed' | 'error' | 'archived';

// Persisted conversation
export interface Conversation {
  id: string;
  projectId: string;
  sessionId?: string; // For Claude CLI --resume
  title: string; // First words of the prompt
  initialPrompt: string;
  model: ClaudeModel;
  mode: InstanceMode;
  status: ConversationStatus;
  totalCostUsd: number;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

// Persisted message
export interface ConversationMessage {
  id: string;
  conversationId: string;
  type: StreamMessage['type'];
  content: string; // JSON serialized StreamMessage
  costUsd?: number;
  createdAt: number;
}

// IPC channel types
export interface IpcChannels {
  // Project operations
  'project:create': (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Project;
  'project:update': (project: Project) => Project;
  'project:delete': (id: string) => void;
  'project:getAll': () => Project[];
  'project:getById': (id: string) => Project | null;

  // Instance operations
  'instance:create': (config: {
    projectId: string;
    model: ClaudeModel;
    mode: InstanceMode;
    planMode?: boolean;
  }) => ClaudeInstance;
  'instance:kill': (id: string) => void;
  'instance:sendInput': (id: string, input: string) => void;
  'instance:getAll': () => ClaudeInstance[];
  'instance:getByProject': (projectId: string) => ClaudeInstance[];

  // Config operations
  'config:getClaudeSettings': () => ClaudeSettings | null;
  'config:getMcpServers': () => McpServer[];

  // Window operations
  'window:minimize': () => void;
  'window:maximize': () => void;
  'window:close': () => void;

  // Dialog operations
  'dialog:selectDirectory': () => string | null;
}

// Claude settings from .claude.json or similar
export interface ClaudeSettings {
  mcpServers?: Record<string, McpServerConfig>;
  tools?: ToolConfig[];
  hooks?: HookConfig[];
  permissions?: PermissionConfig;
}

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
}

export interface HookConfig {
  event: string;
  command: string;
}

export interface PermissionConfig {
  allowedTools?: string[];
  deniedTools?: string[];
  autoApprove?: boolean;
}

// Events emitted from main to renderer
export interface IpcEvents {
  'instance:output': (instanceId: string, data: StreamMessage) => void;
  'instance:status': (instanceId: string, status: InstanceStatus) => void;
  'instance:error': (instanceId: string, error: string) => void;
  'instance:exit': (instanceId: string, code: number) => void;
}

// Session import types
export interface ClaudeSessionInfo {
  sessionId: string;
  projectPath: string;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  messageCount: number;
  firstUserMessage?: string;
  isImported: boolean;
}

export interface SessionImportResult {
  success: boolean;
  conversationId?: string;
  error?: string;
}

export interface SessionImportBatchResult {
  imported: number;
  failed: number;
  errors: string[];
}

// Re-export cluster types
export * from './cluster';

// Re-export security types
export * from './security';

// Re-export hooks types
export * from './hooks';

// Re-export notifications types
export * from './notifications';

// Re-export permissions types
export * from './permissions';

// Re-export metrics types
export * from './metrics';

// Re-export orchestration types
export * from './orchestration';

// Git status types
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: { added: number; modified: number; deleted: number };
  unstaged: { added: number; modified: number; deleted: number };
  untracked: number;
  totalFiles: number;
  linesAdded: number;
  linesRemoved: number;
  lastCommitTime: number | null;
  lastCommitMessage: string | null;
  isRepo: boolean;
  lastChecked: number;
}
