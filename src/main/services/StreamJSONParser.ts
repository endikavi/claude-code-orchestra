import { EventEmitter } from 'events';
import type { StreamMessage, InstanceStatus } from '@shared/types';

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
        break;
      case 'user':
        this.emit('user', message);
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
        return 'completed';

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
