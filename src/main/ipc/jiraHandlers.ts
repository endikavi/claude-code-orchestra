import { ipcMain } from 'electron';
import { IPC_CHANNELS } from './channels';
import { DataStore } from '../services/DataStore';
import { getJiraService } from '../services/JiraService';
import { getRalphTaskManager } from '../services/RalphTaskManager';
import type { JiraGlobalConfig, JiraIssue } from '@shared/types/jira';

/**
 * Setup IPC handlers for Jira integration
 */
export function setupJiraHandlers(): void {
  let dataStore: DataStore;
  let jiraService: ReturnType<typeof getJiraService>;
  let taskManager: ReturnType<typeof getRalphTaskManager>;

  try {
    dataStore = DataStore.getInstance();
    jiraService = getJiraService();
    taskManager = getRalphTaskManager();
  } catch (error) {
    console.error('[JiraHandlers] Failed to initialize services:', error);
    return;
  }

  // Get global Jira configuration
  ipcMain.handle(IPC_CHANNELS.JIRA_GET_GLOBAL_CONFIG, () => {
    return dataStore.getJiraGlobalConfig();
  });

  // Update global Jira configuration
  ipcMain.handle(
    IPC_CHANNELS.JIRA_UPDATE_GLOBAL_CONFIG,
    (_event, config: Partial<JiraGlobalConfig>) => {
      return dataStore.updateJiraGlobalConfig(config);
    }
  );

  // Validate Jira credentials
  ipcMain.handle(IPC_CHANNELS.JIRA_VALIDATE_CREDENTIALS, async () => {
    try {
      const result = await jiraService.validateCredentials();
      if (result.valid) {
        // Mark as configured if validation succeeds
        dataStore.updateJiraGlobalConfig({ isConfigured: true });
      }
      return result;
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Get Jira boards
  ipcMain.handle(IPC_CHANNELS.JIRA_GET_BOARDS, async () => {
    try {
      const boards = await jiraService.getBoards();
      return { success: true, boards };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get boards',
      };
    }
  });

  // Get project statuses
  ipcMain.handle(IPC_CHANNELS.JIRA_GET_STATUSES, async (_event, projectKey: string) => {
    try {
      const statuses = await jiraService.getProjectStatuses(projectKey);
      return { success: true, statuses };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get statuses',
      };
    }
  });

  // Search issues
  ipcMain.handle(
    IPC_CHANNELS.JIRA_SEARCH_ISSUES,
    async (
      _event,
      projectKey: string,
      filter: 'mine' | 'all' = 'mine',
      statusFilter: 'all' | 'todo' | 'in_progress' | 'done' = 'all'
    ) => {
      try {
        const issues = await jiraService.searchIssues(projectKey, filter, statusFilter);
        return { success: true, issues };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to search issues',
        };
      }
    }
  );

  // Import issues as Ralph Tasks
  ipcMain.handle(
    IPC_CHANNELS.JIRA_IMPORT_ISSUES,
    (_event, projectId: string, issues: JiraIssue[]) => {
      try {
        const imported: string[] = [];
        const errors: string[] = [];

        for (const issue of issues) {
          try {
            // Check if task already exists with this Jira issue key
            const existingTasks = taskManager.getTasksByProject(projectId);
            const alreadyImported = existingTasks.some((t) => t.jiraIssueKey === issue.key);

            if (alreadyImported) {
              errors.push(`${issue.key}: Already imported`);
              continue;
            }

            // Create Ralph task from Jira issue
            const description = issue.fields.description
              ? typeof issue.fields.description === 'string'
                ? issue.fields.description
                : JSON.stringify(issue.fields.description) // Handle ADF format
              : undefined;

            taskManager.createTask({
              projectId,
              name: `[${issue.key}] ${issue.fields.summary}`,
              description: description?.slice(0, 500), // Truncate long descriptions
              jiraIssueId: issue.id,
              jiraIssueKey: issue.key,
            });

            imported.push(issue.key);
          } catch (err) {
            errors.push(`${issue.key}: ${err instanceof Error ? err.message : 'Failed to import'}`);
          }
        }

        return {
          success: true,
          imported,
          errors,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to import issues',
        };
      }
    }
  );

  // Transition issue to a status
  ipcMain.handle(
    IPC_CHANNELS.JIRA_TRANSITION_ISSUE,
    async (_event, issueKey: string, targetStatusId: string) => {
      try {
        const success = await jiraService.transitionIssueToStatus(issueKey, targetStatusId);
        return { success };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to transition issue',
        };
      }
    }
  );

  // Assign issue to user
  ipcMain.handle(
    IPC_CHANNELS.JIRA_ASSIGN_ISSUE,
    async (_event, issueKey: string, accountId: string) => {
      try {
        await jiraService.assignIssue(issueKey, accountId);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to assign issue',
        };
      }
    }
  );

  // Get current user
  ipcMain.handle(IPC_CHANNELS.JIRA_GET_CURRENT_USER, async () => {
    try {
      const user = await jiraService.getCurrentUser();
      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get current user',
      };
    }
  });

  // Get imported Jira issue keys for a project
  ipcMain.handle(IPC_CHANNELS.JIRA_GET_IMPORTED_KEYS, (_event, projectId: string) => {
    try {
      const tasks = taskManager.getTasksByProject(projectId);
      const importedKeys = tasks
        .filter((task) => task.jiraIssueKey)
        .map((task) => task.jiraIssueKey as string);
      return { success: true, keys: importedKeys };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get imported keys',
      };
    }
  });
}

/**
 * Cleanup Jira IPC handlers
 */
export function cleanupJiraHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_GET_GLOBAL_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_UPDATE_GLOBAL_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_VALIDATE_CREDENTIALS);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_GET_BOARDS);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_GET_STATUSES);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_SEARCH_ISSUES);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_IMPORT_ISSUES);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_TRANSITION_ISSUE);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_ASSIGN_ISSUE);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_GET_CURRENT_USER);
  ipcMain.removeHandler(IPC_CHANNELS.JIRA_GET_IMPORTED_KEYS);
}
