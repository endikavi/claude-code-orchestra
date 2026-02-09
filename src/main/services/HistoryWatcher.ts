/**
 * HistoryWatcher - Watches Claude Code history files for Task and Subagent events
 *
 * This service is used as a fallback when --verbose mode is disabled.
 * It reads the .jsonl history files directly to detect Task tool usage and subagent spawning.
 *
 * Only works for LOCAL projects (not remote).
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import {
  getSessionHistoryPath,
  getSessionSubagentsDir,
  isLocalProject,
} from '../utils/claudePaths';
import type {
  HistoryMessage,
  HistoryToolUseBlock,
  HistoryToolResultBlock,
} from '@shared/types/history';
import type { SubagentStartedEvent, SubagentCompletedEvent } from '@shared/types/orchestration';
import type { TaskStartedEvent, TaskUpdatedEvent, TaskStatus } from '@shared/types/tasks';

// Polling interval for file changes (ms)
const POLL_INTERVAL = 500;

// Debounce time for processing changes (ms)
const DEBOUNCE_TIME = 100;

// Maximum age for pending tool use IDs before cleanup (30 minutes)
const PENDING_TOOL_USE_MAX_AGE_MS = 30 * 60 * 1000;

export class HistoryWatcher extends EventEmitter {
  private projectPath: string;
  private sessionId: string | null = null;
  private historyPath: string | null = null;
  private lastPosition: number = 0;
  private lastSize: number = 0;
  private fsWatcher: fs.FSWatcher | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isWatching: boolean = false;
  private pendingToolUseIds: Map<string, number> = new Map(); // Track Task tool_use_ids with timestamps for TTL

  // Subagent directory watchers
  private subagentDirWatcher: fs.FSWatcher | null = null;
  private subagentFileWatchers: Map<string, fs.FSWatcher> = new Map();
  private subagentLastPositions: Map<string, number> = new Map();

  constructor(projectPath: string, sessionId?: string) {
    super();
    this.projectPath = projectPath;
    if (sessionId) {
      this.setSessionId(sessionId);
    }
  }

  /**
   * Set the session ID to watch
   * Can be called after construction when session_id is captured from the stream
   */
  setSessionId(sessionId: string): void {
    // Stop watching old session if any
    if (this.isWatching && this.sessionId !== sessionId) {
      this.stopWatching();
    }

    this.sessionId = sessionId;
    this.historyPath = getSessionHistoryPath(this.projectPath, sessionId);
    this.lastPosition = 0;
    this.lastSize = 0;
  }

  /**
   * Start watching the history file for changes
   */
  start(): void {
    if (this.isWatching) {
      return;
    }

    if (!this.sessionId || !this.historyPath) {
      return;
    }

    this.isWatching = true;
    this.startPolling();
    this.startSubagentWatching();
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

    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.stopSubagentWatching();
  }

  /**
   * Start watching the file for changes using fs.watch with polling fallback
   */
  private startPolling(): void {
    // Check immediately
    this.checkForChanges();

    try {
      this.fsWatcher = fs.watch(this.historyPath!, { persistent: false }, () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.checkForChanges(), 300);
      });
      this.fsWatcher.on('error', () => {
        // Fallback to slower polling on fs.watch error
        this.fsWatcher = null;
        this.pollTimer = setInterval(() => this.checkForChanges(), 2000);
      });
    } catch {
      // Fallback to slower polling if fs.watch is unavailable
      this.pollTimer = setInterval(() => this.checkForChanges(), 2000);
    }
  }

  /**
   * Check if the history file has changed
   */
  private checkForChanges(): void {
    if (!this.historyPath || !this.isWatching) return;

    // Periodically clean up stale tool use IDs to prevent memory leaks
    this.cleanupStaleToolUseIds();

    fs.promises
      .stat(this.historyPath)
      .then((stats) => {
        const currentSize = stats.size;

        if (currentSize > this.lastSize) {
          // File has grown, schedule processing
          this.lastSize = currentSize;
          this.scheduleProcessing();
        }
      })
      .catch(() => {
        // File might not exist, be locked, or deleted, ignore
      });
  }

  /**
   * Clean up stale pending tool use IDs to prevent memory leaks
   * Tool use IDs older than PENDING_TOOL_USE_MAX_AGE_MS are removed
   */
  private cleanupStaleToolUseIds(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.pendingToolUseIds) {
      if (now - timestamp > PENDING_TOOL_USE_MAX_AGE_MS) {
        this.pendingToolUseIds.delete(id);
      }
    }
  }

  /**
   * Schedule processing with debounce to avoid reading too frequently
   */
  private scheduleProcessing(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      try {
        this.processNewLines();
      } catch (err) {
        console.error('[HistoryWatcher] Error processing new lines:', err);
        this.emit('error', err);
      }
    }, DEBOUNCE_TIME);
  }

  /**
   * Process new lines in the history file
   */
  private processNewLines(): void {
    if (!this.historyPath || !this.isWatching) return;

    try {
      const fd = fs.openSync(this.historyPath, 'r');

      try {
        // Seek to last position
        const buffer = Buffer.alloc(64 * 1024); // 64KB buffer
        let position = this.lastPosition;
        let lineBuffer = '';
        let keepReading = true;

        while (keepReading) {
          const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position);
          if (bytesRead === 0) {
            keepReading = false;
            continue;
          }

          position += bytesRead;
          lineBuffer += buffer.toString('utf-8', 0, bytesRead);

          // Process complete lines
          const lines = lineBuffer.split('\n');
          // Keep the last incomplete line in the buffer
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const message = JSON.parse(trimmed) as HistoryMessage;
              this.handleMessage(message);
            } catch {
              // Not valid JSON, skip
            }
          }
        }

        // Update position (accounting for any incomplete line we're keeping)
        this.lastPosition = position - Buffer.byteLength(lineBuffer, 'utf-8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (error) {
      console.error('[HistoryWatcher] Error reading history file:', error);
    }
  }

  /**
   * Handle a parsed message from the history file
   */
  private handleMessage(message: HistoryMessage): void {
    switch (message.type) {
      case 'assistant':
        this.detectSubagentStart(message);
        this.detectTaskCreate(message);
        this.detectTaskUpdate(message);
        break;
      case 'user':
        this.detectSubagentCompletion(message);
        break;
      case 'progress':
        this.detectAgentProgress(message);
        break;
    }
  }

  /**
   * Detect Task tool usage (subagent spawning)
   */
  private detectSubagentStart(message: HistoryMessage): void {
    if (!message.message?.content || !Array.isArray(message.message.content)) return;

    for (const block of message.message.content) {
      const toolBlock = block as HistoryToolUseBlock;
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'Task') {
        const event: SubagentStartedEvent = {
          id: toolBlock.id,
          description: toolBlock.input?.description || 'Unknown task',
          prompt: toolBlock.input?.prompt || '',
          subagentType: toolBlock.input?.subagent_type || 'general-purpose',
        };

        // Track this tool_use_id with timestamp for TTL cleanup
        this.pendingToolUseIds.set(toolBlock.id, Date.now());

        this.emit('subagent_started', event);
      }
    }
  }

  /**
   * Detect subagent completion (tool_result for a Task tool call)
   */
  private detectSubagentCompletion(message: HistoryMessage): void {
    if (!message.message?.content || !Array.isArray(message.message.content)) return;

    for (const block of message.message.content) {
      const resultBlock = block as HistoryToolResultBlock;
      if (resultBlock.type === 'tool_result') {
        // Check if this is a result for a Task tool we tracked
        if (this.pendingToolUseIds.has(resultBlock.tool_use_id)) {
          this.pendingToolUseIds.delete(resultBlock.tool_use_id);

          // Extract result content
          let resultText: string;
          if (typeof resultBlock.content === 'string') {
            resultText = resultBlock.content;
          } else if (Array.isArray(resultBlock.content)) {
            resultText = resultBlock.content
              .filter((item) => item.type === 'text' && item.text)
              .map((item) => item.text)
              .join('\n');
          } else {
            resultText = '';
          }

          const event: SubagentCompletedEvent = {
            id: resultBlock.tool_use_id,
            result: resultText,
            isError: resultBlock.is_error || false,
          };

          this.emit('subagent_completed', event);
        }
      }
    }
  }

  /**
   * Detect TaskCreate tool usage
   */
  private detectTaskCreate(message: HistoryMessage): void {
    if (!message.message?.content || !Array.isArray(message.message.content)) return;

    for (const block of message.message.content) {
      const toolBlock = block as HistoryToolUseBlock;
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'TaskCreate') {
        const event: TaskStartedEvent = {
          id: toolBlock.id,
          subject: toolBlock.input?.subject || 'Unknown task',
          description: toolBlock.input?.description || '',
          activeForm: toolBlock.input?.activeForm,
        };

        this.emit('task_created', event);
      }
    }
  }

  /**
   * Detect TaskUpdate tool usage
   */
  private detectTaskUpdate(message: HistoryMessage): void {
    if (!message.message?.content || !Array.isArray(message.message.content)) return;

    for (const block of message.message.content) {
      const toolBlock = block as HistoryToolUseBlock;
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'TaskUpdate') {
        const taskId = toolBlock.input?.taskId || '';
        const event: TaskUpdatedEvent = {
          id: taskId,
          status: toolBlock.input?.status as TaskStatus | undefined,
          subject: toolBlock.input?.subject,
          description: toolBlock.input?.description,
          activeForm: toolBlock.input?.activeForm,
          owner: toolBlock.input?.owner,
          addBlocks: toolBlock.input?.addBlocks,
          addBlockedBy: toolBlock.input?.addBlockedBy,
          metadata: toolBlock.input?.metadata,
        };

        this.emit('task_updated', event);
      }
    }
  }

  /**
   * Detect agent progress messages
   */
  private detectAgentProgress(message: HistoryMessage): void {
    if (message.data?.type === 'agent_progress' && message.data.agentId) {
      this.emit('agent_progress', {
        agentId: message.data.agentId,
        status: message.data.status,
        prompt: message.data.prompt,
      });
    }
  }

  // ==================== Subagent Directory Watching ====================

  /**
   * Start watching the subagents directory for this session
   * Subagent histories are stored in <session_id>/subagents/agent-<id>.jsonl
   */
  private startSubagentWatching(): void {
    if (!this.sessionId) return;

    const subagentsDir = getSessionSubagentsDir(this.projectPath, this.sessionId);

    // Check if directory exists, if not we'll create a watcher for when it appears
    if (!fs.existsSync(subagentsDir)) {
      // Watch parent directory for subagents dir creation
      const parentDir = path.dirname(subagentsDir);
      if (fs.existsSync(parentDir)) {
        try {
          this.subagentDirWatcher = fs.watch(parentDir, (eventType, filename) => {
            if (filename === 'subagents' && fs.existsSync(subagentsDir)) {
              this.watchSubagentsDirectory(subagentsDir);
            }
          });
        } catch (error) {
          console.error('[HistoryWatcher] Error watching for subagents dir:', error);
        }
      }
      return;
    }

    this.watchSubagentsDirectory(subagentsDir);
  }

  /**
   * Watch the subagents directory for new .jsonl files
   */
  private watchSubagentsDirectory(subagentsDir: string): void {
    // Stop existing watcher
    if (this.subagentDirWatcher) {
      this.subagentDirWatcher.close();
    }

    try {
      // Watch for new files
      this.subagentDirWatcher = fs.watch(subagentsDir, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          const filePath = path.join(subagentsDir, filename);
          if (!this.subagentFileWatchers.has(filePath) && fs.existsSync(filePath)) {
            this.watchSubagentFile(filePath);
          }
        }
      });

      // Watch existing files
      const files = fs.readdirSync(subagentsDir);
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          this.watchSubagentFile(path.join(subagentsDir, file));
        }
      }
    } catch (error) {
      console.error('[HistoryWatcher] Error watching subagents directory:', error);
    }
  }

  /**
   * Watch a specific subagent history file
   */
  private watchSubagentFile(filePath: string): void {
    if (this.subagentFileWatchers.has(filePath)) return;

    // Initialize position to current file size
    try {
      const stats = fs.statSync(filePath);
      this.subagentLastPositions.set(filePath, stats.size);
    } catch {
      this.subagentLastPositions.set(filePath, 0);
    }

    try {
      const watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          try {
            this.processSubagentFile(filePath);
          } catch (err) {
            console.error(`[HistoryWatcher] Error processing subagent file ${filePath}:`, err);
          }
        }
      });

      this.subagentFileWatchers.set(filePath, watcher);
    } catch (error) {
      console.error(`[HistoryWatcher] Error watching subagent file ${filePath}:`, error);
    }
  }

  /**
   * Process new lines in a subagent history file
   */
  private processSubagentFile(filePath: string): void {
    const lastPosition = this.subagentLastPositions.get(filePath) || 0;

    try {
      const stats = fs.statSync(filePath);
      if (stats.size <= lastPosition) return;

      const fd = fs.openSync(filePath, 'r');

      try {
        const buffer = Buffer.alloc(64 * 1024);
        let position = lastPosition;
        let lineBuffer = '';
        let keepReading = true;

        while (keepReading) {
          const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position);
          if (bytesRead === 0) {
            keepReading = false;
            continue;
          }

          position += bytesRead;
          lineBuffer += buffer.toString('utf-8', 0, bytesRead);

          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const message = JSON.parse(trimmed) as HistoryMessage;
              // Subagent files contain the same message format
              // We can emit these as additional context
              this.emit('subagent_message', {
                filePath,
                message,
              });
            } catch {
              // Not valid JSON, skip
            }
          }
        }

        this.subagentLastPositions.set(filePath, position - Buffer.byteLength(lineBuffer, 'utf-8'));
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // File might be locked or deleted
    }
  }

  /**
   * Stop watching subagent files
   */
  private stopSubagentWatching(): void {
    if (this.subagentDirWatcher) {
      this.subagentDirWatcher.close();
      this.subagentDirWatcher = null;
    }

    this.subagentFileWatchers.forEach((watcher) => {
      watcher.close();
    });
    this.subagentFileWatchers.clear();
    this.subagentLastPositions.clear();
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if the watcher is currently active
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

/**
 * Factory function to create a HistoryWatcher for a project
 * Returns null if the project is not local
 */
export function createHistoryWatcher(
  projectPath: string,
  sessionId?: string
): HistoryWatcher | null {
  if (!isLocalProject(projectPath)) {
    return null;
  }

  return new HistoryWatcher(projectPath, sessionId);
}
