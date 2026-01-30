import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { DataStore } from './DataStore';
import type {
  RalphTask,
  RalphTaskStatus,
  CreateRalphTaskInput,
  UpdateRalphTaskInput,
  MoveRalphTaskInput,
  ReorderRalphTasksInput,
} from '@shared/types/ralphTasks';

// Singleton instance
let instance: RalphTaskManager | null = null;

export class RalphTaskManager extends EventEmitter {
  private dataStore: DataStore;

  private constructor() {
    super();
    this.dataStore = DataStore.getInstance();
  }

  static getInstance(): RalphTaskManager {
    if (!instance) {
      instance = new RalphTaskManager();
    }
    return instance;
  }

  /**
   * Create a new Ralph task
   */
  createTask(input: CreateRalphTaskInput): RalphTask {
    const task = this.dataStore.createRalphTask(input);
    this.emit('taskCreated', task);
    return task;
  }

  /**
   * Update a Ralph task
   */
  updateTask(id: string, updates: UpdateRalphTaskInput): RalphTask | null {
    const task = this.dataStore.updateRalphTask(id, updates);
    if (task) {
      this.emit('taskUpdated', task);
    }
    return task;
  }

  /**
   * Delete a Ralph task
   */
  deleteTask(id: string): boolean {
    const task = this.dataStore.getRalphTaskById(id);
    if (!task) return false;

    // Clean up context file if exists
    this.deleteContextFile(task);

    this.dataStore.deleteRalphTask(id);
    this.emit('taskDeleted', id);
    return true;
  }

  /**
   * Get a Ralph task by ID
   */
  getTaskById(id: string): RalphTask | null {
    return this.dataStore.getRalphTaskById(id);
  }

  /**
   * Get all Ralph tasks for a project
   */
  getTasksByProject(projectId: string): RalphTask[] {
    return this.dataStore.getRalphTasksByProject(projectId);
  }

  /**
   * Get Ralph tasks by status
   */
  getTasksByStatus(projectId: string, status: RalphTaskStatus): RalphTask[] {
    return this.dataStore.getRalphTasksByStatus(projectId, status);
  }

  /**
   * Move a task to a new status (and optionally reorder)
   */
  moveTask(input: MoveRalphTaskInput): RalphTask | null {
    const task = this.dataStore.moveRalphTask(input.id, input.newStatus, input.newOrderIndex);
    if (task) {
      this.emit('taskUpdated', task);
    }
    return task;
  }

  /**
   * Reorder multiple tasks (batch update for drag-drop)
   */
  reorderTasks(input: ReorderRalphTasksInput): RalphTask[] {
    this.dataStore.reorderRalphTasks(input.tasks);
    return this.getTasksByProject(input.projectId);
  }

  /**
   * Get or create the context file path for a task
   */
  getContextFilePath(task: RalphTask, projectPath: string): string {
    const claudeDir = path.join(projectPath, '.claude');
    return path.join(claudeDir, `ralph-task-${task.id}.md`);
  }

  /**
   * Ensure the .claude directory exists
   */
  private ensureClaudeDir(projectPath: string): string {
    const claudeDir = path.join(projectPath, '.claude');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    return claudeDir;
  }

  /**
   * Create or update the context file for a task
   */
  createOrUpdateContextFile(
    task: RalphTask,
    projectPath: string,
    additionalContext?: string
  ): string {
    this.ensureClaudeDir(projectPath);
    const filePath = this.getContextFilePath(task, projectPath);

    let content = `# Ralph Task: ${task.name}\n\n`;
    content += `**ID:** ${task.id}\n`;
    content += `**Status:** ${task.status}\n`;
    content += `**Loop Count:** ${task.loopCount}\n`;
    content += `**Created:** ${new Date(task.createdAt).toISOString()}\n`;

    if (task.startedAt) {
      content += `**Started:** ${new Date(task.startedAt).toISOString()}\n`;
    }

    content += `\n## Description\n\n${task.description || 'No description provided.'}\n`;

    if (additionalContext) {
      content += `\n## Additional Context\n\n${additionalContext}\n`;
    }

    content += `\n## Iteration Log\n\n`;
    content += `<!-- Claude will append progress notes here -->\n`;

    fs.writeFileSync(filePath, content, 'utf-8');

    // Update task with context file path
    this.updateTask(task.id, { contextFilePath: filePath } as UpdateRalphTaskInput);

    return filePath;
  }

  /**
   * Read the context file for a task
   */
  readContextFile(task: RalphTask, projectPath: string): string | null {
    const filePath = task.contextFilePath || this.getContextFilePath(task, projectPath);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Append content to the context file
   */
  appendToContextFile(task: RalphTask, projectPath: string, content: string): void {
    const filePath = task.contextFilePath || this.getContextFilePath(task, projectPath);

    if (!fs.existsSync(filePath)) {
      this.createOrUpdateContextFile(task, projectPath);
    }

    const timestamp = new Date().toISOString();
    const entry = `\n### Iteration ${task.loopCount + 1} (${timestamp})\n\n${content}\n`;

    fs.appendFileSync(filePath, entry, 'utf-8');
  }

  /**
   * Delete the context file for a task
   */
  private deleteContextFile(task: RalphTask): void {
    if (task.contextFilePath && fs.existsSync(task.contextFilePath)) {
      try {
        fs.unlinkSync(task.contextFilePath);
      } catch (error) {
        console.error(`Failed to delete context file ${task.contextFilePath}:`, error);
      }
    }
  }

  /**
   * Mark a task as completed
   */
  completeTask(id: string, summary: string): RalphTask | null {
    console.log(`[RalphTaskManager] completeTask: id=${id}, summary="${summary}"`);
    const task = this.getTaskById(id);
    if (!task) {
      console.log(`[RalphTaskManager] completeTask: task ${id} not found`);
      return null;
    }

    const result = this.updateTask(id, {
      status: 'done',
      isPaused: false,
      pauseReason: null,
      completionSummary: summary,
      completedAt: Date.now(),
      instanceId: null,
    });
    console.log(`[RalphTaskManager] completeTask result: ${result ? 'success' : 'failed'}`);
    return result;
  }

  /**
   * Pause a task with a reason (e.g., help request)
   */
  pauseTask(id: string, reason: string): RalphTask | null {
    console.log(`[RalphTaskManager] pauseTask: id=${id}, reason="${reason}"`);
    return this.updateTask(id, {
      isPaused: true,
      pauseReason: reason,
    });
  }

  /**
   * Resume a paused task
   */
  resumeTask(id: string): RalphTask | null {
    return this.updateTask(id, {
      isPaused: false,
      pauseReason: null,
    });
  }

  /**
   * Increment the loop count for a task
   */
  incrementLoopCount(id: string): RalphTask | null {
    const task = this.getTaskById(id);
    if (!task) return null;

    console.log(
      `[RalphTaskManager] incrementLoopCount: id=${id}, ${task.loopCount} -> ${task.loopCount + 1}`
    );
    return this.updateTask(id, {
      loopCount: task.loopCount + 1,
    });
  }

  /**
   * Set the instance ID for a task
   */
  setTaskInstance(id: string, instanceId: string | null): RalphTask | null {
    return this.updateTask(id, {
      instanceId: instanceId,
    });
  }

  /**
   * Get all active (doing) tasks for a project
   */
  getActiveTasks(projectId: string): RalphTask[] {
    return this.getTasksByStatus(projectId, 'doing');
  }

  /**
   * Get all pending (todo) tasks for a project, ordered by orderIndex
   */
  getPendingTasks(projectId: string): RalphTask[] {
    return this.getTasksByStatus(projectId, 'todo');
  }

  /**
   * Get the next pending task to process
   */
  getNextPendingTask(projectId: string): RalphTask | null {
    const tasks = this.getPendingTasks(projectId);
    return tasks.length > 0 ? tasks[0] : null;
  }

  /**
   * Check if any task is currently being processed
   */
  hasActiveTask(projectId: string): boolean {
    return this.getActiveTasks(projectId).length > 0;
  }

  /**
   * Generate fractional index between two values (for insertion)
   */
  static calculateOrderIndex(before?: number, after?: number): number {
    if (before === undefined && after === undefined) {
      return 1;
    }
    if (before === undefined) {
      return after! / 2;
    }
    if (after === undefined) {
      return before + 1;
    }
    return (before + after) / 2;
  }
}

/**
 * Get the singleton RalphTaskManager instance
 */
export function getRalphTaskManager(): RalphTaskManager {
  return RalphTaskManager.getInstance();
}
