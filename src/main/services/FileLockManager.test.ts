import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileLockManager, getFileLockManager } from './FileLockManager';

describe('FileLockManager', () => {
  let manager: FileLockManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = FileLockManager.getInstance();
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  describe('singleton pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = FileLockManager.getInstance();
      const instance2 = FileLockManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create a new instance after destroy', () => {
      const instance1 = FileLockManager.getInstance();
      instance1.destroy();
      const instance2 = FileLockManager.getInstance();
      expect(instance1).not.toBe(instance2);
    });

    it('should be accessible via getFileLockManager helper', () => {
      const fromHelper = getFileLockManager();
      const fromStatic = FileLockManager.getInstance();
      expect(fromHelper).toBe(fromStatic);
    });
  });

  describe('trackFile', () => {
    it('should track a file read activity', () => {
      const conflict = manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'read');

      expect(conflict).toBeNull();
      expect(manager.getActiveFilesByInstance('instance1')).toContain('/path/to/file.ts');
    });

    it('should track a file write activity', () => {
      const conflict = manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');

      expect(conflict).toBeNull();
    });

    it('should normalize file paths', () => {
      manager.trackFile('instance1', 'project1', 'C:\\Users\\test\\file.ts', 'write');

      const files = manager.getActiveFilesByInstance('instance1');
      expect(files[0]).toBe('c:/users/test/file.ts');
    });

    it('should emit file:activity event', () => {
      const activityHandler = vi.fn();
      manager.on('file:activity', activityHandler);

      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');

      expect(activityHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: 'instance1',
          projectId: 'project1',
          action: 'write',
        })
      );
    });

    it('should detect conflict when another instance recently wrote to the same file', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      const conflict = manager.trackFile('instance2', 'project1', '/path/to/file.ts', 'write');

      expect(conflict).not.toBeNull();
      expect(conflict?.conflictingInstances).toHaveLength(1);
      expect(conflict?.conflictingInstances[0].instanceId).toBe('instance1');
    });

    it('should emit file:conflict event on conflict', () => {
      const conflictHandler = vi.fn();
      manager.on('file:conflict', conflictHandler);

      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      manager.trackFile('instance2', 'project1', '/path/to/file.ts', 'write');

      expect(conflictHandler).toHaveBeenCalled();
    });

    it('should not detect conflict for read operations', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      const conflict = manager.trackFile('instance2', 'project1', '/path/to/file.ts', 'read');

      expect(conflict).toBeNull();
    });

    it('should not detect conflict from same instance', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      const conflict = manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');

      expect(conflict).toBeNull();
    });
  });

  describe('detectConflicts', () => {
    it('should return null when no activities exist for file', () => {
      const conflicts = manager.detectConflicts('instance1', '/nonexistent/file.ts');
      expect(conflicts).toBeNull();
    });

    it('should return null when no write conflicts exist', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'read');

      const conflicts = manager.detectConflicts('instance2', '/path/to/file.ts');
      expect(conflicts).toBeNull();
    });

    it('should return conflicting activities from other instances', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      manager.trackFile('instance2', 'project1', '/path/to/file.ts', 'create');

      const conflicts = manager.detectConflicts('instance3', '/path/to/file.ts');

      expect(conflicts).toHaveLength(2);
    });

    it('should not include activities from the querying instance', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      manager.trackFile('instance2', 'project1', '/path/to/file.ts', 'write');

      const conflicts = manager.detectConflicts('instance1', '/path/to/file.ts');

      expect(conflicts).toHaveLength(1);
      expect(conflicts![0].instanceId).toBe('instance2');
    });
  });

  describe('cleanupInstance', () => {
    it('should remove all activities for an instance', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file1.ts', 'write');
      manager.trackFile('instance1', 'project1', '/path/to/file2.ts', 'write');
      manager.trackFile('instance2', 'project1', '/path/to/file1.ts', 'write');

      const cleaned = manager.cleanupInstance('instance1');

      expect(cleaned).toBe(2);
      expect(manager.getActiveFilesByInstance('instance1')).toEqual([]);
      expect(manager.getActiveFilesByInstance('instance2')).toHaveLength(1);
    });

    it('should emit instance:cleanup event', () => {
      const cleanupHandler = vi.fn();
      manager.on('instance:cleanup', cleanupHandler);

      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      manager.cleanupInstance('instance1');

      expect(cleanupHandler).toHaveBeenCalledWith('instance1');
    });

    it('should return 0 when instance has no activities', () => {
      const cleaned = manager.cleanupInstance('nonexistent');
      expect(cleaned).toBe(0);
    });
  });

  describe('getActiveFilesByInstance', () => {
    it('should return empty array for unknown instance', () => {
      const files = manager.getActiveFilesByInstance('unknown');
      expect(files).toEqual([]);
    });

    it('should return all files for an instance', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file1.ts', 'write');
      manager.trackFile('instance1', 'project1', '/path/to/file2.ts', 'read');

      const files = manager.getActiveFilesByInstance('instance1');

      expect(files).toHaveLength(2);
      expect(files).toContain('/path/to/file1.ts');
      expect(files).toContain('/path/to/file2.ts');
    });
  });

  describe('getInstancesForFile', () => {
    it('should return empty array for unknown file', () => {
      const instances = manager.getInstancesForFile('/unknown/file.ts');
      expect(instances).toEqual([]);
    });

    it('should return instances that have recently written to a file', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');
      manager.trackFile('instance2', 'project1', '/path/to/file.ts', 'delete');
      manager.trackFile('instance3', 'project1', '/path/to/file.ts', 'read'); // Should not be included

      const instances = manager.getInstancesForFile('/path/to/file.ts');

      expect(instances).toHaveLength(2);
      expect(instances).toContain('instance1');
      expect(instances).toContain('instance2');
      expect(instances).not.toContain('instance3');
    });
  });

  describe('getStats', () => {
    it('should return zero stats when empty', () => {
      const stats = manager.getStats();

      expect(stats).toEqual({
        totalFiles: 0,
        totalActivities: 0,
        activeInstances: 0,
        potentialConflicts: 0,
      });
    });

    it('should return correct stats', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file1.ts', 'write');
      manager.trackFile('instance2', 'project1', '/path/to/file1.ts', 'write'); // Conflict
      manager.trackFile('instance1', 'project1', '/path/to/file2.ts', 'read');

      const stats = manager.getStats();

      expect(stats.totalFiles).toBe(2);
      expect(stats.totalActivities).toBe(3);
      expect(stats.activeInstances).toBe(2);
      expect(stats.potentialConflicts).toBe(1);
    });
  });

  describe('cleanup of stale activities', () => {
    it('should clean up activities older than 5 minutes', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');

      // Advance time by 6 minutes
      vi.advanceTimersByTime(6 * 60 * 1000);

      // The cleanup interval runs every 2 minutes, so we need to trigger it
      vi.advanceTimersByTime(2 * 60 * 1000);

      // Now check if conflicts are detected (they shouldn't be since activities are stale)
      const conflicts = manager.detectConflicts('instance2', '/path/to/file.ts');
      expect(conflicts).toBeNull();
    });
  });

  describe('destroy', () => {
    it('should clear all data and allow new instance creation', () => {
      manager.trackFile('instance1', 'project1', '/path/to/file.ts', 'write');

      manager.destroy();

      const newManager = FileLockManager.getInstance();
      expect(newManager.getStats().totalFiles).toBe(0);
      newManager.destroy();
    });
  });
});
