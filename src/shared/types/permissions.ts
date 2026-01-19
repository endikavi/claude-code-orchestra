// Tool categories for grouping
export type ToolCategory =
  | 'file_read' // Read, Glob, Grep
  | 'file_write' // Write, Edit
  | 'bash' // Bash command execution
  | 'web' // WebFetch, WebSearch
  | 'mcp' // MCP server tools
  | 'task' // Task (subagent)
  | 'notebook' // NotebookEdit
  | 'other'; // Other tools

// Permission decision
export type PermissionDecision = 'allow' | 'deny' | 'ask';

// Permission rule condition
export interface PermissionCondition {
  type: 'tool_name' | 'path_pattern' | 'command_pattern' | 'content_pattern';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'matches'; // matches = regex
  value: string;
  caseSensitive?: boolean;
}

// Permission rule
export interface PermissionRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number; // Higher priority rules are evaluated first

  // Scope
  projectId?: string; // If null, applies globally
  toolCategory?: ToolCategory;
  toolName?: string; // Specific tool name

  // Conditions (all must match)
  conditions: PermissionCondition[];

  // Decision
  decision: PermissionDecision;
  reason?: string; // Shown to user when rule triggers

  // Metadata
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  lastUsedAt?: number;
}

// Permission check request (from hook)
export interface PermissionCheckRequest {
  instanceId: string;
  projectId: string;
  sessionId?: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  timestamp: number;
}

// Permission check response (to hook)
export interface PermissionCheckResponse {
  decision: PermissionDecision;
  reason?: string;
  ruleId?: string; // ID of rule that matched
}

// Permission log entry
export interface PermissionLogEntry {
  id: string;
  instanceId: string;
  projectId: string;
  sessionId?: string;
  toolName: string;
  toolInput: string; // JSON stringified
  decision: PermissionDecision;
  ruleId?: string;
  reason?: string;
  timestamp: number;
}

// Permission configuration for a project
export interface ProjectPermissionConfig {
  projectId: string;
  enabled: boolean;
  defaultDecision: PermissionDecision; // What to do when no rule matches
  rules: PermissionRule[];
}

// Global permission configuration
export interface GlobalPermissionConfig {
  enabled: boolean;
  defaultDecision: PermissionDecision;
  globalRules: PermissionRule[];
  projectConfigs: Record<string, ProjectPermissionConfig>;
}

// Default global permission config
export const DEFAULT_GLOBAL_PERMISSION_CONFIG: GlobalPermissionConfig = {
  enabled: false,
  defaultDecision: 'ask',
  globalRules: [],
  projectConfigs: {},
};

// Preset permission rule templates
export interface PermissionRulePreset {
  id: string;
  name: string;
  description: string;
  rules: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>[];
}

// Built-in permission rule presets
export const PERMISSION_RULE_PRESETS: PermissionRulePreset[] = [
  {
    id: 'allow-read-src',
    name: 'Allow reading source files',
    description: 'Auto-approve Read tool for files in src/ directory',
    rules: [
      {
        name: 'Allow Read in src/',
        enabled: true,
        priority: 100,
        toolName: 'Read',
        conditions: [
          {
            type: 'path_pattern',
            operator: 'contains',
            value: '/src/',
          },
        ],
        decision: 'allow',
        reason: 'Auto-approved: Reading source files',
      },
    ],
  },
  {
    id: 'deny-dangerous-bash',
    name: 'Block dangerous bash commands',
    description: 'Deny dangerous commands like rm -rf, format, etc.',
    rules: [
      {
        name: 'Block rm -rf',
        enabled: true,
        priority: 1000,
        toolName: 'Bash',
        conditions: [
          {
            type: 'command_pattern',
            operator: 'matches',
            value: 'rm\\s+(-[rf]+\\s+)*/',
          },
        ],
        decision: 'deny',
        reason: 'Blocked: Dangerous recursive delete command',
      },
      {
        name: 'Block format commands',
        enabled: true,
        priority: 1000,
        toolName: 'Bash',
        conditions: [
          {
            type: 'command_pattern',
            operator: 'contains',
            value: 'mkfs',
          },
        ],
        decision: 'deny',
        reason: 'Blocked: Disk format command',
      },
    ],
  },
  {
    id: 'allow-test-commands',
    name: 'Allow test commands',
    description: 'Auto-approve common test commands (npm test, pytest, etc.)',
    rules: [
      {
        name: 'Allow npm test',
        enabled: true,
        priority: 50,
        toolName: 'Bash',
        conditions: [
          {
            type: 'command_pattern',
            operator: 'matches',
            value: '^npm\\s+(run\\s+)?test',
          },
        ],
        decision: 'allow',
        reason: 'Auto-approved: Running tests',
      },
      {
        name: 'Allow pytest',
        enabled: true,
        priority: 50,
        toolName: 'Bash',
        conditions: [
          {
            type: 'command_pattern',
            operator: 'startsWith',
            value: 'pytest',
          },
        ],
        decision: 'allow',
        reason: 'Auto-approved: Running tests',
      },
    ],
  },
];

// Permission stats
export interface PermissionStats {
  totalChecks: number;
  allowed: number;
  denied: number;
  asked: number;
  byTool: Record<string, { allowed: number; denied: number; asked: number }>;
  byProject: Record<string, { allowed: number; denied: number; asked: number }>;
}

// Permission query options
export interface PermissionLogQueryOptions {
  projectId?: string;
  instanceId?: string;
  toolName?: string;
  decision?: PermissionDecision;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}
