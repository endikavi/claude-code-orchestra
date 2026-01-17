import { ipcMain, dialog, BrowserWindow } from 'electron';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from './channels';
import { validators } from './validators';
import { registerSecurityHandlers } from './securityHandlers';
import { DataStore } from '../services/DataStore';
import { getProcessManager } from '../services/ProcessManager';
import { getWebServer } from '../services/WebServer';
import { getAuthService } from '../services/AuthService';
import { getClusterManager } from '../services/ClusterManager';
import { ConfigReader } from '../services/ConfigReader';
import { ClaudeSessionImporter } from '../services/ClaudeSessionImporter';
import { UISettingsStore, type UISettings } from '../services/UISettingsStore';
import QRCode from 'qrcode';
import type { Project, ClaudeModel, InstanceMode, ConversationStatus } from '@shared/types';
import type { RemoteConfig } from '@shared/types/remote';
import type { ClusterConfig, RemoteInstanceRequest } from '@shared/types/cluster';

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  const dataStore = DataStore.getInstance();
  const processManager = getProcessManager();
  processManager.setMainWindow(mainWindow);

  // Project handlers
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CREATE,
    (_event, data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
      const validated = validators.projectCreate(data);
      return dataStore.createProject(validated);
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, (_event, project: Project) => {
    const validated = validators.projectUpdate(project);
    return dataStore.updateProject(validated);
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, (_event, id: string) => {
    const validatedId = validators.id(id, 'project:delete');
    // Kill all instances for this project first
    processManager.killProjectInstances(validatedId);
    dataStore.deleteProject(validatedId);
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_GET_ALL, () => {
    return dataStore.getAllProjects();
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_GET_BY_ID, (_event, id: string) => {
    const validatedId = validators.id(id, 'project:getById');
    return dataStore.getProjectById(validatedId);
  });

  // Instance handlers
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_CREATE,
    (
      _event,
      config: {
        projectId: string;
        model: ClaudeModel;
        mode: InstanceMode;
        planMode?: boolean;
      }
    ) => {
      const validated = validators.instanceCreate(config);
      return processManager.createInstance(validated);
    }
  );

  ipcMain.handle(IPC_CHANNELS.INSTANCE_KILL, (_event, id: string) => {
    const validatedId = validators.id(id, 'instance:kill');
    processManager.killInstance(validatedId);
  });

  ipcMain.handle(IPC_CHANNELS.INSTANCE_SEND_INPUT, (_event, id: string, input: string) => {
    const validated = validators.instanceInput(id, input);
    processManager.sendInput(validated.id, validated.input);
  });

  ipcMain.handle(IPC_CHANNELS.INSTANCE_GET_ALL, () => {
    return processManager.getAllInstances();
  });

  ipcMain.handle(IPC_CHANNELS.INSTANCE_GET_BY_PROJECT, (_event, projectId: string) => {
    const validatedId = validators.id(projectId, 'instance:getByProject');
    return processManager.getInstancesByProject(validatedId);
  });

  // Resize handler (from renderer)
  ipcMain.on('instance:resize', (_event, id: string, cols: number, rows: number) => {
    processManager.resizeInstance(id, cols, rows);
  });

  // Config handlers
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_CLAUDE_SETTINGS, () => {
    return ConfigReader.getGlobalSettings();
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET_MCP_SERVERS, () => {
    return ConfigReader.getMcpServers();
  });

  // Window handlers
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow.close();
  });

  // Conversation handlers
  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_CREATE,
    (
      _event,
      data: {
        projectId: string;
        title: string;
        initialPrompt: string;
        model: ClaudeModel;
        mode: InstanceMode;
      }
    ) => {
      const validated = validators.conversationCreate(data);
      return dataStore.createConversation(validated);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_UPDATE,
    (
      _event,
      id: string,
      updates: Partial<{
        sessionId: string;
        status: ConversationStatus;
        totalCostUsd: number;
        messageCount: number;
        title: string;
      }>
    ) => {
      const validated = validators.conversationUpdate(id, updates);
      return dataStore.updateConversation(validated.id, validated.updates);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, (_event, id: string) => {
    const validatedId = validators.id(id, 'conversation:delete');
    dataStore.deleteConversation(validatedId);
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET_BY_PROJECT, (_event, projectId: string) => {
    const validatedId = validators.id(projectId, 'conversation:getByProject');
    return dataStore.getConversationsByProject(validatedId);
  });

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET_BY_ID, (_event, id: string) => {
    const validatedId = validators.id(id, 'conversation:getById');
    return dataStore.getConversationById(validatedId);
  });

  ipcMain.handle(
    IPC_CHANNELS.CONVERSATION_ADD_MESSAGE,
    (
      _event,
      data: {
        conversationId: string;
        type: string;
        content: string;
        costUsd?: number;
      }
    ) => {
      const validated = validators.conversationAddMessage(data);
      return dataStore.addMessage(validated);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET_MESSAGES, (_event, conversationId: string) => {
    const validatedId = validators.id(conversationId, 'conversation:getMessages');
    return dataStore.getMessagesByConversation(validatedId);
  });

  // Instance resume handler
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_RESUME,
    (
      _event,
      config: {
        projectId: string;
        sessionId: string;
        model: ClaudeModel;
        mode: InstanceMode;
      }
    ) => {
      const validated = validators.instanceResume(config);
      return processManager.resumeInstance(validated);
    }
  );

  // Dialog handlers
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Session import handlers
  const sessionImporter = ClaudeSessionImporter.getInstance();

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_AVAILABLE, async (_event, projectPath: string) => {
    const sessions = await sessionImporter.getSessionsForProject(projectPath);
    // Convert Date objects to timestamps for IPC
    return sessions.map((s) => ({
      ...s,
      createdAt: s.createdAt.getTime(),
      updatedAt: s.updatedAt.getTime(),
    }));
  });

  ipcMain.handle(IPC_CHANNELS.SESSION_GET_COUNT, async (_event, projectPath: string) => {
    return sessionImporter.getAvailableSessionsCount(projectPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.SESSION_IMPORT,
    async (_event, sessionId: string, projectId: string, projectPath: string) => {
      return sessionImporter.importSession(sessionId, projectId, projectPath);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SESSION_IMPORT_BATCH,
    async (_event, sessionIds: string[], projectId: string, projectPath: string) => {
      return sessionImporter.importSessions(sessionIds, projectId, projectPath);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SESSION_CHECK_INSTALLED, () => {
    return sessionImporter.hasClaudeCodeInstalled();
  });

  // ==================== Remote Access Handlers ====================
  const webServer = getWebServer();
  const authService = getAuthService();

  // Get remote config
  ipcMain.handle(IPC_CHANNELS.REMOTE_GET_CONFIG, () => {
    return dataStore.getRemoteConfig();
  });

  // Update remote config
  ipcMain.handle(IPC_CHANNELS.REMOTE_UPDATE_CONFIG, (_event, config: Partial<RemoteConfig>) => {
    return dataStore.updateRemoteConfig(config);
  });

  // Set password (hashes and stores)
  ipcMain.handle(IPC_CHANNELS.REMOTE_SET_PASSWORD, (_event, password: string) => {
    const passwordHash = password ? authService.hashPassword(password) : '';
    return dataStore.updateRemoteConfig({ passwordHash });
  });

  // Start web server
  ipcMain.handle(IPC_CHANNELS.REMOTE_START_SERVER, async (_event, port?: number) => {
    const config = dataStore.getRemoteConfig();
    const serverPort = port ?? config.port;

    try {
      await webServer.start(serverPort);
      dataStore.updateRemoteConfig({ enabled: true, port: serverPort });
      return { success: true, status: webServer.getStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Stop web server
  ipcMain.handle(IPC_CHANNELS.REMOTE_STOP_SERVER, async () => {
    await webServer.stop();
    dataStore.updateRemoteConfig({ enabled: false });
    return { success: true };
  });

  // Get server status (detailed for admin context)
  ipcMain.handle(IPC_CHANNELS.REMOTE_GET_STATUS, () => {
    return webServer.getDetailedStatus();
  });

  // Kick a session
  ipcMain.handle(IPC_CHANNELS.REMOTE_KICK_SESSION, (_event, sessionId: string) => {
    webServer.kickSession(sessionId);
    return { success: true };
  });

  // Generate QR code for URL
  ipcMain.handle(IPC_CHANNELS.REMOTE_GET_QR_CODE, async () => {
    const status = webServer.getStatus();
    if (!status.running || !status.url) {
      return { success: false, error: 'Server not running' };
    }

    try {
      const qrCode = await QRCode.toDataURL(status.url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      return { success: true, qrCode, url: status.url };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // ==================== Cluster Handlers ====================
  const clusterManager = getClusterManager();
  clusterManager.setMainWindow(mainWindow);

  // Get cluster config
  ipcMain.handle(IPC_CHANNELS.CLUSTER_GET_CONFIG, () => {
    return clusterManager.getConfig();
  });

  // Update cluster config
  ipcMain.handle(IPC_CHANNELS.CLUSTER_UPDATE_CONFIG, (_event, config: Partial<ClusterConfig>) => {
    return clusterManager.updateConfig(config);
  });

  // Get cluster status
  ipcMain.handle(IPC_CHANNELS.CLUSTER_GET_STATUS, () => {
    return clusterManager.getStatus();
  });

  // Start cluster mode
  ipcMain.handle(IPC_CHANNELS.CLUSTER_START, async () => {
    try {
      await clusterManager.start();
      return { success: true, status: clusterManager.getStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Stop cluster mode
  ipcMain.handle(IPC_CHANNELS.CLUSTER_STOP, () => {
    try {
      clusterManager.stop();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Generate shared secret
  ipcMain.handle(IPC_CHANNELS.CLUSTER_GENERATE_SECRET, () => {
    const secret = dataStore.generateClusterSecret();
    return { success: true, secret };
  });

  // Get global projects (from all nodes)
  ipcMain.handle(IPC_CHANNELS.CLUSTER_GET_GLOBAL_PROJECTS, () => {
    return clusterManager.getAllGlobalProjects();
  });

  // Get global instances (from all nodes)
  ipcMain.handle(IPC_CHANNELS.CLUSTER_GET_GLOBAL_INSTANCES, () => {
    return clusterManager.getAllGlobalInstances();
  });

  // Create instance on remote node
  ipcMain.handle(
    IPC_CHANNELS.CLUSTER_CREATE_REMOTE_INSTANCE,
    (_event, request: RemoteInstanceRequest) => {
      try {
        const instance = clusterManager.createInstance(request);
        return { success: true, data: instance };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // Send input to remote instance
  ipcMain.handle(
    IPC_CHANNELS.CLUSTER_SEND_REMOTE_INPUT,
    (_event, instanceId: string, nodeId: string, input: string) => {
      clusterManager.sendInput(instanceId, nodeId, input);
      return { success: true };
    }
  );

  // Kill remote instance
  ipcMain.handle(
    IPC_CHANNELS.CLUSTER_KILL_REMOTE_INSTANCE,
    (_event, instanceId: string, nodeId: string) => {
      clusterManager.killInstance(instanceId, nodeId);
      return { success: true };
    }
  );

  // ==================== UI Settings Handlers ====================
  const uiSettingsStore = UISettingsStore.getInstance();

  ipcMain.handle(IPC_CHANNELS.UI_SETTINGS_GET, () => {
    return uiSettingsStore.getSettings();
  });

  ipcMain.handle(IPC_CHANNELS.UI_SETTINGS_UPDATE, (_event, settings: Partial<UISettings>) => {
    return uiSettingsStore.updateSettings(settings);
  });

  // ==================== Security Handlers ====================
  registerSecurityHandlers();

  // ==================== Local Settings Handlers ====================
  ipcMain.handle(IPC_CHANNELS.LOCAL_SETTINGS_READ, (_event, projectPath: string) => {
    try {
      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json');
      if (!fs.existsSync(settingsPath)) {
        return { success: true, content: null, exists: false };
      }
      const content = fs.readFileSync(settingsPath, 'utf-8');
      return { success: true, content, exists: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_SETTINGS_WRITE,
    (_event, projectPath: string, content: string) => {
      try {
        const claudeDir = path.join(projectPath, '.claude');
        const settingsPath = path.join(claudeDir, 'settings.local.json');

        // Create .claude directory if it doesn't exist
        if (!fs.existsSync(claudeDir)) {
          fs.mkdirSync(claudeDir, { recursive: true });
        }

        // Validate JSON before writing
        JSON.parse(content);

        fs.writeFileSync(settingsPath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // ==================== Shell Handlers ====================

  // Integrated shell handlers
  ipcMain.handle(IPC_CHANNELS.SHELL_CREATE, (_event, projectId: string) => {
    return processManager.createShellInstance(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_KILL, (_event, id: string) => {
    processManager.killShellInstance(id);
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_SEND_INPUT, (_event, id: string, input: string) => {
    processManager.sendShellInput(id, input);
  });

  ipcMain.on(IPC_CHANNELS.SHELL_RESIZE, (_event, id: string, cols: number, rows: number) => {
    processManager.resizeShellInstance(id, cols, rows);
  });

  // External terminal handler (legacy)
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_TERMINAL, (_event, projectPath: string) => {
    try {
      if (process.platform === 'win32') {
        // Windows: open cmd in the specified directory
        spawn('cmd.exe', ['/c', 'start', 'cmd', '/K', `cd /d "${projectPath}"`], {
          shell: true,
          detached: true,
          stdio: 'ignore',
        });
      } else if (process.platform === 'darwin') {
        // macOS: open Terminal in the specified directory
        spawn('open', ['-a', 'Terminal', projectPath], {
          detached: true,
          stdio: 'ignore',
        });
      } else {
        // Linux: try common terminal emulators
        // Use 'which' to check if terminal exists before spawning (spawn is async and won't throw)
        const terminals = [
          { cmd: 'gnome-terminal', args: ['--working-directory', projectPath] },
          { cmd: 'konsole', args: ['--workdir', projectPath] },
          { cmd: 'xfce4-terminal', args: ['--working-directory', projectPath] },
          { cmd: 'tilix', args: ['--working-directory', projectPath] },
          { cmd: 'terminator', args: ['--working-directory', projectPath] },
          { cmd: 'alacritty', args: ['--working-directory', projectPath] },
          { cmd: 'kitty', args: ['--directory', projectPath] },
          { cmd: 'x-terminal-emulator', args: [], cwd: projectPath },
          { cmd: 'xterm', args: ['-e', `cd "${projectPath}" && $SHELL`] },
        ];

        let terminalOpened = false;

        for (const term of terminals) {
          try {
            // Check if the command exists using 'which'
            execSync(`which ${term.cmd}`, { stdio: 'ignore' });

            // If which succeeds, the terminal exists - spawn it
            const child = spawn(term.cmd, term.args, {
              cwd: term.cwd,
              detached: true,
              stdio: 'ignore',
            });
            child.unref();
            terminalOpened = true;
            break;
          } catch {
            // which failed = command doesn't exist, try the next one
            continue;
          }
        }

        if (!terminalOpened) {
          return { success: false, error: 'No terminal emulator found' };
        }
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });
}

export function cleanupIpcHandlers(): void {
  // Remove all handlers
  Object.values(IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(channel);
  });
}
