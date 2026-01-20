import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrchestrationStore } from '../../stores/orchestrationStore';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { SubagentCard } from './SubagentCard';

export function OrchestraView() {
  const { t } = useTranslation();
  const { selectedProjectId } = useProjectStore();
  const { instances } = useInstanceStore();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const {
    isLoading,
    subagentsByInstance,
    getSubagentsForInstance,
    getRunningSubagentCount,
    getCompletedSubagentCount,
    getTotalRunningSubagents,
    getTotalCompletedSubagents,
  } = useOrchestrationStore();

  // Event listeners are now set up globally in App.tsx

  // Get instances with subagents (filtered by project if selected)
  const instancesWithSubagents = Object.keys(subagentsByInstance).filter((instanceId) => {
    const subagents = subagentsByInstance[instanceId];
    if (!subagents || subagents.length === 0) return false;
    // Filter by project if selected
    if (selectedProjectId) {
      const instance = instances.find((i) => i.id === instanceId);
      return instance?.projectId === selectedProjectId;
    }
    return true;
  });

  // Get selected instance's subagents
  const selectedSubagents = selectedInstanceId ? getSubagentsForInstance(selectedInstanceId) : [];

  // Totals
  const totalRunning = getTotalRunningSubagents();
  const totalCompleted = getTotalCompletedSubagents();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-claude-orange border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (instancesWithSubagents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <svg
              className="h-24 w-24 mx-auto text-gray-300 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t('orchestration.noSubagents')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('orchestration.noSubagentsDescription')}
          </p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-left">
            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('orchestration.howSubagentsWork')}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('orchestration.subagentsExplanation')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('orchestration.orchestraView')}
          </h2>
          {/* Stats */}
          {totalRunning > 0 && (
            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded-full flex items-center gap-1">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              {totalRunning} {t('orchestration.running')}
            </span>
          )}
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-full">
            {totalCompleted} {t('orchestration.completed')}
          </span>
        </div>

        <span className="text-sm text-gray-500 dark:text-gray-400">
          {instancesWithSubagents.length} {t('orchestration.instancesWithSubagents')}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Instances List */}
        <div
          className={`${
            selectedInstanceId ? 'w-80' : 'w-full'
          } border-r border-gray-200 dark:border-gray-700 overflow-auto`}
        >
          <div className="p-4 space-y-3">
            {instancesWithSubagents.map((instanceId) => {
              const instance = instances.find((i) => i.id === instanceId);
              const subagents = getSubagentsForInstance(instanceId);
              const runningCount = getRunningSubagentCount(instanceId);
              const completedCount = getCompletedSubagentCount(instanceId);

              return (
                <div
                  key={instanceId}
                  className={`
                    p-4 rounded-lg border cursor-pointer transition-all
                    ${
                      selectedInstanceId === instanceId
                        ? 'border-claude-orange bg-claude-orange/10'
                        : 'border-gray-200 dark:border-gray-700 hover:border-claude-orange/50'
                    }
                  `}
                  onClick={() => setSelectedInstanceId(instanceId)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          instance?.status === 'running' || instance?.status === 'tool_executing'
                            ? 'bg-green-500'
                            : instance?.status === 'completed'
                              ? 'bg-blue-500'
                              : 'bg-gray-400'
                        }`}
                      />
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {instance?.terminalTitle || `Instance ${instanceId.slice(0, 8)}`}
                      </span>
                    </div>
                    {runningCount > 0 && (
                      <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                        {runningCount}
                      </div>
                    )}
                  </div>

                  {/* Subagent Preview */}
                  <div className="space-y-1">
                    {subagents.slice(0, 3).map((subagent) => (
                      <div
                        key={subagent.id}
                        className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <div
                          className={`h-1.5 w-1.5 rounded-full ${
                            subagent.status === 'running'
                              ? 'bg-green-500'
                              : subagent.status === 'completed'
                                ? 'bg-blue-500'
                                : 'bg-red-500'
                          }`}
                        />
                        <span className="truncate">{subagent.description}</span>
                      </div>
                    ))}
                    {subagents.length > 3 && (
                      <div className="text-xs text-gray-500 ml-4">
                        +{subagents.length - 3} {t('orchestration.more')}
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {subagents.length} {t('orchestration.subagents')}
                    </span>
                    <span>
                      {completedCount} {t('orchestration.completed')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subagent Detail */}
        {selectedInstanceId && (
          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                {t('orchestration.subagentDetails')}
              </h3>
              <button
                onClick={() => setSelectedInstanceId(null)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {selectedSubagents.map((subagent) => (
                <SubagentCard key={subagent.id} subagent={subagent} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
