import { EventEmitter } from 'events';
import type {
  TrackedTask,
  TaskStartedEvent,
  TaskUpdatedEvent,
  TaskListEvent,
} from '@shared/types/tasks';

/**
 * Tracks Claude Code tasks (TaskCreate/TaskUpdate/TaskList tools) per instance.
 * This is a passive observer that doesn't interfere with Claude's operation.
 */
export class TaskTracker extends EventEmitter {
  // Map of instanceId -> Map of taskId -> TrackedTask
  private tasks = new Map<string, Map<string, TrackedTask>>();
  // Track which task IDs belong to which instances
  private taskToInstance = new Map<string, string>();

  /**
   * Record a new task being created via TaskCreate
   */
  createTask(instanceId: string, data: TaskStartedEvent): TrackedTask {
    // Ensure the instance map exists
    if (!this.tasks.has(instanceId)) {
      this.tasks.set(instanceId, new Map());
    }

    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      throw new Error(`Failed to create task map for instance ${instanceId}`);
    }

    const now = Date.now();
    const task: TrackedTask = {
      id: data.id,
      parentInstanceId: instanceId,
      subject: data.subject,
      description: data.description,
      activeForm: data.activeForm,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    instanceTasks.set(data.id, task);
    this.taskToInstance.set(data.id, instanceId);

    console.log(
      `[TaskTracker] Created task "${data.subject}" (${data.id}) for instance ${instanceId}`
    );

    return task;
  }

  /**
   * Update a task via TaskUpdate
   */
  updateTask(instanceId: string, data: TaskUpdatedEvent): TrackedTask | null {
    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      // Try to find the task by ID across all instances
      return this.updateTaskById(data);
    }

    const task = instanceTasks.get(data.id);
    if (!task) {
      // Task not found in this instance, try by ID
      return this.updateTaskById(data);
    }

    return this.applyTaskUpdate(task, data);
  }

  /**
   * Update a task by ID when we don't know the instance
   */
  private updateTaskById(data: TaskUpdatedEvent): TrackedTask | null {
    const instanceId = this.taskToInstance.get(data.id);
    if (!instanceId) {
      console.log(`[TaskTracker] Task ${data.id} not found for update`);
      return null;
    }

    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      return null;
    }

    const task = instanceTasks.get(data.id);
    if (!task) {
      return null;
    }

    return this.applyTaskUpdate(task, data);
  }

  /**
   * Apply update data to a task
   */
  private applyTaskUpdate(task: TrackedTask, data: TaskUpdatedEvent): TrackedTask {
    task.updatedAt = Date.now();

    if (data.status !== undefined) {
      task.status = data.status;
    }
    if (data.subject !== undefined) {
      task.subject = data.subject;
    }
    if (data.description !== undefined) {
      task.description = data.description;
    }
    if (data.activeForm !== undefined) {
      task.activeForm = data.activeForm;
    }
    if (data.owner !== undefined) {
      task.owner = data.owner;
    }
    if (data.addBlocks && data.addBlocks.length > 0) {
      task.blocks = [...(task.blocks || []), ...data.addBlocks];
    }
    if (data.addBlockedBy && data.addBlockedBy.length > 0) {
      task.blockedBy = [...(task.blockedBy || []), ...data.addBlockedBy];
    }
    if (data.metadata !== undefined) {
      task.metadata = { ...(task.metadata || {}), ...data.metadata };
      // Remove null values (used for deletion)
      for (const key of Object.keys(task.metadata)) {
        if (task.metadata[key] === null) {
          delete task.metadata[key];
        }
      }
    }

    console.log(`[TaskTracker] Updated task "${task.subject}" (${task.id}) status=${task.status}`);

    return task;
  }

  /**
   * Sync task list from TaskList result
   * This updates existing tasks and adds any missing ones
   */
  syncTaskList(instanceId: string, event: TaskListEvent): TrackedTask[] {
    if (!this.tasks.has(instanceId)) {
      this.tasks.set(instanceId, new Map());
    }

    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      return [];
    }
    const syncedTasks: TrackedTask[] = [];
    const now = Date.now();

    for (const item of event.tasks) {
      let task = instanceTasks.get(item.id);

      if (task) {
        // Update existing task
        task.status = item.status;
        task.subject = item.subject;
        if (item.owner !== undefined) {
          task.owner = item.owner;
        }
        if (item.blockedBy !== undefined) {
          task.blockedBy = item.blockedBy;
        }
        task.updatedAt = now;
      } else {
        // Create new task from list item
        task = {
          id: item.id,
          parentInstanceId: instanceId,
          subject: item.subject,
          description: '', // Not available in list
          status: item.status,
          owner: item.owner,
          blockedBy: item.blockedBy,
          createdAt: now,
          updatedAt: now,
        };
        instanceTasks.set(item.id, task);
        this.taskToInstance.set(item.id, instanceId);
      }

      syncedTasks.push(task);
    }

    console.log(`[TaskTracker] Synced ${syncedTasks.length} tasks for instance ${instanceId}`);

    return syncedTasks;
  }

  /**
   * Get all tasks for an instance
   */
  getTasks(instanceId: string): TrackedTask[] {
    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      return [];
    }
    return Array.from(instanceTasks.values());
  }

  /**
   * Get all tasks across all instances
   */
  getAllTasks(): TrackedTask[] {
    const all: TrackedTask[] = [];
    for (const instanceTasks of this.tasks.values()) {
      all.push(...instanceTasks.values());
    }
    return all;
  }

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): TrackedTask | null {
    const instanceId = this.taskToInstance.get(taskId);
    if (!instanceId) {
      return null;
    }
    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      return null;
    }
    return instanceTasks.get(taskId) || null;
  }

  /**
   * Get task counts by status for an instance
   */
  getTaskCounts(instanceId: string): { pending: number; inProgress: number; completed: number } {
    const tasks = this.getTasks(instanceId);
    return {
      pending: tasks.filter((t) => t.status === 'pending').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    };
  }

  /**
   * Set a task directly (used by TaskFileWatcher which reads tasks from files)
   * This replaces the task if it exists, or creates it if it doesn't
   */
  setTask(instanceId: string, task: TrackedTask): TrackedTask {
    if (!this.tasks.has(instanceId)) {
      this.tasks.set(instanceId, new Map());
    }

    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      throw new Error(`Failed to create task map for instance ${instanceId}`);
    }

    instanceTasks.set(task.id, task);
    this.taskToInstance.set(task.id, instanceId);

    console.log(`[TaskTracker] Set task "${task.subject}" (${task.id}) for instance ${instanceId}`);

    return task;
  }

  /**
   * Delete a specific task by ID
   */
  deleteTask(instanceId: string, taskId: string): boolean {
    const instanceTasks = this.tasks.get(instanceId);
    if (!instanceTasks) {
      return false;
    }

    const deleted = instanceTasks.delete(taskId);
    if (deleted) {
      this.taskToInstance.delete(taskId);
      console.log(`[TaskTracker] Deleted task ${taskId} from instance ${instanceId}`);
    }

    return deleted;
  }

  /**
   * Clear all tasks for an instance (when instance is killed/completed)
   */
  clearTasks(instanceId: string): void {
    const instanceTasks = this.tasks.get(instanceId);
    if (instanceTasks) {
      // Clean up the reverse mapping
      for (const id of instanceTasks.keys()) {
        this.taskToInstance.delete(id);
      }
      this.tasks.delete(instanceId);
      console.log(`[TaskTracker] Cleared tasks for instance ${instanceId}`);
    }
  }

  /**
   * Get instances that have any tasks
   */
  getInstancesWithTasks(): string[] {
    const instanceIds: string[] = [];
    for (const [instanceId, tasks] of this.tasks.entries()) {
      if (tasks.size > 0) {
        instanceIds.push(instanceId);
      }
    }
    return instanceIds;
  }
}

// Singleton instance
let taskTracker: TaskTracker | null = null;

export function getTaskTracker(): TaskTracker {
  if (!taskTracker) {
    taskTracker = new TaskTracker();
  }
  return taskTracker;
}
