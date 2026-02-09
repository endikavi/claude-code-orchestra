// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof fs;
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    openSync: vi.fn(),
    readSync: vi.fn(),
    closeSync: vi.fn(),
    watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
    readdirSync: vi.fn(),
    promises: {
      ...actual.promises,
      stat: vi.fn(),
    },
  };
});

// Mock the claudePaths module
vi.mock('../utils/claudePaths', () => ({
  getProjectHistoryDir: vi.fn((projectPath: string) => `/mock/.claude/projects/${projectPath}`),
  getSessionHistoryPath: vi.fn(
    (projectPath: string, sessionId: string) =>
      `/mock/.claude/projects/${projectPath}/${sessionId}.jsonl`
  ),
  getSessionSubagentsDir: vi.fn(
    (projectPath: string, sessionId: string) =>
      `/mock/.claude/projects/${projectPath}/${sessionId}/subagents`
  ),
  isLocalProject: vi.fn(() => true),
}));

// Import after mocks are set up
import { HistoryWatcher, createHistoryWatcher } from './HistoryWatcher';
import { isLocalProject } from '../utils/claudePaths';

describe('HistoryWatcher', () => {
  let watcher: HistoryWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fs.promises.stat rejects (file doesn't exist) and readdirSync returns []
    vi.mocked(fs.promises.stat).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    watcher = new HistoryWatcher('/test/project');
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
    }
  });

  describe('constructor', () => {
    it('should create a watcher with project path', () => {
      expect(watcher).toBeInstanceOf(HistoryWatcher);
      expect(watcher).toBeInstanceOf(EventEmitter);
    });

    it('should accept optional sessionId in constructor', () => {
      const watcherWithSession = new HistoryWatcher('/test/project', 'session-123');
      expect(watcherWithSession.getSessionId()).toBe('session-123');
      watcherWithSession.stop();
    });
  });

  describe('setSessionId', () => {
    it('should set the session ID', () => {
      watcher.setSessionId('new-session');
      expect(watcher.getSessionId()).toBe('new-session');
    });

    it('should update session ID when already set', () => {
      watcher.setSessionId('session-1');
      watcher.setSessionId('session-2');
      expect(watcher.getSessionId()).toBe('session-2');
    });
  });

  describe('start', () => {
    it('should not start without session ID', () => {
      watcher.start();
      expect(watcher.isActive()).toBe(false);
    });

    it('should start when session ID is set', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      watcher.setSessionId('test-session');
      watcher.start();

      expect(watcher.isActive()).toBe(true);
    });

    it('should emit ready event when started', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const readySpy = vi.fn();
      watcher.on('ready', readySpy);

      watcher.setSessionId('test-session');
      watcher.start();

      expect(readySpy).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the watcher', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      watcher.setSessionId('test-session');
      watcher.start();
      expect(watcher.isActive()).toBe(true);

      watcher.stop();
      expect(watcher.isActive()).toBe(false);
    });

    it('should emit close event when stopped', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const closeSpy = vi.fn();
      watcher.on('close', closeSpy);

      watcher.setSessionId('test-session');
      watcher.start();
      watcher.stop();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('message parsing', () => {
    // Helper to create a mock file read scenario
    function setupMockFileRead(lines: string[]) {
      const content = lines.join('\n') + '\n';
      const buffer = Buffer.from(content);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        size: buffer.length,
      } as fs.Stats);
      // checkForChanges() uses fs.promises.stat (async)
      vi.mocked(fs.promises.stat).mockResolvedValue({
        size: buffer.length,
      } as fs.Stats);
      vi.mocked(fs.openSync).mockReturnValue(42); // mock fd
      vi.mocked(fs.readSync).mockImplementation(
        (fd: number, buf: Buffer, offset: number, length: number, position: number | null) => {
          if (position === null || position >= buffer.length) return 0;
          const bytesToRead = Math.min(length, buffer.length - position);
          buffer.copy(buf, offset, position, position + bytesToRead);
          return bytesToRead;
        }
      );
      vi.mocked(fs.closeSync).mockReturnValue(undefined);
    }

    it('should detect Task tool usage (subagent start)', async () => {
      const taskMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'task-123',
              name: 'Task',
              input: {
                description: 'Test task',
                prompt: 'Do something',
                subagent_type: 'Explore',
              },
            },
          ],
        },
      };

      setupMockFileRead([JSON.stringify(taskMessage)]);

      const subagentSpy = vi.fn();
      watcher.on('subagent_started', subagentSpy);

      watcher.setSessionId('test-session');
      watcher.start();

      // Wait for polling to trigger
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(subagentSpy).toHaveBeenCalledWith({
        id: 'task-123',
        description: 'Test task',
        prompt: 'Do something',
        subagentType: 'Explore',
      });
    });

    it('should detect TaskCreate tool usage', async () => {
      const taskCreateMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'create-123',
              name: 'TaskCreate',
              input: {
                subject: 'Fix bug',
                description: 'Fix the login bug',
                activeForm: 'Fixing bug',
              },
            },
          ],
        },
      };

      setupMockFileRead([JSON.stringify(taskCreateMessage)]);

      const taskSpy = vi.fn();
      watcher.on('task_created', taskSpy);

      watcher.setSessionId('test-session');
      watcher.start();

      // Wait for polling to trigger
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(taskSpy).toHaveBeenCalledWith({
        id: 'create-123',
        subject: 'Fix bug',
        description: 'Fix the login bug',
        activeForm: 'Fixing bug',
      });
    });

    it('should detect TaskUpdate tool usage', async () => {
      const taskUpdateMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'update-123',
              name: 'TaskUpdate',
              input: {
                taskId: 'task-1',
                status: 'completed',
              },
            },
          ],
        },
      };

      setupMockFileRead([JSON.stringify(taskUpdateMessage)]);

      const updateSpy = vi.fn();
      watcher.on('task_updated', updateSpy);

      watcher.setSessionId('test-session');
      watcher.start();

      // Wait for polling to trigger
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-1',
          status: 'completed',
        })
      );
    });

    it('should detect subagent completion via tool_result', async () => {
      // First we need a Task tool_use to track
      const taskMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'task-123',
              name: 'Task',
              input: {
                description: 'Test task',
                prompt: 'Do something',
                subagent_type: 'Explore',
              },
            },
          ],
        },
      };

      const resultMessage = {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'task-123',
              content: 'Task completed successfully',
              is_error: false,
            },
          ],
        },
      };

      setupMockFileRead([JSON.stringify(taskMessage), JSON.stringify(resultMessage)]);

      const startSpy = vi.fn();
      const completeSpy = vi.fn();
      watcher.on('subagent_started', startSpy);
      watcher.on('subagent_completed', completeSpy);

      watcher.setSessionId('test-session');
      watcher.start();

      // Wait for polling to trigger
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(startSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalledWith({
        id: 'task-123',
        result: 'Task completed successfully',
        isError: false,
      });
    });

    it('should handle messages with missing content gracefully', async () => {
      const emptyMessage = {
        type: 'assistant',
        message: {},
      };

      setupMockFileRead([JSON.stringify(emptyMessage)]);

      const subagentSpy = vi.fn();
      watcher.on('subagent_started', subagentSpy);

      watcher.setSessionId('test-session');
      watcher.start();

      // Wait for polling to trigger
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(subagentSpy).not.toHaveBeenCalled();
    });

    it('should skip invalid JSON lines', async () => {
      const validMessage = {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'task-123',
              name: 'TaskCreate',
              input: {
                subject: 'Valid task',
                description: 'Test',
              },
            },
          ],
        },
      };

      setupMockFileRead(['invalid json here', JSON.stringify(validMessage)]);

      const taskSpy = vi.fn();
      const errorSpy = vi.fn();
      watcher.on('task_created', taskSpy);
      watcher.on('error', errorSpy);

      watcher.setSessionId('test-session');
      watcher.start();

      // Wait for polling to trigger
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Should still process the valid message
      expect(taskSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Valid task',
        })
      );
      // Should not emit error for invalid JSON (silently skipped)
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('createHistoryWatcher factory', () => {
    it('should create watcher for local projects', () => {
      vi.mocked(isLocalProject).mockReturnValue(true);

      const result = createHistoryWatcher('/local/project', 'session-123');

      expect(result).toBeInstanceOf(HistoryWatcher);
      result?.stop();
    });

    it('should return null for non-local projects', () => {
      vi.mocked(isLocalProject).mockReturnValue(false);

      const result = createHistoryWatcher('remote://project', 'session-123');

      expect(result).toBeNull();
    });
  });
});
