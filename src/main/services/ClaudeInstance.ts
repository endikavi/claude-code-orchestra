import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { StreamJSONParser, type ContextAutoPublishEvent } from './StreamJSONParser';
import { HistoryWatcher, createHistoryWatcher } from './HistoryWatcher';
import { TaskFileWatcher, createTaskFileWatcher } from './TaskFileWatcher';
import { DataStore } from './DataStore';
import { getWebServer } from './WebServer';
import { getSubagentTracker } from './SubagentTracker';
import { getTaskTracker } from './TaskTracker';
import { SharedContextStore } from './SharedContextStore';
import { getUserDataPath } from '../utils/paths';
import { isLocalProject } from '../utils/claudePaths';
import { isTmuxAvailable, getTmuxPath, getTmuxSessionName } from '../utils/tmux';
import type {
  ClaudeInstance as ClaudeInstanceType,
  ClaudeModel,
  InstanceMode,
  InstanceStatus,
  StreamMessage,
} from '@shared/types';
import type { SubagentStartedEvent, SubagentCompletedEvent } from '@shared/types/orchestration';
import type {
  TaskStartedEvent,
  TaskUpdatedEvent,
  TaskListEvent,
  TrackedTask,
} from '@shared/types/tasks';
import type { TeamSpawnEvent, TeamMessageEvent } from '@shared/types/teams';
import type { PooledTerminal } from '@shared/types/pool';
import { randomUUID } from 'crypto';

/**
 * Get the base API URL for the dashboard (http or https based on SSL config)
 */
function getApiBaseUrl(): string {
  const remoteConfig = DataStore.getInstance().getRemoteConfig();
  const protocol = remoteConfig.ssl?.enabled ? 'https' : 'http';
  return `${protocol}://localhost:${remoteConfig.port}`;
}

// MCP Bridge script content (embedded to avoid path issues in packaged app)
const MCP_BRIDGE_SCRIPT = `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const readline = require('readline');

const MCP_URL = process.env.ORCHESTRA_MCP_URL || 'http://localhost:3847/mcp';
const MCP_TOKEN = process.env.ORCHESTRA_MCP_TOKEN || '';
const url = new URL(MCP_URL);
const transport = url.protocol === 'https:' ? https : http;

function sendRequest(request) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(request);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Instance-Token': MCP_TOKEN,
      },
      rejectUnauthorized: false, // Allow self-signed certificates
    };
    const req = transport.request(options, (res) => {
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

/**
 * Generate the Session Start Hook script with embedded instance-specific values.
 *
 * IMPORTANT: Claude Code hooks are executed as separate processes that do NOT inherit
 * the environment variables from the pty process. Therefore, we cannot rely on
 * CLAUDE_DASHBOARD_INSTANCE_ID or CLAUDE_DASHBOARD_API_URL being available.
 *
 * The solution is to embed these values directly in the script when generating it
 * for each instance. This ensures the hook always has the correct values.
 *
 * The script:
 * 1. Reads JSON input from stdin (Claude Code passes hook data this way)
 * 2. Extracts session_id from the input OR from CLAUDE_SESSION_ID env var
 * 3. Sends the session_id to the dashboard API along with the embedded instanceId
 */
function generateSessionStartHookScript(instanceId: string, apiUrl: string): string {
  return `#!/usr/bin/env node
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Instance-specific values (embedded at script generation time)
// These are NOT read from environment variables because Claude Code hooks
// run as separate processes that don't inherit our custom env vars
const INSTANCE_ID = '${instanceId}';
const API_URL = '${apiUrl}';

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
  log('SessionStart hook executed for instance: ' + INSTANCE_ID);
  log('Raw stdin: ' + inputData);

  let hookInput = {};
  try {
    hookInput = JSON.parse(inputData);
    log('Parsed hook input: ' + JSON.stringify(hookInput));
  } catch (e) {
    log('Failed to parse stdin JSON: ' + e.message);
  }

  // Get session_id from hook input (stdin JSON) OR from CLAUDE_SESSION_ID env var
  // Claude Code may pass it in either location depending on version
  const sessionId = hookInput.session_id || process.env.CLAUDE_SESSION_ID;

  log('session_id: ' + (sessionId || 'NOT SET'));
  log('instanceId (embedded): ' + INSTANCE_ID);
  log('apiUrl (embedded): ' + API_URL);

  if (sessionId && INSTANCE_ID && API_URL) {
    log('All vars present, sending request...');
    const url = new URL('/api/instances/session-id', API_URL);
    const data = JSON.stringify({ instanceId: INSTANCE_ID, sessionId });

    // Choose http or https based on URL protocol
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      },
      // Allow self-signed certificates (for local development)
      rejectUnauthorized: false
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
    log('Missing session_id, skipping request');
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
}

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

import type { CustomAgentsConfig } from '@shared/types';

export interface ClaudeInstanceConfig {
  projectId: string;
  projectPath: string;
  model: ClaudeModel;
  mode: InstanceMode;
  prompt?: string; // Initial prompt for stream-json/print mode
  skipPermissions?: boolean;
  verbose?: boolean; // Enable verbose output (default: false)
  resumeSessionId?: string; // For --resume flag
  planMode?: boolean; // For --plan flag
  enableMcp?: boolean; // Enable MCP server integration
  pooledTerminal?: PooledTerminal; // Pre-spawned terminal from pool (local-only)
  agents?: CustomAgentsConfig; // Custom agents to inject as skills (--agents parameter)
  agentFile?: string; // Path to agent file for --agent parameter (e.g., AGENT.md)
  isHidden?: boolean; // Hidden instances don't show in main tabs (e.g., Ralph background tasks)
  ralphTaskId?: string; // Associated Ralph task ID if this is a Ralph loop instance
  additionalDirs?: string[]; // Additional working directories for --add-dir flag
  useAgentsFlag?: boolean; // Use --agents flag instead of installing as skills
  usePermissionPromptTool?: boolean; // Use --permission-prompt-tool for structured view permission handling
  tmuxMode?: boolean; // When true and tmux is available, spawn Claude inside a tmux session
}

export class ClaudeInstance extends EventEmitter {
  public readonly id: string;
  public readonly projectId: string;
  public readonly model: ClaudeModel;
  public readonly mode: InstanceMode;
  public readonly prompt?: string;
  public readonly createdAt: number;
  public readonly skipPermissions: boolean;
  public readonly verbose: boolean;
  public readonly resumeSessionId?: string;
  public readonly planMode: boolean;
  public readonly enableMcp: boolean;
  public readonly agents?: CustomAgentsConfig;
  public readonly agentFile?: string;
  public readonly isHidden: boolean; // Hidden instances don't show in main tabs
  public readonly ralphTaskId?: string; // Associated Ralph task ID
  public readonly additionalDirs?: string[]; // Additional working directories
  public readonly useAgentsFlag: boolean; // Use --agents flag instead of skills
  public readonly usePermissionPromptTool: boolean; // Use MCP tool for permission prompts
  public readonly isTmuxSession: boolean; // True when this instance runs inside tmux

  private ptyProcess: pty.IPty | null = null;
  private mcpToken?: string; // Token for MCP authentication
  private parser: StreamJSONParser;
  private historyWatcher: HistoryWatcher | null = null; // Fallback for non-verbose mode
  private taskFileWatcher: TaskFileWatcher | null = null; // Watches Claude's task files
  private _status: InstanceStatus = 'starting';
  private _error?: string;
  private _sessionId?: string;
  private projectPath: string;
  private _hasExited: boolean = false; // Flag to prevent race conditions on resize
  private _receivedResult: boolean = false; // Flag to detect shell prompt after result
  private idleTimer: NodeJS.Timeout | null = null;
  private pooledTerminal?: PooledTerminal; // Pre-spawned terminal from pool
  private pendingTimers: Set<NodeJS.Timeout> = new Set(); // Track pending timeouts for cleanup
  private _dimensions: { cols: number; rows: number } = { cols: 32767, rows: 30 }; // Track current dimensions for repaint

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
    this.verbose = config.verbose ?? false;
    this.resumeSessionId = config.resumeSessionId;
    this.planMode = config.planMode ?? false;
    this.enableMcp = config.enableMcp ?? false;
    this.pooledTerminal = config.pooledTerminal;
    this.agents = config.agents;
    this.agentFile = config.agentFile;
    this.isHidden = config.isHidden ?? false;
    this.ralphTaskId = config.ralphTaskId;
    this.additionalDirs = config.additionalDirs;
    this.useAgentsFlag = config.useAgentsFlag ?? false;
    this.usePermissionPromptTool = config.usePermissionPromptTool ?? false;
    // Only spawn inside tmux for interactive/terminal mode (not stream-json or print)
    // and only when the user enabled tmuxMode AND tmux is actually available
    this.isTmuxSession =
      (config.tmuxMode ?? false) && config.mode === 'interactive' && isTmuxAvailable();
    this.createdAt = Date.now();

    this.parser = new StreamJSONParser();
    this.setupParserListeners();

    // Setup HistoryWatcher for non-verbose local projects
    // This provides fallback Task/Subagent tracking by reading history files directly
    if (!this.verbose && isLocalProject(this.projectPath)) {
      this.historyWatcher = createHistoryWatcher(this.projectPath);
      if (this.historyWatcher) {
        this.setupHistoryWatcherListeners();
        console.log(`[ClaudeInstance] HistoryWatcher enabled for non-verbose local project`);
      }
    }

    // Setup TaskFileWatcher for local projects
    // This watches Claude's task files in ~/.claude/tasks/<session-id>/
    // Works for both verbose and non-verbose modes since tasks are file-based
    if (isLocalProject(this.projectPath)) {
      this.taskFileWatcher = createTaskFileWatcher(this.id);
      this.setupTaskFileWatcherListeners();
      console.log(`[ClaudeInstance] TaskFileWatcher enabled for local project`);
    }

    // Initialize context for this instance
    const contextStore = SharedContextStore.getInstance();
    contextStore.setInstanceContext(this.id, this.projectId, {
      workStatus: 'idle',
    });
    contextStore.updateInstanceMetadata(this.id, {
      model: this.model,
    });
  }

  private setupParserListeners(): void {
    this.parser.on('message', (message: StreamMessage) => {
      // Track when we receive a result message (Claude finished processing)
      if (message.type === 'result') {
        this._receivedResult = true;
      }

      // Capture session_id from system message (only works in stream-json mode)
      if (message.type === 'system' && message.session_id) {
        this._sessionId = message.session_id;
        this.emit('sessionId', message.session_id);

        // Start HistoryWatcher once we have the session ID
        if (this.historyWatcher && !this.historyWatcher.isActive()) {
          this.historyWatcher.setSessionId(message.session_id);
          this.historyWatcher.start();
          console.log(`[ClaudeInstance] HistoryWatcher started for session: ${message.session_id}`);
        }

        // Start TaskFileWatcher - uses session ID as task list ID by default
        if (this.taskFileWatcher && !this.taskFileWatcher.isActive()) {
          this.taskFileWatcher.setTaskListId(message.session_id);
          this.taskFileWatcher.start();
          console.log(
            `[ClaudeInstance] TaskFileWatcher started for session: ${message.session_id}`
          );
        }
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
      const tracker = getSubagentTracker();
      const subagent = tracker.startSubagent(this.id, data);
      this.emit('subagent:started', { instanceId: this.id, subagent });
    });

    this.parser.on('subagent_completed', (data: SubagentCompletedEvent) => {
      const tracker = getSubagentTracker();
      const subagent = tracker.completeSubagent(this.id, data);
      if (subagent) {
        this.emit('subagent:completed', { instanceId: this.id, subagent });
      }
    });

    // Task tracking (Claude Code TaskCreate/TaskUpdate/TaskList tools)
    this.parser.on('task_created', (data: TaskStartedEvent) => {
      const tracker = getTaskTracker();
      const task = tracker.createTask(this.id, data);
      this.emit('task:created', { instanceId: this.id, task });
    });

    this.parser.on('task_updated', (data: TaskUpdatedEvent) => {
      const tracker = getTaskTracker();
      const task = tracker.updateTask(this.id, data);
      if (task) {
        this.emit('task:updated', { instanceId: this.id, task });
      }
    });

    this.parser.on('task_list', (data: TaskListEvent) => {
      const tracker = getTaskTracker();
      const tasks = tracker.syncTaskList(this.id, data);
      this.emit('task:list', { instanceId: this.id, tasks });
    });

    // Team tracking (Teammate/SendMessage tools)
    this.parser.on('team_spawn', (data: TeamSpawnEvent) => {
      this.emit('team:spawn_detected', { ...data, instanceId: this.id });
    });

    this.parser.on('team_message', (data: TeamMessageEvent) => {
      this.emit('team:message_detected', { ...data, instanceId: this.id });
    });

    // Auto-publish context based on tool usage
    this.parser.on('context_auto_publish', (data: ContextAutoPublishEvent) => {
      const contextStore = SharedContextStore.getInstance();

      // Update instance context with detected info
      if (data.workStatus) {
        contextStore.updateWorkStatus(this.id, data.workStatus);
      }
      if (data.currentFiles && data.currentFiles.length > 0) {
        contextStore.addCurrentFiles(this.id, data.currentFiles);
      }

      // Also set full context if we have workStatus
      if (data.workStatus || data.currentFiles) {
        contextStore.setInstanceContext(this.id, this.projectId, {
          workStatus: data.workStatus,
          currentFiles: data.currentFiles,
          currentTask: data.currentTask,
        });
      }
    });
  }

  /**
   * Setup listeners for HistoryWatcher events
   * This provides Task/Subagent tracking when verbose mode is disabled
   */
  private setupHistoryWatcherListeners(): void {
    if (!this.historyWatcher) return;

    // Subagent tracking from history files
    this.historyWatcher.on('subagent_started', (data: SubagentStartedEvent) => {
      const tracker = getSubagentTracker();
      const subagent = tracker.startSubagent(this.id, data);
      this.emit('subagent:started', { instanceId: this.id, subagent });
      console.log(`[ClaudeInstance] Subagent started (via history): ${data.id}`);
    });

    this.historyWatcher.on('subagent_completed', (data: SubagentCompletedEvent) => {
      const tracker = getSubagentTracker();
      const subagent = tracker.completeSubagent(this.id, data);
      if (subagent) {
        this.emit('subagent:completed', { instanceId: this.id, subagent });
        console.log(`[ClaudeInstance] Subagent completed (via history): ${data.id}`);
      }
    });

    // Task tracking from history files
    this.historyWatcher.on('task_created', (data: TaskStartedEvent) => {
      const tracker = getTaskTracker();
      const task = tracker.createTask(this.id, data);
      this.emit('task:created', { instanceId: this.id, task });
      console.log(`[ClaudeInstance] Task created (via history): ${data.subject}`);
    });

    this.historyWatcher.on('task_updated', (data: TaskUpdatedEvent) => {
      const tracker = getTaskTracker();
      const task = tracker.updateTask(this.id, data);
      if (task) {
        this.emit('task:updated', { instanceId: this.id, task });
        console.log(`[ClaudeInstance] Task updated (via history): ${data.id} -> ${data.status}`);
      }
    });

    this.historyWatcher.on('error', (error: Error) => {
      console.error('[ClaudeInstance] HistoryWatcher error:', error);
    });
  }

  /**
   * Setup listeners for TaskFileWatcher events
   * This watches Claude's task files in ~/.claude/tasks/<session-id>/
   */
  private setupTaskFileWatcherListeners(): void {
    if (!this.taskFileWatcher) return;

    // Task created from task files
    this.taskFileWatcher.on('task_created', (data: { task: TrackedTask; instanceId: string }) => {
      const tracker = getTaskTracker();
      // Update the tracker with the file-based task data
      tracker.setTask(this.id, data.task);
      this.emit('task:created', { instanceId: this.id, task: data.task });
      console.log(`[ClaudeInstance] Task created (via file): ${data.task.subject}`);
    });

    // Task updated from task files
    this.taskFileWatcher.on('task_updated', (data: { task: TrackedTask; instanceId: string }) => {
      const tracker = getTaskTracker();
      tracker.setTask(this.id, data.task);
      this.emit('task:updated', { instanceId: this.id, task: data.task });
      console.log(
        `[ClaudeInstance] Task updated (via file): ${data.task.id} -> ${data.task.status}`
      );
    });

    // Task deleted
    this.taskFileWatcher.on('task_deleted', (data: { taskId: string; instanceId: string }) => {
      const tracker = getTaskTracker();
      tracker.deleteTask(this.id, data.taskId);
      console.log(`[ClaudeInstance] Task deleted (via file): ${data.taskId}`);
    });

    // Error handling
    this.taskFileWatcher.on('error', (error: Error) => {
      console.error('[ClaudeInstance] TaskFileWatcher error:', error);
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
    if (!this.enableMcp) {
      return;
    }
    const apiUrl = getApiBaseUrl();

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
          mcpConfig = JSON.parse(content) as Record<string, unknown>;
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
      // Write bridge script to userData directory (always update if content changed)
      const bridgePath = path.join(getUserDataPath(), 'mcp-bridge.js');
      const existingContent = fs.existsSync(bridgePath) ? fs.readFileSync(bridgePath, 'utf-8') : '';
      if (existingContent !== MCP_BRIDGE_SCRIPT) {
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

    // Also cleanup the hook script file
    this.cleanupHookScript();
  }

  /**
   * Cleanup the hook script file for this instance and remove from settings.local.json
   */
  private cleanupHookScript(): void {
    try {
      const hookScriptPath = path.join(getUserDataPath(), `session-start-hook-${this.id}.js`);
      if (fs.existsSync(hookScriptPath)) {
        fs.unlinkSync(hookScriptPath);
        console.log(`[ClaudeInstance] Cleaned up hook script: ${hookScriptPath}`);
      }

      // Also cleanup the hook configuration from settings.local.json
      // This prevents stale hooks pointing to deleted scripts
      const localSettingsPath = path.join(this.projectPath, '.claude', 'settings.local.json');
      if (fs.existsSync(localSettingsPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8')) as Record<
            string,
            unknown
          >;
          const hooks = settings.hooks as Record<string, unknown> | undefined;
          if (hooks?.SessionStart) {
            // Check if the hook references this instance's script
            const sessionStartHooks = hooks.SessionStart as Array<{
              hooks: Array<{ command?: string }>;
            }>;
            const hookRefersToThisInstance = sessionStartHooks.some((h) =>
              h.hooks?.some((innerHook) =>
                innerHook.command?.includes(`session-start-hook-${this.id}`)
              )
            );
            if (hookRefersToThisInstance) {
              // Remove the SessionStart hook entirely since our script is being cleaned up
              delete hooks.SessionStart;
              if (Object.keys(hooks).length === 0) {
                settings.hooks = {};
              }
              fs.writeFileSync(localSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
              console.log(`[ClaudeInstance] Cleaned up hook config from settings.local.json`);
            }
          }
        } catch (parseError) {
          // Non-critical, just log
          console.error('[ClaudeInstance] Failed to cleanup hook config:', parseError);
        }
      }
    } catch (error) {
      // Non-critical error, just log it
      console.error('[ClaudeInstance] Failed to cleanup hook script:', error);
    }
  }

  /**
   * Setup SessionStart hook to capture CLAUDE_SESSION_ID
   * This hook is called by Claude Code when a session starts and sends the sessionId to the dashboard API
   */
  private setupSessionHook(): void {
    try {
      // Get the API URL for the hook to communicate with the dashboard
      const apiUrl = getApiBaseUrl();

      // Generate hook script with embedded instance-specific values
      // Each instance gets its own script file to ensure correct instanceId is used
      const hookScriptPath = path.join(getUserDataPath(), `session-start-hook-${this.id}.js`);
      const hookScript = generateSessionStartHookScript(this.id, apiUrl);
      fs.writeFileSync(hookScriptPath, hookScript, 'utf-8');
      console.log(`[ClaudeInstance] Session hook script written to ${hookScriptPath}`);

      // Add hook to .claude/settings.local.json (not committed to git)
      const claudeDir = path.join(this.projectPath, '.claude');
      const localSettingsPath = path.join(claudeDir, 'settings.local.json');

      let settings: Record<string, unknown> = {};
      if (fs.existsSync(localSettingsPath)) {
        try {
          settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8')) as Record<
            string,
            unknown
          >;
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
   * Install custom agents as skills to the project
   * These agents can be spawned using the Task tool
   */
  private installCustomAgents(): void {
    if (!this.agents) return;

    try {
      // Import SkillManager dynamically to avoid circular dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSkillManager } = require('./SkillManager');
      const skillManager = getSkillManager();

      console.log(
        `[ClaudeInstance] Installing ${Object.keys(this.agents).length} custom agents as skills`
      );

      // Install synchronously since we need this done before Claude starts
      const skillsDir = path.join(this.projectPath, '.claude', 'skills');
      if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
      }

      for (const [agentName, agentConfig] of Object.entries(this.agents)) {
        try {
          const safeAgentName = agentName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
          const skillDir = path.join(skillsDir, safeAgentName);
          if (!fs.existsSync(skillDir)) {
            fs.mkdirSync(skillDir, { recursive: true });
          }

          const content = skillManager.generateCustomAgentSkill(agentName, agentConfig);
          const skillPath = path.join(skillDir, 'SKILL.md');
          fs.writeFileSync(skillPath, content, 'utf-8');

          console.log(`[ClaudeInstance] Installed custom agent: ${safeAgentName}`);
        } catch (error) {
          console.error(`[ClaudeInstance] Failed to install agent ${agentName}:`, error);
        }
      }
    } catch (error) {
      console.error('[ClaudeInstance] Failed to install custom agents:', error);
    }
  }

  /**
   * Start the Claude CLI process
   */
  start(): void {
    // Setup MCP configuration if enabled (must complete before starting Claude)
    if (this.enableMcp) {
      this.setupMcpConfiguration();
    }

    // Install custom agents as skills if provided (--agents parameter)
    if (this.agents && Object.keys(this.agents).length > 0) {
      this.installCustomAgents();
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

    // Wrap in tmux if this instance should run inside a tmux session
    // tmux new-session -A -s <name> <command> will create or attach to the session
    if (this.isTmuxSession) {
      const tmuxPath = getTmuxPath();
      const sessionName = getTmuxSessionName(this.id);
      // Build the full claude command as a single string for tmux to execute
      const claudeCmd = [shell, ...shellArgs].map((a) => `"${a}"`).join(' ');
      shell = tmuxPath;
      shellArgs = ['new-session', '-A', '-s', sessionName, claudeCmd];
      console.log(`[ClaudeInstance] Spawning inside tmux session: ${sessionName}`);
    }

    try {
      // Use full process.env to ensure PATH includes Node.js and other required tools
      // The claude.cmd script needs node to be available
      // Also inject dashboard environment variables for hooks integration
      const apiUrl = getApiBaseUrl();

      // Build environment variables
      const envVars: Record<string, string> = {
        ...(process.env as Record<string, string>),
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
        // Enable the new task tracking system in Claude Code
        CLAUDE_CODE_ENABLE_TASKS: 'true',
        // Enable reading CLAUDE.md from additional directories (--add-dir)
        CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
        // Enable experimental agent teams (Teammate tool with spawnTeam)
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
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

      // Terminal size: tmux manages its own terminal size, so use reasonable defaults.
      // For non-tmux stream-json mode, use very large width to prevent line wrapping corruption.
      const cols = this.isTmuxSession ? 120 : 32767;
      const rows = 30;

      this.ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: this.projectPath,
        env: envVars,
      });

      this._status = 'starting';
      this.emit('status', this._status);

      // Setup event handlers (extracted to avoid duplication)
      this.setupDataHandler(this.ptyProcess);
      this.setupExitHandler(this.ptyProcess);

      // Note: For stream-json mode, the initial prompt is passed as a CLI argument to -p
      // Subsequent messages are sent via stdin in JSON format using sendJsonMessage()
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

    const shellType = this.detectShellType(this.pooledTerminal.shell);

    try {
      // Take ownership of the PTY from the pool
      this.ptyProcess = this.pooledTerminal.pty;

      this._status = 'starting';
      this.emit('status', this._status);

      // Setup event handlers (extracted to avoid duplication)
      this.setupDataHandler(this.ptyProcess);
      this.setupExitHandler(this.ptyProcess);

      // For Git Bash on Windows, convert paths to Unix-style
      let projectPathForShell = this.projectPath;
      let claudePathForShell = claudePath;
      if (shellType === 'gitbash') {
        projectPathForShell = this.toGitBashPath(this.projectPath);
        claudePathForShell = this.toGitBashPath(claudePath);
      }

      // Escape path for shell (handle spaces and special characters)
      const escapedProjectPath = this.escapeShellPath(projectPathForShell, shellType);
      const escapedClaudePath = this.escapeShellPath(claudePathForShell, shellType);

      // Build a single combined command: env vars + cd + clear + claude
      const apiUrl = getApiBaseUrl();

      const fullCommand = this.buildFullCommand(
        escapedProjectPath,
        escapedClaudePath,
        args,
        apiUrl,
        shellType
      );

      const pty = this.ptyProcess;
      if (!pty) {
        return;
      }

      // Send the single combined command
      // Note: For stream-json mode, the initial prompt is included in the command args
      pty.write(fullCommand + '\r');
    } catch (error) {
      console.error(`[ClaudeInstance] Failed to start with pooled terminal:`, error);
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
    // Escape each argument that contains spaces or special characters
    const escapedArgs = args.map((arg) => this.escapeShellArg(arg, shellType));
    const argsStr = escapedArgs.join(' ');

    // Build environment variables
    const envVars: Record<string, string> = {
      CLAUDE_DASHBOARD_INSTANCE_ID: this.id,
      CLAUDE_DASHBOARD_PROJECT_ID: this.projectId,
      CLAUDE_DASHBOARD_PROJECT_PATH: this.projectPath,
      CLAUDE_DASHBOARD_API_URL: apiUrl,
      // Enable reading CLAUDE.md from additional directories (--add-dir)
      CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
      // Enable experimental agent teams (Teammate tool with spawnTeam)
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
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
   * Escape a shell argument (for use in pooled terminal commands)
   * Only escapes arguments that need escaping (contain spaces, quotes, etc.)
   */
  private escapeShellArg(
    arg: string,
    shellType: 'powershell' | 'cmd' | 'unix' | 'gitbash'
  ): string {
    // If the arg doesn't contain special characters, return as-is
    if (!/[\s'"\\$`!]/.test(arg)) {
      return arg;
    }

    // Otherwise, use the same escaping as paths
    return this.escapeShellPath(arg, shellType);
  }

  /**
   * Build Claude CLI arguments
   */
  private buildArgs(): string[] {
    const args: string[] = [];

    // When resuming a session, use --resume to specify the session ID
    if (this.resumeSessionId) {
      // Use --resume to resume a specific session by its ID
      // Note: --continue (without session ID) resumes the LAST session, which is NOT what we want
      args.push('--resume', this.resumeSessionId);

      // Only use stream-json flags for structured view mode
      // In interactive/terminal mode, resume normally without stream-json
      if (this.mode === 'stream-json') {
        args.push('--output-format', 'stream-json');
        args.push('--input-format', 'stream-json');
        // --verbose is required for stream-json to work correctly
        args.push('--verbose');
      }

      // Add model
      args.push('--model', this.model);

      // Add skip permissions flag if enabled
      if (this.skipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      // Add agent file if specified (for orchestration instructions)
      if (this.agentFile) {
        args.push('--agent', this.agentFile);
      }

      // Add additional directories
      this.addAdditionalDirsArgs(args);

      // Add agents via --agents flag if configured
      this.addAgentsArgs(args);

      // Add --permission-prompt-tool for structured view permission handling
      if (this.usePermissionPromptTool && this.enableMcp) {
        args.push('--permission-prompt-tool', 'mcp__orchestra__permission_prompt');
      }

      // Add prompt as positional argument for resume with new message
      // Format: claude -r "session-id" "new query"
      if (this.prompt) {
        args.push(this.prompt);
      }

      return args;
    }

    // For new conversations:
    // Build args based on mode - stream-json flags only work with -p (print mode)
    if (this.mode === 'print') {
      args.push('-p');
      // Add prompt at the end for print mode
      if (this.prompt) {
        args.push(this.prompt);
      }
    } else if (this.mode === 'stream-json') {
      // stream-json mode (structured view): use -p with stream-json input/output
      // This enables JSON-based communication for the structured UI
      args.push('-p');
      args.push('--input-format', 'stream-json');
      args.push('--output-format', 'stream-json');
      // --verbose is required for stream-json to work correctly
      args.push('--verbose');
    }
    // For 'interactive' mode (terminal): no special flags needed
    // Claude CLI runs in normal TUI mode

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

    // Add agent file if specified (for orchestration instructions)
    if (this.agentFile) {
      args.push('--agent', this.agentFile);
    }

    // Add additional directories
    this.addAdditionalDirsArgs(args);

    // Add agents via --agents flag if configured
    this.addAgentsArgs(args);

    // Add --permission-prompt-tool for structured view permission handling
    // This routes permission prompts through the MCP tool instead of terminal
    if (this.usePermissionPromptTool && this.enableMcp) {
      args.push('--permission-prompt-tool', 'mcp__orchestra__permission_prompt');
    }

    // For stream-json mode, add the prompt as the final argument
    // This is required because -p expects the prompt as the last argument
    // Format: claude -p "prompt" --input-format stream-json --output-format stream-json
    if (this.mode === 'stream-json' && this.prompt) {
      args.push(this.prompt);
    }

    return args;
  }

  /**
   * Add --add-dir arguments for additional working directories
   */
  private addAdditionalDirsArgs(args: string[]): void {
    if (this.additionalDirs && this.additionalDirs.length > 0) {
      for (const dir of this.additionalDirs) {
        // Validate directory exists before adding
        if (fs.existsSync(dir)) {
          args.push('--add-dir', dir);
        } else {
          console.warn(`[ClaudeInstance] Additional directory does not exist: ${dir}`);
        }
      }
    }
  }

  /**
   * Add --agents argument with JSON payload for custom agents
   * Only used when useAgentsFlag is true (agentDeliveryMethod='args')
   */
  private addAgentsArgs(args: string[]): void {
    if (this.useAgentsFlag && this.agents && Object.keys(this.agents).length > 0) {
      args.push('--agents', JSON.stringify(this.agents));
    }
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
      // Guard against race condition: timer may fire after instance exits
      if (this._hasExited) {
        return;
      }
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
   * Clear all pending timers (prompt delays, etc.)
   */
  private clearPendingTimers(): void {
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
  }

  /**
   * Clean up parser event listeners to prevent memory leaks
   */
  private cleanupParserListeners(): void {
    this.parser.removeAllListeners();
  }

  /**
   * Clean up HistoryWatcher to stop watching and prevent memory leaks
   */
  private cleanupHistoryWatcher(): void {
    if (this.historyWatcher) {
      this.historyWatcher.stop();
      this.historyWatcher.removeAllListeners();
      this.historyWatcher = null;
      console.log(`[ClaudeInstance] HistoryWatcher cleaned up`);
    }
  }

  /**
   * Clean up TaskFileWatcher to stop watching and prevent memory leaks
   */
  private cleanupTaskFileWatcher(): void {
    if (this.taskFileWatcher) {
      this.taskFileWatcher.stop();
      this.taskFileWatcher.removeAllListeners();
      this.taskFileWatcher = null;
      console.log(`[ClaudeInstance] TaskFileWatcher cleaned up`);
    }
  }

  /**
   * Setup the onData handler for the PTY process
   * Extracted to avoid code duplication between start() and startWithPooledTerminal()
   */
  private setupDataHandler(ptyProcess: pty.IPty): void {
    ptyProcess.onData((data: string) => {
      // DEBUG: Log raw data chunks (disabled - too noisy)
      // const preview = data.length > 100 ? data.substring(0, 100) + '...' : data;
      // console.log(
      //   `[ClaudeInstance] onData received ${data.length} bytes: ${preview.replace(/\n/g, '\\n')}`
      // );

      // Strip terminal query responses (DA1/DA2/DA3, CPR) that cause garbage
      // text like [?1;2c[>0;276;0c when displayed or replayed
      /* eslint-disable no-control-regex, no-useless-escape */
      const cleanData = data.replace(/\x1b\[[\?>=]\d+(;\d+)*c|\x1b\[\d+(;\d+)*R/g, '');
      /* eslint-enable no-control-regex, no-useless-escape */

      // Emit raw data for terminal view (skip if only query responses)
      if (cleanData) {
        this.emit('rawOutput', cleanData);
      }

      // Detect shell prompt after result message (means Claude CLI has exited)
      // This handles pooled terminals where the PTY doesn't exit when Claude finishes
      if (this._receivedResult && this._status !== 'completed' && this._status !== 'error') {
        // Check for shell prompt patterns (Windows cmd/powershell, Unix bash/zsh)
        // Windows: C:\path\to\project> or PS C:\path>
        // Unix: user@host:~/path$ or ~/path %
        const shellPromptPattern = /[>$%#]\s*$/;
        const windowsPromptPattern = /[A-Za-z]:\\[^>]*>\s*$/;
        // eslint-disable-next-line no-control-regex
        const cleanData = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''); // Strip ANSI codes

        if (shellPromptPattern.test(cleanData) || windowsPromptPattern.test(cleanData)) {
          console.log('[ClaudeInstance] Shell prompt detected after result - marking as completed');
          this._status = 'completed';
          this.emit('status', this._status);
          // Emit exit event for pooled terminals (PTY doesn't actually exit)
          // This allows RalphTaskLoop and other listeners to know the instance finished
          // Only emit if we haven't already emitted exit (prevents double emit)
          if (!this._hasExited) {
            this._hasExited = true;
            console.log('[ClaudeInstance] Emitting exit event for pooled terminal completion');
            this.emit('exit', 0);
          }
        }
      }

      // Parse JSON for stream-json mode to capture session_id and structured messages
      // In interactive mode, this will mostly be a no-op since output is not JSON
      // The session_id in interactive mode comes from the SessionStart hook instead
      if (this.mode === 'stream-json') {
        this.parser.process(data);
      }

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
  }

  /**
   * Setup the onExit handler for the PTY process
   * Extracted to avoid code duplication between start() and startWithPooledTerminal()
   */
  private setupExitHandler(ptyProcess: pty.IPty): void {
    ptyProcess.onExit(({ exitCode }) => {
      // Set exit flag immediately to prevent resize race conditions
      this._hasExited = true;

      // Clean up idle timer
      this.clearIdleTimer();

      // Clean up MCP resources
      this.cleanupMcpResources();

      // Stop HistoryWatcher and remove listeners to prevent memory leaks
      if (this.historyWatcher) {
        this.historyWatcher.stop();
        this.historyWatcher.removeAllListeners();
      }

      // Stop TaskFileWatcher and remove listeners to prevent memory leaks
      if (this.taskFileWatcher) {
        this.taskFileWatcher.stop();
        this.taskFileWatcher.removeAllListeners();
      }

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

      // Clear context for this instance
      const contextStore = SharedContextStore.getInstance();
      contextStore.clearInstanceContext(this.id);
    });
  }

  /**
   * Send input to the process
   * For interactive mode: sends raw input (terminal-style)
   * For stream-json mode: use sendJsonMessage instead for user messages
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
   * Send a user message in JSON format for stream-json mode
   * Format: {"type":"user","message":{"role":"user","content":"<message>"}}
   * This is the proper way to send user input in non-interactive JSON mode
   */
  sendJsonMessage(message: string): void {
    if (this.ptyProcess && !this._hasExited) {
      // When user sends input while waiting, change back to running
      if (this._status === 'waiting_input') {
        this._status = 'running';
        this.emit('status', this._status);
      }

      // Format message as JSON per Claude CLI stream-json input format
      const jsonMessage = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: message,
        },
      });

      // Write JSON message followed by newline (required for stdin parsing)
      this.ptyProcess.write(jsonMessage + '\n');
    }
  }

  /**
   * Check if this instance uses JSON input format (stream-json mode)
   */
  usesJsonInput(): boolean {
    return this.mode === 'stream-json';
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    // Only resize if process exists and hasn't exited
    if (this.ptyProcess && !this._hasExited) {
      try {
        this.ptyProcess.resize(cols, rows);
        this._dimensions = { cols, rows };
      } catch {
        // Silently ignore resize errors - process may have exited
      }
    }
  }

  /**
   * Get current terminal dimensions
   */
  get dimensions(): { cols: number; rows: number } {
    return this._dimensions;
  }

  /**
   * Force a terminal repaint using various experimental methods
   * Used to fix visual glitches in Claude Code TUI
   * @param method The repaint method to use
   */
  forceRepaint(method: 'fake-resize' | 'ansi-clear'): void {
    if (!this.ptyProcess || this._hasExited) return;

    if (method === 'fake-resize') {
      // Temporarily change cols to trigger SIGWINCH, then restore
      const { cols, rows } = this._dimensions;
      try {
        this.ptyProcess.resize(cols - 1, rows);
        // Use setImmediate to restore dimensions in the next event loop tick
        setImmediate(() => {
          if (this.ptyProcess && !this._hasExited) {
            this.ptyProcess.resize(cols, rows);
          }
        });
      } catch {
        // Silently ignore resize errors
      }
    } else if (method === 'ansi-clear') {
      // Send ANSI escape sequences to clear and redraw the screen
      // ESC[H = Move cursor to home position
      // ESC[2J = Clear entire screen
      this.ptyProcess.write('\x1b[H\x1b[2J');
    }
  }

  /**
   * Kill the process (force kill, immediate)
   * On Windows, uses taskkill /T to kill the entire process tree (including child processes like servers)
   */
  kill(): void {
    // Set exit flag immediately to prevent any pending operations
    this._hasExited = true;

    // Clean up all timers
    this.clearIdleTimer();
    this.clearPendingTimers();

    // Clean up parser listeners to prevent memory leaks
    this.cleanupParserListeners();

    // Clean up HistoryWatcher
    this.cleanupHistoryWatcher();

    // Clean up TaskFileWatcher
    this.cleanupTaskFileWatcher();

    // Clean up MCP resources
    this.cleanupMcpResources();

    // Clean up subagent tracking
    const subagentTracker = getSubagentTracker();
    subagentTracker.clearSubagents(this.id);

    // Clean up task tracking
    const taskTracker = getTaskTracker();
    taskTracker.clearTasks(this.id);

    if (this.ptyProcess) {
      this._status = 'killed';
      this.emit('status', this._status);

      // Get PID before killing
      const pid = this.ptyProcess.pid;

      // On Windows, use taskkill to kill the entire process tree
      // This ensures child processes (like PHP servers, npm watch, etc.) are also killed
      if (process.platform === 'win32' && pid) {
        try {
          // /F = Force, /T = Tree (kill child processes), /PID = Process ID
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[ClaudeInstance ${this.id}] Killed process tree (PID: ${pid})`);
        } catch {
          // taskkill may fail if process already exited, fallback to pty.kill()
          console.log(`[ClaudeInstance ${this.id}] taskkill failed, falling back to pty.kill()`);
          this.ptyProcess.kill();
        }
      } else {
        // On Unix, kill the process group (negative PID kills the group)
        if (pid) {
          try {
            process.kill(-pid, 'SIGKILL');
            console.log(`[ClaudeInstance ${this.id}] Killed process group (PGID: ${pid})`);
          } catch {
            // May fail if not process group leader, fallback to pty.kill()
            this.ptyProcess.kill();
          }
        } else {
          this.ptyProcess.kill();
        }
      }

      this.ptyProcess = null;
    }
  }

  /**
   * Gracefully kill the process by sending /exit to Claude, then exit to shell
   * Falls back to force kill if graceful methods fail
   * @param options Configuration for graceful kill timeouts
   */
  async gracefulKill(options?: {
    interruptTimeout?: number; // Time to wait after Ctrl+C interrupt (default: 500ms)
    claudeExitTimeout?: number; // Time to wait for Claude to exit after /exit (default: 2000ms)
    shellExitTimeout?: number; // Time to wait for shell to exit after exit command (default: 500ms)
    forceKillTimeout?: number; // Time to wait after second Ctrl+C before force kill (default: 1000ms)
  }): Promise<void> {
    const interruptTimeout = options?.interruptTimeout ?? 500;
    const claudeExitTimeout = options?.claudeExitTimeout ?? 2000;
    const shellExitTimeout = options?.shellExitTimeout ?? 500;
    const forceKillTimeout = options?.forceKillTimeout ?? 1000;

    // Clean up all timers first
    this.clearIdleTimer();
    this.clearPendingTimers();

    // If already exited or no process, just clean up and return
    if (this._hasExited || !this.ptyProcess) {
      this.cleanupParserListeners();
      this.cleanupHistoryWatcher();
      this.cleanupTaskFileWatcher();
      this.cleanupMcpResources();
      const tracker = getSubagentTracker();
      tracker.clearSubagents(this.id);
      return;
    }

    // Set status to terminating and emit
    this._status = 'terminating';
    this.emit('status', this._status);

    try {
      // Step 1: Send Ctrl+C to interrupt any running command (like a server)
      // This is needed before /exit because Claude can't process /exit while tool is running
      this.ptyProcess.write('\x03'); // Ctrl+C

      // Brief wait to allow interrupt to process
      const exitedAfterInterrupt = await this.waitForExit(interruptTimeout);
      if (exitedAfterInterrupt) {
        return;
      }

      // Step 2: Send /exit to Claude Code
      if (!this._hasExited && this.ptyProcess) {
        this.ptyProcess.write('/exit\r');

        const exitedAfterClaudeExit = await this.waitForExit(claudeExitTimeout);
        if (exitedAfterClaudeExit) {
          return;
        }
      }

      // Step 3: If still alive, send exit to shell
      if (!this._hasExited && this.ptyProcess) {
        this.ptyProcess.write('exit\r');

        const exitedAfterShellExit = await this.waitForExit(shellExitTimeout);
        if (exitedAfterShellExit) {
          return;
        }
      }

      // Step 4: If still alive, send another Ctrl+C (in case shell has job control prompt)
      if (!this._hasExited && this.ptyProcess) {
        this.ptyProcess.write('\x03'); // Ctrl+C

        const exitedAfterCtrlC = await this.waitForExit(forceKillTimeout);
        if (exitedAfterCtrlC) {
          return;
        }
      }

      // Step 5: Force kill as last resort
      if (!this._hasExited && this.ptyProcess) {
        this.kill();
      }
    } catch (error) {
      console.error(`[ClaudeInstance] Error during graceful kill:`, error);
      // Fall back to force kill on any error
      this.kill();
    }
  }

  /**
   * Wait for process to exit with a timeout
   * @returns true if process exited, false if timeout
   */
  private waitForExit(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      // If already exited, resolve immediately
      if (this._hasExited) {
        resolve(true);
        return;
      }

      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, timeoutMs);

      // Listen for exit event
      const onExit = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(true);
        }
      };

      this.once('exit', onExit);

      // Also check if _hasExited flag was set (in case event already fired)
      const checkInterval = setInterval(() => {
        if (this._hasExited && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          clearInterval(checkInterval);
          this.removeListener('exit', onExit);
          resolve(true);
        }
      }, 100);

      // Clean up interval on timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        this.removeListener('exit', onExit);
      }, timeoutMs + 100);
    });
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
   * Set session ID externally (called from SessionStart hook via API)
   * This starts the HistoryWatcher and TaskFileWatcher if not already started
   */
  setSessionId(sessionId: string): void {
    if (this._sessionId === sessionId) {
      return; // Already set
    }

    this._sessionId = sessionId;
    this.emit('sessionId', sessionId);
    console.log(`[ClaudeInstance] Session ID set externally: ${sessionId}`);

    // Update status to 'running' since session has started
    // This fixes the "Starting Claude..." overlay staying visible when resuming sessions
    if (this._status === 'starting') {
      this._status = 'running';
      this.emit('status', this._status);
      console.log(`[ClaudeInstance] Status changed to running (session started)`);

      // Start idle timer to transition to waiting_input if no activity
      if (this.mode !== 'stream-json') {
        this.resetIdleTimer();
      }
    }

    // Start HistoryWatcher if not already active
    if (this.historyWatcher && !this.historyWatcher.isActive()) {
      this.historyWatcher.setSessionId(sessionId);
      this.historyWatcher.start();
      console.log(`[ClaudeInstance] HistoryWatcher started for session: ${sessionId}`);
    }

    // Start TaskFileWatcher if not already active
    if (this.taskFileWatcher && !this.taskFileWatcher.isActive()) {
      this.taskFileWatcher.setTaskListId(sessionId);
      this.taskFileWatcher.start();
      console.log(`[ClaudeInstance] TaskFileWatcher started for session: ${sessionId}`);
    }
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
      isHidden: this.isHidden,
      ralphTaskId: this.ralphTaskId,
      isTmuxSession: this.isTmuxSession || undefined,
    };
  }
}
