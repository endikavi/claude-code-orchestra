/**
 * TUI App - Root component for the terminal user interface
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { ProjectSelector } from './components/ProjectSelector.js';
import { InstanceList } from './components/InstanceList.js';
import { OutputLog } from './components/OutputLog.js';
import { InputPrompt } from './components/InputPrompt.js';
import { StatusBar } from './components/StatusBar.js';
import { useProjects } from './hooks/useProjects.js';
import { useInstances } from './hooks/useInstances.js';
import { useInstanceOutput } from './hooks/useInstanceOutput.js';
import { getProcessManager } from '../../services/ProcessManager.js';

type FocusArea = 'projects' | 'instances' | 'input';

export const App: React.FC = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Get terminal dimensions
  const [terminalHeight, setTerminalHeight] = useState(stdout?.rows || 24);

  useEffect(() => {
    const updateHeight = () => {
      if (stdout?.rows) {
        setTerminalHeight(stdout.rows);
      }
    };

    stdout?.on('resize', updateHeight);
    updateHeight();

    return () => {
      stdout?.off('resize', updateHeight);
    };
  }, [stdout]);

  // Focus management
  const [focusArea, setFocusArea] = useState<FocusArea>('projects');

  // Project management
  const { projects, selectedProject, selectProject, refreshProjects } = useProjects();

  // Instance management
  const { instances, selectedInstance, selectInstance, createInstance, killInstance, sendInput } =
    useInstances(selectedProject?.id || null);

  // Output streaming
  const { lines, isStreaming } = useInstanceOutput(selectedInstance?.id || null);

  // Calculate running instances
  const runningCount = instances.filter(
    (i) => i.status === 'running' || i.status === 'starting' || i.status === 'tool_executing'
  ).length;

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+C to exit
    if (key.ctrl && input === 'c') {
      // Kill all instances before exiting
      const pm = getProcessManager();
      pm.killAll();
      exit();
      return;
    }

    // Tab to switch focus areas
    if (key.tab) {
      setFocusArea((current) => {
        if (current === 'projects') return 'instances';
        if (current === 'instances') return 'input';
        return 'projects';
      });
      return;
    }

    // Shift+Tab to switch focus backwards
    if (key.shift && key.tab) {
      setFocusArea((current) => {
        if (current === 'input') return 'instances';
        if (current === 'instances') return 'projects';
        return 'input';
      });
      return;
    }

    // Number keys to quick-select instances (1-9)
    if (!key.ctrl && !key.meta && input >= '1' && input <= '9') {
      const index = parseInt(input, 10) - 1;
      if (instances[index]) {
        selectInstance(instances[index].id);
        setFocusArea('instances');
      }
      return;
    }

    // Ctrl+N to create instance (global shortcut)
    if (key.ctrl && input === 'n') {
      if (selectedProject) {
        void createInstance();
      }
      return;
    }

    // Ctrl+K to kill instance (global shortcut)
    if (key.ctrl && input === 'k') {
      if (selectedInstance) {
        killInstance(selectedInstance.id);
      }
      return;
    }
  });

  // Handle project selection
  const handleProjectSelect = useCallback(
    (id: string) => {
      selectProject(id);
      selectInstance(null); // Clear instance selection
      refreshProjects();
    },
    [selectProject, selectInstance, refreshProjects]
  );

  // Handle instance selection
  const handleInstanceSelect = useCallback(
    (id: string) => {
      selectInstance(id);
    },
    [selectInstance]
  );

  // Handle instance creation
  const handleCreateInstance = useCallback(() => {
    if (selectedProject) {
      createInstance();
    }
  }, [selectedProject, createInstance]);

  // Handle instance kill
  const handleKillInstance = useCallback(
    (id: string) => {
      killInstance(id);
    },
    [killInstance]
  );

  // Handle input submission
  const handleInputSubmit = useCallback(
    (input: string) => {
      sendInput(input);
    },
    [sendInput]
  );

  // Handle input focus request
  const handleInputFocusRequest = useCallback(() => {
    if (selectedInstance) {
      setFocusArea('input');
    }
  }, [selectedInstance]);

  // Calculate layout heights
  const headerHeight = 3;
  const statusBarHeight = 3;
  const inputHeight = 4;
  const contentHeight = Math.max(10, terminalHeight - headerHeight - statusBarHeight - inputHeight);
  const outputHeight = Math.max(5, contentHeight - 2);

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Header */}
      <Box
        paddingX={1}
        borderStyle="double"
        borderTop
        borderBottom
        borderLeft={false}
        borderRight={false}
      >
        <Text bold color="cyan">
          Claude Code Orchestra - TUI Mode
        </Text>
        <Box flexGrow={1} />
        <Text dimColor>{new Date().toLocaleTimeString()}</Text>
      </Box>

      {/* Main content area */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Left panel: Projects and Instances */}
        <Box
          flexDirection="column"
          width="30%"
          borderStyle="single"
          borderRight
          borderTop={false}
          borderBottom={false}
          borderLeft={false}
        >
          <ProjectSelector
            projects={projects}
            selectedId={selectedProject?.id || null}
            onSelect={handleProjectSelect}
            isFocused={focusArea === 'projects'}
          />

          <Box
            borderStyle="single"
            borderTop
            borderBottom={false}
            borderLeft={false}
            borderRight={false}
          />

          <InstanceList
            instances={instances}
            selectedId={selectedInstance?.id || null}
            onSelect={handleInstanceSelect}
            onCreate={handleCreateInstance}
            onKill={handleKillInstance}
            isFocused={focusArea === 'instances'}
          />
        </Box>

        {/* Right panel: Output and Input */}
        <Box flexDirection="column" width="70%">
          <Box flexGrow={1}>
            <OutputLog lines={lines} isStreaming={isStreaming} maxHeight={outputHeight} />
          </Box>

          <InputPrompt
            instanceId={selectedInstance?.id || null}
            instanceStatus={selectedInstance?.status}
            onSubmit={handleInputSubmit}
            isFocused={focusArea === 'input'}
            onFocusRequest={handleInputFocusRequest}
          />
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        instanceCount={instances.length}
        runningCount={runningCount}
        selectedProject={selectedProject?.name}
        selectedInstance={selectedInstance?.id}
        isInputMode={focusArea === 'input'}
      />
    </Box>
  );
};
