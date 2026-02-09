import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../common/Spinner';
import type {
  JiraProjectConfig as JiraProjectConfigType,
  JiraBoard,
  JiraStatus,
  JiraGlobalConfig,
} from '@shared/types/jira';

interface JiraProjectConfigProps {
  config: JiraProjectConfigType | undefined;
  onChange: (config: JiraProjectConfigType | undefined) => void;
  projectPath?: string;
}

export function JiraProjectConfig({ config, onChange, projectPath }: JiraProjectConfigProps) {
  const { t } = useTranslation();
  const [globalConfig, setGlobalConfig] = useState<JiraGlobalConfig | null>(null);
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [statuses, setStatuses] = useState<JiraStatus[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store reference to onChange to use in callbacks
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Local state for form
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [boardId, setBoardId] = useState(config?.boardId ?? '');
  const [projectKey, setProjectKey] = useState(config?.projectKey ?? '');
  const [importFilter, setImportFilter] = useState<'mine' | 'all'>(config?.importFilter ?? 'mine');
  const [doingStatusId, setDoingStatusId] = useState(config?.statusMapping?.doing ?? '');
  const [doneStatusId, setDoneStatusId] = useState(config?.statusMapping?.done ?? '');
  const [autoAssignOnDoing, setAutoAssignOnDoing] = useState(config?.autoAssignOnDoing ?? false);

  // Load global Jira config to check if configured
  const loadGlobalConfig = useCallback(async () => {
    try {
      const jiraConfig = await window.electronAPI.jira.getGlobalConfig();
      setGlobalConfig(jiraConfig);
    } catch (err) {
      console.error('Failed to load Jira global config:', err);
    }
  }, []);

  useEffect(() => {
    void loadGlobalConfig();
  }, [loadGlobalConfig]);

  // Load boards when enabled and global config is available
  const loadBoards = useCallback(async () => {
    if (!globalConfig?.isConfigured) return;

    setLoadingBoards(true);
    setError(null);

    try {
      const result = await window.electronAPI.jira.getBoards();
      if (result.success && result.boards) {
        setBoards(result.boards);
      } else {
        setError(result.error || 'Failed to load boards');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load boards');
    } finally {
      setLoadingBoards(false);
    }
  }, [globalConfig?.isConfigured]);

  useEffect(() => {
    if (enabled) {
      void loadBoards();
    }
  }, [enabled, loadBoards]);

  // Load statuses when project key is set
  const loadStatuses = useCallback(async () => {
    if (!projectKey) return;

    setLoadingStatuses(true);

    try {
      const result = await window.electronAPI.jira.getStatuses(projectKey);
      if (result.success && result.statuses) {
        setStatuses(result.statuses);
      }
    } catch (err) {
      console.error('Failed to load statuses:', err);
    } finally {
      setLoadingStatuses(false);
    }
  }, [projectKey]);

  useEffect(() => {
    if (projectKey) {
      void loadStatuses();
    }
  }, [projectKey, loadStatuses]);

  // Helper to build and send config to parent
  const syncToParent = useCallback(
    (
      updates: Partial<{
        enabled: boolean;
        boardId: string;
        projectKey: string;
        importFilter: 'mine' | 'all';
        doingStatusId: string;
        doneStatusId: string;
        autoAssignOnDoing: boolean;
      }>
    ) => {
      const newEnabled = updates.enabled ?? enabled;
      const newBoardId = updates.boardId ?? boardId;
      const newProjectKey = updates.projectKey ?? projectKey;
      const newImportFilter = updates.importFilter ?? importFilter;
      const newDoingStatusId = updates.doingStatusId ?? doingStatusId;
      const newDoneStatusId = updates.doneStatusId ?? doneStatusId;
      const newAutoAssignOnDoing = updates.autoAssignOnDoing ?? autoAssignOnDoing;

      if (!newEnabled) {
        onChangeRef.current(undefined);
        return;
      }

      const newConfig: JiraProjectConfigType = {
        enabled: newEnabled,
        boardId: newBoardId,
        projectKey: newProjectKey,
        importFilter: newImportFilter,
        statusMapping: {
          doing: newDoingStatusId,
          done: newDoneStatusId,
        },
        autoAssignOnDoing: newAutoAssignOnDoing,
      };
      console.log('[JiraProjectConfig] syncToParent:', JSON.stringify(newConfig, null, 2));
      onChangeRef.current(newConfig);
    },
    [enabled, boardId, projectKey, importFilter, doingStatusId, doneStatusId, autoAssignOnDoing]
  );

  // Wrapped setters that sync to parent immediately
  const handleEnabledChange = (value: boolean) => {
    setEnabled(value);
    syncToParent({ enabled: value });
  };

  const handleBoardIdChange = (value: string) => {
    setBoardId(value);
    // projectKey will be updated by the useEffect below, which will call syncToParent
    const board = boards.find((b) => b.id.toString() === value);
    const newProjectKey = board?.location?.projectKey || projectKey;
    setProjectKey(newProjectKey);
    syncToParent({ boardId: value, projectKey: newProjectKey });
  };

  const handleImportFilterChange = (value: 'mine' | 'all') => {
    setImportFilter(value);
    syncToParent({ importFilter: value });
  };

  const handleDoingStatusChange = (value: string) => {
    setDoingStatusId(value);
    syncToParent({ doingStatusId: value });
  };

  const handleDoneStatusChange = (value: string) => {
    setDoneStatusId(value);
    syncToParent({ doneStatusId: value });
  };

  const handleAutoAssignChange = (value: boolean) => {
    setAutoAssignOnDoing(value);
    syncToParent({ autoAssignOnDoing: value });
  };

  // If global config is not configured, show message
  if (globalConfig && !globalConfig.isConfigured) {
    return (
      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          {t(
            'jira.project.notConfigured',
            'Jira is not configured. Please configure your Jira credentials in Settings > Jira.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Enable Toggle */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleEnabledChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-800"
        />
        <div>
          <span className="text-sm font-medium text-blue-500 dark:text-blue-400">
            {t('jira.project.enable', 'Enable Jira Integration')}
          </span>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {t('jira.project.enableDesc', 'Sync tasks with Jira issues and auto-update status')}
          </p>
        </div>
      </label>

      {enabled && (
        <div className="ml-7 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Board Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t('jira.project.board', 'Jira Board')}
            </label>
            {loadingBoards ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <LoadingSpinner className="w-4 h-4" />
                {t('jira.project.loadingBoards', 'Loading boards...')}
              </div>
            ) : (
              <select
                value={boardId}
                onChange={(e) => handleBoardIdChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t('jira.project.selectBoard', 'Select a board...')}</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id.toString()}>
                    {board.name}{' '}
                    {board.location?.projectKey ? `(${board.location.projectKey})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Import Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t('jira.project.importFilter', 'Import Filter')}
            </label>
            <select
              value={importFilter}
              onChange={(e) => handleImportFilterChange(e.target.value as 'mine' | 'all')}
              className="w-full px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="mine">{t('jira.project.filterMine', 'My issues only')}</option>
              <option value="all">{t('jira.project.filterAll', 'All issues')}</option>
            </select>
          </div>

          {/* Status Mapping */}
          {projectKey && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                {t('jira.project.statusMapping', 'Status Mapping')}
              </label>

              {loadingStatuses ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <LoadingSpinner className="w-4 h-4" />
                  {t('jira.project.loadingStatuses', 'Loading statuses...')}
                </div>
              ) : (
                <>
                  {/* Doing Status */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-16">
                      {t('jira.project.doingStatus', 'Doing')}:
                    </span>
                    <select
                      value={doingStatusId}
                      onChange={(e) => handleDoingStatusChange(e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">{t('jira.project.noChange', 'No change')}</option>
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Done Status */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-16">
                      {t('jira.project.doneStatus', 'Done')}:
                    </span>
                    <select
                      value={doneStatusId}
                      onChange={(e) => handleDoneStatusChange(e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">{t('jira.project.noChange', 'No change')}</option>
                      {statuses.map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t(
                  'jira.project.statusMappingHint',
                  'When a Ralph task moves to "doing" or "done", the Jira issue will transition to the selected status.'
                )}
              </p>
            </div>
          )}

          {/* Auto-assign */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoAssignOnDoing}
              onChange={(e) => handleAutoAssignChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {t('jira.project.autoAssign', 'Auto-assign on start')}
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t(
                  'jira.project.autoAssignDesc',
                  'Automatically assign the issue to me when moving to "doing"'
                )}
              </p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return <Spinner size="sm" className={className} />;
}
