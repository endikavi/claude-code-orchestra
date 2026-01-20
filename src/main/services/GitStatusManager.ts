import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { BrowserWindow } from 'electron';
import type { GitStatus } from '@shared/types';
import { IPC_CHANNELS } from '../ipc/channels';

const execFileAsync = promisify(execFile);

interface TrackedProject {
  projectId: string;
  directory: string;
  lastStatus: GitStatus | null;
}

// Command execution timeout in ms
const COMMAND_TIMEOUT = 5000;

// Polling interval in ms
const POLL_INTERVAL = 5000;

/**
 * GitStatusManager - Monitors git status for tracked projects
 * Uses polling with parallel command execution for efficiency
 */
export class GitStatusManager {
  private static instance: GitStatusManager;
  private trackedProjects: Map<string, TrackedProject> = new Map();
  private statusCache: Map<string, GitStatus> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;

  private constructor() {}

  static getInstance(): GitStatusManager {
    if (!GitStatusManager.instance) {
      GitStatusManager.instance = new GitStatusManager();
    }
    return GitStatusManager.instance;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Start tracking a project's git status
   */
  track(projectId: string, directory: string): void {
    if (!fs.existsSync(directory)) {
      console.warn(`[GitStatusManager] Directory does not exist: ${directory}`);
      return;
    }

    this.trackedProjects.set(projectId, {
      projectId,
      directory,
      lastStatus: null,
    });

    // Immediately fetch status for the new project
    void this.refreshProject(projectId);
  }

  /**
   * Stop tracking a project
   */
  untrack(projectId: string): void {
    this.trackedProjects.delete(projectId);
    this.statusCache.delete(projectId);
  }

  /**
   * Get cached status for a project
   */
  getStatus(projectId: string): GitStatus | null {
    return this.statusCache.get(projectId) || null;
  }

  /**
   * Force refresh status for a specific project
   */
  async refresh(projectId: string): Promise<GitStatus | null> {
    return this.refreshProject(projectId);
  }

  /**
   * Start the polling loop
   */
  start(): void {
    if (this.pollInterval) {
      return; // Already running
    }

    console.log('[GitStatusManager] Starting polling');
    this.pollInterval = setInterval(() => {
      void this.pollAll();
    }, POLL_INTERVAL);

    // Initial poll
    void this.pollAll();
  }

  /**
   * Stop the polling loop
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[GitStatusManager] Stopped polling');
    }
  }

  /**
   * Poll all tracked projects
   */
  private async pollAll(): Promise<void> {
    if (this.isPolling || this.trackedProjects.size === 0) {
      return;
    }

    this.isPolling = true;

    try {
      // Refresh all projects in parallel
      const promises = Array.from(this.trackedProjects.keys()).map((projectId) =>
        this.refreshProject(projectId)
      );

      await Promise.all(promises);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Refresh status for a single project
   */
  private async refreshProject(projectId: string): Promise<GitStatus | null> {
    const tracked = this.trackedProjects.get(projectId);
    if (!tracked) {
      return null;
    }

    try {
      const status = await this.getGitStatus(tracked.directory);
      const previousStatus = this.statusCache.get(projectId);

      // Update cache
      this.statusCache.set(projectId, status);
      tracked.lastStatus = status;

      // Check if status changed
      if (this.hasStatusChanged(previousStatus, status)) {
        this.emitStatusChange(projectId, status);
      }

      return status;
    } catch (error) {
      console.error(`[GitStatusManager] Error getting status for ${projectId}:`, error);
      return null;
    }
  }

  /**
   * Get git status for a directory
   */
  private async getGitStatus(directory: string): Promise<GitStatus> {
    const gitDir = path.join(directory, '.git');
    const isRepo = fs.existsSync(gitDir);

    const now = Date.now();

    if (!isRepo) {
      return {
        branch: '',
        ahead: 0,
        behind: 0,
        staged: { added: 0, modified: 0, deleted: 0 },
        unstaged: { added: 0, modified: 0, deleted: 0 },
        untracked: 0,
        totalFiles: 0,
        linesAdded: 0,
        linesRemoved: 0,
        lastCommitTime: null,
        lastCommitMessage: null,
        isRepo: false,
        lastChecked: now,
      };
    }

    // Run git commands in parallel
    const [branchInfo, statusOutput, diffStats, logInfo] = await Promise.all([
      this.execGit(directory, ['rev-parse', '--abbrev-ref', 'HEAD']),
      this.execGit(directory, ['status', '--porcelain', '-b']),
      this.execGit(directory, ['diff', '--shortstat']),
      this.execGit(directory, ['log', '-1', '--format=%ct|%s']),
    ]);

    // Parse branch and ahead/behind
    const { branch, ahead, behind } = this.parseBranchInfo(branchInfo, statusOutput);

    // Parse status output
    const { staged, unstaged, untracked } = this.parseStatusOutput(statusOutput);

    // Parse diff stats
    const { linesAdded, linesRemoved } = this.parseDiffStats(diffStats);

    // Parse last commit
    const { lastCommitTime, lastCommitMessage } = this.parseLogInfo(logInfo);

    const totalFiles =
      staged.added +
      staged.modified +
      staged.deleted +
      unstaged.added +
      unstaged.modified +
      unstaged.deleted +
      untracked;

    return {
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      totalFiles,
      linesAdded,
      linesRemoved,
      lastCommitTime,
      lastCommitMessage,
      isRepo: true,
      lastChecked: now,
    };
  }

  /**
   * Execute a git command safely
   */
  private async execGit(cwd: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        timeout: COMMAND_TIMEOUT,
        maxBuffer: 1024 * 1024, // 1MB buffer
        windowsHide: true,
      });
      return stdout.trim();
    } catch {
      // Return empty string on error (e.g., no commits yet, no upstream)
      return '';
    }
  }

  /**
   * Parse branch name and ahead/behind from git output
   */
  private parseBranchInfo(
    branchOutput: string,
    statusOutput: string
  ): { branch: string; ahead: number; behind: number } {
    const branch = branchOutput || 'HEAD';
    let ahead = 0;
    let behind = 0;

    // Parse the first line of status for ahead/behind info
    // Example: ## main...origin/main [ahead 2, behind 1]
    const firstLine = statusOutput.split('\n')[0] || '';
    const aheadMatch = firstLine.match(/ahead (\d+)/);
    const behindMatch = firstLine.match(/behind (\d+)/);

    if (aheadMatch) {
      ahead = parseInt(aheadMatch[1], 10);
    }
    if (behindMatch) {
      behind = parseInt(behindMatch[1], 10);
    }

    return { branch, ahead, behind };
  }

  /**
   * Parse git status --porcelain output
   */
  private parseStatusOutput(output: string): {
    staged: { added: number; modified: number; deleted: number };
    unstaged: { added: number; modified: number; deleted: number };
    untracked: number;
  } {
    const staged = { added: 0, modified: 0, deleted: 0 };
    const unstaged = { added: 0, modified: 0, deleted: 0 };
    let untracked = 0;

    const lines = output.split('\n').slice(1); // Skip first line (branch info)

    for (const line of lines) {
      if (!line || line.length < 2) continue;

      const indexStatus = line[0];
      const workTreeStatus = line[1];

      // Index (staged) status
      if (indexStatus === 'A') staged.added++;
      else if (indexStatus === 'M') staged.modified++;
      else if (indexStatus === 'D') staged.deleted++;
      else if (indexStatus === 'R')
        staged.modified++; // Renamed
      else if (indexStatus === 'C') staged.added++; // Copied

      // Work tree (unstaged) status
      if (workTreeStatus === '?') {
        untracked++;
      } else if (workTreeStatus === 'M') {
        unstaged.modified++;
      } else if (workTreeStatus === 'D') {
        unstaged.deleted++;
      } else if (workTreeStatus === 'A') {
        unstaged.added++;
      }
    }

    return { staged, unstaged, untracked };
  }

  /**
   * Parse git diff --shortstat output
   */
  private parseDiffStats(output: string): { linesAdded: number; linesRemoved: number } {
    let linesAdded = 0;
    let linesRemoved = 0;

    // Example: 3 files changed, 10 insertions(+), 5 deletions(-)
    const insertionsMatch = output.match(/(\d+) insertion/);
    const deletionsMatch = output.match(/(\d+) deletion/);

    if (insertionsMatch) {
      linesAdded = parseInt(insertionsMatch[1], 10);
    }
    if (deletionsMatch) {
      linesRemoved = parseInt(deletionsMatch[1], 10);
    }

    return { linesAdded, linesRemoved };
  }

  /**
   * Parse git log output for last commit
   */
  private parseLogInfo(output: string): {
    lastCommitTime: number | null;
    lastCommitMessage: string | null;
  } {
    if (!output) {
      return { lastCommitTime: null, lastCommitMessage: null };
    }

    const [timestampStr, ...messageParts] = output.split('|');
    const timestamp = parseInt(timestampStr, 10);

    return {
      lastCommitTime: isNaN(timestamp) ? null : timestamp * 1000, // Convert to ms
      lastCommitMessage: messageParts.join('|') || null,
    };
  }

  /**
   * Check if status has changed compared to previous
   */
  private hasStatusChanged(previous: GitStatus | undefined, current: GitStatus): boolean {
    if (!previous) return true;

    return (
      previous.branch !== current.branch ||
      previous.ahead !== current.ahead ||
      previous.behind !== current.behind ||
      previous.totalFiles !== current.totalFiles ||
      previous.linesAdded !== current.linesAdded ||
      previous.linesRemoved !== current.linesRemoved ||
      previous.lastCommitTime !== current.lastCommitTime ||
      previous.isRepo !== current.isRepo
    );
  }

  /**
   * Emit status change event to renderer
   */
  private emitStatusChange(projectId: string, status: GitStatus): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.GIT_STATUS_CHANGED, projectId, status);
    }
  }
}

// Singleton accessor
let gitStatusManagerInstance: GitStatusManager | null = null;

export function getGitStatusManager(): GitStatusManager {
  if (!gitStatusManagerInstance) {
    gitStatusManagerInstance = GitStatusManager.getInstance();
  }
  return gitStatusManagerInstance;
}
