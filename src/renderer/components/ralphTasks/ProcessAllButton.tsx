import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useRalphTaskStore } from '../../stores/ralphTaskStore';

interface ProcessAllButtonProps {
  projectId: string;
  isProcessing: boolean;
}

export function ProcessAllButton({ projectId, isProcessing }: ProcessAllButtonProps) {
  const { t } = useTranslation();
  const { processAll, stopAll, getTasksByStatus } = useRalphTaskStore(
    useShallow((s) => ({
      processAll: s.processAll,
      stopAll: s.stopAll,
      getTasksByStatus: s.getTasksByStatus,
    }))
  );
  const todoTasks = getTasksByStatus('todo');
  const hasTodoTasks = todoTasks.length > 0;

  const handleClick = async () => {
    if (isProcessing) {
      await stopAll(projectId);
    } else {
      await processAll(projectId);
    }
  };

  if (isProcessing) {
    return (
      <button
        onClick={handleClick}
        className="px-3 py-1.5 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
          />
        </svg>
        {t('ralphTasks.stopAll')}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={!hasTodoTasks}
      className="px-3 py-1.5 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
      title={
        hasTodoTasks
          ? t('ralphTasks.processTasksHint', { count: todoTasks.length })
          : t('ralphTasks.noTasksToProcess')
      }
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {t('ralphTasks.processAll', { count: todoTasks.length })}
    </button>
  );
}
