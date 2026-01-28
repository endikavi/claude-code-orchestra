/**
 * Permission Prompt Types
 *
 * Types for handling Claude CLI permission prompts via MCP tool.
 * When Claude needs to execute a tool that requires user permission,
 * these types define the request/response protocol.
 */

/**
 * A permission prompt request from Claude CLI
 * Sent when Claude wants to use a tool that requires user approval
 */
export interface PermissionPromptRequest {
  /** Unique identifier for this permission request */
  id: string;
  /** The Claude instance requesting permission */
  instanceId: string;
  /** Name of the tool requesting permission (e.g., "Bash", "Edit", "Write") */
  toolName: string;
  /** The input parameters for the tool */
  toolInput: Record<string, unknown>;
  /** When the request was created */
  createdAt: number;
}

/**
 * User response to a permission prompt
 */
export interface PermissionPromptResponse {
  /** Whether the user allowed the action */
  allowed: boolean;
  /** Optional modified input (if user wants to change the command) */
  updatedInput?: Record<string, unknown>;
  /** Optional message explaining the decision (especially for denials) */
  message?: string;
}

/**
 * Internal pending permission with promise resolvers
 * Used by PermissionPromptManager to track pending requests
 */
export interface PendingPermission {
  /** The request details */
  request: PermissionPromptRequest;
  /** Resolve function to complete the permission request */
  resolve: (response: PermissionPromptResponse) => void;
  /** Reject function for errors/timeouts */
  reject: (error: Error) => void;
  /** Timeout timer reference */
  timeout: NodeJS.Timeout;
}

/**
 * Claude CLI expected response format for permission-prompt-tool
 */
export interface ClaudePermissionResponse {
  /** The behavior: "allow" to proceed, "deny" to reject */
  behavior: 'allow' | 'deny';
  /** Updated input for the tool (only used when behavior is "allow") */
  updatedInput?: Record<string, unknown>;
  /** Message explaining the decision (only used when behavior is "deny") */
  message?: string;
}
