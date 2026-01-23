/**
 * InputPrompt component - Text input for sending messages to Claude
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { InstanceStatus } from '@shared/types/index.js';

export interface InputPromptProps {
  instanceId: string | null;
  instanceStatus?: InstanceStatus;
  onSubmit: (input: string) => void;
  isFocused: boolean;
  onFocusRequest: () => void;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  instanceId,
  instanceStatus,
  onSubmit,
  isFocused,
  onFocusRequest,
}) => {
  const [value, setValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);

  const canSendInput =
    instanceId && (instanceStatus === 'running' || instanceStatus === 'needs_permission');

  useInput(
    (input, key) => {
      // If not focused, check for 'i' key to request focus (vim-like)
      if (!isFocused) {
        if (input === 'i' || input === '/') {
          onFocusRequest();
        }
        return;
      }

      if (key.escape) {
        // Clear input and unfocus
        setValue('');
        setCursorPosition(0);
        return;
      }

      if (key.return) {
        if (value.trim() && canSendInput) {
          onSubmit(value);
          setValue('');
          setCursorPosition(0);
        }
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          setValue((prev) => prev.slice(0, cursorPosition - 1) + prev.slice(cursorPosition));
          setCursorPosition((prev) => Math.max(0, prev - 1));
        }
        return;
      }

      if (key.leftArrow) {
        setCursorPosition((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.rightArrow) {
        setCursorPosition((prev) => Math.min(value.length, prev + 1));
        return;
      }

      // Regular character input
      if (input && !key.ctrl && !key.meta) {
        setValue((prev) => prev.slice(0, cursorPosition) + input + prev.slice(cursorPosition));
        setCursorPosition((prev) => prev + input.length);
      }
    },
    { isActive: true }
  );

  // Render the input value with cursor
  const renderValue = () => {
    if (!isFocused) {
      return <Text dimColor>{value || 'Press i or / to start typing...'}</Text>;
    }

    const before = value.slice(0, cursorPosition);
    const cursor = value[cursorPosition] || ' ';
    const after = value.slice(cursorPosition + 1);

    return (
      <Text>
        {before}
        <Text inverse>{cursor}</Text>
        {after}
      </Text>
    );
  };

  const statusMessage = () => {
    if (!instanceId) {
      return <Text dimColor>Select an instance first</Text>;
    }
    if (!canSendInput) {
      return <Text dimColor>Instance is not ready for input</Text>;
    }
    return null;
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Box flexDirection="row" gap={1}>
        <Text color={isFocused ? 'cyan' : 'gray'}>{canSendInput ? '>' : '#'}</Text>
        <Box flexGrow={1}>{renderValue()}</Box>
        {statusMessage()}
      </Box>
      {isFocused && (
        <Box>
          <Text dimColor>Enter to send | Esc to cancel</Text>
        </Box>
      )}
    </Box>
  );
};
