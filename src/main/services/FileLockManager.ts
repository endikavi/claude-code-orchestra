import { EventEmitter } from 'events';

/**
 * Represents a file activity record
 */
export interface FileActivity {
  instanceId: string;
  projectId: string;
  file: string;
  action: 'read' | 'write' | 'create' | 'delete';
  timestamp: number;
}

/**
 * Conflict information when multiple instances access the same file
 */
export interface FileConflict {
  file: string;
  currentInstance: FileActivity;
  conflictingInstances: FileActivity[];
}

// Time window for considering file activities as concurrent (5 minutes)
const ACTIVITY_WINDOW_MS = 5 * 60 * 1000;

// Maximum activities to keep per file
const MAX_ACTIVITIES_PER_FILE = 50;

// Cleanup interval (every 2 minutes)
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

/**
 * FileLockManager tracks file activities across instances
 * and detects potential conflicts when multiple instances
 * modify the same file.
 */
export class FileLockManager extends EventEmitter {
  private static instance: FileLockManager | null = null;

  // Map of file path -> list of activities
  private activeFiles: Map<string, FileActivity[]> = new Map();

  // Map of instanceId -> set of files being worked on
  private instanceFiles: Map<string, Set<string>> = new Map();

  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.startCleanupInterval();
  }

  public static getInstance(): FileLockManager {
    if (!FileLockManager.instance) {
      FileLockManager.instance = new FileLockManager();
    }
    return FileLockManager.instance;
  }

  /**
   * Start periodic cleanup of stale activities
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleActivities();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Clean up activities older than the activity window
   */
  private cleanupStaleActivities(): void {
    const now = Date.now();
    const cutoff = now - ACTIVITY_WINDOW_MS;
    let cleanedCount = 0;

    for (const [file, activities] of this.activeFiles) {
      const validActivities = activities.filter((a) => a.timestamp > cutoff);

      if (validActivities.length === 0) {
        this.activeFiles.delete(file);
        cleanedCount++;
      } else if (validActivities.length < activities.length) {
        this.activeFiles.set(file, validActivities);
        cleanedCount += activities.length - validActivities.length;
      }
    }

    // Also update instanceFiles map
    for (const [instanceId, files] of this.instanceFiles) {
      for (const file of files) {
        const activities = this.activeFiles.get(file);
        const hasInstanceActivity = activities?.some((a) => a.instanceId === instanceId);
        if (!hasInstanceActivity) {
          files.delete(file);
        }
      }

      if (files.size === 0) {
        this.instanceFiles.delete(instanceId);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[FileLockManager] Cleaned up ${cleanedCount} stale file activities`);
    }
  }

  /**
   * Normalize a file path for consistent comparison
   */
  private normalizePath(filePath: string): string {
    // Normalize slashes and remove trailing slash
    return filePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }

  /**
   * Track a file activity
   */
  public trackFile(
    instanceId: string,
    projectId: string,
    file: string,
    action: 'read' | 'write' | 'create' | 'delete'
  ): FileConflict | null {
    const normalizedFile = this.normalizePath(file);
    const timestamp = Date.now();

    const activity: FileActivity = {
      instanceId,
      projectId,
      file: normalizedFile,
      action,
      timestamp,
    };

    // Get or create activities list for this file
    let activities = this.activeFiles.get(normalizedFile);
    if (!activities) {
      activities = [];
      this.activeFiles.set(normalizedFile, activities);
    }

    // Check for conflicts before adding (for write operations)
    let conflict: FileConflict | null = null;
    if (action === 'write' || action === 'create' || action === 'delete') {
      conflict = this.detectConflictsInternal(instanceId, normalizedFile, activities);
    }

    // Add the activity
    activities.push(activity);

    // Trim old activities if needed
    if (activities.length > MAX_ACTIVITIES_PER_FILE) {
      activities.splice(0, activities.length - MAX_ACTIVITIES_PER_FILE);
    }

    // Track file for this instance
    let instanceFileSet = this.instanceFiles.get(instanceId);
    if (!instanceFileSet) {
      instanceFileSet = new Set();
      this.instanceFiles.set(instanceId, instanceFileSet);
    }
    instanceFileSet.add(normalizedFile);

    // Emit event for tracking
    this.emit('file:activity', activity);

    // If there's a conflict, emit that too
    if (conflict) {
      this.emit('file:conflict', conflict);
    }

    return conflict;
  }

  /**
   * Internal conflict detection
   */
  private detectConflictsInternal(
    instanceId: string,
    normalizedFile: string,
    activities: FileActivity[]
  ): FileConflict | null {
    const now = Date.now();
    const cutoff = now - ACTIVITY_WINDOW_MS;

    // Find recent write activities from other instances
    const conflictingActivities = activities.filter(
      (a) =>
        a.instanceId !== instanceId &&
        a.timestamp > cutoff &&
        (a.action === 'write' || a.action === 'create' || a.action === 'delete')
    );

    if (conflictingActivities.length === 0) {
      return null;
    }

    return {
      file: normalizedFile,
      currentInstance: {
        instanceId,
        projectId: '', // Will be filled by caller
        file: normalizedFile,
        action: 'write',
        timestamp: now,
      },
      conflictingInstances: conflictingActivities,
    };
  }

  /**
   * Detect conflicts for a specific file from a specific instance
   */
  public detectConflicts(instanceId: string, file: string): FileActivity[] | null {
    const normalizedFile = this.normalizePath(file);
    const activities = this.activeFiles.get(normalizedFile);

    if (!activities || activities.length === 0) {
      return null;
    }

    const now = Date.now();
    const cutoff = now - ACTIVITY_WINDOW_MS;

    // Find recent write activities from other instances
    const conflicts = activities.filter(
      (a) =>
        a.instanceId !== instanceId &&
        a.timestamp > cutoff &&
        (a.action === 'write' || a.action === 'create' || a.action === 'delete')
    );

    return conflicts.length > 0 ? conflicts : null;
  }

  /**
   * Clean up all file locks for a specific instance
   */
  public cleanupInstance(instanceId: string): number {
    let cleaned = 0;

    // Remove all activities for this instance
    for (const [file, activities] of this.activeFiles) {
      const remaining = activities.filter((a) => a.instanceId !== instanceId);

      if (remaining.length === 0) {
        this.activeFiles.delete(file);
      } else if (remaining.length < activities.length) {
        this.activeFiles.set(file, remaining);
      }

      cleaned += activities.length - remaining.length;
    }

    // Remove from instance tracking
    this.instanceFiles.delete(instanceId);

    if (cleaned > 0) {
      console.log(`[FileLockManager] Cleaned up ${cleaned} activities for instance ${instanceId}`);
      this.emit('instance:cleanup', instanceId);
    }

    return cleaned;
  }

  /**
   * Get all files being actively worked on by an instance
   */
  public getActiveFilesByInstance(instanceId: string): string[] {
    const files = this.instanceFiles.get(instanceId);
    return files ? Array.from(files) : [];
  }

  /**
   * Get all instances that have recently modified a file
   */
  public getInstancesForFile(file: string): string[] {
    const normalizedFile = this.normalizePath(file);
    const activities = this.activeFiles.get(normalizedFile);

    if (!activities) {
      return [];
    }

    const now = Date.now();
    const cutoff = now - ACTIVITY_WINDOW_MS;

    // Get unique instance IDs for recent write activities
    const instanceIds = new Set<string>();
    for (const activity of activities) {
      if (
        activity.timestamp > cutoff &&
        (activity.action === 'write' ||
          activity.action === 'create' ||
          activity.action === 'delete')
      ) {
        instanceIds.add(activity.instanceId);
      }
    }

    return Array.from(instanceIds);
  }

  /**
   * Get file activity statistics
   */
  public getStats(): {
    totalFiles: number;
    totalActivities: number;
    activeInstances: number;
    potentialConflicts: number;
  } {
    let totalActivities = 0;
    let potentialConflicts = 0;

    for (const activities of this.activeFiles.values()) {
      totalActivities += activities.length;

      // Check for potential conflicts (multiple instances modifying same file)
      const writeInstances = new Set(
        activities
          .filter((a) => a.action === 'write' || a.action === 'create' || a.action === 'delete')
          .map((a) => a.instanceId)
      );
      if (writeInstances.size > 1) {
        potentialConflicts++;
      }
    }

    return {
      totalFiles: this.activeFiles.size,
      totalActivities,
      activeInstances: this.instanceFiles.size,
      potentialConflicts,
    };
  }

  /**
   * Destroy the manager (cleanup)
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.activeFiles.clear();
    this.instanceFiles.clear();
    FileLockManager.instance = null;
  }
}

// Export singleton getter
export function getFileLockManager(): FileLockManager {
  return FileLockManager.getInstance();
}
