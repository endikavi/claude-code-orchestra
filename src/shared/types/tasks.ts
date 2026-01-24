// ==================== Claude Code Tasks Types ====================
// These types track Claude's native TaskCreate/TaskUpdate/TaskList tools (v2.1.16+)

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

// Task tracked from Claude's TaskCreate/TaskUpdate tools
export interface TrackedTask {
  id: string;
  parentInstanceId: string; // ClaudeInstance that created it
  subject: string; // Brief title for the task
  description: string; // Detailed description
  activeForm?: string; // Present continuous form shown when in_progress
  status: TaskStatus;
  owner?: string; // Agent name if assigned
  blocks?: string[]; // IDs of tasks that this task blocks
  blockedBy?: string[]; // IDs of tasks that block this task
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// Event when TaskCreate tool is used
export interface TaskStartedEvent {
  id: string; // tool_use_id
  subject: string;
  description: string;
  activeForm?: string;
}

// Event when TaskUpdate tool is used
export interface TaskUpdatedEvent {
  id: string; // taskId from tool input
  status?: TaskStatus;
  subject?: string;
  description?: string;
  activeForm?: string;
  owner?: string;
  addBlocks?: string[];
  addBlockedBy?: string[];
  metadata?: Record<string, unknown>;
}

// Event when TaskList tool returns results
export interface TaskListEvent {
  tasks: TaskListItem[];
}

// Summary item from TaskList result
export interface TaskListItem {
  id: string;
  subject: string;
  status: TaskStatus;
  owner?: string;
  blockedBy?: string[];
}

// IPC channel types for tasks
export interface TaskIpcChannels {
  'task:getByInstance': (instanceId: string) => TrackedTask[];
  'task:getAll': () => TrackedTask[];
}

// Task events (main -> renderer)
export interface TaskEvents {
  'task:created': (instanceId: string, task: TrackedTask) => void;
  'task:updated': (instanceId: string, task: TrackedTask) => void;
  'task:list': (instanceId: string, tasks: TrackedTask[]) => void;
}
