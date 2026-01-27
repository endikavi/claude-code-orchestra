import { useState, useRef, useEffect } from 'react';
import { useRalphTaskStore } from '../../stores/ralphTaskStore';
import type { RalphTask } from '@shared/types';

interface TaskCardActionsProps {
  task: RalphTask;
}

export function TaskCardActions({ task }: TaskCardActionsProps) {
  const { startTask, stopTask, moveTask } = useRalphTaskStore();
  const [showStartMenu, setShowStartMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowStartMenu(false);
      }
    };

    if (showStartMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showStartMenu]);

  const handleStart = async (isInteractive: boolean) => {
    setShowStartMenu(false);
    await startTask(task.id, isInteractive);
  };

  const handleStop = async () => {
    await stopTask(task.id);
  };

  const handleMoveToDone = async () => {
    await moveTask({ id: task.id, newStatus: 'done' });
  };

  const handleMoveToTodo = async () => {
    await moveTask({ id: task.id, newStatus: 'todo' });
  };

  // Don't show actions for completed tasks (unless we want to move them back)
  if (task.status === 'done') {
    return (
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={handleMoveToTodo}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Move back to Todo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
      {task.status === 'todo' && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowStartMenu(!showStartMenu)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            Start
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showStartMenu && (
            <div className="absolute left-0 bottom-full mb-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] z-50">
              <button
                onClick={() => handleStart(true)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <div>
                  <div className="font-medium">Interactive</div>
                  <div className="text-xs text-gray-500">Show terminal UI</div>
                </div>
              </button>
              <button
                onClick={() => handleStart(false)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4 text-purple-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
                <div>
                  <div className="font-medium">Background</div>
                  <div className="text-xs text-gray-500">Run silently</div>
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {task.status === 'doing' && (
        <>
          {task.isPaused ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowStartMenu(!showStartMenu)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                Resume
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {showStartMenu && (
                <div className="absolute left-0 bottom-full mb-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] z-50">
                  <button
                    onClick={() => handleStart(true)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4 text-blue-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <div>
                      <div className="font-medium">Interactive</div>
                      <div className="text-xs text-gray-500">Show terminal UI</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleStart(false)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4 text-purple-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      />
                    </svg>
                    <div>
                      <div className="font-medium">Background</div>
                      <div className="text-xs text-gray-500">Run silently</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              Stop
            </button>
          )}

          <button
            onClick={handleMoveToDone}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Done
          </button>
        </>
      )}
    </div>
  );
}
