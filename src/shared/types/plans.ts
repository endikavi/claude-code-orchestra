// ==================== Claude Code Plans Types ====================
// These types track Claude's plan files in ~/.claude/plans/

// Tracked plan from filesystem watching
export interface TrackedPlan {
  name: string; // Filename without .md extension
  filePath: string; // Full path to the .md file
  content?: string; // Loaded on demand (lazy)
  sizeBytes: number; // File size for display
  parentInstanceId?: string; // Instance that created it (if detectable)
  createdAt: number;
  updatedAt: number;
}

// Events for plan lifecycle
export interface PlanCreatedEvent {
  plan: TrackedPlan;
}

export interface PlanUpdatedEvent {
  plan: TrackedPlan;
}

export interface PlanDeletedEvent {
  planName: string;
}

// IPC channel types for plans
export interface PlanIpcChannels {
  'plan:getAll': () => TrackedPlan[];
  'plan:getByName': (name: string) => TrackedPlan | null;
}

// Plan events (main -> renderer)
export interface PlanEvents {
  'plan:created': (plan: TrackedPlan) => void;
  'plan:updated': (plan: TrackedPlan) => void;
  'plan:deleted': (planName: string) => void;
}
