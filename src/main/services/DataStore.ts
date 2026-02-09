import Database from 'better-sqlite3';
import { getDatabasePath } from '../utils/paths';
import type {
  Project,
  Conversation,
  ConversationMessage,
  ConversationStatus,
  ClaudeModel,
  InstanceMode,
  SecurityConfig,
  IpAccessRule,
  AuditLogEntry,
  AuditEventType,
  AuditLogQueryOptions,
  ProxyConfig,
  AllowedPort,
} from '@shared/types';
import { DEFAULT_SECURITY_CONFIG, DEFAULT_PROXY_CONFIG } from '@shared/types';
import type { TerminalPoolConfig } from '@shared/types/pool';
import type {
  RalphTask,
  RalphTaskStatus,
  CreateRalphTaskInput,
  UpdateRalphTaskInput,
} from '@shared/types/ralphTasks';
import type { InstancePreset, CreatePresetInput, UpdatePresetInput } from '@shared/types/presets';
import type { JiraGlobalConfig, JiraProjectConfig } from '@shared/types/jira';
import { DEFAULT_JIRA_GLOBAL_CONFIG } from '@shared/types/jira';
import { DEFAULT_TERMINAL_POOL_CONFIG } from '@shared/types/pool';
import type { RemoteConfig } from '@shared/types/remote';
import { DEFAULT_REMOTE_CONFIG } from '@shared/types/remote';
import type { SslConfig } from '@shared/types/ssl';
import { DEFAULT_SSL_CONFIG } from '@shared/types/ssl';
import type {
  ClusterConfig,
  ClusterNodeRole,
  ClusterNodePrivacy,
  InstanceClusterPermissions,
} from '@shared/types/cluster';
import {
  DEFAULT_CLUSTER_CONFIG,
  DEFAULT_NODE_PRIVACY,
  DEFAULT_INSTANCE_CLUSTER_PERMISSIONS,
} from '@shared/types/cluster';
import { randomUUID, randomBytes } from 'crypto';
import { hostname } from 'os';

export class DataStore {
  private db: Database.Database;
  private static instance: DataStore | null = null;

  private constructor() {
    this.db = new Database(getDatabasePath());
    this.init();
  }

  public static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  private init(): void {
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('temp_store = MEMORY');

    // Create projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        description TEXT,
        color TEXT,
        skipPermissions INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    // Migration: Add skipPermissions column if it doesn't exist
    this.migrateAddSkipPermissions();

    // Migration: Add hostname column if it doesn't exist
    this.migrateAddHostname();

    // Migration: Add preferredShell column if it doesn't exist
    this.migrateAddPreferredShell();

    // Migration: Add clusterPermissions column if it doesn't exist
    this.migrateAddProjectClusterPermissions();

    // Migration: Add enableMcp column if it doesn't exist
    this.migrateAddEnableMcp();

    // Migration: Add additionalDirs column if it doesn't exist
    this.migrateAddAdditionalDirs();

    // Migration: Add agentDeliveryMethod column if it doesn't exist
    this.migrateAddAgentDeliveryMethod();

    // Migration: Add agents column if it doesn't exist
    this.migrateAddAgents();

    // Migration: Add autoReview column if it doesn't exist
    this.migrateAddAutoReview();

    // Migration: Add vectorSearchConfig column if it doesn't exist
    this.migrateAddVectorSearchConfig();

    // Create index on path for faster lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path)
    `);

    // Create conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        sessionId TEXT,
        title TEXT NOT NULL,
        initialPrompt TEXT NOT NULL,
        model TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        totalCostUsd REAL DEFAULT 0,
        messageCount INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Create conversation_messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        costUsd REAL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for conversations
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_projectId ON conversations(projectId)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_updatedAt ON conversations(updatedAt)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversationId ON conversation_messages(conversationId)
    `);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Create remote_config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS remote_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 0,
        port INTEGER DEFAULT 3847,
        passwordHash TEXT DEFAULT '',
        autoStart INTEGER DEFAULT 0,
        allowAnyCors INTEGER DEFAULT 0
      )
    `);

    // Insert default config if not exists
    const existing = this.db.prepare('SELECT * FROM remote_config WHERE id = 1').get();
    if (!existing) {
      this.db.exec(`
        INSERT INTO remote_config (id, enabled, port, passwordHash, autoStart, allowAnyCors)
        VALUES (1, 0, 3847, '', 0, 0)
      `);
    }

    // Migration: Add allowAnyCors column if it doesn't exist
    const columns = this.db.prepare('PRAGMA table_info(remote_config)').all() as { name: string }[];
    if (!columns.some((col) => col.name === 'allowAnyCors')) {
      this.db.exec('ALTER TABLE remote_config ADD COLUMN allowAnyCors INTEGER DEFAULT 0');
    }

    // Migration: Add customHostname column if it doesn't exist
    if (!columns.some((col) => col.name === 'customHostname')) {
      this.db.exec("ALTER TABLE remote_config ADD COLUMN customHostname TEXT DEFAULT ''");
    }

    // Migration: Add ssl column if it doesn't exist
    if (!columns.some((col) => col.name === 'ssl')) {
      this.db.exec(
        `ALTER TABLE remote_config ADD COLUMN ssl TEXT DEFAULT '${JSON.stringify({ enabled: false, selfSigned: false })}'`
      );
    }

    // Migration: Add webAccessEnabled column if it doesn't exist
    if (!columns.some((col) => col.name === 'webAccessEnabled')) {
      this.db.exec('ALTER TABLE remote_config ADD COLUMN webAccessEnabled INTEGER DEFAULT 0');
      // Migrate existing 'enabled' value to webAccessEnabled
      this.db.exec('UPDATE remote_config SET webAccessEnabled = enabled WHERE enabled = 1');
    }

    // Create cluster_config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cluster_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 0,
        role TEXT DEFAULT 'standalone',
        nodeId TEXT NOT NULL,
        nodeName TEXT DEFAULT 'My Computer',
        primaryHost TEXT,
        primaryPort INTEGER DEFAULT 3847,
        sharedSecret TEXT DEFAULT ''
      )
    `);

    // Migration: Add privacy column to cluster_config if it doesn't exist
    // IMPORTANT: This must run BEFORE the INSERT below to handle existing databases
    this.migrateAddClusterPrivacy();

    // Migration: Add ssl column to cluster_config if it doesn't exist
    this.migrateAddClusterSsl();

    // Insert default cluster config if not exists
    const existingCluster = this.db.prepare('SELECT * FROM cluster_config WHERE id = 1').get();
    if (!existingCluster) {
      const generatedNodeId = randomUUID();
      this.db
        .prepare(
          `INSERT INTO cluster_config (id, enabled, role, nodeId, nodeName, primaryHost, primaryPort, sharedSecret, privacy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          1,
          0,
          'standalone',
          generatedNodeId,
          'My Computer',
          '',
          3847,
          '',
          JSON.stringify(DEFAULT_NODE_PRIVACY)
        );
    }

    // Create instance_cluster_permissions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instance_cluster_permissions (
        instanceId TEXT PRIMARY KEY,
        shareWithCluster INTEGER DEFAULT 1,
        allowRemoteInput INTEGER DEFAULT 1,
        createdAt INTEGER NOT NULL
      )
    `);

    // Create app_settings table for persistent settings like JWT secret
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Create security_config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS security_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        config TEXT NOT NULL DEFAULT '{}'
      )
    `);

    // Insert default security config if not exists
    const existingSecurity = this.db.prepare('SELECT * FROM security_config WHERE id = 1').get();
    if (!existingSecurity) {
      this.db
        .prepare(`INSERT INTO security_config (id, config) VALUES (?, ?)`)
        .run(1, JSON.stringify(DEFAULT_SECURITY_CONFIG));
    }

    // Create ip_access_rules table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ip_access_rules (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('allow', 'deny')),
        value TEXT NOT NULL,
        description TEXT,
        createdAt INTEGER NOT NULL
      )
    `);

    // Create audit_log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        event TEXT NOT NULL,
        ip TEXT NOT NULL,
        sessionId TEXT,
        details TEXT,
        success INTEGER NOT NULL
      )
    `);

    // Create index for audit_log queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event)
    `);

    // Create ip_lockouts table for rate limiting lockouts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ip_lockouts (
        ip TEXT PRIMARY KEY,
        lockedAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL,
        attempts INTEGER NOT NULL
      )
    `);

    // Create proxy_config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proxy_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 0,
        maxConcurrentTunnels INTEGER DEFAULT 5,
        rateLimitPerMinute INTEGER DEFAULT 100
      )
    `);

    // Insert default proxy config if not exists
    const existingProxy = this.db.prepare('SELECT * FROM proxy_config WHERE id = 1').get();
    if (!existingProxy) {
      this.db
        .prepare(
          `INSERT INTO proxy_config (id, enabled, maxConcurrentTunnels, rateLimitPerMinute)
           VALUES (?, ?, ?, ?)`
        )
        .run(1, 0, 5, 100);
    }

    // Create proxy_allowed_ports table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proxy_allowed_ports (
        id TEXT PRIMARY KEY,
        port INTEGER UNIQUE NOT NULL,
        description TEXT,
        createdAt INTEGER NOT NULL
      )
    `);

    // Create terminal_pool_config table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS terminal_pool_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 1,
        minPoolSize INTEGER DEFAULT 2,
        maxPoolSize INTEGER DEFAULT 5,
        idleTimeoutMs INTEGER DEFAULT 300000,
        replenishDelayMs INTEGER DEFAULT 1000
      )
    `);

    // Create ralph_tasks table for Trello-style task board with Ralph Loop
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ralph_tasks (
        id TEXT PRIMARY KEY,
        projectId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        orderIndex REAL NOT NULL,
        instanceId TEXT,
        loopCount INTEGER DEFAULT 0,
        isPaused INTEGER DEFAULT 0,
        pauseReason TEXT,
        completionSummary TEXT,
        contextFilePath TEXT,
        isInteractive INTEGER DEFAULT 1,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        startedAt INTEGER,
        completedAt INTEGER,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Migration: add isInteractive column if it doesn't exist
    try {
      this.db.exec('ALTER TABLE ralph_tasks ADD COLUMN isInteractive INTEGER DEFAULT 1');
    } catch {
      // Column already exists, ignore
    }

    // Create indexes for ralph_tasks
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ralph_tasks_projectId ON ralph_tasks(projectId)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ralph_tasks_status ON ralph_tasks(status)
    `);

    // Create instance_presets table for saving Claude instance configurations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instance_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        model TEXT NOT NULL DEFAULT 'sonnet',
        planMode INTEGER DEFAULT 0,
        verbose INTEGER DEFAULT 0,
        agentFile TEXT,
        agents TEXT,
        additionalDirs TEXT,
        initialPrompt TEXT,
        category TEXT,
        tags TEXT,
        isGlobal INTEGER DEFAULT 0,
        projectId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for instance_presets
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_instance_presets_projectId ON instance_presets(projectId)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_instance_presets_isGlobal ON instance_presets(isGlobal)
    `);

    // Insert default terminal pool config if not exists
    const existingPoolConfig = this.db
      .prepare('SELECT * FROM terminal_pool_config WHERE id = 1')
      .get();
    if (!existingPoolConfig) {
      this.db
        .prepare(
          `INSERT INTO terminal_pool_config (id, enabled, minPoolSize, maxPoolSize, idleTimeoutMs, replenishDelayMs)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          1,
          DEFAULT_TERMINAL_POOL_CONFIG.enabled ? 1 : 0,
          DEFAULT_TERMINAL_POOL_CONFIG.minPoolSize,
          DEFAULT_TERMINAL_POOL_CONFIG.maxPoolSize,
          DEFAULT_TERMINAL_POOL_CONFIG.idleTimeoutMs,
          DEFAULT_TERMINAL_POOL_CONFIG.replenishDelayMs
        );
    }

    // Create jira_config table for global Jira configuration
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jira_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        apiToken TEXT DEFAULT '',
        baseUrl TEXT DEFAULT '',
        userEmail TEXT DEFAULT '',
        isConfigured INTEGER DEFAULT 0
      )
    `);

    // Insert default jira config if not exists
    const existingJiraConfig = this.db.prepare('SELECT * FROM jira_config WHERE id = 1').get();
    if (!existingJiraConfig) {
      this.db.exec(`
        INSERT INTO jira_config (id, apiToken, baseUrl, userEmail, isConfigured)
        VALUES (1, '', '', '', 0)
      `);
    }

    // Migration: Add jiraConfig column to projects if it doesn't exist
    this.migrateAddProjectJiraConfig();

    // Migration: Add Jira columns to ralph_tasks if they don't exist
    this.migrateAddRalphTasksJiraFields();
  }

  /**
   * Migration: Add jiraConfig column to projects for Jira integration
   */
  private migrateAddProjectJiraConfig(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'jiraConfig'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN jiraConfig TEXT');
      }
    } catch (error) {
      console.warn('Migration jiraConfig:', error);
    }
  }

  /**
   * Migration: Add Jira fields to ralph_tasks table
   */
  private migrateAddRalphTasksJiraFields(): void {
    try {
      const tableInfo = this.db.pragma('table_info(ralph_tasks)');
      const columns = tableInfo as Array<{ name: string }>;

      if (!columns.some((col) => col.name === 'jiraIssueId')) {
        this.db.exec('ALTER TABLE ralph_tasks ADD COLUMN jiraIssueId TEXT');
      }
      if (!columns.some((col) => col.name === 'jiraIssueKey')) {
        this.db.exec('ALTER TABLE ralph_tasks ADD COLUMN jiraIssueKey TEXT');
      }
      if (!columns.some((col) => col.name === 'jiraLastSyncAt')) {
        this.db.exec('ALTER TABLE ralph_tasks ADD COLUMN jiraLastSyncAt INTEGER');
      }
    } catch (error) {
      console.warn('Migration ralph_tasks Jira fields:', error);
    }
  }

  /**
   * Migration: Add skipPermissions column for existing databases
   */
  private migrateAddSkipPermissions(): void {
    try {
      // Check if column exists
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'skipPermissions'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN skipPermissions INTEGER DEFAULT 0');
      }
    } catch (error) {
      // Column might already exist or table doesn't exist yet
      console.warn('Migration skipPermissions:', error);
    }
  }

  /**
   * Migration: Add hostname column for existing databases
   */
  private migrateAddHostname(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'hostname'
      );

      if (!hasColumn) {
        // Add column with current hostname as default for existing projects
        // Sanitize hostname to prevent SQL injection (escape single quotes)
        const currentHostname = hostname().replace(/'/g, "''");
        this.db.exec(`ALTER TABLE projects ADD COLUMN hostname TEXT DEFAULT '${currentHostname}'`);
      }
    } catch (error) {
      console.warn('Migration hostname:', error);
    }
  }

  /**
   * Migration: Add preferredShell column for existing databases
   */
  private migrateAddPreferredShell(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'preferredShell'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN preferredShell TEXT');
      }
    } catch (error) {
      console.warn('Migration preferredShell:', error);
    }
  }

  private migrateAddEnableMcp(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'enableMcp'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN enableMcp INTEGER DEFAULT 0');
      }
    } catch (error) {
      console.warn('Migration enableMcp:', error);
    }
  }

  /**
   * Migration: Add privacy column to cluster_config for existing databases
   */
  private migrateAddClusterPrivacy(): void {
    try {
      const tableInfo = this.db.pragma('table_info(cluster_config)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'privacy'
      );

      if (!hasColumn) {
        this.db.exec(
          `ALTER TABLE cluster_config ADD COLUMN privacy TEXT DEFAULT '${JSON.stringify(DEFAULT_NODE_PRIVACY)}'`
        );
      }
    } catch (error) {
      console.warn('Migration cluster privacy:', error);
    }
  }

  /**
   * Migration: Add ssl column to cluster_config for existing databases
   */
  private migrateAddClusterSsl(): void {
    try {
      const tableInfo = this.db.pragma('table_info(cluster_config)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some((col) => col.name === 'ssl');

      if (!hasColumn) {
        this.db.exec(
          `ALTER TABLE cluster_config ADD COLUMN ssl TEXT DEFAULT '${JSON.stringify({ enabled: false, selfSigned: false })}'`
        );
      }
    } catch (error) {
      console.warn('Migration cluster ssl:', error);
    }
  }

  /**
   * Migration: Add clusterPermissions column to projects for existing databases
   */
  private migrateAddProjectClusterPermissions(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'clusterPermissions'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN clusterPermissions TEXT');
      }
    } catch (error) {
      console.warn('Migration project cluster permissions:', error);
    }
  }

  /**
   * Migration: Add additionalDirs column for --add-dir support
   */
  private migrateAddAdditionalDirs(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'additionalDirs'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN additionalDirs TEXT');
      }
    } catch (error) {
      console.warn('Migration additionalDirs:', error);
    }
  }

  /**
   * Migration: Add agentDeliveryMethod column for agents delivery configuration
   */
  private migrateAddAgentDeliveryMethod(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'agentDeliveryMethod'
      );

      if (!hasColumn) {
        this.db.exec("ALTER TABLE projects ADD COLUMN agentDeliveryMethod TEXT DEFAULT 'skill'");
      }
    } catch (error) {
      console.warn('Migration agentDeliveryMethod:', error);
    }
  }

  /**
   * Migration: Add agents column for custom agents configuration
   */
  private migrateAddAgents(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some((col) => col.name === 'agents');

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN agents TEXT');
      }
    } catch (error) {
      console.warn('Migration agents:', error);
    }
  }

  /**
   * Migration: Add autoReview column for auto-review subagent configuration
   */
  private migrateAddAutoReview(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'autoReview'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN autoReview INTEGER DEFAULT 1');
      }
    } catch (error) {
      console.warn('Migration autoReview:', error);
    }
  }

  private migrateAddVectorSearchConfig(): void {
    try {
      const tableInfo = this.db.pragma('table_info(projects)');
      const hasColumn = (tableInfo as Array<{ name: string }>).some(
        (col) => col.name === 'vectorSearchConfig'
      );

      if (!hasColumn) {
        this.db.exec('ALTER TABLE projects ADD COLUMN vectorSearchConfig TEXT');
      }
    } catch (error) {
      console.warn('Migration vectorSearchConfig:', error);
    }
  }

  // Project CRUD operations
  createProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
    const now = Date.now();
    const project: Project = {
      id: randomUUID(),
      ...data,
      hostname: data.hostname || hostname(), // Auto-assign current machine hostname
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, path, description, color, hostname, skipPermissions, preferredShell, enableMcp, autoReview, clusterPermissions, agents, additionalDirs, agentDeliveryMethod, jiraConfig, vectorSearchConfig, createdAt, updatedAt)
      VALUES (@id, @name, @path, @description, @color, @hostname, @skipPermissions, @preferredShell, @enableMcp, @autoReview, @clusterPermissions, @agents, @additionalDirs, @agentDeliveryMethod, @jiraConfig, @vectorSearchConfig, @createdAt, @updatedAt)
    `);

    stmt.run({
      ...project,
      skipPermissions: project.skipPermissions ? 1 : 0,
      preferredShell: project.preferredShell ?? null,
      enableMcp: project.enableMcp ? 1 : 0,
      autoReview: project.autoReview === false ? 0 : 1, // Default to true
      clusterPermissions: project.clusterPermissions
        ? JSON.stringify(project.clusterPermissions)
        : null,
      agents: project.agents ? JSON.stringify(project.agents) : null,
      additionalDirs: project.additionalDirs ? JSON.stringify(project.additionalDirs) : null,
      agentDeliveryMethod: project.agentDeliveryMethod ?? 'skill',
      jiraConfig: project.jiraConfig ? JSON.stringify(project.jiraConfig) : null,
      vectorSearchConfig: project.vectorSearchConfig
        ? JSON.stringify(project.vectorSearchConfig)
        : null,
    });
    return project;
  }

  updateProject(project: Project): Project {
    const updatedProject = {
      ...project,
      updatedAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      UPDATE projects
      SET name = @name, path = @path, description = @description,
          color = @color, hostname = @hostname, skipPermissions = @skipPermissions,
          preferredShell = @preferredShell, enableMcp = @enableMcp, autoReview = @autoReview,
          clusterPermissions = @clusterPermissions, agents = @agents,
          additionalDirs = @additionalDirs, agentDeliveryMethod = @agentDeliveryMethod,
          jiraConfig = @jiraConfig, vectorSearchConfig = @vectorSearchConfig,
          updatedAt = @updatedAt
      WHERE id = @id
    `);

    const result = stmt.run({
      id: updatedProject.id,
      name: updatedProject.name,
      path: updatedProject.path,
      description: updatedProject.description ?? null,
      color: updatedProject.color ?? null,
      hostname: updatedProject.hostname ?? null,
      skipPermissions: updatedProject.skipPermissions ? 1 : 0,
      preferredShell: updatedProject.preferredShell ?? null,
      enableMcp: updatedProject.enableMcp ? 1 : 0,
      autoReview: updatedProject.autoReview === false ? 0 : 1, // Default to true
      clusterPermissions: updatedProject.clusterPermissions
        ? JSON.stringify(updatedProject.clusterPermissions)
        : null,
      agents: updatedProject.agents ? JSON.stringify(updatedProject.agents) : null,
      additionalDirs: updatedProject.additionalDirs
        ? JSON.stringify(updatedProject.additionalDirs)
        : null,
      agentDeliveryMethod: updatedProject.agentDeliveryMethod ?? 'skill',
      jiraConfig: updatedProject.jiraConfig ? JSON.stringify(updatedProject.jiraConfig) : null,
      vectorSearchConfig: updatedProject.vectorSearchConfig
        ? JSON.stringify(updatedProject.vectorSearchConfig)
        : null,
      updatedAt: updatedProject.updatedAt,
    });
    if (result.changes === 0) {
      throw new Error(`Project with id ${project.id} not found`);
    }

    return updatedProject;
  }

  deleteProject(id: string): void {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      throw new Error(`Project with id ${id} not found`);
    }
  }

  /**
   * Map SQLite row to Project with proper boolean conversion
   */
  private mapRowToProject(row: Record<string, unknown>): Project {
    // Parse cluster permissions if present
    let clusterPermissions = undefined;
    if (row.clusterPermissions && typeof row.clusterPermissions === 'string') {
      try {
        clusterPermissions = JSON.parse(row.clusterPermissions);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    // Parse agents if present
    let agents = undefined;
    if (row.agents && typeof row.agents === 'string') {
      try {
        agents = JSON.parse(row.agents);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    // Parse additionalDirs if present
    let additionalDirs = undefined;
    if (row.additionalDirs && typeof row.additionalDirs === 'string') {
      try {
        additionalDirs = JSON.parse(row.additionalDirs);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    // Parse jiraConfig if present
    let jiraConfig = undefined;
    if (row.jiraConfig && typeof row.jiraConfig === 'string') {
      try {
        jiraConfig = JSON.parse(row.jiraConfig);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    // Parse vectorSearchConfig if present
    let vectorSearchConfig = undefined;
    if (row.vectorSearchConfig && typeof row.vectorSearchConfig === 'string') {
      try {
        vectorSearchConfig = JSON.parse(row.vectorSearchConfig);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    return {
      id: row.id as string,
      name: row.name as string,
      path: row.path as string,
      description: row.description as string | undefined,
      color: row.color as string | undefined,
      hostname: row.hostname as string | undefined,
      skipPermissions: row.skipPermissions === 1,
      preferredShell: row.preferredShell as string | undefined,
      enableMcp: row.enableMcp === 1,
      autoReview: row.autoReview !== 0, // Default to true if null/0
      clusterPermissions,
      agents,
      additionalDirs,
      agentDeliveryMethod: (row.agentDeliveryMethod as 'skill' | 'args') ?? 'skill',
      jiraConfig,
      vectorSearchConfig,
      createdAt: row.createdAt as number,
      updatedAt: row.updatedAt as number,
    };
  }

  getProjectById(id: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRowToProject(row) : null;
  }

  getProjectByPath(path: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?');
    const row = stmt.get(path) as Record<string, unknown> | undefined;
    return row ? this.mapRowToProject(row) : null;
  }

  getAllProjects(): Project[] {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY updatedAt DESC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToProject(row));
  }

  // ==================== Conversation CRUD ====================

  /**
   * Create a new conversation
   */
  createConversation(data: {
    projectId: string;
    title: string;
    initialPrompt: string;
    model: ClaudeModel;
    mode: InstanceMode;
  }): Conversation {
    const now = Date.now();
    const conversation: Conversation = {
      id: randomUUID(),
      projectId: data.projectId,
      title: data.title,
      initialPrompt: data.initialPrompt,
      model: data.model,
      mode: data.mode,
      status: 'active',
      totalCostUsd: 0,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, projectId, sessionId, title, initialPrompt, model, mode, status, totalCostUsd, messageCount, createdAt, updatedAt)
      VALUES (@id, @projectId, @sessionId, @title, @initialPrompt, @model, @mode, @status, @totalCostUsd, @messageCount, @createdAt, @updatedAt)
    `);

    stmt.run({
      ...conversation,
      sessionId: conversation.sessionId ?? null,
    });

    return conversation;
  }

  /**
   * Update a conversation
   */
  updateConversation(
    id: string,
    updates: Partial<
      Pick<Conversation, 'sessionId' | 'status' | 'totalCostUsd' | 'messageCount' | 'title'>
    >
  ): Conversation | null {
    const existing = this.getConversationById(id);
    if (!existing) return null;

    const updated: Conversation = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      UPDATE conversations
      SET sessionId = @sessionId, status = @status, totalCostUsd = @totalCostUsd,
          messageCount = @messageCount, title = @title, updatedAt = @updatedAt
      WHERE id = @id
    `);

    stmt.run({
      id: updated.id,
      sessionId: updated.sessionId ?? null,
      status: updated.status,
      totalCostUsd: updated.totalCostUsd,
      messageCount: updated.messageCount,
      title: updated.title,
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  /**
   * Delete a conversation (messages are cascaded)
   */
  deleteConversation(id: string): void {
    const stmt = this.db.prepare('DELETE FROM conversations WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Get conversation by ID
   */
  getConversationById(id: string): Conversation | null {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRowToConversation(row) : null;
  }

  /**
   * Get conversations by project ID
   */
  getConversationsByProject(projectId: string): Conversation[] {
    const stmt = this.db.prepare(
      'SELECT * FROM conversations WHERE projectId = ? ORDER BY updatedAt DESC'
    );
    const rows = stmt.all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToConversation(row));
  }

  /**
   * Map SQLite row to Conversation
   */
  private mapRowToConversation(row: Record<string, unknown>): Conversation {
    return {
      id: row.id as string,
      projectId: row.projectId as string,
      sessionId: row.sessionId as string | undefined,
      title: row.title as string,
      initialPrompt: row.initialPrompt as string,
      model: row.model as ClaudeModel,
      mode: row.mode as InstanceMode,
      status: row.status as ConversationStatus,
      totalCostUsd: row.totalCostUsd as number,
      messageCount: row.messageCount as number,
      createdAt: row.createdAt as number,
      updatedAt: row.updatedAt as number,
    };
  }

  // ==================== Conversation Message CRUD ====================

  /**
   * Add a message to a conversation
   */
  addMessage(data: {
    conversationId: string;
    type: string;
    content: string;
    costUsd?: number;
  }): ConversationMessage {
    const message: ConversationMessage = {
      id: randomUUID(),
      conversationId: data.conversationId,
      type: data.type as ConversationMessage['type'],
      content: data.content,
      costUsd: data.costUsd,
      createdAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO conversation_messages (id, conversationId, type, content, costUsd, createdAt)
      VALUES (@id, @conversationId, @type, @content, @costUsd, @createdAt)
    `);

    stmt.run({
      ...message,
      costUsd: message.costUsd ?? null,
    });

    // Update conversation message count and cost
    const conversation = this.getConversationById(data.conversationId);
    if (conversation) {
      this.updateConversation(data.conversationId, {
        messageCount: conversation.messageCount + 1,
        totalCostUsd: conversation.totalCostUsd + (data.costUsd ?? 0),
      });
    }

    return message;
  }

  /**
   * Get messages by conversation ID
   */
  getMessagesByConversation(conversationId: string): ConversationMessage[] {
    const stmt = this.db.prepare(
      'SELECT * FROM conversation_messages WHERE conversationId = ? ORDER BY createdAt ASC'
    );
    const rows = stmt.all(conversationId) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToMessage(row));
  }

  /**
   * Map SQLite row to ConversationMessage
   */
  private mapRowToMessage(row: Record<string, unknown>): ConversationMessage {
    return {
      id: row.id as string,
      conversationId: row.conversationId as string,
      type: row.type as ConversationMessage['type'],
      content: row.content as string,
      costUsd: row.costUsd as number | undefined,
      createdAt: row.createdAt as number,
    };
  }

  // ==================== Remote Config CRUD ====================

  /**
   * Get remote access configuration
   */
  getRemoteConfig(): RemoteConfig {
    const stmt = this.db.prepare('SELECT * FROM remote_config WHERE id = 1');
    const row = stmt.get() as Record<string, unknown> | undefined;

    if (!row) {
      return { ...DEFAULT_REMOTE_CONFIG };
    }

    // Parse SSL JSON, falling back to defaults
    let ssl: SslConfig = { ...DEFAULT_SSL_CONFIG };
    if (row.ssl && typeof row.ssl === 'string') {
      try {
        ssl = { ...DEFAULT_SSL_CONFIG, ...JSON.parse(row.ssl) };
      } catch {
        // Keep defaults if JSON is invalid
      }
    }

    return {
      port: row.port as number,
      passwordHash: row.passwordHash as string,
      webAccessEnabled: row.webAccessEnabled === 1,
      autoStart: row.autoStart === 1, // DEPRECATED
      enabled: row.enabled === 1, // DEPRECATED - mapped to webAccessEnabled
      allowAnyCors: row.allowAnyCors === 1,
      customHostname: (row.customHostname as string) || '',
      ssl,
    };
  }

  /**
   * Update remote access configuration
   */
  updateRemoteConfig(config: Partial<RemoteConfig>): RemoteConfig {
    const current = this.getRemoteConfig();
    const updated: RemoteConfig = {
      ...current,
      ...config,
      // Merge SSL settings if provided
      ssl: config.ssl ? { ...current.ssl, ...config.ssl } : current.ssl,
    };

    const stmt = this.db.prepare(`
      UPDATE remote_config
      SET enabled = @enabled, port = @port, passwordHash = @passwordHash, autoStart = @autoStart,
          allowAnyCors = @allowAnyCors, customHostname = @customHostname, ssl = @ssl,
          webAccessEnabled = @webAccessEnabled
      WHERE id = 1
    `);

    stmt.run({
      enabled: updated.enabled ? 1 : 0, // DEPRECATED - keep in sync with webAccessEnabled
      port: updated.port,
      passwordHash: updated.passwordHash,
      autoStart: updated.autoStart ? 1 : 0, // DEPRECATED
      allowAnyCors: updated.allowAnyCors ? 1 : 0,
      customHostname: updated.customHostname || '',
      ssl: JSON.stringify(updated.ssl),
      webAccessEnabled: updated.webAccessEnabled ? 1 : 0,
    });

    return updated;
  }

  /**
   * Reset remote access configuration to defaults
   */
  resetRemoteConfig(): RemoteConfig {
    return this.updateRemoteConfig(DEFAULT_REMOTE_CONFIG);
  }

  // ==================== Cluster Config CRUD ====================

  /**
   * Get cluster configuration
   */
  getClusterConfig(): ClusterConfig {
    const stmt = this.db.prepare('SELECT * FROM cluster_config WHERE id = 1');
    const row = stmt.get() as Record<string, unknown> | undefined;

    if (!row) {
      // Generate a new nodeId if not exists
      const nodeId = randomUUID();
      return { ...DEFAULT_CLUSTER_CONFIG, nodeId };
    }

    // Parse privacy JSON, falling back to defaults
    let privacy: ClusterNodePrivacy = DEFAULT_NODE_PRIVACY;
    if (row.privacy && typeof row.privacy === 'string') {
      try {
        privacy = { ...DEFAULT_NODE_PRIVACY, ...JSON.parse(row.privacy) };
      } catch {
        // Keep defaults if JSON is invalid
      }
    }

    // Parse SSL JSON, falling back to defaults
    let ssl: SslConfig = { ...DEFAULT_SSL_CONFIG };
    if (row.ssl && typeof row.ssl === 'string') {
      try {
        ssl = { ...DEFAULT_SSL_CONFIG, ...JSON.parse(row.ssl) };
      } catch {
        // Keep defaults if JSON is invalid
      }
    }

    return {
      enabled: row.enabled === 1,
      role: row.role as ClusterNodeRole,
      nodeId: row.nodeId as string,
      nodeName: row.nodeName as string,
      primaryHost: row.primaryHost as string | undefined,
      primaryPort: row.primaryPort as number,
      sharedSecret: row.sharedSecret as string,
      privacy,
      ssl,
    };
  }

  /**
   * Update cluster configuration
   */
  updateClusterConfig(config: Partial<ClusterConfig>): ClusterConfig {
    const current = this.getClusterConfig();
    const updated: ClusterConfig = {
      ...current,
      ...config,
      // Merge privacy settings if provided
      privacy: config.privacy ? { ...current.privacy, ...config.privacy } : current.privacy,
      // Merge SSL settings if provided
      ssl: config.ssl ? { ...current.ssl, ...config.ssl } : current.ssl,
    };

    const stmt = this.db.prepare(`
      UPDATE cluster_config
      SET enabled = @enabled, role = @role, nodeId = @nodeId, nodeName = @nodeName,
          primaryHost = @primaryHost, primaryPort = @primaryPort, sharedSecret = @sharedSecret,
          privacy = @privacy, ssl = @ssl
      WHERE id = 1
    `);

    stmt.run({
      enabled: updated.enabled ? 1 : 0,
      role: updated.role,
      nodeId: updated.nodeId,
      nodeName: updated.nodeName,
      primaryHost: updated.primaryHost ?? '',
      primaryPort: updated.primaryPort,
      sharedSecret: updated.sharedSecret,
      privacy: JSON.stringify(updated.privacy),
      ssl: JSON.stringify(updated.ssl),
    });

    return updated;
  }

  /**
   * Reset cluster configuration to defaults (preserves nodeId)
   */
  resetClusterConfig(): ClusterConfig {
    const current = this.getClusterConfig();
    return this.updateClusterConfig({
      ...DEFAULT_CLUSTER_CONFIG,
      nodeId: current.nodeId, // Preserve nodeId
    });
  }

  /**
   * Generate a new shared secret for cluster authentication
   */
  generateClusterSecret(): string {
    const secret = randomBytes(32).toString('hex'); // 64 character hex string
    this.updateClusterConfig({ sharedSecret: secret });
    return secret;
  }

  // ==================== App Settings CRUD ====================

  /**
   * Get a setting value by key
   */
  getSetting(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM app_settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  /**
   * Set a setting value
   */
  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
    `);
    stmt.run(key, value);
  }

  /**
   * Get or create a JWT secret for authentication
   * Persists across app restarts for session continuity
   */
  getOrCreateJwtSecret(): string {
    let secret = this.getSetting('jwt_secret');
    if (!secret) {
      // Generate a cryptographically secure 64-byte secret
      secret = randomBytes(64).toString('hex');
      this.setSetting('jwt_secret', secret);
    }
    return secret;
  }

  // ==================== Security Config CRUD ====================

  /**
   * Get security configuration
   */
  getSecurityConfig(): SecurityConfig {
    const stmt = this.db.prepare('SELECT config FROM security_config WHERE id = 1');
    const row = stmt.get() as { config: string } | undefined;

    if (!row) {
      return { ...DEFAULT_SECURITY_CONFIG };
    }

    try {
      const config = JSON.parse(row.config) as SecurityConfig;
      // Merge with defaults to ensure new fields are present
      return {
        ...DEFAULT_SECURITY_CONFIG,
        ...config,
        ipAccess: { ...DEFAULT_SECURITY_CONFIG.ipAccess, ...config.ipAccess },
        auth: { ...DEFAULT_SECURITY_CONFIG.auth, ...config.auth },
        rateLimit: { ...DEFAULT_SECURITY_CONFIG.rateLimit, ...config.rateLimit },
        auditLog: {
          ...DEFAULT_SECURITY_CONFIG.auditLog,
          ...config.auditLog,
          logEvents: {
            ...DEFAULT_SECURITY_CONFIG.auditLog.logEvents,
            ...config.auditLog?.logEvents,
          },
        },
      };
    } catch {
      return { ...DEFAULT_SECURITY_CONFIG };
    }
  }

  /**
   * Update security configuration
   */
  updateSecurityConfig(updates: Partial<SecurityConfig>): SecurityConfig {
    const current = this.getSecurityConfig();
    const updated: SecurityConfig = {
      ...current,
      ...updates,
      ipAccess: updates.ipAccess ? { ...current.ipAccess, ...updates.ipAccess } : current.ipAccess,
      auth: updates.auth ? { ...current.auth, ...updates.auth } : current.auth,
      rateLimit: updates.rateLimit
        ? { ...current.rateLimit, ...updates.rateLimit }
        : current.rateLimit,
      auditLog: updates.auditLog
        ? {
            ...current.auditLog,
            ...updates.auditLog,
            logEvents: updates.auditLog.logEvents
              ? { ...current.auditLog.logEvents, ...updates.auditLog.logEvents }
              : current.auditLog.logEvents,
          }
        : current.auditLog,
    };

    const stmt = this.db.prepare('UPDATE security_config SET config = ? WHERE id = 1');
    stmt.run(JSON.stringify(updated));

    return updated;
  }

  /**
   * Reset security configuration to defaults
   */
  resetSecurityConfig(): SecurityConfig {
    const stmt = this.db.prepare('UPDATE security_config SET config = ? WHERE id = 1');
    stmt.run(JSON.stringify(DEFAULT_SECURITY_CONFIG));
    return { ...DEFAULT_SECURITY_CONFIG };
  }

  // ==================== IP Access Rules CRUD ====================

  /**
   * Get all IP access rules
   */
  getIpAccessRules(): IpAccessRule[] {
    const stmt = this.db.prepare('SELECT * FROM ip_access_rules ORDER BY createdAt DESC');
    return stmt.all() as IpAccessRule[];
  }

  /**
   * Add an IP access rule
   */
  addIpAccessRule(rule: Omit<IpAccessRule, 'id' | 'createdAt'>): IpAccessRule {
    const newRule: IpAccessRule = {
      id: randomUUID(),
      type: rule.type,
      value: rule.value,
      description: rule.description,
      createdAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO ip_access_rules (id, type, value, description, createdAt)
      VALUES (@id, @type, @value, @description, @createdAt)
    `);

    stmt.run({
      id: newRule.id,
      type: newRule.type,
      value: newRule.value,
      description: newRule.description ?? null,
      createdAt: newRule.createdAt,
    });

    return newRule;
  }

  /**
   * Delete an IP access rule
   */
  deleteIpAccessRule(id: string): void {
    const stmt = this.db.prepare('DELETE FROM ip_access_rules WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Clear all IP access rules
   */
  clearIpAccessRules(): void {
    this.db.exec('DELETE FROM ip_access_rules');
  }

  // ==================== Audit Log CRUD ====================

  /**
   * Add an audit log entry
   */
  addAuditEntry(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const newEntry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      event: entry.event,
      ip: entry.ip,
      sessionId: entry.sessionId,
      details: entry.details,
      success: entry.success,
    };

    const stmt = this.db.prepare(`
      INSERT INTO audit_log (id, timestamp, event, ip, sessionId, details, success)
      VALUES (@id, @timestamp, @event, @ip, @sessionId, @details, @success)
    `);

    stmt.run({
      id: newEntry.id,
      timestamp: newEntry.timestamp,
      event: newEntry.event,
      ip: newEntry.ip,
      sessionId: newEntry.sessionId ?? null,
      details: newEntry.details ?? null,
      success: newEntry.success ? 1 : 0,
    });

    return newEntry;
  }

  /**
   * Get audit log entries with optional filtering
   */
  getAuditLog(options: AuditLogQueryOptions = {}): AuditLogEntry[] {
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (options.startDate) {
      query += ' AND timestamp >= @startDate';
      params.startDate = options.startDate;
    }

    if (options.endDate) {
      query += ' AND timestamp <= @endDate';
      params.endDate = options.endDate;
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      const placeholders = options.eventTypes.map((_, i) => `@event${i}`).join(', ');
      query += ` AND event IN (${placeholders})`;
      options.eventTypes.forEach((type, i) => {
        params[`event${i}`] = type;
      });
    }

    if (options.ip) {
      query += ' AND ip = @ip';
      params.ip = options.ip;
    }

    if (options.success !== undefined) {
      query += ' AND success = @success';
      params.success = options.success ? 1 : 0;
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ' LIMIT @limit';
      params.limit = options.limit;
    }

    if (options.offset) {
      query += ' OFFSET @offset';
      params.offset = options.offset;
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(params) as Array<{
      id: string;
      timestamp: number;
      event: AuditEventType;
      ip: string;
      sessionId: string | null;
      details: string | null;
      success: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      event: row.event,
      ip: row.ip,
      sessionId: row.sessionId ?? undefined,
      details: row.details ?? undefined,
      success: row.success === 1,
    }));
  }

  /**
   * Get audit log entry count
   */
  getAuditLogCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM audit_log');
    const row = stmt.get() as { count: number };
    return row.count;
  }

  /**
   * Clean up old audit log entries based on retention policy
   */
  cleanupAuditLog(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM audit_log WHERE timestamp < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }

  /**
   * Clear all audit log entries
   */
  clearAuditLog(): void {
    this.db.exec('DELETE FROM audit_log');
  }

  // ==================== IP Lockout CRUD ====================

  /**
   * Check if an IP is currently locked out
   */
  isIpLocked(ip: string): boolean {
    const stmt = this.db.prepare('SELECT * FROM ip_lockouts WHERE ip = ? AND expiresAt > ?');
    const row = stmt.get(ip, Date.now());
    return !!row;
  }

  /**
   * Get lockout info for an IP
   */
  getIpLockout(ip: string): { lockedAt: number; expiresAt: number; attempts: number } | null {
    const stmt = this.db.prepare('SELECT * FROM ip_lockouts WHERE ip = ?');
    const row = stmt.get(ip) as
      | {
          ip: string;
          lockedAt: number;
          expiresAt: number;
          attempts: number;
        }
      | undefined;

    if (!row) return null;

    return {
      lockedAt: row.lockedAt,
      expiresAt: row.expiresAt,
      attempts: row.attempts,
    };
  }

  /**
   * Lock an IP address
   */
  lockIp(ip: string, lockoutMinutes: number, attempts: number): void {
    const now = Date.now();
    const expiresAt = now + lockoutMinutes * 60 * 1000;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ip_lockouts (ip, lockedAt, expiresAt, attempts)
      VALUES (@ip, @lockedAt, @expiresAt, @attempts)
    `);

    stmt.run({
      ip,
      lockedAt: now,
      expiresAt,
      attempts,
    });
  }

  /**
   * Unlock an IP address
   */
  unlockIp(ip: string): void {
    const stmt = this.db.prepare('DELETE FROM ip_lockouts WHERE ip = ?');
    stmt.run(ip);
  }

  /**
   * Clean up expired lockouts
   */
  cleanupExpiredLockouts(): number {
    const stmt = this.db.prepare('DELETE FROM ip_lockouts WHERE expiresAt < ?');
    const result = stmt.run(Date.now());
    return result.changes;
  }

  /**
   * Get all active lockouts
   */
  getActiveLockouts(): Array<{
    ip: string;
    lockedAt: number;
    expiresAt: number;
    attempts: number;
  }> {
    const stmt = this.db.prepare(
      'SELECT * FROM ip_lockouts WHERE expiresAt > ? ORDER BY lockedAt DESC'
    );
    return stmt.all(Date.now()) as Array<{
      ip: string;
      lockedAt: number;
      expiresAt: number;
      attempts: number;
    }>;
  }

  // ==================== Node Privacy CRUD ====================

  /**
   * Get node privacy settings
   */
  getNodePrivacy(): ClusterNodePrivacy {
    const config = this.getClusterConfig();
    return config.privacy;
  }

  /**
   * Update node privacy settings
   */
  updateNodePrivacy(privacy: Partial<ClusterNodePrivacy>): ClusterNodePrivacy {
    const config = this.getClusterConfig();
    const updatedPrivacy: ClusterNodePrivacy = { ...config.privacy, ...privacy };
    this.updateClusterConfig({ privacy: updatedPrivacy });
    return updatedPrivacy;
  }

  // ==================== Instance Cluster Permissions CRUD ====================

  /**
   * Get cluster permissions for an instance
   */
  getInstanceClusterPermissions(instanceId: string): InstanceClusterPermissions {
    const stmt = this.db.prepare('SELECT * FROM instance_cluster_permissions WHERE instanceId = ?');
    const row = stmt.get(instanceId) as Record<string, unknown> | undefined;

    if (!row) {
      return { ...DEFAULT_INSTANCE_CLUSTER_PERMISSIONS };
    }

    return {
      shareWithCluster: row.shareWithCluster === 1,
      allowRemoteInput: row.allowRemoteInput === 1,
    };
  }

  /**
   * Set cluster permissions for an instance
   */
  setInstanceClusterPermissions(
    instanceId: string,
    perms: Partial<InstanceClusterPermissions>
  ): InstanceClusterPermissions {
    const current = this.getInstanceClusterPermissions(instanceId);
    const updated: InstanceClusterPermissions = { ...current, ...perms };

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO instance_cluster_permissions (instanceId, shareWithCluster, allowRemoteInput, createdAt)
      VALUES (@instanceId, @shareWithCluster, @allowRemoteInput, @createdAt)
    `);

    stmt.run({
      instanceId,
      shareWithCluster: updated.shareWithCluster ? 1 : 0,
      allowRemoteInput: updated.allowRemoteInput ? 1 : 0,
      createdAt: Date.now(),
    });

    return updated;
  }

  /**
   * Delete cluster permissions for an instance
   */
  deleteInstanceClusterPermissions(instanceId: string): void {
    const stmt = this.db.prepare('DELETE FROM instance_cluster_permissions WHERE instanceId = ?');
    stmt.run(instanceId);
  }

  /**
   * Get all instance cluster permissions
   */
  getAllInstanceClusterPermissions(): Map<string, InstanceClusterPermissions> {
    const stmt = this.db.prepare('SELECT * FROM instance_cluster_permissions');
    const rows = stmt.all() as Array<{
      instanceId: string;
      shareWithCluster: number;
      allowRemoteInput: number;
    }>;

    const result = new Map<string, InstanceClusterPermissions>();
    for (const row of rows) {
      result.set(row.instanceId, {
        shareWithCluster: row.shareWithCluster === 1,
        allowRemoteInput: row.allowRemoteInput === 1,
      });
    }
    return result;
  }

  // ==================== Proxy Config CRUD ====================

  /**
   * Get proxy configuration
   */
  getProxyConfig(): ProxyConfig {
    const stmt = this.db.prepare('SELECT * FROM proxy_config WHERE id = 1');
    const row = stmt.get() as Record<string, unknown> | undefined;

    if (!row) {
      return { ...DEFAULT_PROXY_CONFIG };
    }

    return {
      enabled: row.enabled === 1,
      maxConcurrentTunnels: row.maxConcurrentTunnels as number,
      rateLimitPerMinute: row.rateLimitPerMinute as number,
    };
  }

  /**
   * Update proxy configuration
   */
  updateProxyConfig(config: Partial<ProxyConfig>): ProxyConfig {
    const current = this.getProxyConfig();
    const updated: ProxyConfig = { ...current, ...config };

    const stmt = this.db.prepare(`
      UPDATE proxy_config
      SET enabled = @enabled, maxConcurrentTunnels = @maxConcurrentTunnels, rateLimitPerMinute = @rateLimitPerMinute
      WHERE id = 1
    `);

    stmt.run({
      enabled: updated.enabled ? 1 : 0,
      maxConcurrentTunnels: updated.maxConcurrentTunnels,
      rateLimitPerMinute: updated.rateLimitPerMinute,
    });

    return updated;
  }

  /**
   * Reset proxy configuration to defaults
   */
  resetProxyConfig(): ProxyConfig {
    return this.updateProxyConfig(DEFAULT_PROXY_CONFIG);
  }

  // ==================== Proxy Allowed Ports CRUD ====================

  /**
   * Get all allowed ports
   */
  getAllowedPorts(): AllowedPort[] {
    const stmt = this.db.prepare('SELECT * FROM proxy_allowed_ports ORDER BY port ASC');
    const rows = stmt.all() as Array<{
      id: string;
      port: number;
      description: string | null;
      createdAt: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      port: row.port,
      description: row.description ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Add an allowed port
   */
  addAllowedPort(port: number, description?: string): AllowedPort {
    const newPort: AllowedPort = {
      id: randomUUID(),
      port,
      description,
      createdAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO proxy_allowed_ports (id, port, description, createdAt)
      VALUES (@id, @port, @description, @createdAt)
    `);

    stmt.run({
      id: newPort.id,
      port: newPort.port,
      description: newPort.description ?? null,
      createdAt: newPort.createdAt,
    });

    return newPort;
  }

  /**
   * Delete an allowed port by port number
   */
  deleteAllowedPort(port: number): void {
    const stmt = this.db.prepare('DELETE FROM proxy_allowed_ports WHERE port = ?');
    stmt.run(port);
  }

  /**
   * Check if a port is allowed
   */
  isPortAllowed(port: number): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM proxy_allowed_ports WHERE port = ?');
    const row = stmt.get(port);
    return !!row;
  }

  /**
   * Clear all allowed ports
   */
  clearAllowedPorts(): void {
    this.db.exec('DELETE FROM proxy_allowed_ports');
  }

  // ==================== Terminal Pool Config CRUD ====================

  /**
   * Get terminal pool configuration
   */
  getTerminalPoolConfig(): TerminalPoolConfig {
    const stmt = this.db.prepare('SELECT * FROM terminal_pool_config WHERE id = 1');
    const row = stmt.get() as Record<string, unknown> | undefined;

    if (!row) {
      return { ...DEFAULT_TERMINAL_POOL_CONFIG };
    }

    return {
      enabled: row.enabled === 1,
      minPoolSize: row.minPoolSize as number,
      maxPoolSize: row.maxPoolSize as number,
      idleTimeoutMs: row.idleTimeoutMs as number,
      replenishDelayMs: row.replenishDelayMs as number,
    };
  }

  /**
   * Update terminal pool configuration
   */
  updateTerminalPoolConfig(config: Partial<TerminalPoolConfig>): TerminalPoolConfig {
    const current = this.getTerminalPoolConfig();
    const updated: TerminalPoolConfig = { ...current, ...config };

    const stmt = this.db.prepare(`
      UPDATE terminal_pool_config
      SET enabled = @enabled, minPoolSize = @minPoolSize, maxPoolSize = @maxPoolSize,
          idleTimeoutMs = @idleTimeoutMs, replenishDelayMs = @replenishDelayMs
      WHERE id = 1
    `);

    stmt.run({
      enabled: updated.enabled ? 1 : 0,
      minPoolSize: updated.minPoolSize,
      maxPoolSize: updated.maxPoolSize,
      idleTimeoutMs: updated.idleTimeoutMs,
      replenishDelayMs: updated.replenishDelayMs,
    });

    return updated;
  }

  /**
   * Reset terminal pool configuration to defaults
   */
  resetTerminalPoolConfig(): TerminalPoolConfig {
    return this.updateTerminalPoolConfig(DEFAULT_TERMINAL_POOL_CONFIG);
  }

  // ==================== Ralph Tasks CRUD ====================

  /**
   * Create a new Ralph task
   */
  createRalphTask(data: CreateRalphTaskInput): RalphTask {
    const now = Date.now();

    // Get the highest orderIndex for this project and status
    const maxOrderStmt = this.db.prepare(
      'SELECT MAX(orderIndex) as maxOrder FROM ralph_tasks WHERE projectId = ? AND status = ?'
    );
    const result = maxOrderStmt.get(data.projectId, data.status || 'todo') as {
      maxOrder: number | null;
    };
    const orderIndex = (result.maxOrder ?? 0) + 1;

    const task: RalphTask = {
      id: randomUUID(),
      projectId: data.projectId,
      name: data.name,
      description: data.description,
      status: data.status || 'todo',
      orderIndex,
      loopCount: 0,
      isPaused: false,
      isInteractive: true, // Default to interactive mode
      createdAt: now,
      updatedAt: now,
      // Jira fields from import
      jiraIssueId: data.jiraIssueId,
      jiraIssueKey: data.jiraIssueKey,
      jiraLastSyncAt: data.jiraIssueId ? now : undefined,
    };

    const stmt = this.db.prepare(`
      INSERT INTO ralph_tasks (id, projectId, name, description, status, orderIndex, instanceId, loopCount, isPaused, pauseReason, completionSummary, contextFilePath, isInteractive, createdAt, updatedAt, startedAt, completedAt, jiraIssueId, jiraIssueKey, jiraLastSyncAt)
      VALUES (@id, @projectId, @name, @description, @status, @orderIndex, @instanceId, @loopCount, @isPaused, @pauseReason, @completionSummary, @contextFilePath, @isInteractive, @createdAt, @updatedAt, @startedAt, @completedAt, @jiraIssueId, @jiraIssueKey, @jiraLastSyncAt)
    `);

    stmt.run({
      id: task.id,
      projectId: task.projectId,
      name: task.name,
      description: task.description ?? null,
      status: task.status,
      orderIndex: task.orderIndex,
      instanceId: task.instanceId ?? null,
      loopCount: task.loopCount,
      isPaused: task.isPaused ? 1 : 0,
      pauseReason: task.pauseReason ?? null,
      completionSummary: task.completionSummary ?? null,
      contextFilePath: task.contextFilePath ?? null,
      isInteractive: task.isInteractive ? 1 : 0,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt: task.startedAt ?? null,
      completedAt: task.completedAt ?? null,
      jiraIssueId: task.jiraIssueId ?? null,
      jiraIssueKey: task.jiraIssueKey ?? null,
      jiraLastSyncAt: task.jiraLastSyncAt ?? null,
    });

    return task;
  }

  /**
   * Update a Ralph task
   */
  updateRalphTask(id: string, updates: UpdateRalphTaskInput): RalphTask | null {
    const existing = this.getRalphTaskById(id);
    if (!existing) return null;

    const updated: RalphTask = {
      ...existing,
      ...updates,
      // Handle null values explicitly
      instanceId:
        updates.instanceId === null ? undefined : (updates.instanceId ?? existing.instanceId),
      pauseReason:
        updates.pauseReason === null ? undefined : (updates.pauseReason ?? existing.pauseReason),
      completionSummary:
        updates.completionSummary === null
          ? undefined
          : (updates.completionSummary ?? existing.completionSummary),
      startedAt: updates.startedAt === null ? undefined : (updates.startedAt ?? existing.startedAt),
      completedAt:
        updates.completedAt === null ? undefined : (updates.completedAt ?? existing.completedAt),
      // Handle Jira null values
      jiraIssueId:
        updates.jiraIssueId === null ? undefined : (updates.jiraIssueId ?? existing.jiraIssueId),
      jiraIssueKey:
        updates.jiraIssueKey === null ? undefined : (updates.jiraIssueKey ?? existing.jiraIssueKey),
      jiraLastSyncAt:
        updates.jiraLastSyncAt === null
          ? undefined
          : (updates.jiraLastSyncAt ?? existing.jiraLastSyncAt),
      updatedAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      UPDATE ralph_tasks
      SET name = @name, description = @description, status = @status, orderIndex = @orderIndex,
          instanceId = @instanceId, loopCount = @loopCount, isPaused = @isPaused,
          pauseReason = @pauseReason, completionSummary = @completionSummary,
          contextFilePath = @contextFilePath, isInteractive = @isInteractive, updatedAt = @updatedAt,
          startedAt = @startedAt, completedAt = @completedAt,
          jiraIssueId = @jiraIssueId, jiraIssueKey = @jiraIssueKey, jiraLastSyncAt = @jiraLastSyncAt
      WHERE id = @id
    `);

    stmt.run({
      id: updated.id,
      name: updated.name,
      description: updated.description ?? null,
      status: updated.status,
      orderIndex: updated.orderIndex,
      instanceId: updated.instanceId ?? null,
      loopCount: updated.loopCount,
      isPaused: updated.isPaused ? 1 : 0,
      pauseReason: updated.pauseReason ?? null,
      completionSummary: updated.completionSummary ?? null,
      contextFilePath: updated.contextFilePath ?? null,
      isInteractive: updated.isInteractive ? 1 : 0,
      updatedAt: updated.updatedAt,
      startedAt: updated.startedAt ?? null,
      completedAt: updated.completedAt ?? null,
      jiraIssueId: updated.jiraIssueId ?? null,
      jiraIssueKey: updated.jiraIssueKey ?? null,
      jiraLastSyncAt: updated.jiraLastSyncAt ?? null,
    });

    return updated;
  }

  /**
   * Delete a Ralph task
   */
  deleteRalphTask(id: string): void {
    const stmt = this.db.prepare('DELETE FROM ralph_tasks WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Get Ralph task by ID
   */
  getRalphTaskById(id: string): RalphTask | null {
    const stmt = this.db.prepare('SELECT * FROM ralph_tasks WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRowToRalphTask(row) : null;
  }

  /**
   * Get Ralph tasks by project ID
   */
  getRalphTasksByProject(projectId: string): RalphTask[] {
    const stmt = this.db.prepare(
      'SELECT * FROM ralph_tasks WHERE projectId = ? ORDER BY status, orderIndex ASC'
    );
    const rows = stmt.all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToRalphTask(row));
  }

  /**
   * Get Ralph tasks by status
   */
  getRalphTasksByStatus(projectId: string, status: RalphTaskStatus): RalphTask[] {
    const stmt = this.db.prepare(
      'SELECT * FROM ralph_tasks WHERE projectId = ? AND status = ? ORDER BY orderIndex ASC'
    );
    const rows = stmt.all(projectId, status) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToRalphTask(row));
  }

  /**
   * Move a Ralph task to a new status and/or order
   */
  moveRalphTask(id: string, newStatus: RalphTaskStatus, newOrderIndex?: number): RalphTask | null {
    const task = this.getRalphTaskById(id);
    if (!task) return null;

    let orderIndex = newOrderIndex;

    // If no order specified, put at the end of the target column
    if (orderIndex === undefined) {
      const maxOrderStmt = this.db.prepare(
        'SELECT MAX(orderIndex) as maxOrder FROM ralph_tasks WHERE projectId = ? AND status = ?'
      );
      const result = maxOrderStmt.get(task.projectId, newStatus) as { maxOrder: number | null };
      orderIndex = (result.maxOrder ?? 0) + 1;
    }

    const updates: UpdateRalphTaskInput = {
      status: newStatus,
      orderIndex,
    };

    // Set startedAt when moving to 'doing'
    if (newStatus === 'doing' && !task.startedAt) {
      updates.startedAt = Date.now();
    }

    // Set completedAt when moving to 'done'
    if (newStatus === 'done' && !task.completedAt) {
      updates.completedAt = Date.now();
    }

    return this.updateRalphTask(id, updates);
  }

  /**
   * Reorder Ralph tasks within a column
   */
  reorderRalphTasks(
    tasks: Array<{ id: string; status: RalphTaskStatus; orderIndex: number }>
  ): void {
    const stmt = this.db.prepare(`
      UPDATE ralph_tasks SET status = ?, orderIndex = ?, updatedAt = ? WHERE id = ?
    `);

    const now = Date.now();
    const updateMany = this.db.transaction(() => {
      for (const task of tasks) {
        stmt.run(task.status, task.orderIndex, now, task.id);
      }
    });

    updateMany();
  }

  /**
   * Map SQLite row to RalphTask
   */
  private mapRowToRalphTask(row: Record<string, unknown>): RalphTask {
    return {
      id: row.id as string,
      projectId: row.projectId as string,
      name: row.name as string,
      description: row.description as string | undefined,
      status: row.status as RalphTaskStatus,
      orderIndex: row.orderIndex as number,
      instanceId: row.instanceId as string | undefined,
      loopCount: row.loopCount as number,
      isPaused: row.isPaused === 1,
      pauseReason: row.pauseReason as string | undefined,
      completionSummary: row.completionSummary as string | undefined,
      contextFilePath: row.contextFilePath as string | undefined,
      isInteractive: row.isInteractive !== 0, // Default to true if null/undefined
      createdAt: row.createdAt as number,
      updatedAt: row.updatedAt as number,
      startedAt: row.startedAt as number | undefined,
      completedAt: row.completedAt as number | undefined,
      // Jira fields
      jiraIssueId: row.jiraIssueId as string | undefined,
      jiraIssueKey: row.jiraIssueKey as string | undefined,
      jiraLastSyncAt: row.jiraLastSyncAt as number | undefined,
    };
  }

  // ==================== Instance Presets CRUD ====================

  /**
   * Create a new instance preset
   */
  createPreset(data: CreatePresetInput): InstancePreset {
    const now = Date.now();
    const preset: InstancePreset = {
      id: randomUUID(),
      name: data.name,
      description: data.description,
      model: data.model,
      planMode: data.planMode,
      verbose: data.verbose,
      agentFile: data.agentFile,
      agents: data.agents,
      additionalDirs: data.additionalDirs,
      initialPrompt: data.initialPrompt,
      category: data.category,
      tags: data.tags,
      isGlobal: data.isGlobal,
      projectId: data.isGlobal ? undefined : data.projectId,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO instance_presets (id, name, description, model, planMode, verbose, agentFile, agents, additionalDirs, initialPrompt, category, tags, isGlobal, projectId, createdAt, updatedAt)
      VALUES (@id, @name, @description, @model, @planMode, @verbose, @agentFile, @agents, @additionalDirs, @initialPrompt, @category, @tags, @isGlobal, @projectId, @createdAt, @updatedAt)
    `);

    stmt.run({
      id: preset.id,
      name: preset.name,
      description: preset.description ?? null,
      model: preset.model,
      planMode: preset.planMode ? 1 : 0,
      verbose: preset.verbose ? 1 : 0,
      agentFile: preset.agentFile ?? null,
      agents: preset.agents ? JSON.stringify(preset.agents) : null,
      additionalDirs: preset.additionalDirs ? JSON.stringify(preset.additionalDirs) : null,
      initialPrompt: preset.initialPrompt ?? null,
      category: preset.category ?? null,
      tags: preset.tags ? JSON.stringify(preset.tags) : null,
      isGlobal: preset.isGlobal ? 1 : 0,
      projectId: preset.projectId ?? null,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    });

    return preset;
  }

  /**
   * Update an existing instance preset
   */
  updatePreset(id: string, updates: UpdatePresetInput): InstancePreset | null {
    const existing = this.getPresetById(id);
    if (!existing) return null;

    const updated: InstancePreset = {
      ...existing,
      ...updates,
      // Ensure projectId is cleared if becoming global
      projectId:
        updates.isGlobal === true
          ? undefined
          : updates.isGlobal === false
            ? existing.projectId
            : existing.projectId,
      updatedAt: Date.now(),
    };

    const stmt = this.db.prepare(`
      UPDATE instance_presets
      SET name = @name, description = @description, model = @model, planMode = @planMode,
          verbose = @verbose, agentFile = @agentFile, agents = @agents, additionalDirs = @additionalDirs,
          initialPrompt = @initialPrompt, category = @category, tags = @tags, isGlobal = @isGlobal,
          projectId = @projectId, updatedAt = @updatedAt
      WHERE id = @id
    `);

    stmt.run({
      id: updated.id,
      name: updated.name,
      description: updated.description ?? null,
      model: updated.model,
      planMode: updated.planMode ? 1 : 0,
      verbose: updated.verbose ? 1 : 0,
      agentFile: updated.agentFile ?? null,
      agents: updated.agents ? JSON.stringify(updated.agents) : null,
      additionalDirs: updated.additionalDirs ? JSON.stringify(updated.additionalDirs) : null,
      initialPrompt: updated.initialPrompt ?? null,
      category: updated.category ?? null,
      tags: updated.tags ? JSON.stringify(updated.tags) : null,
      isGlobal: updated.isGlobal ? 1 : 0,
      projectId: updated.projectId ?? null,
      updatedAt: updated.updatedAt,
    });

    return updated;
  }

  /**
   * Delete an instance preset
   */
  deletePreset(id: string): void {
    const stmt = this.db.prepare('DELETE FROM instance_presets WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Get preset by ID
   */
  getPresetById(id: string): InstancePreset | null {
    const stmt = this.db.prepare('SELECT * FROM instance_presets WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRowToPreset(row) : null;
  }

  /**
   * Get presets available for a project (includes global presets and project-specific presets)
   */
  getPresetsByProject(projectId: string): InstancePreset[] {
    const stmt = this.db.prepare(`
      SELECT * FROM instance_presets
      WHERE isGlobal = 1 OR projectId = ?
      ORDER BY isGlobal DESC, name ASC
    `);
    const rows = stmt.all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToPreset(row));
  }

  /**
   * Get all global presets
   */
  getGlobalPresets(): InstancePreset[] {
    const stmt = this.db.prepare(
      'SELECT * FROM instance_presets WHERE isGlobal = 1 ORDER BY name ASC'
    );
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToPreset(row));
  }

  /**
   * Get all presets
   */
  getAllPresets(): InstancePreset[] {
    const stmt = this.db.prepare('SELECT * FROM instance_presets ORDER BY isGlobal DESC, name ASC');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => this.mapRowToPreset(row));
  }

  /**
   * Duplicate a preset with a new name
   */
  duplicatePreset(id: string, newName: string): InstancePreset | null {
    const existing = this.getPresetById(id);
    if (!existing) return null;

    return this.createPreset({
      name: newName,
      description: existing.description,
      model: existing.model,
      planMode: existing.planMode,
      verbose: existing.verbose,
      agentFile: existing.agentFile,
      agents: existing.agents,
      additionalDirs: existing.additionalDirs,
      initialPrompt: existing.initialPrompt,
      category: existing.category,
      tags: existing.tags,
      isGlobal: existing.isGlobal,
      projectId: existing.projectId,
    });
  }

  /**
   * Map SQLite row to InstancePreset
   */
  private mapRowToPreset(row: Record<string, unknown>): InstancePreset {
    // Parse JSON fields
    let agents = undefined;
    if (row.agents && typeof row.agents === 'string') {
      try {
        agents = JSON.parse(row.agents);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    let additionalDirs = undefined;
    if (row.additionalDirs && typeof row.additionalDirs === 'string') {
      try {
        additionalDirs = JSON.parse(row.additionalDirs);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    let tags = undefined;
    if (row.tags && typeof row.tags === 'string') {
      try {
        tags = JSON.parse(row.tags);
      } catch {
        // Keep undefined if JSON is invalid
      }
    }

    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      model: row.model as InstancePreset['model'],
      planMode: row.planMode === 1,
      verbose: row.verbose === 1,
      agentFile: row.agentFile as string | undefined,
      agents,
      additionalDirs,
      initialPrompt: row.initialPrompt as string | undefined,
      category: row.category as string | undefined,
      tags,
      isGlobal: row.isGlobal === 1,
      projectId: row.projectId as string | undefined,
      createdAt: row.createdAt as number,
      updatedAt: row.updatedAt as number,
    };
  }

  // ==================== Jira Config CRUD ====================

  /**
   * Get global Jira configuration
   */
  getJiraGlobalConfig(): JiraGlobalConfig {
    const stmt = this.db.prepare('SELECT * FROM jira_config WHERE id = 1');
    const row = stmt.get() as Record<string, unknown> | undefined;

    if (!row) {
      return { ...DEFAULT_JIRA_GLOBAL_CONFIG };
    }

    return {
      apiToken: row.apiToken as string,
      baseUrl: row.baseUrl as string,
      userEmail: row.userEmail as string,
      isConfigured: row.isConfigured === 1,
    };
  }

  /**
   * Update global Jira configuration
   */
  updateJiraGlobalConfig(config: Partial<JiraGlobalConfig>): JiraGlobalConfig {
    const current = this.getJiraGlobalConfig();
    const updated: JiraGlobalConfig = { ...current, ...config };

    const stmt = this.db.prepare(`
      UPDATE jira_config
      SET apiToken = @apiToken, baseUrl = @baseUrl, userEmail = @userEmail, isConfigured = @isConfigured
      WHERE id = 1
    `);

    stmt.run({
      apiToken: updated.apiToken,
      baseUrl: updated.baseUrl,
      userEmail: updated.userEmail,
      isConfigured: updated.isConfigured ? 1 : 0,
    });

    return updated;
  }

  /**
   * Reset Jira configuration to defaults
   */
  resetJiraGlobalConfig(): JiraGlobalConfig {
    return this.updateJiraGlobalConfig(DEFAULT_JIRA_GLOBAL_CONFIG);
  }

  // Clean up
  close(): void {
    this.db.close();
    DataStore.instance = null;
  }
}
