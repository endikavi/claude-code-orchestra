import { DataStore } from '../DataStore';
import { getProcessManager } from '../ProcessManager';
import { getClusterManager } from '../ClusterManager';
import type { SyncState } from '@shared/types/remote';
import type { Conversation } from '@shared/types';

/**
 * Manages state synchronization between the main process and connected clients.
 * Handles gathering project, instance, and conversation data from various sources.
 */
export class StateSyncManager {
  private static instance: StateSyncManager | null = null;

  private constructor() {}

  public static getInstance(): StateSyncManager {
    if (!StateSyncManager.instance) {
      StateSyncManager.instance = new StateSyncManager();
    }
    return StateSyncManager.instance;
  }

  /**
   * Get current sync state combining local and cluster data
   */
  public getSyncState(): SyncState {
    const dataStore = DataStore.getInstance();
    const processManager = getProcessManager();
    const clusterManager = getClusterManager();

    // Get local projects and instances
    const localProjects = dataStore.getAllProjects();
    const localInstances = processManager.getAllInstances();

    // Get active conversations (those linked to running instances)
    const activeConversations = this.getActiveConversations(
      processManager.getAllInstanceConversations(),
      dataStore
    );

    // Check if cluster is enabled and get global projects/instances
    const clusterConfig = clusterManager.getConfig();
    if (clusterConfig.enabled) {
      // Update local node state before getting global instances
      // This ensures newly created instances are included in the global state
      clusterManager.refreshLocalNodeState();

      const globalProjects = clusterManager.getAllGlobalProjects();
      const globalInstances = clusterManager.getAllGlobalInstances();

      // Use global projects/instances directly - they already include all nodes with proper metadata
      return {
        projects: globalProjects,
        instances: globalInstances,
        conversations: activeConversations,
        outputs: processManager.getAllInstanceOutputs(),
        instanceConversations: processManager.getAllInstanceConversations(),
      };
    }

    return {
      projects: localProjects,
      instances: localInstances,
      conversations: activeConversations,
      outputs: processManager.getAllInstanceOutputs(), // Include output buffers for late-connecting clients
      instanceConversations: processManager.getAllInstanceConversations(), // Include instance-conversation mappings
    };
  }

  /**
   * Get active conversations linked to running instances
   */
  private getActiveConversations(
    instanceConversations: Record<string, string>,
    dataStore: DataStore
  ): Conversation[] {
    const conversations: Conversation[] = [];
    const seen = new Set<string>();

    for (const conversationId of Object.values(instanceConversations)) {
      if (seen.has(conversationId)) continue;
      seen.add(conversationId);

      try {
        const conversation = dataStore.getConversationById(conversationId);
        if (conversation) {
          conversations.push(conversation);
        }
      } catch (error) {
        console.error(`[StateSyncManager] Failed to get conversation ${conversationId}:`, error);
      }
    }

    return conversations;
  }
}

// Export singleton getter
export function getStateSyncManager(): StateSyncManager {
  return StateSyncManager.getInstance();
}
