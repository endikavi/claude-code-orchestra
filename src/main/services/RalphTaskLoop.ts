import { EventEmitter } from 'events';
import { getRalphTaskManager, RalphTaskManager } from './RalphTaskManager';
import { DataStore } from './DataStore';
import { getJiraService } from './JiraService';
import type { RalphTask, RalphTaskHelpRequest } from '@shared/types/ralphTasks';
import type { ClaudeInstance as ClaudeInstanceType, ClaudeModel, Project } from '@shared/types';

// Type for ProcessManager (we'll use dynamic import to avoid circular deps)
type ProcessManagerType = import('./ProcessManager').ProcessManager;

// Singleton instance
let instance: RalphTaskLoop | null = null;

// Max iterations before forcing a stop (safety limit)
const MAX_LOOP_ITERATIONS = 100;

// Delay between loop iterations (ms)
const LOOP_RESTART_DELAY_MS = 2000;

export class RalphTaskLoop extends EventEmitter {
  private taskManager: RalphTaskManager;
  private dataStore: DataStore;
  private processManager: ProcessManagerType | null = null;
  private runningTasks: Map<string, { taskId: string; instanceId: string }> = new Map();
  private processingAllQueue: Map<string, boolean> = new Map(); // projectId -> isProcessing

  private constructor() {
    super();
    this.taskManager = getRalphTaskManager();
    this.dataStore = DataStore.getInstance();
  }

  static getInstance(): RalphTaskLoop {
    if (!instance) {
      instance = new RalphTaskLoop();
    }
    return instance;
  }

  /**
   * Set the ProcessManager instance (must be called during initialization)
   */
  setProcessManager(pm: ProcessManagerType): void {
    console.log('[RalphTaskLoop] setProcessManager called');
    this.processManager = pm;
    this.setupProcessManagerListeners();
  }

  /**
   * Set up listeners for ProcessManager events
   */
  private setupProcessManagerListeners(): void {
    if (!this.processManager) return;

    console.log('[RalphTaskLoop] Setting up ProcessManager listeners');

    // Listen for instance exit events
    this.processManager.on('instanceExited', (instanceId: string, exitCode: number) => {
      console.log(
        `[RalphTaskLoop] Received instanceExited event: instanceId=${instanceId}, exitCode=${exitCode}`
      );
      this.handleInstanceExit(instanceId, exitCode);
    });
  }

  /**
   * Start a task (move to "doing" and begin the loop)
   * @param taskId - The task ID to start
   * @param isInteractive - If true, shows terminal UI; if false, runs in background (default: use task's isInteractive setting)
   */
  startTask(taskId: string, isInteractive?: boolean): RalphTask | null {
    console.log(
      `[RalphTaskLoop] startTask called: taskId=${taskId}, isInteractive=${isInteractive}`
    );
    const task = this.taskManager.getTaskById(taskId);
    if (!task) {
      console.error(`[RalphTaskLoop] Task ${taskId} not found`);
      return null;
    }

    // Determine if interactive - use parameter if provided, otherwise use task setting
    const interactive = isInteractive ?? task.isInteractive;

    // Update task's isInteractive setting if different
    let updatedTask = task;
    if (task.isInteractive !== interactive) {
      const updated = this.taskManager.updateTask(taskId, { isInteractive: interactive });
      if (updated) {
        updatedTask = updated;
      }
    }

    // Move task to "doing" if not already
    if (updatedTask.status !== 'doing') {
      const moved = this.taskManager.moveTask({ id: taskId, newStatus: 'doing' });
      if (!moved) {
        console.error(`[RalphTaskLoop] Failed to move task ${taskId} to doing`);
        return null;
      }
      updatedTask = moved;

      // Sync with Jira if enabled
      this.syncJiraOnDoing(updatedTask);
    }

    // Start the loop
    this.runLoop(updatedTask);

    return this.taskManager.getTaskById(taskId);
  }

  /**
   * Stop a task loop
   */
  stopTask(taskId: string): RalphTask | null {
    const running = Array.from(this.runningTasks.values()).find((r) => r.taskId === taskId);

    if (running && this.processManager) {
      // Kill the instance
      this.processManager.killInstance(running.instanceId);
      this.runningTasks.delete(running.instanceId);
    }

    // Update task to remove instance reference but keep in "doing"
    const task = this.taskManager.updateTask(taskId, {
      instanceId: null,
      isPaused: true,
      pauseReason: 'Stopped by user',
    });

    return task;
  }

  /**
   * Complete a task (called by CLI via API)
   */
  completeTask(taskId: string, summary: string): RalphTask | null {
    console.log(`[RalphTaskLoop] completeTask called: taskId=${taskId}, summary="${summary}"`);

    const running = Array.from(this.runningTasks.values()).find((r) => r.taskId === taskId);

    if (running) {
      console.log(
        `[RalphTaskLoop] completeTask: removing from runningTasks, instanceId=${running.instanceId}`
      );
      this.runningTasks.delete(running.instanceId);
    }

    // Mark task as done
    const task = this.taskManager.completeTask(taskId, summary);

    if (task) {
      console.log(`[RalphTaskLoop] completeTask success: task moved to done`);
      this.emit('taskCompleted', task);

      // Sync with Jira if enabled
      this.syncJiraOnDone(task);

      // Check if we're processing all tasks
      this.checkProcessNextInQueue(task.projectId);
    }

    return task;
  }

  /**
   * Request help (called by CLI via API)
   */
  requestHelp(taskId: string, reason: string): RalphTask | null {
    const task = this.taskManager.pauseTask(taskId, reason);

    if (task) {
      const helpRequest: RalphTaskHelpRequest = {
        taskId,
        reason,
        timestamp: Date.now(),
      };
      this.emit('helpRequested', helpRequest);
    }

    return task;
  }

  /**
   * Respond to a help request and resume the task
   */
  respondToHelp(taskId: string, response: string): RalphTask | null {
    const task = this.taskManager.getTaskById(taskId);
    if (!task || !task.isPaused) {
      return null;
    }

    // Get project to append to context file
    const project = this.dataStore.getProjectById(task.projectId);
    if (project) {
      this.taskManager.appendToContextFile(
        task,
        project.path,
        `**User Response to Help Request:**\n\n${response}`
      );
    }

    // Resume the task
    const resumed = this.taskManager.resumeTask(taskId);
    if (resumed) {
      // Continue the loop
      this.runLoop(resumed);
    }

    return this.taskManager.getTaskById(taskId);
  }

  /**
   * Process all pending tasks in sequence
   */
  processAll(projectId: string): void {
    if (this.processingAllQueue.get(projectId)) {
      console.log(`[RalphTaskLoop] Already processing all tasks for project ${projectId}`);
      return;
    }

    this.processingAllQueue.set(projectId, true);
    this.emit('processAllStarted', projectId);

    try {
      this.processNextTask(projectId);
    } catch (error) {
      console.error(`[RalphTaskLoop] Error processing all tasks:`, error);
      this.processingAllQueue.set(projectId, false);
      this.emit('processAllError', projectId, error);
    }
  }

  /**
   * Stop processing all tasks
   */
  stopProcessAll(projectId: string): void {
    this.processingAllQueue.set(projectId, false);

    // Stop any active task for this project
    const activeTasks = this.taskManager.getActiveTasks(projectId);
    for (const task of activeTasks) {
      this.stopTask(task.id);
    }

    this.emit('processAllStopped', projectId);
  }

  /**
   * Process the next pending task in the queue
   */
  private processNextTask(projectId: string): void {
    if (!this.processingAllQueue.get(projectId)) {
      return;
    }

    const nextTask = this.taskManager.getNextPendingTask(projectId);
    if (!nextTask) {
      // No more tasks to process
      this.processingAllQueue.set(projectId, false);
      this.emit('processAllCompleted', projectId);
      return;
    }

    this.startTask(nextTask.id);
  }

  /**
   * Check and process next task in queue after completion
   */
  private checkProcessNextInQueue(projectId: string): void {
    if (this.processingAllQueue.get(projectId)) {
      // Small delay before starting next task
      setTimeout(() => {
        this.processNextTask(projectId);
      }, LOOP_RESTART_DELAY_MS);
    }
  }

  /**
   * Run the loop for a task
   */
  private runLoop(task: RalphTask): void {
    console.log(
      `[RalphTaskLoop] runLoop called: taskId=${task.id}, status=${task.status}, isPaused=${task.isPaused}, loopCount=${task.loopCount}`
    );

    if (!this.processManager) {
      console.error('[RalphTaskLoop] ProcessManager not set');
      return;
    }

    // Check if task is already done or paused
    if (task.status === 'done' || task.isPaused) {
      console.log(
        `[RalphTaskLoop] runLoop early return: task.status=${task.status}, task.isPaused=${task.isPaused}`
      );
      return;
    }

    // Check loop limit
    if (task.loopCount >= MAX_LOOP_ITERATIONS) {
      console.log(`[RalphTaskLoop] runLoop MAX_LOOP_ITERATIONS reached: ${task.loopCount}`);
      console.warn(
        `[RalphTaskLoop] Task ${task.id} reached max iterations (${MAX_LOOP_ITERATIONS})`
      );
      this.taskManager.pauseTask(task.id, `Reached maximum iterations (${MAX_LOOP_ITERATIONS})`);
      return;
    }

    // Get project for context file and creating instance
    const project = this.dataStore.getProjectById(task.projectId);
    if (!project) {
      console.error(`[RalphTaskLoop] Project ${task.projectId} not found`);
      return;
    }

    // Create or update context file
    this.taskManager.createOrUpdateContextFile(task, project.path);

    // Generate the prompt for Claude
    const prompt = this.generatePrompt(task, project);

    // Create instance
    try {
      const instanceConfig = {
        projectId: task.projectId,
        model: 'sonnet' as ClaudeModel, // Default to sonnet for Ralph tasks
        mode: 'stream-json' as const,
        prompt,
        skipPermissions: project.skipPermissions,
        isHidden: !task.isInteractive, // Hidden when running in background mode
        ralphTaskId: task.id, // Associate with Ralph task
      };

      const instance = this.processManager.createInstance(instanceConfig);
      console.log(`[RalphTaskLoop] Instance created: instanceId=${instance.id}, taskId=${task.id}`);

      // Track the running task
      this.runningTasks.set(instance.id, { taskId: task.id, instanceId: instance.id });

      // Update task with instance ID and increment loop count
      this.taskManager.setTaskInstance(task.id, instance.id);
      this.taskManager.incrementLoopCount(task.id);

      console.log(
        `[RalphTaskLoop] Started ${task.isInteractive ? 'interactive' : 'background'} instance for task ${task.id}`
      );
      this.emit('loopStarted', task.id, task.loopCount + 1);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RalphTaskLoop] Failed to create instance for task ${task.id}:`, error);
      this.taskManager.pauseTask(task.id, `Failed to start: ${errorMessage}`);
    }
  }

  /**
   * Handle instance exit - determine if loop should continue
   */
  private handleInstanceExit(instanceId: string, exitCode: number): void {
    console.log(
      `[RalphTaskLoop] handleInstanceExit: instanceId=${instanceId}, exitCode=${exitCode}`
    );

    const running = this.runningTasks.get(instanceId);
    if (!running) {
      console.log(
        `[RalphTaskLoop] handleInstanceExit: instanceId=${instanceId} not found in runningTasks (not a Ralph task)`
      );
      return; // Not a Ralph task instance
    }

    this.runningTasks.delete(instanceId);

    const task = this.taskManager.getTaskById(running.taskId);
    if (!task) {
      console.log(
        `[RalphTaskLoop] handleInstanceExit: task ${running.taskId} not found in database`
      );
      return;
    }

    console.log(
      `[RalphTaskLoop] handleInstanceExit: taskId=${task.id}, status=${task.status}, isPaused=${task.isPaused}`
    );

    // Clear instance ID
    this.taskManager.setTaskInstance(task.id, null);

    // If task is done or paused, don't restart
    if (task.status === 'done' || task.isPaused) {
      console.log(
        `[RalphTaskLoop] handleInstanceExit: NOT restarting - status=${task.status}, isPaused=${task.isPaused}`
      );
      this.emit('loopCompleted', task.id);
      return;
    }

    // If exit code is non-zero, it might be an error
    if (exitCode !== 0) {
      console.warn(`[RalphTaskLoop] Instance for task ${task.id} exited with code ${exitCode}`);
    }

    // Restart the loop after a delay
    console.log(
      `[RalphTaskLoop] Restarting loop for task ${task.id} (iteration ${task.loopCount + 1})`
    );
    console.log(
      `[RalphTaskLoop] handleInstanceExit: scheduling loop restart in ${LOOP_RESTART_DELAY_MS}ms for task ${task.id}`
    );

    setTimeout(() => {
      const currentTask = this.taskManager.getTaskById(task.id);
      if (currentTask && currentTask.status === 'doing' && !currentTask.isPaused) {
        this.runLoop(currentTask);
      }
    }, LOOP_RESTART_DELAY_MS);
  }

  /**
   * Generate the prompt for Claude
   */
  private generatePrompt(task: RalphTask, project: Project): string {
    const contextFilePath =
      task.contextFilePath || this.taskManager.getContextFilePath(task, project.path);

    // Get the API configuration (port and SSL)
    const remoteConfig = this.dataStore.getRemoteConfig();
    const apiPort = remoteConfig.port;
    const protocol = remoteConfig.ssl?.enabled ? 'https' : 'http';
    // For HTTPS with self-signed certs, we need -k flag to skip certificate verification
    const curlFlags = remoteConfig.ssl?.enabled ? '-k ' : '';

    const prompt = `You are working on a task in a Ralph Loop. This is an automated system that will keep running you in a loop until the task is complete.

## Task: ${task.name}

${task.description || 'No description provided.'}

## Context File

You can find and update your context at: ${contextFilePath}
This file contains the task description and notes from previous iterations.

## Important Instructions

1. **Complete the task** described above step by step
2. **When finished**, mark the task as done by running this curl command:
   \`\`\`bash
   curl ${curlFlags}-X POST ${protocol}://localhost:${apiPort}/api/ralph-tasks/${task.id}/complete -H "Content-Type: application/json" -d "{\\"summary\\": \\"Brief description of what you accomplished\\"}"
   \`\`\`
3. **If you need human help**, pause and request help by running:
   \`\`\`bash
   curl ${curlFlags}-X POST ${protocol}://localhost:${apiPort}/api/ralph-tasks/${task.id}/help -H "Content-Type: application/json" -d "{\\"reason\\": \\"Your question or what you need help with\\"}"
   \`\`\`
4. **Update the context file** with your progress notes after each significant step
5. **CRITICAL**: You MUST call the complete endpoint when finished, or the loop will keep running indefinitely

## Current Status

- This is iteration #${task.loopCount + 1}
- Task started: ${task.startedAt ? new Date(task.startedAt).toISOString() : 'Just now'}
${task.loopCount > 0 ? `- Previous iterations have been run. Check the context file for notes.` : ''}

Begin working on the task now.`;

    return prompt;
  }

  /**
   * Check if a task is currently running
   */
  isTaskRunning(taskId: string): boolean {
    return Array.from(this.runningTasks.values()).some((r) => r.taskId === taskId);
  }

  /**
   * Get the instance ID for a running task
   */
  getTaskInstanceId(taskId: string): string | null {
    const running = Array.from(this.runningTasks.values()).find((r) => r.taskId === taskId);
    return running ? running.instanceId : null;
  }

  /**
   * Sync with Jira when task moves to "doing"
   */
  private async syncJiraOnDoing(task: RalphTask): Promise<void> {
    if (!task.jiraIssueKey) {
      return;
    }

    const project = this.dataStore.getProjectById(task.projectId);
    if (!project?.jiraConfig?.enabled) {
      return;
    }

    const jiraConfig = project.jiraConfig;
    const jiraService = getJiraService();

    try {
      // Transition to "doing" status if configured
      if (jiraConfig.statusMapping?.doing) {
        const success = await jiraService.transitionIssueToStatus(
          task.jiraIssueKey,
          jiraConfig.statusMapping.doing
        );
        if (success) {
          console.log(
            `[RalphTaskLoop] Jira issue ${task.jiraIssueKey} transitioned to "doing" status`
          );
        } else {
          console.warn(
            `[RalphTaskLoop] Could not transition Jira issue ${task.jiraIssueKey} to "doing" status`
          );
        }
      }

      // Auto-assign if configured
      if (jiraConfig.autoAssignOnDoing) {
        const user = await jiraService.getCurrentUser();
        if (user) {
          await jiraService.assignIssue(task.jiraIssueKey, user.accountId);
          console.log(
            `[RalphTaskLoop] Jira issue ${task.jiraIssueKey} assigned to ${user.displayName}`
          );
        }
      }

      // Update last sync timestamp
      this.taskManager.updateTask(task.id, { jiraLastSyncAt: Date.now() });
    } catch (error) {
      console.error(`[RalphTaskLoop] Failed to sync Jira on doing:`, error);
    }
  }

  /**
   * Sync with Jira when task moves to "done"
   */
  private async syncJiraOnDone(task: RalphTask): Promise<void> {
    if (!task.jiraIssueKey) {
      return;
    }

    const project = this.dataStore.getProjectById(task.projectId);
    if (!project?.jiraConfig?.enabled) {
      return;
    }

    const jiraConfig = project.jiraConfig;
    const jiraService = getJiraService();

    try {
      // Transition to "done" status if configured
      if (jiraConfig.statusMapping?.done) {
        const success = await jiraService.transitionIssueToStatus(
          task.jiraIssueKey,
          jiraConfig.statusMapping.done
        );
        if (success) {
          console.log(
            `[RalphTaskLoop] Jira issue ${task.jiraIssueKey} transitioned to "done" status`
          );
        } else {
          console.warn(
            `[RalphTaskLoop] Could not transition Jira issue ${task.jiraIssueKey} to "done" status`
          );
        }
      }

      // Update last sync timestamp
      this.taskManager.updateTask(task.id, { jiraLastSyncAt: Date.now() });
    } catch (error) {
      console.error(`[RalphTaskLoop] Failed to sync Jira on done:`, error);
    }
  }
}

/**
 * Get the singleton RalphTaskLoop instance
 */
export function getRalphTaskLoop(): RalphTaskLoop {
  return RalphTaskLoop.getInstance();
}
