import { describe, it, expect } from 'vitest';
import { getLastAssistantText, truncateText } from './messageUtils';
import type { StreamMessage } from '@shared/types';

describe('getLastAssistantText', () => {
  it('should return null for empty messages array', () => {
    const result = getLastAssistantText([]);
    expect(result).toBeNull();
  });

  it('should return null for messages without assistant messages', () => {
    const messages: StreamMessage[] = [{ type: 'user' }, { type: 'system' }];
    const result = getLastAssistantText(messages);
    expect(result).toBeNull();
  });

  it('should return null for assistant message without content', () => {
    const messages: StreamMessage[] = [
      { type: 'assistant' },
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-sonnet',
        },
      },
    ];
    const result = getLastAssistantText(messages);
    expect(result).toBeNull();
  });

  it('should return the last text block from the last assistant message', () => {
    const messages: StreamMessage[] = [
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'First message' }],
          model: 'claude-sonnet',
        },
      },
      {
        type: 'assistant',
        message: {
          id: 'msg-2',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Second message' }],
          model: 'claude-sonnet',
        },
      },
    ];
    const result = getLastAssistantText(messages);
    expect(result).toBe('Second message');
  });

  it('should return the last text block when multiple content blocks exist', () => {
    const messages: StreamMessage[] = [
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'First text' },
            { type: 'tool_use', id: 'tool-1', name: 'read', input: {} },
            { type: 'text', text: 'Last text' },
          ],
          model: 'claude-sonnet',
        },
      },
    ];
    const result = getLastAssistantText(messages);
    expect(result).toBe('Last text');
  });

  it('should skip tool_use blocks and find the last text block', () => {
    const messages: StreamMessage[] = [
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'The text block' },
            { type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'ls' } },
          ],
          model: 'claude-sonnet',
        },
      },
    ];
    const result = getLastAssistantText(messages);
    expect(result).toBe('The text block');
  });

  it('should handle messages with only tool_use blocks', () => {
    const messages: StreamMessage[] = [
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'read', input: {} }],
          model: 'claude-sonnet',
        },
      },
    ];
    const result = getLastAssistantText(messages);
    expect(result).toBeNull();
  });

  it('should skip non-assistant messages at the end', () => {
    const messages: StreamMessage[] = [
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Assistant text' }],
          model: 'claude-sonnet',
        },
      },
      { type: 'user' },
      { type: 'result', result: 'Some result' },
    ];
    const result = getLastAssistantText(messages);
    expect(result).toBe('Assistant text');
  });
});

describe('truncateText', () => {
  it('should return original text if shorter than maxLength', () => {
    const result = truncateText('Hello', 80);
    expect(result).toBe('Hello');
  });

  it('should return original text if equal to maxLength', () => {
    const result = truncateText('Hello', 5);
    expect(result).toBe('Hello');
  });

  it('should truncate text longer than maxLength with ellipsis', () => {
    const result = truncateText('Hello World', 5);
    expect(result).toBe('Hello...');
  });

  it('should trim whitespace before adding ellipsis', () => {
    const result = truncateText('Hello    World', 8);
    expect(result).toBe('Hello...');
  });

  it('should use default maxLength of 80', () => {
    const longText = 'a'.repeat(100);
    const result = truncateText(longText);
    expect(result).toBe('a'.repeat(80) + '...');
  });

  it('should handle empty string', () => {
    const result = truncateText('', 80);
    expect(result).toBe('');
  });

  it('should handle string of only whitespace', () => {
    const result = truncateText('     ', 3);
    expect(result).toBe('...');
  });
});
