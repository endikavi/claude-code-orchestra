import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { setupIpcHandlers, cleanupIpcHandlers } from './ipc/handlers';
import { getProcessManager } from './services/ProcessManager';
import { DataStore } from './services/DataStore';
import { getWebServer } from './services/WebServer';
import { getClusterManager } from './services/ClusterManager';
import { getTerminalPool } from './services/TerminalPool';

// GPU cache configuration for xterm.js WebGL performance
// By default, we enable GPU caches for better terminal rendering performance
// Set CLAUDE_DASHBOARD_DISABLE_GPU_CACHE=1 to disable if you experience issues
// (e.g., multiple Electron instances sharing cache, permission issues)
if (process.env.CLAUDE_DASHBOARD_DISABLE_GPU_CACHE === '1') {
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  app.commandLine.appendSwitch('disable-gpu-program-cache');
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// Only check for squirrel startup in production (module may not exist in all builds)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronSquirrelStartup = require('electron-squirrel-startup') as boolean;
  if (electronSquirrelStartup) {
    app.quit();
  }
} catch {
  // electron-squirrel-startup not available (e.g., non-Squirrel builds)
}

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // SECURITY NOTE: Sandbox is disabled because node-pty requires native module access
      // which is incompatible with Chromium's sandbox. Mitigations in place:
      // - IPC input validation (validators.ts)
      // - contextIsolation enabled (isolates preload from renderer)
      // - nodeIntegration disabled (no Node.js in renderer context)
      // - Limited preload API surface (only defined IPC channels exposed)
      // Future improvement: Consider migrating node-pty to an Electron utility process
      sandbox: false,
    },
  });

  // Setup IPC handlers
  setupIpcHandlers(mainWindow);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  if (isDev) {
    // Use VITE_DEV_SERVER_URL set by vite-plugin-electron
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app
  .whenReady()
  .then(async () => {
    await createWindow();

    // Auto-start web server if configured
    const dataStore = DataStore.getInstance();
    const remoteConfig = dataStore.getRemoteConfig();

    if (remoteConfig.autoStart && remoteConfig.passwordHash) {
      try {
        const webServer = getWebServer();
        await webServer.start(remoteConfig.port);
        console.log(`[Main] Web server auto-started on port ${remoteConfig.port}`);
      } catch (error) {
        console.error('[Main] Failed to auto-start web server:', error);
      }
    }

    // Auto-start cluster if it was enabled
    const clusterConfig = dataStore.getClusterConfig();
    if (clusterConfig.enabled && clusterConfig.role !== 'standalone' && mainWindow) {
      try {
        const clusterManager = getClusterManager();
        clusterManager.setMainWindow(mainWindow);
        await clusterManager.start();
        console.log(`[Main] Cluster auto-started as ${clusterConfig.role}`);
      } catch (error) {
        console.error('[Main] Failed to auto-start cluster:', error);
        // Reset enabled state on failure to avoid inconsistent state
        dataStore.updateClusterConfig({ enabled: false });
      }
    }

    // Initialize terminal pool for faster instance creation
    try {
      const terminalPool = getTerminalPool();
      await terminalPool.initialize();
      console.log(`[Main] Terminal pool initialized`);
    } catch (error) {
      console.error('[Main] Failed to initialize terminal pool:', error);
      // Non-fatal - instances will fall back to direct spawn
    }
  })
  .catch((error) => {
    console.error('[Main] Failed to initialize app:', error);
  });

app.on('window-all-closed', () => {
  // Kill all running instances
  getProcessManager().killAll();

  // Stop cluster
  const clusterManager = getClusterManager();
  if (clusterManager.isServerRunning() || clusterManager.isConnected()) {
    void clusterManager.stop();
  }

  // Stop web server
  const webServer = getWebServer();
  if (webServer.running) {
    void webServer.stop();
  }

  // Close database
  DataStore.getInstance().close();

  // Clean up IPC handlers
  cleanupIpcHandlers();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

// Handle app quit
app.on('before-quit', () => {
  getProcessManager().killAll();
  // Shutdown terminal pool
  void getTerminalPool().shutdown();
});
