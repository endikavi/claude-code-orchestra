import { create } from 'zustand';
import type { TrackedTask, TaskStatus } from '@shared/types';

interface TaskState {
  // State
  tasksByInstance: Record<string, TrackedTask[]>;
  isLoading: boolean;
  error: string | null;

  // Task operations
  loadTasks: (instanceId: string) => Promise<void>;
  loadAllTasks: () => Promise<void>;
  handleTaskCreated: (instanceId: string, task: TrackedTask) => void;
  handleTaskUpdated: (instanceId: string, task: TrackedTask) => void;
  handleTaskList: (instanceId: string, tasks: TrackedTask[]) => void;
  clearInstanceTasks: (instanceId: string) => void;

  // Selectors
  getTasksForInstance: (instanceId: string) => TrackedTask[];
  getInstancesWithTasks: () => string[];
  getPendingCount: (instanceId: string) => number;
  getInProgressCount: (instanceId: string) => number;
  getCompletedCount: (instanceId: string) => number;
  getTotalTasks: () => number;
  getTotalPending: () => number;
  getTotalInProgress: () => number;
  getTotalCompleted: () => number;
  getTasksByStatus: (instanceId: string, status: TaskStatus) => TrackedTask[];
  getAllTasksSorted: () => TrackedTask[];
}

export const useTaskStore = create<TaskState>((set, get) => ({
  // Initial state
  tasksByInstance: {},
  isLoading: false,
  error: null,

  // Load tasks for a specific instance
  loadTasks: async (instanceId: string) => {
    // Check if electronAPI.task is available
    if (!window.electronAPI?.task) {
      return;
    }
    try {
      const tasks = await window.electronAPI.task.getByInstance(instanceId);
      set((state) => ({
        tasksByInstance: {
          ...state.tasksByInstance,
          [instanceId]: tasks,
        },
      }));
    } catch (error) {
      console.error('Failed to load tasks for instance:', instanceId, error);
    }
  },

  // Load all tasks from all instances
  loadAllTasks: async () => {
    // Check if electronAPI.task is available
    if (!window.electronAPI?.task) {
      set({ isLoading: false });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const allTasks = await window.electronAPI.task.getAll();
      // Group by parentInstanceId
      const grouped: Record<string, TrackedTask[]> = {};
      for (const task of allTasks) {
        if (!grouped[task.parentInstanceId]) {
          grouped[task.parentInstanceId] = [];
        }
        grouped[task.parentInstanceId].push(task);
      }
      set({ tasksByInstance: grouped, isLoading: false });
    } catch (error) {
      console.error('Failed to load all tasks:', error);
      set({ error: 'Failed to load tasks', isLoading: false });
    }
  },

  // Handle task created event
  handleTaskCreated: (instanceId: string, task: TrackedTask) => {
    set((state) => {
      const existing = state.tasksByInstance[instanceId] || [];
      // Avoid duplicates
      if (existing.some((t) => t.id === task.id)) {
        return state;
      }
      return {
        tasksByInstance: {
          ...state.tasksByInstance,
          [instanceId]: [...existing, task],
        },
      };
    });
  },

  // Handle task updated event
  handleTaskUpdated: (instanceId: string, task: TrackedTask) => {
    set((state) => {
      const existing = state.tasksByInstance[instanceId] || [];
      const index = existing.findIndex((t) => t.id === task.id);
      if (index === -1) {
        // Task not found, add it
        return {
          tasksByInstance: {
            ...state.tasksByInstance,
            [instanceId]: [...existing, task],
          },
        };
      }
      // Update existing task
      return {
        tasksByInstance: {
          ...state.tasksByInstance,
          [instanceId]: existing.map((t) => (t.id === task.id ? task : t)),
        },
      };
    });
  },

  // Handle task list sync event
  handleTaskList: (instanceId: string, tasks: TrackedTask[]) => {
    set((state) => ({
      tasksByInstance: {
        ...state.tasksByInstance,
        [instanceId]: tasks,
      },
    }));
  },

  // Clear tasks for an instance (when instance is killed/removed)
  clearInstanceTasks: (instanceId: string) => {
    set((state) => {
      const { [instanceId]: _, ...rest } = state.tasksByInstance;
      return { tasksByInstance: rest };
    });
  },

  // Get tasks for a specific instance
  getTasksForInstance: (instanceId: string) => {
    return get().tasksByInstance[instanceId] || [];
  },

  // Get all instance IDs that have tasks
  getInstancesWithTasks: () => {
    const { tasksByInstance } = get();
    return Object.keys(tasksByInstance).filter((id) => tasksByInstance[id].length > 0);
  },

  // Get pending task count for an instance
  getPendingCount: (instanceId: string) => {
    const tasks = get().tasksByInstance[instanceId] || [];
    return tasks.filter((t) => t.status === 'pending').length;
  },

  // Get in progress task count for an instance
  getInProgressCount: (instanceId: string) => {
    const tasks = get().tasksByInstance[instanceId] || [];
    return tasks.filter((t) => t.status === 'in_progress').length;
  },

  // Get completed task count for an instance
  getCompletedCount: (instanceId: string) => {
    const tasks = get().tasksByInstance[instanceId] || [];
    return tasks.filter((t) => t.status === 'completed').length;
  },

  // Get total tasks across all instances
  getTotalTasks: () => {
    const { tasksByInstance } = get();
    return Object.values(tasksByInstance).reduce((sum, tasks) => sum + tasks.length, 0);
  },

  // Get total pending tasks across all instances
  getTotalPending: () => {
    const { tasksByInstance } = get();
    return Object.values(tasksByInstance).reduce(
      (sum, tasks) => sum + tasks.filter((t) => t.status === 'pending').length,
      0
    );
  },

  // Get total in progress tasks across all instances
  getTotalInProgress: () => {
    const { tasksByInstance } = get();
    return Object.values(tasksByInstance).reduce(
      (sum, tasks) => sum + tasks.filter((t) => t.status === 'in_progress').length,
      0
    );
  },

  // Get total completed tasks across all instances
  getTotalCompleted: () => {
    const { tasksByInstance } = get();
    return Object.values(tasksByInstance).reduce(
      (sum, tasks) => sum + tasks.filter((t) => t.status === 'completed').length,
      0
    );
  },

  // Get tasks by status for an instance
  getTasksByStatus: (instanceId: string, status: TaskStatus) => {
    const tasks = get().tasksByInstance[instanceId] || [];
    return tasks.filter((t) => t.status === status);
  },

  // Get all tasks sorted by status (in_progress first, then pending, then completed)
  // and within each group by updatedAt (most recent first)
  getAllTasksSorted: () => {
    const { tasksByInstance } = get();
    const allTasks = Object.values(tasksByInstance).flat();

    // Sort by status priority then by updatedAt
    const statusPriority: Record<TaskStatus, number> = {
      in_progress: 0,
      pending: 1,
      completed: 2,
    };

    return allTasks.sort((a, b) => {
      const statusDiff = statusPriority[a.status] - statusPriority[b.status];
      if (statusDiff !== 0) return statusDiff;
      return b.updatedAt - a.updatedAt;
    });
  },
}));

// Setup event listeners for task events
export function setupTaskEventListeners(): () => void {
  const store = useTaskStore.getState();

  // Check if electronAPI and task are available (not available in web-only mode)
  if (!window.electronAPI?.task) {
    return () => {
      // No-op cleanup
    };
  }

  // Task event listeners
  const unsubTaskCreated = window.electronAPI.task.onCreated((instanceId, task) => {
    store.handleTaskCreated(instanceId, task);
  });

  const unsubTaskUpdated = window.electronAPI.task.onUpdated((instanceId, task) => {
    store.handleTaskUpdated(instanceId, task);
  });

  const unsubTaskList = window.electronAPI.task.onList((instanceId, tasks) => {
    store.handleTaskList(instanceId, tasks);
  });

  // Load initial data
  void store.loadAllTasks();

  // Return cleanup function
  return () => {
    unsubTaskCreated();
    unsubTaskUpdated();
    unsubTaskList();
  };
}
