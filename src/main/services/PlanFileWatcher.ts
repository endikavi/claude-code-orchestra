/**
 * PlanFileWatcher - Watches Claude Code's plan files for changes
 *
 * Claude Code stores plans in ~/.claude/plans/ as .md files.
 * Only metadata is tracked (name, path, size, timestamps) - content is lazy loaded on demand.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { TrackedPlan } from '@shared/types/plans';

// Polling interval for directory changes (ms) - less frequent than teams
const POLL_INTERVAL = 2000;

/**
 * Get the Claude plans directory
 */
export function getClaudePlansDir(): string {
  return path.join(homedir(), '.claude', 'plans');
}

export class PlanFileWatcher extends EventEmitter {
  private pollTimer: NodeJS.Timeout | null = null;
  private isWatching: boolean = false;
  private knownPlans: Map<string, TrackedPlan> = new Map();
  private lastModifiedTimes: Map<string, number> = new Map();
  private planCreatedTimes: Map<string, number> = new Map();
  private plansDir: string;

  constructor() {
    super();
    this.plansDir = getClaudePlansDir();
  }

  /**
   * Start watching the plans directory for changes
   */
  start(): void {
    if (this.isWatching) {
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
   * Check if plan files have changed
   */
  private checkForChanges(): void {
    if (!this.isWatching) return;

    try {
      // Check if directory exists
      if (!fs.existsSync(this.plansDir)) {
        // If we had known plans but directory is gone, emit deletions
        if (this.knownPlans.size > 0) {
          for (const [planName] of this.knownPlans) {
            this.knownPlans.delete(planName);
            this.lastModifiedTimes.delete(planName);
            this.planCreatedTimes.delete(planName);
            this.emit('plan_deleted', { planName });
          }
        }
        return;
      }

      // Get all .md files in the directory
      const files = fs.readdirSync(this.plansDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));

      // Track which plans we've seen
      const seenPlans = new Set<string>();

      for (const file of mdFiles) {
        const filePath = path.join(this.plansDir, file);
        const planName = file.replace(/\.md$/, '');
        seenPlans.add(planName);

        try {
          const stats = fs.statSync(filePath);
          const lastModified = stats.mtimeMs;
          const previousModified = this.lastModifiedTimes.get(planName);

          // Check if file is new or modified
          if (previousModified === undefined || lastModified > previousModified) {
            this.lastModifiedTimes.set(planName, lastModified);
            this.processPlanFile(filePath, planName, stats.size, previousModified === undefined);
          }
        } catch {
          // File might have been deleted, ignore
        }
      }

      // Check for deleted plans
      for (const [planName] of this.knownPlans) {
        if (!seenPlans.has(planName)) {
          this.knownPlans.delete(planName);
          this.lastModifiedTimes.delete(planName);
          this.planCreatedTimes.delete(planName);
          this.emit('plan_deleted', { planName });
        }
      }
    } catch {
      // Directory might not exist yet, ignore
    }
  }

  /**
   * Convert file metadata to TrackedPlan format (no content - lazy loaded)
   */
  private toTrackedPlan(
    planName: string,
    filePath: string,
    sizeBytes: number,
    createdAt: number
  ): TrackedPlan {
    return {
      name: planName,
      filePath,
      sizeBytes,
      createdAt,
      updatedAt: Date.now(),
    };
  }

  /**
   * Process a plan file and emit appropriate events
   */
  private processPlanFile(
    filePath: string,
    planName: string,
    sizeBytes: number,
    isNew: boolean
  ): void {
    try {
      const previousPlan = this.knownPlans.get(planName);

      // Track createdAt - only set on first encounter, preserve afterwards
      if (isNew) {
        this.planCreatedTimes.set(planName, Date.now());
      }
      const createdAt = this.planCreatedTimes.get(planName) ?? Date.now();

      const trackedPlan = this.toTrackedPlan(planName, filePath, sizeBytes, createdAt);
      this.knownPlans.set(planName, trackedPlan);

      if (isNew) {
        this.emit('plan_created', { plan: trackedPlan });
      } else if (previousPlan && previousPlan.sizeBytes !== sizeBytes) {
        // File size changed means content changed
        this.emit('plan_updated', { plan: trackedPlan });
      }
    } catch (error) {
      console.error(`[PlanFileWatcher] Error processing plan file ${filePath}:`, error);
      this.emit('error', error);
    }
  }

  /**
   * Get all currently tracked plans
   */
  getAllPlans(): TrackedPlan[] {
    return Array.from(this.knownPlans.values());
  }

  /**
   * Get a plan by name
   */
  getPlanByName(planName: string): TrackedPlan | null {
    return this.knownPlans.get(planName) ?? null;
  }

  /**
   * Get plan content on demand (lazy loading)
   * Returns the content string, or null if the file doesn't exist or can't be read
   */
  getPlanContent(planName: string): string | null {
    const plan = this.knownPlans.get(planName);
    if (!plan) {
      return null;
    }

    try {
      return fs.readFileSync(plan.filePath, 'utf-8');
    } catch (error) {
      console.error(`[PlanFileWatcher] Error reading plan content for "${planName}":`, error);
      return null;
    }
  }

  /**
   * Check if the watcher is currently active
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

// Singleton instance
let planFileWatcher: PlanFileWatcher | null = null;

export function getPlanFileWatcher(): PlanFileWatcher {
  if (!planFileWatcher) {
    planFileWatcher = new PlanFileWatcher();
  }
  return planFileWatcher;
}
