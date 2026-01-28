import type { McpToolDefinition } from '@shared/types/mcp';
import type { ClaudePermissionResponse } from '@shared/types/permissionPrompt';
import { getPermissionPromptManager } from '../../PermissionPromptManager';

/**
 * Register the permission_prompt MCP tool
 *
 * This tool is called by Claude CLI when using --permission-prompt-tool mcp__orchestra__permission_prompt
 * Claude sends the tool name and input that requires permission, and we return the user's decision.
 */
export function registerPermissionPromptTool(tools: Map<string, McpToolDefinition>): void {
  tools.set('permission_prompt', {
    name: 'permission_prompt',
    description:
      'Handle permission prompts from Claude CLI. This tool is called when Claude needs user approval ' +
      'to execute a potentially dangerous action like running a bash command or editing files. ' +
      'The tool waits for user response and returns the decision.',
    inputSchema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'The name of the tool requesting permission (e.g., "Bash", "Edit", "Write")',
        },
        input: {
          type: 'object',
          description: 'The input parameters for the tool',
        },
      },
      required: ['tool_name', 'input'],
    },
    handler: async (args, context) => {
      const toolName = args.tool_name as string;
      const toolInput = (args.input as Record<string, unknown>) || {};

      console.log(
        `[PermissionPromptTool] Received permission request for tool: ${toolName}, instance: ${context.instanceId}`
      );

      try {
        const manager = getPermissionPromptManager();

        // Request permission and wait for user response
        // This is an async operation that will resolve when user clicks Allow/Deny
        // or after timeout (default 5 minutes)
        const response = await manager.requestPermission(context.instanceId, toolName, toolInput);

        // Format response for Claude CLI
        const claudeResponse: ClaudePermissionResponse = response.allowed
          ? {
              behavior: 'allow',
              updatedInput: response.updatedInput || toolInput,
            }
          : {
              behavior: 'deny',
              message: response.message || 'User denied this action',
            };

        console.log(
          `[PermissionPromptTool] Returning response for ${toolName}: ${claudeResponse.behavior}`
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(claudeResponse),
            },
          ],
        };
      } catch (error) {
        // If the permission was cancelled (e.g., instance killed), deny the action
        console.error(`[PermissionPromptTool] Error handling permission request:`, error);

        const denyResponse: ClaudePermissionResponse = {
          behavior: 'deny',
          message:
            error instanceof Error ? error.message : 'Permission request failed due to an error',
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(denyResponse),
            },
          ],
          isError: true,
        };
      }
    },
  });

  console.log('[MCP] Registered permission_prompt tool');
}
