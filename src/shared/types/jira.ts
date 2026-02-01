// Jira integration types

// Global Jira configuration (stored in jira_config table)
export interface JiraGlobalConfig {
  apiToken: string;
  baseUrl: string; // e.g., "https://yourcompany.atlassian.net"
  userEmail: string;
  isConfigured: boolean;
}

// Per-project Jira configuration (stored as JSON in projects.jiraConfig)
export interface JiraProjectConfig {
  enabled: boolean;
  boardId?: string;
  projectKey?: string;
  importFilter: 'mine' | 'all'; // Filter for importing issues
  statusMapping: {
    doing: string; // Jira status ID to transition to when task moves to "doing"
    done: string; // Jira status ID to transition to when task is completed
  };
  autoAssignOnDoing: boolean; // Auto-assign issue to current user when moving to "doing"
}

// Jira Board from Agile API
export interface JiraBoard {
  id: number;
  self: string;
  name: string;
  type: 'scrum' | 'kanban' | 'simple';
  location?: {
    projectId: number;
    projectKey: string;
    projectName: string;
  };
}

// Jira Project Status
export interface JiraStatus {
  id: string;
  name: string;
  description?: string;
  statusCategory: {
    id: number;
    key: string; // e.g., "done", "indeterminate", "new"
    name: string;
  };
}

// Jira Issue type
export interface JiraIssue {
  id: string;
  key: string; // e.g., "PROJ-123"
  self: string;
  fields: {
    summary: string;
    description?: string | null;
    status: {
      id: string;
      name: string;
      statusCategory: {
        id: number;
        key: string;
        name: string;
      };
    };
    priority?: {
      id: string;
      name: string;
      iconUrl?: string;
    };
    assignee?: JiraUser | null;
    reporter?: JiraUser | null;
    issuetype: {
      id: string;
      name: string;
      iconUrl?: string;
    };
    project: {
      id: string;
      key: string;
      name: string;
    };
    created: string;
    updated: string;
    labels?: string[];
  };
}

// Jira User
export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrls?: {
    '16x16'?: string;
    '24x24'?: string;
    '32x32'?: string;
    '48x48'?: string;
  };
  active: boolean;
}

// Jira Transition
export interface JiraTransition {
  id: string;
  name: string;
  to: {
    id: string;
    name: string;
    statusCategory: {
      id: number;
      key: string;
      name: string;
    };
  };
}

// API Response types
export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraBoardsResponse {
  startAt: number;
  maxResults: number;
  total: number;
  values: JiraBoard[];
}

export interface JiraStatusesResponse {
  id: string;
  name: string;
  statuses: JiraStatus[];
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

// Default values
export const DEFAULT_JIRA_GLOBAL_CONFIG: JiraGlobalConfig = {
  apiToken: '',
  baseUrl: '',
  userEmail: '',
  isConfigured: false,
};

export const DEFAULT_JIRA_PROJECT_CONFIG: JiraProjectConfig = {
  enabled: false,
  importFilter: 'mine',
  statusMapping: {
    doing: '',
    done: '',
  },
  autoAssignOnDoing: false,
};
