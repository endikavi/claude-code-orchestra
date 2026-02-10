import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { ShellDetector } from './ShellDetector';
import { DataStore } from './DataStore';
import type {
  PooledTerminal,
  TerminalPoolConfig,
  TerminalPoolStats,
  PooledTerminalInfo,
} from '@shared/types/pool';

/**
 * Terminal Pool for accelerating Claude instance creation
 *
 * SECURITY: This pool is LOCAL-ONLY and must NEVER be exposed to remote/cluster clients.
 * All public methods validate that access is local before proceeding.
 *
 * The pool pre-spawns shell terminals that are ready to execute commands,
 * reducing instance startup time from 2-6 seconds to ~100-200ms.
 */
export class TerminalPool extends EventEmitter {
  private static instance: TerminalPool | null = null;

  private pool: Map<string, PooledTerminal> = new Map();
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  private replenishTimer: NodeJS.Timeout | null = null;
  private config: TerminalPoolConfig;
  private initialized: boolean = false;
  private shuttingDown: boolean = false;

  // Statistics
  private acquireCount: number = 0;
  private fallbackCount: number = 0;
  private totalTimeSavedMs: number = 0;

  // Spawn failure tracking for exponential backoff
  private consecutiveSpawnFailures: number = 0;
  private spawnBackoffTimer: NodeJS.Timeout | null = null;

  // Estimated spawn time for calculating time saved
  private static readonly ESTIMATED_SPAWN_TIME_MS = 300;

  // Exponential backoff constants
  private static readonly INITIAL_BACKOFF_MS = 1000; // Start with 1 second
  private static readonly MAX_BACKOFF_MS = 60000; // Max 1 minute
  private static readonly MAX_CONSECUTIVE_FAILURES = 5; // Pause spawning after this many failures

  private constructor() {
    super();
    // Load config from DataStore or use defaults
    const dataStore = DataStore.getInstance();
    this.config = dataStore.getTerminalPoolConfig();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): TerminalPool {
    if (!TerminalPool.instance) {
      TerminalPool.instance = new TerminalPool();
    }
    return TerminalPool.instance;
  }

  /**
   * SECURITY: Assert that this operation is local-only
   * @throws Error if access is not local
   */
  private assertLocalAccess(): void {
    // This is a security check - in the future we could add more sophisticated checks
    // For now, since this class is only accessible from the main process,
    // and we ensure ProcessManager only uses it for local requests, this is sufficient
    if (this.shuttingDown) {
      throw new Error('Terminal pool is shutting down');
    }
  }

  /**
   * Initialize the pool - pre-spawn terminals up to minPoolSize
   * Called once at app startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.config.enabled) {
      this.initialized = true;
      return;
    }

    // Pre-spawn terminals
    const spawnPromises: Promise<void>[] = [];
    for (let i = 0; i < this.config.minPoolSize; i++) {
      spawnPromises.push(this.spawnTerminal());
    }

    await Promise.allSettled(spawnPromises);
    this.initialized = true;
    this.emit('initialized', this.getStats());
  }

  /**
   * Acquire a terminal from the pool
   * Returns null if pool is empty or disabled (caller should fall back to direct spawn)
   *
   * SECURITY: Only call this for LOCAL requests, never for remote/cluster requests
   */
  acquire(): PooledTerminal | null {
    this.assertLocalAccess();

    if (!this.config.enabled || !this.initialized) {
      this.fallbackCount++;
      return null;
    }

    // Find an idle terminal
    for (const [id, terminal] of Array.from(this.pool.entries())) {
      if (terminal.status === 'idle') {
        // Mark as assigned
        terminal.status = 'assigned';

        // Clear idle timeout
        const timer = this.idleTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.idleTimers.delete(id);
        }

        this.acquireCount++;
        this.totalTimeSavedMs += TerminalPool.ESTIMATED_SPAWN_TIME_MS;

        // Reset spawn failure counter - successful acquire proves terminals work
        this.resetSpawnFailures();

        // Schedule replenishment
        this.scheduleReplenish();

        this.emit('acquired', { id, remainingIdle: this.getIdleCount() });
        return terminal;
      }
    }

    // Pool exhausted - caller should fall back to direct spawn
    this.fallbackCount++;

    // Aggressive replenish when pool is empty
    this.scheduleReplenish(0);

    this.emit('exhausted');
    return null;
  }

  /**
   * Release a terminal back to the pool (or dispose it)
   * Note: We always dispose rather than recycle to avoid shell state issues
   */
  release(id: string): void {
    const terminal = this.pool.get(id);
    if (!terminal) {
      return;
    }

    // Always dispose - don't recycle to avoid state issues
    this.dispose(id);
  }

  /**
   * Dispose a terminal (kill the process and remove from pool)
   */
  private dispose(id: string): void {
    const terminal = this.pool.get(id);
    if (!terminal) return;

    terminal.status = 'disposing';

    // Clear idle timeout
    const timer = this.idleTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(id);
    }

    // Kill the process
    try {
      terminal.pty.kill();
    } catch (error) {
      console.error(`[TerminalPool] Error killing terminal ${id}:`, error);
    }

    this.pool.delete(id);

    // Replenish if below min size
    if (this.getIdleCount() < this.config.minPoolSize && !this.shuttingDown) {
      this.scheduleReplenish();
    }

    this.emit('disposed', id);
  }

  /**
   * Spawn a new terminal and add it to the pool
   * @returns Promise that resolves when terminal is spawned
   */
  private spawnTerminal(): Promise<void> {
    if (this.shuttingDown) return Promise.resolve();

    // Check if we're in backoff due to consecutive failures
    if (this.consecutiveSpawnFailures >= TerminalPool.MAX_CONSECUTIVE_FAILURES) {
      return Promise.resolve();
    }

    const totalCount = this.pool.size;
    if (totalCount >= this.config.maxPoolSize) {
      return Promise.resolve();
    }

    const { shell, shellArgs } = this.getShellConfig();
    const id = randomUUID();

    try {
      // Use very large terminal width to prevent line wrapping that corrupts JSON output
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 32767,
        rows: 30,
        // Don't set cwd - we'll cd when the terminal is acquired
        env: {
          ...this.getEnvVars(),
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
        },
      });

      const terminal: PooledTerminal = {
        id,
        pty: ptyProcess,
        shell,
        shellArgs,
        createdAt: Date.now(),
        status: 'idle',
        gitBashPath: this.gitBashPath || undefined,
      };

      // Handle unexpected exit
      ptyProcess.onExit(() => {
        this.pool.delete(id);
        const timer = this.idleTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.idleTimers.delete(id);
        }
        // Replenish
        if (!this.shuttingDown) {
          this.scheduleReplenish();
        }
      });

      this.pool.set(id, terminal);

      // Reset failure counter on successful spawn
      this.consecutiveSpawnFailures = 0;

      // Set idle timeout if configured
      if (this.config.idleTimeoutMs > 0) {
        this.setIdleTimeout(id);
      }

      this.emit('spawned', id);
    } catch (error) {
      this.handleSpawnFailure(error);
    }
    return Promise.resolve();
  }

  /**
   * Handle spawn failure with exponential backoff
   */
  private handleSpawnFailure(error: unknown): void {
    this.consecutiveSpawnFailures++;
    console.error(
      `[TerminalPool] Failed to spawn terminal (failure ${this.consecutiveSpawnFailures}/${TerminalPool.MAX_CONSECUTIVE_FAILURES}):`,
      error
    );
    this.emit('spawnError', error);

    // Calculate backoff delay with exponential increase and jitter
    const baseDelay = Math.min(
      TerminalPool.INITIAL_BACKOFF_MS * Math.pow(2, this.consecutiveSpawnFailures - 1),
      TerminalPool.MAX_BACKOFF_MS
    );
    // Add random jitter (0-25% of base delay)
    const jitter = Math.random() * baseDelay * 0.25;
    const backoffDelay = baseDelay + jitter;

    // Clear any existing backoff timer
    if (this.spawnBackoffTimer) {
      clearTimeout(this.spawnBackoffTimer);
    }

    // Schedule retry after backoff (only if not at max failures)
    if (this.consecutiveSpawnFailures < TerminalPool.MAX_CONSECUTIVE_FAILURES) {
      this.spawnBackoffTimer = setTimeout(() => {
        this.spawnBackoffTimer = null;
        if (!this.shuttingDown) {
          this.scheduleReplenish();
        }
      }, backoffDelay);
    } else {
      console.error(
        `[TerminalPool] Max consecutive failures reached. Spawning disabled until successful acquire or manual reset.`
      );
      this.emit('spawnDisabled', this.consecutiveSpawnFailures);
    }
  }

  /**
   * Reset spawn failure counter - called when pool successfully acquires a terminal
   * This allows retrying spawns after max failures if existing terminals still work
   */
  public resetSpawnFailures(): void {
    if (this.consecutiveSpawnFailures > 0) {
      this.consecutiveSpawnFailures = 0;
      if (this.spawnBackoffTimer) {
        clearTimeout(this.spawnBackoffTimer);
        this.spawnBackoffTimer = null;
      }
    }
  }

  /**
   * Set idle timeout for a terminal
   */
  private setIdleTimeout(id: string): void {
    // Don't set idle timeout during shutdown
    if (this.shuttingDown) return;

    const timer = setTimeout(() => {
      // Guard against timer firing after shutdown
      if (this.shuttingDown) return;

      const terminal = this.pool.get(id);
      if (terminal && terminal.status === 'idle') {
        this.dispose(id);
      }
    }, this.config.idleTimeoutMs);

    this.idleTimers.set(id, timer);
  }

  /**
   * Schedule pool replenishment
   */
  private scheduleReplenish(delay?: number): void {
    // Don't schedule during shutdown
    if (this.shuttingDown) return;

    if (this.replenishTimer) {
      clearTimeout(this.replenishTimer);
    }

    const actualDelay = delay ?? this.config.replenishDelayMs;

    this.replenishTimer = setTimeout(() => {
      this.replenishTimer = null;
      void this.replenish();
    }, actualDelay);
  }

  /**
   * Replenish the pool up to minPoolSize
   */
  private async replenish(): Promise<void> {
    if (this.shuttingDown || !this.config.enabled) return;

    const idleCount = this.getIdleCount();
    const neededCount = this.config.minPoolSize - idleCount;

    if (neededCount <= 0) return;

    const spawnPromises: Promise<void>[] = [];
    for (let i = 0; i < neededCount; i++) {
      spawnPromises.push(this.spawnTerminal());
    }

    await Promise.allSettled(spawnPromises);
  }

  // Store the detected Git Bash path for environment variables
  private gitBashPath: string | null = null;

  /**
   * Get shell configuration for spawning
   * On Windows, use CMD for the pooled terminal (simpler, no path translation issues)
   * Claude Code will find Git Bash itself via CLAUDE_CODE_GIT_BASH_PATH env var
   */
  private getShellConfig(): { shell: string; shellArgs: string[] } {
    if (process.platform === 'win32') {
      // Use CMD for pooled terminals on Windows
      // It's simpler and doesn't have path translation issues
      // Claude Code will handle Git Bash internally

      // Still detect Git Bash path for the environment variable
      const gitBashPaths = [
        process.env.CLAUDE_CODE_GIT_BASH_PATH,
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      ].filter(Boolean) as string[];

      for (const bashPath of gitBashPaths) {
        if (fs.existsSync(bashPath)) {
          this.gitBashPath = bashPath;
          break;
        }
      }

      return { shell: 'cmd.exe', shellArgs: [] };
    }

    // Unix systems: use user's default shell
    const shellDetector = ShellDetector.getInstance();
    const defaultShell = shellDetector.getDefaultShell();

    if (!defaultShell) {
      return { shell: process.env.SHELL || '/bin/bash', shellArgs: [] };
    }

    return { shell: defaultShell.path, shellArgs: [] };
  }

  /**
   * Get the detected Git Bash path (for environment variables)
   */
  public getGitBashPath(): string | null {
    return this.gitBashPath;
  }

  /**
   * Get environment variables for the pooled terminal
   * Pass all environment variables to ensure everything works (node, git, etc.)
   */
  private getEnvVars(): Record<string, string> {
    // Pass all environment variables from the parent process
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };

    // Enable the new task tracking system in Claude Code
    env['CLAUDE_CODE_ENABLE_TASKS'] = 'true';

    // Enable reading CLAUDE.md from additional directories (--add-dir)
    env['CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD'] = '1';

    // On Windows, ensure CLAUDE_CODE_GIT_BASH_PATH is set for Claude Code
    if (process.platform === 'win32' && this.gitBashPath) {
      env['CLAUDE_CODE_GIT_BASH_PATH'] = this.gitBashPath;
    }

    // Add Claude native bin to PATH
    const claudeLocalBin =
      process.platform === 'win32'
        ? `${process.env.USERPROFILE}\\.local\\bin`
        : `${process.env.HOME}/.local/bin`;

    if (env['PATH']) {
      env['PATH'] = `${claudeLocalBin}${process.platform === 'win32' ? ';' : ':'}${env['PATH']}`;
    }

    return env;
  }

  /**
   * Update pool configuration
   */
  updateConfig(config: Partial<TerminalPoolConfig>): TerminalPoolConfig {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Persist to DataStore
    const dataStore = DataStore.getInstance();
    dataStore.updateTerminalPoolConfig(this.config);

    // Handle enable/disable
    if (!wasEnabled && this.config.enabled && this.initialized) {
      // Pool was just enabled - start spawning
      void this.replenish();
    } else if (wasEnabled && !this.config.enabled) {
      // Pool was disabled - dispose all terminals
      for (const id of Array.from(this.pool.keys())) {
        this.dispose(id);
      }
    }

    this.emit('configUpdated', this.config);
    return this.config;
  }

  /**
   * Get current configuration
   */
  getConfig(): TerminalPoolConfig {
    return { ...this.config };
  }

  /**
   * Get pool statistics
   */
  getStats(): TerminalPoolStats {
    let idleCount = 0;
    let assignedCount = 0;

    for (const terminal of Array.from(this.pool.values())) {
      if (terminal.status === 'idle') idleCount++;
      else if (terminal.status === 'assigned') assignedCount++;
    }

    const _totalAcquires = this.acquireCount + this.fallbackCount;
    const avgTimeSavedMs =
      this.acquireCount > 0 ? Math.round(this.totalTimeSavedMs / this.acquireCount) : 0;

    return {
      idleCount,
      assignedCount,
      totalCount: this.pool.size,
      acquireCount: this.acquireCount,
      fallbackCount: this.fallbackCount,
      avgTimeSavedMs,
      enabled: this.config.enabled,
    };
  }

  /**
   * Get info about all pooled terminals (without PTY references for IPC)
   */
  getPooledTerminals(): PooledTerminalInfo[] {
    const result: PooledTerminalInfo[] = [];
    for (const terminal of Array.from(this.pool.values())) {
      result.push({
        id: terminal.id,
        shell: terminal.shell,
        createdAt: terminal.createdAt,
        status: terminal.status,
      });
    }
    return result;
  }

  /**
   * Get count of idle terminals
   */
  private getIdleCount(): number {
    let count = 0;
    for (const terminal of Array.from(this.pool.values())) {
      if (terminal.status === 'idle') count++;
    }
    return count;
  }

  /**
   * Shutdown the pool - dispose all terminals
   * Called when the app is closing
   */
  shutdown(): void {
    this.shuttingDown = true;

    // Clear replenish timer
    if (this.replenishTimer) {
      clearTimeout(this.replenishTimer);
      this.replenishTimer = null;
    }

    // Clear spawn backoff timer
    if (this.spawnBackoffTimer) {
      clearTimeout(this.spawnBackoffTimer);
      this.spawnBackoffTimer = null;
    }

    // Clear all idle timers
    for (const timer of Array.from(this.idleTimers.values())) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    // Kill all terminals
    for (const terminal of Array.from(this.pool.values())) {
      try {
        terminal.pty.kill();
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.pool.clear();

    this.emit('shutdown');
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.acquireCount = 0;
    this.fallbackCount = 0;
    this.totalTimeSavedMs = 0;
    this.emit('statsReset');
  }
}

/**
 * Get the singleton TerminalPool instance
 */
export function getTerminalPool(): TerminalPool {
  return TerminalPool.getInstance();
}
