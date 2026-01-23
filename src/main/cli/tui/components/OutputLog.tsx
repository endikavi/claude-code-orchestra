/**
 * OutputLog component - Streaming output display using Static for performance
 */

import React from 'react';
import { Box, Text, Static } from 'ink';
import type { OutputLine } from '../types.js';

export interface OutputLogProps {
  lines: OutputLine[];
  isStreaming: boolean;
  maxHeight?: number;
}

const LINE_COLORS: Record<OutputLine['type'], string> = {
  assistant: 'green',
  tool: 'yellow',
  error: 'red',
  system: 'gray',
  user: 'cyan',
  result: 'blue',
};

const LINE_PREFIXES: Record<OutputLine['type'], string> = {
  assistant: 'Claude',
  tool: 'Tool',
  error: 'Error',
  system: 'System',
  user: 'You',
  result: 'Result',
};

export const OutputLog: React.FC<OutputLogProps> = ({ lines, isStreaming, maxHeight }) => {
  // If no lines, show placeholder
  if (lines.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold>Output</Text>
        <Box marginTop={1}>
          <Text dimColor>
            {isStreaming ? 'Waiting for output...' : 'Select an instance to view output'}
          </Text>
        </Box>
      </Box>
    );
  }

  // Limit lines if maxHeight is specified (rough estimate: 1 line per row)
  const displayLines = maxHeight ? lines.slice(-maxHeight) : lines;

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Output</Text>
        {isStreaming && (
          <Text color="green">
            <Text color="green">●</Text> Streaming...
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {/* Use Static for efficient rendering of log lines */}
        <Static items={displayLines}>
          {(line) => (
            <Box key={line.id} flexDirection="row" flexWrap="wrap">
              <Text color={LINE_COLORS[line.type]}>[{LINE_PREFIXES[line.type]}]</Text>
              <Text> </Text>
              <Text wrap="wrap">{formatLineText(line.text)}</Text>
            </Box>
          )}
        </Static>
      </Box>
    </Box>
  );
};

/**
 * Format line text for display - handle newlines and truncation
 */
function formatLineText(text: string): string {
  // Replace multiple newlines with single newline
  let formatted = text.replace(/\n{3,}/g, '\n\n');

  // Truncate very long lines
  if (formatted.length > 1000) {
    formatted = formatted.slice(0, 1000) + '... (truncated)';
  }

  return formatted;
}
