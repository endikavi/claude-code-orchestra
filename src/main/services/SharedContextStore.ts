/**
 * SharedContextStore
 *
 * Manages shared context between Claude instances within the same project.
 * - Instance contexts are stored in memory (volatile, cleared when instance terminates)
 * - Project knowledge is persisted in SQLite (survives restarts)
 */

import { EventEmitter } from 'events';
import type {
  SharedInstanceContext,
  ProjectSharedKnowledge,
  PublishContextRequest,
  ContributeKnowledgeRequest,
  ProjectContextSummary,
  ContextUpdateEvent,
  ImportantFile,
  ProjectConvention,
  ProjectWarning,
  InstanceWorkStatus,
} from '@shared/types/sharedContext';
import { DataStore } from './DataStore';

export class SharedContextStore extends EventEmitter {
  private static instance: SharedContextStore | null = null;

  // In-memory storage for active instance contexts
  private instanceContexts: Map<string, SharedInstanceContext> = new Map();

  // In-memory cache for project knowledge (backed by SQLite)
  private projectKnowledgeCache: Map<string, ProjectSharedKnowledge> = new Map();

  private dataStore: DataStore;

  private constructor() {
    super();
    this.dataStore = DataStore.getInstance();
    this.initializeDatabase();
  }

  public static getInstance(): SharedContextStore {
    if (!SharedContextStore.instance) {
      SharedContextStore.instance = new SharedContextStore();
    }
    return SharedContextStore.instance;
  }

  /**
   * Initialize database tables for project knowledge persistence
   */
  private initializeDatabase(): void {
    // Create table if not exists - DataStore handles the db connection
    // We'll add a migration method to DataStore or use raw SQL here
    try {
      const db = (this.dataStore as unknown as { db: { exec: (sql: string) => void } }).db;
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_shared_knowledge (
          project_id TEXT PRIMARY KEY,
          architecture_summary TEXT,
          tech_stack TEXT,
          conventions TEXT,
          important_files TEXT,
          warnings TEXT,
          entry_points TEXT,
          key_directories TEXT,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
    } catch (error) {
      console.error('[SharedContextStore] Failed to initialize database:', error);
    }
  }

  // ==================== Instance Context Methods ====================

  /**
   * Set or update context for an instance
   */
  setInstanceContext(
    instanceId: string,
    projectId: string,
    request: PublishContextRequest
  ): SharedInstanceContext {
    const existing = this.instanceContexts.get(instanceId);
    const now = Date.now();

    const context: SharedInstanceContext = {
      instanceId,
      projectId,
      updatedAt: now,
      workStatus: request.workStatus ?? existing?.workStatus ?? 'idle',
      currentTask: request.currentTask ?? existing?.currentTask,
      currentFiles: request.currentFiles ?? existing?.currentFiles ?? [],
      discoveredPatterns: request.discoveredPatterns ?? existing?.discoveredPatterns ?? [],
      notesForOthers: request.notesForOthers ?? existing?.notesForOthers ?? [],
      todoItems: request.todoItems ?? existing?.todoItems ?? [],
      model: existing?.model,
      isSubagent: existing?.isSubagent,
      parentInstanceId: existing?.parentInstanceId,
    };

    this.instanceContexts.set(instanceId, context);

    // Emit update event
    const event: ContextUpdateEvent = {
      type: 'instance',
      projectId,
      instanceId,
      timestamp: now,
    };
    this.emit('contextUpdated', event);

    return context;
  }

  /**
   * Update instance metadata (model, subagent info)
   */
  updateInstanceMetadata(
    instanceId: string,
    metadata: { model?: string; isSubagent?: boolean; parentInstanceId?: string }
  ): void {
    const existing = this.instanceContexts.get(instanceId);
    if (existing) {
      existing.model = metadata.model ?? existing.model;
      existing.isSubagent = metadata.isSubagent ?? existing.isSubagent;
      existing.parentInstanceId = metadata.parentInstanceId ?? existing.parentInstanceId;
      existing.updatedAt = Date.now();
    }
  }

  /**
   * Get context for a specific instance
   */
  getInstanceContext(instanceId: string): SharedInstanceContext | null {
    return this.instanceContexts.get(instanceId) ?? null;
  }

  /**
   * Get all instance contexts for a project
   */
  getAllInstanceContexts(projectId: string): SharedInstanceContext[] {
    const contexts: SharedInstanceContext[] = [];
    for (const context of this.instanceContexts.values()) {
      if (context.projectId === projectId) {
        contexts.push(context);
      }
    }
    return contexts;
  }

  /**
   * Clear context for an instance (called when instance terminates)
   */
  clearInstanceContext(instanceId: string): void {
    const context = this.instanceContexts.get(instanceId);
    if (context) {
      this.instanceContexts.delete(instanceId);

      // Emit update event
      const event: ContextUpdateEvent = {
        type: 'instance',
        projectId: context.projectId,
        instanceId,
        timestamp: Date.now(),
      };
      this.emit('contextUpdated', event);
    }
  }

  /**
   * Update work status for an instance
   */
  updateWorkStatus(instanceId: string, status: InstanceWorkStatus): void {
    const context = this.instanceContexts.get(instanceId);
    if (context) {
      context.workStatus = status;
      context.updatedAt = Date.now();
    }
  }

  /**
   * Add files to instance's current working files
   */
  addCurrentFiles(instanceId: string, files: string[]): void {
    const context = this.instanceContexts.get(instanceId);
    if (context) {
      const uniqueFiles = new Set([...context.currentFiles, ...files]);
      context.currentFiles = Array.from(uniqueFiles).slice(-20); // Keep last 20 files
      context.updatedAt = Date.now();
    }
  }

  // ==================== Project Knowledge Methods ====================

  /**
   * Get project knowledge (from cache or database)
   */
  getProjectKnowledge(projectId: string): ProjectSharedKnowledge | null {
    // Check cache first
    if (this.projectKnowledgeCache.has(projectId)) {
      return this.projectKnowledgeCache.get(projectId) ?? null;
    }

    // Load from database
    try {
      const db = (
        this.dataStore as unknown as {
          db: {
            prepare: (sql: string) => {
              get: (id: string) => Record<string, unknown> | undefined;
            };
          };
        }
      ).db;
      const stmt = db.prepare('SELECT * FROM project_shared_knowledge WHERE project_id = ?');
      const row = stmt.get(projectId);

      if (!row) return null;

      const knowledge: ProjectSharedKnowledge = {
        projectId,
        updatedAt: row.updated_at as number,
        architectureSummary: row.architecture_summary as string | undefined,
        techStack: row.tech_stack ? JSON.parse(row.tech_stack as string) : undefined,
        conventions: row.conventions ? JSON.parse(row.conventions as string) : [],
        importantFiles: row.important_files ? JSON.parse(row.important_files as string) : [],
        warnings: row.warnings ? JSON.parse(row.warnings as string) : [],
        entryPoints: row.entry_points ? JSON.parse(row.entry_points as string) : undefined,
        keyDirectories: row.key_directories ? JSON.parse(row.key_directories as string) : undefined,
      };

      // Cache it
      this.projectKnowledgeCache.set(projectId, knowledge);
      return knowledge;
    } catch (error) {
      console.error('[SharedContextStore] Failed to load project knowledge:', error);
      return null;
    }
  }

  /**
   * Contribute knowledge to a project
   */
  contributeKnowledge(
    projectId: string,
    instanceId: string,
    request: ContributeKnowledgeRequest
  ): ProjectSharedKnowledge {
    const existing = this.getProjectKnowledge(projectId);
    const now = Date.now();

    const knowledge: ProjectSharedKnowledge = {
      projectId,
      updatedAt: now,
      architectureSummary: request.architectureSummary ?? existing?.architectureSummary,
      techStack: request.techStack ?? existing?.techStack,
      conventions: existing?.conventions ?? [],
      importantFiles: existing?.importantFiles ?? [],
      warnings: existing?.warnings ?? [],
      entryPoints: request.entryPoints ?? existing?.entryPoints,
      keyDirectories: request.keyDirectories
        ? { ...existing?.keyDirectories, ...request.keyDirectories }
        : existing?.keyDirectories,
    };

    // Add new convention if provided
    if (request.convention) {
      const convention: ProjectConvention = {
        ...request.convention,
        discoveredBy: instanceId,
        discoveredAt: now,
      };
      knowledge.conventions.push(convention);
    }

    // Add new important file if provided
    if (request.importantFile) {
      // Check if file already exists
      const existingFile = knowledge.importantFiles.find(
        (f) => f.path === request.importantFile!.path
      );
      if (!existingFile) {
        const file: ImportantFile = {
          ...request.importantFile,
          discoveredBy: instanceId,
          discoveredAt: now,
        };
        knowledge.importantFiles.push(file);
      }
    }

    // Add new warning if provided
    if (request.warning) {
      const warning: ProjectWarning = {
        ...request.warning,
        discoveredBy: instanceId,
        discoveredAt: now,
      };
      knowledge.warnings.push(warning);
    }

    // Save to database and cache
    this.saveProjectKnowledge(knowledge);
    this.projectKnowledgeCache.set(projectId, knowledge);

    // Emit update event
    const event: ContextUpdateEvent = {
      type: 'project',
      projectId,
      timestamp: now,
    };
    this.emit('contextUpdated', event);

    return knowledge;
  }

  /**
   * Save project knowledge to database
   */
  private saveProjectKnowledge(knowledge: ProjectSharedKnowledge): void {
    try {
      const db = (
        this.dataStore as unknown as {
          db: {
            prepare: (sql: string) => {
              run: (params: Record<string, unknown>) => void;
            };
          };
        }
      ).db;

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO project_shared_knowledge
        (project_id, architecture_summary, tech_stack, conventions, important_files, warnings, entry_points, key_directories, updated_at)
        VALUES (@project_id, @architecture_summary, @tech_stack, @conventions, @important_files, @warnings, @entry_points, @key_directories, @updated_at)
      `);

      stmt.run({
        project_id: knowledge.projectId,
        architecture_summary: knowledge.architectureSummary ?? null,
        tech_stack: knowledge.techStack ? JSON.stringify(knowledge.techStack) : null,
        conventions: JSON.stringify(knowledge.conventions),
        important_files: JSON.stringify(knowledge.importantFiles),
        warnings: JSON.stringify(knowledge.warnings),
        entry_points: knowledge.entryPoints ? JSON.stringify(knowledge.entryPoints) : null,
        key_directories: knowledge.keyDirectories ? JSON.stringify(knowledge.keyDirectories) : null,
        updated_at: knowledge.updatedAt,
      });
    } catch (error) {
      console.error('[SharedContextStore] Failed to save project knowledge:', error);
    }
  }

  /**
   * Clear project knowledge
   */
  clearProjectKnowledge(projectId: string): void {
    try {
      const db = (
        this.dataStore as unknown as {
          db: {
            prepare: (sql: string) => {
              run: (id: string) => void;
            };
          };
        }
      ).db;
      const stmt = db.prepare('DELETE FROM project_shared_knowledge WHERE project_id = ?');
      stmt.run(projectId);
      this.projectKnowledgeCache.delete(projectId);
    } catch (error) {
      console.error('[SharedContextStore] Failed to clear project knowledge:', error);
    }
  }

  // ==================== Summary Methods ====================

  /**
   * Get a complete context summary for a project
   */
  getContextSummary(projectId: string): ProjectContextSummary {
    const instances = this.getAllInstanceContexts(projectId);
    const knowledge = this.getProjectKnowledge(projectId);

    // Generate human-readable overview
    const overview = this.generateOverview(instances, knowledge);

    return {
      projectId,
      generatedAt: Date.now(),
      instances,
      knowledge,
      overview,
    };
  }

  /**
   * Generate a human-readable overview of the context
   */
  private generateOverview(
    instances: SharedInstanceContext[],
    knowledge: ProjectSharedKnowledge | null
  ): string {
    const lines: string[] = [];

    // Active instances summary
    if (instances.length > 0) {
      lines.push(`## Active Instances (${instances.length})`);
      for (const inst of instances) {
        const taskInfo = inst.currentTask ? `: ${inst.currentTask}` : '';
        const filesInfo =
          inst.currentFiles.length > 0 ? ` [${inst.currentFiles.length} files]` : '';
        const subagentInfo = inst.isSubagent ? ' (subagent)' : '';
        lines.push(
          `- ${inst.instanceId.slice(0, 8)}${subagentInfo} [${inst.workStatus}]${taskInfo}${filesInfo}`
        );
      }
      lines.push('');
    } else {
      lines.push('## No active instances\n');
    }

    // Project knowledge summary
    if (knowledge) {
      lines.push('## Project Knowledge');

      if (knowledge.architectureSummary) {
        lines.push(`### Architecture\n${knowledge.architectureSummary}\n`);
      }

      if (knowledge.techStack && knowledge.techStack.length > 0) {
        lines.push(`### Tech Stack: ${knowledge.techStack.join(', ')}\n`);
      }

      if (knowledge.conventions.length > 0) {
        lines.push(`### Conventions (${knowledge.conventions.length})`);
        for (const conv of knowledge.conventions.slice(-5)) {
          lines.push(`- [${conv.type}] ${conv.description}`);
        }
        lines.push('');
      }

      if (knowledge.importantFiles.length > 0) {
        lines.push(`### Important Files (${knowledge.importantFiles.length})`);
        for (const file of knowledge.importantFiles.slice(-5)) {
          lines.push(`- ${file.path}: ${file.description}`);
        }
        lines.push('');
      }

      if (knowledge.warnings.length > 0) {
        lines.push(`### Warnings (${knowledge.warnings.length})`);
        for (const warn of knowledge.warnings.slice(-3)) {
          lines.push(`- [${warn.severity}] ${warn.description}`);
        }
      }
    }

    return lines.join('\n');
  }

  // ==================== Cleanup Methods ====================

  /**
   * Clean up stale instance contexts (instances that haven't updated in a while)
   */
  cleanupStaleContexts(maxAgeMs: number = 30 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [instanceId, context] of this.instanceContexts.entries()) {
      if (now - context.updatedAt > maxAgeMs) {
        this.instanceContexts.delete(instanceId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clean up old project knowledge based on retention policy
   */
  cleanupOldKnowledge(retentionDays: number): number {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    try {
      const db = (
        this.dataStore as unknown as {
          db: {
            prepare: (sql: string) => {
              run: (cutoff: number) => { changes: number };
            };
          };
        }
      ).db;
      const stmt = db.prepare('DELETE FROM project_shared_knowledge WHERE updated_at < ?');
      const result = stmt.run(cutoff);

      // Clear cache for deleted projects
      for (const [projectId, knowledge] of this.projectKnowledgeCache.entries()) {
        if (knowledge.updatedAt < cutoff) {
          this.projectKnowledgeCache.delete(projectId);
        }
      }

      return result.changes;
    } catch (error) {
      console.error('[SharedContextStore] Failed to cleanup old knowledge:', error);
      return 0;
    }
  }

  /**
   * Get statistics about stored context
   */
  getStats(): {
    activeInstances: number;
    projectsWithKnowledge: number;
    totalConventions: number;
    totalImportantFiles: number;
    totalWarnings: number;
  } {
    let totalConventions = 0;
    let totalImportantFiles = 0;
    let totalWarnings = 0;

    for (const knowledge of this.projectKnowledgeCache.values()) {
      totalConventions += knowledge.conventions.length;
      totalImportantFiles += knowledge.importantFiles.length;
      totalWarnings += knowledge.warnings.length;
    }

    return {
      activeInstances: this.instanceContexts.size,
      projectsWithKnowledge: this.projectKnowledgeCache.size,
      totalConventions,
      totalImportantFiles,
      totalWarnings,
    };
  }

  /**
   * Reset the store (for testing)
   */
  reset(): void {
    this.instanceContexts.clear();
    this.projectKnowledgeCache.clear();
  }
}

// Export singleton getter
export function getSharedContextStore(): SharedContextStore {
  return SharedContextStore.getInstance();
}

// Flag to track if event forwarding has been set up
let eventForwardingInitialized = false;

/**
 * Initialize event forwarding from SharedContextStore to InstanceBroadcaster
 * This should be called once during app initialization
 */
export function initializeContextBroadcasting(): void {
  if (eventForwardingInitialized) {
    return;
  }

  const contextStore = SharedContextStore.getInstance();

  // Import InstanceBroadcaster dynamically to avoid circular dependencies
  import('./InstanceBroadcaster.js')
    .then(({ getInstanceBroadcaster }) => {
      const broadcaster = getInstanceBroadcaster();

      // Forward contextUpdated events to broadcaster
      contextStore.on('contextUpdated', (event: ContextUpdateEvent) => {
        if (event.type === 'instance' && event.instanceId) {
          const context = contextStore.getInstanceContext(event.instanceId);
          if (context) {
            broadcaster.broadcastContextInstanceUpdate(event.projectId, context);
          }
        } else if (event.type === 'project') {
          const knowledge = contextStore.getProjectKnowledge(event.projectId);
          if (knowledge) {
            broadcaster.broadcastContextKnowledgeUpdate(event.projectId, knowledge);
          }
        }

        broadcaster.broadcastContextUpdate(event);
      });

      eventForwardingInitialized = true;
      console.log('[SharedContextStore] Event broadcasting initialized');
    })
    .catch((err) => {
      console.error('[SharedContextStore] Failed to initialize event broadcasting:', err);
    });
}
