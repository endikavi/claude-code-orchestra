import { EventEmitter } from 'events';
import type { StreamMessage, InstanceStatus } from '@shared/types';
import type { SubagentStartedEvent, SubagentCompletedEvent } from '@shared/types/orchestration';

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
        break;
      case 'user':
        this.emit('user', message);
        // Check for tool_result (subagent completion)
        this.detectSubagentCompletion(message);
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
      // Debug: Log all tool_use blocks to understand the structure
      if (toolBlock.type === 'tool_use') {
        console.log(
          `[StreamJSONParser] tool_use detected: name="${toolBlock.name}", id="${toolBlock.id}"`
        );
        if (toolBlock.input) {
          console.log(`[StreamJSONParser] tool_use input keys:`, Object.keys(toolBlock.input));
        }
      }
      if (toolBlock.type === 'tool_use' && toolBlock.name === 'Task') {
        console.log(`[StreamJSONParser] Task tool detected! Creating subagent event`);
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
