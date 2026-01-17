import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { ShellInstance as ShellInstanceType, ShellInstanceStatus } from '@shared/types';
import { randomUUID } from 'crypto';

export interface ShellInstanceConfig {
  projectId: string;
  projectPath: string;
}

export class ShellInstance extends EventEmitter {
  public readonly id: string;
  public readonly projectId: string;
  public readonly createdAt: number;

  private ptyProcess: pty.IPty | null = null;
  private _status: ShellInstanceStatus = 'running';
  private projectPath: string;

  constructor(config: ShellInstanceConfig) {
    super();
    this.id = randomUUID();
    this.projectId = config.projectId;
    this.projectPath = config.projectPath;
    this.createdAt = Date.now();
  }

  /**
   * Get filtered environment variables for the shell process
   * Only allows safe, necessary variables
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
      'PSModulePath',
      'PATHEXT',
      'COMSPEC',
      // Development tools
      'NODE_ENV',
      'npm_config_prefix',
    ];

    const env: Record<string, string> = {};

    for (const key of Object.keys(process.env)) {
      if (allowedKeys.includes(key)) {
        const value = process.env[key];
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }

    return env;
  }

  /**
   * Start the shell process
   */
  start(): void {
    let shell: string;
    let shellArgs: string[];

    if (process.platform === 'win32') {
      // Windows: Use PowerShell by default
      shell = 'powershell.exe';
      shellArgs = ['-NoLogo'];
    } else {
      // Linux/macOS: Use user's default shell
      shell = process.env.SHELL || '/bin/bash';
      shellArgs = [];
    }

    try {
      this.ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: this.projectPath,
        env: {
          ...this.getAllowedEnvVars(),
          TERM: 'xterm-256color',
        },
      });

      this._status = 'running';
      this.emit('status', this._status);

      this.ptyProcess.onData((data: string) => {
        this.emit('data', data);
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        if (this._status !== 'killed') {
          this._status = exitCode === 0 ? 'completed' : 'error';
        }
        this.emit('status', this._status);
        this.emit('exit', exitCode);
        this.ptyProcess = null;
      });
    } catch (error) {
      this._status = 'error';
      this.emit('status', this._status);
      this.emit('error', error instanceof Error ? error.message : 'Failed to start shell');
    }
  }

  /**
   * Send input to the shell
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
   * Kill the shell process
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
  get status(): ShellInstanceStatus {
    return this._status;
  }

  /**
   * Get process ID
   */
  get pid(): number | undefined {
    return this.ptyProcess?.pid;
  }

  /**
   * Check if shell is running
   */
  get isRunning(): boolean {
    return this.ptyProcess !== null && this._status === 'running';
  }

  /**
   * Convert to serializable object
   */
  toJSON(): ShellInstanceType {
    return {
      id: this.id,
      projectId: this.projectId,
      type: 'shell',
      status: this._status,
      createdAt: this.createdAt,
      pid: this.pid,
    };
  }
}
