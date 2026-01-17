import { app } from 'electron';
import { join } from 'path';
import { homedir } from 'os';

// Get the user data directory for the app
export function getUserDataPath(): string {
  return app.getPath('userData');
}

// Get the database file path
export function getDatabasePath(): string {
  return join(getUserDataPath(), 'claude-code-orchestra.db');
}

// Get Claude CLI config paths
export function getClaudeConfigPaths(): {
  globalConfig: string;
  globalSettings: string;
} {
  const home = homedir();

  return {
    globalConfig: join(home, '.claude.json'),
    globalSettings: join(home, '.claude', 'settings.json'),
  };
}

// Get project-specific Claude config path
export function getProjectClaudeConfig(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json');
}

// Get the claude.md path for a project
export function getProjectClaudeMd(projectPath: string): string {
  return join(projectPath, 'CLAUDE.md');
}

// Check if a path is absolute
export function isAbsolutePath(path: string): boolean {
  // Windows: starts with drive letter (C:\) or UNC (\\)
  // Unix: starts with /
  return /^(?:[a-zA-Z]:|[\\/]{2}|\/)/i.test(path);
}

// Normalize path separators for the current OS
export function normalizePath(path: string): string {
  return path.replace(/[\\/]+/g, process.platform === 'win32' ? '\\' : '/');
}

// Get Claude Code config directory path
export function getClaudeCodePath(): string {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || '', '.claude');
  }
  return join(homedir(), '.claude');
}

// Get Claude Code projects directory
export function getClaudeCodeProjectsPath(): string {
  return join(getClaudeCodePath(), 'projects');
}
