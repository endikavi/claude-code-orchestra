/**
 * Shared Context Types
 *
 * Types for sharing context between Claude instances within the same project.
 * Enables agents and subagents to know what others are working on and what
 * relevant project information each one has discovered.
 */

/**
 * Status indicating what an instance is currently doing
 */
export type InstanceWorkStatus =
  | 'idle' // Not actively working
  | 'exploring' // Reading/searching code
  | 'implementing' // Writing/editing code
  | 'testing' // Running tests
  | 'reviewing' // Reviewing code/PR
  | 'planning' // In plan mode
  | 'waiting'; // Waiting for user input or permission

/**
 * A file that an instance has identified as important
 */
export interface ImportantFile {
  path: string;
  description: string;
  discoveredBy: string; // instanceId
  discoveredAt: number;
}

/**
 * A convention or pattern discovered in the project
 */
export interface ProjectConvention {
  type: 'naming' | 'architecture' | 'testing' | 'style' | 'other';
  description: string;
  examples?: string[];
  discoveredBy: string; // instanceId
  discoveredAt: number;
}

/**
 * A warning or thing to avoid in the project
 */
export interface ProjectWarning {
  severity: 'info' | 'warning' | 'critical';
  description: string;
  relatedFiles?: string[];
  discoveredBy: string; // instanceId
  discoveredAt: number;
}

/**
 * Summary of a task from TaskTracker
 */
export interface TaskSummary {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * Context that each instance shares about its current work
 * Stored in memory, cleared when instance terminates
 */
export interface SharedInstanceContext {
  instanceId: string;
  projectId: string;
  updatedAt: number;

  // What the instance is doing
  workStatus: InstanceWorkStatus;
  currentTask?: string; // Brief description of current task
  currentFiles: string[]; // Files currently being worked on

  // What the instance knows
  discoveredPatterns: string[]; // Patterns/insights discovered
  notesForOthers: string[]; // Notes/observations to share

  // Task tracking
  todoItems: TaskSummary[];

  // Model and mode info
  model?: string;
  isSubagent?: boolean;
  parentInstanceId?: string;
}

/**
 * Accumulated knowledge about the project
 * Persisted in SQLite, survives instance termination
 */
export interface ProjectSharedKnowledge {
  projectId: string;
  updatedAt: number;

  // High-level project understanding
  architectureSummary?: string; // Overview of project architecture
  techStack?: string[]; // Technologies/frameworks used

  // Detailed discoveries
  conventions: ProjectConvention[];
  importantFiles: ImportantFile[];
  warnings: ProjectWarning[];

  // Entry points and key areas
  entryPoints?: string[]; // Main entry files
  keyDirectories?: Record<string, string>; // dir -> description
}

/**
 * Combined context summary for a project
 */
export interface ProjectContextSummary {
  projectId: string;
  generatedAt: number;

  // Active instances
  instances: SharedInstanceContext[];

  // Project knowledge
  knowledge: ProjectSharedKnowledge | null;

  // Human-readable overview
  overview: string;
}

/**
 * Request to publish instance context
 */
export interface PublishContextRequest {
  workStatus?: InstanceWorkStatus;
  currentTask?: string;
  currentFiles?: string[];
  discoveredPatterns?: string[];
  notesForOthers?: string[];
  todoItems?: TaskSummary[];
}

/**
 * Request to contribute project knowledge
 */
export interface ContributeKnowledgeRequest {
  architectureSummary?: string;
  techStack?: string[];
  convention?: Omit<ProjectConvention, 'discoveredBy' | 'discoveredAt'>;
  importantFile?: Omit<ImportantFile, 'discoveredBy' | 'discoveredAt'>;
  warning?: Omit<ProjectWarning, 'discoveredBy' | 'discoveredAt'>;
  entryPoints?: string[];
  keyDirectories?: Record<string, string>;
}

/**
 * Event emitted when instance context changes
 */
export interface ContextUpdateEvent {
  type: 'instance' | 'project';
  projectId: string;
  instanceId?: string;
  timestamp: number;
}

/**
 * Configuration for shared context feature
 */
export interface SharedContextSettings {
  enabled: boolean; // Master switch for the feature
  autoPublish: boolean; // Auto-publish context from parser
  injectOnStart: boolean; // Inject context summary in initial prompt
  showPanel: boolean; // Show context panel in UI
  retentionDays: number; // Days to retain project knowledge
}

/**
 * Default settings for shared context
 */
export const DEFAULT_SHARED_CONTEXT_SETTINGS: SharedContextSettings = {
  enabled: true,
  autoPublish: true,
  injectOnStart: true,
  showPanel: true,
  retentionDays: 30,
};
