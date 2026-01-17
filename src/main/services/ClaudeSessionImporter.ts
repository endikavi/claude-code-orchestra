import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { homedir } from 'os';
import { DataStore } from './DataStore';
import type { ClaudeModel, InstanceMode } from '@shared/types';

// Types for Claude Code session files
export interface ClaudeCodeMessage {
  type: 'user' | 'assistant' | 'system' | 'result';
  message?: {
    role?: string;
    content?: string | unknown[];
  };
  timestamp?: string;
  session_id?: string;
  cwd?: string;
}

export interface ClaudeSessionInfo {
  sessionId: string;
  projectPath: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  firstUserMessage?: string;
  isImported: boolean;
}

export class ClaudeSessionImporter {
  private static instance: ClaudeSessionImporter | null = null;

  public static getInstance(): ClaudeSessionImporter {
    if (!ClaudeSessionImporter.instance) {
      ClaudeSessionImporter.instance = new ClaudeSessionImporter();
    }
    return ClaudeSessionImporter.instance;
  }

  /**
   * Get the Claude Code config directory path based on the OS
   * Claude Code stores its config in ~/.claude (user home directory) on all platforms
   */
  getClaudeConfigPath(): string {
    return path.join(homedir(), '.claude');
  }

  /**
   * Get the projects directory within Claude Code config
   */
  getProjectsPath(): string {
    return path.join(this.getClaudeConfigPath(), 'projects');
  }

  /**
   * Encode a project path to the folder name format used by Claude Code
   * e.g., "D:\projects\my-app" -> "D--projects-my-app" (Windows)
   * e.g., "/home/user/my-app" -> "-home-user-my-app" (Linux/macOS)
   * Note: Claude Code also replaces underscores with hyphens
   */
  encodeProjectPath(projectPath: string): string {
    // Normalize path separators
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
   * Decode a folder name back to the original project path
   */
  decodeProjectPath(encodedPath: string): string {
    if (process.platform === 'win32') {
      // Windows: "D--projects-my-app" -> "D:\projects\my-app"
      // First character is the drive letter followed by -- if it looks like a Windows path
      if (/^[a-zA-Z]--/.test(encodedPath)) {
        const driveLetter = encodedPath[0];
        const rest = encodedPath.substring(3).replace(/-/g, '\\');
        return `${driveLetter}:\\${rest}`;
      }
    }
    // Unix: "-home-user-my-app" -> "/home/user/my-app"
    return encodedPath.replace(/^-/, '/').replace(/-/g, '/');
  }

  /**
   * List all available sessions for a given project path
   */
  async getSessionsForProject(projectPath: string): Promise<ClaudeSessionInfo[]> {
    const encodedPath = this.encodeProjectPath(projectPath);
    const projectDir = path.join(this.getProjectsPath(), encodedPath);

    if (!fs.existsSync(projectDir)) {
      return [];
    }

    const files = fs.readdirSync(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    // Get list of already imported session IDs
    const dataStore = DataStore.getInstance();
    const importedSessions = new Set<string>();

    // First, find the project by path to get its ID
    const project = dataStore.getProjectByPath(projectPath);
    if (project) {
      const conversations = dataStore.getConversationsByProject(project.id);
      conversations.forEach((conv) => {
        if (conv.sessionId) {
          importedSessions.add(conv.sessionId);
        }
      });
    }

    const sessions: ClaudeSessionInfo[] = [];

    for (const file of jsonlFiles) {
      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(projectDir, file);

      try {
        const stats = fs.statSync(filePath);
        const messages = await this.parseJsonlFile(filePath);

        // Find first user message for preview
        const firstUserMsg = messages.find((m) => m.type === 'user');
        let firstUserMessage: string | undefined;

        if (firstUserMsg?.message?.content) {
          if (typeof firstUserMsg.message.content === 'string') {
            firstUserMessage = firstUserMsg.message.content;
          } else if (Array.isArray(firstUserMsg.message.content)) {
            const textBlock = firstUserMsg.message.content.find(
              (b: unknown) =>
                typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text'
            ) as { text?: string } | undefined;
            firstUserMessage = textBlock?.text;
          }
        }

        sessions.push({
          sessionId,
          projectPath,
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
          messageCount: messages.length,
          firstUserMessage: firstUserMessage?.substring(0, 200),
          isImported: importedSessions.has(sessionId),
        });
      } catch (error) {
        console.error(`Failed to parse session file ${file}:`, error);
      }
    }

    // Sort by updatedAt descending
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return sessions;
  }

  /**
   * Get count of available sessions that haven't been imported
   */
  async getAvailableSessionsCount(projectPath: string): Promise<number> {
    const sessions = await this.getSessionsForProject(projectPath);
    return sessions.filter((s) => !s.isImported).length;
  }

  /**
   * Import a session from Claude Code into the dashboard database
   */
  async importSession(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<{ success: boolean; conversationId?: string; error?: string }> {
    const encodedPath = this.encodeProjectPath(projectPath);
    const filePath = path.join(this.getProjectsPath(), encodedPath, `${sessionId}.jsonl`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Session file not found' };
    }

    try {
      const messages = await this.parseJsonlFile(filePath);

      if (messages.length === 0) {
        return { success: false, error: 'Session file is empty' };
      }

      // Find the first user message for the title
      const firstUserMsg = messages.find((m) => m.type === 'user');
      let title = 'Imported session';
      let initialPrompt = '';

      if (firstUserMsg?.message?.content) {
        if (typeof firstUserMsg.message.content === 'string') {
          initialPrompt = firstUserMsg.message.content;
        } else if (Array.isArray(firstUserMsg.message.content)) {
          const textBlock = firstUserMsg.message.content.find(
            (b: unknown) =>
              typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text'
          ) as { text?: string } | undefined;
          initialPrompt = textBlock?.text || '';
        }

        // Create title from first 50 chars
        title = initialPrompt.substring(0, 50);
        if (initialPrompt.length > 50) {
          title += '...';
        }
      }

      // Create the conversation in the database
      const dataStore = DataStore.getInstance();
      const conversation = dataStore.createConversation({
        projectId,
        title,
        initialPrompt,
        model: 'sonnet' as ClaudeModel, // Default, we can't determine the original model
        mode: 'stream-json' as InstanceMode,
      });

      // Update with session ID and calculate stats
      const totalCost = 0;

      // Import all messages
      for (const msg of messages) {
        const content = JSON.stringify(msg);
        dataStore.addMessage({
          conversationId: conversation.id,
          type: msg.type,
          content,
        });
      }

      // Update conversation with final stats
      dataStore.updateConversation(conversation.id, {
        sessionId,
        status: 'completed',
        totalCostUsd: totalCost,
        messageCount: messages.length,
      });

      return { success: true, conversationId: conversation.id };
    } catch (error) {
      console.error('Failed to import session:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Import multiple sessions at once
   */
  async importSessions(
    sessionIds: string[],
    projectId: string,
    projectPath: string
  ): Promise<{ imported: number; failed: number; errors: string[] }> {
    const results = {
      imported: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const sessionId of sessionIds) {
      const result = await this.importSession(sessionId, projectId, projectPath);
      if (result.success) {
        results.imported++;
      } else {
        results.failed++;
        if (result.error) {
          results.errors.push(`${sessionId}: ${result.error}`);
        }
      }
    }

    return results;
  }

  /**
   * Parse a JSONL file and return the messages
   */
  private async parseJsonlFile(filePath: string): Promise<ClaudeCodeMessage[]> {
    return new Promise((resolve, reject) => {
      const messages: ClaudeCodeMessage[] = [];

      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line) as ClaudeCodeMessage;
            messages.push(parsed);
          } catch (error) {
            // Skip malformed lines
            console.warn('Skipping malformed line in JSONL:', error);
          }
        }
      });

      rl.on('close', () => {
        resolve(messages);
      });

      rl.on('error', (error: Error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /**
   * Check if Claude Code config directory exists
   */
  hasClaudeCodeInstalled(): boolean {
    return fs.existsSync(this.getClaudeConfigPath());
  }
}
