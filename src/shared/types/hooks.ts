// Hook event types supported by Claude CLI
export type HookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStop'
  | 'Notification'
  | 'SessionStart'
  | 'SessionEnd';

// Hook command configuration
export interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number; // Timeout in milliseconds
}

// Hook matcher for filtering when hooks run
export interface HookMatcher {
  tool_name?: string; // Match specific tool names
  project_path?: string; // Match project path pattern
}

// Single hook definition
export interface HookDefinition {
  hooks: HookCommand[];
  matcher?: HookMatcher;
}

// Complete hooks configuration (matches .claude/settings.json structure)
export interface HooksConfig {
  hooks: {
    [K in HookEventType]?: HookDefinition[];
  };
}

// Hook execution input (what Claude sends to hook stdin)
export interface HookInput {
  session_id: string;
  instance_id?: string; // Dashboard-specific extension
  project_path?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  notification_type?: string;
  message?: string;
  timestamp?: number;
}

// Hook output for permission decisions
export interface HookPermissionOutput {
  hookSpecificOutput?: {
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  };
}

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
