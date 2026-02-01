import { DataStore } from './DataStore';
import type {
  JiraGlobalConfig,
  JiraBoard,
  JiraStatus,
  JiraIssue,
  JiraUser,
  JiraTransition,
  JiraSearchResponse,
  JiraBoardsResponse,
  JiraStatusesResponse,
  JiraTransitionsResponse,
} from '@shared/types/jira';

// Singleton instance
let instance: JiraService | null = null;

export class JiraService {
  private dataStore: DataStore;

  private constructor() {
    this.dataStore = DataStore.getInstance();
  }

  static getInstance(): JiraService {
    if (!instance) {
      instance = new JiraService();
    }
    return instance;
  }

  /**
   * Get the base64 encoded auth header for Jira API
   */
  private getAuthHeader(): string {
    const config = this.dataStore.getJiraGlobalConfig();
    const auth = Buffer.from(`${config.userEmail}:${config.apiToken}`).toString('base64');
    return `Basic ${auth}`;
  }

  /**
   * Make a request to the Jira REST API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isAgileApi = false
  ): Promise<T> {
    const config = this.dataStore.getJiraGlobalConfig();

    if (!config.isConfigured) {
      throw new Error('Jira is not configured');
    }

    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const apiPath = isAgileApi ? '/rest/agile/1.0' : '/rest/api/3';
    const url = `${baseUrl}${apiPath}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Jira API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errorMessages?.length > 0) {
          errorMessage = errorJson.errorMessages.join(', ');
        } else if (errorJson.errors) {
          errorMessage = Object.values(errorJson.errors).join(', ');
        }
      } catch {
        if (errorText) {
          errorMessage = errorText;
        }
      }
      throw new Error(errorMessage);
    }

    // Handle empty response
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Validate Jira credentials by fetching current user
   * This method makes a direct API call without checking isConfigured,
   * since it's used to SET isConfigured upon successful validation.
   */
  async validateCredentials(): Promise<{ valid: boolean; user?: JiraUser; error?: string }> {
    try {
      const config = this.dataStore.getJiraGlobalConfig();

      // Check that we have the required fields
      if (!config.baseUrl || !config.userEmail || !config.apiToken) {
        return {
          valid: false,
          error: 'Missing required fields: baseUrl, userEmail, or apiToken',
        };
      }

      // Make direct API call without using request() which checks isConfigured
      const baseUrl = config.baseUrl.replace(/\/$/, '');
      const url = `${baseUrl}/rest/api/3/myself`;
      const auth = Buffer.from(`${config.userEmail}:${config.apiToken}`).toString('base64');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Jira API error: ${response.status} ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.errorMessages?.length > 0) {
            errorMessage = errorJson.errorMessages.join(', ');
          } else if (errorJson.errors) {
            errorMessage = Object.values(errorJson.errors).join(', ');
          }
        } catch {
          if (errorText) {
            errorMessage = errorText;
          }
        }
        return { valid: false, error: errorMessage };
      }

      const user = (await response.json()) as JiraUser;
      return { valid: true, user };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<JiraUser> {
    return this.request<JiraUser>('/myself');
  }

  /**
   * Get all boards
   */
  async getBoards(): Promise<JiraBoard[]> {
    const response = await this.request<JiraBoardsResponse>('/board', {}, true);
    return response.values || [];
  }

  /**
   * Get statuses for a project
   */
  async getProjectStatuses(projectKey: string): Promise<JiraStatus[]> {
    const response = await this.request<JiraStatusesResponse[]>(`/project/${projectKey}/statuses`);
    // Flatten all statuses from all issue types
    const allStatuses: JiraStatus[] = [];
    const seenIds = new Set<string>();

    for (const issueType of response) {
      for (const status of issueType.statuses || []) {
        if (!seenIds.has(status.id)) {
          seenIds.add(status.id);
          allStatuses.push(status);
        }
      }
    }

    return allStatuses;
  }

  /**
   * Search for issues using JQL (using new /search/jql endpoint per CHANGE-2046)
   * Migration: /rest/api/3/search → /rest/api/3/search/jql
   * @param projectKey - Jira project key
   * @param filter - 'mine' for current user's issues, 'all' for all issues
   * @param statusFilter - Filter by status category: 'all', 'todo', 'in_progress', 'done'
   * @param additionalJql - Additional JQL to append
   */
  async searchIssues(
    projectKey: string,
    filter: 'mine' | 'all' = 'mine',
    statusFilter: 'all' | 'todo' | 'in_progress' | 'done' = 'all',
    additionalJql?: string
  ): Promise<JiraIssue[]> {
    let jql = `project = "${projectKey}"`;

    if (filter === 'mine') {
      jql += ' AND assignee = currentUser()';
    }

    // Apply status category filter
    switch (statusFilter) {
      case 'todo':
        jql += ' AND statusCategory = "To Do"';
        break;
      case 'in_progress':
        jql += ' AND statusCategory = "In Progress"';
        break;
      case 'done':
        jql += ' AND statusCategory = "Done"';
        break;
      case 'all':
      default:
        // No status filter - show all including done
        break;
    }

    if (additionalJql) {
      jql += ` AND ${additionalJql}`;
    }

    jql += ' ORDER BY updated DESC';

    // Use the new /search/jql endpoint (migrated from /search per CHANGE-2046)
    const fields =
      'summary,description,status,priority,assignee,reporter,issuetype,project,created,updated,labels';
    const response = await this.request<JiraSearchResponse>(
      `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${fields}`
    );

    return response.issues || [];
  }

  /**
   * Get available transitions for an issue
   */
  async getIssueTransitions(issueKey: string): Promise<JiraTransition[]> {
    const response = await this.request<JiraTransitionsResponse>(`/issue/${issueKey}/transitions`);
    return response.transitions || [];
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request(`/issue/${issueKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({
        transition: { id: transitionId },
      }),
    });
  }

  /**
   * Find transition ID for a target status
   */
  async findTransitionToStatus(issueKey: string, targetStatusId: string): Promise<string | null> {
    const transitions = await this.getIssueTransitions(issueKey);
    const transition = transitions.find((t) => t.to.id === targetStatusId);
    return transition?.id || null;
  }

  /**
   * Transition issue to a specific status (finds the right transition)
   */
  async transitionIssueToStatus(issueKey: string, targetStatusId: string): Promise<boolean> {
    const transitionId = await this.findTransitionToStatus(issueKey, targetStatusId);
    if (!transitionId) {
      console.warn(
        `[JiraService] No transition found to status ${targetStatusId} for issue ${issueKey}`
      );
      return false;
    }

    await this.transitionIssue(issueKey, transitionId);
    return true;
  }

  /**
   * Assign an issue to a user
   */
  async assignIssue(issueKey: string, accountId: string): Promise<void> {
    await this.request(`/issue/${issueKey}/assignee`, {
      method: 'PUT',
      body: JSON.stringify({ accountId }),
    });
  }

  /**
   * Get issue details
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(
      `/issue/${issueKey}?fields=summary,description,status,priority,assignee,reporter,issuetype,project,created,updated,labels`
    );
  }

  /**
   * Check if an issue exists
   */
  async issueExists(issueKey: string): Promise<boolean> {
    try {
      await this.getIssue(issueKey);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get the singleton JiraService instance
 */
export function getJiraService(): JiraService {
  return JiraService.getInstance();
}
