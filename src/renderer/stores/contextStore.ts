import { create } from 'zustand';
import type {
  SharedInstanceContext,
  ProjectSharedKnowledge,
  ProjectContextSummary,
} from '@shared/types/sharedContext';

interface ContextState {
  // State
  contextsByProject: Record<string, SharedInstanceContext[]>;
  knowledgeByProject: Record<string, ProjectSharedKnowledge>;
  isLoading: boolean;
  error: string | null;
  selectedProjectId: string | null;

  // Context operations
  loadContextForProject: (projectId: string) => Promise<void>;
  loadKnowledgeForProject: (projectId: string) => Promise<void>;
  refreshContext: (projectId: string) => Promise<void>;
  handleInstanceContextUpdate: (projectId: string, context: SharedInstanceContext) => void;
  handleKnowledgeUpdate: (projectId: string, knowledge: ProjectSharedKnowledge) => void;
  clearProjectContext: (projectId: string) => void;
  setSelectedProject: (projectId: string | null) => void;

  // Selectors
  getContextsForProject: (projectId: string) => SharedInstanceContext[];
  getKnowledgeForProject: (projectId: string) => ProjectSharedKnowledge | null;
  getActiveInstanceCount: (projectId: string) => number;
  getTotalContexts: () => number;
}

export const useContextStore = create<ContextState>((set, get) => ({
  // Initial state
  contextsByProject: {},
  knowledgeByProject: {},
  isLoading: false,
  error: null,
  selectedProjectId: null,

  // Load context for a specific project
  loadContextForProject: async (projectId: string) => {
    if (!window.electronAPI?.context) {
      return;
    }
    try {
      const contexts = await window.electronAPI.context.getInstances(projectId);
      set((state) => ({
        contextsByProject: {
          ...state.contextsByProject,
          [projectId]: contexts,
        },
      }));
    } catch (error) {
      console.error('Failed to load context for project:', projectId, error);
    }
  },

  // Load knowledge for a specific project
  loadKnowledgeForProject: async (projectId: string) => {
    if (!window.electronAPI?.context) {
      return;
    }
    try {
      const knowledge = await window.electronAPI.context.getProjectKnowledge(projectId);
      if (knowledge) {
        set((state) => ({
          knowledgeByProject: {
            ...state.knowledgeByProject,
            [projectId]: knowledge,
          },
        }));
      }
    } catch (error) {
      console.error('Failed to load knowledge for project:', projectId, error);
    }
  },

  // Refresh all context for a project
  refreshContext: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { loadContextForProject, loadKnowledgeForProject } = get();
      await Promise.all([loadContextForProject(projectId), loadKnowledgeForProject(projectId)]);
      set({ isLoading: false });
    } catch (error) {
      console.error('Failed to refresh context:', error);
      set({ error: 'Failed to refresh context', isLoading: false });
    }
  },

  // Handle instance context update event
  handleInstanceContextUpdate: (projectId: string, context: SharedInstanceContext) => {
    set((state) => {
      const existing = state.contextsByProject[projectId] || [];
      const index = existing.findIndex((c) => c.instanceId === context.instanceId);

      if (index === -1) {
        // New context, add it
        return {
          contextsByProject: {
            ...state.contextsByProject,
            [projectId]: [...existing, context],
          },
        };
      }

      // Update existing context
      return {
        contextsByProject: {
          ...state.contextsByProject,
          [projectId]: existing.map((c) => (c.instanceId === context.instanceId ? context : c)),
        },
      };
    });
  },

  // Handle knowledge update event
  handleKnowledgeUpdate: (projectId: string, knowledge: ProjectSharedKnowledge) => {
    set((state) => ({
      knowledgeByProject: {
        ...state.knowledgeByProject,
        [projectId]: knowledge,
      },
    }));
  },

  // Clear context for a project
  clearProjectContext: (projectId: string) => {
    set((state) => {
      const { [projectId]: _contexts, ...restContexts } = state.contextsByProject;
      const { [projectId]: _knowledge, ...restKnowledge } = state.knowledgeByProject;
      return {
        contextsByProject: restContexts,
        knowledgeByProject: restKnowledge,
      };
    });
  },

  // Set selected project for context panel
  setSelectedProject: (projectId: string | null) => {
    set({ selectedProjectId: projectId });
    if (projectId) {
      get().refreshContext(projectId);
    }
  },

  // Get contexts for a specific project
  getContextsForProject: (projectId: string) => {
    return get().contextsByProject[projectId] || [];
  },

  // Get knowledge for a specific project
  getKnowledgeForProject: (projectId: string) => {
    return get().knowledgeByProject[projectId] || null;
  },

  // Get active instance count for a project
  getActiveInstanceCount: (projectId: string) => {
    return (get().contextsByProject[projectId] || []).length;
  },

  // Get total contexts across all projects
  getTotalContexts: () => {
    const { contextsByProject } = get();
    return Object.values(contextsByProject).reduce((sum, contexts) => sum + contexts.length, 0);
  },
}));

// Setup event listeners for context events
export function setupContextEventListeners(): () => void {
  const store = useContextStore.getState();

  // Check if electronAPI and context are available
  if (!window.electronAPI?.context) {
    return () => {};
  }

  // Context event listeners
  const unsubInstanceUpdated = window.electronAPI.context.onInstanceUpdated?.(
    (projectId: string, context: SharedInstanceContext) => {
      store.handleInstanceContextUpdate(projectId, context);
    }
  );

  const unsubKnowledgeUpdated = window.electronAPI.context.onKnowledgeUpdated?.(
    (projectId: string, knowledge: ProjectSharedKnowledge) => {
      store.handleKnowledgeUpdate(projectId, knowledge);
    }
  );

  // Return cleanup function
  return () => {
    unsubInstanceUpdated?.();
    unsubKnowledgeUpdated?.();
  };
}
