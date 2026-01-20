import { McpToolDefinition } from '@shared/types/mcp';
import { DataStore } from '../../DataStore';
import { GitStatusManager } from '../../GitStatusManager';
import { ProcessManager } from '../../ProcessManager';

interface ProjectDependencies {
  dataStore: DataStore;
  gitStatusManager: GitStatusManager;
  processManager: ProcessManager;
}

/**
 * Register project and git-related MCP tools
 */
export function registerProjectTools(
  tools: Map<string, McpToolDefinition>,
  deps: ProjectDependencies
): void {
  // Tool 1: Get Git Status
  tools.set('git_get_status', {
    name: 'git_get_status',
    description:
      'Get the current git status of the project including branch, commits ahead/behind, staged/unstaged changes, and untracked files. Use this to understand the current state before making changes.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, context) => {
      try {
        const status = deps.gitStatusManager.getStatus(context.projectPath);

        if (!status) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Not a git repository or git status unavailable',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  branch: status.branch,
                  ahead: status.ahead,
                  behind: status.behind,
                  staged: status.staged,
                  unstaged: status.unstaged,
                  untracked: status.untracked,
                  totalFiles: status.totalFiles,
                  linesAdded: status.linesAdded,
                  linesRemoved: status.linesRemoved,
                  lastCommitMessage: status.lastCommitMessage,
                  lastChecked: status.lastChecked,
                  isRepo: status.isRepo,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    },
  });

  // Tool 2: Get Project Info
  tools.set('project_get_info', {
    name: 'project_get_info',
    description:
      'Get information about the current project including name, path, description, and settings. Use this to understand project configuration and context.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, context) => {
      try {
        const project = deps.dataStore.getProjectById(context.projectId);

        if (!project) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Project not found',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  id: project.id,
                  name: project.name,
                  path: project.path,
                  description: project.description || null,
                  color: project.color || null,
                  hostname: project.hostname || null,
                  skipPermissions: project.skipPermissions || false,
                  enableMcp: project.enableMcp || false,
                  createdAt: project.createdAt,
                  updatedAt: project.updatedAt,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    },
  });

  // Tool 3: List Project Instances
  tools.set('project_list_instances', {
    name: 'project_list_instances',
    description:
      'List all Claude instances running in this project. Use this to see what other instances are active and what they are working on.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, context) => {
      try {
        const instances = deps.processManager.getInstancesByProject(context.projectId);

        if (instances.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    instances: [],
                    message: 'No other instances running in this project',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const instanceData = instances
          .filter((inst) => inst.id !== context.instanceId) // Exclude self
          .map((inst) => ({
            id: inst.id,
            status: inst.status,
            model: inst.model,
            mode: inst.mode,
            createdAt: inst.createdAt,
          }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  instances: instanceData,
                  totalInstances: instanceData.length,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    },
  });

  console.log('[MCP] Registered 3 project tools');
}
