import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../../stores/taskStore';
import { Spinner } from '../common/Spinner';
import { EmptyState } from '../common/EmptyState';
import { TaskCard } from './TaskCard';
import type { TaskStatus } from '@shared/types';

interface TasksPanelProps {
  className?: string;
  onClose?: () => void;
}

export function TasksPanel({ className = '', onClose }: TasksPanelProps) {
  const { t } = useTranslation();
  const [collapsedSections, setCollapsedSections] = useState<Record<TaskStatus, boolean>>({
    pending: false,
    in_progress: false,
    completed: true, // Completed tasks collapsed by default
  });

  const tasksByInstance = useTaskStore((state) => state.tasksByInstance);
  const getTotalPending = useTaskStore((state) => state.getTotalPending);
  const getTotalInProgress = useTaskStore((state) => state.getTotalInProgress);
  const getTotalCompleted = useTaskStore((state) => state.getTotalCompleted);
  const getAllTasksSorted = useTaskStore((state) => state.getAllTasksSorted);

  const pendingCount = getTotalPending();
  const inProgressCount = getTotalInProgress();
  const completedCount = getTotalCompleted();
  const totalCount = pendingCount + inProgressCount + completedCount;

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const allTasks = getAllTasksSorted();
    return {
      in_progress: allTasks.filter((t) => t.status === 'in_progress'),
      pending: allTasks.filter((t) => t.status === 'pending'),
      completed: allTasks.filter((t) => t.status === 'completed'),
    };
  }, [getAllTasksSorted, tasksByInstance]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (status: TaskStatus) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [status]: !prev[status],
    }));
  };

  const renderSection = (
    status: TaskStatus,
    label: string,
    count: number,
    icon: React.ReactNode,
    colorClasses: string
  ) => {
    const tasks = tasksByStatus[status];
    const isCollapsed = collapsedSections[status];

    if (count === 0) return null;

    return (
      <div key={status} className="mb-4">
        {/* Section Header */}
        <button
          onClick={() => toggleSection(status)}
          className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className={colorClasses}>{icon}</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${colorClasses.replace('text-', 'bg-').replace('dark:text-', 'dark:bg-')} bg-opacity-20 dark:bg-opacity-30`}
            >
              {count}
            </span>
          </div>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Task List */}
        {!isCollapsed && (
          <div className="mt-2 space-y-2 px-1">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} showInstanceBadge={true} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="sticky top-0 bg-[var(--color-bg-subtle)] z-10 px-4 py-3 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <svg
              className="h-5 w-5 text-sky-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            {t('tasks.title')}
          </h2>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{totalCount} total</span>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors"
                aria-label={t('common.close')}
              >
                <svg
                  className="h-5 w-5 text-gray-500 dark:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        {totalCount > 0 && (
          <div className="flex items-center gap-4 mt-3">
            {inProgressCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Spinner size="xs" />
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  {inProgressCount}
                </span>
              </div>
            )}
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-3 w-3 rounded-full border-2 border-gray-300 dark:border-neutral-600" />
                <span className="text-gray-600 dark:text-gray-400 font-medium">{pendingCount}</span>
              </div>
            )}
            {completedCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <svg
                  className="h-3 w-3 text-green-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="text-green-600 dark:text-green-400 font-medium">
                  {completedCount}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Sections */}
      <div className="flex-1 overflow-y-auto p-3">
        {totalCount === 0 ? (
          <EmptyState
            icon={
              <svg
                className="h-12 w-12 text-gray-300 dark:text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            }
            title={t('tasks.empty')}
            description={t('tasks.emptyHint')}
          />
        ) : (
          <>
            {/* In Progress Section */}
            {renderSection(
              'in_progress',
              t('tasks.sections.inProgress'),
              inProgressCount,
              <Spinner size="sm" />,
              'text-blue-600 dark:text-blue-400'
            )}

            {/* Pending Section */}
            {renderSection(
              'pending',
              t('tasks.sections.pending'),
              pendingCount,
              <div className="h-4 w-4 rounded-full border-2 border-gray-400 dark:border-gray-500" />,
              'text-gray-600 dark:text-gray-400'
            )}

            {/* Completed Section */}
            {renderSection(
              'completed',
              t('tasks.sections.completed'),
              completedCount,
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>,
              'text-green-600 dark:text-green-400'
            )}
          </>
        )}
      </div>
    </div>
  );
}
