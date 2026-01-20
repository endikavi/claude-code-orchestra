import { EventEmitter } from 'events';
import type {
  SubagentInstance,
  SubagentStartedEvent,
  SubagentCompletedEvent,
} from '@shared/types/orchestration';

/**
 * Tracks native Claude subagents (Task tool) per instance.
 * This is a passive observer that doesn't interfere with Claude's operation.
 */
export class SubagentTracker extends EventEmitter {
  // Map of instanceId -> Map of subagentId -> SubagentInstance
  private subagents = new Map<string, Map<string, SubagentInstance>>();
  // Track which subagent IDs belong to which instances (for matching tool_results)
  private subagentToInstance = new Map<string, string>();

  /**
   * Record a new subagent being started
   */
  startSubagent(instanceId: string, data: SubagentStartedEvent): SubagentInstance {
    // Ensure the instance map exists
    if (!this.subagents.has(instanceId)) {
      this.subagents.set(instanceId, new Map());
    }

    const instanceSubagents = this.subagents.get(instanceId);
    if (!instanceSubagents) {
      throw new Error(`Failed to create subagent map for instance ${instanceId}`);
    }

    const subagent: SubagentInstance = {
      id: data.id,
      parentInstanceId: instanceId,
      description: data.description,
      prompt: data.prompt,
      subagentType: data.subagentType,
      status: 'running',
      startedAt: Date.now(),
    };

    instanceSubagents.set(data.id, subagent);
    this.subagentToInstance.set(data.id, instanceId);

    console.log(
      `[SubagentTracker] Started subagent ${data.id} (${data.subagentType}) for instance ${instanceId}`
    );

    return subagent;
  }

  /**
   * Record a subagent completing
   */
  completeSubagent(instanceId: string, data: SubagentCompletedEvent): SubagentInstance | null {
    const instanceSubagents = this.subagents.get(instanceId);
    if (!instanceSubagents) {
      return null;
    }

    const subagent = instanceSubagents.get(data.id);
    if (!subagent) {
      // This tool_result doesn't match a tracked Task tool call
      return null;
    }

    subagent.status = data.isError ? 'error' : 'completed';
    subagent.completedAt = Date.now();
    if (data.isError) {
      subagent.error = data.result;
    } else {
      subagent.result = data.result;
    }

    console.log(
      `[SubagentTracker] Completed subagent ${data.id} for instance ${instanceId} (status: ${subagent.status})`
    );

    return subagent;
  }

  /**
   * Try to complete a subagent by just the subagent ID (when we don't know the instance)
   */
  completeSubagentById(
    data: SubagentCompletedEvent
  ): { instanceId: string; subagent: SubagentInstance } | null {
    const instanceId = this.subagentToInstance.get(data.id);
    if (!instanceId) {
      return null;
    }

    const subagent = this.completeSubagent(instanceId, data);
    if (!subagent) {
      return null;
    }

    return { instanceId, subagent };
  }

  /**
   * Get all subagents for an instance
   */
  getSubagents(instanceId: string): SubagentInstance[] {
    const instanceSubagents = this.subagents.get(instanceId);
    if (!instanceSubagents) {
      return [];
    }
    return Array.from(instanceSubagents.values());
  }

  /**
   * Get all subagents across all instances
   */
  getAllSubagents(): SubagentInstance[] {
    const all: SubagentInstance[] = [];
    for (const instanceSubagents of this.subagents.values()) {
      all.push(...instanceSubagents.values());
    }
    return all;
  }

  /**
   * Get running subagents count for an instance
   */
  getRunningCount(instanceId: string): number {
    const instanceSubagents = this.subagents.get(instanceId);
    if (!instanceSubagents) {
      return 0;
    }
    return Array.from(instanceSubagents.values()).filter((s) => s.status === 'running').length;
  }

  /**
   * Get completed subagents count for an instance
   */
  getCompletedCount(instanceId: string): number {
    const instanceSubagents = this.subagents.get(instanceId);
    if (!instanceSubagents) {
      return 0;
    }
    return Array.from(instanceSubagents.values()).filter((s) => s.status === 'completed').length;
  }

  /**
   * Clear all subagents for an instance (when instance is killed/completed)
   */
  clearSubagents(instanceId: string): void {
    const instanceSubagents = this.subagents.get(instanceId);
    if (instanceSubagents) {
      // Clean up the reverse mapping
      for (const id of instanceSubagents.keys()) {
        this.subagentToInstance.delete(id);
      }
      this.subagents.delete(instanceId);
      console.log(`[SubagentTracker] Cleared subagents for instance ${instanceId}`);
    }
  }

  /**
   * Get instances that have any subagents
   */
  getInstancesWithSubagents(): string[] {
    const instanceIds: string[] = [];
    for (const [instanceId, subagents] of this.subagents.entries()) {
      if (subagents.size > 0) {
        instanceIds.push(instanceId);
      }
    }
    return instanceIds;
  }
}

// Singleton instance
let subagentTracker: SubagentTracker | null = null;

export function getSubagentTracker(): SubagentTracker {
  if (!subagentTracker) {
    subagentTracker = new SubagentTracker();
  }
  return subagentTracker;
}
