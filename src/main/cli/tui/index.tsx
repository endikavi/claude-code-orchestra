/**
 * TUI Entry Point
 *
 * Initializes and renders the TUI application using Ink.
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import type { HeadlessConfig } from '../config.js';

// Services will be loaded from the main CLI
let DataStore: typeof import('../../services/DataStore.js').DataStore;
let getProcessManager: typeof import('../../services/ProcessManager.js').getProcessManager;

/**
 * Load services dynamically
 */
async function loadTuiServices(): Promise<void> {
  const dataStoreModule = await import('../../services/DataStore.js');
  const processManagerModule = await import('../../services/ProcessManager.js');

  DataStore = dataStoreModule.DataStore;
  getProcessManager = processManagerModule.getProcessManager;
}

/**
 * Start the TUI application
 */
export async function startTUI(config: HeadlessConfig): Promise<void> {
  console.log('[TUI] Starting interactive TUI mode...\n');

  try {
    // Load services
    await loadTuiServices();

    // Verify services are available
    const dataStore = DataStore.getInstance();
    const pm = getProcessManager();

    // Log some initial info
    const projects = dataStore.getAllProjects();
    const instances = pm.getAllInstances();

    console.log(`[TUI] Loaded ${projects.length} projects`);
    console.log(`[TUI] Found ${instances.length} active instances`);
    console.log('[TUI] Rendering TUI...\n');

    // Clear console before rendering
    console.clear();

    // Render the TUI application
    const { waitUntilExit } = render(<App />);

    // Wait for the app to exit
    await waitUntilExit();

    console.log('\n[TUI] Goodbye!');
  } catch (error) {
    console.error(
      '[TUI] Error starting TUI:',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Export App component for testing
 */
export { App } from './App.js';
