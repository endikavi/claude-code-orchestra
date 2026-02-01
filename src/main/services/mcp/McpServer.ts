import {
  McpRequest,
  McpResponse,
  McpToolDefinition,
  McpToolContext,
  McpErrorCode,
} from '@shared/types/mcp';
import { MetricsService } from '../MetricsService';
import { ProcessManager } from '../ProcessManager';
import { DataStore } from '../DataStore';
import { GitStatusManager } from '../GitStatusManager';
import { registerProjectTools } from './tools/ProjectTools';
import { registerProxyTools } from './tools/ProxyTools';
import { registerContextTools } from './tools/ContextTools';
import { registerPermissionPromptTool } from './tools/PermissionPromptTool';
import { registerSearchTools } from './tools/SearchTools';

/**
 * MCP Server Implementation
 *
 * Exposes Orchestra functionality to Claude CLI instances via MCP protocol.
 * Implements JSON-RPC 2.0 over HTTP.
 */
export class McpServer {
  private tools: Map<string, McpToolDefinition> = new Map();
  private instanceTokens: Map<string, McpToolContext> = new Map();
  private requestCounts: Map<string, number[]> = new Map();
  private readonly RATE_LIMIT = 100; // requests per minute
  private readonly RATE_WINDOW = 60000; // 1 minute in ms

  constructor(
    private metrics: MetricsService,
    private processManager: ProcessManager,
    private dataStore: DataStore,
    private gitStatusManager: GitStatusManager
  ) {
    this.initializeTools();
  }

  /**
   * Initialize all MCP tools
   */
  private initializeTools(): void {
    // Register project/git tools
    registerProjectTools(this.tools, {
      dataStore: this.dataStore,
      gitStatusManager: this.gitStatusManager,
      processManager: this.processManager,
    });

    // Register proxy/preview tools
    registerProxyTools(this.tools, {});

    // Register shared context tools
    registerContextTools(this.tools);

    // Register permission prompt tool (for --permission-prompt-tool support)
    registerPermissionPromptTool(this.tools);

    // Register semantic search tools
    registerSearchTools(this.tools);

    console.log(`[MCP] Initialized ${this.tools.size} tools`);
  }

  /**
   * Register an instance token for authentication
   */
  public registerInstanceToken(token: string, context: McpToolContext): void {
    this.instanceTokens.set(token, context);
    console.log(`[MCP] Registered token for instance ${context.instanceId}`);
  }

  /**
   * Unregister an instance token (called when instance terminates)
   */
  public unregisterInstanceToken(token: string): void {
    const context = this.instanceTokens.get(token);
    if (context) {
      this.instanceTokens.delete(token);
      this.requestCounts.delete(token);
      console.log(`[MCP] Unregistered token for instance ${context.instanceId}`);
    }
  }

  /**
   * Authenticate request and return context
   */
  public authenticateRequest(token: string | undefined): McpToolContext | null {
    if (!token) {
      return null;
    }

    const context = this.instanceTokens.get(token);
    if (!context) {
      return null;
    }

    // Check rate limit
    if (!this.checkRateLimit(token)) {
      return null;
    }

    return context;
  }

  /**
   * Check rate limit for token
   */
  private checkRateLimit(token: string): boolean {
    const now = Date.now();
    const requests = this.requestCounts.get(token) || [];

    // Remove requests outside the window
    const recentRequests = requests.filter((timestamp) => now - timestamp < this.RATE_WINDOW);

    if (recentRequests.length >= this.RATE_LIMIT) {
      console.warn(`[MCP] Rate limit exceeded for token ${token.substring(0, 8)}...`);
      return false;
    }

    recentRequests.push(now);
    this.requestCounts.set(token, recentRequests);
    return true;
  }

  /**
   * Handle MCP request (JSON-RPC 2.0)
   */
  public async handleRequest(request: McpRequest, context: McpToolContext): Promise<McpResponse> {
    try {
      // Validate JSON-RPC format
      if (request.jsonrpc !== '2.0') {
        return this.errorResponse(
          request.id,
          McpErrorCode.INVALID_REQUEST,
          'Invalid JSON-RPC version'
        );
      }

      if (!request.id) {
        return this.errorResponse(null, McpErrorCode.INVALID_REQUEST, 'Missing request id');
      }

      switch (request.method) {
        case 'tools/list':
          return this.handleListTools(request.id);

        case 'tools/call':
          if (!request.params?.name) {
            return this.errorResponse(request.id, McpErrorCode.INVALID_PARAMS, 'Missing tool name');
          }
          return await this.handleCallTool(
            request.id,
            request.params.name,
            request.params.arguments || {},
            context
          );

        default:
          return this.errorResponse(
            request.id,
            McpErrorCode.METHOD_NOT_FOUND,
            `Method not found: ${request.method as string}`
          );
      }
    } catch (error) {
      console.error('[MCP] Request handling error:', error);
      return this.errorResponse(
        request.id || null,
        McpErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : 'Internal server error'
      );
    }
  }

  /**
   * Handle tools/list request
   */
  private handleListTools(id: string | number): McpResponse {
    const toolsList = Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: toolsList,
      },
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleCallTool(
    id: string | number,
    toolName: string,
    args: Record<string, any>,
    context: McpToolContext
  ): Promise<McpResponse> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      return this.errorResponse(id, McpErrorCode.TOOL_NOT_FOUND, `Tool not found: ${toolName}`);
    }

    try {
      const result = await tool.handler(args, context);

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error) {
      console.error(`[MCP] Tool execution error (${toolName}):`, error);
      return this.errorResponse(
        id,
        McpErrorCode.TOOL_EXECUTION_ERROR,
        error instanceof Error ? error.message : 'Tool execution failed',
        { tool: toolName, args }
      );
    }
  }

  /**
   * Create error response
   */
  private errorResponse(
    id: string | number | null,
    code: McpErrorCode,
    message: string,
    data?: any
  ): McpResponse {
    return {
      jsonrpc: '2.0',
      id: id || 0,
      error: {
        code,
        message,
        data,
      },
    };
  }

  /**
   * Get statistics
   */
  public getStats(): {
    toolCount: number;
    activeInstances: number;
    totalRequests: number;
  } {
    const totalRequests = Array.from(this.requestCounts.values()).reduce(
      (sum, requests) => sum + requests.length,
      0
    );

    return {
      toolCount: this.tools.size,
      activeInstances: this.instanceTokens.size,
      totalRequests,
    };
  }
}
