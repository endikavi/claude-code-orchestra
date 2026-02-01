import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVectorSearchStore, formatBytes } from '@renderer/stores/vectorSearchStore';
import { ModelDownloadPanel } from './ModelDownloadPanel';
import type { Project } from '@shared/types';

interface VectorSearchPanelProps {
  project: Project;
  onUpdateProject: (updates: Partial<Project>) => void;
}

export const VectorSearchPanel: React.FC<VectorSearchPanelProps> = ({
  project,
  onUpdateProject,
}) => {
  const { t } = useTranslation();
  const {
    fetchIndexStatus,
    startIndexing,
    cancelIndexing,
    clearIndex,
    getIndexStatus,
    getIndexProgress,
    areModelsReady,
    setupListeners,
  } = useVectorSearchStore();

  const [showModels, setShowModels] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const indexStatus = getIndexStatus(project.id);
  const indexProgress = getIndexProgress(project.id);
  const modelsReady = areModelsReady();

  useEffect(() => {
    const cleanup = setupListeners();
    fetchIndexStatus(project.id);
    return cleanup;
  }, [project.id, fetchIndexStatus, setupListeners]);

  const handleStartIndexing = async () => {
    await startIndexing(project.id);
  };

  const handleCancelIndexing = async () => {
    await cancelIndexing(project.id);
  };

  const handleClearIndex = async () => {
    if (
      confirm(
        t('vectorSearch.confirmClearIndex', 'Are you sure you want to clear the search index?')
      )
    ) {
      await clearIndex(project.id);
    }
  };

  // Helper to get full config with defaults
  const getFullConfig = () => ({
    enabled: project.vectorSearchConfig?.enabled ?? true,
    useReranking: project.vectorSearchConfig?.useReranking ?? true,
    rerankStrategy: project.vectorSearchConfig?.rerankStrategy ?? ('embedding' as const),
    useQueryExpansion: project.vectorSearchConfig?.useQueryExpansion ?? false,
    indexPatterns: project.vectorSearchConfig?.indexPatterns ?? ['**/*.md'],
    minimumScore: project.vectorSearchConfig?.minimumScore ?? 0.05,
  });

  const handleToggleEnabled = (enabled: boolean) => {
    onUpdateProject({
      vectorSearchConfig: { ...getFullConfig(), enabled },
    });
  };

  const handleToggleReranking = (useReranking: boolean) => {
    onUpdateProject({
      vectorSearchConfig: { ...getFullConfig(), useReranking },
    });
  };

  const handleToggleQueryExpansion = (useQueryExpansion: boolean) => {
    onUpdateProject({
      vectorSearchConfig: { ...getFullConfig(), useQueryExpansion },
    });
  };

  const handleIndexPatternsChange = (patternsString: string) => {
    const patterns = patternsString
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (patterns.length === 0) {
      patterns.push('**/*.md'); // Default fallback
    }

    onUpdateProject({
      vectorSearchConfig: { ...getFullConfig(), indexPatterns: patterns },
    });
  };

  const handleRerankStrategyChange = (
    rerankStrategy: 'none' | 'embedding' | 'bge-v2-m3' | 'jina-v2'
  ) => {
    onUpdateProject({
      vectorSearchConfig: { ...getFullConfig(), rerankStrategy },
    });
  };

  const handleMinimumScoreChange = (minimumScore: number) => {
    onUpdateProject({
      vectorSearchConfig: { ...getFullConfig(), minimumScore },
    });
  };

  const config = getFullConfig();

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return t('common.never', 'Never');
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-neutral-100">
          {t('vectorSearch.title', 'Semantic Search')}
        </h3>
        <p className="text-sm text-neutral-400 mt-1">
          {t(
            'vectorSearch.description',
            'Index your project documentation for AI-powered semantic search via MCP tools.'
          )}
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg">
        <div>
          <span className="text-sm text-neutral-200">
            {t('vectorSearch.enableSearch', 'Enable Semantic Search')}
          </span>
          <p className="text-xs text-neutral-500 mt-0.5">
            {t(
              'vectorSearch.enableSearchDescription',
              'Make semantic_search MCP tool available for this project'
            )}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
        </label>
      </div>

      {config.enabled && (
        <>
          {/* Models section */}
          <div className="border-t border-neutral-700 pt-4">
            <button
              type="button"
              onClick={() => setShowModels(!showModels)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-neutral-200">
                {t('vectorSearch.aiModels', 'AI Models')}
              </span>
              <span className="text-neutral-500">{showModels ? '▲' : '▼'}</span>
            </button>
            {!modelsReady && (
              <p className="text-xs text-amber-400 mt-1">
                {t('vectorSearch.modelsRequired', 'Download embedding model to enable search')}
              </p>
            )}
            {showModels && (
              <div className="mt-4">
                <ModelDownloadPanel />
              </div>
            )}
          </div>

          {/* Index status */}
          <div className="border-t border-neutral-700 pt-4">
            <h4 className="text-sm font-medium text-neutral-200 mb-3">
              {t('vectorSearch.indexStatus', 'Index Status')}
            </h4>

            {indexStatus?.isIndexing && indexProgress ? (
              /* Indexing in progress */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-400">
                    {indexProgress.phase === 'scanning' &&
                      t('vectorSearch.phaseScanning', 'Scanning files...')}
                    {indexProgress.phase === 'chunking' &&
                      t('vectorSearch.phaseChunking', 'Chunking documents...')}
                    {indexProgress.phase === 'embedding' &&
                      t('vectorSearch.phaseEmbedding', 'Generating embeddings...')}
                    {indexProgress.phase === 'storing' &&
                      t('vectorSearch.phaseStoring', 'Storing index...')}
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelIndexing}
                    className="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 rounded transition-colors"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                </div>

                {indexProgress.currentFile && (
                  <p className="text-xs text-neutral-500 truncate">{indexProgress.currentFile}</p>
                )}

                <div className="w-full bg-neutral-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${indexProgress.percentage}%` }}
                  />
                </div>

                <div className="flex justify-between text-xs text-neutral-500">
                  <span>
                    {indexProgress.filesProcessed}/{indexProgress.totalFiles} files
                  </span>
                  <span>{indexProgress.percentage}%</span>
                  <span>
                    {indexProgress.chunksProcessed}/{indexProgress.totalChunks || '?'} chunks
                  </span>
                </div>
              </div>
            ) : indexStatus?.hasIndex && indexStatus.stats ? (
              /* Index exists */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-neutral-800/50 p-3 rounded">
                    <div className="text-neutral-500 text-xs">
                      {t('vectorSearch.totalFiles', 'Files')}
                    </div>
                    <div className="text-lg font-medium text-neutral-200">
                      {indexStatus.stats.totalFiles}
                    </div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded">
                    <div className="text-neutral-500 text-xs">
                      {t('vectorSearch.totalChunks', 'Chunks')}
                    </div>
                    <div className="text-lg font-medium text-neutral-200">
                      {indexStatus.stats.totalChunks}
                    </div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded">
                    <div className="text-neutral-500 text-xs">
                      {t('vectorSearch.indexSize', 'Size')}
                    </div>
                    <div className="text-lg font-medium text-neutral-200">
                      {formatBytes(indexStatus.stats.databaseSizeBytes)}
                    </div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded">
                    <div className="text-neutral-500 text-xs">
                      {t('vectorSearch.lastIndexed', 'Last Indexed')}
                    </div>
                    <div className="text-sm text-neutral-300">
                      {formatDate(indexStatus.stats.lastIndexedAt)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleStartIndexing}
                    disabled={!modelsReady}
                    className="flex-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded transition-colors"
                  >
                    {t('vectorSearch.reindex', 'Re-index Project')}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearIndex}
                    className="px-4 py-2 text-sm bg-neutral-700 hover:bg-red-600 rounded transition-colors"
                  >
                    {t('vectorSearch.clearIndex', 'Clear')}
                  </button>
                </div>
              </div>
            ) : (
              /* No index */
              <div className="space-y-3">
                <p className="text-sm text-neutral-500">
                  {t('vectorSearch.noIndex', 'No search index exists for this project.')}
                </p>
                <button
                  type="button"
                  onClick={handleStartIndexing}
                  disabled={!modelsReady}
                  className="w-full px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 rounded transition-colors"
                >
                  {modelsReady
                    ? t('vectorSearch.indexProject', 'Index Project')
                    : t('vectorSearch.downloadModelsFirst', 'Download Models First')}
                </button>
                {indexStatus?.lastError && (
                  <p className="text-xs text-red-400">{indexStatus.lastError}</p>
                )}
              </div>
            )}
          </div>

          {/* Search options */}
          <div className="border-t border-neutral-700 pt-4">
            <h4 className="text-sm font-medium text-neutral-200 mb-3">
              {t('vectorSearch.searchOptions', 'Search Options')}
            </h4>

            <div className="space-y-3">
              {/* Re-ranking */}
              <div className="flex items-center justify-between p-3 bg-neutral-800/50 rounded">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-200">
                      {t('vectorSearch.useReranking', 'AI Re-ranking')}
                    </span>
                    <span className="text-xs text-green-400 font-medium">
                      {t('common.recommended', 'Recommended')}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {t(
                      'vectorSearch.useRerankingDescription',
                      'Improves result relevance using embeddings (~1s)'
                    )}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.useReranking}
                    onChange={(e) => handleToggleReranking(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>

              {/* Query expansion */}
              <div className="flex items-center justify-between p-3 bg-neutral-800/50 rounded">
                <div>
                  <span className="text-sm text-neutral-200">
                    {t('vectorSearch.useQueryExpansion', 'Query Expansion')}
                  </span>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {t(
                      'vectorSearch.useQueryExpansionDescription',
                      'Generate alternative queries (better recall, slower)'
                    )}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.useQueryExpansion}
                    onChange={(e) => handleToggleQueryExpansion(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
            </div>
          </div>

          {/* Advanced options */}
          <div className="border-t border-neutral-700 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-medium text-neutral-400">
                {t('vectorSearch.advancedOptions', 'Advanced Options')}
              </span>
              <span className="text-neutral-500">{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 p-3 bg-neutral-800/30 rounded-lg border border-neutral-700">
                {/* Rerank strategy selector */}
                <div>
                  <label className="text-sm text-neutral-300 block mb-2">
                    {t('vectorSearch.rerankStrategy', 'Rerank Strategy')}
                  </label>
                  <select
                    value={config.rerankStrategy}
                    onChange={(e) =>
                      handleRerankStrategyChange(
                        e.target.value as 'none' | 'embedding' | 'bge-v2-m3' | 'jina-v2'
                      )
                    }
                    className="w-full bg-neutral-800 border border-neutral-600 rounded p-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="embedding">
                      Embedding ({t('common.recommended', 'Recommended')})
                    </option>
                    <option value="none">{t('vectorSearch.noReranking', 'None (Faster)')}</option>
                    <option value="bge-v2-m3">
                      BGE v2-M3 ({t('vectorSearch.requiresModel', 'Requires model')})
                    </option>
                    <option value="jina-v2">
                      Jina v2 ({t('vectorSearch.requiresModel', 'Requires model')})
                    </option>
                  </select>
                  <p className="text-xs text-neutral-500 mt-1">
                    {t('vectorSearch.rerankStrategyHint', 'Embedding is optimal for most cases')}
                  </p>
                </div>

                {/* Minimum score slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-neutral-300">
                      {t('vectorSearch.minimumScore', 'Minimum Relevance Score')}
                    </label>
                    <span className="text-sm text-neutral-400 font-mono">
                      {config.minimumScore.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.2"
                    step="0.01"
                    value={config.minimumScore}
                    onChange={(e) => handleMinimumScoreChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-neutral-600 mt-1">
                    <span>{t('vectorSearch.moreResults', 'More results')}</span>
                    <span>{t('vectorSearch.moreRelevant', 'More relevant')}</span>
                  </div>
                </div>

                {/* Info box */}
                <div className="flex items-start gap-2 p-2 bg-blue-900/20 rounded text-xs text-blue-300">
                  <span>ℹ️</span>
                  <span>
                    {t(
                      'vectorSearch.advancedHint',
                      "Default values work well for most cases. Only change if you know what you're doing."
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Index patterns */}
          <div className="border-t border-neutral-700 pt-4">
            <h4 className="text-sm font-medium text-neutral-200 mb-2">
              {t('vectorSearch.indexPatterns', 'Index Patterns')}
            </h4>
            <p className="text-xs text-neutral-500 mb-2">
              {t(
                'vectorSearch.indexPatternsDescription',
                'Glob patterns for files to index (comma-separated)'
              )}
            </p>
            <input
              type="text"
              defaultValue={config.indexPatterns.join(', ')}
              onBlur={(e) => handleIndexPatternsChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleIndexPatternsChange(e.currentTarget.value);
                  e.currentTarget.blur();
                }
              }}
              placeholder="**/*.md, **/*.ts, **/*.tsx"
              className="w-full bg-neutral-800/50 border border-neutral-700 rounded p-2 text-sm text-neutral-300 font-mono focus:border-blue-500 focus:outline-none"
            />
            <p className="text-xs text-neutral-600 mt-1">
              {t('vectorSearch.indexPatternsHint', 'Examples: **/*.md, **/*.ts, docs/**/*.txt')}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default VectorSearchPanel;
