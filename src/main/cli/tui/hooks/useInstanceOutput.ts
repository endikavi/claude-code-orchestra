/**
 * Hook for handling instance output streaming in the TUI
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getProcessManager } from '../../../services/ProcessManager.js';
import type { StreamMessage } from '@shared/types/index.js';
import type { OutputLine } from '../types.js';
import { DEFAULT_TUI_CONFIG } from '../types.js';

export interface UseInstanceOutputResult {
  lines: OutputLine[];
  rawOutput: string;
  isStreaming: boolean;
  clear: () => void;
}

let lineIdCounter = 0;

function generateLineId(): string {
  return `line-${Date.now()}-${++lineIdCounter}`;
}

function extractTextFromMessage(message: StreamMessage): string | null {
  if (!message.message) return null;

  const textParts: string[] = [];
  for (const block of message.message.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    }
  }

  return textParts.length > 0 ? textParts.join('\n') : null;
}

function messageToOutputLine(message: StreamMessage): OutputLine[] {
  const timestamp = Date.now();
  const lines: OutputLine[] = [];

  switch (message.type) {
    case 'assistant':
      if (message.message) {
        // Extract text content
        const text = extractTextFromMessage(message);
        if (text) {
          lines.push({
            id: generateLineId(),
            type: 'assistant',
            text,
            timestamp,
          });
        }

        // Extract tool uses
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            lines.push({
              id: generateLineId(),
              type: 'tool',
              text: `[Tool: ${block.name}]`,
              timestamp,
            });
          } else if (block.type === 'tool_result') {
            const content =
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content, null, 2);
            lines.push({
              id: generateLineId(),
              type: 'tool',
              text: content.slice(0, 500) + (content.length > 500 ? '...' : ''),
              timestamp,
            });
          }
        }
      }
      break;

    case 'user':
      if (message.message) {
        const text = extractTextFromMessage(message);
        if (text) {
          lines.push({
            id: generateLineId(),
            type: 'user',
            text,
            timestamp,
          });
        }
      }
      break;

    case 'result':
      if (message.result) {
        lines.push({
          id: generateLineId(),
          type: 'result',
          text: message.result,
          timestamp,
        });
      }
      // Handle error results
      if (message.is_error && message.result) {
        lines.push({
          id: generateLineId(),
          type: 'error',
          text: message.result,
          timestamp,
        });
      }
      break;

    case 'system':
      if (message.message) {
        const text = extractTextFromMessage(message);
        if (text) {
          lines.push({
            id: generateLineId(),
            type: 'system',
            text,
            timestamp,
          });
        }
      }
      break;
  }

  return lines;
}

export function useInstanceOutput(instanceId: string | null): UseInstanceOutputResult {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [rawOutput, setRawOutput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const maxLines = useRef(DEFAULT_TUI_CONFIG.maxLogLines);

  const addLine = useCallback((line: OutputLine) => {
    setLines((prev) => {
      const newLines = [...prev, line];
      // Keep only the last maxLines
      if (newLines.length > maxLines.current) {
        return newLines.slice(-maxLines.current);
      }
      return newLines;
    });
  }, []);

  useEffect(() => {
    if (!instanceId) {
      setLines([]);
      setRawOutput('');
      setIsStreaming(false);
      return;
    }

    const pm = getProcessManager();

    // Load existing output from buffer
    const outputs = pm.getAllInstanceOutputs();
    const existingOutput = outputs[instanceId];
    if (existingOutput) {
      // Process existing messages
      const existingLines: OutputLine[] = [];
      for (const msg of existingOutput.messages) {
        const msgLines = messageToOutputLine(msg);
        existingLines.push(...msgLines);
      }
      setLines(existingLines.slice(-maxLines.current));
      setRawOutput(existingOutput.rawOutput);
    }

    // Listen for new output
    const onOutput = (id: string, message: StreamMessage) => {
      if (id !== instanceId) return;

      const msgLines = messageToOutputLine(message);
      for (const line of msgLines) {
        addLine(line);
      }
      setIsStreaming(true);
    };

    const onRawOutput = (id: string, data: string) => {
      if (id !== instanceId) return;

      setRawOutput((prev) => {
        const newOutput = prev + data;
        // Keep buffer size manageable
        if (newOutput.length > 100000) {
          return newOutput.slice(-100000);
        }
        return newOutput;
      });
    };

    const onStatus = (id: string, status: string) => {
      if (id !== instanceId) return;

      if (status === 'completed' || status === 'error' || status === 'killed') {
        setIsStreaming(false);
      } else if (status === 'running' || status === 'tool_executing') {
        setIsStreaming(true);
      }
    };

    const onExit = (id: string) => {
      if (id !== instanceId) return;
      setIsStreaming(false);
    };

    pm.on('instance:output', onOutput);
    pm.on('instance:rawOutput', onRawOutput);
    pm.on('instance:status', onStatus);
    pm.on('instance:exit', onExit);

    // Check current status
    const instance = pm.getInstance(instanceId);
    if (instance) {
      const runningStatuses = ['starting', 'running', 'needs_permission', 'tool_executing'];
      setIsStreaming(runningStatuses.includes(instance.status));
    }

    return () => {
      pm.off('instance:output', onOutput);
      pm.off('instance:rawOutput', onRawOutput);
      pm.off('instance:status', onStatus);
      pm.off('instance:exit', onExit);
    };
  }, [instanceId, addLine]);

  const clear = useCallback(() => {
    setLines([]);
    setRawOutput('');
  }, []);

  return {
    lines,
    rawOutput,
    isStreaming,
    clear,
  };
}
