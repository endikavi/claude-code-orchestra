import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';

// Store original platform
const originalPlatform = process.platform;

// Helper to mock platform
function mockPlatform(platform: string) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    writable: true,
  });
}

// Restore platform after tests
afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    writable: true,
  });
});

// Import after mocks
import {
  getClaudeCodeDir,
  getClaudeProjectsDir,
  sanitizeProjectPath,
  unsanitizeProjectPath,
  getProjectHistoryDir,
  getSessionHistoryPath,
  getSessionSubagentsDir,
  getSessionsIndexPath,
  isLocalProject,
} from './claudePaths';

describe('claudePaths', () => {
  describe('getClaudeCodeDir', () => {
    it('should return ~/.claude path', () => {
      const home = os.homedir();
      const result = getClaudeCodeDir();
      expect(result).toContain('.claude');
      expect(result.startsWith(home)).toBe(true);
    });
  });

  describe('getClaudeProjectsDir', () => {
    it('should return ~/.claude/projects path', () => {
      const result = getClaudeProjectsDir();
      expect(result).toContain('.claude');
      expect(result).toContain('projects');
    });
  });

  describe('sanitizeProjectPath', () => {
    describe('on Windows', () => {
      beforeEach(() => {
        mockPlatform('win32');
      });

      it('should convert Windows path to sanitized format', () => {
        const result = sanitizeProjectPath('D:\\proyectos\\test');
        expect(result).toBe('D--proyectos-test');
      });

      it('should handle paths with underscores', () => {
        const result = sanitizeProjectPath('C:\\my_project\\sub_dir');
        expect(result).toBe('C--my-project-sub-dir');
      });

      it('should handle paths with trailing slash', () => {
        const result = sanitizeProjectPath('C:\\project\\');
        expect(result).toBe('C--project');
      });
    });

    describe('on Unix', () => {
      beforeEach(() => {
        mockPlatform('linux');
      });

      it('should convert Unix path to sanitized format', () => {
        const result = sanitizeProjectPath('/home/user/project');
        expect(result).toBe('-home-user-project');
      });

      it('should handle paths with underscores', () => {
        const result = sanitizeProjectPath('/home/user/my_project');
        expect(result).toBe('-home-user-my-project');
      });
    });
  });

  describe('unsanitizeProjectPath', () => {
    describe('on Windows', () => {
      beforeEach(() => {
        mockPlatform('win32');
      });

      it('should convert sanitized format back to Windows path', () => {
        const result = unsanitizeProjectPath('D--proyectos-test');
        expect(result).toBe('D:\\proyectos\\test');
      });
    });

    describe('on Unix', () => {
      beforeEach(() => {
        mockPlatform('linux');
      });

      it('should convert sanitized format back to Unix path', () => {
        const result = unsanitizeProjectPath('-home-user-project');
        expect(result).toBe('/home/user/project');
      });
    });
  });

  describe('getProjectHistoryDir', () => {
    it('should return correct history directory path', () => {
      mockPlatform('win32');
      const result = getProjectHistoryDir('D:\\test\\project');
      expect(result).toContain('.claude');
      expect(result).toContain('projects');
      expect(result).toContain('D--test-project');
    });
  });

  describe('getSessionHistoryPath', () => {
    it('should return path to session .jsonl file', () => {
      mockPlatform('win32');
      const result = getSessionHistoryPath('D:\\test\\project', 'session-123');
      expect(result).toContain('session-123.jsonl');
      expect(result).toContain('D--test-project');
    });
  });

  describe('getSessionSubagentsDir', () => {
    it('should return path to subagents directory', () => {
      mockPlatform('win32');
      const result = getSessionSubagentsDir('D:\\test\\project', 'session-123');
      expect(result).toContain('session-123');
      expect(result).toContain('subagents');
    });
  });

  describe('getSessionsIndexPath', () => {
    it('should return path to sessions-index.json', () => {
      mockPlatform('win32');
      const result = getSessionsIndexPath('D:\\test\\project');
      expect(result).toContain('sessions-index.json');
    });
  });

  describe('isLocalProject', () => {
    it('should return true for Windows paths with drive letter', () => {
      expect(isLocalProject('C:\\Users\\test')).toBe(true);
      expect(isLocalProject('D:\\proyectos\\app')).toBe(true);
    });

    it('should return true for Unix absolute paths', () => {
      expect(isLocalProject('/home/user/project')).toBe(true);
      expect(isLocalProject('/var/www/html')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isLocalProject('project/src')).toBe(false);
      expect(isLocalProject('./local')).toBe(false);
    });

    it('should return false for remote-like paths', () => {
      expect(isLocalProject('remote://server/project')).toBe(false);
      expect(isLocalProject('hostname:project')).toBe(false);
    });
  });
});
