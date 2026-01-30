import { useState } from 'react';
import { useRalphTaskStore } from '../../stores/ralphTaskStore';
import { TaskCardActions } from './TaskCardActions';
import type { RalphTask } from '@shared/types';

interface TaskCardProps {
  task: RalphTask;
}

export function TaskCard({ task }: TaskCardProps) {
  const { deleteTask, updateTask } = useRalphTaskStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(task.name);
  const [editDescription, setEditDescription] = useState(task.description || '');

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.setData('status', task.status);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSave = async () => {
    if (editName.trim()) {
      await updateTask(task.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditName(task.name);
    setEditDescription(task.description || '');
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this task?')) {
      await deleteTask(task.id);
    }
  };

  return (
    <div
      draggable={!isEditing}
      onDragStart={handleDragStart}
      className={`
        bg-white dark:bg-neutral-800 rounded shadow-sm border
        ${task.isPaused ? 'border-yellow-400 dark:border-yellow-600' : 'border-gray-200 dark:border-neutral-700'}
        ${task.status === 'doing' && !task.isPaused ? 'ring-2 ring-blue-400' : ''}
        cursor-grab active:cursor-grabbing
        transition-all hover:shadow-md
      `}
    >
      {isEditing ? (
        <div className="p-3 space-y-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-700 dark:border-neutral-600 dark:text-white"
            autoFocus
          />
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-700 dark:border-neutral-600 dark:text-white resize-none"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-2 py-1 text-xs bg-sky-500 text-white rounded hover:bg-sky-600"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2">
              {task.name}
            </h4>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                onClick={handleDelete}
                className="p-1 text-gray-400 hover:text-red-500"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Status indicators */}
          <div className="mt-2 flex items-center gap-2 text-xs">
            {task.loopCount > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-neutral-700 rounded text-gray-600 dark:text-gray-400">
                Loop #{task.loopCount}
              </span>
            )}
            {task.isPaused && (
              <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 rounded text-yellow-700 dark:text-yellow-400">
                Paused
              </span>
            )}
            {task.status === 'doing' && task.instanceId && !task.isPaused && (
              <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-700 dark:text-blue-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                Running
              </span>
            )}
          </div>

          {/* Completion summary */}
          {task.status === 'done' && task.completionSummary && (
            <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700 dark:text-green-400">
              {task.completionSummary}
            </div>
          )}

          {/* Pause reason */}
          {task.isPaused && task.pauseReason && (
            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-700 dark:text-yellow-400">
              {task.pauseReason}
            </div>
          )}

          {/* Actions */}
          <TaskCardActions task={task} />
        </div>
      )}
    </div>
  );
}
