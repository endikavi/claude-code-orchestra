import { DataStore } from './DataStore';
import type { Project } from '@shared/types';
import type {
  ClusterAction,
  ClusterPermissionCheck,
  ClusterNodePrivacy,
  ProjectClusterPermissions,
  InstanceClusterPermissions,
} from '@shared/types/cluster';

/**
 * Validates cluster permissions for various actions
 * Determines what can be shared and what remote nodes can do
 */
export class ClusterPermissionValidator {
  private dataStore: DataStore;
  private static instance: ClusterPermissionValidator | null = null;

  private constructor() {
    this.dataStore = DataStore.getInstance();
  }

  public static getInstance(): ClusterPermissionValidator {
    if (!ClusterPermissionValidator.instance) {
      ClusterPermissionValidator.instance = new ClusterPermissionValidator();
    }
    return ClusterPermissionValidator.instance;
  }

  /**
   * Get current node privacy settings
   */
  private getNodePrivacy(): ClusterNodePrivacy {
    return this.dataStore.getNodePrivacy();
  }

  /**
   * Check if a node is in the trusted list
   */
  public isTrustedNode(nodeId: string): boolean {
    const privacy = this.getNodePrivacy();
    return privacy.trustedNodeIds.includes(nodeId);
  }

  /**
   * Validate an action from a remote node
   */
  public validateAction(
    action: ClusterAction,
    sourceNodeId: string,
    targetNodeId: string,
    targetId: string // projectId or instanceId depending on action
  ): ClusterPermissionCheck {
    const privacy = this.getNodePrivacy();
    const config = this.dataStore.getClusterConfig();

    // Always allow local actions
    if (sourceNodeId === config.nodeId) {
      return { allowed: true, reason: 'Local action' };
    }

    // Trusted nodes bypass restrictions
    if (this.isTrustedNode(sourceNodeId)) {
      return { allowed: true, reason: 'Trusted node', isTrustedNode: true };
    }

    // Actions targeting other nodes go through
    if (targetNodeId !== config.nodeId) {
      return { allowed: true, reason: 'Not targeting this node' };
    }

    // Validate based on action type
    switch (action) {
      case 'view_project':
        return this.validateViewProject(targetId);

      case 'view_instance':
        return this.validateViewInstance(targetId);

      case 'create_instance':
        return this.validateCreateInstance(targetId);

      case 'send_input':
        return this.validateSendInput(targetId);

      case 'kill_instance':
        return this.validateKillInstance();

      case 'view_output':
        return this.validateViewOutput(targetId);

      default:
        return { allowed: false, reason: 'Unknown action' };
    }
  }

  /**
   * Validate viewing a project
   */
  private validateViewProject(projectId: string): ClusterPermissionCheck {
    const privacy = this.getNodePrivacy();
    const project = this.dataStore.getProjectById(projectId);

    if (!project) {
      return { allowed: false, reason: 'Project not found' };
    }

    // Check project-specific permissions first
    if (project.clusterPermissions?.shareWithCluster !== null) {
      if (project.clusterPermissions?.shareWithCluster) {
        return { allowed: true, reason: 'Project explicitly shared' };
      } else {
        return { allowed: false, reason: 'Project explicitly private' };
      }
    }

    // Fall back to node default
    if (privacy.shareProjectsByDefault) {
      return { allowed: true, reason: 'Node default: share projects' };
    }

    return { allowed: false, reason: 'Node default: keep projects private' };
  }

  /**
   * Validate viewing an instance
   */
  private validateViewInstance(instanceId: string): ClusterPermissionCheck {
    const privacy = this.getNodePrivacy();
    const instancePerms = this.dataStore.getInstanceClusterPermissions(instanceId);

    // Check instance-specific permissions first
    if (!instancePerms.shareWithCluster) {
      return { allowed: false, reason: 'Instance marked as private' };
    }

    // Fall back to node default
    if (privacy.shareInstancesByDefault) {
      return { allowed: true, reason: 'Node default: share instances' };
    }

    return { allowed: false, reason: 'Node default: keep instances private' };
  }

  /**
   * Validate creating an instance on a project
   */
  private validateCreateInstance(projectId: string): ClusterPermissionCheck {
    const privacy = this.getNodePrivacy();
    const project = this.dataStore.getProjectById(projectId);

    if (!project) {
      return { allowed: false, reason: 'Project not found' };
    }

    // Check if project allows remote instance creation
    if (project.clusterPermissions?.allowRemoteInstanceCreation !== null) {
      if (project.clusterPermissions?.allowRemoteInstanceCreation) {
        return { allowed: true, reason: 'Project allows remote instances' };
      } else {
        return { allowed: false, reason: 'Project disallows remote instances' };
      }
    }

    // Fall back to node default
    if (privacy.allowRemoteInstanceCreation) {
      return { allowed: true, reason: 'Node default: allow remote instances' };
    }

    return { allowed: false, reason: 'Node default: disallow remote instances' };
  }

  /**
   * Validate sending input to an instance
   */
  private validateSendInput(instanceId: string): ClusterPermissionCheck {
    const privacy = this.getNodePrivacy();
    const instancePerms = this.dataStore.getInstanceClusterPermissions(instanceId);

    // Check instance-specific permissions first
    if (!instancePerms.allowRemoteInput) {
      return { allowed: false, reason: 'Instance disallows remote input' };
    }

    // Fall back to node default
    if (privacy.allowRemoteInstanceInput) {
      return { allowed: true, reason: 'Node default: allow remote input' };
    }

    return { allowed: false, reason: 'Node default: disallow remote input' };
  }

  /**
   * Validate killing an instance
   */
  private validateKillInstance(): ClusterPermissionCheck {
    const privacy = this.getNodePrivacy();

    if (privacy.allowRemoteInstanceKill) {
      return { allowed: true, reason: 'Node allows remote kill' };
    }

    return { allowed: false, reason: 'Node disallows remote kill' };
  }

  /**
   * Validate viewing instance output
   */
  private validateViewOutput(instanceId: string): ClusterPermissionCheck {
    // Same rules as viewing instance
    return this.validateViewInstance(instanceId);
  }

  /**
   * Check if a project should be shared with the cluster
   */
  public shouldShareProject(project: Project): boolean {
    const privacy = this.getNodePrivacy();

    // Check project-specific setting
    if (
      project.clusterPermissions?.shareWithCluster !== null &&
      project.clusterPermissions?.shareWithCluster !== undefined
    ) {
      return project.clusterPermissions.shareWithCluster;
    }

    // Fall back to node default
    return privacy.shareProjectsByDefault;
  }

  /**
   * Check if an instance should be shared with the cluster
   */
  public shouldShareInstance(instanceId: string, projectId: string): boolean {
    const privacy = this.getNodePrivacy();
    const project = this.dataStore.getProjectById(projectId);
    const instancePerms = this.dataStore.getInstanceClusterPermissions(instanceId);

    // If project is private, instance is also private
    if (project && !this.shouldShareProject(project)) {
      return false;
    }

    // Check instance-specific setting
    if (!instancePerms.shareWithCluster) {
      return false;
    }

    // Fall back to node default
    return privacy.shareInstancesByDefault;
  }

  /**
   * Filter projects list to only include shareable ones
   */
  public filterShareableProjects(projects: Project[]): Project[] {
    return projects.filter((p) => this.shouldShareProject(p));
  }

  /**
   * Add a node to the trusted list
   */
  public addTrustedNode(nodeId: string): void {
    const privacy = this.getNodePrivacy();
    if (!privacy.trustedNodeIds.includes(nodeId)) {
      this.dataStore.updateNodePrivacy({
        trustedNodeIds: [...privacy.trustedNodeIds, nodeId],
      });
    }
  }

  /**
   * Remove a node from the trusted list
   */
  public removeTrustedNode(nodeId: string): void {
    const privacy = this.getNodePrivacy();
    this.dataStore.updateNodePrivacy({
      trustedNodeIds: privacy.trustedNodeIds.filter((id) => id !== nodeId),
    });
  }
}

// Export singleton getter
export function getClusterPermissionValidator(): ClusterPermissionValidator {
  return ClusterPermissionValidator.getInstance();
}
