import type { Language } from './index';
import type { SharedContextSettings } from './sharedContext';

export type ViewMode = 'terminal' | 'structured';
export type Theme = 'dark' | 'light';
export type RightPanelMode = 'none' | 'tasks' | 'teams' | 'files';

export interface CollapsedSections {
  local: boolean;
  clusters: Record<string, boolean>; // nodeId -> collapsed
}

export type TerminalFont = 'embedded' | 'system' | 'cascadia' | 'jetbrains' | 'fira' | 'consolas';

// Repaint method types for experimental TUI fix options
export type RepaintMode =
  | 'disabled'
  | 'manual'
  | 'interval'
  | 'frame'
  | 'fake-resize'
  | 'ansi-clear';

export interface RepaintSettings {
  mode: RepaintMode;
  intervalMs: number; // For 'interval' mode (100-5000ms)
}

export const DEFAULT_REPAINT_SETTINGS: RepaintSettings = {
  mode: 'disabled',
  intervalMs: 500,
};

export interface UISettings {
  viewMode: ViewMode;
  theme: Theme;
  language: Language;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  projectOrder: string[]; // IDs of local projects in custom order
  collapsedSections: CollapsedSections;
  terminalFont: TerminalFont;
  sharedContext: SharedContextSettings;
  repaintSettings: RepaintSettings;
  rightPanelMode: RightPanelMode;

  /**
   * When enabled, terminal rendering/resize logic uses tmux-safe defaults.
   * This should be enabled when the backend PTY is running a tmux session.
   */
  tmuxMode: boolean;

  /** Whether the cross-project tab bars are collapsed */
  otherProjectBarsCollapsed: boolean;
}
