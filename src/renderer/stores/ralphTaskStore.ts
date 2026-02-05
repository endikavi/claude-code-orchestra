import { create } from 'zustand';
import type {
  RalphTask,
  RalphTaskStatus,
  CreateRalphTaskInput,
  UpdateRalphTaskInput,
  MoveRalphTaskInput,
  RalphTaskHelpRequest,
} from '@shared/types';

interface RalphTaskState {
  // State
  tasks: RalphTask[];
  isLoading: boolean;
  error: string | null;
  helpRequestTask: RalphTask | null; // Task that is requesting help (for modal)
  helpRequestReason: string | null;
  isProcessingAll: boolean;

  // Actions
  loadTasks: (projectId: string) => Promise<void>;
  createTask: (input: CreateRalphTaskInput) => Promise<RalphTask | null>;
  updateTask: (id: string, updates: UpdateRalphTaskInput) => Promise<RalphTask | null>;
  deleteTask: (id: string) => Promise<boolean>;
  moveTask: (input: MoveRalphTaskInput) => Promise<RalphTask | null>;
  startTask: (id: string, isInteractive?: boolean) => Promise<RalphTask | null>;
  stopTask: (id: string) => Promise<RalphTask | null>;
  getTaskPrompt: (id: string) => Promise<string | null>;
  respondToHelp: (taskId: string, response: string) => Promise<RalphTask | null>;
  processAll: (projectId: string) => Promise<void>;
  stopAll: (projectId: string) => Promise<void>;
  reorderTasks: (
    projectId: string,
    tasks: Array<{ id: string; status: RalphTaskStatus; orderIndex: number }>
  ) => Promise<void>;
  clearHelpRequest: () => void;
  clearError: () => void;

  // Selectors
  getTasksByStatus: (status: RalphTaskStatus) => RalphTask[];
  getTaskById: (id: string) => RalphTask | undefined;

  // Internal - for event handlers
  _handleTaskCreated: (task: RalphTask) => void;
  _handleTaskUpdated: (task: RalphTask) => void;
  _handleTaskDeleted: (taskId: string) => void;
  _handleHelpRequested: (request: RalphTaskHelpRequest) => void;
  _setProcessingAll: (isProcessing: boolean) => void;
}

export const useRalphTaskStore = create<RalphTaskState>((set, get) => ({
  // Initial state
  tasks: [],
  isLoading: false,
  error: null,
  helpRequestTask: null,
  helpRequestReason: null,
  isProcessingAll: false,

  // Load tasks for a project
  loadTasks: async (projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await window.electronAPI.ralphTask.getByProject(projectId);
      set({ tasks, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load tasks';
      set({ error: message, isLoading: false });
    }
  },

  // Create a new task
  createTask: async (input: CreateRalphTaskInput) => {
    try {
      const task = await window.electronAPI.ralphTask.create(input);
      // Task will be added via event handler
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create task';
      set({ error: message });
      return null;
    }
  },

  // Update a task
  updateTask: async (id: string, updates: UpdateRalphTaskInput) => {
    try {
      const task = await window.electronAPI.ralphTask.update(id, updates);
      // Task will be updated via event handler
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update task';
      set({ error: message });
      return null;
    }
  },

  // Delete a task
  deleteTask: async (id: string) => {
    try {
      const success = await window.electronAPI.ralphTask.delete(id);
      // Task will be removed via event handler
      return success;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete task';
      set({ error: message });
      return false;
    }
  },

  // Move a task to a new status
  moveTask: async (input: MoveRalphTaskInput) => {
    try {
      const task = await window.electronAPI.ralphTask.move(input);
      // Task will be updated via event handler
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move task';
      set({ error: message });
      return null;
    }
  },

  // Start a task (begin loop)
  // isInteractive: true = show terminal UI, false = run in background
  startTask: async (id: string, isInteractive?: boolean) => {
    try {
      const task = await window.electronAPI.ralphTask.start(id, isInteractive);
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start task';
      set({ error: message });
      return null;
    }
  },

  // Get the generated prompt for a task
  getTaskPrompt: async (id: string) => {
    try {
      return await window.electronAPI.ralphTask.getPrompt(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get task prompt';
      set({ error: message });
      return null;
    }
  },

  // Stop a task (stop loop)
  stopTask: async (id: string) => {
    try {
      const task = await window.electronAPI.ralphTask.stop(id);
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop task';
      set({ error: message });
      return null;
    }
  },

  // Respond to a help request
  respondToHelp: async (taskId: string, response: string) => {
    try {
      const task = await window.electronAPI.ralphTask.respondToHelp(taskId, response);
      set({ helpRequestTask: null, helpRequestReason: null });
      return task;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to respond to help';
      set({ error: message });
      return null;
    }
  },

  // Process all pending tasks
  processAll: async (projectId: string) => {
    try {
      set({ isProcessingAll: true });
      await window.electronAPI.ralphTask.processAll(projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start processing';
      set({ error: message, isProcessingAll: false });
    }
  },

  // Stop processing all tasks
  stopAll: async (projectId: string) => {
    try {
      await window.electronAPI.ralphTask.stopAll(projectId);
      set({ isProcessingAll: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop processing';
      set({ error: message });
    }
  },

  // Reorder tasks (for drag-drop)
  reorderTasks: async (
    projectId: string,
    tasks: Array<{ id: string; status: RalphTaskStatus; orderIndex: number }>
  ) => {
    try {
      const updatedTasks = await window.electronAPI.ralphTask.reorder({ projectId, tasks });
      set({ tasks: updatedTasks });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder tasks';
      set({ error: message });
    }
  },

  // Clear help request modal
  clearHelpRequest: () => {
    set({ helpRequestTask: null, helpRequestReason: null });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Selectors
  getTasksByStatus: (status: RalphTaskStatus) => {
    return get()
      .tasks.filter((task) => task.status === status)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  },

  getTaskById: (id: string) => {
    return get().tasks.find((task) => task.id === id);
  },

  // Internal event handlers
  _handleTaskCreated: (task: RalphTask) => {
    set((state) => ({
      tasks: [...state.tasks, task],
    }));
  },

  _handleTaskUpdated: (task: RalphTask) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
      // Clear help request if task is no longer paused
      helpRequestTask:
        state.helpRequestTask?.id === task.id && !task.isPaused ? null : state.helpRequestTask,
      helpRequestReason:
        state.helpRequestTask?.id === task.id && !task.isPaused ? null : state.helpRequestReason,
    }));
  },

  _handleTaskDeleted: (taskId: string) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
      helpRequestTask: state.helpRequestTask?.id === taskId ? null : state.helpRequestTask,
      helpRequestReason: state.helpRequestTask?.id === taskId ? null : state.helpRequestReason,
    }));
  },

  _handleHelpRequested: (request: RalphTaskHelpRequest) => {
    const task = get().tasks.find((t) => t.id === request.taskId);
    if (task) {
      set({
        helpRequestTask: task,
        helpRequestReason: request.reason,
      });
    }
  },

  _setProcessingAll: (isProcessing: boolean) => {
    set({ isProcessingAll: isProcessing });
  },
}));

/**
 * Setup event listeners for Ralph task events
 * Call this once when the app initializes
 */
export function setupRalphTaskEventListeners(): () => void {
  const store = useRalphTaskStore.getState();

  const unsubCreated = window.electronAPI.ralphTask.onCreated((task) => {
    store._handleTaskCreated(task);
  });

  const unsubUpdated = window.electronAPI.ralphTask.onUpdated((task) => {
    store._handleTaskUpdated(task);
  });

  const unsubDeleted = window.electronAPI.ralphTask.onDeleted((taskId) => {
    store._handleTaskDeleted(taskId);
  });

  const unsubHelp = window.electronAPI.ralphTask.onHelpRequested((request) => {
    store._handleHelpRequested(request);
  });

  const unsubProcessAllStarted = window.electronAPI.ralphTask.onProcessAllStarted(() => {
    store._setProcessingAll(true);
  });

  const unsubProcessAllCompleted = window.electronAPI.ralphTask.onProcessAllCompleted(() => {
    store._setProcessingAll(false);
  });

  const unsubProcessAllStopped = window.electronAPI.ralphTask.onProcessAllStopped(() => {
    store._setProcessingAll(false);
  });

  // Return cleanup function
  return () => {
    unsubCreated();
    unsubUpdated();
    unsubDeleted();
    unsubHelp();
    unsubProcessAllStarted();
    unsubProcessAllCompleted();
    unsubProcessAllStopped();
  };
}
