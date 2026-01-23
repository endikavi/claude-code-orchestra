import { McpToolDefinition } from '@shared/types/mcp';
import { getProxyService } from '../../ProxyService';
import { getWebServer } from '../../WebServer';
import type { PreviewOpenParams } from '@shared/types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ProxyDependencies {
  // No external dependencies needed - we use singletons
}

/**
 * Register proxy-related MCP tools
 */
export function registerProxyTools(
  tools: Map<string, McpToolDefinition>,
  _deps: ProxyDependencies
): void {
  // Tool: preview_open - Open a web preview in the dashboard
  tools.set('preview_open', {
    name: 'preview_open',
    description:
      'Open a web preview of a local development server in the Orchestra dashboard. Use this when you want to show the user a preview of their running application (e.g., after starting a dev server on localhost:3000).',
    inputSchema: {
      type: 'object',
      properties: {
        port: {
          type: 'number',
          description: 'The port where the development server is running (e.g., 3000, 5173, 8080)',
        },
        path: {
          type: 'string',
          description: 'The initial path to load (default: "/")',
        },
        split: {
          type: 'boolean',
          description: 'Open in split view alongside the terminal (default: true)',
        },
        title: {
          type: 'string',
          description: 'Optional title for the preview tab',
        },
      },
      required: ['port'],
    },
    handler: (args, context) => {
      try {
        const params = args as PreviewOpenParams;
        const proxyService = getProxyService();

        // Check if proxy is enabled
        if (!proxyService.isEnabled()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: 'Web proxy is disabled. Enable it in Settings > Proxy to use preview.',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Validate port range
        if (params.port < 1024 || params.port > 65535) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: `Port must be between 1024 and 65535. Got: ${params.port}`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Check if port is allowed
        if (!proxyService.isPortAllowed(params.port)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: `Port ${params.port} is not in the allowed list. Add it in Settings > Proxy.`,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Broadcast the proxy open event to clients
        const webServer = getWebServer();
        webServer.broadcastProxyOpen({
          port: params.port,
          path: params.path || '/',
          split: params.split !== false, // Default to true
          title: params.title,
          instanceId: context.instanceId,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Preview opened for localhost:${params.port}${params.path || '/'}`,
                  port: params.port,
                  path: params.path || '/',
                  split: params.split !== false,
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
                  success: false,
                  error: error instanceof Error ? error.message : 'Failed to open preview',
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

  // Tool: preview_get_ports - Get list of allowed preview ports
  tools.set('preview_get_ports', {
    name: 'preview_get_ports',
    description:
      'Get the list of ports allowed for web preview. Use this to check if a port is available for preview before using preview_open.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, _context) => {
      try {
        const proxyService = getProxyService();
        const config = proxyService.getConfig();
        const ports = proxyService.getAllowedPorts();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  enabled: config.enabled,
                  ports: ports.map((p) => ({
                    port: p.port,
                    description: p.description || null,
                  })),
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
                  error: error instanceof Error ? error.message : 'Failed to get ports',
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

  // Tool: preview_get_console - Get console entries from a preview view
  tools.set('preview_get_console', {
    name: 'preview_get_console',
    description:
      'Get console log entries (log, warn, error, info) from a web preview. Use this to debug issues in the previewed application by checking for JavaScript errors or log messages.',
    inputSchema: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['all', 'log', 'warn', 'error', 'info', 'debug'],
          description: 'Filter by log level. Default: "all"',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of entries to return. Default: 50',
        },
      },
      required: [],
    },
    handler: (args, context) => {
      try {
        const { level = 'all', limit = 50 } = args as { level?: string; limit?: number };

        // Get console entries from the renderer via WebSocket broadcast
        const webServer = getWebServer();
        const entries = webServer.getDevToolsConsoleEntries(context.instanceId, level, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  count: entries.length,
                  entries: entries.map(
                    (e: {
                      level: string;
                      message: string;
                      timestamp: number;
                      source?: string;
                      line?: number;
                    }) => ({
                      level: e.level,
                      message: e.message,
                      timestamp: new Date(e.timestamp).toISOString(),
                      source: e.source,
                      line: e.line,
                    })
                  ),
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
                  success: false,
                  error: error instanceof Error ? error.message : 'Failed to get console entries',
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

  // Tool: preview_toggle_inspector - Toggle element inspector mode
  tools.set('preview_toggle_inspector', {
    name: 'preview_toggle_inspector',
    description:
      'Toggle the element inspector mode in the web preview. When enabled, hovering over elements highlights them and right-clicking shows element information.',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Enable or disable inspector mode. If not specified, toggles current state.',
        },
      },
      required: [],
    },
    handler: (args, context) => {
      try {
        const { enabled } = args as { enabled?: boolean };

        // Send toggle command to renderer via WebSocket broadcast
        const webServer = getWebServer();
        webServer.broadcastDevToolsCommand(context.instanceId, {
          type:
            enabled === undefined
              ? 'toggle-inspector'
              : enabled
                ? 'enable-inspector'
                : 'disable-inspector',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message:
                    enabled === undefined
                      ? 'Inspector mode toggled'
                      : `Inspector mode ${enabled ? 'enabled' : 'disabled'}`,
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
                  success: false,
                  error: error instanceof Error ? error.message : 'Failed to toggle inspector',
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

  // Tool: preview_clear_console - Clear console entries
  tools.set('preview_clear_console', {
    name: 'preview_clear_console',
    description: 'Clear all console log entries from the web preview.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: (_args, context) => {
      try {
        const webServer = getWebServer();
        webServer.broadcastDevToolsCommand(context.instanceId, {
          type: 'clear-console',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Console cleared',
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
                  success: false,
                  error: error instanceof Error ? error.message : 'Failed to clear console',
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

  console.log('[MCP] Registered 5 proxy tools');
}
