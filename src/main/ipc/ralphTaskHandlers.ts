import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from './channels';
import { getRalphTaskManager } from '../services/RalphTaskManager';
import { getRalphTaskLoop } from '../services/RalphTaskLoop';
import type {
  CreateRalphTaskInput,
  UpdateRalphTaskInput,
  MoveRalphTaskInput,
  ReorderRalphTasksInput,
  RalphTaskHelpRequest,
} from '@shared/types/ralphTasks';

/**
 * Setup IPC handlers for Ralph Task operations
 */
export function setupRalphTaskHandlers(mainWindow: BrowserWindow): void {
  const taskManager = getRalphTaskManager();
  const taskLoop = getRalphTaskLoop();

  // Setup event forwarding to renderer
  setupEventForwarding(mainWindow, taskManager, taskLoop);

  // Create task
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_CREATE, (_event, input: CreateRalphTaskInput) => {
    return taskManager.createTask(input);
  });

  // Update task
  ipcMain.handle(
    IPC_CHANNELS.RALPH_TASK_UPDATE,
    (_event, id: string, updates: UpdateRalphTaskInput) => {
      return taskManager.updateTask(id, updates);
    }
  );

  // Delete task
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_DELETE, (_event, id: string) => {
    return taskManager.deleteTask(id);
  });

  // Get tasks by project
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_GET_BY_PROJECT, (_event, projectId: string) => {
    return taskManager.getTasksByProject(projectId);
  });

  // Get task by ID
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_GET_BY_ID, (_event, id: string) => {
    return taskManager.getTaskById(id);
  });

  // Move task
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_MOVE, (_event, input: MoveRalphTaskInput) => {
    return taskManager.moveTask(input);
  });

  // Reorder tasks
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_REORDER, (_event, input: ReorderRalphTasksInput) => {
    return taskManager.reorderTasks(input);
  });

  // Start task (begin loop)
  // isInteractive: true = show terminal UI, false = run in background
  ipcMain.handle(
    IPC_CHANNELS.RALPH_TASK_START,
    (_event, taskId: string, isInteractive?: boolean) => {
      return taskLoop.startTask(taskId, isInteractive);
    }
  );

  // Stop task (stop loop)
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_STOP, (_event, taskId: string) => {
    return taskLoop.stopTask(taskId);
  });

  // Respond to help request
  ipcMain.handle(
    IPC_CHANNELS.RALPH_TASK_RESPOND_HELP,
    (_event, taskId: string, response: string) => {
      return taskLoop.respondToHelp(taskId, response);
    }
  );

  // Process all tasks
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL, (_event, projectId: string) => {
    taskLoop.processAll(projectId);
    return true;
  });

  // Stop processing all tasks
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_STOP_ALL, (_event, projectId: string) => {
    taskLoop.stopProcessAll(projectId);
    return true;
  });

  // Get generated prompt for a task (without starting it)
  ipcMain.handle(IPC_CHANNELS.RALPH_TASK_GET_PROMPT, (_event, taskId: string) => {
    return taskLoop.getTaskPrompt(taskId);
  });
}

/**
 * Forward events from services to renderer
 */
function setupEventForwarding(
  mainWindow: BrowserWindow,
  taskManager: ReturnType<typeof getRalphTaskManager>,
  taskLoop: ReturnType<typeof getRalphTaskLoop>
): void {
  // Forward task manager events
  taskManager.on('taskCreated', (task) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_CREATED, task);
    }
  });

  taskManager.on('taskUpdated', (task) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_UPDATED, task);
    }
  });

  taskManager.on('taskDeleted', (taskId) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_DELETED, taskId);
    }
  });

  // Forward task loop events
  taskLoop.on('helpRequested', (request: RalphTaskHelpRequest) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_HELP_REQUESTED, request);
    }
  });

  taskLoop.on('loopStarted', (taskId: string, loopCount: number) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_LOOP_STARTED, taskId, loopCount);
    }
  });

  taskLoop.on('loopCompleted', (taskId: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_LOOP_COMPLETED, taskId);
    }
  });

  taskLoop.on('taskCompleted', (task) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_UPDATED, task);
    }
  });

  taskLoop.on('processAllStarted', (projectId: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_STARTED, projectId);
    }
  });

  taskLoop.on('processAllCompleted', (projectId: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_COMPLETED, projectId);
    }
  });

  taskLoop.on('processAllStopped', (projectId: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL_STOPPED, projectId);
    }
  });
}

/**
 * Cleanup IPC handlers for Ralph Tasks
 */
export function cleanupRalphTaskHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_CREATE);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_UPDATE);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_DELETE);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_GET_BY_PROJECT);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_GET_BY_ID);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_MOVE);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_REORDER);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_START);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_STOP);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_RESPOND_HELP);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_PROCESS_ALL);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_STOP_ALL);
  ipcMain.removeHandler(IPC_CHANNELS.RALPH_TASK_GET_PROMPT);
}
