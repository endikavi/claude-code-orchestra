/**
 * Path Provider - Abstracts user data path for headless and Electron modes
 *
 * This module provides a centralized way to get the user data directory,
 * allowing the CLI to run without Electron by setting a custom path.
 */

import { join } from 'path';
import { homedir } from 'os';

// Custom user data path for headless mode
let customUserDataPath: string | null = null;

// Flag to track if we're in headless mode
let headlessMode = false;

/**
 * Set the user data path for headless mode
 * Must be called before any path-dependent services are initialized
 */
export function setUserDataPath(path: string): void {
  customUserDataPath = path;
  headlessMode = true;
}

/**
 * Check if running in headless (non-Electron) mode
 */
export function isHeadlessMode(): boolean {
  return headlessMode;
}

/**
 * Get the default user data path for headless mode
 * Uses ~/.claude-code-orchestra on all platforms
 */
export function getDefaultHeadlessDataPath(): string {
  return join(homedir(), '.claude-code-orchestra');
}

/**
 * Get the user data path
 * Returns custom path if set (headless mode), otherwise uses Electron's app.getPath
 */
export function getUserDataPath(): string {
  if (customUserDataPath) {
    return customUserDataPath;
  }

  if (headlessMode) {
    return getDefaultHeadlessDataPath();
  }

  // In Electron mode, dynamically import to avoid errors in headless
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    return app.getPath('userData');
  } catch {
    // Fallback if Electron is not available
    console.warn('[PathProvider] Electron not available, using default headless path');
    return getDefaultHeadlessDataPath();
  }
}

/**
 * Check if Electron is available
 */
export function isElectronAvailable(): boolean {
  if (headlessMode) {
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    return !!electron.app;
  } catch {
    return false;
  }
}
