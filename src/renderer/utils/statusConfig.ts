import type { InstanceStatus } from '@shared/types';

export interface StatusTabConfig {
  color: string;
  pulse: boolean;
  label: string;
}

export interface StatusBadgeConfig {
  bg: string;
  text: string;
}

/**
 * Status configuration for instance tabs (solid colors)
 */
export const STATUS_TAB_CONFIG: Record<InstanceStatus, StatusTabConfig> = {
  pending: { color: 'bg-gray-400', pulse: false, label: 'Pending' },
  starting: { color: 'bg-yellow-500', pulse: true, label: 'Starting' },
  running: { color: 'bg-green-500', pulse: true, label: 'Running' },
  waiting_input: { color: 'bg-cyan-500', pulse: false, label: 'Waiting for Input' },
  needs_permission: { color: 'bg-orange-500', pulse: true, label: 'Needs Permission' },
  tool_executing: { color: 'bg-blue-500', pulse: true, label: 'Executing Tool' },
  terminating: { color: 'bg-orange-500', pulse: true, label: 'Terminating' },
  completed: { color: 'bg-gray-500', pulse: false, label: 'Completed' },
  error: { color: 'bg-red-500', pulse: false, label: 'Error' },
  killed: { color: 'bg-gray-600', pulse: false, label: 'Killed' },
};

/**
 * Status configuration for badges (semi-transparent background)
 */
export const STATUS_BADGE_CONFIG: Record<InstanceStatus, StatusBadgeConfig> = {
  pending: { bg: 'bg-gray-400/20', text: 'text-gray-400' },
  starting: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  running: { bg: 'bg-green-500/20', text: 'text-green-400' },
  waiting_input: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  needs_permission: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  tool_executing: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  terminating: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  completed: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  error: { bg: 'bg-red-500/20', text: 'text-red-400' },
  killed: { bg: 'bg-gray-600/20', text: 'text-gray-500' },
};

/**
 * Default badge config for unknown status
 */
export const DEFAULT_BADGE_CONFIG: StatusBadgeConfig = {
  bg: 'bg-gray-500/20',
  text: 'text-gray-400',
};

/**
 * Get tab config for a status
 */
export function getStatusTabConfig(status: InstanceStatus): StatusTabConfig {
  return STATUS_TAB_CONFIG[status];
}

/**
 * Get badge config for a status
 */
export function getStatusBadgeConfig(status: InstanceStatus): StatusBadgeConfig {
  return STATUS_BADGE_CONFIG[status] || DEFAULT_BADGE_CONFIG;
}

/**
 * Get status label
 */
export function getStatusLabel(status: InstanceStatus): string {
  return STATUS_TAB_CONFIG[status]?.label || status;
}
