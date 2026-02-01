import { resolve, normalize } from 'path';
import type {
  Project,
  ClaudeModel,
  InstanceMode,
  ConversationStatus,
  AgentDeliveryMethod,
  CustomAgentsConfig,
} from '@shared/types';
import { ipcLogger } from '@shared/utils/logger';

/**
 * Validation error for IPC inputs
 */
export class IpcValidationError extends Error {
  constructor(
    public channel: string,
    message: string
  ) {
    super(message);
    this.name = 'IpcValidationError';
  }
}

/**
 * Validate that a value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate that a value is a valid UUID or ID string
 */
function isValidId(value: unknown): value is string {
  return isNonEmptyString(value) && value.length >= 1 && value.length <= 128;
}

/**
 * Validate that a value is a valid path string without path traversal
 */
function isValidPath(value: unknown): value is string {
  if (!isNonEmptyString(value) || value.length > 1024) {
    return false;
  }

  // Normalize and resolve the path
  const normalized = normalize(value);

  // Reject explicit path traversal patterns
  if (normalized.includes('..')) {
    return false;
  }

  // Additional checks for Windows-specific traversal attempts
  if (process.platform === 'win32') {
    // Check for alternate data streams or other Windows-specific traversal
    if (value.includes(':') && !value.match(/^[a-zA-Z]:\\|^[a-zA-Z]:\//)) {
      // Allow drive letters like C:\ but reject other colon usage
      const driveMatch = value.match(/^([a-zA-Z]):/);
      if (!driveMatch) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate and sanitize a project path, preventing path traversal attacks
 */
function validateProjectPath(value: unknown, channel: string): string {
  if (!isValidPath(value)) {
    throw new IpcValidationError(channel, 'Invalid or potentially unsafe path');
  }

  // Resolve to absolute path for verification
  const absolutePath = resolve(value);

  // On Windows, ensure the path doesn't escape the drive
  // On Unix, ensure it doesn't traverse above root
  if (absolutePath.includes('..')) {
    throw new IpcValidationError(channel, 'Path traversal detected');
  }

  return value.trim();
}

/**
 * Validate that a value is a valid Claude model
 */
function isValidModel(value: unknown): value is ClaudeModel {
  return value === 'sonnet' || value === 'opus' || value === 'haiku';
}

/**
 * Validate that a value is a valid instance mode
 */
function isValidMode(value: unknown): value is InstanceMode {
  return value === 'interactive' || value === 'print' || value === 'stream-json';
}

/**
 * Validate that a value is a valid conversation status
 */
function isValidConversationStatus(value: unknown): value is ConversationStatus {
  return value === 'active' || value === 'completed' || value === 'error' || value === 'archived';
}

/**
 * Validate that a value is a valid agent delivery method
 */
function isValidAgentDeliveryMethod(value: unknown): value is AgentDeliveryMethod {
  return value === 'skill' || value === 'args';
}

/**
 * Validate that a value is a valid array of directory paths
 */
function isValidDirectoryArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((item) => isValidPath(item));
}

/**
 * Validate that a value is a valid custom agents config
 */
function isValidCustomAgentsConfig(value: unknown): value is CustomAgentsConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  // Basic structure validation - each key should have description and prompt
  for (const [, agent] of Object.entries(value)) {
    if (!agent || typeof agent !== 'object') {
      return false;
    }
    const agentObj = agent as Record<string, unknown>;
    if (typeof agentObj.description !== 'string' || typeof agentObj.prompt !== 'string') {
      return false;
    }
    // Optional model validation
    if (agentObj.model !== undefined && !isValidModel(agentObj.model)) {
      return false;
    }
  }
  return true;
}

/**
 * Validators for each IPC channel
 */
export const validators = {
  /**
   * Validate project creation data
   */
  projectCreate(data: unknown): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
    if (!data || typeof data !== 'object') {
      throw new IpcValidationError('project:create', 'Invalid project data');
    }

    const obj = data as Record<string, unknown>;

    if (!isNonEmptyString(obj.name)) {
      throw new IpcValidationError('project:create', 'Project name is required');
    }

    // Use enhanced path validation with traversal protection
    const validatedPath = validateProjectPath(obj.path, 'project:create');

    // Validate additionalDirs if provided
    let additionalDirs: string[] | undefined;
    if (obj.additionalDirs !== undefined) {
      if (!isValidDirectoryArray(obj.additionalDirs)) {
        throw new IpcValidationError('project:create', 'Invalid additional directories');
      }
      additionalDirs = obj.additionalDirs;
    }

    // Validate agentDeliveryMethod if provided
    let agentDeliveryMethod: AgentDeliveryMethod | undefined;
    if (obj.agentDeliveryMethod !== undefined) {
      if (!isValidAgentDeliveryMethod(obj.agentDeliveryMethod)) {
        throw new IpcValidationError(
          'project:create',
          'Invalid agent delivery method (must be "skill" or "args")'
        );
      }
      agentDeliveryMethod = obj.agentDeliveryMethod;
    }

    // Validate agents if provided
    let agents: CustomAgentsConfig | undefined;
    if (obj.agents !== undefined) {
      if (!isValidCustomAgentsConfig(obj.agents)) {
        throw new IpcValidationError('project:create', 'Invalid agents configuration');
      }
      agents = obj.agents;
    }

    // Pass through jiraConfig if provided (validation done at usage time)
    const jiraConfig = obj.jiraConfig as Project['jiraConfig'];

    // Pass through clusterPermissions if provided
    const clusterPermissions = obj.clusterPermissions as Project['clusterPermissions'];

    // Pass through vectorSearchConfig if provided
    const vectorSearchConfig = obj.vectorSearchConfig as Project['vectorSearchConfig'];

    return {
      name: obj.name.trim(),
      path: validatedPath,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      color: typeof obj.color === 'string' ? obj.color : undefined,
      skipPermissions: typeof obj.skipPermissions === 'boolean' ? obj.skipPermissions : undefined,
      enableMcp: typeof obj.enableMcp === 'boolean' ? obj.enableMcp : undefined,
      autoReview: typeof obj.autoReview === 'boolean' ? obj.autoReview : undefined,
      preferredShell: typeof obj.preferredShell === 'string' ? obj.preferredShell : undefined,
      clusterPermissions,
      additionalDirs,
      agentDeliveryMethod,
      agents,
      jiraConfig,
      vectorSearchConfig,
    };
  },

  /**
   * Validate project update data
   */
  projectUpdate(data: unknown): Project {
    if (!data || typeof data !== 'object') {
      throw new IpcValidationError('project:update', 'Invalid project data');
    }

    const obj = data as Record<string, unknown>;

    if (!isValidId(obj.id)) {
      throw new IpcValidationError('project:update', 'Valid project ID is required');
    }

    if (!isNonEmptyString(obj.name)) {
      throw new IpcValidationError('project:update', 'Project name is required');
    }

    // Use enhanced path validation with traversal protection
    const validatedPath = validateProjectPath(obj.path, 'project:update');

    if (typeof obj.createdAt !== 'number' || typeof obj.updatedAt !== 'number') {
      throw new IpcValidationError('project:update', 'Timestamps are required');
    }

    // Validate additionalDirs if provided
    let additionalDirs: string[] | undefined;
    if (obj.additionalDirs !== undefined) {
      if (!isValidDirectoryArray(obj.additionalDirs)) {
        throw new IpcValidationError('project:update', 'Invalid additional directories');
      }
      additionalDirs = obj.additionalDirs;
    }

    // Validate agentDeliveryMethod if provided
    let agentDeliveryMethod: AgentDeliveryMethod | undefined;
    if (obj.agentDeliveryMethod !== undefined) {
      if (!isValidAgentDeliveryMethod(obj.agentDeliveryMethod)) {
        throw new IpcValidationError(
          'project:update',
          'Invalid agent delivery method (must be "skill" or "args")'
        );
      }
      agentDeliveryMethod = obj.agentDeliveryMethod;
    }

    // Validate agents if provided
    let agents: CustomAgentsConfig | undefined;
    if (obj.agents !== undefined) {
      if (!isValidCustomAgentsConfig(obj.agents)) {
        throw new IpcValidationError('project:update', 'Invalid agents configuration');
      }
      agents = obj.agents;
    }

    // Pass through jiraConfig if provided (validation done at usage time)
    const jiraConfig = obj.jiraConfig as Project['jiraConfig'];

    // Pass through clusterPermissions if provided
    const clusterPermissions = obj.clusterPermissions as Project['clusterPermissions'];

    // Pass through vectorSearchConfig if provided
    const vectorSearchConfig = obj.vectorSearchConfig as Project['vectorSearchConfig'];

    return {
      id: obj.id,
      name: obj.name.trim(),
      path: validatedPath,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      color: typeof obj.color === 'string' ? obj.color : undefined,
      hostname: typeof obj.hostname === 'string' ? obj.hostname : undefined,
      skipPermissions: typeof obj.skipPermissions === 'boolean' ? obj.skipPermissions : undefined,
      enableMcp: typeof obj.enableMcp === 'boolean' ? obj.enableMcp : undefined,
      autoReview: typeof obj.autoReview === 'boolean' ? obj.autoReview : undefined,
      preferredShell: typeof obj.preferredShell === 'string' ? obj.preferredShell : undefined,
      clusterPermissions,
      additionalDirs,
      agentDeliveryMethod,
      agents,
      jiraConfig,
      vectorSearchConfig,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  },

  /**
   * Validate ID parameter
   */
  id(value: unknown, channel: string): string {
    if (!isValidId(value)) {
      throw new IpcValidationError(channel, 'Valid ID is required');
    }
    return value;
  },

  /**
   * Validate instance creation config
   */
  instanceCreate(data: unknown): {
    projectId: string;
    model: ClaudeModel;
    mode: InstanceMode;
    prompt?: string;
    planMode?: boolean;
    verbose?: boolean;
    skipPermissions?: boolean;
    isDirector?: boolean;
    usePermissionPromptTool?: boolean;
    agentFile?: string;
  } {
    if (!data || typeof data !== 'object') {
      throw new IpcValidationError('instance:create', 'Invalid instance config');
    }

    const obj = data as Record<string, unknown>;

    if (!isValidId(obj.projectId)) {
      throw new IpcValidationError('instance:create', 'Valid project ID is required');
    }

    if (!isValidModel(obj.model)) {
      throw new IpcValidationError(
        'instance:create',
        'Valid model is required (sonnet, opus, haiku)'
      );
    }

    if (!isValidMode(obj.mode)) {
      throw new IpcValidationError(
        'instance:create',
        'Valid mode is required (interactive, print, stream-json)'
      );
    }

    return {
      projectId: obj.projectId,
      model: obj.model,
      mode: obj.mode,
      prompt: typeof obj.prompt === 'string' ? obj.prompt : undefined,
      planMode: obj.planMode === true,
      verbose: obj.verbose === true,
      skipPermissions: obj.skipPermissions === true,
      isDirector: obj.isDirector === true,
      usePermissionPromptTool: obj.usePermissionPromptTool === true,
      agentFile: typeof obj.agentFile === 'string' ? obj.agentFile : undefined,
    };
  },

  /**
   * Validate instance resume config
   */
  instanceResume(data: unknown): {
    projectId: string;
    sessionId: string;
    model: ClaudeModel;
    mode: InstanceMode;
  } {
    if (!data || typeof data !== 'object') {
      throw new IpcValidationError('instance:resume', 'Invalid resume config');
    }

    const obj = data as Record<string, unknown>;

    if (!isValidId(obj.projectId)) {
      throw new IpcValidationError('instance:resume', 'Valid project ID is required');
    }

    if (!isValidId(obj.sessionId)) {
      throw new IpcValidationError('instance:resume', 'Valid session ID is required');
    }

    if (!isValidModel(obj.model)) {
      throw new IpcValidationError('instance:resume', 'Valid model is required');
    }

    if (!isValidMode(obj.mode)) {
      throw new IpcValidationError('instance:resume', 'Valid mode is required');
    }

    return {
      projectId: obj.projectId,
      sessionId: obj.sessionId,
      model: obj.model,
      mode: obj.mode,
    };
  },

  /**
   * Validate instance input
   */
  instanceInput(id: unknown, input: unknown): { id: string; input: string } {
    if (!isValidId(id)) {
      throw new IpcValidationError('instance:sendInput', 'Valid instance ID is required');
    }

    if (typeof input !== 'string') {
      throw new IpcValidationError('instance:sendInput', 'Input must be a string');
    }

    return { id, input };
  },

  /**
   * Validate conversation creation data
   */
  conversationCreate(data: unknown): {
    projectId: string;
    title: string;
    initialPrompt: string;
    model: ClaudeModel;
    mode: InstanceMode;
  } {
    if (!data || typeof data !== 'object') {
      throw new IpcValidationError('conversation:create', 'Invalid conversation data');
    }

    const obj = data as Record<string, unknown>;

    if (!isValidId(obj.projectId)) {
      throw new IpcValidationError('conversation:create', 'Valid project ID is required');
    }

    if (!isNonEmptyString(obj.title)) {
      throw new IpcValidationError('conversation:create', 'Title is required');
    }

    if (!isNonEmptyString(obj.initialPrompt)) {
      throw new IpcValidationError('conversation:create', 'Initial prompt is required');
    }

    if (!isValidModel(obj.model)) {
      throw new IpcValidationError('conversation:create', 'Valid model is required');
    }

    if (!isValidMode(obj.mode)) {
      throw new IpcValidationError('conversation:create', 'Valid mode is required');
    }

    return {
      projectId: obj.projectId,
      title: obj.title,
      initialPrompt: obj.initialPrompt,
      model: obj.model,
      mode: obj.mode,
    };
  },

  /**
   * Validate conversation update data
   */
  conversationUpdate(
    id: unknown,
    updates: unknown
  ): {
    id: string;
    updates: Partial<{
      sessionId: string;
      status: ConversationStatus;
      totalCostUsd: number;
      messageCount: number;
      title: string;
    }>;
  } {
    if (!isValidId(id)) {
      throw new IpcValidationError('conversation:update', 'Valid conversation ID is required');
    }

    if (!updates || typeof updates !== 'object') {
      throw new IpcValidationError('conversation:update', 'Invalid updates object');
    }

    const obj = updates as Record<string, unknown>;
    const validated: Record<string, unknown> = {};

    if (obj.sessionId !== undefined) {
      if (!isNonEmptyString(obj.sessionId)) {
        throw new IpcValidationError('conversation:update', 'Invalid session ID');
      }
      validated.sessionId = obj.sessionId;
    }

    if (obj.status !== undefined) {
      if (!isValidConversationStatus(obj.status)) {
        throw new IpcValidationError('conversation:update', 'Invalid status');
      }
      validated.status = obj.status;
    }

    if (obj.totalCostUsd !== undefined) {
      if (typeof obj.totalCostUsd !== 'number' || obj.totalCostUsd < 0) {
        throw new IpcValidationError('conversation:update', 'Invalid cost value');
      }
      validated.totalCostUsd = obj.totalCostUsd;
    }

    if (obj.messageCount !== undefined) {
      if (
        typeof obj.messageCount !== 'number' ||
        obj.messageCount < 0 ||
        !Number.isInteger(obj.messageCount)
      ) {
        throw new IpcValidationError('conversation:update', 'Invalid message count');
      }
      validated.messageCount = obj.messageCount;
    }

    if (obj.title !== undefined) {
      if (!isNonEmptyString(obj.title)) {
        throw new IpcValidationError('conversation:update', 'Invalid title');
      }
      validated.title = obj.title;
    }

    return { id, updates: validated };
  },

  /**
   * Validate add message data
   */
  conversationAddMessage(data: unknown): {
    conversationId: string;
    type: string;
    content: string;
    costUsd?: number;
  } {
    if (!data || typeof data !== 'object') {
      throw new IpcValidationError('conversation:addMessage', 'Invalid message data');
    }

    const obj = data as Record<string, unknown>;

    if (!isValidId(obj.conversationId)) {
      throw new IpcValidationError('conversation:addMessage', 'Valid conversation ID is required');
    }

    if (!isNonEmptyString(obj.type)) {
      throw new IpcValidationError('conversation:addMessage', 'Message type is required');
    }

    if (typeof obj.content !== 'string') {
      throw new IpcValidationError('conversation:addMessage', 'Content is required');
    }

    return {
      conversationId: obj.conversationId,
      type: obj.type,
      content: obj.content,
      costUsd: typeof obj.costUsd === 'number' ? obj.costUsd : undefined,
    };
  },
};

/**
 * Wrap an IPC handler with validation and logging
 */
export function withValidation<T, R>(
  channel: string,
  validator: (data: T) => T,
  handler: (data: T) => R
): (data: T) => R {
  return (data: T) => {
    try {
      const validated = validator(data);
      ipcLogger.debug(`${channel} called`, { validated });
      return handler(validated);
    } catch (error) {
      if (error instanceof IpcValidationError) {
        ipcLogger.warn(`Validation failed for ${channel}`, { error: error.message });
      } else {
        ipcLogger.error(`Error in ${channel}`, error);
      }
      throw error;
    }
  };
}
