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
} from '@shared/types';

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
          planMode?: boolean;
        }) => Promise<ClaudeInstance>;
        kill: (id: string) => Promise<void>;
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
    };
  }
}

export {};
