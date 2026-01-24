import { EventEmitter } from 'events';
import type { StreamMessage, InstanceStatus } from '@shared/types';
import type { SubagentStartedEvent, SubagentCompletedEvent } from '@shared/types/orchestration';
import type {
  TaskStartedEvent,
  TaskUpdatedEvent,
  TaskListEvent,
  TaskListItem,
  TaskStatus,
} from '@shared/types/tasks';
import type { InstanceWorkStatus } from '@shared/types/sharedContext';

// Event emitted when context should be auto-published
export interface ContextAutoPublishEvent {
  workStatus?: InstanceWorkStatus;
  currentFiles?: string[];
  currentTask?: string;
}

// Type for tool_use content block
interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input?: {
    description?: string;
    prompt?: string;
    subagent_type?: string;
    [key: string]: unknown;
  };
}

// Type for tool_result content block
interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

/**
 * Parses the stream-json output from Claude CLI
 * Claude CLI in --output-format stream-json mode outputs one JSON object per line
 */
export class StreamJSONParser extends EventEmitter {
  private buffer: string = '';
  private currentStatus: InstanceStatus = 'starting';

  constructor() {
    super();
  }

  /**
   * Process incoming data chunk
   */
  process(data: string): void {
    this.buffer += data;
    this.processBuffer();
  }

  /**
   * Process the buffer and extract complete JSON lines
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as StreamMessage;
        this.handleMessage(message);
      } catch {
        // Not valid JSON, emit as raw output
        this.emit('raw', trimmed);
      }
    }
  }

  /**
   * Handle a parsed message and emit appropriate events
   */
  private handleMessage(message: StreamMessage): void {
    this.emit('message', message);

    // Update status based on message type
    const newStatus = this.inferStatus(message);
    if (newStatus !== this.currentStatus) {
      this.currentStatus = newStatus;
      this.emit('status', newStatus);
    }

    // Emit specific events for different message types
    switch (message.type) {
      case 'system':
        this.emit('system', message);
        break;
      case 'assistant':
        this.emit('assistant', message);
        this.processAssistantMessage(message);
        // Check for Task tool usage (subagent spawning)
        this.detectSubagentStart(message);
        // Check for TaskCreate/TaskUpdate/TaskList tools
        this.detectTaskCreate(message);
        this.detectTaskUpdate(message);
        this.detectTaskList(message);
        // Auto-detect context from tool usage
        this.detectContextFromTools(message);
        break;
      case 'user':
        this.emit('user', message);
        // Check for tool_result (subagent completion)
        this.detectSubagentCompletion(message);
        // Check for TaskList tool_result
        this.detectTaskListResult(message);
        break;
      case 'result':
        this.emit('result', message);
        break;
    }
  }

  /**
   * Process assistant message content blocks
   */
  private processAssistantMessage(message: StreamMessage): void {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      switch (block.type) {
        case 'text':
          this.emit('text', block.text);
          break;
        case 'tool_use':
          this.emit('tool_use', block);
          break;
        case 'tool_result':
          this.emit('tool_result', block);
          break;
        case 'thinking':
          this.emit('thinking', block.thinking);
          break;
      }
    }
  }

  /**
   * Detect when Claude spawns a subagent using the Task tool
   */
  private detectSubagentStart(message: StreamMessage): void {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      const toolBlock = block as ToolUseBlock;
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'Task') {
        const event: SubagentStartedEvent = {
          id: toolBlock.id,
          description: toolBlock.input?.description || 'Unknown task',
          prompt: toolBlock.input?.prompt || '',
          subagentType: toolBlock.input?.subagent_type || 'general-purpose',
        };
        this.emit('subagent_started', event);
      }
    }
  }

  /**
   * Detect when a subagent completes (tool_result for a Task tool call)
   * Note: We emit this for ALL tool_results so the tracker can match them
   */
  private detectSubagentCompletion(message: StreamMessage): void {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      const resultBlock = block as ToolResultBlock;
      if (resultBlock.type === 'tool_result') {
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

  // ==================== Task Tool Detection (Claude Code v2.1.16+) ====================

  /**
   * Detect when Claude creates a task using TaskCreate tool
   */
  private detectTaskCreate(message: StreamMessage): void {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      const toolBlock = block as ToolUseBlock;
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'TaskCreate') {
        const event: TaskStartedEvent = {
          id: toolBlock.id,
          subject: (toolBlock.input?.subject as string) || 'Unknown task',
          description: (toolBlock.input?.description as string) || '',
          activeForm: toolBlock.input?.activeForm as string | undefined,
        };
        this.emit('task_created', event);
      }
    }
  }

  /**
   * Detect when Claude updates a task using TaskUpdate tool
   */
  private detectTaskUpdate(message: StreamMessage): void {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      const toolBlock = block as ToolUseBlock;
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'TaskUpdate') {
        const taskId = (toolBlock.input?.taskId as string) || '';
        const event: TaskUpdatedEvent = {
          id: taskId,
          status: toolBlock.input?.status as TaskStatus | undefined,
          subject: toolBlock.input?.subject as string | undefined,
          description: toolBlock.input?.description as string,
          activeForm: toolBlock.input?.activeForm as string | undefined,
          owner: toolBlock.input?.owner as string | undefined,
          addBlocks: toolBlock.input?.addBlocks as string[] | undefined,
          addBlockedBy: toolBlock.input?.addBlockedBy as string[] | undefined,
          metadata: toolBlock.input?.metadata as Record<string, unknown> | undefined,
        };
        this.emit('task_updated', event);
      }
    }
  }

  /**
   * Detect when Claude calls TaskList tool (we'll get the result in tool_result)
   */
  private detectTaskList(message: StreamMessage): void {
    if (!message.message?.content) return;

    for (const block of message.message.content) {
      const toolBlock = block as ToolUseBlock;
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'TaskList') {
        // Store the tool_use_id so we can match the result later
        this.pendingTaskListId = toolBlock.id;
      }
    }
  }

  // Track pending TaskList tool_use_id to match with result
  private pendingTaskListId: string | null = null;

  /**
   * Detect TaskList tool_result and parse the task list
   */
  private detectTaskListResult(message: StreamMessage): void {
    if (!message.message?.content || !this.pendingTaskListId) return;

    for (const block of message.message.content) {
      const resultBlock = block as ToolResultBlock;
      if (
        resultBlock.type === 'tool_result' &&
        resultBlock.tool_use_id === this.pendingTaskListId
      ) {
        this.pendingTaskListId = null;

        // Parse the task list from the result
        let resultText: string;
        if (typeof resultBlock.content === 'string') {
          resultText = resultBlock.content;
        } else if (Array.isArray(resultBlock.content)) {
          resultText = resultBlock.content
            .filter((item) => item.type === 'text' && item.text)
            .map((item) => item.text)
            .join('\n');
        } else {
          return;
        }

        // Try to parse the task list (it may be formatted text or JSON)
        const tasks = this.parseTaskListResult(resultText);
        if (tasks.length > 0) {
          const event: TaskListEvent = { tasks };
          this.emit('task_list', event);
        }
      }
    }
  }

  /**
   * Parse TaskList tool result into structured task list
   * The result format varies - could be JSON array or formatted text
   */
  private parseTaskListResult(resultText: string): TaskListItem[] {
    const tasks: TaskListItem[] = [];

    // Define expected shape for JSON parsing
    interface ParsedTaskItem {
      id?: string;
      subject?: string;
      status?: TaskStatus;
      owner?: string;
      blockedBy?: string[];
    }

    // Try parsing as JSON first
    try {
      const parsed: unknown = JSON.parse(resultText);
      if (Array.isArray(parsed)) {
        for (const item of parsed as ParsedTaskItem[]) {
          if (item.id && item.subject) {
            tasks.push({
              id: item.id,
              subject: item.subject,
              status: item.status || 'pending',
              owner: item.owner,
              blockedBy: item.blockedBy,
            });
          }
        }
        return tasks;
      }
    } catch {
      // Not JSON, try parsing text format
    }

    // Parse text format (lines like "- #1 [pending] Task subject")
    const lines = resultText.split('\n');
    for (const line of lines) {
      // Match patterns like "#1. [pending] Subject" or "- #1 [in_progress] Subject"
      const match = line.match(/#(\d+)\.?\s*\[(\w+(?:_\w+)?)\]\s*(.+?)(?:\s*\(blocked by:.*\))?$/);
      if (match) {
        const [, id, status, subject] = match;
        tasks.push({
          id,
          subject: subject.trim(),
          status: status as TaskStatus,
        });
      }
    }

    return tasks;
  }

  /**
   * Infer the instance status from a message
   */
  private inferStatus(message: StreamMessage): InstanceStatus {
    switch (message.type) {
      case 'system':
        return 'starting';

      case 'assistant':
        // Check if there's a tool_use block that needs permission
        if (message.message?.content) {
          const hasToolUse = message.message.content.some((block) => block.type === 'tool_use');
          if (hasToolUse) {
            return 'tool_executing';
          }
        }
        return 'running';

      case 'user':
        // User messages are typically tool results or input
        return 'running';

      case 'result':
        if (message.is_error) {
          return 'error';
        }
        // In interactive stream-json mode, a result message means Claude finished
        // one turn and is waiting for more input. The actual 'completed' status
        // is set when the process exits.
        return 'waiting_input';

      default:
        return this.currentStatus;
    }
  }

  /**
   * Get the current status
   */
  getStatus(): InstanceStatus {
    return this.currentStatus;
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    this.buffer = '';
    this.currentStatus = 'starting';
    this.pendingTaskListId = null;
  }

  /**
   * Detect context from tool usage and emit auto-publish event
   * This allows automatic context sharing without explicit calls
   */
  private detectContextFromTools(message: StreamMessage): void {
    if (!message.message?.content) return;

    const files: string[] = [];
    let workStatus: InstanceWorkStatus | undefined;

    for (const block of message.message.content) {
      const toolBlock = block as ToolUseBlock;
      if (toolBlock.type !== 'tool_use') continue;

      const toolName = toolBlock.name;
      const input = toolBlock.input || {};

      // Extract file paths from various tools
      switch (toolName) {
        case 'Read':
        case 'Edit':
        case 'Write':
          if (typeof input.file_path === 'string') {
            files.push(input.file_path);
          }
          // Infer work status
          if (toolName === 'Read') {
            workStatus = workStatus || 'exploring';
          } else {
            workStatus = 'implementing';
          }
          break;

        case 'Glob':
        case 'Grep':
          if (typeof input.pattern === 'string') {
            files.push(`pattern:${input.pattern}`);
          }
          workStatus = workStatus || 'exploring';
          break;

        case 'Bash': {
          const command = input.command;
          if (typeof command === 'string') {
            // Detect testing
            if (/\b(test|jest|vitest|pytest|npm run test|yarn test)\b/i.test(command)) {
              workStatus = 'testing';
            }
            // Detect linting/type checking
            else if (/\b(lint|typecheck|tsc|eslint)\b/i.test(command)) {
              workStatus = 'reviewing';
            }
          }
          break;
        }

        case 'EnterPlanMode':
          workStatus = 'planning';
          break;

        case 'AskUserQuestion':
          workStatus = 'waiting';
          break;

        case 'NotebookEdit':
          if (typeof input.notebook_path === 'string') {
            files.push(input.notebook_path);
          }
          workStatus = 'implementing';
          break;
      }
    }

    // Only emit if we detected something
    if (files.length > 0 || workStatus) {
      const event: ContextAutoPublishEvent = {};
      if (files.length > 0) {
        event.currentFiles = files;
      }
      if (workStatus) {
        event.workStatus = workStatus;
      }
      this.emit('context_auto_publish', event);
    }
  }

  /**
   * Flush any remaining buffer content
   */
  flush(): void {
    if (this.buffer.trim()) {
      try {
        const message = JSON.parse(this.buffer.trim()) as StreamMessage;
        this.handleMessage(message);
      } catch {
        this.emit('raw', this.buffer.trim());
      }
    }
    this.buffer = '';
  }
}
