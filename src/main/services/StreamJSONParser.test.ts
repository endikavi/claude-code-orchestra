import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamJSONParser } from './StreamJSONParser';
import type { StreamMessage } from '@shared/types';

describe('StreamJSONParser', () => {
  let parser: StreamJSONParser;

  beforeEach(() => {
    parser = new StreamJSONParser();
  });

  describe('process', () => {
    it('should parse a complete JSON line', () => {
      const messageSpy = vi.fn();
      parser.on('message', messageSpy);

      const message: StreamMessage = {
        type: 'system',
        session_id: 'test-session',
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'system' }));
    });

    it('should handle multiple JSON lines in one chunk', () => {
      const messageSpy = vi.fn();
      parser.on('message', messageSpy);

      const messages: StreamMessage[] = [
        { type: 'system', session_id: 'test' },
        {
          type: 'assistant',
          message: { id: '1', type: 'message', role: 'assistant', content: [], model: 'claude' },
        },
      ];

      parser.process(messages.map((m) => JSON.stringify(m)).join('\n') + '\n');

      expect(messageSpy).toHaveBeenCalledTimes(2);
    });

    it('should buffer incomplete JSON lines', () => {
      const messageSpy = vi.fn();
      parser.on('message', messageSpy);

      const message: StreamMessage = { type: 'system', session_id: 'test' };
      const json = JSON.stringify(message);

      // Send first half
      parser.process(json.substring(0, 10));
      expect(messageSpy).not.toHaveBeenCalled();

      // Send second half with newline
      parser.process(json.substring(10) + '\n');
      expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'system' }));
    });

    it('should emit raw event for invalid JSON', () => {
      const rawSpy = vi.fn();
      parser.on('raw', rawSpy);

      parser.process('not valid json\n');

      expect(rawSpy).toHaveBeenCalledWith('not valid json');
    });

    it('should skip empty lines', () => {
      const messageSpy = vi.fn();
      const rawSpy = vi.fn();
      parser.on('message', messageSpy);
      parser.on('raw', rawSpy);

      parser.process('\n\n\n');

      expect(messageSpy).not.toHaveBeenCalled();
      expect(rawSpy).not.toHaveBeenCalled();
    });
  });

  describe('status inference', () => {
    it('should start with "starting" status', () => {
      expect(parser.getStatus()).toBe('starting');
    });

    it('should set status to "running" for assistant messages', () => {
      const statusSpy = vi.fn();
      parser.on('status', statusSpy);

      const message: StreamMessage = {
        type: 'assistant',
        message: {
          id: '1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          model: 'claude',
        },
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(parser.getStatus()).toBe('running');
      expect(statusSpy).toHaveBeenCalledWith('running');
    });

    it('should set status to "tool_executing" when tool_use block is present', () => {
      const statusSpy = vi.fn();
      parser.on('status', statusSpy);

      const message: StreamMessage = {
        type: 'assistant',
        message: {
          id: '1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: {} }],
          model: 'claude',
        },
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(parser.getStatus()).toBe('tool_executing');
    });

    it('should set status to "waiting_input" for result messages (interactive mode)', () => {
      // In interactive stream-json mode, a result message means Claude finished
      // one turn and is waiting for more input. The actual 'completed' status
      // is set when the process exits.
      const message: StreamMessage = {
        type: 'result',
        result: 'Success',
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(parser.getStatus()).toBe('waiting_input');
    });

    it('should set status to "error" for error result messages', () => {
      const message: StreamMessage = {
        type: 'result',
        is_error: true,
        result: 'Error occurred',
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(parser.getStatus()).toBe('error');
    });
  });

  describe('content block events', () => {
    it('should emit text event for text blocks', () => {
      const textSpy = vi.fn();
      parser.on('text', textSpy);

      const message: StreamMessage = {
        type: 'assistant',
        message: {
          id: '1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
          model: 'claude',
        },
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(textSpy).toHaveBeenCalledWith('Hello world');
    });

    it('should emit tool_use event for tool_use blocks', () => {
      const toolUseSpy = vi.fn();
      parser.on('tool_use', toolUseSpy);

      const toolBlock = {
        type: 'tool_use' as const,
        id: 'tool-1',
        name: 'Read',
        input: { path: '/test' },
      };
      const message: StreamMessage = {
        type: 'assistant',
        message: {
          id: '1',
          type: 'message',
          role: 'assistant',
          content: [toolBlock],
          model: 'claude',
        },
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(toolUseSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Read' }));
    });

    it('should emit thinking event for thinking blocks', () => {
      const thinkingSpy = vi.fn();
      parser.on('thinking', thinkingSpy);

      const message: StreamMessage = {
        type: 'assistant',
        message: {
          id: '1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'Let me think...' }],
          model: 'claude',
        },
      };

      parser.process(JSON.stringify(message) + '\n');

      expect(thinkingSpy).toHaveBeenCalledWith('Let me think...');
    });
  });

  describe('reset', () => {
    it('should clear buffer and reset status', () => {
      const message: StreamMessage = {
        type: 'assistant',
        message: { id: '1', type: 'message', role: 'assistant', content: [], model: 'claude' },
      };
      parser.process(JSON.stringify(message) + '\n');
      parser.process('incomplete'); // Add something to buffer

      parser.reset();

      expect(parser.getStatus()).toBe('starting');
    });
  });

  describe('flush', () => {
    it('should process remaining buffer content', () => {
      const messageSpy = vi.fn();
      parser.on('message', messageSpy);

      const message: StreamMessage = { type: 'system', session_id: 'test' };
      parser.process(JSON.stringify(message)); // No newline

      expect(messageSpy).not.toHaveBeenCalled();

      parser.flush();

      expect(messageSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'system' }));
    });

    it('should emit raw for invalid JSON in buffer', () => {
      const rawSpy = vi.fn();
      parser.on('raw', rawSpy);

      parser.process('invalid json'); // No newline

      parser.flush();

      expect(rawSpy).toHaveBeenCalledWith('invalid json');
    });

    it('should clear buffer after flush', () => {
      parser.process('some content');
      parser.flush();

      const messageSpy = vi.fn();
      parser.on('message', messageSpy);
      parser.flush();

      expect(messageSpy).not.toHaveBeenCalled();
    });
  });
});
