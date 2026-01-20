// ==================== Native Subagent Types ====================
// These types track Claude's native Task tool subagents

export type SubagentStatus = 'running' | 'completed' | 'error';

// Native subagent spawned by Claude's Task tool
export interface SubagentInstance {
  id: string; // tool_use_id from Claude
  parentInstanceId: string; // ClaudeInstance that spawned it
  description: string; // from Task input.description
  prompt: string; // from Task input.prompt
  subagentType: string; // from Task input.subagent_type (e.g., "Explore", "Plan", "Bash")
  status: SubagentStatus;
  startedAt: number;
  completedAt?: number;
  result?: string; // from tool_result content
  error?: string;
}

// Events for subagent tracking
export interface SubagentStartedEvent {
  id: string;
  description: string;
  prompt: string;
  subagentType: string;
}

export interface SubagentCompletedEvent {
  id: string;
  result: string;
  isError: boolean;
}

// Subagent IPC channel types
export interface SubagentIpcChannels {
  'subagent:getByInstance': (instanceId: string) => SubagentInstance[];
  'subagent:getAll': () => SubagentInstance[];
}

// Subagent events
export interface SubagentEvents {
  'subagent:started': (instanceId: string, subagent: SubagentInstance) => void;
  'subagent:completed': (instanceId: string, subagent: SubagentInstance) => void;
}
