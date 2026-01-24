/**
 * AutoReviewService - Automatic code review on task completion
 *
 * When a Claude instance completes a task (TaskUpdate status="completed"),
 * this service automatically spawns a lightweight review subagent that runs
 * typecheck and lint:fix to ensure code quality.
 *
 * Features:
 * - Debounce: Multiple task completions within 500ms trigger only one review
 * - Cooldown: 30 second cooldown per project to avoid excessive reviews
 * - Opt-out: Projects can disable via project.autoReview = false
 * - Economical: Uses haiku model for cost-effective reviews
 * - Non-blocking: Reviews run in background, don't block the main instance
 */

import { EventEmitter } from 'events';
import { getProcessManager } from './ProcessManager';
import { DataStore } from './DataStore';

export interface ReviewRequest {
  instanceId: string;
  projectId: string;
  taskId: string;
  timestamp: number;
}

export interface ActiveReview {
  instanceId: string;
  projectId: string;
  parentInstanceId: string;
  taskId: string;
  startedAt: number;
}

export class AutoReviewService extends EventEmitter {
  // Queue of pending review requests (projectId -> request)
  private pendingReviews: Map<string, ReviewRequest> = new Map();

  // Debounce timers per project
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  // Cooldown timestamps per project (last review time)
  private projectCooldown: Map<string, number> = new Map();

  // Active review instances (instanceId -> review info)
  private activeReviews: Map<string, ActiveReview> = new Map();

  // Configuration
  private static readonly DEBOUNCE_MS = 500; // Wait 500ms after last task completion
  private static readonly COOLDOWN_MS = 30000; // 30 second cooldown per project

  private dataStore: DataStore;

  constructor() {
    super();
    this.dataStore = DataStore.getInstance();
  }

  /**
   * Queue a review request for a project.
   * Multiple requests within DEBOUNCE_MS will be collapsed into one review.
   */
  queueReview(request: ReviewRequest): void {
    const { projectId, instanceId, taskId } = request;

    // Check if autoReview is enabled for this project
    const project = this.dataStore.getProjectById(projectId);
    if (!project) {
      console.log(`[AutoReviewService] Project ${projectId} not found, skipping review`);
      return;
    }

    // autoReview defaults to true if not explicitly set
    if (project.autoReview === false) {
      console.log(`[AutoReviewService] autoReview disabled for project ${project.name}, skipping`);
      return;
    }

    console.log(
      `[AutoReviewService] Review requested for project ${project.name}, task ${taskId}, instance ${instanceId}`
    );

    // Store the request (overwrites previous if multiple in quick succession)
    this.pendingReviews.set(projectId, request);

    // Clear existing debounce timer for this project
    const existingTimer = this.debounceTimers.get(projectId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(projectId);
      void this.processReview(projectId);
    }, AutoReviewService.DEBOUNCE_MS);

    this.debounceTimers.set(projectId, timer);
  }

  /**
   * Process a queued review after debounce period.
   */
  private processReview(projectId: string): void {
    const request = this.pendingReviews.get(projectId);
    if (!request) {
      console.log(`[AutoReviewService] No pending review for project ${projectId}`);
      return;
    }

    // Remove from pending
    this.pendingReviews.delete(projectId);

    // Check cooldown
    const lastReviewTime = this.projectCooldown.get(projectId) || 0;
    const timeSinceLastReview = Date.now() - lastReviewTime;

    if (timeSinceLastReview < AutoReviewService.COOLDOWN_MS) {
      const remainingCooldown = Math.ceil(
        (AutoReviewService.COOLDOWN_MS - timeSinceLastReview) / 1000
      );
      console.log(
        `[AutoReviewService] Project ${projectId} in cooldown (${remainingCooldown}s remaining), skipping review`
      );
      return;
    }

    // Check if there's already an active review for this project
    for (const [, review] of this.activeReviews) {
      if (review.projectId === projectId) {
        console.log(
          `[AutoReviewService] Review already running for project ${projectId}, skipping`
        );
        return;
      }
    }

    // Update cooldown timestamp
    this.projectCooldown.set(projectId, Date.now());

    // Get project for path
    const project = this.dataStore.getProjectById(projectId);
    if (!project) {
      console.log(`[AutoReviewService] Project ${projectId} not found`);
      return;
    }

    console.log(`[AutoReviewService] Spawning review subagent for project ${project.name}`);

    try {
      const processManager = getProcessManager();

      // Build review prompt with parent instance info for context publishing
      const reviewPrompt = this.buildReviewPrompt(project.path, request.instanceId, request.taskId);

      // Create review instance with special configuration
      const reviewInstance = processManager.createInstance(
        {
          projectId,
          model: 'haiku', // Economical model for simple review tasks
          mode: 'stream-json',
          prompt: reviewPrompt,
        },
        true // isLocal = true for terminal pool
      );

      // Track the active review
      this.activeReviews.set(reviewInstance.id, {
        instanceId: reviewInstance.id,
        projectId,
        parentInstanceId: request.instanceId,
        taskId: request.taskId,
        startedAt: Date.now(),
      });

      // Listen for completion
      this.setupReviewListeners(reviewInstance.id);

      this.emit('review:started', {
        projectId,
        instanceId: reviewInstance.id,
        parentInstanceId: request.instanceId,
        taskId: request.taskId,
      });

      console.log(
        `[AutoReviewService] Review subagent ${reviewInstance.id} started for project ${project.name}`
      );
    } catch (error) {
      console.error(`[AutoReviewService] Failed to spawn review subagent:`, error);
      this.emit('review:error', {
        projectId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Build the review prompt for the subagent.
   */
  private buildReviewPrompt(projectPath: string, parentInstanceId: string, taskId: string): string {
    return `You are an automatic code review assistant spawned by the Orchestra Dashboard.
Your job is to run quality checks, fix issues, and report your findings to the shared context.

## Context
- Parent instance: ${parentInstanceId.slice(0, 8)}
- Task completed: ${taskId}
- Working directory: ${projectPath}

## Instructions

### Step 1: Announce you're starting
Use the MCP tool to publish your status:
\`\`\`
context_publish({
  "workStatus": "reviewing",
  "currentTask": "Auto-review after task ${taskId}",
  "notesForOthers": ["Running typecheck and lint checks..."]
})
\`\`\`

### Step 2: Run checks
Execute these commands:
1. \`npm run typecheck\` (if available)
2. \`npm run lint:fix\` (if available)

### Step 3: Handle errors
If typecheck finds errors:
- Try to fix them in the relevant files
- Run typecheck again to verify

If you CANNOT fix an error:
- Note it for the context publish in step 4

### Step 4: Report findings
Publish your final status with what you found/fixed:

If all passed:
\`\`\`
context_publish({
  "workStatus": "completed",
  "currentTask": "Auto-review completed",
  "notesForOthers": ["All checks passed after task ${taskId}"]
})
\`\`\`

If you fixed issues:
\`\`\`
context_publish({
  "workStatus": "completed",
  "currentTask": "Auto-review completed",
  "notesForOthers": ["Fixed X TypeScript errors", "Fixed Y lint issues"]
})
\`\`\`

If there are unfixable issues:
\`\`\`
context_publish({
  "workStatus": "blocked",
  "currentTask": "Auto-review found issues",
  "notesForOthers": ["NEEDS ATTENTION: Could not fix: <brief description of errors>"]
})
\`\`\`

### Step 5: Exit
Exit immediately with /exit after publishing.

IMPORTANT: Do NOT engage in conversation. Execute silently and exit.
Start now.`;
  }

  /**
   * Setup listeners to track when a review completes.
   */
  private setupReviewListeners(instanceId: string): void {
    const processManager = getProcessManager();

    // Check periodically if the instance has completed
    const checkInterval = setInterval(() => {
      const instance = processManager.getInstance(instanceId);

      if (!instance) {
        // Instance was removed
        this.handleReviewComplete(instanceId, 'removed');
        clearInterval(checkInterval);
        return;
      }

      if (
        instance.status === 'completed' ||
        instance.status === 'error' ||
        instance.status === 'killed'
      ) {
        this.handleReviewComplete(instanceId, instance.status);
        clearInterval(checkInterval);
      }
    }, 1000); // Check every second

    // Safety timeout - kill review after 5 minutes max
    setTimeout(
      () => {
        clearInterval(checkInterval);
        const review = this.activeReviews.get(instanceId);
        if (review) {
          console.log(`[AutoReviewService] Review ${instanceId} timed out after 5 minutes`);
          void processManager.killInstance(instanceId, true);
          this.handleReviewComplete(instanceId, 'timeout');
        }
      },
      5 * 60 * 1000
    );
  }

  /**
   * Handle review completion.
   */
  private handleReviewComplete(instanceId: string, status: string): void {
    const review = this.activeReviews.get(instanceId);
    if (!review) {
      return;
    }

    this.activeReviews.delete(instanceId);

    console.log(`[AutoReviewService] Review ${instanceId} completed with status: ${status}`);

    this.emit('review:completed', {
      projectId: review.projectId,
      instanceId,
      parentInstanceId: review.parentInstanceId,
      taskId: review.taskId,
      status,
      duration: Date.now() - review.startedAt,
    });
  }

  /**
   * Cancel a pending review for a project.
   */
  cancelReview(projectId: string): void {
    // Clear debounce timer
    const timer = this.debounceTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(projectId);
    }

    // Remove pending request
    this.pendingReviews.delete(projectId);

    console.log(`[AutoReviewService] Cancelled pending review for project ${projectId}`);
  }

  /**
   * Get list of active reviews.
   */
  getActiveReviews(): ActiveReview[] {
    return Array.from(this.activeReviews.values());
  }

  /**
   * Check if a review is active for a project.
   */
  hasActiveReview(projectId: string): boolean {
    for (const review of this.activeReviews.values()) {
      if (review.projectId === projectId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get cooldown remaining for a project (in ms).
   */
  getCooldownRemaining(projectId: string): number {
    const lastReviewTime = this.projectCooldown.get(projectId) || 0;
    const elapsed = Date.now() - lastReviewTime;
    return Math.max(0, AutoReviewService.COOLDOWN_MS - elapsed);
  }

  /**
   * Clean up all timers and resources.
   */
  shutdown(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Clear pending reviews
    this.pendingReviews.clear();

    // Note: Active reviews will complete on their own
    console.log('[AutoReviewService] Shutdown complete');
  }
}

// Singleton instance
let autoReviewService: AutoReviewService | null = null;

export function getAutoReviewService(): AutoReviewService {
  if (!autoReviewService) {
    autoReviewService = new AutoReviewService();
  }
  return autoReviewService;
}
