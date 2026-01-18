import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { execSync } from 'child_process';
import { StreamJSONParser } from './StreamJSONParser';
import type {
  ClaudeInstance as ClaudeInstanceType,
  ClaudeModel,
  InstanceMode,
  InstanceStatus,
  StreamMessage,
} from '@shared/types';
import { randomUUID } from 'crypto';

// Cache for Claude CLI path
let cachedClaudePath: string | null = null;

/**
 * Find the Claude CLI executable path
 */
function findClaudePath(): string {
  if (cachedClaudePath) {
    return cachedClaudePath;
  }

  const fs = require('fs');
  const path = require('path');

  // On Windows, check common npm global installation paths first
  if (process.platform === 'win32') {
    const possiblePaths = [
      // npm global (default location)
      path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
      // npm global (alternative)
      path.join(process.env.LOCALAPPDATA || '', 'npm', 'claude.cmd'),
      // Custom npm prefix
      path.join(process.env.USERPROFILE || '', '.npm-global', 'claude.cmd'),
      // nvm for windows
      path.join(process.env.NVM_SYMLINK || '', 'claude.cmd'),
      // Scoop
      path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'claude.cmd'),
    ];

    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        console.log(`[ClaudeInstance] Found Claude at: ${p}`);
        cachedClaudePath = p;
        return p;
      }
    }

    // Try 'where' command as fallback
    try {
      const result = execSync('where claude', {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        env: process.env, // Use full env for detection
      });
      const paths = result.trim().split(/\r?\n/);
      if (paths.length > 0 && paths[0]) {
        cachedClaudePath = paths[0].trim();
        console.log(`[ClaudeInstance] Found Claude via 'where': ${cachedClaudePath}`);
        return cachedClaudePath;
      }
    } catch (err) {
      console.log(`[ClaudeInstance] 'where claude' failed:`, err);
    }
  } else {
    // Unix: Try 'which' command
    try {
      const result = execSync('which claude', { encoding: 'utf-8', timeout: 5000 });
      cachedClaudePath = result.trim();
      console.log(`[ClaudeInstance] Found Claude via 'which': ${cachedClaudePath}`);
      return cachedClaudePath;
    } catch {
      // Command not found
    }
  }

  // Last resort: assume it's in PATH and hope for the best
  console.log(`[ClaudeInstance] Claude not found, falling back to 'claude' in PATH`);
  cachedClaudePath = 'claude';
  return cachedClaudePath;
}

export interface ClaudeInstanceConfig {
  projectId: string;
  projectPath: string;
  model: ClaudeModel;
  mode: InstanceMode;
  prompt?: string; // Initial prompt for stream-json/print mode
  skipPermissions?: boolean;
  resumeSessionId?: string; // For --resume flag
  planMode?: boolean; // For --plan flag
}

export class ClaudeInstance extends EventEmitter {
  public readonly id: string;
  public readonly projectId: string;
  public readonly model: ClaudeModel;
  public readonly mode: InstanceMode;
  public readonly prompt?: string;
  public readonly createdAt: number;
  public readonly skipPermissions: boolean;
  public readonly resumeSessionId?: string;
  public readonly planMode: boolean;

  private ptyProcess: pty.IPty | null = null;
  private parser: StreamJSONParser;
  private _status: InstanceStatus = 'starting';
  private _error?: string;
  private _sessionId?: string;
  private projectPath: string;
  private _hasExited: boolean = false; // Flag to prevent race conditions on resize
  private idleTimer: NodeJS.Timeout | null = null;

  // Time in ms without output before considering Claude is waiting for input
  private static readonly IDLE_TIMEOUT = 2000;

  constructor(config: ClaudeInstanceConfig) {
    super();
    this.id = randomUUID();
    this.projectId = config.projectId;
    this.projectPath = config.projectPath;
    this.model = config.model;
    this.mode = config.mode;
    this.prompt = config.prompt;
    this.skipPermissions = config.skipPermissions ?? false;
    this.resumeSessionId = config.resumeSessionId;
    this.planMode = config.planMode ?? false;
    this.createdAt = Date.now();

    this.parser = new StreamJSONParser();
    this.setupParserListeners();
  }

  private setupParserListeners(): void {
    this.parser.on('message', (message: StreamMessage) => {
      // Capture session_id from system message
      if (message.type === 'system' && message.session_id) {
        this._sessionId = message.session_id;
        this.emit('sessionId', message.session_id);
      }
      this.emit('output', message);
    });

    this.parser.on('status', (status: InstanceStatus) => {
      this._status = status;
      this.emit('status', status);
    });

    this.parser.on('raw', (data: string) => {
      this.emit('raw', data);
    });

    this.parser.on('text', (text: string) => {
      this.emit('text', text);
    });

    this.parser.on('tool_use', (block: unknown) => {
      this.emit('tool_use', block);
    });

    this.parser.on('tool_result', (block: unknown) => {
      this.emit('tool_result', block);
    });

    this.parser.on('thinking', (text: string) => {
      this.emit('thinking', text);
    });
  }

  /**
   * Get filtered environment variables for the Claude process
   * Only allows safe, necessary variables to prevent credential leakage
   */
  private getAllowedEnvVars(): Record<string, string> {
    const allowedKeys = [
      // System essentials
      'PATH',
      'HOME',
      'USER',
      'SHELL',
      'TERM',
      'LANG',
      'LC_ALL',
      'LC_CTYPE',
      'TMPDIR',
      'TEMP',
      'TMP',
      // Windows-specific essentials
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'SystemRoot',
      'windir',
      'COMPUTERNAME',
      'USERNAME',
      'HOMEDRIVE',
      'HOMEPATH',
      'SYSTEMDRIVE',
      'PATHEXT', // Required for Windows to find executables
      'COMSPEC', // Required for cmd.exe
      'PSModulePath', // Required for PowerShell
      'ProgramFiles',
      'ProgramFiles(x86)',
      'ProgramData',
      'CommonProgramFiles',
      'CommonProgramFiles(x86)',
      // Node.js / npm paths
      'NODE_PATH',
      'npm_config_prefix',
      'NVM_HOME',
      'NVM_SYMLINK',
      // Claude CLI specific - API key is required for the CLI to function
      'ANTHROPIC_API_KEY',
    ];

    const env: Record<string, string> = {};

    for (const key of Object.keys(process.env)) {
      // Allow explicitly listed keys
      if (allowedKeys.includes(key)) {
        const value = process.env[key];
        if (value !== undefined) {
          env[key] = value;
        }
      }
      // Allow CLAUDE_CODE_* prefixed variables (Claude CLI configuration)
      else if (key.startsWith('CLAUDE_CODE_')) {
        const value = process.env[key];
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    return env;
  }

  /**
   * Start the Claude CLI process
   */
  start(): void {
    const args = this.buildArgs();
    const claudePath = findClaudePath();

    // Log the detected path for debugging
    console.log(`[ClaudeInstance] Using Claude CLI at: ${claudePath}`);

    // On Windows, if we found a .cmd file, use cmd.exe to run it
    // Otherwise spawn directly
    let shell: string;
    let shellArgs: string[];

    if (process.platform === 'win32') {
      if (claudePath.endsWith('.cmd') || claudePath.endsWith('.bat')) {
        // Use cmd.exe to run .cmd/.bat files
        // Pass arguments separately, not as a single string
        shell = 'cmd.exe';
        shellArgs = ['/c', claudePath, ...args];
      } else {
        // Try running directly
        shell = claudePath;
        shellArgs = args;
      }
    } else {
      // Unix: run directly
      shell = claudePath;
      shellArgs = args;
    }

    try {
      // Use full process.env to ensure PATH includes Node.js and other required tools
      // The claude.cmd script needs node to be available
      this.ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: this.projectPath,
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
        } as Record<string, string>,
      });

      this._status = 'starting';
      this.emit('status', this._status);

      this.ptyProcess.onData((data: string) => {
        // Emit raw data for terminal view
        this.emit('rawOutput', data);

        // Parse JSON for structured view
        if (this.mode === 'stream-json') {
          this.parser.process(data);
        } else {
          // For interactive mode, update status to 'running' when we receive data
          // and reset the idle timer to detect when Claude stops responding
          if (this._status === 'starting' || this._status === 'waiting_input') {
            this._status = 'running';
            this.emit('status', this._status);
          }

          // Reset idle timer - will transition to waiting_input after timeout
          this.resetIdleTimer();
        }
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        // Set exit flag immediately to prevent resize race conditions
        this._hasExited = true;

        // Clean up idle timer
        this.clearIdleTimer();

        this.parser.flush();

        if (exitCode === 0) {
          this._status = 'completed';
        } else if (this._status !== 'killed') {
          this._status = 'error';
          this._error = `Process exited with code ${exitCode}`;
        }

        this.emit('status', this._status);
        this.emit('exit', exitCode);
        this.ptyProcess = null;
      });

      // For stream-json mode, send the initial prompt via stdin after a short delay
      // This allows Claude to initialize before receiving input
      if (this.mode === 'stream-json' && this.prompt) {
        setTimeout(() => {
          if (this.ptyProcess) {
            this.sendInput(this.prompt + '\r');
          }
        }, 500);
      }
    } catch (error) {
      this._status = 'error';
      this._error = error instanceof Error ? error.message : 'Failed to start process';
      this.emit('status', this._status);
      this.emit('error', this._error);
    }
  }

  /**
   * Build Claude CLI arguments
   */
  private buildArgs(): string[] {
    const args: string[] = [];

    // When resuming a session, use --resume to specify the session ID
    // Don't use -p (print mode) because we want interactive conversation
    if (this.resumeSessionId) {
      // Use --resume to resume a specific session by its ID
      // Note: --continue (without session ID) resumes the LAST session, which is NOT what we want
      args.push('--resume', this.resumeSessionId);

      // Add model
      args.push('--model', this.model);

      // Add skip permissions flag if enabled
      if (this.skipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      return args;
    }

    // For new conversations:
    // Add print mode flag ONLY for print mode (one-shot, non-interactive)
    // stream-json mode runs interactively to allow ongoing conversations
    if (this.mode === 'print') {
      args.push('-p');
      // Add prompt at the end for print mode
      if (this.prompt) {
        args.push(this.prompt);
      }
    }

    // Add output format for stream-json (runs interactively, prompt sent via stdin)
    if (this.mode === 'stream-json') {
      args.push('--output-format', 'stream-json', '--verbose');
    }

    // Add model
    args.push('--model', this.model);

    // Add skip permissions flag if enabled
    if (this.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    // Add plan mode flag if enabled
    if (this.planMode) {
      args.push('--permission-mode', 'plan');
    }

    return args;
  }

  /**
   * Reset the idle timer for interactive mode
   * When no output is received for IDLE_TIMEOUT ms, switch to waiting_input status
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      // Only transition to waiting_input in interactive mode when running
      if (this._status === 'running' && this.mode !== 'stream-json') {
        this._status = 'waiting_input';
        this.emit('status', this._status);
      }
    }, ClaudeInstance.IDLE_TIMEOUT);
  }

  /**
   * Clear the idle timer
   */
  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Send input to the process
   */
  sendInput(input: string): void {
    if (this.ptyProcess) {
      // When user sends input while waiting, change back to running
      if (this._status === 'waiting_input') {
        this._status = 'running';
        this.emit('status', this._status);
      }
      this.ptyProcess.write(input);
    }
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    // Only resize if process exists and hasn't exited
    if (this.ptyProcess && !this._hasExited) {
      try {
        this.ptyProcess.resize(cols, rows);
      } catch {
        // Silently ignore resize errors - process may have exited
      }
    }
  }

  /**
   * Kill the process
   */
  kill(): void {
    // Clean up idle timer
    this.clearIdleTimer();

    if (this.ptyProcess) {
      this._status = 'killed';
      this.emit('status', this._status);
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  /**
   * Get current status
   */
  get status(): InstanceStatus {
    return this._status;
  }

  /**
   * Get error message if any
   */
  get error(): string | undefined {
    return this._error;
  }

  /**
   * Get session ID (captured from system message)
   */
  get sessionId(): string | undefined {
    return this._sessionId;
  }

  /**
   * Get process ID
   */
  get pid(): number | undefined {
    return this.ptyProcess?.pid;
  }

  /**
   * Check if process is running (includes waiting_input state)
   */
  get isRunning(): boolean {
    return (
      this.ptyProcess !== null &&
      this._status !== 'completed' &&
      this._status !== 'error' &&
      this._status !== 'killed'
    );
  }

  /**
   * Convert to serializable object
   */
  toJSON(): ClaudeInstanceType {
    return {
      id: this.id,
      projectId: this.projectId,
      model: this.model,
      mode: this.mode,
      planMode: this.planMode,
      status: this._status,
      createdAt: this.createdAt,
      pid: this.pid,
      error: this._error,
    };
  }
}
