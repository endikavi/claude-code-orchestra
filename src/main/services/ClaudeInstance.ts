import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { StreamJSONParser } from './StreamJSONParser';
import { DataStore } from './DataStore';
import { getWebServer } from './WebServer';
import { getSubagentTracker } from './SubagentTracker';
import { getUserDataPath } from '../utils/paths';
import type {
  ClaudeInstance as ClaudeInstanceType,
  ClaudeModel,
  InstanceMode,
  InstanceStatus,
  StreamMessage,
} from '@shared/types';
import type { SubagentStartedEvent, SubagentCompletedEvent } from '@shared/types/orchestration';
import type { PooledTerminal } from '@shared/types/pool';
import { randomUUID } from 'crypto';

// MCP Bridge script content (embedded to avoid path issues in packaged app)
const MCP_BRIDGE_SCRIPT = `#!/usr/bin/env node
const http = require('http');
const readline = require('readline');

const MCP_URL = process.env.ORCHESTRA_MCP_URL || 'http://localhost:3847/mcp';
const MCP_TOKEN = process.env.ORCHESTRA_MCP_TOKEN || '';
const url = new URL(MCP_URL);

function sendRequest(request) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(request);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Instance-Token': MCP_TOKEN,
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function writeResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\\n');
}

function handleInitialize(request) {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'orchestra', version: '1.0.0' },
    },
  };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    if (request.method === 'initialize') { writeResponse(handleInitialize(request)); return; }
    if (request.method === 'notifications/initialized') return;
    try {
      const response = await sendRequest(request);
      writeResponse(response);
    } catch (error) {
      writeResponse({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error.message } });
    }
  } catch (e) {
    writeResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
});
rl.on('close', () => process.exit(0));
`;

// Session Start Hook script content (embedded to avoid path issues in packaged app)
// This hook captures session_id from stdin JSON (Claude Code passes hook data via stdin)
// and sends it to the dashboard API
const SESSION_START_HOOK_SCRIPT = `#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

// Debug logging to file (since stdout is captured by Claude Code)
const logFile = path.join(process.env.TEMP || '/tmp', 'claude-dashboard-hook.log');
function log(msg) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, timestamp + ' ' + msg + '\\n');
}

// Read JSON input from stdin (Claude Code passes hook data this way)
let inputData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  log('SessionStart hook executed');
  log('Raw stdin: ' + inputData);

  let hookInput = {};
  try {
    hookInput = JSON.parse(inputData);
    log('Parsed hook input: ' + JSON.stringify(hookInput));
  } catch (e) {
    log('Failed to parse stdin JSON: ' + e.message);
  }

  // Get session_id from hook input (passed via stdin JSON)
  const sessionId = hookInput.session_id;
  // Get dashboard vars from environment (passed by ClaudeInstance)
  const instanceId = process.env.CLAUDE_DASHBOARD_INSTANCE_ID;
  const apiUrl = process.env.CLAUDE_DASHBOARD_API_URL;

  log('session_id: ' + (sessionId || 'NOT SET'));
  log('instanceId: ' + (instanceId || 'NOT SET'));
  log('apiUrl: ' + (apiUrl || 'NOT SET'));

  if (sessionId && instanceId && apiUrl) {
    log('All vars present, sending request...');
    const url = new URL('/api/instances/session-id', apiUrl);
    const data = JSON.stringify({ instanceId, sessionId });

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      log('Response received: ' + res.statusCode);
      // Output valid hook response after request completes
      outputResponse();
    });

    req.on('error', (err) => {
      log('Request error: ' + err.message);
      outputResponse();
    });

    req.write(data);
    req.end();
  } else {
    log('Missing vars, skipping request');
    outputResponse();
  }
});

function outputResponse() {
  // Output valid hook response (required by Claude Code hooks)
  console.log(JSON.stringify({
    continue: true
  }));
}
`;

// Cache for Claude CLI path
let cachedClaudePath: string | null = null;

/**
 * Find the Claude CLI executable path
 * Priority order:
 * 1. Native installation (recommended by Anthropic, npm is deprecated)
 * 2. System PATH (respects user's environment)
 * 3. Legacy npm installations (fallback)
 */
function findClaudePath(): string {
  if (cachedClaudePath) {
    return cachedClaudePath;
  }

  if (process.platform === 'win32') {
    // Windows: Check native installation paths FIRST (npm is deprecated)
    const nativePaths = [
      // Native installer location (primary)
      path.join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe'),
      // Program Files (system-wide installation)
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ClaudeCode', 'claude.exe'),
      // Scoop (native package manager)
      path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'claude.exe'),
    ];

    for (const p of nativePaths) {
      if (p && fs.existsSync(p)) {
        console.log(`[ClaudeInstance] Found Claude (native) at: ${p}`);
        cachedClaudePath = p;
        return p;
      }
    }

    // Try 'where' command to respect system PATH order
    try {
      const result = execSync('where claude', {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        env: process.env,
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

    // Legacy npm paths (deprecated, fallback only)
    const legacyPaths = [
      path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'npm', 'claude.cmd'),
      path.join(process.env.USERPROFILE || '', '.npm-global', 'claude.cmd'),
      path.join(process.env.NVM_SYMLINK || '', 'claude.cmd'),
      path.join(process.env.USERPROFILE || '', 'scoop', 'shims', 'claude.cmd'),
    ];

    for (const p of legacyPaths) {
      if (p && fs.existsSync(p)) {
        console.log(`[ClaudeInstance] Found Claude (legacy npm) at: ${p}`);
        cachedClaudePath = p;
        return p;
      }
    }
  } else {
    // Unix/macOS: Check native installation paths FIRST
    const nativePaths = [
      // Native installer location (primary)
      path.join(process.env.HOME || '', '.local', 'bin', 'claude'),
      // Homebrew (macOS)
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
    ];

    for (const p of nativePaths) {
      if (p && fs.existsSync(p)) {
        console.log(`[ClaudeInstance] Found Claude (native) at: ${p}`);
        cachedClaudePath = p;
        return p;
      }
    }

    // Try 'which' command to respect system PATH
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
  enableMcp?: boolean; // Enable MCP server integration
  pooledTerminal?: PooledTerminal; // Pre-spawned terminal from pool (local-only)
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
  public readonly enableMcp: boolean;

  private ptyProcess: pty.IPty | null = null;
  private mcpToken?: string; // Token for MCP authentication
  private parser: StreamJSONParser;
  private _status: InstanceStatus = 'starting';
  private _error?: string;
  private _sessionId?: string;
  private projectPath: string;
  private _hasExited: boolean = false; // Flag to prevent race conditions on resize
  private idleTimer: NodeJS.Timeout | null = null;
  private pooledTerminal?: PooledTerminal; // Pre-spawned terminal from pool

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
    this.enableMcp = config.enableMcp ?? false;
    this.pooledTerminal = config.pooledTerminal;
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

    // Subagent tracking (native Claude Task tool)
    this.parser.on('subagent_started', (data: SubagentStartedEvent) => {
      console.log(`[ClaudeInstance ${this.id}] subagent_started event received:`, data);
      const tracker = getSubagentTracker();
      const subagent = tracker.startSubagent(this.id, data);
      console.log(
        `[ClaudeInstance ${this.id}] Emitting subagent:started for subagent ${subagent.id}`
      );
      this.emit('subagent:started', { instanceId: this.id, subagent });
    });

    this.parser.on('subagent_completed', (data: SubagentCompletedEvent) => {
      console.log(`[ClaudeInstance ${this.id}] subagent_completed event received:`, data);
      const tracker = getSubagentTracker();
      const subagent = tracker.completeSubagent(this.id, data);
      if (subagent) {
        console.log(
          `[ClaudeInstance ${this.id}] Emitting subagent:completed for subagent ${subagent.id}`
        );
        this.emit('subagent:completed', { instanceId: this.id, subagent });
      }
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
   * Setup MCP configuration for this instance (synchronous)
   * Generates a token and registers it with the MCP server
   */
  private setupMcpConfiguration(): void {
    console.log(`[ClaudeInstance] setupMcpConfiguration called, enableMcp=${this.enableMcp}`);

    if (!this.enableMcp) {
      console.log(`[ClaudeInstance] MCP disabled for this instance, skipping setup`);
      return;
    }

    console.log(`[ClaudeInstance] Setting up MCP for instance ${this.id}`);
    const dataStore = DataStore.getInstance();
    const remoteConfig = dataStore.getRemoteConfig();
    const apiUrl = `http://localhost:${remoteConfig.port}`;

    // Generate unique token for this instance
    this.mcpToken = randomUUID();

    // Register token with MCP server
    const webServer = getWebServer();
    webServer.registerMcpToken(this.mcpToken, {
      instanceId: this.id,
      projectId: this.projectId,
      projectPath: this.projectPath,
      instanceToken: this.mcpToken,
    });

    // Write MCP configuration to project's .mcp.json (Claude Code reads MCP from here)
    // Note: Claude Code only reads MCP servers from .mcp.json (project root) or ~/.claude.json (user home)
    // It does NOT read from .claude/settings.json
    const mcpConfigPath = path.join(this.projectPath, '.mcp.json');

    try {
      // Read existing .mcp.json or create new
      let mcpConfig: Record<string, unknown> = {};
      if (fs.existsSync(mcpConfigPath)) {
        try {
          const content = fs.readFileSync(mcpConfigPath, 'utf-8');
          mcpConfig = JSON.parse(content);
        } catch {
          // Invalid JSON, start fresh
          mcpConfig = {};
        }
      }

      // Ensure mcpServers object exists
      if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== 'object') {
        mcpConfig.mcpServers = {};
      }

      // Add Orchestra MCP server configuration
      // Write bridge script to userData directory
      const bridgePath = path.join(getUserDataPath(), 'mcp-bridge.js');
      if (!fs.existsSync(bridgePath)) {
        fs.writeFileSync(bridgePath, MCP_BRIDGE_SCRIPT, 'utf-8');
        console.log(`[ClaudeInstance] MCP bridge script written to ${bridgePath}`);
      }

      const mcpServers = mcpConfig.mcpServers as Record<string, unknown>;
      mcpServers['orchestra'] = {
        command: 'node',
        args: [bridgePath],
        env: {
          ORCHESTRA_MCP_TOKEN: this.mcpToken,
          ORCHESTRA_MCP_URL: `${apiUrl}/mcp`,
        },
      };

      // Write .mcp.json back
      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
      console.log(`[ClaudeInstance] MCP configuration written to ${mcpConfigPath}`);
    } catch (error) {
      console.error('[ClaudeInstance] Failed to write MCP configuration:', error);
    }
  }

  /**
   * Cleanup MCP resources when instance terminates
   */
  private cleanupMcpResources(): void {
    if (this.mcpToken) {
      try {
        const webServer = getWebServer();
        webServer.unregisterMcpToken(this.mcpToken);
        console.log(`[ClaudeInstance] Unregistered MCP token for instance ${this.id}`);
      } catch (error) {
        console.error('[ClaudeInstance] Failed to unregister MCP token:', error);
      }
    }
  }

  /**
   * Setup SessionStart hook to capture CLAUDE_SESSION_ID
   * This hook is called by Claude Code when a session starts and sends the sessionId to the dashboard API
   */
  private setupSessionHook(): void {
    try {
      // Write hook script to userData directory (always overwrite to ensure latest version)
      const hookScriptPath = path.join(getUserDataPath(), 'session-start-hook.js');
      fs.writeFileSync(hookScriptPath, SESSION_START_HOOK_SCRIPT, 'utf-8');
      console.log(`[ClaudeInstance] Session hook script written to ${hookScriptPath}`);

      // Add hook to .claude/settings.local.json (not committed to git)
      const claudeDir = path.join(this.projectPath, '.claude');
      const localSettingsPath = path.join(claudeDir, 'settings.local.json');

      let settings: Record<string, unknown> = {};
      if (fs.existsSync(localSettingsPath)) {
        try {
          settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'));
        } catch {
          // Invalid JSON, start fresh
          settings = {};
        }
      }

      // Add SessionStart hook configuration
      if (!settings.hooks || typeof settings.hooks !== 'object') {
        settings.hooks = {};
      }

      // Normalize path for cross-platform (forward slashes work on both Windows and Unix in Node.js)
      const normalizedScriptPath = hookScriptPath.replace(/\\/g, '/');

      // Build command based on platform:
      // - Windows: use 'node' directly (Claude Code requires Node, so it's in PATH)
      // - Unix: use '/usr/bin/env node' for portability across different Node installations
      const hookCommand =
        process.platform === 'win32'
          ? `node "${normalizedScriptPath}"`
          : `/usr/bin/env node "${normalizedScriptPath}"`;

      const hooks = settings.hooks as Record<string, unknown>;
      hooks.SessionStart = [
        {
          hooks: [
            {
              type: 'command',
              command: hookCommand,
            },
          ],
        },
      ];

      // Ensure .claude directory exists
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      fs.writeFileSync(localSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      console.log(`[ClaudeInstance] SessionStart hook configured in ${localSettingsPath}`);
    } catch (error) {
      console.error('[ClaudeInstance] Failed to setup session hook:', error);
    }
  }

  /**
   * Start the Claude CLI process
   */
  start(): void {
    // Log instance details for debugging
    console.log(`[ClaudeInstance] Starting instance ${this.id}`);
    console.log(`[ClaudeInstance]   mode: ${this.mode}`);
    console.log(`[ClaudeInstance]   pooled: ${this.pooledTerminal ? 'yes' : 'no'}`);
    console.log(
      `[ClaudeInstance]   prompt: ${this.prompt ? this.prompt.substring(0, 100) + '...' : '(none)'}`
    );

    // Setup MCP configuration if enabled (must complete before starting Claude)
    if (this.enableMcp) {
      this.setupMcpConfiguration();
    }

    // Setup SessionStart hook to capture CLAUDE_SESSION_ID
    this.setupSessionHook();

    const args = this.buildArgs();
    const claudePath = findClaudePath();

    // If we have a pooled terminal, use it instead of spawning a new process
    if (this.pooledTerminal) {
      this.startWithPooledTerminal(claudePath, args);
      return;
    }

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
      // Also inject dashboard environment variables for hooks integration
      const apiUrl = `http://localhost:${DataStore.getInstance().getRemoteConfig().port}`;

      // Build environment variables
      const envVars: Record<string, string> = {
        ...(process.env as Record<string, string>),
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
        // Dashboard integration environment variables
        // These are used by hook scripts to communicate with the dashboard
        CLAUDE_DASHBOARD_INSTANCE_ID: this.id,
        CLAUDE_DASHBOARD_PROJECT_ID: this.projectId,
        CLAUDE_DASHBOARD_PROJECT_PATH: this.projectPath,
        CLAUDE_DASHBOARD_API_URL: apiUrl,
      };

      // Add MCP-specific environment variables if enabled
      if (this.enableMcp && this.mcpToken) {
        envVars.ORCHESTRA_MCP_ENABLED = 'true';
        envVars.ORCHESTRA_MCP_TOKEN = this.mcpToken;
        envVars.ORCHESTRA_MCP_URL = `${apiUrl}/mcp`;
      }

      this.ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: this.projectPath,
        env: envVars,
      });

      this._status = 'starting';
      this.emit('status', this._status);

      this.ptyProcess.onData((data: string) => {
        // Emit raw data for terminal view
        this.emit('rawOutput', data);

        // Always parse JSON to capture session_id and structured messages
        // This is needed for both stream-json and interactive modes since we
        // always use --output-format stream-json to capture the session_id
        this.parser.process(data);

        // For interactive mode, also handle status transitions based on activity
        if (this.mode !== 'stream-json') {
          // Update status to 'running' when we receive data
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

        // Clean up MCP resources
        this.cleanupMcpResources();

        // Note: We don't clear subagents on exit - they remain for UI display
        // They will be cleared when the instance is explicitly killed or removed

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

      // For stream-json mode, send the initial prompt via stdin after a delay
      // This allows Claude to initialize before receiving input
      if (this.mode === 'stream-json' && this.prompt) {
        console.log(
          `[ClaudeInstance] Will send prompt after delay: ${this.prompt.substring(0, 100)}...`
        );
        setTimeout(() => {
          if (this.ptyProcess) {
            console.log(`[ClaudeInstance] Sending prompt to instance ${this.id}`);
            this.sendInput(this.prompt + '\r');
          } else {
            console.log(`[ClaudeInstance] ptyProcess is null, cannot send prompt`);
          }
        }, 1500); // Increased delay to ensure Claude is ready
      }
    } catch (error) {
      this._status = 'error';
      this._error = error instanceof Error ? error.message : 'Failed to start process';
      this.emit('status', this._status);
      this.emit('error', this._error);
    }
  }

  /**
   * Detect the shell type from the pooled terminal
   * Note: Git Bash on Windows is treated as Unix shell
   */
  private detectShellType(shell: string): 'powershell' | 'cmd' | 'unix' | 'gitbash' {
    const shellLower = shell.toLowerCase();

    // Check for Git Bash specifically on Windows (needs special path handling)
    if (process.platform === 'win32' && shellLower.includes('bash')) {
      return 'gitbash';
    }

    // Check for other bash/unix shells
    if (
      shellLower.includes('bash') ||
      shellLower.includes('zsh') ||
      shellLower.includes('fish') ||
      shellLower.includes('sh')
    ) {
      return 'unix';
    } else if (shellLower.includes('powershell') || shellLower.includes('pwsh')) {
      return 'powershell';
    } else if (shellLower.includes('cmd')) {
      return 'cmd';
    } else {
      // Default to unix for unknown shells
      return 'unix';
    }
  }

  /**
   * Convert a Windows path to Git Bash compatible path
   * e.g., C:\Users\name -> /c/Users/name
   */
  private toGitBashPath(windowsPath: string): string {
    // Replace backslashes with forward slashes
    let path = windowsPath.replace(/\\/g, '/');

    // Convert drive letter (C: -> /c)
    if (/^[A-Za-z]:/.test(path)) {
      const driveLetter = path[0].toLowerCase();
      path = `/${driveLetter}${path.substring(2)}`;
    }

    return path;
  }

  /**
   * Start Claude using a pre-spawned pooled terminal
   * This significantly reduces startup time by reusing an already-running shell
   */
  private startWithPooledTerminal(claudePath: string, args: string[]): void {
    if (!this.pooledTerminal) {
      throw new Error('startWithPooledTerminal called without pooledTerminal');
    }

    console.log(`[ClaudeInstance] Using pooled terminal ${this.pooledTerminal.id}`);
    const shellType = this.detectShellType(this.pooledTerminal.shell);
    console.log(`[ClaudeInstance] Detected shell type: ${shellType}`);

    try {
      console.log(`[ClaudeInstance] Entering try block for pooled terminal setup`);

      // Take ownership of the PTY from the pool
      console.log(`[ClaudeInstance] Taking ownership of PTY...`);
      console.log(`[ClaudeInstance] pooledTerminal.pty exists: ${!!this.pooledTerminal.pty}`);
      console.log(`[ClaudeInstance] pooledTerminal.pty.pid: ${this.pooledTerminal.pty?.pid}`);
      this.ptyProcess = this.pooledTerminal.pty;
      console.log(`[ClaudeInstance] PTY assigned: ${!!this.ptyProcess}`);
      console.log(`[ClaudeInstance] PTY pid after assignment: ${this.ptyProcess?.pid}`);

      this._status = 'starting';
      this.emit('status', this._status);

      // Setup event handlers (same as direct spawn)
      console.log(`[ClaudeInstance] Setting up event handlers...`);
      console.log(`[ClaudeInstance] ptyProcess type: ${typeof this.ptyProcess}`);
      console.log(`[ClaudeInstance] ptyProcess.onData type: ${typeof this.ptyProcess?.onData}`);

      this.ptyProcess.onData((data: string) => {
        this.emit('rawOutput', data);
        this.parser.process(data);

        if (this.mode !== 'stream-json') {
          if (this._status === 'starting' || this._status === 'waiting_input') {
            this._status = 'running';
            this.emit('status', this._status);
          }
          this.resetIdleTimer();
        }
      });

      this.ptyProcess.onExit(({ exitCode }) => {
        this._hasExited = true;
        this.clearIdleTimer();
        this.cleanupMcpResources();
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

      console.log(`[ClaudeInstance] Converting paths for shell type: ${shellType}`);
      // For Git Bash on Windows, convert paths to Unix-style
      let projectPathForShell = this.projectPath;
      let claudePathForShell = claudePath;
      if (shellType === 'gitbash') {
        projectPathForShell = this.toGitBashPath(this.projectPath);
        claudePathForShell = this.toGitBashPath(claudePath);
        console.log(`[ClaudeInstance] Converted project path: ${projectPathForShell}`);
        console.log(`[ClaudeInstance] Converted claude path: ${claudePathForShell}`);
      }

      // Escape path for shell (handle spaces and special characters)
      const escapedProjectPath = this.escapeShellPath(projectPathForShell, shellType);
      const escapedClaudePath = this.escapeShellPath(claudePathForShell, shellType);
      console.log(`[ClaudeInstance] Escaped project path: ${escapedProjectPath}`);
      console.log(`[ClaudeInstance] Escaped claude path: ${escapedClaudePath}`);

      // Build a single combined command: env vars + cd + clear + claude
      console.log(`[ClaudeInstance] Getting API URL from DataStore...`);
      const apiUrl = `http://localhost:${DataStore.getInstance().getRemoteConfig().port}`;

      const fullCommand = this.buildFullCommand(
        escapedProjectPath,
        escapedClaudePath,
        args,
        apiUrl,
        shellType
      );

      console.log(`[ClaudeInstance] Full command: ${fullCommand}`);
      console.log(`[ClaudeInstance] PTY process exists: ${!!this.ptyProcess}`);

      const pty = this.ptyProcess;
      if (!pty) {
        console.error(`[ClaudeInstance] PTY process is null!`);
        return;
      }

      // Send the single combined command
      console.log(`[ClaudeInstance] Sending command to PTY...`);
      pty.write(fullCommand + '\r');

      // Send prompt if provided (after a delay for Claude to start)
      if (this.mode === 'stream-json' && this.prompt) {
        setTimeout(() => {
          console.log(`[ClaudeInstance] Sending prompt`);
          pty.write(this.prompt + '\r');
        }, 2000);
      }
    } catch (error) {
      console.error(`[ClaudeInstance] ERROR in startWithPooledTerminal:`, error);
      console.error(
        `[ClaudeInstance] Error stack:`,
        error instanceof Error ? error.stack : 'no stack'
      );
      this._status = 'error';
      this._error = error instanceof Error ? error.message : 'Failed to start with pooled terminal';
      this.emit('status', this._status);
      this.emit('error', this._error);
    }
  }

  /**
   * Build a single full command that sets env vars, cd, clears, and runs Claude
   */
  private buildFullCommand(
    projectPath: string,
    claudePath: string,
    args: string[],
    apiUrl: string,
    shellType: 'powershell' | 'cmd' | 'unix' | 'gitbash'
  ): string {
    const argsStr = args.join(' ');

    // Build environment variables
    const envVars: Record<string, string> = {
      CLAUDE_DASHBOARD_INSTANCE_ID: this.id,
      CLAUDE_DASHBOARD_PROJECT_ID: this.projectId,
      CLAUDE_DASHBOARD_PROJECT_PATH: this.projectPath,
      CLAUDE_DASHBOARD_API_URL: apiUrl,
    };

    if (this.enableMcp && this.mcpToken) {
      envVars.ORCHESTRA_MCP_ENABLED = 'true';
      envVars.ORCHESTRA_MCP_TOKEN = this.mcpToken;
      envVars.ORCHESTRA_MCP_URL = `${apiUrl}/mcp`;
    }

    if (process.platform === 'win32' && this.pooledTerminal?.gitBashPath) {
      if (shellType === 'gitbash') {
        envVars.CLAUDE_CODE_GIT_BASH_PATH = this.pooledTerminal.gitBashPath.replace(/\\/g, '/');
      } else {
        envVars.CLAUDE_CODE_GIT_BASH_PATH = this.pooledTerminal.gitBashPath;
      }
    }

    switch (shellType) {
      case 'powershell': {
        const envStr = Object.entries(envVars)
          .map(([k, v]) => `$env:${k}="${v}"`)
          .join('; ');
        return `${envStr}; Set-Location -Path ${projectPath}; Clear-Host; & ${claudePath} ${argsStr}`;
      }
      case 'cmd': {
        const envStr = Object.entries(envVars)
          .map(([k, v]) => `set "${k}=${v}"`)
          .join(' && ');
        return `${envStr} && cd /d ${projectPath} && cls & ${claudePath} ${argsStr}`;
      }
      case 'gitbash':
      case 'unix':
      default: {
        const envStr = Object.entries(envVars)
          .map(([k, v]) => `export ${k}="${v}"`)
          .join(' && ');
        return `${envStr} && cd ${projectPath} && clear && ${claudePath} ${argsStr}`;
      }
    }
  }

  /**
   * Escape a path for shell command execution
   */
  private escapeShellPath(p: string, shellType: 'powershell' | 'cmd' | 'unix' | 'gitbash'): string {
    switch (shellType) {
      case 'powershell':
        // PowerShell: wrap in single quotes, escape single quotes by doubling
        if (p.includes(' ') || p.includes("'") || p.includes('"')) {
          return `'${p.replace(/'/g, "''")}'`;
        }
        return p;
      case 'cmd':
        // CMD: wrap in double quotes if contains spaces
        if (p.includes(' ')) {
          return `"${p}"`;
        }
        return p;
      case 'gitbash':
      case 'unix':
      default:
        // Unix/Git Bash: escape special characters or wrap in single quotes
        if (/[\s'"\\$`!]/.test(p)) {
          return `'${p.replace(/'/g, "'\\''")}'`;
        }
        return p;
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

      // Always use stream-json to capture structured data
      args.push('--output-format', 'stream-json', '--verbose');

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

    // Always use stream-json output format to capture session_id and structured data
    // This is required for both 'stream-json' and 'interactive' modes
    // The rawOutput event provides terminal-compatible output for display
    args.push('--output-format', 'stream-json', '--verbose');

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

    // Clean up MCP resources
    this.cleanupMcpResources();

    // Clean up subagent tracking
    const tracker = getSubagentTracker();
    tracker.clearSubagents(this.id);

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
