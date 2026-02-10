import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import { DataStore } from '../services/DataStore';
import {
  getModelDownloader,
  getLlamaService,
  getVectorIndexService,
  closeVectorIndexService,
  createHybridSearcher,
} from '../services/vectorSearch';
import type {
  SearchOptions,
  IndexProgress,
  IndexStats,
  ModelDownloadProgress,
  ModelState,
  ProjectIndexStatus,
} from '@shared/types/vectorSearch';

let mainWindow: BrowserWindow | null = null;

/**
 * Setup IPC handlers for vector search operations
 */
export function setupVectorSearchHandlers(window: BrowserWindow): void {
  mainWindow = window;
  const dataStore = DataStore.getInstance();
  const modelDownloader = getModelDownloader();
  const llamaService = getLlamaService();

  // Forward model download progress to renderer
  modelDownloader.on('downloadProgress', (progress: ModelDownloadProgress) => {
    mainWindow?.webContents.send(IPC_CHANNELS.VECTOR_MODEL_PROGRESS, progress);
  });

  modelDownloader.on('modelStateChange', (modelId: string, state: ModelState) => {
    mainWindow?.webContents.send(IPC_CHANNELS.VECTOR_MODEL_STATUS_CHANGE, modelId, state);
  });

  // Model operations
  ipcMain.handle(IPC_CHANNELS.VECTOR_MODEL_STATUS, () => {
    return modelDownloader.getAllModelStates();
  });

  ipcMain.handle(IPC_CHANNELS.VECTOR_MODEL_DOWNLOAD, async (_event, modelId: string) => {
    try {
      await modelDownloader.downloadModel(modelId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.VECTOR_MODEL_CANCEL_DOWNLOAD, (_event, modelId: string) => {
    return modelDownloader.cancelDownload(modelId);
  });

  ipcMain.handle(IPC_CHANNELS.VECTOR_MODEL_DELETE, (_event, modelId: string) => {
    return modelDownloader.deleteModel(modelId);
  });

  // Index operations
  ipcMain.handle(IPC_CHANNELS.VECTOR_INDEX_STATUS, async (_event, projectId: string) => {
    const project = dataStore.getProjectById(projectId);
    if (!project) {
      return {
        projectId,
        isIndexing: false,
        hasIndex: false,
        lastError: 'Project not found',
      } as ProjectIndexStatus;
    }

    try {
      const indexService = getVectorIndexService(
        projectId,
        project.path,
        project.vectorSearchConfig
      );
      await indexService.initialize();

      return {
        projectId,
        isIndexing: false,
        hasIndex: indexService.hasIndex(),
        stats: indexService.getStats(),
      } as ProjectIndexStatus;
    } catch (error) {
      return {
        projectId,
        isIndexing: false,
        hasIndex: false,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      } as ProjectIndexStatus;
    }
  });

  ipcMain.handle(IPC_CHANNELS.VECTOR_INDEX_START, async (_event, projectId: string) => {
    const project = dataStore.getProjectById(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const indexService = getVectorIndexService(
        projectId,
        project.path,
        project.vectorSearchConfig
      );
      await indexService.initialize();

      // Forward progress events to renderer
      indexService.on('indexProgress', (pid: string, progress: IndexProgress) => {
        mainWindow?.webContents.send(IPC_CHANNELS.VECTOR_INDEX_PROGRESS, pid, progress);
      });

      // Run indexing (async)
      indexService
        .indexProject()
        .then((stats) => {
          mainWindow?.webContents.send(IPC_CHANNELS.VECTOR_INDEX_COMPLETE, projectId, stats);
        })
        .catch((error) => {
          mainWindow?.webContents.send(
            IPC_CHANNELS.VECTOR_INDEX_ERROR,
            projectId,
            error instanceof Error ? error.message : 'Indexing failed'
          );
        });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start indexing',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.VECTOR_INDEX_CANCEL, (_event, projectId: string) => {
    const project = dataStore.getProjectById(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const indexService = getVectorIndexService(
        projectId,
        project.path,
        project.vectorSearchConfig
      );
      indexService.cancelIndexing();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel indexing',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.VECTOR_INDEX_CLEAR, async (_event, projectId: string) => {
    const project = dataStore.getProjectById(projectId);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const indexService = getVectorIndexService(
        projectId,
        project.path,
        project.vectorSearchConfig
      );
      await indexService.initialize();
      await indexService.clearIndex();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear index',
      };
    }
  });

  // Search operations
  ipcMain.handle(
    IPC_CHANNELS.VECTOR_SEARCH,
    async (_event, projectId: string, options: SearchOptions) => {
      const project = dataStore.getProjectById(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      try {
        const indexService = getVectorIndexService(
          projectId,
          project.path,
          project.vectorSearchConfig
        );
        await indexService.initialize();

        if (!indexService.hasIndex()) {
          return { success: false, error: 'Index not found. Please index the project first.' };
        }

        const searcher = createHybridSearcher(indexService, {
          rerankingEnabled: project.vectorSearchConfig?.useReranking ?? true,
          queryExpansionEnabled: project.vectorSearchConfig?.useQueryExpansion ?? false,
        });

        const response = await searcher.search(options);
        return { success: true, response };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Search failed',
        };
      }
    }
  );
}

/**
 * Cleanup vector search handlers and resources
 */
export function cleanupVectorSearchHandlers(): void {
  mainWindow = null;

  // Unload all models to free memory
  try {
    getLlamaService().unloadAllModels();
  } catch (error) {
    console.error('[VectorSearch] Error unloading models:', error);
  }

  // Remove all IPC handlers
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_MODEL_STATUS);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_MODEL_DOWNLOAD);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_MODEL_CANCEL_DOWNLOAD);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_MODEL_DELETE);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_INDEX_STATUS);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_INDEX_START);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_INDEX_CANCEL);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_INDEX_CLEAR);
  ipcMain.removeHandler(IPC_CHANNELS.VECTOR_SEARCH);
}
