import { create } from 'zustand';
import type { SubagentInstance } from '@shared/types';

interface OrchestrationState {
  // State
  subagentsByInstance: Record<string, SubagentInstance[]>;
  isLoading: boolean;
  error: string | null;

  // Subagent operations
  loadSubagents: (instanceId: string) => Promise<void>;
  loadAllSubagents: () => Promise<void>;
  handleSubagentStarted: (instanceId: string, subagent: SubagentInstance) => void;
  handleSubagentCompleted: (instanceId: string, subagent: SubagentInstance) => void;
  clearInstanceSubagents: (instanceId: string) => void;

  // Selectors
  getSubagentsForInstance: (instanceId: string) => SubagentInstance[];
  getInstancesWithSubagents: () => string[];
  getRunningSubagentCount: (instanceId: string) => number;
  getCompletedSubagentCount: (instanceId: string) => number;
  getTotalRunningSubagents: () => number;
  getTotalCompletedSubagents: () => number;
}

export const useOrchestrationStore = create<OrchestrationState>((set, get) => ({
  // Initial state
  subagentsByInstance: {},
  isLoading: false,
  error: null,

  // Load subagents for a specific instance
  loadSubagents: async (instanceId: string) => {
    try {
      const subagents = await window.electronAPI.subagent.getByInstance(instanceId);
      set((state) => ({
        subagentsByInstance: {
          ...state.subagentsByInstance,
          [instanceId]: subagents,
        },
      }));
    } catch (error) {
      console.error('Failed to load subagents for instance:', instanceId, error);
    }
  },

  // Load all subagents from all instances
  loadAllSubagents: async () => {
    set({ isLoading: true, error: null });
    try {
      const allSubagents = await window.electronAPI.subagent.getAll();
      // Group by instanceId
      const grouped: Record<string, SubagentInstance[]> = {};
      for (const subagent of allSubagents) {
        if (!grouped[subagent.parentInstanceId]) {
          grouped[subagent.parentInstanceId] = [];
        }
        grouped[subagent.parentInstanceId].push(subagent);
      }
      set({ subagentsByInstance: grouped, isLoading: false });
    } catch (error) {
      console.error('Failed to load all subagents:', error);
      set({ error: 'Failed to load subagents', isLoading: false });
    }
  },

  // Handle subagent started event
  handleSubagentStarted: (instanceId: string, subagent: SubagentInstance) => {
    set((state) => {
      const existing = state.subagentsByInstance[instanceId] || [];
      // Avoid duplicates
      if (existing.some((s) => s.id === subagent.id)) {
        return state;
      }
      return {
        subagentsByInstance: {
          ...state.subagentsByInstance,
          [instanceId]: [...existing, subagent],
        },
      };
    });
  },

  // Handle subagent completed event
  handleSubagentCompleted: (instanceId: string, subagent: SubagentInstance) => {
    set((state) => {
      const existing = state.subagentsByInstance[instanceId] || [];
      return {
        subagentsByInstance: {
          ...state.subagentsByInstance,
          [instanceId]: existing.map((s) => (s.id === subagent.id ? subagent : s)),
        },
      };
    });
  },

  // Clear subagents for an instance (when instance is killed/removed)
  clearInstanceSubagents: (instanceId: string) => {
    set((state) => {
      const { [instanceId]: _, ...rest } = state.subagentsByInstance;
      return { subagentsByInstance: rest };
    });
  },

  // Get subagents for a specific instance
  getSubagentsForInstance: (instanceId: string) => {
    return get().subagentsByInstance[instanceId] || [];
  },

  // Get all instance IDs that have subagents
  getInstancesWithSubagents: () => {
    const { subagentsByInstance } = get();
    return Object.keys(subagentsByInstance).filter((id) => subagentsByInstance[id].length > 0);
  },

  // Get running subagent count for an instance
  getRunningSubagentCount: (instanceId: string) => {
    const subagents = get().subagentsByInstance[instanceId] || [];
    return subagents.filter((s) => s.status === 'running').length;
  },

  // Get completed subagent count for an instance
  getCompletedSubagentCount: (instanceId: string) => {
    const subagents = get().subagentsByInstance[instanceId] || [];
    return subagents.filter((s) => s.status === 'completed').length;
  },

  // Get total running subagents across all instances
  getTotalRunningSubagents: () => {
    const { subagentsByInstance } = get();
    return Object.values(subagentsByInstance).reduce(
      (sum, subagents) => sum + subagents.filter((s) => s.status === 'running').length,
      0
    );
  },

  // Get total completed subagents across all instances
  getTotalCompletedSubagents: () => {
    const { subagentsByInstance } = get();
    return Object.values(subagentsByInstance).reduce(
      (sum, subagents) => sum + subagents.filter((s) => s.status === 'completed').length,
      0
    );
  },
}));

// Setup event listeners for subagent events
export function setupOrchestrationEventListeners(): () => void {
  const store = useOrchestrationStore.getState();

  console.log('[OrchestrationStore] Setting up event listeners');

  // Native subagent event listeners
  const unsubSubagentStarted = window.electronAPI.subagent.onStarted((instanceId, subagent) => {
    console.log(
      `[OrchestrationStore] Received subagent:started for instance ${instanceId}`,
      subagent
    );
    store.handleSubagentStarted(instanceId, subagent);
  });

  const unsubSubagentCompleted = window.electronAPI.subagent.onCompleted((instanceId, subagent) => {
    console.log(
      `[OrchestrationStore] Received subagent:completed for instance ${instanceId}`,
      subagent
    );
    store.handleSubagentCompleted(instanceId, subagent);
  });

  // Load initial data
  console.log('[OrchestrationStore] Loading initial subagent data');
  void store.loadAllSubagents();

  // Return cleanup function
  return () => {
    console.log('[OrchestrationStore] Cleaning up event listeners');
    unsubSubagentStarted();
    unsubSubagentCompleted();
  };
}
