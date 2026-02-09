import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useRalphTaskStore, setupRalphTaskEventListeners } from '../../stores/ralphTaskStore';
import { Spinner } from '../common/Spinner';
import { useProjectStore } from '../../stores/projectStore';
import { TaskColumn } from './TaskColumn';
import { ProcessAllButton } from './ProcessAllButton';

const AddTaskModal = lazy(() =>
  import('./AddTaskModal').then((m) => ({ default: m.AddTaskModal }))
);
const TaskHelpModal = lazy(() =>
  import('./TaskHelpModal').then((m) => ({ default: m.TaskHelpModal }))
);
const JiraImportModal = lazy(() =>
  import('../jira/JiraImportModal').then((m) => ({ default: m.JiraImportModal }))
);

import type { RalphTaskStatus } from '@shared/types';
import type { JiraGlobalConfig } from '@shared/types/jira';
import { JiraIcon, InfoIcon } from '@renderer/components/icons';

interface TaskBoardViewProps {
  projectId: string;
}

const COLUMNS: { id: RalphTaskStatus; title: string }[] = [
  { id: 'todo', title: 'Por hacer' },
  { id: 'doing', title: 'Haciendo' },
  { id: 'done', title: 'Completado' },
];

type JiraStatus = 'not_configured' | 'global_only' | 'project_enabled';

export function TaskBoardView({ projectId }: TaskBoardViewProps) {
  const { t } = useTranslation();
  const { loadTasks, isLoading, error, helpRequestTask, helpRequestReason, isProcessingAll } =
    useRalphTaskStore(
      useShallow((s) => ({
        loadTasks: s.loadTasks,
        isLoading: s.isLoading,
        error: s.error,
        helpRequestTask: s.helpRequestTask,
        helpRequestReason: s.helpRequestReason,
        isProcessingAll: s.isProcessingAll,
      }))
    );
  const { projects } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
    }))
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [showJiraImport, setShowJiraImport] = useState(false);
  const [showJiraTooltip, setShowJiraTooltip] = useState(false);
  const [jiraGlobalConfig, setJiraGlobalConfig] = useState<JiraGlobalConfig | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const jiraEnabled = project?.jiraConfig?.enabled && project?.jiraConfig?.projectKey;

  // Check Jira global configuration status
  const loadJiraConfig = useCallback(async () => {
    try {
      const config = await window.electronAPI.jira.getGlobalConfig();
      setJiraGlobalConfig(config);
    } catch (err) {
      console.error('Failed to load Jira config:', err);
    }
  }, []);

  useEffect(() => {
    void loadJiraConfig();
  }, [loadJiraConfig]);

  // Determine Jira status
  const getJiraStatus = (): JiraStatus => {
    if (!jiraGlobalConfig?.isConfigured) return 'not_configured';
    if (!jiraEnabled) return 'global_only';
    return 'project_enabled';
  };

  const jiraStatus = getJiraStatus();

  // Load tasks when project changes
  useEffect(() => {
    loadTasks(projectId);
  }, [projectId, loadTasks]);

  // Setup event listeners on mount
  useEffect(() => {
    const cleanup = setupRalphTaskEventListeners();
    return cleanup;
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500 dark:text-red-400 text-center">
          <p className="text-lg font-medium">Error loading tasks</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ralph Tasks</h2>
        <div className="flex items-center gap-2">
          <ProcessAllButton projectId={projectId} isProcessing={isProcessingAll} />
          {/* Jira Import Button - Always visible */}
          <div className="relative">
            <button
              onClick={() => {
                if (jiraStatus === 'project_enabled') {
                  setShowJiraImport(true);
                } else {
                  setShowJiraTooltip(!showJiraTooltip);
                }
              }}
              onBlur={() => setTimeout(() => setShowJiraTooltip(false), 200)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1 ${
                jiraStatus === 'project_enabled'
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-neutral-600'
              }`}
              title={
                jiraStatus === 'not_configured'
                  ? t('jira.notConfiguredTooltip', 'Configure Jira in Settings first')
                  : jiraStatus === 'global_only'
                    ? t('jira.notEnabledTooltip', 'Enable Jira in project settings')
                    : t('jira.importTooltip', 'Import from Jira')
              }
            >
              <JiraIcon className="w-4 h-4" />
              Jira
              {jiraStatus !== 'project_enabled' && (
                <span className="ml-1 text-xs">
                  <InfoIcon className="w-3 h-3" />
                </span>
              )}
            </button>
            {/* Tooltip for unconfigured states */}
            {showJiraTooltip && jiraStatus !== 'project_enabled' && (
              <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-lg shadow-lg z-50">
                <div className="flex items-start gap-2">
                  <InfoIcon className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-gray-600 dark:text-gray-300">
                    {jiraStatus === 'not_configured' ? (
                      <>
                        <p className="font-medium mb-1">
                          {t('jira.tooltip.notConfiguredTitle', 'Jira not configured')}
                        </p>
                        <p>
                          {t(
                            'jira.tooltip.notConfiguredDesc',
                            'Go to Settings → Jira to configure your Jira credentials first.'
                          )}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium mb-1">
                          {t('jira.tooltip.notEnabledTitle', 'Enable Jira for this project')}
                        </p>
                        <p>
                          {t(
                            'jira.tooltip.notEnabledDesc',
                            'Edit this project and enable Jira Integration, then select a board.'
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-sky-500 text-white rounded text-sm font-medium hover:bg-sky-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nueva tarea
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((column) => (
          <TaskColumn
            key={column.id}
            status={column.id}
            title={column.title}
            projectId={projectId}
          />
        ))}
      </div>

      {/* Modals */}
      {showAddModal && (
        <Suspense fallback={null}>
          <AddTaskModal projectId={projectId} onClose={() => setShowAddModal(false)} />
        </Suspense>
      )}
      {helpRequestTask && helpRequestReason && (
        <Suspense fallback={null}>
          <TaskHelpModal task={helpRequestTask} reason={helpRequestReason} />
        </Suspense>
      )}
      {showJiraImport && project && (
        <Suspense fallback={null}>
          <JiraImportModal
            project={project}
            onClose={() => setShowJiraImport(false)}
            onImported={() => {
              loadTasks(projectId);
              setShowJiraImport(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
