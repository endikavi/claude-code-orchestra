/**
 * TUI-specific types for the interactive terminal dashboard
 */

import type { ClaudeInstance, Project, InstanceStatus } from '@shared/types/index.js';

/**
 * Output line with type information for colored rendering
 */
export interface OutputLine {
  id: string;
  type: 'assistant' | 'tool' | 'error' | 'system' | 'user' | 'result';
  text: string;
  timestamp: number;
}

/**
 * TUI view mode
 */
export type TuiView = 'dashboard' | 'project' | 'instance';

/**
 * TUI state managed by the store
 */
export interface TuiState {
  // Current view
  currentView: TuiView;

  // Selected items
  selectedProjectId: string | null;
  selectedInstanceId: string | null;

  // Data
  projects: Project[];
  instances: ClaudeInstance[];

  // Output logs per instance
  instanceLogs: Map<string, OutputLine[]>;

  // Input mode
  isInputMode: boolean;
  inputBuffer: string;

  // Loading states
  isLoading: boolean;
  loadingMessage: string;
}

/**
 * Instance info for display in the list
 */
export interface InstanceListItem {
  id: string;
  projectId: string;
  status: InstanceStatus;
  title: string;
  model: string;
  createdAt: number;
}

/**
 * Project info for display in the selector
 */
export interface ProjectListItem {
  id: string;
  name: string;
  path: string;
  color?: string;
  instanceCount: number;
}

/**
 * Keyboard shortcut definition
 */
export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

/**
 * TUI configuration
 */
export interface TuiConfig {
  maxLogLines: number;
  refreshInterval: number;
  showTimestamps: boolean;
  colorOutput: boolean;
}

export const DEFAULT_TUI_CONFIG: TuiConfig = {
  maxLogLines: 500,
  refreshInterval: 100,
  showTimestamps: false,
  colorOutput: true,
};
