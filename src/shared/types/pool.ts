import type * as pty from 'node-pty';

/**
 * A pre-spawned terminal from the pool, ready for use
 */
export interface PooledTerminal {
  /** Unique identifier for this pooled terminal */
  id: string;
  /** The PTY process - only available in main process */
  pty: pty.IPty;
  /** The shell executable path */
  shell: string;
  /** Shell arguments used when spawning */
  shellArgs: string[];
  /** When this terminal was created */
  createdAt: number;
  /** Current status of the pooled terminal */
  status: 'idle' | 'assigned' | 'disposing';
  /** Git Bash path for Windows (needed for CLAUDE_CODE_GIT_BASH_PATH env var) */
  gitBashPath?: string;
}

/**
 * Configuration for the terminal pool
 */
export interface TerminalPoolConfig {
  /** Whether the terminal pool is enabled */
  enabled: boolean;
  /** Minimum number of terminals to keep in the pool */
  minPoolSize: number;
  /** Maximum number of terminals allowed in the pool */
  maxPoolSize: number;
  /** Time in ms before an idle terminal is disposed (0 = never) */
  idleTimeoutMs: number;
  /** Delay in ms before replenishing the pool after a terminal is acquired */
  replenishDelayMs: number;
}

/**
 * Default configuration for the terminal pool
 */
export const DEFAULT_TERMINAL_POOL_CONFIG: TerminalPoolConfig = {
  enabled: true,
  minPoolSize: 2,
  maxPoolSize: 5,
  idleTimeoutMs: 300000, // 5 minutes
  replenishDelayMs: 1000, // 1 second
};

/**
 * Statistics about the terminal pool
 */
export interface TerminalPoolStats {
  /** Number of idle terminals ready for use */
  idleCount: number;
  /** Number of assigned terminals currently in use */
  assignedCount: number;
  /** Total terminals (idle + assigned) */
  totalCount: number;
  /** Number of times a terminal was acquired from the pool */
  acquireCount: number;
  /** Number of times we fell back to direct spawn (pool empty) */
  fallbackCount: number;
  /** Average time saved by using pool (ms) */
  avgTimeSavedMs: number;
  /** Whether the pool is enabled */
  enabled: boolean;
}

/**
 * Serialized pool terminal info for IPC (without the actual PTY process)
 */
export interface PooledTerminalInfo {
  id: string;
  shell: string;
  createdAt: number;
  status: 'idle' | 'assigned' | 'disposing';
}
