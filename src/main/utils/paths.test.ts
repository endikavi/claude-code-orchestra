import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pathProvider module - this is what paths.ts actually uses
vi.mock('./pathProvider', () => ({
  getUserDataPath: vi.fn(() => '/mock/userData'),
  isElectronAvailable: vi.fn(() => true),
  isHeadlessMode: vi.fn(() => false),
  setUserDataPath: vi.fn(),
}));

// Mock os module with importOriginal pattern
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => '/mock/home'),
  };
});

// Import after mocks are set up
import {
  getUserDataPath,
  getDatabasePath,
  getClaudeConfigPaths,
  getProjectClaudeConfig,
  getProjectClaudeMd,
  isAbsolutePath,
  normalizePath,
  getClaudeCodePath,
  getClaudeCodeProjectsPath,
} from './paths';

describe('paths utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserDataPath', () => {
    it('should return the userData path from pathProvider', () => {
      const result = getUserDataPath();
      expect(result).toBe('/mock/userData');
    });
  });

  describe('getDatabasePath', () => {
    it('should return the database file path', () => {
      const result = getDatabasePath();
      expect(result).toContain('claude-code-orchestra.db');
      // Platform-agnostic check for userData
      expect(result.replace(/\\/g, '/')).toContain('/mock/userData');
    });
  });

  describe('getClaudeConfigPaths', () => {
    it('should return global config paths', () => {
      const result = getClaudeConfigPaths();
      expect(result.globalConfig).toContain('.claude.json');
      expect(result.globalSettings).toContain('.claude');
      expect(result.globalSettings).toContain('settings.json');
    });
  });

  describe('getProjectClaudeConfig', () => {
    it('should return project-specific claude config path', () => {
      const result = getProjectClaudeConfig('/my/project');
      // Platform-agnostic check
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toContain('/my/project');
      expect(result).toContain('.claude');
      expect(result).toContain('settings.json');
    });
  });

  describe('getProjectClaudeMd', () => {
    it('should return CLAUDE.md path for project', () => {
      const result = getProjectClaudeMd('/my/project');
      // Platform-agnostic check
      const normalized = result.replace(/\\/g, '/');
      expect(normalized).toContain('/my/project');
      expect(result).toContain('CLAUDE.md');
    });
  });

  describe('isAbsolutePath', () => {
    it('should return true for Unix absolute paths', () => {
      expect(isAbsolutePath('/home/user')).toBe(true);
      expect(isAbsolutePath('/var/log')).toBe(true);
      expect(isAbsolutePath('/')).toBe(true);
    });

    it('should return true for Windows drive paths', () => {
      expect(isAbsolutePath('C:\\')).toBe(true);
      expect(isAbsolutePath('D:\\projects')).toBe(true);
      expect(isAbsolutePath('C:/')).toBe(true);
      expect(isAbsolutePath('d:/folder')).toBe(true);
    });

    it('should return true for UNC paths', () => {
      expect(isAbsolutePath('\\\\server\\share')).toBe(true);
      expect(isAbsolutePath('//server/share')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isAbsolutePath('relative/path')).toBe(false);
      expect(isAbsolutePath('./relative')).toBe(false);
      expect(isAbsolutePath('../parent')).toBe(false);
      expect(isAbsolutePath('file.txt')).toBe(false);
    });
  });

  describe('normalizePath', () => {
    it('should normalize paths for current platform', () => {
      const result = normalizePath('/path//to\\file');
      // Result depends on platform, just verify it normalizes
      expect(result).not.toContain('//');
      expect(result).not.toContain('\\\\');
    });

    it('should handle already normalized paths', () => {
      const path = process.platform === 'win32' ? 'C:\\path\\to\\file' : '/path/to/file';
      const result = normalizePath(path);
      expect(result).toBe(path);
    });
  });

  describe('getClaudeCodePath', () => {
    const originalEnv = process.env.APPDATA;

    beforeEach(() => {
      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';
    });

    afterEach(() => {
      process.env.APPDATA = originalEnv;
    });

    it('should return path containing .claude', () => {
      const result = getClaudeCodePath();
      expect(result).toContain('.claude');
    });
  });

  describe('getClaudeCodeProjectsPath', () => {
    it('should return projects subdirectory of claude code path', () => {
      const result = getClaudeCodeProjectsPath();
      expect(result).toContain('.claude');
      expect(result).toContain('projects');
    });
  });
});
