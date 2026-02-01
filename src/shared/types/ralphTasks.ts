// Ralph Task types for Trello-style task board with automated loop execution

export type RalphTaskStatus = 'todo' | 'doing' | 'done';

export interface RalphTask {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: RalphTaskStatus;
  orderIndex: number;
  instanceId?: string; // Current Claude instance working on this task
  loopCount: number; // Number of loop iterations
  isPaused: boolean;
  pauseReason?: string; // Reason for pause (e.g., help request)
  completionSummary?: string; // Summary when task is completed
  contextFilePath?: string; // Path to .claude/{id}.md context file
  isInteractive: boolean; // If true, shows terminal UI; if false, runs in background
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  // Jira integration fields
  jiraIssueId?: string; // Jira issue ID
  jiraIssueKey?: string; // Jira issue key (e.g., "PROJ-123")
  jiraLastSyncAt?: number; // Timestamp of last sync with Jira
}

export interface CreateRalphTaskInput {
  projectId: string;
  name: string;
  description?: string;
  status?: RalphTaskStatus;
  // Jira fields for imported tasks
  jiraIssueId?: string;
  jiraIssueKey?: string;
}

export interface UpdateRalphTaskInput {
  name?: string;
  description?: string;
  status?: RalphTaskStatus;
  orderIndex?: number;
  instanceId?: string | null;
  loopCount?: number;
  isPaused?: boolean;
  pauseReason?: string | null;
  completionSummary?: string | null;
  isInteractive?: boolean;
  startedAt?: number | null;
  completedAt?: number | null;
  // Jira fields
  jiraIssueId?: string | null;
  jiraIssueKey?: string | null;
  jiraLastSyncAt?: number | null;
}

export interface MoveRalphTaskInput {
  id: string;
  newStatus: RalphTaskStatus;
  newOrderIndex?: number;
}

export interface ReorderRalphTasksInput {
  projectId: string;
  tasks: Array<{
    id: string;
    status: RalphTaskStatus;
    orderIndex: number;
  }>;
}

export interface RalphTaskHelpRequest {
  taskId: string;
  reason: string;
  timestamp: number;
}

export interface RalphTaskCompleteRequest {
  taskId: string;
  summary: string;
}

// Events emitted from main to renderer
export interface RalphTaskEvents {
  'ralphTask:created': (task: RalphTask) => void;
  'ralphTask:updated': (task: RalphTask) => void;
  'ralphTask:deleted': (taskId: string) => void;
  'ralphTask:helpRequested': (request: RalphTaskHelpRequest) => void;
  'ralphTask:loopStarted': (taskId: string, loopCount: number) => void;
  'ralphTask:loopCompleted': (taskId: string) => void;
}
