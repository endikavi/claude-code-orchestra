/**
 * TaskFileWatcher - Watches Claude Code's task files for changes
 *
 * Claude Code stores tasks in ~/.claude/tasks/<task-list-id>/
 * where task-list-id defaults to the session ID.
 *
 * Each task is stored as a separate JSON file: 1.json, 2.json, etc.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { TaskStatus, TrackedTask } from '@shared/types/tasks';

// Polling interval for directory changes (ms)
const POLL_INTERVAL = 500;

// Task file structure as stored by Claude Code
interface ClaudeTaskFile {
  id: string;
  subject: string;
  description?: string;
  activeForm?: string;
  status: 'pending' | 'in_progress' | 'completed';
  blocks?: string[];
  blockedBy?: string[];
  owner?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Validate that a status value is a valid TaskStatus
 */
function isValidTaskStatus(status: unknown): status is TaskStatus {
  return status === 'pending' || status === 'in_progress' || status === 'completed';
}

/**
 * Compare two string arrays for equality
 */
function arraysEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

/**
 * Get the Claude tasks directory
 */
export function getClaudeTasksDir(): string {
  return path.join(homedir(), '.claude', 'tasks');
}

/**
 * Get the task list directory for a specific task list ID (usually session ID)
 */
export function getTaskListDir(taskListId: string): string {
  return path.join(getClaudeTasksDir(), taskListId);
}

export class TaskFileWatcher extends EventEmitter {
  private taskListId: string | null = null;
  private taskListDir: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private isWatching: boolean = false;
  private knownTasks: Map<string, ClaudeTaskFile> = new Map();
  private lastModifiedTimes: Map<string, number> = new Map();
  private taskCreatedTimes: Map<string, number> = new Map();
  private instanceId: string;

  constructor(instanceId: string, taskListId?: string) {
    super();
    this.instanceId = instanceId;
    if (taskListId) {
      this.setTaskListId(taskListId);
    }
  }

  /**
   * Set the task list ID to watch (usually the session ID)
   */
  setTaskListId(taskListId: string): void {
    // Stop watching old task list if any
    if (this.isWatching && this.taskListId !== taskListId) {
      this.stopWatching();
    }

    this.taskListId = taskListId;
    this.taskListDir = getTaskListDir(taskListId);
    this.knownTasks.clear();
    this.lastModifiedTimes.clear();
    this.taskCreatedTimes.clear();
  }

  /**
   * Start watching the task directory for changes
   */
  start(): void {
    if (this.isWatching) {
      return;
    }

    if (!this.taskListId || !this.taskListDir) {
      return;
    }

    this.isWatching = true;
    this.startPolling();
    this.emit('ready');
  }

  /**
   * Stop watching
   */
  stop(): void {
    this.stopWatching();
    this.emit('close');
  }

  private stopWatching(): void {
    this.isWatching = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Start polling the directory for changes
   */
  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      this.checkForChanges();
    }, POLL_INTERVAL);

    // Also check immediately
    this.checkForChanges();
  }

  /**
   * Check if task files have changed
   */
  private checkForChanges(): void {
    if (!this.taskListDir || !this.isWatching) return;

    try {
      // Check if directory exists
      if (!fs.existsSync(this.taskListDir)) {
        return;
      }

      // Get all .json files in the directory
      const files = fs.readdirSync(this.taskListDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== '.lock');

      // Track which tasks we've seen
      const seenTasks = new Set<string>();

      for (const file of jsonFiles) {
        const filePath = path.join(this.taskListDir, file);
        const taskId = file.replace('.json', '');
        seenTasks.add(taskId);

        try {
          const stats = fs.statSync(filePath);
          const lastModified = stats.mtimeMs;
          const previousModified = this.lastModifiedTimes.get(taskId);

          // Check if file is new or modified
          if (previousModified === undefined || lastModified > previousModified) {
            this.lastModifiedTimes.set(taskId, lastModified);
            this.processTaskFile(filePath, taskId, previousModified === undefined);
          }
        } catch {
          // File might have been deleted, ignore
        }
      }

      // Check for deleted tasks
      for (const [taskId] of this.knownTasks) {
        if (!seenTasks.has(taskId)) {
          this.knownTasks.delete(taskId);
          this.lastModifiedTimes.delete(taskId);
          this.taskCreatedTimes.delete(taskId);
          this.emit('task_deleted', { taskId, instanceId: this.instanceId });
        }
      }
    } catch {
      // Directory might not exist yet, ignore
    }
  }

  /**
   * Convert ClaudeTaskFile to TrackedTask format
   */
  private toTrackedTask(taskData: ClaudeTaskFile, createdAt: number): TrackedTask {
    return {
      id: taskData.id,
      parentInstanceId: this.instanceId,
      subject: taskData.subject,
      description: taskData.description || '',
      activeForm: taskData.activeForm,
      status: isValidTaskStatus(taskData.status) ? taskData.status : 'pending',
      owner: taskData.owner,
      blocks: taskData.blocks,
      blockedBy: taskData.blockedBy,
      metadata: taskData.metadata,
      createdAt,
      updatedAt: Date.now(),
    };
  }

  /**
   * Process a task file and emit appropriate events
   */
  private processTaskFile(filePath: string, taskId: string, isNew: boolean): void {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const taskData = JSON.parse(content) as ClaudeTaskFile;

      const previousTask = this.knownTasks.get(taskId);
      this.knownTasks.set(taskId, taskData);

      // Track createdAt - only set on first encounter, preserve afterwards
      if (isNew) {
        this.taskCreatedTimes.set(taskId, Date.now());
      }
      const createdAt = this.taskCreatedTimes.get(taskId) ?? Date.now();

      // Convert to TrackedTask format
      const trackedTask = this.toTrackedTask(taskData, createdAt);

      if (isNew) {
        this.emit('task_created', { task: trackedTask, instanceId: this.instanceId });
      } else if (previousTask) {
        // Check if anything changed
        if (
          previousTask.status !== taskData.status ||
          previousTask.subject !== taskData.subject ||
          previousTask.description !== taskData.description ||
          previousTask.activeForm !== taskData.activeForm ||
          previousTask.owner !== taskData.owner ||
          !arraysEqual(previousTask.blocks, taskData.blocks) ||
          !arraysEqual(previousTask.blockedBy, taskData.blockedBy)
        ) {
          this.emit('task_updated', { task: trackedTask, instanceId: this.instanceId });
        }
      }
    } catch (error) {
      console.error(`[TaskFileWatcher] Error reading task file ${filePath}:`, error);
      this.emit('error', error);
    }
  }

  /**
   * Get all current tasks
   */
  getAllTasks(): TrackedTask[] {
    const tasks: TrackedTask[] = [];
    for (const [taskId, taskData] of this.knownTasks) {
      const createdAt = this.taskCreatedTimes.get(taskId) ?? Date.now();
      tasks.push(this.toTrackedTask(taskData, createdAt));
    }
    return tasks;
  }

  /**
   * Get current task list ID
   */
  getTaskListId(): string | null {
    return this.taskListId;
  }

  /**
   * Check if the watcher is currently active
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

/**
 * Factory function to create a TaskFileWatcher
 */
export function createTaskFileWatcher(instanceId: string, taskListId?: string): TaskFileWatcher {
  return new TaskFileWatcher(instanceId, taskListId);
}
