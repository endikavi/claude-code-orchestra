import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrchestrationStore } from '../../stores/orchestrationStore';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { SubagentCard } from './SubagentCard';
import type { SubagentInstance } from '@shared/types';

interface ProjectGroup {
  projectId: string;
  projectName: string;
  projectColor?: string;
  instances: {
    instanceId: string;
    instanceTitle: string;
    status: string;
    subagents: SubagentInstance[];
    runningCount: number;
    completedCount: number;
  }[];
  totalRunning: number;
  totalCompleted: number;
}

export function OrchestraView() {
  const { t } = useTranslation();
  const { projects, selectProject } = useProjectStore();
  const { instances, selectInstance, selectShell } = useInstanceStore();
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set(['all']));
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const {
    isLoading,
    subagentsByInstance,
    getRunningSubagentCount,
    getCompletedSubagentCount,
    getTotalRunningSubagents,
    getTotalCompletedSubagents,
  } = useOrchestrationStore();

  // Navigate to instance tab
  const navigateToInstance = useCallback(
    (projectId: string, instanceId: string) => {
      selectShell(null);
      selectProject(projectId === 'no-project' ? null : projectId);
      selectInstance(instanceId);
    },
    [selectProject, selectInstance, selectShell]
  );

  // Group ALL active instances by project
  const projectGroups = useMemo((): ProjectGroup[] => {
    const groups = new Map<string, ProjectGroup>();

    // Process ALL instances (not just those with subagents)
    instances.forEach((instance) => {
      const projectId = instance.projectId || 'no-project';
      const project = projects.find((p) => p.id === projectId);
      const subagents = subagentsByInstance[instance.id] || [];

      if (!groups.has(projectId)) {
        groups.set(projectId, {
          projectId,
          projectName: project?.name || t('orchestration.noProject'),
          projectColor: project?.color,
          instances: [],
          totalRunning: 0,
          totalCompleted: 0,
        });
      }

      const group = groups.get(projectId);
      if (!group) return;

      const runningCount = getRunningSubagentCount(instance.id);
      const completedCount = getCompletedSubagentCount(instance.id);

      group.instances.push({
        instanceId: instance.id,
        instanceTitle: instance.terminalTitle || `Instance ${instance.id.slice(0, 8)}`,
        status: instance.status || 'unknown',
        subagents,
        runningCount,
        completedCount,
      });

      group.totalRunning += runningCount;
      group.totalCompleted += completedCount;
    });

    // Sort groups: projects with running instances first, then by name
    return Array.from(groups.values()).sort((a, b) => {
      // Prioritize projects with running instances
      const aHasRunning = a.instances.some(
        (i) => i.status === 'running' || i.status === 'tool_executing'
      );
      const bHasRunning = b.instances.some(
        (i) => i.status === 'running' || i.status === 'tool_executing'
      );
      if (aHasRunning && !bHasRunning) return -1;
      if (!aHasRunning && bHasRunning) return 1;
      // Then by running subagents
      if (a.totalRunning > 0 && b.totalRunning === 0) return -1;
      if (a.totalRunning === 0 && b.totalRunning > 0) return 1;
      return a.projectName.localeCompare(b.projectName);
    });
  }, [
    subagentsByInstance,
    instances,
    projects,
    t,
    getRunningSubagentCount,
    getCompletedSubagentCount,
  ]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const toggleInstance = (instanceId: string) => {
    setExpandedInstances((prev) => {
      const next = new Set(prev);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
  };

  const expandAllProjects = () => {
    setExpandedProjects(new Set(projectGroups.map((g) => g.projectId)));
    setExpandedInstances(
      new Set(projectGroups.flatMap((g) => g.instances.map((i) => i.instanceId)))
    );
  };

  const collapseAllProjects = () => {
    setExpandedProjects(new Set());
    setExpandedInstances(new Set());
  };

  // Totals
  const totalRunning = getTotalRunningSubagents();
  const totalCompleted = getTotalCompletedSubagents();
  const totalSubagents = totalRunning + totalCompleted;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-sky-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Empty state - only show when no instances at all
  if (instances.length === 0) {
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
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t('orchestration.noInstances')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {t('orchestration.noInstancesDescription')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* Main Content - Projects & Instances */}
      <div className="flex flex-col h-full overflow-hidden w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
              {t('orchestration.orchestraView')}
            </h2>

            {/* Stats Pills - hide text on mobile */}
            <div className="flex items-center gap-2">
              {totalRunning > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="hidden sm:inline">
                    {totalRunning} {t('orchestration.running')}
                  </span>
                  <span className="sm:hidden">{totalRunning}</span>
                </span>
              )}
              <span className="hidden sm:inline-flex px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-400 rounded-full">
                {totalSubagents} {t('orchestration.totalSubagents')}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Expand/Collapse - hidden on mobile */}
            <button
              onClick={expandAllProjects}
              className="hidden sm:block px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-sm transition-colors"
            >
              {t('orchestration.expandAll')}
            </button>
            <button
              onClick={collapseAllProjects}
              className="hidden sm:block px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-sm transition-colors"
            >
              {t('orchestration.collapseAll')}
            </button>
          </div>
        </div>

        {/* Content - Project Groups */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {projectGroups.map((group) => (
            <ProjectGroupCard
              key={group.projectId}
              group={group}
              isExpanded={expandedProjects.has(group.projectId)}
              expandedInstances={expandedInstances}
              onToggleProject={() => toggleProject(group.projectId)}
              onToggleInstance={toggleInstance}
              onNavigateToInstance={navigateToInstance}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ProjectGroupCardProps {
  group: ProjectGroup;
  isExpanded: boolean;
  expandedInstances: Set<string>;
  onToggleProject: () => void;
  onToggleInstance: (instanceId: string) => void;
  onNavigateToInstance: (projectId: string, instanceId: string) => void;
}

function ProjectGroupCard({
  group,
  isExpanded,
  expandedInstances,
  onToggleProject,
  onToggleInstance,
  onNavigateToInstance,
}: ProjectGroupCardProps) {
  const { t } = useTranslation();

  const getStatusIndicator = (status: string) => {
    if (status === 'running' || status === 'tool_executing') {
      return (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
      );
    }
    if (status === 'completed') {
      return <span className="h-2 w-2 rounded-full bg-blue-500" />;
    }
    if (status === 'error' || status === 'killed') {
      return <span className="h-2 w-2 rounded-full bg-red-500" />;
    }
    return <span className="h-2 w-2 rounded-full bg-gray-400" />;
  };

  return (
    <div className="bg-white dark:bg-neutral-800 rounded border border-gray-200 dark:border-neutral-700 shadow-sm overflow-hidden">
      {/* Project Header */}
      <button
        onClick={onToggleProject}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Project Color Indicator */}
          <div
            className="w-1 h-8 rounded-full"
            style={{ backgroundColor: group.projectColor || '#6B7280' }}
          />

          {/* Project Info */}
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{group.projectName}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {group.instances.length} {t('orchestration.instances')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Project Stats */}
          <div className="flex items-center gap-2">
            {group.totalRunning > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded-full">
                <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                {group.totalRunning}
              </span>
            )}
            <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-neutral-700 dark:text-gray-400 rounded-full">
              {group.totalCompleted} {t('orchestration.completed')}
            </span>
          </div>

          {/* Expand/Collapse Icon */}
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Instances */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-neutral-700">
          {group.instances.map((inst, idx) => (
            <div
              key={inst.instanceId}
              className={`${idx !== 0 ? 'border-t border-gray-100 dark:border-neutral-700/50' : ''}`}
            >
              {/* Instance Header */}
              <div className="flex items-center justify-between p-3 pl-8 hover:bg-gray-50 dark:hover:bg-neutral-700/30 transition-colors">
                <button
                  onClick={() => inst.subagents.length > 0 && onToggleInstance(inst.instanceId)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  {getStatusIndicator(inst.status)}
                  <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
                    {inst.instanceTitle}
                  </span>
                  {inst.subagents.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      ({inst.subagents.length} {t('orchestration.subagents')})
                    </span>
                  )}
                </button>

                <div className="flex items-center gap-2">
                  {inst.runningCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse" />
                      {inst.runningCount}
                    </span>
                  )}
                  {/* Navigate to instance button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToInstance(group.projectId, inst.instanceId);
                    }}
                    className="p-1.5 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-600 transition-colors"
                    title={t('orchestration.goToInstance')}
                  >
                    <svg
                      className="h-4 w-4 text-gray-500 dark:text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </button>
                  {/* Expand subagents button - only show if has subagents */}
                  {inst.subagents.length > 0 && (
                    <button onClick={() => onToggleInstance(inst.instanceId)} className="p-1">
                      <svg
                        className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expandedInstances.has(inst.instanceId) ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Subagents List */}
              {expandedInstances.has(inst.instanceId) && (
                <div className="pl-12 pr-4 pb-4 space-y-2">
                  {inst.subagents.map((subagent) => (
                    <SubagentCard key={subagent.id} subagent={subagent} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
