/**
 * CLI Configuration Module
 *
 * Handles loading and merging configuration from:
 * 1. CLI arguments (highest priority)
 * 2. Configuration file (JSON)
 * 3. Default values (lowest priority)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir, hostname } from 'os';

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number;
  password?: string;
  allowAnyCors: boolean;
}

/**
 * Cluster configuration
 */
export interface ClusterConfig {
  role: 'standalone' | 'primary' | 'secondary';
  nodeName: string;
  primaryHost?: string;
  primaryPort: number;
  sharedSecret?: string;
}

/**
 * Path configuration
 */
export interface PathsConfig {
  dataDir: string;
}

/**
 * Complete headless configuration
 */
export interface HeadlessConfig {
  server: ServerConfig;
  cluster: ClusterConfig;
  paths: PathsConfig;
}

/**
 * CLI arguments interface (from Commander.js)
 */
export interface CliArgs {
  port?: number;
  password?: string;
  clusterRole?: 'standalone' | 'primary' | 'secondary';
  primaryHost?: string;
  primaryPort?: number;
  sharedSecret?: string;
  nodeName?: string;
  dataDir?: string;
  config?: string;
  allowAnyCors?: boolean;
  tui?: boolean;
}

/**
 * Get the default data directory for headless mode
 */
export function getDefaultDataDir(): string {
  return join(homedir(), '.claude-code-orchestra');
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): HeadlessConfig {
  return {
    server: {
      port: 3847,
      allowAnyCors: false,
    },
    cluster: {
      role: 'standalone',
      nodeName: hostname() || 'orchestra-node',
      primaryPort: 3848,
    },
    paths: {
      dataDir: getDefaultDataDir(),
    },
  };
}

/**
 * Load configuration from a JSON file
 */
export function loadConfigFile(configPath: string): Partial<HeadlessConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as Partial<HeadlessConfig>;
    console.log(`[Config] Loaded configuration from ${configPath}`);
    return config;
  } catch (error) {
    throw new Error(
      `Failed to parse configuration file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Merge configurations with priority: CLI args > config file > defaults
 */
export function mergeConfig(cliArgs: CliArgs): HeadlessConfig {
  const defaults = getDefaultConfig();
  let fileConfig: Partial<HeadlessConfig> = {};

  // Load config file if specified
  if (cliArgs.config) {
    fileConfig = loadConfigFile(cliArgs.config);
  }

  // Merge server configuration
  const server: ServerConfig = {
    port: cliArgs.port ?? fileConfig.server?.port ?? defaults.server.port,
    password: cliArgs.password ?? fileConfig.server?.password,
    allowAnyCors:
      cliArgs.allowAnyCors ?? fileConfig.server?.allowAnyCors ?? defaults.server.allowAnyCors,
  };

  // Merge cluster configuration
  const cluster: ClusterConfig = {
    role: cliArgs.clusterRole ?? fileConfig.cluster?.role ?? defaults.cluster.role,
    nodeName: cliArgs.nodeName ?? fileConfig.cluster?.nodeName ?? defaults.cluster.nodeName,
    primaryHost: cliArgs.primaryHost ?? fileConfig.cluster?.primaryHost,
    primaryPort:
      cliArgs.primaryPort ?? fileConfig.cluster?.primaryPort ?? defaults.cluster.primaryPort,
    sharedSecret: cliArgs.sharedSecret ?? fileConfig.cluster?.sharedSecret,
  };

  // Merge paths configuration
  const paths: PathsConfig = {
    dataDir: cliArgs.dataDir ?? fileConfig.paths?.dataDir ?? defaults.paths.dataDir,
  };

  return { server, cluster, paths };
}

/**
 * Validate the configuration
 */
export function validateConfig(config: HeadlessConfig): void {
  // Validate port
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Server port must be between 1 and 65535');
  }

  // Validate cluster role
  if (!['standalone', 'primary', 'secondary'].includes(config.cluster.role)) {
    throw new Error('Cluster role must be standalone, primary, or secondary');
  }

  // Validate secondary mode requires primary host
  if (config.cluster.role === 'secondary') {
    if (!config.cluster.primaryHost) {
      throw new Error('Secondary mode requires --primary-host');
    }
    if (!config.cluster.sharedSecret) {
      throw new Error('Secondary mode requires --shared-secret');
    }
  }

  // Validate primary mode requires shared secret
  if (config.cluster.role === 'primary') {
    if (!config.cluster.sharedSecret) {
      throw new Error('Primary mode requires --shared-secret');
    }
  }

  // Validate primary port
  if (config.cluster.primaryPort < 1 || config.cluster.primaryPort > 65535) {
    throw new Error('Primary port must be between 1 and 65535');
  }
}

/**
 * Print configuration summary to console
 */
export function printConfigSummary(config: HeadlessConfig): void {
  console.log('\n========================================');
  console.log('  Claude Code Orchestra - Headless Mode');
  console.log('========================================\n');

  console.log('Server Configuration:');
  console.log(`  Port: ${config.server.port}`);
  console.log(`  Password: ${config.server.password ? '(set)' : '(not set)'}`);
  console.log(`  Allow Any CORS: ${config.server.allowAnyCors}`);

  console.log('\nCluster Configuration:');
  console.log(`  Role: ${config.cluster.role}`);
  console.log(`  Node Name: ${config.cluster.nodeName}`);
  if (config.cluster.role === 'secondary') {
    console.log(`  Primary Host: ${config.cluster.primaryHost}`);
    console.log(`  Primary Port: ${config.cluster.primaryPort}`);
  }
  if (config.cluster.role === 'primary') {
    console.log(`  Cluster Port: ${config.cluster.primaryPort}`);
  }
  console.log(`  Shared Secret: ${config.cluster.sharedSecret ? '(set)' : '(not set)'}`);

  console.log('\nPaths:');
  console.log(`  Data Directory: ${config.paths.dataDir}`);
  console.log('');
}
