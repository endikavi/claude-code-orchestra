import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from './channels';
import { validators } from './validators';
import { registerSecurityHandlers } from './securityHandlers';
import { setupRalphTaskHandlers, cleanupRalphTaskHandlers } from './ralphTaskHandlers';
import { registerPresetHandlers, cleanupPresetHandlers } from './presetHandlers';
import { setupJiraHandlers, cleanupJiraHandlers } from './jiraHandlers';
import { setupVectorSearchHandlers, cleanupVectorSearchHandlers } from './vectorSearchHandlers';
import { DataStore } from '../services/DataStore';
import { getProcessManager } from '../services/ProcessManager';
import { getWebServer } from '../services/WebServer';
import { getAuthService } from '../services/AuthService';
import { getClusterManager } from '../services/ClusterManager';
import { ConfigReader } from '../services/ConfigReader';
import { ClaudeSessionImporter } from '../services/ClaudeSessionImporter';
import { UISettingsStore, type UISettings } from '../services/UISettingsStore';
import { ShellDetector } from '../services/ShellDetector';
import { getPermissionPromptManager } from '../services/PermissionPromptManager';
import QRCode from 'qrcode';
import type {
  Project,
  ClaudeModel,
  InstanceMode,
  ConversationStatus,
  NotificationFilterOptions,
  NotificationPreferences,
  DashboardHookSettings,
  HookTemplateType,
  PermissionRule,
  GlobalPermissionConfig,
  PermissionLogQueryOptions,
  MetricsQueryOptions,
  MetricsPeriod,
} from '@shared/types';
import type { RemoteConfig } from '@shared/types/remote';
import type { ClusterConfig, RemoteInstanceRequest } from '@shared/types/cluster';
import type {
  PermissionPromptRequest,
  PermissionPromptResponse,
} from '@shared/types/permissionPrompt';
import { getNotificationManager } from '../services/NotificationManager';
import { getHookManager } from '../services/HookManager';
import { getSkillManager } from '../services/SkillManager';
import { getPermissionManager } from '../services/PermissionManager';
import { getMetricsService } from '../services/MetricsService';
import { getGitStatusManager } from '../services/GitStatusManager';
import { getSubagentTracker } from '../services/SubagentTracker';
import { getTaskTracker } from '../services/TaskTracker';
import { getTerminalPool } from '../services/TerminalPool';
import { getTerminalDimensionManager } from '../services/TerminalDimensionManager';
import { SharedContextStore } from '../services/SharedContextStore';
import { getSslCertificateService } from '../services/SslCertificateService';
import { AgentDiscovery } from '../services/AgentDiscovery';
import type { TerminalPoolConfig } from '@shared/types/pool';

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  const dataStore = DataStore.getInstance();
  const processManager = getProcessManager();
  processManager.setMainWindow(mainWindow);

  // Get cluster manager for project sync notifications
  const clusterManager = getClusterManager();
  clusterManager.setMainWindow(mainWindow);

  // Get web server for activity IPC events
  getWebServer().setMainWindow(mainWindow);

  // Get git status manager early for project tracking
  const gitStatusManager = getGitStatusManager();

  // Project handlers
  ipcMain.handle(
    IPC_CHANNELS.PROJECT_CREATE,
    (_event, data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
      const validated = validators.projectCreate(data);
      const result = dataStore.createProject(validated);
      clusterManager.notifyProjectChange();
      // Track new project for git status
      gitStatusManager.track(result.id, result.path);
      return result;
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, (_event, project: Project) => {
    const validated = validators.projectUpdate(project);
    const result = dataStore.updateProject(validated);
    clusterManager.notifyProjectChange();
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, (_event, id: string) => {
    const validatedId = validators.id(id, 'project:delete');
    // Kill all instances for this project first
    processManager.killProjectInstances(validatedId).catch((error) => {
      console.error(`[IPC] Error killing project instances for ${validatedId}:`, error);
    });
    dataStore.deleteProject(validatedId);
    clusterManager.notifyProjectChange();
    // Untrack project from git status
    gitStatusManager.untrack(validatedId);
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
        prompt?: string;
        planMode?: boolean;
        verbose?: boolean;
        skipPermissions?: boolean;
        nodeId?: string; // Optional: for cluster projects
      }
    ) => {
      const validated = validators.instanceCreate(config);

      // Check if this is a remote project (cluster mode)
      const localProject = dataStore.getProjectById(validated.projectId);

      if (!localProject) {
        // Project not found locally - check if it's a cluster project
        const clusterConfig = clusterManager.getConfig();
        if (clusterConfig.enabled) {
          // Find the project in global projects
          const globalProjects = clusterManager.getAllGlobalProjects();
          const remoteProject = globalProjects.find((p) => p.id === validated.projectId);

          if (remoteProject && !remoteProject.isLocal) {
            // Create instance on the remote node
            const remoteInstance = clusterManager.createInstance({
              nodeId: remoteProject.nodeId,
              projectId: validated.projectId,
              model: validated.model,
              mode: validated.mode,
              prompt: validated.prompt,
              planMode: validated.planMode,
            });

            // Return placeholder - the actual instance will be created on the remote node
            return (
              remoteInstance || {
                id: 'pending',
                status: 'starting',
                projectId: validated.projectId,
              }
            );
          }
        }
        throw new Error(`Project with id ${validated.projectId} not found`);
      }

      // Local project - create instance locally
      const instance = processManager.createInstance(validated);

      // Create a conversation automatically (same as web clients)
      // Generate title from prompt (first 50 chars) or unique session ID
      const conversationTitle = validated.prompt
        ? validated.prompt.slice(0, 50).split('\n')[0] + (validated.prompt.length > 50 ? '...' : '')
        : `Session #${Date.now().toString(36).slice(-6).toUpperCase()}`;

      const conversation = dataStore.createConversation({
        projectId: validated.projectId,
        title: conversationTitle,
        initialPrompt: '',
        model: validated.model,
        mode: validated.mode,
      });

      // Store the mapping in ProcessManager
      processManager.setInstanceConversation(instance.id, conversation.id);

      return { ...instance, conversationId: conversation.id };
    }
  );

  // Create a pending instance (for structured view deferred flow)
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_CREATE_PENDING,
    (
      _event,
      config: {
        projectId: string;
        model: ClaudeModel;
        mode: InstanceMode;
        planMode?: boolean;
        verbose?: boolean;
        skipPermissions?: boolean;
        usePermissionPromptTool?: boolean;
      }
    ) => {
      const validated = validators.instanceCreate(config);
      const instance = processManager.createPendingInstance(validated);

      // Create a conversation for tracking
      const conversation = dataStore.createConversation({
        projectId: validated.projectId,
        title: `Pending Session #${Date.now().toString(36).slice(-6).toUpperCase()}`,
        initialPrompt: '',
        model: validated.model,
        mode: validated.mode,
      });

      // Store the mapping
      processManager.setInstanceConversation(instance.id, conversation.id);

      return { ...instance, conversationId: conversation.id };
    }
  );

  // Activate a pending instance with the first message
  ipcMain.handle(IPC_CHANNELS.INSTANCE_ACTIVATE, (_event, id: string, prompt: string) => {
    const validatedId = validators.id(id, 'instance:activate');
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required to activate instance');
    }
    const instance = processManager.activatePendingInstance(validatedId, prompt);

    // Update conversation title with first message
    const conversationId = processManager.getInstanceConversation(validatedId);
    if (conversationId) {
      const title = prompt.slice(0, 50).split('\n')[0] + (prompt.length > 50 ? '...' : '');
      dataStore.updateConversation(conversationId, { title });

      // Update mapping to new instance ID (activation creates new ID)
      processManager.setInstanceConversation(instance.id, conversationId);
    }

    return instance;
  });

  ipcMain.handle(IPC_CHANNELS.INSTANCE_KILL, async (_event, id: string, force?: boolean) => {
    const validatedId = validators.id(id, 'instance:kill');
    // Check if it's a pending instance (no process to kill)
    if (processManager.isPendingInstance(validatedId)) {
      // Just clean up the pending config
      return;
    }
    await processManager.killInstance(validatedId, force ?? false);
  });

  ipcMain.handle(IPC_CHANNELS.INSTANCE_SEND_INPUT, (_event, id: string, input: string) => {
    const validated = validators.instanceInput(id, input);
    processManager.sendInput(validated.id, validated.input);
  });

  // Send JSON-formatted message for stream-json mode
  ipcMain.handle(IPC_CHANNELS.INSTANCE_SEND_JSON_MESSAGE, (_event, id: string, message: string) => {
    const validated = validators.instanceInput(id, message);
    processManager.sendJsonMessage(validated.id, validated.input);
  });

  // Set terminal title and broadcast to web clients and cluster
  ipcMain.handle(IPC_CHANNELS.INSTANCE_SET_TITLE, (_event, id: string, title: string) => {
    processManager.setInstanceTitle(id, title);
  });

  ipcMain.handle(IPC_CHANNELS.INSTANCE_GET_ALL, () => {
    return processManager.getAllInstances();
  });

  ipcMain.handle(IPC_CHANNELS.INSTANCE_GET_BY_PROJECT, (_event, projectId: string) => {
    const validatedId = validators.id(projectId, 'instance:getByProject');
    return processManager.getInstancesByProject(validatedId);
  });

  // Force repaint handler for experimental TUI repaint options
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_FORCE_REPAINT,
    (_event, id: string, method: 'fake-resize' | 'ansi-clear') => {
      const validatedId = validators.id(id, 'instance:forceRepaint');
      const validatedMethod =
        method === 'fake-resize' || method === 'ansi-clear' ? method : 'fake-resize';
      return processManager.forceRepaintInstance(validatedId, validatedMethod);
    }
  );

  // Resize handler (from renderer) with dimension synchronization
  ipcMain.on('instance:resize', (_event, id: string, cols: number, rows: number) => {
    // Track dimensions from the Electron renderer client
    const clientId = 'electron:renderer';
    const dimManager = getTerminalDimensionManager();
    const result = dimManager.updateClientDimensions(id, clientId, cols, rows);

    if (result.changed) {
      // Resize PTY to minimum dimensions
      processManager.resizeInstance(id, result.min.cols, result.min.rows);

      // Broadcast synchronized dimensions to Electron renderer
      mainWindow.webContents.send(
        IPC_CHANNELS.INSTANCE_DIMENSION_SYNC,
        id,
        result.min.cols,
        result.min.rows
      );

      // Broadcast to web clients
      const webServer = getWebServer();
      webServer.broadcastDimensionSync(id, result.min.cols, result.min.rows);
    }
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
        prompt?: string; // Optional prompt to send when resuming
      }
    ) => {
      const validated = validators.instanceResume(config);
      return processManager.resumeInstance({ ...validated, prompt: config.prompt });
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

  // Enable web access (server is always running, this just enables web routes)
  ipcMain.handle(IPC_CHANNELS.REMOTE_START_SERVER, async (_event, port?: number) => {
    const config = dataStore.getRemoteConfig();

    try {
      // If a different port is specified and server is running, restart on new port
      if (port && port !== config.port && webServer.running) {
        await webServer.stop();
        const bindAll = config.allowAnyCors;
        await webServer.start(port, !bindAll);
        dataStore.updateRemoteConfig({ port });
      } else if (!webServer.running) {
        // Server not running (shouldn't happen normally), start it
        const bindAll = config.allowAnyCors;
        await webServer.start(port ?? config.port, !bindAll);
      }

      // Enable web access
      dataStore.updateRemoteConfig({ webAccessEnabled: true, enabled: true });

      // Rebind to all interfaces if allowAnyCors is enabled
      if (config.allowAnyCors) {
        await webServer.updateBinding(true);
      }

      return { success: true, status: webServer.getStatus() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Disable web access (server keeps running for internal functionality)
  ipcMain.handle(IPC_CHANNELS.REMOTE_STOP_SERVER, async () => {
    try {
      // Disable web access (internal routes like hooks/MCP stay available)
      dataStore.updateRemoteConfig({ webAccessEnabled: false, enabled: false });

      // Rebind to localhost only for security
      await webServer.updateBinding(false);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
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
  // Note: clusterManager is initialized at the top of this function for project sync

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
  ipcMain.handle(IPC_CHANNELS.CLUSTER_STOP, async () => {
    try {
      await clusterManager.stop();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Generate shared secret
  ipcMain.handle(IPC_CHANNELS.CLUSTER_GENERATE_SECRET, () => {
    const secret = dataStore.generateClusterSecret();
    // Reload ClusterManager config to pick up the new secret
    clusterManager.reloadConfig();
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

  // Create shell on remote node
  ipcMain.handle(
    IPC_CHANNELS.CLUSTER_CREATE_REMOTE_SHELL,
    (_event, nodeId: string, projectId: string) => {
      try {
        clusterManager.createRemoteShell(nodeId, projectId);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  // Resize remote instance
  ipcMain.handle(
    IPC_CHANNELS.CLUSTER_RESIZE_REMOTE_INSTANCE,
    (_event, instanceId: string, nodeId: string, cols: number, rows: number) => {
      clusterManager.resizeRemoteInstance(instanceId, nodeId, cols, rows);
      return { success: true };
    }
  );

  // Get cluster privacy settings
  ipcMain.handle(IPC_CHANNELS.CLUSTER_GET_PRIVACY, () => {
    return dataStore.getNodePrivacy();
  });

  // Update cluster privacy settings
  ipcMain.handle(
    IPC_CHANNELS.CLUSTER_UPDATE_PRIVACY,
    (_event, privacy: import('@shared/types/cluster').ClusterNodePrivacy) => {
      const updated = dataStore.updateNodePrivacy(privacy);
      // Notify cluster of permission change
      clusterManager.notifyPermissionChange({
        nodeId: clusterManager.getConfig().nodeId,
        type: 'node_privacy',
        timestamp: Date.now(),
      });
      return updated;
    }
  );

  // Get instance cluster permissions
  ipcMain.handle(IPC_CHANNELS.INSTANCE_GET_CLUSTER_PERMISSIONS, (_event, instanceId: string) => {
    return processManager.getInstanceClusterPermissions(instanceId);
  });

  // Set instance cluster permissions
  ipcMain.handle(
    IPC_CHANNELS.INSTANCE_SET_CLUSTER_PERMISSIONS,
    (
      _event,
      instanceId: string,
      perms: import('@shared/types/cluster').InstanceClusterPermissions
    ) => {
      const updated = processManager.setInstanceClusterPermissions(instanceId, perms);
      // Notify cluster of permission change
      clusterManager.notifyPermissionChange({
        nodeId: clusterManager.getConfig().nodeId,
        type: 'instance_permissions',
        timestamp: Date.now(),
        affectedInstanceIds: [instanceId],
      });
      return updated;
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
    try {
      processManager.killShellInstance(id);
    } catch (error) {
      console.error(`[IPC] Error killing shell instance ${id}:`, error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_SEND_INPUT, (_event, id: string, input: string) => {
    try {
      processManager.sendShellInput(id, input);
    } catch (error) {
      console.error(`[IPC] Error sending input to shell ${id}:`, error);
    }
  });

  ipcMain.on(IPC_CHANNELS.SHELL_RESIZE, (_event, id: string, cols: number, rows: number) => {
    try {
      processManager.resizeShellInstance(id, cols, rows);
    } catch {
      // Silently ignore resize errors - shell may have exited
    }
  });

  // Get available shells on the system
  ipcMain.handle(IPC_CHANNELS.SHELL_GET_AVAILABLE, () => {
    return ShellDetector.getInstance().getAvailableShells();
  });

  // ==================== Notification Handlers ====================
  const notificationManager = getNotificationManager();
  notificationManager.setMainWindow(mainWindow);

  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_GET_ALL,
    (_event, options?: NotificationFilterOptions) => {
      return notificationManager.getAll(options || {});
    }
  );

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_GET_STATS, () => {
    return notificationManager.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_MARK_READ, (_event, id: string) => {
    return notificationManager.markRead(id);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_MARK_ALL_READ, () => {
    return notificationManager.markAllRead();
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_DISMISS, (_event, id: string) => {
    return notificationManager.dismiss(id);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_DELETE, (_event, id: string) => {
    return notificationManager.delete(id);
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_CLEAR_ALL, () => {
    notificationManager.clearAll();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_GET_PREFERENCES, () => {
    return notificationManager.getPreferences();
  });

  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_SET_PREFERENCES,
    (_event, prefs: Partial<NotificationPreferences>) => {
      notificationManager.setPreferences(prefs);
      return { success: true };
    }
  );

  // ==================== Hook Handlers ====================
  const hookManager = getHookManager();

  ipcMain.handle(IPC_CHANNELS.HOOK_GET_TEMPLATES, () => {
    return hookManager.getTemplates();
  });

  ipcMain.handle(
    IPC_CHANNELS.HOOK_SETUP_PROJECT,
    async (
      _event,
      projectPath: string,
      settings: DashboardHookSettings,
      templateId?: HookTemplateType
    ) => {
      // Get the configured WebServer port from DataStore
      const remoteConfig = dataStore.getRemoteConfig();
      hookManager.setApiPort(remoteConfig.port);

      return hookManager.setupHooksForProject(projectPath, settings, templateId);
    }
  );

  ipcMain.handle(IPC_CHANNELS.HOOK_REMOVE_PROJECT, async (_event, projectPath: string) => {
    return hookManager.removeHooksFromProject(projectPath);
  });

  ipcMain.handle(IPC_CHANNELS.HOOK_GET_PROJECT_SETTINGS, async (_event, projectPath: string) => {
    return hookManager.getProjectHookSettings(projectPath);
  });

  ipcMain.handle(IPC_CHANNELS.HOOK_HAS_CONFIGURED, async (_event, projectPath: string) => {
    return hookManager.hasHooksConfigured(projectPath);
  });

  // ==================== Agent Discovery Handlers ====================
  ipcMain.handle(IPC_CHANNELS.AGENT_DISCOVER, (_event, projectPath: string) => {
    return AgentDiscovery.discoverAgents(projectPath);
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_VALIDATE_FILE, (_event, agentPath: string) => {
    return AgentDiscovery.validateAgentFile(agentPath);
  });

  // ==================== Skill Handlers ====================
  const skillManager = getSkillManager();

  ipcMain.handle(IPC_CHANNELS.SKILL_GET_AVAILABLE, () => {
    return skillManager.getAvailableSkills();
  });

  ipcMain.handle(
    IPC_CHANNELS.SKILL_INSTALL,
    async (_event, projectPath: string, skillIds: string[]) => {
      return skillManager.installSkills(projectPath, skillIds);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_REMOVE,
    async (_event, projectPath: string, skillId: string) => {
      return skillManager.removeSkill(projectPath, skillId);
    }
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_GET_INSTALLED, async (_event, projectPath: string) => {
    return skillManager.getInstalledSkills(projectPath);
  });

  // ==================== Permission Handlers ====================
  const permissionManager = getPermissionManager();

  ipcMain.handle(IPC_CHANNELS.PERMISSION_GET_CONFIG, () => {
    return permissionManager.getConfig();
  });

  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_SET_CONFIG,
    (_event, config: Partial<GlobalPermissionConfig>) => {
      permissionManager.setConfig(config);
      return { success: true };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_ADD_RULE,
    (_event, rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => {
      return permissionManager.addGlobalRule(rule);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_UPDATE_RULE,
    (_event, id: string, updates: Partial<PermissionRule>) => {
      return permissionManager.updateGlobalRule(id, updates);
    }
  );

  ipcMain.handle(IPC_CHANNELS.PERMISSION_REMOVE_RULE, (_event, id: string) => {
    return permissionManager.removeGlobalRule(id);
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSION_GET_LOG, (_event, options?: PermissionLogQueryOptions) => {
    return permissionManager.getLog(options || {});
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSION_GET_STATS, () => {
    return permissionManager.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.PERMISSION_CLEAR_LOG, () => {
    permissionManager.clearLog();
    return { success: true };
  });

  // ==================== Permission Prompt Handlers (--permission-prompt-tool support) ====================
  const permissionPromptManager = getPermissionPromptManager();

  // Forward permission:request events to renderer
  permissionPromptManager.on('permission:request', (request: PermissionPromptRequest) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PERMISSION_PROMPT_REQUEST, request);
      console.log(
        `[IPC] Sent permission:request to renderer for ${request.toolName} (${request.id})`
      );
    }
  });

  // Forward permission:timeout events to renderer
  permissionPromptManager.on('permission:timeout', (request: PermissionPromptRequest) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PERMISSION_PROMPT_TIMEOUT, request);
      console.log(`[IPC] Sent permission:timeout to renderer for ${request.id}`);
    }
  });

  // Handle permission response from renderer
  ipcMain.handle(
    IPC_CHANNELS.PERMISSION_PROMPT_RESPOND,
    (_event, permissionId: string, response: PermissionPromptResponse) => {
      const success = permissionPromptManager.respondToPermission(permissionId, response);
      return { success };
    }
  );

  // Handle permission cancellation from renderer
  ipcMain.handle(IPC_CHANNELS.PERMISSION_PROMPT_CANCEL, (_event, permissionId: string) => {
    const success = permissionPromptManager.cancelPermission(permissionId);
    return { success };
  });

  // ==================== Metrics Handlers ====================
  const metricsService = getMetricsService();

  ipcMain.handle(IPC_CHANNELS.METRICS_GET_TOOL_USAGE, (_event, options?: MetricsQueryOptions) => {
    return metricsService.getToolUsage(options || {});
  });

  ipcMain.handle(IPC_CHANNELS.METRICS_GET_SESSIONS, (_event, options?: MetricsQueryOptions) => {
    return metricsService.getSessions(options || {});
  });

  ipcMain.handle(IPC_CHANNELS.METRICS_GET_PROJECT_SUMMARY, (_event, projectId: string) => {
    return metricsService.getProjectSummary(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.METRICS_GET_TIME_SERIES, (_event, options?: MetricsQueryOptions) => {
    return metricsService.getTimeSeries(options || {});
  });

  ipcMain.handle(IPC_CHANNELS.METRICS_GET_DASHBOARD_SUMMARY, () => {
    return metricsService.getDashboardSummary();
  });

  ipcMain.handle(
    IPC_CHANNELS.METRICS_GET_COST_BREAKDOWN,
    (_event, options?: MetricsQueryOptions) => {
      return metricsService.getCostBreakdown(options || {});
    }
  );

  ipcMain.handle(IPC_CHANNELS.METRICS_GET_USAGE_TRENDS, (_event, period?: MetricsPeriod) => {
    return metricsService.getUsageTrends(period || 'week');
  });

  ipcMain.handle(IPC_CHANNELS.METRICS_CLEAR, () => {
    metricsService.clear();
    return { success: true };
  });

  // ==================== Git Status Handlers ====================
  gitStatusManager.setMainWindow(mainWindow);

  // Start git status polling
  gitStatusManager.start();

  // Track all existing projects
  const allProjects = dataStore.getAllProjects();
  for (const project of allProjects) {
    gitStatusManager.track(project.id, project.path);
  }

  ipcMain.handle(IPC_CHANNELS.GIT_GET_STATUS, (_event, projectId: string) => {
    return gitStatusManager.getStatus(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_REFRESH, async (_event, projectId: string) => {
    return gitStatusManager.refresh(projectId);
  });

  // ==================== Subagent Handlers (Native Claude Task Tool Tracking) ====================
  const subagentTracker = getSubagentTracker();

  ipcMain.handle(IPC_CHANNELS.SUBAGENT_GET_BY_INSTANCE, (_event, instanceId: string) => {
    return subagentTracker.getSubagents(instanceId);
  });

  ipcMain.handle(IPC_CHANNELS.SUBAGENT_GET_ALL, () => {
    return subagentTracker.getAllSubagents();
  });

  // ==================== Task Handlers (Claude Code TaskCreate/TaskUpdate/TaskList) ====================
  const taskTracker = getTaskTracker();

  ipcMain.handle(IPC_CHANNELS.TASK_GET_BY_INSTANCE, (_event, instanceId: string) => {
    return taskTracker.getTasks(instanceId);
  });

  ipcMain.handle(IPC_CHANNELS.TASK_GET_ALL, () => {
    return taskTracker.getAllTasks();
  });

  // ==================== Proxy Handlers (Web Preview Tunneling) ====================
  ipcMain.handle(IPC_CHANNELS.PROXY_GET_CONFIG, () => {
    try {
      const config = dataStore.getProxyConfig();
      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get config',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.PROXY_UPDATE_CONFIG,
    (
      _event,
      config: { enabled?: boolean; maxConcurrentTunnels?: number; rateLimitPerMinute?: number }
    ) => {
      try {
        const updated = dataStore.updateProxyConfig(config);
        return { success: true, data: updated };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update config',
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROXY_GET_PORTS, () => {
    try {
      const ports = dataStore.getAllowedPorts();
      return { success: true, data: ports };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get ports',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_ADD_PORT, (_event, port: number, description?: string) => {
    try {
      // Validate port range
      if (port < 1024 || port > 65535) {
        return { success: false, error: 'Port must be between 1024 and 65535' };
      }

      // Check if port is already allowed
      if (dataStore.isPortAllowed(port)) {
        return { success: false, error: `Port ${port} is already allowed` };
      }

      const added = dataStore.addAllowedPort(port, description);
      return { success: true, data: added };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add port',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXY_REMOVE_PORT, (_event, port: number) => {
    try {
      dataStore.deleteAllowedPort(port);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove port',
      };
    }
  });

  // ==================== DevTools Handlers (Web Preview DevTools) ====================

  // Register a proxy view for an instance
  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_REGISTER_VIEW,
    (_event, viewId: string, instanceId: string) => {
      webServer.registerProxyView(viewId, instanceId);
      return { success: true };
    }
  );

  // Unregister a proxy view
  ipcMain.handle(IPC_CHANNELS.DEVTOOLS_UNREGISTER_VIEW, (_event, viewId: string) => {
    webServer.unregisterProxyView(viewId);
    return { success: true };
  });

  // Add console entry from renderer (for Electron webview mode)
  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_ADD_CONSOLE_ENTRY,
    (
      _event,
      viewId: string,
      entry: {
        level: 'log' | 'warn' | 'error' | 'info' | 'debug';
        message: string;
        timestamp: number;
        source?: string;
        line?: number;
      }
    ) => {
      webServer.addDevToolsConsoleEntry(viewId, entry);
      return { success: true };
    }
  );

  // Clear console entries
  ipcMain.handle(IPC_CHANNELS.DEVTOOLS_CLEAR_CONSOLE, (_event, viewId: string) => {
    webServer.clearDevToolsConsoleEntries(viewId);
    return { success: true };
  });

  // Toggle inspector
  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_TOGGLE_INSPECTOR,
    (_event, viewId: string, enabled?: boolean) => {
      const command =
        enabled === undefined
          ? { type: 'toggle-inspector' }
          : { type: enabled ? 'enable-inspector' : 'disable-inspector' };
      // Find instance for view
      webServer.broadcastDevToolsCommand(undefined, { ...command, viewId });
      return { success: true };
    }
  );

  // Send HTML to terminal (for context menu action)
  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_SEND_TO_TERMINAL,
    (_event, instanceId: string, html: string) => {
      try {
        processManager.sendInput(instanceId, html);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send to terminal',
        };
      }
    }
  );

  // Open external URL handler (for terminal links)
  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      // Validate URL format
      const parsedUrl = new URL(url);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { success: false, error: 'Only http and https URLs are allowed' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid URL';
      return { success: false, error: message };
    }
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

  // ==================== Terminal Pool Handlers (LOCAL-ONLY) ====================
  // SECURITY: These handlers are only accessible via IPC from the local renderer.
  // They are NOT exposed through WebServer or ClusterManager.
  const terminalPool = getTerminalPool();

  ipcMain.handle(IPC_CHANNELS.POOL_GET_CONFIG, () => {
    return terminalPool.getConfig();
  });

  ipcMain.handle(IPC_CHANNELS.POOL_UPDATE_CONFIG, (_event, config: Partial<TerminalPoolConfig>) => {
    return terminalPool.updateConfig(config);
  });

  ipcMain.handle(IPC_CHANNELS.POOL_GET_STATS, () => {
    return terminalPool.getStats();
  });

  ipcMain.handle(IPC_CHANNELS.POOL_RESET_STATS, () => {
    terminalPool.resetStats();
    return { success: true };
  });

  // ==================== Shared Context Handlers ====================
  const sharedContextStore = SharedContextStore.getInstance();

  ipcMain.handle(IPC_CHANNELS.CONTEXT_GET_INSTANCES, (_event, projectId: string) => {
    return sharedContextStore.getAllInstanceContexts(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_GET_INSTANCE, (_event, instanceId: string) => {
    return sharedContextStore.getInstanceContext(instanceId);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_GET_PROJECT_KNOWLEDGE, (_event, projectId: string) => {
    return sharedContextStore.getProjectKnowledge(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_GET_SUMMARY, (_event, projectId: string) => {
    return sharedContextStore.getContextSummary(projectId);
  });

  ipcMain.handle(IPC_CHANNELS.CONTEXT_GET_STATS, () => {
    return sharedContextStore.getStats();
  });

  // Forward context update events to renderer
  sharedContextStore.on('contextUpdated', (event) => {
    mainWindow.webContents.send(IPC_CHANNELS.CONTEXT_UPDATED, event);
  });

  // ==================== SSL/TLS Handlers ====================
  const sslService = getSslCertificateService();

  ipcMain.handle(IPC_CHANNELS.SSL_VALIDATE_CERT, (_event, certPath: string) => {
    try {
      return sslService.validateCertificate(certPath);
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.SSL_GENERATE_SELF_SIGNED,
    (_event, hostname: string = 'localhost', days: number = 365) => {
      try {
        const paths = sslService.generateSelfSignedCert(hostname, days);
        return { success: true, ...paths };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Generation failed',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SSL_GENERATE_LETS_ENCRYPT,
    async (_event, domain: string, email?: string) => {
      try {
        const paths = await sslService.generateLetsEncryptCert(domain, email);
        return { success: true, certPath: paths.certPath, keyPath: paths.keyPath };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Let's Encrypt generation failed",
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.SSL_GET_CERT_INFO, (_event, certPath: string) => {
    try {
      const info = sslService.getCertificateInfo(certPath);
      if (!info) {
        return { success: false, error: 'Could not read certificate' };
      }
      return { success: true, info };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get certificate info',
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.SSL_VALIDATE_CERT_KEY_PAIR,
    (_event, certPath: string, keyPath: string, passphrase?: string) => {
      try {
        return sslService.validateCertKeyPair(certPath, keyPath, passphrase);
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Validation failed',
        };
      }
    }
  );

  // Setup Ralph Task handlers
  setupRalphTaskHandlers(mainWindow);

  // Setup Preset handlers
  registerPresetHandlers();

  // Setup Jira handlers
  setupJiraHandlers();

  // Setup Vector Search handlers
  setupVectorSearchHandlers(mainWindow);
}

export function cleanupIpcHandlers(): void {
  // Remove all handlers
  Object.values(IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(channel);
  });

  // Cleanup Ralph Task handlers
  cleanupRalphTaskHandlers();

  // Cleanup Preset handlers
  cleanupPresetHandlers();

  // Cleanup Jira handlers
  cleanupJiraHandlers();

  // Cleanup Vector Search handlers
  cleanupVectorSearchHandlers();
}
