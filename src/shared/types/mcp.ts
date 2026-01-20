/**
 * MCP (Model Context Protocol) Type Definitions
 *
 * These types define the structure for the MCP server that exposes
 * Orchestra functionality to Claude CLI instances.
 */

/**
 * MCP Tool definition with JSON Schema for input validation
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP JSON-RPC 2.0 Request format
 */
export interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/list' | 'tools/call';
  params?: {
    name?: string;
    arguments?: Record<string, any>;
  };
}

/**
 * MCP JSON-RPC 2.0 Response format
 */
export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * MCP Tool execution result
 */
export interface McpToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

/**
 * MCP Error codes following JSON-RPC 2.0 specification
 */
export enum McpErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  UNAUTHORIZED = -32001,
  TOOL_NOT_FOUND = -32002,
  TOOL_EXECUTION_ERROR = -32003,
}

/**
 * Context passed to tool handlers
 */
export interface McpToolContext {
  instanceId: string;
  projectId: string;
  projectPath: string;
  instanceToken: string;
}

/**
 * Tool handler function signature
 */
export type McpToolHandler = (
  args: Record<string, any>,
  context: McpToolContext
) => Promise<McpToolResult> | McpToolResult;

/**
 * Internal tool definition with handler
 */
export interface McpToolDefinition extends McpTool {
  handler: McpToolHandler;
}
