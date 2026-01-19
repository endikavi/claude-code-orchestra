import { create } from 'zustand';
import type { GitStatus } from '@shared/types';

// Check if running in Electron (has full API)
const isElectron =
  typeof window !== 'undefined' && window.electronAPI && 'git' in window.electronAPI;

interface GitState {
  // Map of projectId -> GitStatus
  statuses: Map<string, GitStatus>;
  isLoading: Map<string, boolean>;

  // Actions
  updateStatus: (projectId: string, status: GitStatus) => void;
  fetchStatus: (projectId: string) => Promise<void>;
  refreshStatus: (projectId: string) => Promise<void>;
  setupListeners: () => () => void;

  // Selectors
  getStatus: (projectId: string) => GitStatus | null;
}

export const useGitStore = create<GitState>((set, get) => ({
  statuses: new Map(),
  isLoading: new Map(),

  updateStatus: (projectId, status) => {
    set((state) => {
      const newStatuses = new Map(state.statuses);
      newStatuses.set(projectId, status);
      return { statuses: newStatuses };
    });
  },

  fetchStatus: async (projectId) => {
    if (!isElectron) return;

    set((state) => {
      const newLoading = new Map(state.isLoading);
      newLoading.set(projectId, true);
      return { isLoading: newLoading };
    });

    try {
      const status = await window.electronAPI.git.getStatus(projectId);
      if (status) {
        set((state) => {
          const newStatuses = new Map(state.statuses);
          newStatuses.set(projectId, status);
          return { statuses: newStatuses };
        });
      }
    } catch (error) {
      console.error('[GitStore] Failed to fetch status:', error);
    } finally {
      set((state) => {
        const newLoading = new Map(state.isLoading);
        newLoading.set(projectId, false);
        return { isLoading: newLoading };
      });
    }
  },

  refreshStatus: async (projectId) => {
    if (!isElectron) return;

    set((state) => {
      const newLoading = new Map(state.isLoading);
      newLoading.set(projectId, true);
      return { isLoading: newLoading };
    });

    try {
      const status = await window.electronAPI.git.refresh(projectId);
      if (status) {
        set((state) => {
          const newStatuses = new Map(state.statuses);
          newStatuses.set(projectId, status);
          return { statuses: newStatuses };
        });
      }
    } catch (error) {
      console.error('[GitStore] Failed to refresh status:', error);
    } finally {
      set((state) => {
        const newLoading = new Map(state.isLoading);
        newLoading.set(projectId, false);
        return { isLoading: newLoading };
      });
    }
  },

  setupListeners: () => {
    if (!isElectron) {
      return () => {};
    }

    const { updateStatus } = get();

    // Listen for git status changes from main process
    const unsubscribe = window.electronAPI.git.onStatusChanged(
      (projectId: string, status: GitStatus) => {
        updateStatus(projectId, status);
      }
    );

    return unsubscribe;
  },

  getStatus: (projectId) => {
    return get().statuses.get(projectId) || null;
  },
}));
