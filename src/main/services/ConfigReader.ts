import { readFileSync, existsSync } from 'fs';
import { getClaudeConfigPaths, getProjectClaudeConfig, getProjectClaudeMd } from '../utils/paths';
import type { ClaudeSettings, McpServer, McpServerConfig } from '@shared/types';
import { configLogger } from '@shared/utils/logger';

export class ConfigReader {
  /**
   * Read global Claude settings
   */
  static getGlobalSettings(): ClaudeSettings | null {
    const paths = getClaudeConfigPaths();

    // Try global config first
    if (existsSync(paths.globalConfig)) {
      try {
        const content = readFileSync(paths.globalConfig, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
      } catch (error) {
        configLogger.warn('Failed to parse global config', { path: paths.globalConfig, error });
      }
    }

    // Try settings.json
    if (existsSync(paths.globalSettings)) {
      try {
        const content = readFileSync(paths.globalSettings, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
      } catch (error) {
        configLogger.warn('Failed to parse global settings', { path: paths.globalSettings, error });
      }
    }

    return null;
  }

  /**
   * Read project-specific Claude settings
   */
  static getProjectSettings(projectPath: string): ClaudeSettings | null {
    const configPath = getProjectClaudeConfig(projectPath);

    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as ClaudeSettings;
      } catch (error) {
        configLogger.warn('Failed to parse project config', { path: configPath, error });
      }
    }

    return null;
  }

  /**
   * Get merged settings (global + project)
   */
  static getMergedSettings(projectPath: string): ClaudeSettings {
    const globalSettings = this.getGlobalSettings() || {};
    const projectSettings = this.getProjectSettings(projectPath) || {};

    return {
      ...globalSettings,
      ...projectSettings,
      mcpServers: {
        ...globalSettings.mcpServers,
        ...projectSettings.mcpServers,
      },
    };
  }

  /**
   * Get MCP servers from settings
   */
  static getMcpServers(projectPath?: string): McpServer[] {
    const settings = projectPath ? this.getMergedSettings(projectPath) : this.getGlobalSettings();

    if (!settings?.mcpServers) {
      return [];
    }

    return Object.entries(settings.mcpServers).map(([name, config]: [string, McpServerConfig]) => ({
      name,
      status: 'disconnected' as const,
      tools: [],
      command: config.command,
      args: config.args,
    }));
  }

  /**
   * Read CLAUDE.md content
   */
  static getClaudeMd(projectPath: string): string | null {
    const mdPath = getProjectClaudeMd(projectPath);

    if (existsSync(mdPath)) {
      try {
        return readFileSync(mdPath, 'utf-8');
      } catch (error) {
        configLogger.warn('Failed to read CLAUDE.md', { path: mdPath, error });
      }
    }

    return null;
  }

  /**
   * Get available tools from settings
   */
  static getTools(projectPath?: string): string[] {
    const settings = projectPath ? this.getMergedSettings(projectPath) : this.getGlobalSettings();

    if (!settings?.tools) {
      return [];
    }

    return settings.tools.filter((t) => t.enabled).map((t) => t.name);
  }

  /**
   * Get hooks from settings
   */
  static getHooks(projectPath?: string): { event: string; command: string }[] {
    const settings = projectPath ? this.getMergedSettings(projectPath) : this.getGlobalSettings();

    return settings?.hooks || [];
  }
}
