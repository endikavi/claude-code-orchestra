import type { ClaudeModel, CustomAgentsConfig } from './index';

/**
 * Instance Preset - A saved configuration template for Claude instances
 */
export interface InstancePreset {
  id: string;
  name: string;
  description?: string;

  // Instance configuration
  model: ClaudeModel;
  planMode?: boolean;
  verbose?: boolean;

  // Orchestration
  agentFile?: string;
  agents?: CustomAgentsConfig;
  additionalDirs?: string[];

  // Initial prompt (sent when instance starts)
  initialPrompt?: string;

  // Metadata
  category?: string;
  tags?: string[];
  isGlobal: boolean;
  projectId?: string;

  createdAt: number;
  updatedAt: number;
}

/**
 * Input for creating a new preset
 */
export interface CreatePresetInput {
  name: string;
  description?: string;
  model: ClaudeModel;
  planMode?: boolean;
  verbose?: boolean;
  agentFile?: string;
  agents?: CustomAgentsConfig;
  additionalDirs?: string[];
  initialPrompt?: string;
  category?: string;
  tags?: string[];
  isGlobal: boolean;
  projectId?: string;
}

/**
 * Input for updating an existing preset
 */
export interface UpdatePresetInput {
  name?: string;
  description?: string;
  model?: ClaudeModel;
  planMode?: boolean;
  verbose?: boolean;
  agentFile?: string;
  agents?: CustomAgentsConfig;
  additionalDirs?: string[];
  initialPrompt?: string;
  category?: string;
  tags?: string[];
  isGlobal?: boolean;
}

/**
 * Predefined preset categories
 */
export const PRESET_CATEGORIES = [
  'development',
  'testing',
  'documentation',
  'devops',
  'analysis',
  'custom',
] as const;

export type PresetCategory = (typeof PRESET_CATEGORIES)[number];
