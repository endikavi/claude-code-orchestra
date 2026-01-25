/**
 * Types for Claude Code history files
 * These are the messages stored in ~/.claude/projects/<SANITIZED_PATH>/<session>.jsonl
 */

// Base message type in history files
export interface HistoryMessage {
  type: 'user' | 'assistant' | 'system' | 'result' | 'progress' | 'queue-operation';
  uuid?: string;
  timestamp?: string;
  session_id?: string;
  cwd?: string;
  message?: HistoryAssistantMessage;
  data?: HistoryProgressData;
}

// Assistant message structure in history
export interface HistoryAssistantMessage {
  id?: string;
  role?: 'assistant' | 'user';
  content?: HistoryContentBlock[] | string;
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// Content blocks in history messages
export type HistoryContentBlock =
  | HistoryTextBlock
  | HistoryToolUseBlock
  | HistoryToolResultBlock
  | HistoryThinkingBlock;

export interface HistoryTextBlock {
  type: 'text';
  text: string;
}

export interface HistoryToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input?: HistoryToolInput;
}

export interface HistoryToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export interface HistoryThinkingBlock {
  type: 'thinking';
  thinking: string;
}

// Tool input for Task tool (subagent spawning)
export interface HistoryToolInput {
  description?: string;
  prompt?: string;
  subagent_type?: string;
  // TaskCreate/TaskUpdate inputs
  subject?: string;
  taskId?: string;
  status?: string;
  activeForm?: string;
  owner?: string;
  addBlocks?: string[];
  addBlockedBy?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// Progress data for agent_progress messages
export interface HistoryProgressData {
  type?: 'agent_progress';
  agentId?: string;
  prompt?: string;
  status?: 'starting' | 'running' | 'completed' | 'error';
  result?: string;
  [key: string]: unknown;
}

// Detected events from history parsing
export interface HistorySubagentEvent {
  id: string;
  description: string;
  prompt: string;
  subagentType: string;
  timestamp?: string;
}

export interface HistorySubagentCompletionEvent {
  id: string;
  result: string;
  isError: boolean;
  timestamp?: string;
}

export interface HistoryTaskEvent {
  id: string;
  subject: string;
  description?: string;
  activeForm?: string;
  timestamp?: string;
}

export interface HistoryTaskUpdateEvent {
  id: string;
  status?: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  owner?: string;
  timestamp?: string;
}

// Watcher events emitted by HistoryWatcher
export interface HistoryWatcherEvents {
  subagent_started: HistorySubagentEvent;
  subagent_completed: HistorySubagentCompletionEvent;
  task_created: HistoryTaskEvent;
  task_updated: HistoryTaskUpdateEvent;
  error: Error;
  ready: void;
  close: void;
}
