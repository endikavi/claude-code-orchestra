import { useRalphTaskStore } from '../../stores/ralphTaskStore';
import { TaskCard } from './TaskCard';
import type { RalphTaskStatus } from '@shared/types';

interface TaskColumnProps {
  status: RalphTaskStatus;
  title: string;
  projectId: string;
}

const STATUS_COLORS: Record<RalphTaskStatus, string> = {
  todo: 'bg-gray-100 dark:bg-gray-800',
  doing: 'bg-blue-50 dark:bg-blue-900/20',
  done: 'bg-green-50 dark:bg-green-900/20',
};

const HEADER_COLORS: Record<RalphTaskStatus, string> = {
  todo: 'text-gray-700 dark:text-gray-300',
  doing: 'text-blue-700 dark:text-blue-300',
  done: 'text-green-700 dark:text-green-300',
};

export function TaskColumn({ status, title, projectId: _projectId }: TaskColumnProps) {
  const { getTasksByStatus, moveTask, startTask } = useRalphTaskStore();
  const tasks = getTasksByStatus(status);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const sourceStatus = e.dataTransfer.getData('status') as RalphTaskStatus;

    if (taskId && sourceStatus !== status) {
      // When dropping to "doing" column, start the task in background mode
      if (status === 'doing') {
        await startTask(taskId, false); // false = background mode
      } else {
        await moveTask({ id: taskId, newStatus: status });
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div
      className={`flex flex-col w-80 min-w-80 rounded-lg ${STATUS_COLORS[status]}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header */}
      <div
        className={`px-3 py-2 font-medium ${HEADER_COLORS[status]} border-b border-gray-200 dark:border-gray-700`}
      >
        <div className="flex items-center justify-between">
          <span>{title}</span>
          <span className="text-sm opacity-60">{tasks.length}</span>
        </div>
      </div>

      {/* Tasks */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px]">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
            No hay tareas
          </div>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
