/**
 * StatusBar component - Bottom bar showing shortcuts and status
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface StatusBarProps {
  instanceCount: number;
  runningCount: number;
  selectedProject?: string;
  selectedInstance?: string;
  isInputMode: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  instanceCount,
  runningCount,
  selectedProject,
  selectedInstance,
  isInputMode,
}) => {
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    >
      {/* Left: Shortcuts */}
      <Box gap={2}>
        <Text dimColor>
          <Text color="cyan">Ctrl+N</Text> New
        </Text>
        <Text dimColor>
          <Text color="cyan">Ctrl+K</Text> Kill
        </Text>
        <Text dimColor>
          <Text color="cyan">Tab</Text> Switch
        </Text>
        <Text dimColor>
          <Text color="cyan">Ctrl+C</Text> Exit
        </Text>
      </Box>

      {/* Center: Status */}
      <Box gap={2}>
        {selectedProject && (
          <Text>
            <Text color="blue">Project:</Text> {selectedProject}
          </Text>
        )}
        {selectedInstance && (
          <Text>
            <Text color="green">Instance:</Text> {selectedInstance.slice(0, 8)}
          </Text>
        )}
        {isInputMode && <Text color="yellow">[INPUT MODE]</Text>}
      </Box>

      {/* Right: Counts */}
      <Box gap={2}>
        <Text>
          <Text color="green">{runningCount}</Text>
          <Text dimColor>/{instanceCount} instances</Text>
        </Text>
      </Box>
    </Box>
  );
};
