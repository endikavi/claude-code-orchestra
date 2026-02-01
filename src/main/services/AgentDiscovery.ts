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

    // 1. Look for agents in project's .claude/agents/ directory (standard location)
    const projectAgentsDir = path.join(projectPath, '.claude', 'agents');
    if (fs.existsSync(projectAgentsDir)) {
      try {
        const files = fs.readdirSync(projectAgentsDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(projectAgentsDir, file);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              // Use agent name (filename without .md) for --agent parameter
              const agentName = file.replace(/\.md$/, '');
              agents.push({
                name: agentName,
                path: agentName, // Pass name, not full path
                source: 'project',
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[AgentDiscovery] Error reading project agents directory:`, error);
      }
    }

    // 2. Keep AGENT.md in root for backwards compatibility (legacy)
    const agentMdPath = path.join(projectPath, 'AGENT.md');
    if (fs.existsSync(agentMdPath)) {
      agents.push({
        name: 'AGENT.md (legacy)',
        path: agentMdPath, // Full path for legacy AGENT.md
        source: 'project',
      });
    }

    // 3. Look for *.agent.md files in project root (legacy pattern)
    try {
      const files = fs.readdirSync(projectPath);
      for (const file of files) {
        if (file.endsWith('.agent.md') && file !== 'AGENT.md') {
          const filePath = path.join(projectPath, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            agents.push({
              name: `${file} (legacy)`,
              path: filePath, // Full path for legacy files
              source: 'project',
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[AgentDiscovery] Error reading project directory:`, error);
    }

    // 4. Look for agents in ~/.claude/agents/ (global agents)
    const globalAgentsDir = this.getGlobalAgentsDir();
    if (fs.existsSync(globalAgentsDir)) {
      try {
        const files = fs.readdirSync(globalAgentsDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filePath = path.join(globalAgentsDir, file);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
              // Use agent name for global agents too
              const agentName = file.replace(/\.md$/, '');
              agents.push({
                name: agentName,
                path: agentName, // Pass name, not full path
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
