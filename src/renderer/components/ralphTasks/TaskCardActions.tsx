import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRalphTaskStore } from '../../stores/ralphTaskStore';
import { useUIStore } from '../../stores/uiStore';
import type { RalphTask } from '@shared/types';

interface TaskCardActionsProps {
  task: RalphTask;
}

export function TaskCardActions({ task }: TaskCardActionsProps) {
  const { startTask, stopTask, moveTask, getTaskPrompt } = useRalphTaskStore();
  const setShowInstanceModal = useUIStore((s) => s.setShowInstanceModal);
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Calculate menu position when opening
  useEffect(() => {
    if (showStartMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Position above the button, left-aligned
      setMenuPos({
        top: rect.top - 4,
        left: rect.left,
      });
    }
  }, [showStartMenu]);

  // Close menu when clicking outside (via portal backdrop)
  const closeMenu = () => {
    setShowStartMenu(false);
    setMenuPos(null);
  };

  const handleStart = async (isInteractive: boolean) => {
    closeMenu();
    await startTask(task.id, isInteractive);
  };

  const handleCopyPrompt = async () => {
    closeMenu();
    // If task is in todo, move to doing first
    if (task.status === 'todo') {
      await moveTask({ id: task.id, newStatus: 'doing' });
    }
    const prompt = await getTaskPrompt(task.id);
    if (prompt) {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    // Open the new instance modal
    setShowInstanceModal(true);
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
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-neutral-700">
        <button
          onClick={handleMoveToTodo}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Move back to Todo
        </button>
      </div>
    );
  }

  const startMenuContent = (
    <>
      <button
        onClick={() => handleStart(true)}
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-neutral-700 flex items-center gap-2"
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
          <div className="font-medium text-gray-800 dark:text-gray-100">Interactivo</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Mostrar terminal</div>
        </div>
      </button>
      <button
        onClick={() => handleStart(false)}
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-neutral-700 flex items-center gap-2"
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
          <div className="font-medium text-gray-800 dark:text-gray-100">Background</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Ejecutar en segundo plano</div>
        </div>
      </button>
      <div className="border-t border-gray-100 dark:border-neutral-700 mt-1 pt-1">
        <button
          onClick={handleCopyPrompt}
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-neutral-700 flex items-center gap-2"
        >
          <svg
            className="w-4 h-4 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {copied ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            )}
          </svg>
          <div>
            <div className="font-medium text-gray-800 dark:text-gray-100">
              {copied ? 'Copiado!' : 'Copiar prompt'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Copiar y abrir nueva instancia
            </div>
          </div>
        </button>
      </div>
    </>
  );

  // Render dropdown menu via portal to avoid overflow clipping
  const dropdownMenu =
    showStartMenu && menuPos
      ? createPortal(
          <div className="fixed inset-0 z-[100]" onClick={closeMenu}>
            <div
              className="absolute bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 py-1 min-w-[200px]"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                transform: 'translateY(-100%)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {startMenuContent}
            </div>
          </div>,
          document.body
        )
      : null;

  const startButton = (
    <button
      ref={buttonRef}
      onClick={() => setShowStartMenu(!showStartMenu)}
      className={`flex items-center gap-1 px-2 py-1 text-xs text-white rounded transition-colors ${
        task.status === 'doing'
          ? 'bg-green-500 hover:bg-green-600'
          : 'bg-blue-500 hover:bg-blue-600'
      }`}
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
      {task.status === 'doing' && task.isPaused ? 'Resume' : 'Start'}
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-neutral-700 flex items-center gap-2">
      {task.status === 'todo' && (
        <>
          {startButton}
          {dropdownMenu}
        </>
      )}

      {task.status === 'doing' && (
        <>
          {task.isPaused ? (
            <>
              {startButton}
              {dropdownMenu}
            </>
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
