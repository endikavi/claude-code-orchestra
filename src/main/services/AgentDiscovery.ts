import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import type { DiscoveredAgent } from '@shared/types';

/**
 * Service for discovering available agent files (AGENT.md, *.agent.md)
 * in project directories and global ~/.claude/agents/ folder.
 */
export class AgentDiscovery {
  /**
   * Get the global agents directory path (~/.claude/agents/)
   */
  static getGlobalAgentsDir(): string {
    return path.join(homedir(), '.claude', 'agents');
  }

  /**
   * Discover all available agent files for a project
   * @param projectPath The project root directory
   * @returns Array of discovered agents
   */
  static discoverAgents(projectPath: string): DiscoveredAgent[] {
    const agents: DiscoveredAgent[] = [];

    // 1. Check for AGENT.md in project root
    const agentMdPath = path.join(projectPath, 'AGENT.md');
    if (fs.existsSync(agentMdPath)) {
      agents.push({
        name: 'AGENT.md',
        path: agentMdPath,
        source: 'project',
      });
    }

    // 2. Look for *.agent.md files in project root
    try {
      const files = fs.readdirSync(projectPath);
      for (const file of files) {
        if (file.endsWith('.agent.md') && file !== 'AGENT.md') {
          const filePath = path.join(projectPath, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            agents.push({
              name: file,
              path: filePath,
              source: 'project',
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[AgentDiscovery] Error reading project directory:`, error);
    }

    // 3. Look for files in ~/.claude/agents/
    const globalAgentsDir = this.getGlobalAgentsDir();
    if (fs.existsSync(globalAgentsDir)) {
      try {
        const files = fs.readdirSync(globalAgentsDir);
        for (const file of files) {
          // Accept .md files (agent.md, review.agent.md, etc.)
          if (file.endsWith('.md')) {
            const filePath = path.join(globalAgentsDir, file);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              agents.push({
                name: `~/.claude/agents/${file}`,
                path: filePath,
                source: 'global',
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[AgentDiscovery] Error reading global agents directory:`, error);
      }
    }

    return agents;
  }

  /**
   * Check if an agent file exists and is readable
   * @param agentPath Path to the agent file
   * @returns true if the file exists and is readable
   */
  static validateAgentFile(agentPath: string): boolean {
    try {
      fs.accessSync(agentPath, fs.constants.R_OK);
      const stat = fs.statSync(agentPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Read the contents of an agent file
   * @param agentPath Path to the agent file
   * @returns File contents or null if unreadable
   */
  static readAgentFile(agentPath: string): string | null {
    try {
      return fs.readFileSync(agentPath, 'utf-8');
    } catch {
      return null;
    }
  }
}
