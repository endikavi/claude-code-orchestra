import { useEffect, useState } from 'react';
import { useRalphTaskStore, setupRalphTaskEventListeners } from '../../stores/ralphTaskStore';
import { TaskColumn } from './TaskColumn';
import { AddTaskModal } from './AddTaskModal';
import { TaskHelpModal } from './TaskHelpModal';
import { ProcessAllButton } from './ProcessAllButton';
import type { RalphTaskStatus } from '@shared/types';

interface TaskBoardViewProps {
  projectId: string;
}

const COLUMNS: { id: RalphTaskStatus; title: string }[] = [
  { id: 'todo', title: 'Por hacer' },
  { id: 'doing', title: 'Haciendo' },
  { id: 'done', title: 'Completado' },
];

export function TaskBoardView({ projectId }: TaskBoardViewProps) {
  const { loadTasks, isLoading, error, helpRequestTask, helpRequestReason, isProcessingAll } =
    useRalphTaskStore();
  const [showAddModal, setShowAddModal] = useState(false);

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
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
        <AddTaskModal projectId={projectId} onClose={() => setShowAddModal(false)} />
      )}
      {helpRequestTask && helpRequestReason && (
        <TaskHelpModal task={helpRequestTask} reason={helpRequestReason} />
      )}
    </div>
  );
}
