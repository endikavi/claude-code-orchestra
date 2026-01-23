/**
 * InstanceList component - List of Claude instances for the selected project
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { InstanceListItem } from '../types.js';
import type { InstanceStatus } from '@shared/types/index.js';

export interface InstanceListProps {
  instances: InstanceListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onKill: (id: string) => void;
  isFocused: boolean;
}

const STATUS_COLORS: Record<InstanceStatus, string> = {
  starting: 'yellow',
  running: 'green',
  waiting_input: 'cyan',
  needs_permission: 'magenta',
  tool_executing: 'blue',
  terminating: 'yellow',
  completed: 'gray',
  error: 'red',
  killed: 'gray',
};

const STATUS_ICONS: Record<InstanceStatus, string> = {
  starting: '...',
  running: '>>>',
  waiting_input: '...',
  needs_permission: '???',
  tool_executing: '***',
  terminating: '...',
  completed: '---',
  error: 'ERR',
  killed: 'XXX',
};

export const InstanceList: React.FC<InstanceListProps> = ({
  instances,
  selectedId,
  onSelect,
  onCreate,
  onKill,
  isFocused,
}) => {
  const [highlightIndex, setHighlightIndex] = useState(0);

  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (key.upArrow) {
        setHighlightIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setHighlightIndex((prev) => Math.min(instances.length - 1, prev + 1));
      } else if (key.return) {
        const instance = instances[highlightIndex];
        if (instance) {
          onSelect(instance.id);
        }
      } else if (key.ctrl && input === 'n') {
        onCreate();
      } else if (key.ctrl && input === 'k') {
        const instance = instances[highlightIndex];
        if (instance) {
          onKill(instance.id);
        }
      }
    },
    { isActive: isFocused }
  );

  // Sync highlight with selection
  useEffect(() => {
    if (selectedId) {
      const index = instances.findIndex((i) => i.id === selectedId);
      if (index >= 0) {
        setHighlightIndex(index);
      }
    }
  }, [selectedId, instances]);

  // Keep highlight in bounds
  useEffect(() => {
    if (highlightIndex >= instances.length && instances.length > 0) {
      setHighlightIndex(instances.length - 1);
    }
  }, [instances.length, highlightIndex]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={isFocused ? 'cyan' : undefined}>
        Instances ({instances.length})
      </Text>
      <Text dimColor>Ctrl+N: new | Ctrl+K: kill</Text>

      {instances.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No instances.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {instances.map((instance, index) => {
            const isHighlighted = index === highlightIndex && isFocused;
            const isSelected = instance.id === selectedId;
            const statusColor = STATUS_COLORS[instance.status] || 'white';
            const statusIcon = STATUS_ICONS[instance.status] || '   ';

            return (
              <Box key={instance.id}>
                <Text
                  color={isSelected ? 'green' : isHighlighted ? 'cyan' : undefined}
                  bold={isSelected}
                  inverse={isHighlighted}
                >
                  {isSelected ? '> ' : '  '}
                  <Text color={statusColor}>[{statusIcon}]</Text> {instance.title}{' '}
                  <Text dimColor>({instance.model})</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
