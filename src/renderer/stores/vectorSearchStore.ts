import { create } from 'zustand';
import type {
  IndexProgress,
  IndexStats,
  ModelState,
  ModelDownloadProgress,
  ProjectIndexStatus,
  SearchResponse,
  SearchOptions,
} from '@shared/types/vectorSearch';
import { VECTOR_MODELS } from '@shared/types/vectorSearch';

// Check if running in Electron (has full API)
const isElectron =
  typeof window !== 'undefined' && window.electronAPI && 'vectorSearch' in window.electronAPI;

interface VectorSearchState {
  // Model states
  modelStates: Record<string, ModelState>;
  modelDownloadProgress: Record<string, ModelDownloadProgress>;

  // Project index states (keyed by projectId)
  indexStatuses: Map<string, ProjectIndexStatus>;
  indexProgress: Map<string, IndexProgress>;

  // Actions - Models
  fetchModelStatus: () => Promise<void>;
  downloadModel: (modelId: string) => Promise<{ success: boolean; error?: string }>;
  cancelDownload: (modelId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;

  // Actions - Indexing
  fetchIndexStatus: (projectId: string) => Promise<ProjectIndexStatus | null>;
  startIndexing: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  cancelIndexing: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  clearIndex: (projectId: string) => Promise<{ success: boolean; error?: string }>;

  // Actions - Search
  search: (
    projectId: string,
    options: SearchOptions
  ) => Promise<{ success: boolean; response?: SearchResponse; error?: string }>;

  // Actions - Event listeners
  setupListeners: () => () => void;

  // Selectors
  getModelState: (modelId: string) => ModelState | null;
  getIndexStatus: (projectId: string) => ProjectIndexStatus | null;
  getIndexProgress: (projectId: string) => IndexProgress | null;
  isSearchReady: (projectId: string) => boolean;
  areModelsReady: () => boolean;
}

export const useVectorSearchStore = create<VectorSearchState>((set, get) => ({
  modelStates: {},
  modelDownloadProgress: {},
  indexStatuses: new Map(),
  indexProgress: new Map(),

  // Model actions
  fetchModelStatus: async () => {
    if (!isElectron) return;

    try {
      const states = await window.electronAPI.vectorSearch.getModelStatus();
      set({ modelStates: states });
    } catch (error) {
      console.error('[VectorSearchStore] Failed to fetch model status:', error);
    }
  },

  downloadModel: async (modelId: string) => {
    if (!isElectron) return { success: false, error: 'Not in Electron' };

    try {
      const result = await window.electronAPI.vectorSearch.downloadModel(modelId);
      // Refresh model status after download
      if (result.success) {
        await get().fetchModelStatus();
      }
      return result;
    } catch (error) {
      console.error('[VectorSearchStore] Failed to download model:', error);
      return { success: false, error: String(error) };
    }
  },

  cancelDownload: async (modelId: string) => {
    if (!isElectron) return false;

    try {
      return await window.electronAPI.vectorSearch.cancelDownload(modelId);
    } catch (error) {
      console.error('[VectorSearchStore] Failed to cancel download:', error);
      return false;
    }
  },

  deleteModel: async (modelId: string) => {
    if (!isElectron) return false;

    try {
      const result = await window.electronAPI.vectorSearch.deleteModel(modelId);
      if (result) {
        await get().fetchModelStatus();
      }
      return result;
    } catch (error) {
      console.error('[VectorSearchStore] Failed to delete model:', error);
      return false;
    }
  },

  // Indexing actions
  fetchIndexStatus: async (projectId: string) => {
    if (!isElectron) return null;

    try {
      const status = await window.electronAPI.vectorSearch.getIndexStatus(projectId);
      set((state) => {
        const newStatuses = new Map(state.indexStatuses);
        newStatuses.set(projectId, status);
        return { indexStatuses: newStatuses };
      });
      return status;
    } catch (error) {
      console.error('[VectorSearchStore] Failed to fetch index status:', error);
      return null;
    }
  },

  startIndexing: async (projectId: string) => {
    if (!isElectron) return { success: false, error: 'Not in Electron' };

    try {
      const result = await window.electronAPI.vectorSearch.startIndexing(projectId);
      if (result.success) {
        // Mark as indexing
        set((state) => {
          const newStatuses = new Map(state.indexStatuses);
          const current = newStatuses.get(projectId);
          newStatuses.set(projectId, {
            ...current,
            projectId,
            isIndexing: true,
            hasIndex: current?.hasIndex ?? false,
          });
          return { indexStatuses: newStatuses };
        });
      }
      return result;
    } catch (error) {
      console.error('[VectorSearchStore] Failed to start indexing:', error);
      return { success: false, error: String(error) };
    }
  },

  cancelIndexing: async (projectId: string) => {
    if (!isElectron) return { success: false, error: 'Not in Electron' };

    try {
      return await window.electronAPI.vectorSearch.cancelIndexing(projectId);
    } catch (error) {
      console.error('[VectorSearchStore] Failed to cancel indexing:', error);
      return { success: false, error: String(error) };
    }
  },

  clearIndex: async (projectId: string) => {
    if (!isElectron) return { success: false, error: 'Not in Electron' };

    try {
      const result = await window.electronAPI.vectorSearch.clearIndex(projectId);
      if (result.success) {
        // Update status
        await get().fetchIndexStatus(projectId);
      }
      return result;
    } catch (error) {
      console.error('[VectorSearchStore] Failed to clear index:', error);
      return { success: false, error: String(error) };
    }
  },

  // Search action
  search: async (projectId: string, options: SearchOptions) => {
    if (!isElectron) return { success: false, error: 'Not in Electron' };

    try {
      return await window.electronAPI.vectorSearch.search(projectId, options);
    } catch (error) {
      console.error('[VectorSearchStore] Search failed:', error);
      return { success: false, error: String(error) };
    }
  },

  // Event listeners
  setupListeners: () => {
    if (!isElectron) {
      return () => {};
    }

    const unsubscribers: (() => void)[] = [];

    // Model download progress
    unsubscribers.push(
      window.electronAPI.vectorSearch.onModelProgress((progress: ModelDownloadProgress) => {
        set((state) => ({
          modelDownloadProgress: {
            ...state.modelDownloadProgress,
            [progress.modelId]: progress,
          },
        }));
      })
    );

    // Model status changes
    unsubscribers.push(
      window.electronAPI.vectorSearch.onModelStatusChange((modelId: string, state: ModelState) => {
        set((currentState) => ({
          modelStates: {
            ...currentState.modelStates,
            [modelId]: state,
          },
        }));
      })
    );

    // Index progress
    unsubscribers.push(
      window.electronAPI.vectorSearch.onIndexProgress(
        (projectId: string, progress: IndexProgress) => {
          set((state) => {
            const newProgress = new Map(state.indexProgress);
            newProgress.set(projectId, progress);
            return { indexProgress: newProgress };
          });
        }
      )
    );

    // Index complete
    unsubscribers.push(
      window.electronAPI.vectorSearch.onIndexComplete((projectId: string, stats: IndexStats) => {
        set((state) => {
          const newStatuses = new Map(state.indexStatuses);
          newStatuses.set(projectId, {
            projectId,
            isIndexing: false,
            hasIndex: true,
            stats,
          });

          const newProgress = new Map(state.indexProgress);
          newProgress.delete(projectId);

          return {
            indexStatuses: newStatuses,
            indexProgress: newProgress,
          };
        });
      })
    );

    // Index error
    unsubscribers.push(
      window.electronAPI.vectorSearch.onIndexError((projectId: string, error: string) => {
        set((state) => {
          const newStatuses = new Map(state.indexStatuses);
          const current = newStatuses.get(projectId);
          newStatuses.set(projectId, {
            ...current,
            projectId,
            isIndexing: false,
            hasIndex: current?.hasIndex ?? false,
            lastError: error,
          });

          const newProgress = new Map(state.indexProgress);
          newProgress.delete(projectId);

          return {
            indexStatuses: newStatuses,
            indexProgress: newProgress,
          };
        });
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  },

  // Selectors
  getModelState: (modelId: string) => {
    return get().modelStates[modelId] || null;
  },

  getIndexStatus: (projectId: string) => {
    return get().indexStatuses.get(projectId) || null;
  },

  getIndexProgress: (projectId: string) => {
    return get().indexProgress.get(projectId) || null;
  },

  isSearchReady: (projectId: string) => {
    const status = get().indexStatuses.get(projectId);
    const embeddingReady =
      get().modelStates['qwen3-embedding-0.6b']?.status === 'downloaded' ||
      get().modelStates['qwen3-embedding-0.6b']?.status === 'loaded';
    return !!status?.hasIndex && embeddingReady;
  },

  areModelsReady: () => {
    const embeddingReady =
      get().modelStates['qwen3-embedding-0.6b']?.status === 'downloaded' ||
      get().modelStates['qwen3-embedding-0.6b']?.status === 'loaded';
    return embeddingReady;
  },
}));

// Helper to get model info
export function getModelInfo(modelId: string) {
  return VECTOR_MODELS.find((m) => m.id === modelId);
}

// Helper to format bytes
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
