/**
 * ProjectSelector component - List of projects to select from
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ProjectListItem } from '../types.js';

export interface ProjectSelectorProps {
  projects: ProjectListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isFocused: boolean;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projects,
  selectedId,
  onSelect,
  isFocused,
}) => {
  const [highlightIndex, setHighlightIndex] = useState(0);

  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (key.upArrow) {
        setHighlightIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setHighlightIndex((prev) => Math.min(projects.length - 1, prev + 1));
      } else if (key.return) {
        const project = projects[highlightIndex];
        if (project) {
          onSelect(project.id);
        }
      }
    },
    { isActive: isFocused }
  );

  // Sync highlight with selection
  React.useEffect(() => {
    if (selectedId) {
      const index = projects.findIndex((p) => p.id === selectedId);
      if (index >= 0) {
        setHighlightIndex(index);
      }
    }
  }, [selectedId, projects]);

  if (projects.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={isFocused ? 'cyan' : undefined}>
          Projects
        </Text>
        <Text dimColor>No projects found.</Text>
        <Text dimColor>Add a project in the web UI.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={isFocused ? 'cyan' : undefined}>
        Projects ({projects.length})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {projects.map((project, index) => {
          const isHighlighted = index === highlightIndex && isFocused;
          const isSelected = project.id === selectedId;

          return (
            <Box key={project.id}>
              <Text
                color={isSelected ? 'green' : isHighlighted ? 'cyan' : undefined}
                bold={isSelected}
                inverse={isHighlighted}
              >
                {isSelected ? '> ' : '  '}
                {project.name}
                {project.instanceCount > 0 && <Text dimColor> ({project.instanceCount})</Text>}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
