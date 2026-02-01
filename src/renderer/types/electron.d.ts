// Type declarations for the Electron API exposed via preload
// This is imported automatically by TypeScript

import type {
  Project,
  ClaudeInstance,
  ClaudeModel,
  InstanceMode,
  ClaudeSettings,
  McpServer,
  InstanceStatus,
  StreamMessage,
  SharedInstanceContext,
  ProjectSharedKnowledge,
  ProjectContextSummary,
  ContextUpdateEvent,
  RalphTask,
  CreateRalphTaskInput,
  UpdateRalphTaskInput,
  MoveRalphTaskInput,
  ReorderRalphTasksInput,
  RalphTaskHelpRequest,
} from '@shared/types';
import type {
  JiraGlobalConfig,
  JiraBoard,
  JiraStatus,
  JiraIssue,
  JiraUser,
} from '@shared/types/jira';

declare global {
  interface Window {
    electronAPI: {
      project: {
        create: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
        update: (project: Project) => Promise<Project>;
        delete: (id: string) => Promise<void>;
        getAll: () => Promise<Project[]>;
        getById: (id: string) => Promise<Project | null>;
      };
      instance: {
        create: (config: {
          projectId: string;
          model: ClaudeModel;
          mode: InstanceMode;
          prompt?: string;
          planMode?: boolean;
          verbose?: boolean;
          skipPermissions?: boolean;
          usePermissionPromptTool?: boolean;
        }) => Promise<ClaudeInstance>;
        // Create a pending instance (no Claude process yet) for structured view deferred flow
        createPending: (config: {
          projectId: string;
          model: ClaudeModel;
          mode: InstanceMode;
          planMode?: boolean;
          verbose?: boolean;
          skipPermissions?: boolean;
          usePermissionPromptTool?: boolean;
        }) => Promise<ClaudeInstance & { conversationId?: string }>;
        // Activate a pending instance with the first user message
        activate: (id: string, prompt: string) => Promise<ClaudeInstance>;
        kill: (id: string, force?: boolean) => Promise<void>;
        sendInput: (id: string, input: string) => Promise<void>;
        getAll: () => Promise<ClaudeInstance[]>;
        getByProject: (projectId: string) => Promise<ClaudeInstance[]>;
        resize: (id: string, cols: number, rows: number) => void;
        forceRepaint: (id: string, method: 'fake-resize' | 'ansi-clear') => Promise<boolean>;
        onOutput: (callback: (instanceId: string, data: StreamMessage) => void) => () => void;
        onStatus: (callback: (instanceId: string, status: InstanceStatus) => void) => () => void;
        onError: (callback: (instanceId: string, error: string) => void) => () => void;
        onExit: (callback: (instanceId: string, code: number) => void) => () => void;
        onRawOutput: (callback: (instanceId: string, data: string) => void) => () => void;
        onSessionId: (callback: (instanceId: string, sessionId: string) => void) => () => void;
        onTerminalTitle: (callback: (instanceId: string, title: string) => void) => () => void;
        onDimensionSync: (
          callback: (instanceId: string, cols: number, rows: number) => void
        ) => () => void;
        onSync: (callback: (instances: ClaudeInstance[]) => void) => () => void;
        setTitle: (id: string, title: string) => Promise<void>;
        resume: (config: {
          projectId: string;
          sessionId: string;
          model: ClaudeModel;
          mode: InstanceMode;
          prompt?: string; // Optional prompt to send when resuming
        }) => Promise<ClaudeInstance>;
      };
      config: {
        getClaudeSettings: () => Promise<ClaudeSettings | null>;
        getMcpServers: () => Promise<McpServer[]>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      dialog: {
        selectDirectory: () => Promise<string | null>;
      };
      hook?: {
        onActivity?: (
          callback: (
            event: Electron.IpcRendererEvent,
            data: { instanceId: string; toolName?: string; files?: string[]; timestamp: number }
          ) => void
        ) => () => void;
      };
      context: {
        getInstances: (projectId: string) => Promise<SharedInstanceContext[]>;
        getInstance: (instanceId: string) => Promise<SharedInstanceContext | null>;
        getProjectKnowledge: (projectId: string) => Promise<ProjectSharedKnowledge | null>;
        getSummary: (projectId: string) => Promise<ProjectContextSummary>;
        getStats: () => Promise<{
          activeInstances: number;
          projectsWithKnowledge: number;
          totalConventions: number;
          totalImportantFiles: number;
          totalWarnings: number;
        }>;
        onUpdated: (callback: (event: ContextUpdateEvent) => void) => () => void;
        onInstanceUpdated: (
          callback: (projectId: string, context: SharedInstanceContext) => void
        ) => () => void;
        onKnowledgeUpdated: (
          callback: (projectId: string, knowledge: ProjectSharedKnowledge) => void
        ) => () => void;
      };
      ralphTask: {
        create: (input: CreateRalphTaskInput) => Promise<RalphTask>;
        update: (id: string, updates: UpdateRalphTaskInput) => Promise<RalphTask | null>;
        delete: (id: string) => Promise<boolean>;
        getByProject: (projectId: string) => Promise<RalphTask[]>;
        getById: (id: string) => Promise<RalphTask | null>;
        move: (input: MoveRalphTaskInput) => Promise<RalphTask | null>;
        reorder: (input: ReorderRalphTasksInput) => Promise<RalphTask[]>;
        start: (taskId: string, isInteractive?: boolean) => Promise<RalphTask | null>;
        stop: (taskId: string) => Promise<RalphTask | null>;
        respondToHelp: (taskId: string, response: string) => Promise<RalphTask | null>;
        processAll: (projectId: string) => Promise<boolean>;
        stopAll: (projectId: string) => Promise<boolean>;
        onCreated: (callback: (task: RalphTask) => void) => () => void;
        onUpdated: (callback: (task: RalphTask) => void) => () => void;
        onDeleted: (callback: (taskId: string) => void) => () => void;
        onHelpRequested: (callback: (request: RalphTaskHelpRequest) => void) => () => void;
        onLoopStarted: (callback: (taskId: string, loopCount: number) => void) => () => void;
        onLoopCompleted: (callback: (taskId: string) => void) => () => void;
        onProcessAllStarted: (callback: (projectId: string) => void) => () => void;
        onProcessAllCompleted: (callback: (projectId: string) => void) => () => void;
        onProcessAllStopped: (callback: (projectId: string) => void) => () => void;
      };
      jira: {
        getGlobalConfig: () => Promise<JiraGlobalConfig>;
        updateGlobalConfig: (config: Partial<JiraGlobalConfig>) => Promise<JiraGlobalConfig>;
        validateCredentials: () => Promise<{
          valid: boolean;
          user?: JiraUser;
          error?: string;
        }>;
        getBoards: () => Promise<{ success: boolean; boards?: JiraBoard[]; error?: string }>;
        getStatuses: (
          projectKey: string
        ) => Promise<{ success: boolean; statuses?: JiraStatus[]; error?: string }>;
        searchIssues: (
          projectKey: string,
          filter?: 'mine' | 'all',
          statusFilter?: 'all' | 'todo' | 'in_progress' | 'done'
        ) => Promise<{ success: boolean; issues?: JiraIssue[]; error?: string }>;
        importIssues: (
          projectId: string,
          issues: JiraIssue[]
        ) => Promise<{ success: boolean; imported?: string[]; errors?: string[]; error?: string }>;
        transitionIssue: (
          issueKey: string,
          targetStatusId: string
        ) => Promise<{ success: boolean; error?: string }>;
        assignIssue: (
          issueKey: string,
          accountId: string
        ) => Promise<{ success: boolean; error?: string }>;
        getCurrentUser: () => Promise<{ success: boolean; user?: JiraUser; error?: string }>;
        getImportedKeys: (
          projectId: string
        ) => Promise<{ success: boolean; keys?: string[]; error?: string }>;
      };
    };
  }
}

export {};
