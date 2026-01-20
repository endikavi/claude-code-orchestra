#!/usr/bin/env node
/**
 * Claude Code Orchestra - Headless/Server-Only Mode
 *
 * CLI entry point for running the web server and cluster without Electron UI.
 * Useful for server deployments, Docker containers, and headless environments.
 *
 * Usage:
 *   npx claude-orchestra --port 3847 --password mySecret
 *   npx claude-orchestra --config ./orchestra.config.json
 *   npx claude-orchestra --cluster-role primary --shared-secret clusterKey
 */

import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { hashSync } from 'bcryptjs';

import { CliArgs, HeadlessConfig, mergeConfig, validateConfig, printConfigSummary } from './config';
import { setUserDataPath } from '../utils/pathProvider';

// Package info - will be loaded from package.json
const pkg = { name: 'claude-code-orchestra', version: '0.1.0-beta.2' };

// Services will be loaded after path setup
let DataStore: typeof import('../services/DataStore').DataStore;
let getWebServer: typeof import('../services/WebServer').getWebServer;
let getClusterManager: typeof import('../services/ClusterManager').getClusterManager;
let getProcessManager: typeof import('../services/ProcessManager').getProcessManager;

/**
 * Initialize the data directory
 */
function initializeDataDir(dataDir: string): void {
  if (!existsSync(dataDir)) {
    console.log(`[CLI] Creating data directory: ${dataDir}`);
    mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Load services dynamically after path setup
 */
async function loadServices(): Promise<void> {
  const dataStoreModule = await import('../services/DataStore');
  const webServerModule = await import('../services/WebServer');
  const clusterManagerModule = await import('../services/ClusterManager');
  const processManagerModule = await import('../services/ProcessManager');

  DataStore = dataStoreModule.DataStore;
  getWebServer = webServerModule.getWebServer;
  getClusterManager = clusterManagerModule.getClusterManager;
  getProcessManager = processManagerModule.getProcessManager;
}

/**
 * Apply configuration to services
 */
function applyConfiguration(config: HeadlessConfig): void {
  const dataStore = DataStore.getInstance();

  // Configure remote access if password is set
  if (config.server.password) {
    const passwordHash = hashSync(config.server.password, 10);
    dataStore.updateRemoteConfig({
      enabled: true,
      port: config.server.port,
      passwordHash,
      allowAnyCors: config.server.allowAnyCors,
    });
    console.log('[CLI] Remote access configured with password protection');
  } else {
    dataStore.updateRemoteConfig({
      enabled: true,
      port: config.server.port,
      allowAnyCors: config.server.allowAnyCors,
    });
    console.log('[CLI] Remote access enabled (no password - local access only recommended)');
  }

  // Configure cluster if not standalone
  if (config.cluster.role !== 'standalone') {
    dataStore.updateClusterConfig({
      enabled: true,
      role: config.cluster.role,
      nodeName: config.cluster.nodeName,
      primaryHost: config.cluster.primaryHost,
      primaryPort: config.cluster.primaryPort,
      sharedSecret: config.cluster.sharedSecret,
    });
    console.log(`[CLI] Cluster mode configured as ${config.cluster.role}`);
  }
}

/**
 * Start the web server
 */
async function startWebServer(port: number): Promise<void> {
  const webServer = getWebServer();

  try {
    await webServer.start(port);
    const status = webServer.getStatus();
    console.log(`\n[CLI] Web server started successfully!`);
    console.log(`[CLI] Local URL: http://localhost:${port}`);
    if (status.localIp) {
      console.log(`[CLI] Network URL: http://${status.localIp}:${port}`);
    }
    console.log(`[CLI] Health check: http://localhost:${port}/api/health`);
  } catch (error) {
    throw new Error(
      `Failed to start web server: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Start cluster mode if configured
 */
async function startCluster(config: HeadlessConfig): Promise<void> {
  if (config.cluster.role === 'standalone') {
    return;
  }

  const clusterManager = getClusterManager();

  try {
    await clusterManager.start();
    const status = clusterManager.getStatus();
    console.log(`[CLI] Cluster started as ${config.cluster.role}`);
    console.log(`[CLI] Cluster node ID: ${status.localNodeId}`);
    console.log(`[CLI] Cluster connected: ${status.connected}`);
  } catch (error) {
    console.error(
      `[CLI] Cluster start error: ${error instanceof Error ? error.message : String(error)}`
    );
    // Don't throw - cluster failure shouldn't stop the server
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[CLI] Received ${signal}, shutting down gracefully...`);

  try {
    // Stop cluster first
    const clusterManager = getClusterManager();
    await clusterManager.stop();
    console.log('[CLI] Cluster stopped');

    // Kill all running instances
    const processManager = getProcessManager();
    processManager.killAll();
    console.log('[CLI] All instances terminated');

    // Stop web server
    const webServer = getWebServer();
    await webServer.stop();
    console.log('[CLI] Web server stopped');

    console.log('[CLI] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[CLI] Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('claude-orchestra')
    .description('Claude Code Orchestra - Headless/Server-Only Mode')
    .version(pkg.version)
    .option('-p, --port <number>', 'Web server port', (val) => parseInt(val, 10))
    .option('--password <string>', 'Access password (will be hashed)')
    .option(
      '--cluster-role <role>',
      'Cluster role: standalone, primary, or secondary',
      'standalone'
    )
    .option('--primary-host <host>', 'Primary node host (for secondary mode)')
    .option('--primary-port <number>', 'Primary node port', (val) => parseInt(val, 10))
    .option('--shared-secret <string>', 'Cluster shared secret')
    .option('--node-name <string>', 'Name for this node in the cluster')
    .option('--data-dir <path>', 'Data directory path')
    .option('--config <path>', 'Path to configuration JSON file')
    .option('--allow-any-cors', 'Allow any CORS origin (use with caution)')
    .parse(process.argv);

  const options = program.opts<CliArgs>();

  console.log('Starting Claude Code Orchestra in headless mode...\n');

  try {
    // Merge configuration from all sources
    const config: HeadlessConfig = mergeConfig(options);

    // Validate configuration
    validateConfig(config);

    // Print configuration summary
    printConfigSummary(config);

    // Initialize data directory
    initializeDataDir(config.paths.dataDir);

    // Set the user data path for headless mode (MUST be done before loading services)
    setUserDataPath(config.paths.dataDir);

    // Load services dynamically after path setup
    await loadServices();

    // Apply configuration to services
    applyConfiguration(config);

    // Setup signal handlers for graceful shutdown
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    // SIGHUP doesn't exist on Windows, only register on Unix-like systems
    if (process.platform !== 'win32') {
      process.on('SIGHUP', () => void shutdown('SIGHUP'));
    }

    // Start the web server
    await startWebServer(config.server.port);

    // Start cluster if configured
    await startCluster(config);

    console.log('\n[CLI] Orchestra is ready! Press Ctrl+C to stop.\n');
  } catch (error) {
    console.error('\n[CLI] Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the CLI
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
