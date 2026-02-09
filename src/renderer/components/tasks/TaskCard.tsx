import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../common/Spinner';
import type { TrackedTask, TaskStatus } from '@shared/types';
import { useElapsedTime } from '../../contexts/TimerContext';

interface TaskCardProps {
  task: TrackedTask;
  showInstanceBadge?: boolean;
}

export function TaskCard({ task, showInstanceBadge = false }: TaskCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Use shared timer for elapsed time
  const elapsedTime = useElapsedTime(
    task.createdAt,
    task.status === 'completed' ? task.updatedAt : undefined
  );

  const getStatusConfig = (status: TaskStatus) => {
    switch (status) {
      case 'pending':
        return {
          borderColor: 'border-gray-200 dark:border-neutral-700',
          bgColor: 'bg-white dark:bg-neutral-900/50',
          statusIcon: (
            <div className="h-4 w-4 rounded-full border-2 border-gray-300 dark:border-neutral-600" />
          ),
          statusText: t('tasks.status.pending'),
          statusPill: 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-300',
        };
      case 'in_progress':
        return {
          borderColor: 'border-blue-300 dark:border-blue-600',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          statusIcon: <Spinner size="sm" />,
          statusText: task.activeForm || t('tasks.status.inProgress'),
          statusPill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
        };
      case 'completed':
        return {
          borderColor: 'border-green-200 dark:border-green-800',
          bgColor: 'bg-green-50/50 dark:bg-green-900/20',
          statusIcon: (
            <svg
              className="h-4 w-4 text-green-500"
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
          ),
          statusText: t('tasks.status.completed'),
          statusPill: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        };
      default:
        return {
          borderColor: 'border-gray-200 dark:border-neutral-700',
          bgColor: 'bg-white dark:bg-neutral-900/50',
          statusIcon: null,
          statusText: '',
          statusPill: 'bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-300',
        };
    }
  };

  const statusConfig = getStatusConfig(task.status);
  const hasDescription = task.description && task.description.length > 0;
  const hasBlockers =
    (task.blockedBy && task.blockedBy.length > 0) || (task.blocks && task.blocks.length > 0);

  return (
    <div
      className={`
        rounded border transition-colors overflow-hidden
        ${statusConfig.borderColor} ${statusConfig.bgColor}
      `}
    >
      {/* Main Content */}
      <div className="p-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {/* Status Icon */}
            <div className="shrink-0 mt-0.5">{statusConfig.statusIcon}</div>

            {/* Subject */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                {task.subject}
              </p>
              {/* Active Form (spinner text) */}
              {task.status === 'in_progress' && task.activeForm && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 italic">
                  {task.activeForm}
                </p>
              )}
            </div>
          </div>

          {/* Duration & Instance Badge */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {elapsedTime}
            </span>
            {showInstanceBadge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400 font-mono">
                {task.parentInstanceId.slice(0, 8)}
              </span>
            )}
          </div>
        </div>

        {/* Owner Badge */}
        {task.owner && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              {task.owner}
            </span>
          </div>
        )}

        {/* Blocker Badges */}
        {hasBlockers && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {task.blockedBy && task.blockedBy.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10V4"
                  />
                </svg>
                {t('tasks.blockedBy', { count: task.blockedBy.length })}
              </span>
            )}
            {task.blocks && task.blocks.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
                {t('tasks.blocks', { count: task.blocks.length })}
              </span>
            )}
          </div>
        )}

        {/* Actions Row */}
        {hasDescription && (
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-sky-500 hover:text-sky-500/80 flex items-center gap-1 transition-colors"
            >
              <svg
                className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
              {isExpanded ? t('common.collapse') : t('common.expand')} {t('tasks.description')}
            </button>
          </div>
        )}
      </div>

      {/* Description Section (Collapsible) */}
      {isExpanded && hasDescription && (
        <div className="border-t border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-950/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h7"
              />
            </svg>
            {t('tasks.description')}
          </div>
          <div className="max-h-48 overflow-auto rounded bg-white dark:bg-neutral-900 p-2">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
              {task.description}
            </pre>
          </div>
        </div>
      )}

      {/* Description Preview (when collapsed) */}
      {!isExpanded && hasDescription && (
        <div className="px-3 pb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
            {task.description}
          </p>
        </div>
      )}
    </div>
  );
}
