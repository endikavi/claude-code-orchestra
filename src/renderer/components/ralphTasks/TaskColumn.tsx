import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRalphTaskStore } from '../../stores/ralphTaskStore';
import { useUIStore } from '../../stores/uiStore';
import { TaskCard } from './TaskCard';
import type { RalphTaskStatus } from '@shared/types';

interface TaskColumnProps {
  status: RalphTaskStatus;
  title: string;
  projectId: string;
}

const STATUS_COLORS: Record<RalphTaskStatus, string> = {
  todo: 'bg-gray-100 dark:bg-neutral-800',
  doing: 'bg-blue-50 dark:bg-blue-900/20',
  done: 'bg-green-50 dark:bg-green-900/20',
};

const HEADER_COLORS: Record<RalphTaskStatus, string> = {
  todo: 'text-gray-700 dark:text-gray-300',
  doing: 'text-blue-700 dark:text-blue-300',
  done: 'text-green-700 dark:text-green-300',
};

interface DropMenuState {
  visible: boolean;
  taskId: string | null;
}

export function TaskColumn({ status, title, projectId: _projectId }: TaskColumnProps) {
  const { getTasksByStatus, moveTask, startTask, getTaskPrompt } = useRalphTaskStore();
  const setShowInstanceModal = useUIStore((s) => s.setShowInstanceModal);
  const tasks = getTasksByStatus(status);
  const [dropMenu, setDropMenu] = useState<DropMenuState>({ visible: false, taskId: null });
  const [copied, setCopied] = useState(false);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const sourceStatus = e.dataTransfer.getData('status') as RalphTaskStatus;

    if (taskId && sourceStatus !== status) {
      if (status === 'doing') {
        // Show the start mode menu instead of auto-launching
        setDropMenu({ visible: true, taskId });
      } else {
        await moveTask({ id: taskId, newStatus: status });
      }
    }
  };

  const closeMenu = () => setDropMenu({ visible: false, taskId: null });

  const handleStartInteractive = async () => {
    if (!dropMenu.taskId) return;
    const taskId = dropMenu.taskId;
    closeMenu();
    await startTask(taskId, true);
  };

  const handleStartBackground = async () => {
    if (!dropMenu.taskId) return;
    const taskId = dropMenu.taskId;
    closeMenu();
    await startTask(taskId, false);
  };

  const handleCopyPrompt = async () => {
    if (!dropMenu.taskId) return;
    const taskId = dropMenu.taskId;
    // Move the task to doing first (without starting the loop)
    await moveTask({ id: taskId, newStatus: 'doing' });
    // Get the prompt and copy to clipboard
    const prompt = await getTaskPrompt(taskId);
    if (prompt) {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    closeMenu();
    // Open the new instance modal so the user can configure it
    setShowInstanceModal(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div
      className={`flex flex-col w-80 min-w-80 rounded ${STATUS_COLORS[status]}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header */}
      <div
        className={`px-3 py-2 font-medium ${HEADER_COLORS[status]} border-b border-gray-200 dark:border-neutral-700`}
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

      {/* Drop action menu rendered via portal to avoid overflow clipping */}
      {dropMenu.visible &&
        status === 'doing' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20"
            onClick={closeMenu}
          >
            <div
              className="bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-600 py-2 min-w-[240px] animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-100 dark:border-neutral-700 mb-1">
                Iniciar tarea
              </div>
              <button
                onClick={handleStartInteractive}
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
                onClick={handleStartBackground}
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
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Ejecutar en segundo plano
                  </div>
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
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
