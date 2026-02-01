import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useVectorSearchStore,
  getModelInfo,
  formatBytes,
} from '@renderer/stores/vectorSearchStore';
import { VECTOR_MODELS } from '@shared/types/vectorSearch';

export const ModelDownloadPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    modelStates,
    modelDownloadProgress,
    fetchModelStatus,
    downloadModel,
    cancelDownload,
    deleteModel,
  } = useVectorSearchStore();

  useEffect(() => {
    fetchModelStatus();
  }, [fetchModelStatus]);

  const handleDownload = async (modelId: string) => {
    await downloadModel(modelId);
  };

  const handleCancel = async (modelId: string) => {
    await cancelDownload(modelId);
  };

  const handleDelete = async (modelId: string) => {
    if (
      confirm(t('vectorSearch.confirmDeleteModel', 'Are you sure you want to delete this model?'))
    ) {
      await deleteModel(modelId);
    }
  };

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'downloaded':
      case 'loaded':
        return 'text-green-400';
      case 'downloading':
        return 'text-blue-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-neutral-500';
    }
  };

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case 'downloaded':
        return t('vectorSearch.modelDownloaded', 'Downloaded');
      case 'loaded':
        return t('vectorSearch.modelLoaded', 'Loaded');
      case 'downloading':
        return t('vectorSearch.modelDownloading', 'Downloading...');
      case 'loading':
        return t('vectorSearch.modelLoading', 'Loading...');
      case 'error':
        return t('vectorSearch.modelError', 'Error');
      default:
        return t('vectorSearch.modelNotDownloaded', 'Not downloaded');
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-neutral-300">
        {t('vectorSearch.models', 'AI Models')}
      </h4>
      <p className="text-xs text-neutral-500">
        {t(
          'vectorSearch.modelsDescription',
          'Models are downloaded to your local machine and used for semantic search.'
        )}
      </p>

      <div className="space-y-3">
        {VECTOR_MODELS.map((model) => {
          const state = modelStates[model.id];
          const progress = modelDownloadProgress[model.id];
          const isDownloading = state?.status === 'downloading';
          const isDownloaded = state?.status === 'downloaded' || state?.status === 'loaded';

          return (
            <div
              key={model.id}
              className="bg-neutral-800/50 rounded-lg p-3 border border-neutral-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-200">{model.name}</span>
                    <span className={`text-xs ${getStatusColor(state?.status)}`}>
                      {getStatusText(state?.status)}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1">
                    {model.type === 'embedding' && (
                      <span>{t('vectorSearch.embeddingModel', 'Embedding model')} - </span>
                    )}
                    {model.type === 'reranker' && (
                      <span>{t('vectorSearch.rerankerModel', 'Re-ranker (optional)')} - </span>
                    )}
                    {model.type === 'queryExpander' && (
                      <span>
                        {t('vectorSearch.queryExpanderModel', 'Query expansion (optional)')} -{' '}
                      </span>
                    )}
                    <span>{formatBytes(model.size)}</span>
                    {model.dimension && <span> - {model.dimension}d</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isDownloading ? (
                    <button
                      type="button"
                      onClick={() => handleCancel(model.id)}
                      className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 rounded transition-colors"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                  ) : isDownloaded ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(model.id)}
                      className="px-3 py-1 text-xs bg-neutral-700 hover:bg-red-600 rounded transition-colors"
                    >
                      {t('common.delete', 'Delete')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownload(model.id)}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                    >
                      {t('common.download', 'Download')}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {isDownloading && progress && (
                <div className="mt-2">
                  <div className="w-full bg-neutral-700 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500 mt-1">
                    <span>
                      {formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}
                    </span>
                    <span>{progress.percentage}%</span>
                    {progress.speedBps && progress.speedBps > 0 && (
                      <span>{formatBytes(progress.speedBps)}/s</span>
                    )}
                  </div>
                </div>
              )}

              {/* Error message */}
              {state?.error && <div className="mt-2 text-xs text-red-400">{state.error}</div>}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-neutral-500 mt-4">
        <p>
          {t(
            'vectorSearch.modelsLocation',
            'Models are stored in your user data folder and shared across all projects.'
          )}
        </p>
      </div>
    </div>
  );
};

export default ModelDownloadPanel;
