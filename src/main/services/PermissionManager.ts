import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  PermissionRule,
  PermissionCheckRequest,
  PermissionCheckResponse,
  PermissionLogEntry,
  PermissionDecision,
  GlobalPermissionConfig,
  ProjectPermissionConfig,
  PermissionCondition,
  PermissionStats,
  PermissionLogQueryOptions,
} from '@shared/types';
import { DEFAULT_GLOBAL_PERMISSION_CONFIG } from '@shared/types';

// Max permission log entries to keep in memory
const MAX_LOG_ENTRIES = 1000;

export class PermissionManager extends EventEmitter {
  private static instance: PermissionManager | null = null;
  private config: GlobalPermissionConfig;
  private permissionLog: PermissionLogEntry[] = [];

  private constructor() {
    super();
    this.config = { ...DEFAULT_GLOBAL_PERMISSION_CONFIG };
  }

  public static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Get the current permission configuration
   */
  public getConfig(): GlobalPermissionConfig {
    return { ...this.config };
  }

  /**
   * Set the global permission configuration
   */
  public setConfig(config: Partial<GlobalPermissionConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:changed', this.config);
  }

  /**
   * Enable or disable permission checking globally
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.emit('config:changed', this.config);
  }

  /**
   * Set the default decision when no rules match
   */
  public setDefaultDecision(decision: PermissionDecision): void {
    this.config.defaultDecision = decision;
    this.emit('config:changed', this.config);
  }

  /**
   * Add a global permission rule
   */
  public addGlobalRule(
    rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): PermissionRule {
    const newRule: PermissionRule = {
      ...rule,
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
    };

    this.config.globalRules.push(newRule);
    this.emit('rule:added', newRule);
    return newRule;
  }

  /**
   * Update a global permission rule
   */
  public updateGlobalRule(id: string, updates: Partial<PermissionRule>): PermissionRule | null {
    const index = this.config.globalRules.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const updatedRule: PermissionRule = {
      ...this.config.globalRules[index],
      ...updates,
      id, // Preserve ID
      updatedAt: Date.now(),
    };

    this.config.globalRules[index] = updatedRule;
    this.emit('rule:updated', updatedRule);
    return updatedRule;
  }

  /**
   * Remove a global permission rule
   */
  public removeGlobalRule(id: string): boolean {
    const index = this.config.globalRules.findIndex((r) => r.id === id);
    if (index === -1) return false;

    this.config.globalRules.splice(index, 1);
    this.emit('rule:removed', id);
    return true;
  }

  /**
   * Get or create project-specific permission config
   */
  public getProjectConfig(projectId: string): ProjectPermissionConfig {
    if (!this.config.projectConfigs[projectId]) {
      this.config.projectConfigs[projectId] = {
        projectId,
        enabled: true,
        defaultDecision: 'ask',
        rules: [],
      };
    }
    return { ...this.config.projectConfigs[projectId] };
  }

  /**
   * Set project-specific permission config
   */
  public setProjectConfig(projectId: string, config: Partial<ProjectPermissionConfig>): void {
    this.config.projectConfigs[projectId] = {
      ...this.getProjectConfig(projectId),
      ...config,
      projectId,
    };
    this.emit('projectConfig:changed', projectId, this.config.projectConfigs[projectId]);
  }

  /**
   * Add a permission rule to a project
   */
  public addProjectRule(
    projectId: string,
    rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'projectId'>
  ): PermissionRule {
    const projectConfig = this.getProjectConfig(projectId);

    const newRule: PermissionRule = {
      ...rule,
      id: randomUUID(),
      projectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0,
    };

    projectConfig.rules.push(newRule);
    this.config.projectConfigs[projectId] = projectConfig;
    this.emit('rule:added', newRule);
    return newRule;
  }

  /**
   * Check if a condition matches the tool use
   */
  private matchesCondition(
    condition: PermissionCondition,
    toolName: string,
    toolInput: Record<string, unknown>
  ): boolean {
    // Helper to safely extract string value from unknown
    const getString = (val: unknown): string => {
      if (typeof val === 'string') return val;
      if (val === null || val === undefined) return '';
      return '';
    };

    let value = '';

    switch (condition.type) {
      case 'tool_name':
        value = toolName;
        break;
      case 'path_pattern':
        // Check common path fields
        value =
          getString(toolInput.file_path) ||
          getString(toolInput.path) ||
          getString(toolInput.directory);
        break;
      case 'command_pattern':
        value = getString(toolInput.command);
        break;
      case 'content_pattern':
        // Check content/input fields
        value =
          getString(toolInput.content) ||
          getString(toolInput.input) ||
          getString(toolInput.new_string);
        break;
    }

    if (!condition.caseSensitive) {
      value = value.toLowerCase();
      condition.value = condition.value.toLowerCase();
    }

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return value.includes(condition.value);
      case 'startsWith':
        return value.startsWith(condition.value);
      case 'endsWith':
        return value.endsWith(condition.value);
      case 'matches':
        try {
          const regex = new RegExp(condition.value, condition.caseSensitive ? '' : 'i');
          return regex.test(value);
        } catch {
          return false;
        }
    }

    return false;
  }

  /**
   * Check if a rule matches the tool use
   */
  private ruleMatches(
    rule: PermissionRule,
    toolName: string,
    toolInput: Record<string, unknown>
  ): boolean {
    if (!rule.enabled) return false;

    // Check tool name if specified
    if (rule.toolName && rule.toolName !== toolName) return false;

    // Check all conditions (AND logic)
    for (const condition of rule.conditions) {
      if (!this.matchesCondition(condition, toolName, toolInput)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check permission for a tool use
   */
  public checkPermission(request: PermissionCheckRequest): PermissionCheckResponse {
    const { instanceId, projectId, toolName, toolInput, timestamp } = request;

    // If permission checking is disabled globally, return 'ask'
    if (!this.config.enabled) {
      return { decision: 'ask', reason: 'Permission checking disabled' };
    }

    // Collect all applicable rules (project-specific first, then global)
    const projectConfig = this.config.projectConfigs[projectId];
    const allRules: PermissionRule[] = [];

    if (projectConfig?.enabled) {
      allRules.push(...projectConfig.rules);
    }
    allRules.push(...this.config.globalRules);

    // Sort by priority (higher first)
    allRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Find first matching rule
    for (const rule of allRules) {
      if (this.ruleMatches(rule, toolName, toolInput)) {
        // Update rule usage stats
        rule.usageCount++;
        rule.lastUsedAt = Date.now();

        // Log the decision
        this.logPermission({
          instanceId,
          projectId,
          toolName,
          toolInput: JSON.stringify(toolInput),
          decision: rule.decision,
          ruleId: rule.id,
          reason: rule.reason,
          timestamp,
        });

        return {
          decision: rule.decision,
          reason: rule.reason || `Rule: ${rule.name}`,
          ruleId: rule.id,
        };
      }
    }

    // No rule matched, use default decision
    const defaultDecision =
      projectConfig?.enabled && projectConfig.defaultDecision
        ? projectConfig.defaultDecision
        : this.config.defaultDecision;

    this.logPermission({
      instanceId,
      projectId,
      toolName,
      toolInput: JSON.stringify(toolInput),
      decision: defaultDecision,
      reason: 'No matching rule',
      timestamp,
    });

    return {
      decision: defaultDecision,
      reason: 'No matching rule - using default',
    };
  }

  /**
   * Log a permission check
   */
  private logPermission(entry: Omit<PermissionLogEntry, 'id'>): void {
    const logEntry: PermissionLogEntry = {
      ...entry,
      id: randomUUID(),
    };

    this.permissionLog.unshift(logEntry);

    // Trim log if too large
    if (this.permissionLog.length > MAX_LOG_ENTRIES) {
      this.permissionLog = this.permissionLog.slice(0, MAX_LOG_ENTRIES);
    }

    this.emit('permission:logged', logEntry);
  }

  /**
   * Get permission log entries
   */
  public getLog(options: PermissionLogQueryOptions = {}): PermissionLogEntry[] {
    let results = [...this.permissionLog];

    if (options.projectId) {
      results = results.filter((e) => e.projectId === options.projectId);
    }

    if (options.instanceId) {
      results = results.filter((e) => e.instanceId === options.instanceId);
    }

    if (options.toolName) {
      results = results.filter((e) => e.toolName === options.toolName);
    }

    if (options.decision) {
      results = results.filter((e) => e.decision === options.decision);
    }

    if (options.startDate) {
      results = results.filter((e) => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter((e) => e.timestamp <= options.endDate!);
    }

    if (options.offset) {
      results = results.slice(options.offset);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get permission statistics
   */
  public getStats(): PermissionStats {
    const stats: PermissionStats = {
      totalChecks: this.permissionLog.length,
      allowed: 0,
      denied: 0,
      asked: 0,
      byTool: {},
      byProject: {},
    };

    for (const entry of this.permissionLog) {
      // Count by decision
      if (entry.decision === 'allow') stats.allowed++;
      else if (entry.decision === 'deny') stats.denied++;
      else stats.asked++;

      // Count by tool
      if (!stats.byTool[entry.toolName]) {
        stats.byTool[entry.toolName] = { allowed: 0, denied: 0, asked: 0 };
      }
      stats.byTool[entry.toolName][
        entry.decision === 'allow' ? 'allowed' : entry.decision === 'deny' ? 'denied' : 'asked'
      ]++;

      // Count by project
      if (!stats.byProject[entry.projectId]) {
        stats.byProject[entry.projectId] = { allowed: 0, denied: 0, asked: 0 };
      }
      stats.byProject[entry.projectId][
        entry.decision === 'allow' ? 'allowed' : entry.decision === 'deny' ? 'denied' : 'asked'
      ]++;
    }

    return stats;
  }

  /**
   * Clear permission log
   */
  public clearLog(): void {
    this.permissionLog = [];
    this.emit('log:cleared');
  }

  /**
   * Export configuration for persistence
   */
  public exportConfig(): GlobalPermissionConfig {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Import configuration from persistence
   */
  public importConfig(config: GlobalPermissionConfig): void {
    this.config = { ...DEFAULT_GLOBAL_PERMISSION_CONFIG, ...config };
    this.emit('config:imported', this.config);
  }

  /**
   * Destroy the permission manager
   */
  public destroy(): void {
    this.permissionLog = [];
    PermissionManager.instance = null;
  }
}

// Export singleton getter
export function getPermissionManager(): PermissionManager {
  return PermissionManager.getInstance();
}
