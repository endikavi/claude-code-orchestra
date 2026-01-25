/**
 * Utilities for working with Claude Code's internal paths
 * Claude Code stores session history in ~/.claude/projects/<SANITIZED_PATH>/
 */

import * as path from 'path';
import { homedir } from 'os';

/**
 * Get the Claude Code config directory path
 * Claude Code stores its config in ~/.claude on all platforms
 */
export function getClaudeCodeDir(): string {
  return path.join(homedir(), '.claude');
}

/**
 * Get the Claude Code projects directory
 * This is where session histories are stored
 */
export function getClaudeProjectsDir(): string {
  return path.join(getClaudeCodeDir(), 'projects');
}

/**
 * Sanitize a project path to Claude Code's folder name format
 *
 * Examples:
 * - "D:\proyectos\test" -> "D--proyectos-test" (Windows)
 * - "/home/user/my-app" -> "-home-user-my-app" (Linux/macOS)
 *
 * Note: Claude Code also replaces underscores with hyphens
 */
export function sanitizeProjectPath(projectPath: string): string {
  // Normalize path separators to forward slashes
  let normalized = projectPath.replace(/\\/g, '/');

  // Remove trailing slash
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  // On Windows, handle drive letters (C:/projects -> C--projects)
  // Replace : with - so that C:/ becomes C-/ and then C-- after slash replacement
  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized.replace(':', '-');
  }

  // Replace all forward slashes with hyphens
  normalized = normalized.replace(/\//g, '-');

  // Claude Code also replaces underscores with hyphens
  normalized = normalized.replace(/_/g, '-');

  return normalized;
}

/**
 * Get the path to the project's history directory
 */
export function getProjectHistoryDir(projectPath: string): string {
  const sanitized = sanitizeProjectPath(projectPath);
  return path.join(getClaudeProjectsDir(), sanitized);
}

/**
 * Get the path to a session's main history file (.jsonl)
 */
export function getSessionHistoryPath(projectPath: string, sessionId: string): string {
  return path.join(getProjectHistoryDir(projectPath), `${sessionId}.jsonl`);
}

/**
 * Get the path to a session's subagents directory
 */
export function getSessionSubagentsDir(projectPath: string, sessionId: string): string {
  return path.join(getProjectHistoryDir(projectPath), sessionId, 'subagents');
}

/**
 * Get the path to the sessions index file
 */
export function getSessionsIndexPath(projectPath: string): string {
  return path.join(getProjectHistoryDir(projectPath), 'sessions-index.json');
}

/**
 * Check if a path is a local project (vs remote)
 * Local projects have paths starting with / (Unix) or a drive letter (Windows)
 */
export function isLocalProject(projectPath: string): boolean {
  // Check for Windows drive letter
  if (/^[a-zA-Z]:/.test(projectPath)) {
    return true;
  }
  // Check for Unix absolute path
  if (projectPath.startsWith('/')) {
    return true;
  }
  // Remote projects might be prefixed with hostname or other identifiers
  return false;
}

/**
 * Decode a sanitized folder name back to the original project path
 */
export function unsanitizeProjectPath(sanitizedPath: string): string {
  if (process.platform === 'win32') {
    // Windows: "D--projects-my-app" -> "D:\projects\my-app"
    // First character is the drive letter followed by -- if it looks like a Windows path
    if (/^[a-zA-Z]--/.test(sanitizedPath)) {
      const driveLetter = sanitizedPath[0];
      const rest = sanitizedPath.substring(3).replace(/-/g, '\\');
      return `${driveLetter}:\\${rest}`;
    }
  }
  // Unix: "-home-user-my-app" -> "/home/user/my-app"
  return sanitizedPath.replace(/^-/, '/').replace(/-/g, '/');
}
