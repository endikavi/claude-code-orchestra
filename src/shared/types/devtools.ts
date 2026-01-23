/**
 * DevTools Types
 *
 * Types for the DevTools features in the web preview:
 * - Console capture (log, warn, error, info)
 * - Element inspector with highlighting
 * - Context menu for copying HTML
 */

/**
 * Console log entry captured from the previewed page
 */
export interface ConsoleEntry {
  id: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  /** Source file URL */
  source?: string;
  /** Line number in source */
  line?: number;
  /** Column number in source */
  column?: number;
  /** Stack trace if available (for errors) */
  stack?: string;
}

/**
 * Console entry level for filtering
 */
export type ConsoleLevel = ConsoleEntry['level'];

/**
 * All available console levels
 */
export const CONSOLE_LEVELS: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

/**
 * DevTools state for a single proxy view
 */
export interface DevToolsState {
  /** Whether the element inspector is enabled */
  inspectorEnabled: boolean;
  /** Whether the console panel is expanded */
  consolePanelOpen: boolean;
  /** Current console filter level (null = show all) */
  consoleFilter: ConsoleLevel | null;
  /** Console entries for this view */
  consoleEntries: ConsoleEntry[];
  /** Maximum number of console entries to keep */
  maxEntries: number;
}

/**
 * Default DevTools state
 */
export const DEFAULT_DEVTOOLS_STATE: DevToolsState = {
  inspectorEnabled: false,
  consolePanelOpen: false,
  consoleFilter: null,
  consoleEntries: [],
  maxEntries: 1000,
};

/**
 * Console entry counts by level
 */
export interface ConsoleCounts {
  log: number;
  info: number;
  warn: number;
  error: number;
  debug: number;
  total: number;
}

/**
 * Element info for context menu / inspector
 */
export interface ElementInfo {
  /** Element tag name */
  tagName: string;
  /** Element outer HTML */
  outerHTML: string;
  /** Element inner HTML */
  innerHTML: string;
  /** Element text content */
  textContent: string;
  /** Element ID if present */
  id?: string;
  /** Element class names */
  classNames: string[];
  /** Computed styles (subset) */
  styles?: {
    width: string;
    height: string;
    display: string;
    position: string;
  };
  /** Bounding rect */
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Context menu action types
 */
export type ContextMenuAction = 'copy-html' | 'copy-text' | 'send-to-terminal' | 'inspect';

/**
 * Context menu event data
 */
export interface ContextMenuEvent {
  /** X position relative to viewport */
  x: number;
  /** Y position relative to viewport */
  y: number;
  /** Element info at click position */
  element?: ElementInfo;
}

/**
 * DevTools message types from injected script to parent
 */
export type DevToolsMessageType =
  | 'console'
  | 'context-menu'
  | 'element-hover'
  | 'element-click'
  | 'ready';

/**
 * DevTools message from injected script
 */
export interface DevToolsMessage {
  type: DevToolsMessageType;
  /** Unique message ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Payload varies by type */
  payload: unknown;
}

/**
 * Console message payload
 */
export interface ConsoleMessagePayload {
  level: ConsoleLevel;
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}

/**
 * Context menu message payload
 */
export interface ContextMenuPayload {
  x: number;
  y: number;
  element: ElementInfo;
}

/**
 * Commands from parent to injected script
 */
export type DevToolsCommand =
  | { type: 'enable-inspector' }
  | { type: 'disable-inspector' }
  | { type: 'get-element-at'; x: number; y: number }
  | { type: 'highlight-element'; selector: string }
  | { type: 'clear-highlight' };

/**
 * DevTools IPC event data for broadcasting console entries
 */
export interface DevToolsConsoleEvent {
  viewId: string;
  entry: ConsoleEntry;
}

/**
 * DevTools IPC event data for context menu
 */
export interface DevToolsContextMenuEvent {
  viewId: string;
  event: ContextMenuEvent;
}
