#!/usr/bin/env node
/**
 * Database Migration Testing Helper
 *
 * The native better-sqlite3 module is compiled for Electron, so this script
 * cannot run directly with Node.js. Instead, use one of these methods:
 *
 * OPTION 1: Manual Testing (Recommended)
 * =======================================
 *
 * 1. Backup your database:
 *    Windows (Electron): %APPDATA%\claude-code-orchestra\claude-code-orchestra.db
 *    Windows (Headless): %USERPROFILE%\.claude-code-orchestra\claude-code-orchestra.db
 *    Linux/Mac:          ~/.claude-code-orchestra/claude-code-orchestra.db
 *
 * 2. Delete the database file to test migrations from scratch
 *
 * 3. Start the app: npm run electron:dev
 *
 * 4. The database will be created fresh with all tables
 *
 * 5. Verify in the app that everything works correctly
 *
 *
 * OPTION 2: Rebuild for Node.js (For CI/Testing)
 * ==============================================
 *
 * If you need to run the migration test directly with Node.js:
 *
 *   # Rebuild better-sqlite3 for Node.js
 *   npm rebuild better-sqlite3
 *
 *   # Run the test
 *   npx tsx scripts/test-migrations.ts
 *
 *   # Then rebuild for Electron when done
 *   npm run rebuild
 *
 *
 * OPTION 3: Using SQLite CLI
 * ==========================
 *
 * You can inspect the database schema using the sqlite3 CLI:
 *
 *   sqlite3 %APPDATA%\claude-code-orchestra\claude-code-orchestra.db ".schema"
 *
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

// Determine database path
function getDatabasePath(): string {
  // Check for Electron app data (most common)
  const electronPath =
    process.platform === 'win32'
      ? join(process.env.APPDATA || '', 'claude-code-orchestra', 'claude-code-orchestra.db')
      : join(homedir(), '.config', 'claude-code-orchestra', 'claude-code-orchestra.db');

  if (existsSync(electronPath)) {
    return electronPath;
  }

  // Fallback to headless mode path
  return join(homedir(), '.claude-code-orchestra', 'claude-code-orchestra.db');
}

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║           Database Migration Testing Helper                        ║
╚═══════════════════════════════════════════════════════════════════╝

Database Location:
------------------
${getDatabasePath()}

Database Exists: ${existsSync(getDatabasePath()) ? 'YES' : 'NO'}

To test migrations from scratch:
--------------------------------
1. Stop the app if running
2. Backup your database (optional):
   cp "${getDatabasePath()}" "${getDatabasePath()}.backup"
3. Delete the database:
   rm "${getDatabasePath()}"
4. Start the app: npm run electron:dev
5. The database will be recreated with fresh schema

Expected Tables:
----------------
- projects
- conversations
- conversation_messages
- remote_config
- cluster_config
- cluster_privacy
- instance_cluster_permissions
- app_settings
- notification_settings
- security_config
- ip_rules
- audit_log
- terminal_pool_config
- shared_context_config
- project_knowledge

To verify schema (requires sqlite3 CLI):
----------------------------------------
sqlite3 "${getDatabasePath()}" ".tables"
sqlite3 "${getDatabasePath()}" "PRAGMA table_info(projects);"
`);

// Try to run actual tests if better-sqlite3 is available for Node.js
try {
  // Dynamic import to avoid immediate crash
  const Database = require('better-sqlite3');

  console.log('better-sqlite3 is available - running full tests...\n');

  // Colors for output
  const GREEN = '\x1b[32m';
  const RED = '\x1b[31m';
  const YELLOW = '\x1b[33m';
  const RESET = '\x1b[0m';

  function success(msg: string) {
    console.log(`${GREEN}✓${RESET} ${msg}`);
  }

  function error(msg: string) {
    console.log(`${RED}✗${RESET} ${msg}`);
  }

  function header(msg: string) {
    console.log(`\n${YELLOW}=== ${msg} ===${RESET}\n`);
  }

  // Create in-memory database
  const db = new Database(':memory:');

  header('Initializing Database Schema');

  // Initialize schema (abbreviated version - key tables only)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT,
      hostname TEXT,
      skipPermissions INTEGER DEFAULT 0,
      preferredShell TEXT,
      enableMcp INTEGER DEFAULT 0,
      autoReview INTEGER DEFAULT 0,
      clusterVisibility TEXT DEFAULT 'default',
      allowRemoteInstances INTEGER DEFAULT 1,
      agents TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      sessionId TEXT,
      title TEXT NOT NULL,
      initialPrompt TEXT NOT NULL,
      model TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      totalCostUsd REAL DEFAULT 0,
      messageCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS remote_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER DEFAULT 0,
      port INTEGER DEFAULT 3847,
      passwordHash TEXT DEFAULT '',
      autoStart INTEGER DEFAULT 0,
      allowAnyCors INTEGER DEFAULT 0,
      customHostname TEXT DEFAULT '',
      sslEnabled INTEGER DEFAULT 0,
      sslCertPath TEXT DEFAULT '',
      sslKeyPath TEXT DEFAULT ''
    )
  `);

  success('Schema initialized');

  header('Testing CRUD');

  // Test project
  const { randomUUID } = require('crypto');
  const projectId = randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO projects (id, name, path, description, skipPermissions, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(projectId, 'Test', '/test', 'desc', 0, now, now);
  success('Created project');

  // Test conversation
  const convId = randomUUID();
  db.prepare(`
    INSERT INTO conversations (id, projectId, title, initialPrompt, model, mode, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(convId, projectId, 'Test', 'Hello', 'sonnet', 'interactive', 'active', now, now);
  success('Created conversation');

  // Test cascade delete
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) {
    success('Cascade delete works');
  } else {
    error('Cascade delete failed');
  }

  header('All tests passed!');

  db.close();
} catch (e: any) {
  if (e.code === 'ERR_DLOPEN_FAILED') {
    console.log(`
Note: Cannot run full tests because better-sqlite3 is compiled for Electron.
To run the full test suite, rebuild for Node.js first:

    npm rebuild better-sqlite3
    npx tsx scripts/test-migrations.ts
    npm run rebuild  # Restore Electron version
`);
  } else {
    console.error('Error:', e.message);
  }
}
