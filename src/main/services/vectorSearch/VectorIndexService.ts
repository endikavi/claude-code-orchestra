import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { app } from 'electron';
import { globSync } from 'glob';
import { minimatch } from 'minimatch';
import ignore, { Ignore } from 'ignore';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { getLlamaService, LlamaService } from './LlamaService';
import { chunkMarkdown, calculateFileHash } from './MarkdownChunker';
import { getSkillManager } from '../SkillManager';
import type {
  Chunk,
  IndexProgress,
  IndexStats,
  SearchResult,
  SearchOptions,
  SearchFilter,
  VectorSearchConfig,
  DEFAULT_VECTOR_SEARCH_CONFIG,
} from '@shared/types/vectorSearch';

const EMBEDDING_DIMENSION = 1024; // qwen3-embedding-0.6b dimension
const INDEX_VERSION = 1;

// Default patterns to always ignore (in addition to .gitignore)
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.claude',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'vendor',
  '.venv',
  'venv',
  '.env',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/**
 * Normalize file path to use forward slashes (cross-platform consistency)
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Check if a file path matches a glob pattern using proper glob semantics
 * Uses minimatch which correctly handles ** for recursive matching
 */
function matchesGlobPattern(filePath: string, pattern: string): boolean {
  // Normalize both to forward slashes
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);

  return minimatch(normalizedPath, normalizedPattern, {
    matchBase: true, // Allow pattern to match basename if no / in pattern
    dot: true, // Match dotfiles
  });
}

// Get vectors directory for a project
function getVectorsDir(projectId: string): string {
  const userDataPath = app?.getPath('userData') || process.env.APPDATA || '';
  return path.join(userDataPath, 'vectors', projectId);
}

export class VectorIndexService extends EventEmitter {
  private projectId: string;
  private projectPath: string;
  private config: VectorSearchConfig;
  private db: Database.Database | null = null;
  private llamaService: LlamaService;
  private isIndexing = false;
  private shouldCancel = false;
  private vectorsDir: string;
  private ignoreFilter: Ignore | null = null;

  constructor(projectId: string, projectPath: string, config?: Partial<VectorSearchConfig>) {
    super();
    this.projectId = projectId;
    this.projectPath = projectPath;
    this.config = {
      enabled: true,
      useReranking: true,
      rerankStrategy: 'embedding',
      useQueryExpansion: false,
      indexPatterns: ['**/*.md'],
      minimumScore: 0.05,
      ...config,
    };
    this.llamaService = getLlamaService();
    this.vectorsDir = getVectorsDir(projectId);
    this.loadIgnorePatterns();
  }

  /**
   * Load .gitignore patterns from the project root.
   * Combines with default ignore patterns for common build artifacts.
   */
  private loadIgnorePatterns(): void {
    this.ignoreFilter = ignore();

    // Add default patterns
    this.ignoreFilter.add(DEFAULT_IGNORE_PATTERNS);

    // Try to load .gitignore from project root
    const gitignorePath = path.join(this.projectPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        this.ignoreFilter.add(gitignoreContent);
        console.log(`[VectorIndex] Loaded .gitignore from ${gitignorePath}`);
      } catch (error) {
        console.warn(`[VectorIndex] Failed to read .gitignore:`, error);
      }
    }

    // Also check for .vectorignore for project-specific overrides
    const vectorignorePath = path.join(this.projectPath, '.vectorignore');
    if (fs.existsSync(vectorignorePath)) {
      try {
        const vectorignoreContent = fs.readFileSync(vectorignorePath, 'utf-8');
        this.ignoreFilter.add(vectorignoreContent);
        console.log(`[VectorIndex] Loaded .vectorignore from ${vectorignorePath}`);
      } catch (error) {
        console.warn(`[VectorIndex] Failed to read .vectorignore:`, error);
      }
    }
  }

  /**
   * Check if a file should be ignored based on .gitignore and default patterns.
   */
  private shouldIgnoreFile(relativePath: string): boolean {
    if (!this.ignoreFilter) return false;
    // Normalize path to use forward slashes for cross-platform consistency
    const normalizedPath = normalizePath(relativePath);
    return this.ignoreFilter.ignores(normalizedPath);
  }

  async initialize(): Promise<void> {
    // Ensure vectors directory exists
    if (!fs.existsSync(this.vectorsDir)) {
      fs.mkdirSync(this.vectorsDir, { recursive: true });
    }

    const dbPath = path.join(this.vectorsDir, 'index.db');
    this.db = new Database(dbPath);

    // Load sqlite-vec extension
    sqliteVec.load(this.db);

    // Create schema
    this.createSchema();

    // Satisfy async requirement
    await Promise.resolve();
  }

  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Main chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(file_path, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
      CREATE INDEX IF NOT EXISTS idx_chunks_file_hash ON chunks(file_hash);
    `);

    // FTS5 virtual table for BM25 search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content, file_path,
        content='chunks', content_rowid='rowid',
        tokenize='porter unicode61'
      );
    `);

    // Triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, content, file_path)
        VALUES (new.rowid, new.content, new.file_path);
      END;

      CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content, file_path)
        VALUES('delete', old.rowid, old.content, old.file_path);
      END;

      CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
        INSERT INTO chunks_fts(chunks_fts, rowid, content, file_path)
        VALUES('delete', old.rowid, old.content, old.file_path);
        INSERT INTO chunks_fts(rowid, content, file_path)
        VALUES (new.rowid, new.content, new.file_path);
      END;
    `);

    // Vector table using sqlite-vec
    // Check if existing table has different dimension and recreate if needed
    try {
      const existingStats = this.db
        .prepare('SELECT embedding_dimension FROM index_stats WHERE id = 1')
        .get() as { embedding_dimension: number } | undefined;
      if (
        existingStats?.embedding_dimension &&
        existingStats.embedding_dimension !== EMBEDDING_DIMENSION
      ) {
        console.log(
          `[VectorIndex] Dimension changed from ${existingStats.embedding_dimension} to ${EMBEDDING_DIMENSION}, recreating vector table...`
        );
        // Drop old vector table and related data
        this.db.exec(`
          DROP TABLE IF EXISTS chunk_embeddings;
          DELETE FROM chunks;
          DELETE FROM chunks_fts;
        `);
      }
    } catch {
      // Table doesn't exist yet, that's fine
    }

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings USING vec0(
        chunk_id TEXT PRIMARY KEY,
        embedding float[${EMBEDDING_DIMENSION}]
      );
    `);

    // Index statistics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        total_files INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        last_indexed_at INTEGER,
        embedding_model TEXT,
        embedding_dimension INTEGER,
        version INTEGER DEFAULT ${INDEX_VERSION}
      );

      INSERT OR IGNORE INTO index_stats (id) VALUES (1);
    `);
  }

  async indexProject(): Promise<IndexStats> {
    if (!this.db) await this.initialize();
    if (this.isIndexing) throw new Error('Indexing already in progress');

    this.isIndexing = true;
    this.shouldCancel = false;

    const startTime = Date.now();

    try {
      // Phase 1: Scanning files
      this.emitProgress({
        phase: 'scanning',
        filesProcessed: 0,
        totalFiles: 0,
        chunksProcessed: 0,
        totalChunks: 0,
        percentage: 0,
        startedAt: startTime,
      });

      // Find all matching files
      const files: string[] = [];
      for (const pattern of this.config.indexPatterns) {
        const matches = globSync(pattern, {
          cwd: this.projectPath,
          absolute: true,
          dot: false, // Don't match dotfiles by default
        });
        files.push(...matches);
      }

      // Remove duplicates and filter using .gitignore patterns
      const ignoredFiles: string[] = [];
      const uniqueFiles = [...new Set(files)].filter((filePath) => {
        const relativePath = path.relative(this.projectPath, filePath);
        const shouldIgnore = this.shouldIgnoreFile(relativePath);
        if (shouldIgnore) {
          ignoredFiles.push(relativePath);
        }
        return !shouldIgnore;
      });

      // Log summary of ignored files
      const claudeIgnored = ignoredFiles.filter((f) => f.startsWith('.claude'));
      console.log(
        `[VectorIndex] Found ${files.length} files, ${uniqueFiles.length} after filtering (ignored ${ignoredFiles.length}, ${claudeIgnored.length} from .claude/)`
      );
      if (claudeIgnored.length > 0) {
        console.log(
          `[VectorIndex] Ignored .claude files: ${claudeIgnored.slice(0, 5).join(', ')}${claudeIgnored.length > 5 ? '...' : ''}`
        );
      }

      if (this.shouldCancel) throw new Error('Indexing cancelled');

      // Phase 2: Chunking files
      this.emitProgress({
        phase: 'chunking',
        filesProcessed: 0,
        totalFiles: uniqueFiles.length,
        chunksProcessed: 0,
        totalChunks: 0,
        percentage: 5,
        startedAt: startTime,
      });

      const allChunks: Chunk[] = [];
      const existingHashes = this.getExistingFileHashes();

      for (let i = 0; i < uniqueFiles.length; i++) {
        if (this.shouldCancel) throw new Error('Indexing cancelled');

        const filePath = uniqueFiles[i];
        // Normalize to forward slashes for cross-platform consistency
        const relativePath = normalizePath(path.relative(this.projectPath, filePath));

        this.emitProgress({
          phase: 'chunking',
          currentFile: relativePath,
          filesProcessed: i,
          totalFiles: uniqueFiles.length,
          chunksProcessed: allChunks.length,
          totalChunks: 0,
          percentage: 5 + Math.round((i / uniqueFiles.length) * 20),
          startedAt: startTime,
        });

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const fileHash = calculateFileHash(content);

          // Skip if file hasn't changed
          if (existingHashes.get(relativePath) === fileHash) {
            continue;
          }

          // Remove old chunks for this file
          this.deleteChunksForFile(relativePath);

          // Create new chunks
          const chunks = chunkMarkdown(content, relativePath);
          allChunks.push(...chunks);
        } catch (error) {
          console.error(`Error processing ${filePath}:`, error);
        }
      }

      if (allChunks.length === 0) {
        // No changes needed
        const stats = this.getStats();
        this.emitProgress({
          phase: 'complete',
          filesProcessed: uniqueFiles.length,
          totalFiles: uniqueFiles.length,
          chunksProcessed: 0,
          totalChunks: 0,
          percentage: 100,
          startedAt: startTime,
        });
        return stats;
      }

      // Phase 3: Generating embeddings
      this.emitProgress({
        phase: 'embedding',
        filesProcessed: uniqueFiles.length,
        totalFiles: uniqueFiles.length,
        chunksProcessed: 0,
        totalChunks: allChunks.length,
        percentage: 25,
        startedAt: startTime,
      });

      // Ensure embedding model is loaded
      await this.llamaService.loadEmbeddingModel();

      // Generate embeddings in batches
      const batchSize = 10;
      const chunksWithEmbeddings: { chunk: Chunk; embedding: number[] }[] = [];

      for (let i = 0; i < allChunks.length; i += batchSize) {
        if (this.shouldCancel) throw new Error('Indexing cancelled');

        const batch = allChunks.slice(i, i + batchSize);
        const texts = batch.map((c) => c.content);
        const embeddings = await this.llamaService.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          chunksWithEmbeddings.push({
            chunk: batch[j],
            embedding: embeddings[j],
          });
        }

        this.emitProgress({
          phase: 'embedding',
          filesProcessed: uniqueFiles.length,
          totalFiles: uniqueFiles.length,
          chunksProcessed: chunksWithEmbeddings.length,
          totalChunks: allChunks.length,
          percentage: 25 + Math.round((chunksWithEmbeddings.length / allChunks.length) * 50),
          startedAt: startTime,
        });
      }

      // Phase 4: Storing in database
      this.emitProgress({
        phase: 'storing',
        filesProcessed: uniqueFiles.length,
        totalFiles: uniqueFiles.length,
        chunksProcessed: chunksWithEmbeddings.length,
        totalChunks: allChunks.length,
        percentage: 75,
        startedAt: startTime,
      });

      // Insert chunks and embeddings in a transaction
      const insertChunk = this.db!.prepare(`
        INSERT OR REPLACE INTO chunks (id, file_path, file_hash, chunk_index, content, start_line, end_line, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertEmbedding = this.db!.prepare(`
        INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding)
        VALUES (?, ?)
      `);

      const transaction = this.db!.transaction(() => {
        for (const { chunk, embedding } of chunksWithEmbeddings) {
          insertChunk.run(
            chunk.id,
            chunk.filePath,
            chunk.fileHash,
            chunk.chunkIndex,
            chunk.content,
            chunk.startLine,
            chunk.endLine,
            JSON.stringify(chunk.metadata),
            chunk.createdAt
          );

          // Convert embedding to float32 buffer for sqlite-vec
          const buffer = new Float32Array(embedding).buffer;
          insertEmbedding.run(chunk.id, Buffer.from(buffer));
        }

        // Update stats
        const totalChunks = this.db!.prepare('SELECT COUNT(*) as count FROM chunks').get() as {
          count: number;
        };
        const totalFiles = this.db!.prepare(
          'SELECT COUNT(DISTINCT file_path) as count FROM chunks'
        ).get() as { count: number };

        this.db!.prepare(
          `
          UPDATE index_stats SET
            total_files = ?,
            total_chunks = ?,
            last_indexed_at = ?,
            embedding_model = ?,
            embedding_dimension = ?,
            version = ?
          WHERE id = 1
        `
        ).run(
          totalFiles.count,
          totalChunks.count,
          Date.now(),
          'qwen3-embedding-0.6b',
          EMBEDDING_DIMENSION,
          INDEX_VERSION
        );
      });

      transaction();

      const stats = this.getStats();

      this.emitProgress({
        phase: 'complete',
        filesProcessed: uniqueFiles.length,
        totalFiles: uniqueFiles.length,
        chunksProcessed: chunksWithEmbeddings.length,
        totalChunks: allChunks.length,
        percentage: 100,
        startedAt: startTime,
      });

      // Install semantic-search skill to the project
      this.installSemanticSearchSkill().catch((error) => {
        console.error('[VectorIndex] Failed to install semantic-search skill:', error);
      });

      return stats;
    } catch (error) {
      this.emitProgress({
        phase: 'error',
        filesProcessed: 0,
        totalFiles: 0,
        chunksProcessed: 0,
        totalChunks: 0,
        percentage: 0,
        error: (error as Error).message,
        startedAt: startTime,
      });
      throw error;
    } finally {
      this.isIndexing = false;
    }
  }

  cancelIndexing(): void {
    this.shouldCancel = true;
  }

  /**
   * Clear all indexed data to force a fresh re-index.
   * This is useful when the index format has changed (e.g., path normalization).
   */
  async clearIndex(): Promise<void> {
    if (!this.db) await this.initialize();
    if (this.isIndexing) throw new Error('Cannot clear index while indexing is in progress');

    // Delete all data from tables
    this.db!.exec(`
      DELETE FROM chunk_embeddings;
      DELETE FROM chunks;
      UPDATE index_stats SET total_files = 0, total_chunks = 0, last_indexed_at = NULL;
    `);

    console.log(`[VectorIndex] Index cleared for project ${this.projectId}`);
  }

  async searchBM25(
    query: string,
    limit: number = 20,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.db) await this.initialize();

    // Escape query for FTS5: wrap each word in quotes to prevent
    // words like "process", "and", "or", "not" from being interpreted as operators/columns
    const escapedQuery = query
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => `"${word.replace(/"/g, '""')}"`) // Escape internal quotes
      .join(' ');

    // Request more results if filtering (to compensate for post-query filtering)
    const requestLimit = filter?.filePath ? limit * 5 : limit;

    const sql = `
      SELECT
        c.id, c.file_path, c.file_hash, c.chunk_index, c.content,
        c.start_line, c.end_line, c.metadata, c.created_at,
        bm25(chunks_fts) as score
      FROM chunks_fts f
      JOIN chunks c ON f.rowid = c.rowid
      WHERE chunks_fts MATCH ?
      ORDER BY score LIMIT ?
    `;

    const rows = this.db!.prepare(sql).all(escapedQuery, requestLimit) as Array<{
      id: string;
      file_path: string;
      file_hash: string;
      chunk_index: number;
      content: string;
      start_line: number;
      end_line: number;
      metadata: string;
      created_at: number;
      score: number;
    }>;

    // Filter by file path pattern using proper glob semantics (minimatch)
    let filteredRows = rows;
    if (filter?.filePath) {
      filteredRows = rows.filter((row) => matchesGlobPattern(row.file_path, filter.filePath!));
    }

    return filteredRows.slice(0, limit).map((row) => ({
      chunk: {
        id: row.id,
        filePath: row.file_path,
        fileHash: row.file_hash,
        chunkIndex: row.chunk_index,
        content: row.content,
        startLine: row.start_line,
        endLine: row.end_line,
        metadata: JSON.parse(row.metadata),
        createdAt: row.created_at,
      },
      score: -row.score, // BM25 returns negative scores, invert for consistency
      bm25Score: -row.score,
    }));
  }

  async searchVector(
    queryEmbedding: number[],
    limit: number = 20,
    filter?: SearchFilter
  ): Promise<SearchResult[]> {
    if (!this.db) await this.initialize();

    // Convert query embedding to buffer for sqlite-vec
    const queryBuffer = Buffer.from(new Float32Array(queryEmbedding).buffer);

    // Request more results if filtering (to compensate for post-query filtering)
    const requestLimit = filter?.filePath ? limit * 5 : limit;

    // Vector search using sqlite-vec
    const sql = `
      WITH knn_matches AS (
        SELECT chunk_id, distance
        FROM chunk_embeddings
        WHERE embedding MATCH ?
          AND k = ?
      )
      SELECT
        c.id, c.file_path, c.file_hash, c.chunk_index, c.content,
        c.start_line, c.end_line, c.metadata, c.created_at,
        knn.distance
      FROM knn_matches knn
      LEFT JOIN chunks c ON c.id = knn.chunk_id
    `;

    const rows = this.db!.prepare(sql).all(queryBuffer, requestLimit) as Array<{
      id: string;
      file_path: string;
      file_hash: string;
      chunk_index: number;
      content: string;
      start_line: number;
      end_line: number;
      metadata: string;
      created_at: number;
      distance: number;
    }>;

    // Filter by file path pattern using proper glob semantics (minimatch)
    let filteredRows = rows;
    if (filter?.filePath) {
      filteredRows = rows.filter((row) => matchesGlobPattern(row.file_path, filter.filePath!));
    }

    return filteredRows.slice(0, limit).map((row) => ({
      chunk: {
        id: row.id,
        filePath: row.file_path,
        fileHash: row.file_hash,
        chunkIndex: row.chunk_index,
        content: row.content,
        startLine: row.start_line,
        endLine: row.end_line,
        metadata: JSON.parse(row.metadata),
        createdAt: row.created_at,
      },
      score: 1 - row.distance, // Convert distance to similarity
      vectorScore: 1 - row.distance,
    }));
  }

  getStats(): IndexStats {
    if (!this.db) {
      return {
        totalFiles: 0,
        totalChunks: 0,
        embeddingModel: 'qwen3-embedding-0.6b',
        embeddingDimension: EMBEDDING_DIMENSION,
        lastIndexedAt: null,
        indexVersion: INDEX_VERSION,
        databaseSizeBytes: 0,
      };
    }

    const stats = this.db.prepare('SELECT * FROM index_stats WHERE id = 1').get() as {
      total_files: number;
      total_chunks: number;
      last_indexed_at: number | null;
      embedding_model: string;
      embedding_dimension: number;
      version: number;
    };

    const dbPath = path.join(this.vectorsDir, 'index.db');
    const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    return {
      totalFiles: stats?.total_files || 0,
      totalChunks: stats?.total_chunks || 0,
      embeddingModel: stats?.embedding_model || 'qwen3-embedding-0.6b',
      embeddingDimension: stats?.embedding_dimension || EMBEDDING_DIMENSION,
      lastIndexedAt: stats?.last_indexed_at || null,
      indexVersion: stats?.version || INDEX_VERSION,
      databaseSizeBytes: dbSize,
    };
  }

  hasIndex(): boolean {
    const dbPath = path.join(this.vectorsDir, 'index.db');
    if (!fs.existsSync(dbPath)) return false;

    const stats = this.getStats();
    return stats.totalChunks > 0;
  }

  private getExistingFileHashes(): Map<string, string> {
    if (!this.db) return new Map();

    const rows = this.db
      .prepare('SELECT DISTINCT file_path, file_hash FROM chunks')
      .all() as Array<{ file_path: string; file_hash: string }>;

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.file_path, row.file_hash);
    }
    return map;
  }

  private deleteChunksForFile(filePath: string): void {
    if (!this.db) return;

    // Get chunk IDs first for embedding deletion
    const chunks = this.db
      .prepare('SELECT id FROM chunks WHERE file_path = ?')
      .all(filePath) as Array<{ id: string }>;

    // Delete embeddings
    const deleteEmbedding = this.db.prepare('DELETE FROM chunk_embeddings WHERE chunk_id = ?');
    for (const chunk of chunks) {
      deleteEmbedding.run(chunk.id);
    }

    // Delete chunks (FTS will be updated via trigger)
    this.db.prepare('DELETE FROM chunks WHERE file_path = ?').run(filePath);
  }

  private emitProgress(progress: IndexProgress): void {
    this.emit('indexProgress', this.projectId, progress);
  }

  /**
   * Install the semantic-search skill to the project
   * This makes the skill available to Claude instances via /semantic-search
   */
  private async installSemanticSearchSkill(): Promise<void> {
    try {
      const skillManager = getSkillManager();
      const result = await skillManager.installSkills(this.projectPath, ['semantic-search']);

      if (result.success) {
        console.log(`[VectorIndex] Installed semantic-search skill to ${this.projectPath}`);
      } else if (result.errors.length > 0) {
        console.warn('[VectorIndex] Skill installation warnings:', result.errors);
      }

      // Also install the semantic-searcher agent
      this.installSemanticSearcherAgent();
    } catch (error) {
      console.error('[VectorIndex] Failed to install semantic-search skill:', error);
    }
  }

  /**
   * Install the semantic-searcher agent to the project
   * This agent can be spawned by the main agent to perform searches
   */
  private installSemanticSearcherAgent(): void {
    try {
      const agentsDir = path.join(this.projectPath, '.claude', 'agents');

      // Create agents directory if it doesn't exist
      if (!fs.existsSync(agentsDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
      }

      const agentContent = `---
name: semantic-searcher
model: haiku
description: Performs semantic searches on project documentation and returns formatted results
allowed_tools:
  - mcp__orchestra__semantic_search
  - mcp__orchestra__search_index_status
---

# Semantic Searcher Agent

You search project documentation and return relevant results.

## Quick Reference (Just Use This)

\`\`\`
semantic_search({
  query: "your query in English",
  limit: 10
})
\`\`\`

The defaults are optimized. Reranking is ON by default (~400ms, 8/10 quality).

## Performance Reference

| Mode | Time | Quality | Use When |
|------|------|---------|----------|
| With reranking (default) | ~400ms | 8/10 | Most searches |
| Without reranking | ~40ms | 5/10 | Quick lookups |
| With query expansion | ~1.5s | 9/10 | Complex concepts |

## IMPORTANT: Language Requirement

**ALWAYS write queries in English.** The embedding model is optimized for English.
If the task is in another language, translate search terms to English first.

## Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| query | required | Natural language, in English |
| limit | 5 | Use 10 for broader searches |
| useReranking | true | Keep ON - significantly improves relevance |
| useQueryExpansion | false | Only for complex conceptual queries |

## When to Adjust

| Situation | Action |
|-----------|--------|
| Need faster results | Add \`useReranking: false\` (~40ms) |
| Need more precision | Use defaults (reranking already on) |
| Zero results | Rephrase query in English |
| Complex concepts | Add \`useQueryExpansion: true\` (~1.5s) |

## Output Format

\`\`\`
## Search Results for: "<query>"

Found X relevant documents.

### 1. <file_path> (lines X-Y)
**Score:** 0.XX

<content snippet>

---
\`\`\`

## Important Rules

1. **Use English queries** - other languages give poor results
2. **Keep reranking ON** - improves first result relevance significantly
3. **Don't specify rerankStrategy** - the default (embedding) is optimal
4. **Always include file paths and line numbers** for navigation
5. **Read-only** - never make file changes

## Example

Task: "Busca documentación sobre autenticación" (Spanish)

1. Translate to English: "authentication"
2. Execute: \`semantic_search({ query: "user authentication flow", limit: 10 })\`
3. Format results with file paths, line numbers, snippets
4. Return formatted results

You are fast, focused, and efficient. Search and report.
`;

      const agentPath = path.join(agentsDir, 'semantic-searcher.md');
      fs.writeFileSync(agentPath, agentContent, 'utf-8');

      console.log(`[VectorIndex] Installed semantic-searcher agent to ${agentPath}`);
    } catch (error) {
      console.error('[VectorIndex] Failed to install semantic-searcher agent:', error);
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Update the configuration for this index service.
   * Used when project settings change (e.g., indexPatterns).
   */
  updateConfig(config: Partial<VectorSearchConfig>): void {
    const newConfig: VectorSearchConfig = {
      enabled: config.enabled ?? this.config.enabled,
      useReranking: config.useReranking ?? this.config.useReranking,
      rerankStrategy: config.rerankStrategy ?? this.config.rerankStrategy,
      useQueryExpansion: config.useQueryExpansion ?? this.config.useQueryExpansion,
      indexPatterns: config.indexPatterns ?? this.config.indexPatterns,
      minimumScore: config.minimumScore ?? this.config.minimumScore,
    };

    // Check if indexPatterns changed - need to reload ignore patterns
    const patternsChanged =
      JSON.stringify(this.config.indexPatterns) !== JSON.stringify(newConfig.indexPatterns);

    this.config = newConfig;

    if (patternsChanged) {
      console.log(`[VectorIndex] Index patterns changed to: ${newConfig.indexPatterns.join(', ')}`);
      // Reload ignore patterns in case project gitignore changed too
      this.loadIgnorePatterns();
    }
  }

  getConfig(): VectorSearchConfig {
    return { ...this.config };
  }
}

// Cache of index services by project ID
const indexServices = new Map<string, VectorIndexService>();

export function getVectorIndexService(
  projectId: string,
  projectPath: string,
  config?: Partial<VectorSearchConfig>
): VectorIndexService {
  let service = indexServices.get(projectId);
  if (!service) {
    service = new VectorIndexService(projectId, projectPath, config);
    indexServices.set(projectId, service);
  } else if (config) {
    // Update config if service already exists
    service.updateConfig(config);
  }
  return service;
}

export function closeVectorIndexService(projectId: string): void {
  const service = indexServices.get(projectId);
  if (service) {
    service.close();
    indexServices.delete(projectId);
  }
}
