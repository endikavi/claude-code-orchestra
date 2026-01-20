// Hook event types supported by Claude CLI
export type HookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'Notification'
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreCompact'; // Before conversation compacting

// Hook command configuration
export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number; // Timeout in milliseconds
}

// Single hook definition
// matcher is a string pattern: "Write", "Write|Edit|Read", "*", "mcp__.*"
export interface HookDefinition {
  hooks: HookCommand[];
  matcher?: string; // String with regex pattern for tool matching
}

// Complete hooks configuration (matches .claude/settings.json structure)
// Note: In settings.json, hooks are NOT wrapped in a "hooks" key
// The event types are at the root level
export type HooksConfig = {
  [K in HookEventType]?: HookDefinition[];
};

// Hook execution input (what Claude sends to hook stdin)
export interface HookInput {
  // Standard Claude Code fields
  session_id: string;
  hook_event_name?: string; // The event that triggered this hook
  transcript_path?: string; // Path to conversation transcript
  cwd?: string; // Current working directory
  permission_mode?: string; // Current permission mode
  // Tool-specific fields (for PreToolUse/PostToolUse)
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: unknown; // Result from tool execution (PostToolUse only)
  // Notification fields
  notification_type?: string;
  message?: string;
  // Dashboard-specific extensions
  instance_id?: string;
  project_path?: string;
  timestamp?: number;
}

// Complete hook output format (for any hook)
export interface HookOutput {
  continue?: boolean; // Whether to continue execution (default: true)
  suppressOutput?: boolean; // Whether to suppress this hook's output (default: false)
  hookSpecificOutput?: {
    // For permission hooks
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    // For general hooks
    hookEventName?: string;
    additionalContext?: string; // Context injected to the model
    message?: string; // Message shown to user
  };
}

// Alias for backward compatibility
export type HookPermissionOutput = HookOutput;

// Tool use event data from PostToolUse hook
export interface ToolUseEvent {
  instanceId: string;
  projectId: string;
  sessionId?: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  success: boolean;
  durationMs?: number;
  timestamp: number;
}

// Stop event data
export interface StopEvent {
  instanceId: string;
  projectId: string;
  sessionId?: string;
  reason?: string;
  totalCostUsd?: number;
  durationMs?: number;
  timestamp: number;
}

// Status update event from hook
export interface StatusUpdateEvent {
  instanceId: string;
  status: string;
  message?: string;
  progress?: number; // 0-100
  timestamp: number;
}

// Dashboard hook integration settings
export interface DashboardHookSettings {
  enabled: boolean;
  enableNotifications: boolean;
  enableToolTracking: boolean;
  enablePermissionCheck: boolean;
  enableMetrics: boolean;
  customHooks?: HookDefinition[];
}

// Default dashboard hook settings
export const DEFAULT_DASHBOARD_HOOK_SETTINGS: DashboardHookSettings = {
  enabled: true,
  enableNotifications: true,
  enableToolTracking: true,
  enablePermissionCheck: false,
  enableMetrics: true,
};

// Hook template types
export type HookTemplateType = 'basic' | 'monitored' | 'collaborative' | 'secure' | 'complete';

// Hook template definition
export interface HookTemplate {
  id: HookTemplateType;
  name: string;
  description: string;
  hooks: HooksConfig;
  skills: string[]; // Skill names to install
  settings: Partial<DashboardHookSettings>;
}
