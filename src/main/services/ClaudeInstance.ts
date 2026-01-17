import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { StreamJSONParser } from './StreamJSONParser';
import type {
  ClaudeInstance as ClaudeInstanceType,
  ClaudeModel,
  InstanceMode,
  InstanceStatus,
  StreamMessage,
} from '@shared/types';
import { randomUUID } from 'crypto';

export interface ClaudeInstanceConfig {
  projectId: string;
  projectPath: string;
  model: ClaudeModel;
  mode: InstanceMode;
  skipPermissions?: boolean;
  resumeSessionId?: string; // For --resume flag
  planMode?: boolean; // For --plan flag
}

export class ClaudeInstance extends EventEmitter {
  public readonly id: string;
  public readonly projectId: string;
  public readonly model: ClaudeModel;
  public readonly mode: InstanceMode;
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

  constructor(config: ClaudeInstanceConfig) {
    super();
    this.id = randomUUID();
    this.projectId = config.projectId;
    this.projectPath = config.projectPath;
    this.model = config.model;
    this.mode = config.mode;
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
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const shellArgs =
      process.platform === 'win32'
        ? ['/c', `claude ${args.join(' ')}`]
        : ['-c', `claude ${args.join(' ')}`];

    try {
      this.ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: this.projectPath,
        env: {
          ...this.getAllowedEnvVars(),
          FORCE_COLOR: '1',
          TERM: 'xterm-256color',
        },
      });

      this._status = 'starting';
      this.emit('status', this._status);

      this.ptyProcess.onData((data: string) => {
        // Emit raw data for terminal view
        this.emit('rawOutput', data);

        // Parse JSON for structured view
        if (this.mode === 'stream-json') {
          this.parser.process(data);
        }
      });

      this.ptyProcess.onExit(({ exitCode }) => {
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
    // Add print mode flag for non-interactive (required for prompt input)
    if (this.mode === 'print' || this.mode === 'stream-json') {
      args.push('-p');
    }

    // Add output format for stream-json
    // Note: --verbose is required when using -p with --output-format stream-json
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
   * Send input to the process
   */
  sendInput(input: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(input);
    }
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  /**
   * Kill the process
   */
  kill(): void {
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
   * Check if process is running
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
