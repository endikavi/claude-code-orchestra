import { McpToolDefinition } from '@shared/types/mcp';
import { SharedContextStore } from '../../SharedContextStore';
import type {
  PublishContextRequest,
  ContributeKnowledgeRequest,
  InstanceWorkStatus,
} from '@shared/types/sharedContext';

/**
 * Register shared context MCP tools
 * These tools allow Claude instances to share context with each other
 */
export function registerContextTools(tools: Map<string, McpToolDefinition>): void {
  const contextStore = SharedContextStore.getInstance();

  // Tool 1: Get Peers
  tools.set('context_get_peers', {
    name: 'context_get_peers',
    description:
      'Get the current context of other Claude instances working on the same project. ' +
      'Use this to see what tasks others are working on, what files they are editing, ' +
      'and any notes they have shared. Helps avoid conflicts and enables collaboration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, context) => {
      try {
        const peers = contextStore
          .getAllInstanceContexts(context.projectId)
          .filter((ctx) => ctx.instanceId !== context.instanceId);

        if (peers.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    peers: [],
                    message: 'No other instances currently active in this project',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const peerData = peers.map((peer) => ({
          instanceId: peer.instanceId.slice(0, 8) + '...', // Shortened ID
          workStatus: peer.workStatus,
          currentTask: peer.currentTask || null,
          currentFiles: peer.currentFiles.slice(0, 5), // Limit files shown
          discoveredPatterns: peer.discoveredPatterns.slice(0, 3),
          notesForOthers: peer.notesForOthers.slice(0, 3),
          isSubagent: peer.isSubagent || false,
          model: peer.model,
          updatedAt: peer.updatedAt,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  peers: peerData,
                  totalPeers: peers.length,
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
                { error: error instanceof Error ? error.message : 'Unknown error' },
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

  // Tool 2: Publish Context
  tools.set('context_publish', {
    name: 'context_publish',
    description:
      'Publish your current context so other instances can see what you are working on. ' +
      'Call this when starting a new task, working on specific files, or when you want ' +
      'to share notes with other instances. Helps prevent conflicts and improve coordination.',
    inputSchema: {
      type: 'object',
      properties: {
        workStatus: {
          type: 'string',
          description:
            'What you are currently doing: idle, exploring, implementing, testing, reviewing, planning, waiting',
          enum: [
            'idle',
            'exploring',
            'implementing',
            'testing',
            'reviewing',
            'planning',
            'waiting',
          ],
        },
        currentTask: {
          type: 'string',
          description: 'Brief description of your current task (max 200 chars)',
        },
        currentFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Files you are currently working on',
        },
        discoveredPatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Patterns or insights you have discovered about the codebase',
        },
        notesForOthers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Notes or warnings you want to share with other instances',
        },
      },
      required: [],
    },
    handler: (args, context) => {
      try {
        const request: PublishContextRequest = {
          workStatus: args.workStatus as InstanceWorkStatus | undefined,
          currentTask: args.currentTask as string | undefined,
          currentFiles: args.currentFiles as string[] | undefined,
          discoveredPatterns: args.discoveredPatterns as string[] | undefined,
          notesForOthers: args.notesForOthers as string[] | undefined,
        };

        // Truncate currentTask if too long
        if (request.currentTask && request.currentTask.length > 200) {
          request.currentTask = request.currentTask.slice(0, 197) + '...';
        }

        const updatedContext = contextStore.setInstanceContext(
          context.instanceId,
          context.projectId,
          request
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Context published successfully',
                  context: {
                    workStatus: updatedContext.workStatus,
                    currentTask: updatedContext.currentTask,
                    currentFiles: updatedContext.currentFiles.length,
                  },
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
                { error: error instanceof Error ? error.message : 'Unknown error' },
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

  // Tool 3: Get Project Knowledge
  tools.set('context_get_project_knowledge', {
    name: 'context_get_project_knowledge',
    description:
      'Get accumulated knowledge about this project discovered by previous instances. ' +
      'Includes architecture overview, coding conventions, important files, and warnings. ' +
      'Use this before starting work to leverage existing discoveries.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, context) => {
      try {
        const knowledge = contextStore.getProjectKnowledge(context.projectId);

        if (!knowledge) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    knowledge: null,
                    message:
                      'No project knowledge accumulated yet. ' +
                      'Use context_contribute_knowledge to share discoveries.',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  architectureSummary: knowledge.architectureSummary || null,
                  techStack: knowledge.techStack || [],
                  conventions: knowledge.conventions.slice(0, 10).map((c) => ({
                    type: c.type,
                    description: c.description,
                  })),
                  importantFiles: knowledge.importantFiles.slice(0, 10).map((f) => ({
                    path: f.path,
                    description: f.description,
                  })),
                  warnings: knowledge.warnings.slice(0, 5).map((w) => ({
                    severity: w.severity,
                    description: w.description,
                  })),
                  entryPoints: knowledge.entryPoints || [],
                  keyDirectories: knowledge.keyDirectories || {},
                  updatedAt: knowledge.updatedAt,
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
                { error: error instanceof Error ? error.message : 'Unknown error' },
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

  // Tool 4: Contribute Knowledge
  tools.set('context_contribute_knowledge', {
    name: 'context_contribute_knowledge',
    description:
      'Contribute knowledge about the project for future instances to use. ' +
      'Share architecture insights, coding conventions, important files, or warnings. ' +
      'This knowledge persists and helps other instances work more effectively.',
    inputSchema: {
      type: 'object',
      properties: {
        architectureSummary: {
          type: 'string',
          description:
            'High-level overview of the project architecture. ' +
            'Will replace existing summary if provided.',
        },
        techStack: {
          type: 'array',
          items: { type: 'string' },
          description: 'Technologies and frameworks used (e.g., React, Express, TypeScript)',
        },
        convention: {
          type: 'object',
          description: 'A coding convention or pattern to document',
          properties: {
            type: {
              type: 'string',
              enum: ['naming', 'architecture', 'testing', 'style', 'other'],
            },
            description: { type: 'string' },
            examples: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['type', 'description'],
        },
        importantFile: {
          type: 'object',
          description: 'An important file to document',
          properties: {
            path: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['path', 'description'],
        },
        warning: {
          type: 'object',
          description: 'A warning or thing to avoid',
          properties: {
            severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
            description: { type: 'string' },
            relatedFiles: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['severity', 'description'],
        },
        entryPoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Main entry point files of the project',
        },
        keyDirectories: {
          type: 'object',
          description:
            'Important directories with descriptions (e.g., {"src/api": "REST endpoints"})',
          additionalProperties: { type: 'string' },
        },
      },
      required: [],
    },
    handler: (args, context) => {
      try {
        const request: ContributeKnowledgeRequest = {};

        if (args.architectureSummary) {
          request.architectureSummary = String(args.architectureSummary).slice(0, 2000);
        }
        if (args.techStack && Array.isArray(args.techStack)) {
          request.techStack = args.techStack.map(String).slice(0, 20);
        }
        if (args.convention && typeof args.convention === 'object') {
          const conv = args.convention as Record<string, unknown>;
          const convDesc = typeof conv.description === 'string' ? conv.description : '';
          request.convention = {
            type:
              (conv.type as 'naming' | 'architecture' | 'testing' | 'style' | 'other') || 'other',
            description: convDesc.slice(0, 500),
            examples: Array.isArray(conv.examples)
              ? conv.examples.map(String).slice(0, 5)
              : undefined,
          };
        }
        if (args.importantFile && typeof args.importantFile === 'object') {
          const file = args.importantFile as Record<string, unknown>;
          const filePath = typeof file.path === 'string' ? file.path : '';
          const fileDesc = typeof file.description === 'string' ? file.description : '';
          request.importantFile = {
            path: filePath,
            description: fileDesc.slice(0, 200),
          };
        }
        if (args.warning && typeof args.warning === 'object') {
          const warn = args.warning as Record<string, unknown>;
          const warnDesc = typeof warn.description === 'string' ? warn.description : '';
          request.warning = {
            severity: (warn.severity as 'info' | 'warning' | 'critical') || 'info',
            description: warnDesc.slice(0, 500),
            relatedFiles: Array.isArray(warn.relatedFiles)
              ? warn.relatedFiles.map(String).slice(0, 10)
              : undefined,
          };
        }
        if (args.entryPoints && Array.isArray(args.entryPoints)) {
          request.entryPoints = args.entryPoints.map(String).slice(0, 10);
        }
        if (args.keyDirectories && typeof args.keyDirectories === 'object') {
          request.keyDirectories = {};
          for (const [key, value] of Object.entries(args.keyDirectories)) {
            request.keyDirectories[key] = String(value).slice(0, 200);
          }
        }

        const knowledge = contextStore.contributeKnowledge(
          context.projectId,
          context.instanceId,
          request
        );

        const contributions: string[] = [];
        if (request.architectureSummary) contributions.push('architecture');
        if (request.techStack) contributions.push('tech stack');
        if (request.convention) contributions.push('convention');
        if (request.importantFile) contributions.push('important file');
        if (request.warning) contributions.push('warning');
        if (request.entryPoints) contributions.push('entry points');
        if (request.keyDirectories) contributions.push('key directories');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Knowledge contributed: ${contributions.join(', ') || 'nothing'}`,
                  totalConventions: knowledge.conventions.length,
                  totalImportantFiles: knowledge.importantFiles.length,
                  totalWarnings: knowledge.warnings.length,
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
                { error: error instanceof Error ? error.message : 'Unknown error' },
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

  // Tool 5: Get Summary
  tools.set('context_get_summary', {
    name: 'context_get_summary',
    description:
      'Get a complete summary of the shared context including active instances and project knowledge. ' +
      'Returns a human-readable overview. Use this for a quick understanding of the current state.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, context) => {
      try {
        const summary = contextStore.getContextSummary(context.projectId);

        return {
          content: [
            {
              type: 'text',
              text: summary.overview || 'No context available yet.',
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: error instanceof Error ? error.message : 'Unknown error' },
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

  console.log('[MCP] Registered 5 context tools');
}
