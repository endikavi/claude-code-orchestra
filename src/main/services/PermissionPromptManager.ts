import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  PermissionPromptRequest,
  PermissionPromptResponse,
  PendingPermission,
} from '@shared/types/permissionPrompt';

// Default timeout for permission prompts: 5 minutes
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * PermissionPromptManager
 *
 * Manages permission prompts from Claude CLI instances.
 * When a Claude instance uses --permission-prompt-tool mcp__orchestra__permission_prompt,
 * Claude calls the MCP tool when it needs permission. This manager:
 *
 * 1. Creates a pending permission request with a Promise
 * 2. Emits an event to notify the renderer
 * 3. Waits for user response (or timeout)
 * 4. Returns the response to the MCP tool
 */
export class PermissionPromptManager extends EventEmitter {
  private pending: Map<string, PendingPermission> = new Map();
  private static instance: PermissionPromptManager | null = null;

  private constructor() {
    super();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): PermissionPromptManager {
    if (!PermissionPromptManager.instance) {
      PermissionPromptManager.instance = new PermissionPromptManager();
    }
    return PermissionPromptManager.instance;
  }

  /**
   * Request permission for a tool use
   * Called by the MCP permission_prompt tool handler
   *
   * @param instanceId - The Claude instance requesting permission
   * @param toolName - The tool name (e.g., "Bash", "Edit")
   * @param toolInput - The tool input parameters
   * @param timeoutMs - How long to wait for user response (default: 5 minutes)
   * @returns Promise that resolves with the user's response
   */
  async requestPermission(
    instanceId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<PermissionPromptResponse> {
    const permissionId = randomUUID();

    const request: PermissionPromptRequest = {
      id: permissionId,
      instanceId,
      toolName,
      toolInput,
      createdAt: Date.now(),
    };

    return new Promise<PermissionPromptResponse>((resolve, reject) => {
      // Set up timeout to auto-deny if user doesn't respond
      const timeout = setTimeout(() => {
        const pending = this.pending.get(permissionId);
        if (pending) {
          this.pending.delete(permissionId);
          this.emit('permission:timeout', request);
          resolve({
            allowed: false,
            message: 'Permission request timed out - automatically denied',
          });
        }
      }, timeoutMs);

      // Store the pending permission
      const pendingPermission: PendingPermission = {
        request,
        resolve,
        reject,
        timeout,
      };
      this.pending.set(permissionId, pendingPermission);

      // Emit event to notify renderer
      this.emit('permission:request', request);

      console.log(
        `[PermissionPromptManager] Permission requested: ${permissionId} for tool ${toolName} on instance ${instanceId}`
      );
    });
  }

  /**
   * Respond to a permission request
   * Called when user clicks Allow/Deny in the UI
   *
   * @param permissionId - The permission request ID
   * @param response - The user's response
   */
  respondToPermission(permissionId: string, response: PermissionPromptResponse): boolean {
    const pending = this.pending.get(permissionId);
    if (!pending) {
      console.warn(`[PermissionPromptManager] No pending permission found for ID: ${permissionId}`);
      return false;
    }

    // Clear the timeout
    clearTimeout(pending.timeout);

    // Remove from pending
    this.pending.delete(permissionId);

    // Resolve the promise
    pending.resolve(response);

    // Emit event for logging/tracking
    this.emit('permission:responded', {
      request: pending.request,
      response,
    });

    console.log(
      `[PermissionPromptManager] Permission ${permissionId} ${response.allowed ? 'allowed' : 'denied'}`
    );

    return true;
  }

  /**
   * Cancel a permission request
   * Called when the instance is killed or the request is no longer needed
   *
   * @param permissionId - The permission request ID
   */
  cancelPermission(permissionId: string): boolean {
    const pending = this.pending.get(permissionId);
    if (!pending) {
      return false;
    }

    // Clear the timeout
    clearTimeout(pending.timeout);

    // Remove from pending
    this.pending.delete(permissionId);

    // Reject the promise
    pending.reject(new Error('Permission request cancelled'));

    this.emit('permission:cancelled', pending.request);

    console.log(`[PermissionPromptManager] Permission ${permissionId} cancelled`);

    return true;
  }

  /**
   * Cancel all pending permissions for an instance
   * Called when an instance exits or is killed
   *
   * @param instanceId - The instance ID
   */
  cancelAllForInstance(instanceId: string): number {
    let cancelled = 0;
    for (const [permissionId, pending] of this.pending.entries()) {
      if (pending.request.instanceId === instanceId) {
        this.cancelPermission(permissionId);
        cancelled++;
      }
    }
    return cancelled;
  }

  /**
   * Get all pending permissions for an instance
   *
   * @param instanceId - The instance ID
   */
  getPendingForInstance(instanceId: string): PermissionPromptRequest[] {
    const requests: PermissionPromptRequest[] = [];
    for (const pending of this.pending.values()) {
      if (pending.request.instanceId === instanceId) {
        requests.push(pending.request);
      }
    }
    return requests;
  }

  /**
   * Get a specific pending permission request
   *
   * @param permissionId - The permission request ID
   */
  getPendingPermission(permissionId: string): PermissionPromptRequest | undefined {
    return this.pending.get(permissionId)?.request;
  }

  /**
   * Get all pending permissions
   */
  getAllPending(): PermissionPromptRequest[] {
    return Array.from(this.pending.values()).map((p) => p.request);
  }

  /**
   * Check if there are any pending permissions for an instance
   *
   * @param instanceId - The instance ID
   */
  hasPendingForInstance(instanceId: string): boolean {
    for (const pending of this.pending.values()) {
      if (pending.request.instanceId === instanceId) {
        return true;
      }
    }
    return false;
  }
}

// Export singleton getter
export function getPermissionPromptManager(): PermissionPromptManager {
  return PermissionPromptManager.getInstance();
}
