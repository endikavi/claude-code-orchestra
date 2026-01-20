// ==================== Cluster Permissions Types ====================

/**
 * Privacy settings for the local node (global level)
 * Controls what other nodes can see and do by default
 */
export interface ClusterNodePrivacy {
  /** Share projects with other nodes by default */
  shareProjectsByDefault: boolean;
  /** Share instances with other nodes by default */
  shareInstancesByDefault: boolean;
  /** Allow remote nodes to create instances on this node */
  allowRemoteInstanceCreation: boolean;
  /** Allow remote nodes to send input to instances on this node */
  allowRemoteInstanceInput: boolean;
  /** Allow remote nodes to kill instances on this node */
  allowRemoteInstanceKill: boolean;
  /** Node IDs that bypass all restrictions (trusted nodes) */
  trustedNodeIds: string[];
}

/**
 * Default privacy settings for a new node
 */
export const DEFAULT_NODE_PRIVACY: ClusterNodePrivacy = {
  shareProjectsByDefault: true,
  shareInstancesByDefault: true,
  allowRemoteInstanceCreation: true,
  allowRemoteInstanceInput: true,
  allowRemoteInstanceKill: true,
  trustedNodeIds: [],
};

/**
 * Cluster-specific permissions for a project
 * null values mean "use node default"
 */
export interface ProjectClusterPermissions {
  /** Whether to share this project with the cluster (null = use node default) */
  shareWithCluster: boolean | null;
  /** Whether to allow remote instance creation for this project (null = use node default) */
  allowRemoteInstanceCreation: boolean | null;
}

/**
 * Default cluster permissions for a project
 */
export const DEFAULT_PROJECT_CLUSTER_PERMISSIONS: ProjectClusterPermissions = {
  shareWithCluster: null,
  allowRemoteInstanceCreation: null,
};

/**
 * Cluster-specific permissions for an instance
 */
export interface InstanceClusterPermissions {
  /** Whether to share this instance with the cluster */
  shareWithCluster: boolean;
  /** Whether to allow remote input for this instance */
  allowRemoteInput: boolean;
}

/**
 * Default cluster permissions for an instance
 */
export const DEFAULT_INSTANCE_CLUSTER_PERMISSIONS: InstanceClusterPermissions = {
  shareWithCluster: true,
  allowRemoteInput: true,
};

/**
 * Actions that require permission validation
 */
export type ClusterAction =
  | 'view_project'
  | 'view_instance'
  | 'create_instance'
  | 'send_input'
  | 'kill_instance'
  | 'view_output';

/**
 * Result of a permission check
 */
export interface ClusterPermissionCheck {
  allowed: boolean;
  reason?: string;
  isTrustedNode?: boolean;
}

/**
 * Event emitted when permissions change
 */
export interface ClusterPermissionChangeEvent {
  /** ID of the node that changed permissions */
  nodeId: string;
  /** Type of permission change */
  type: 'node_privacy' | 'project_permissions' | 'instance_permissions';
  /** Timestamp of the change */
  timestamp: number;
  /** Affected project IDs (if applicable) */
  affectedProjectIds?: string[];
  /** Affected instance IDs (if applicable) */
  affectedInstanceIds?: string[];
}
