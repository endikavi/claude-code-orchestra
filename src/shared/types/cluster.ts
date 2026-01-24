// ==================== Cluster/Multi-Node Types ====================

import type {
  Project,
  ClaudeInstance,
  ClaudeModel,
  InstanceMode,
  StreamMessage,
  InstanceStatus,
} from './index';
import type { ClusterNodePrivacy, ClusterPermissionChangeEvent } from './clusterPermissions';
import type { HookStatusUpdate } from './remote';
import type { SubagentInstance } from './orchestration';
import type {
  SharedInstanceContext,
  ProjectSharedKnowledge,
  ContextUpdateEvent,
} from './sharedContext';
import { DEFAULT_NODE_PRIVACY } from './clusterPermissions';
export * from './clusterPermissions';

// ==================== Node Types ====================

/** Status of a cluster node */
export type ClusterNodeStatus = 'online' | 'offline' | 'connecting' | 'error';

/** Role of a node in the cluster */
export type ClusterNodeRole = 'primary' | 'secondary' | 'standalone';

/** Information about a cluster node */
export interface ClusterNode {
  id: string;
  name: string;
  host: string;
  port: number;
  status: ClusterNodeStatus;
  role: ClusterNodeRole;
  projects: Project[];
  instances: ClaudeInstance[];
  lastSeen?: number;
  error?: string;
  /** Privacy settings for this node (optional, provided by node itself) */
  privacy?: ClusterNodePrivacy;
}

/** Minimal node info for identification */
export interface NodeInfo {
  id: string;
  name: string;
  role: ClusterNodeRole;
}

// ==================== Extended Types with Node Information ====================

/** Project with node information for cluster-wide visibility */
export interface GlobalProject extends Project {
  nodeId: string;
  nodeName: string;
  isLocal: boolean;
}

/** Instance with node information for cluster-wide visibility */
export interface GlobalInstance extends ClaudeInstance {
  nodeId: string;
  nodeName: string;
  isLocal: boolean;
}

// ==================== Cluster Configuration ====================

/** Cluster configuration stored in database */
export interface ClusterConfig {
  enabled: boolean;
  role: ClusterNodeRole;
  nodeId: string;
  nodeName: string;
  primaryHost?: string; // Host of primary node (if this node is secondary)
  primaryPort: number;
  sharedSecret: string; // Shared secret for authentication between nodes
  privacy: ClusterNodePrivacy; // Privacy and permission settings for this node
}

/** Default cluster configuration */
export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  enabled: false,
  role: 'standalone',
  nodeId: '', // Will be generated on first access
  nodeName: 'My Computer',
  primaryHost: '',
  primaryPort: 3847,
  sharedSecret: '',
  privacy: DEFAULT_NODE_PRIVACY,
};

// ==================== Request/Response Types ====================

/** Request to create an instance on a remote node */
export interface RemoteInstanceRequest {
  projectId: string;
  nodeId: string;
  model: ClaudeModel;
  mode: InstanceMode;
  prompt?: string;
  planMode?: boolean;
  /** ID of the node that initiated the request */
  sourceNodeId?: string;
}

/** Request for a secondary node to register with primary */
export interface NodeRegistrationRequest {
  nodeId: string;
  nodeName: string;
  sharedSecret: string; // For authentication
  projects: Project[];
  instances: ClaudeInstance[];
}

/** Response to node registration */
export interface NodeRegistrationResponse {
  success: boolean;
  error?: string;
  token?: string; // JWT token for subsequent requests
  clusterState?: ClusterState;
}

/** Current state of the cluster */
export interface ClusterState {
  nodes: ClusterNode[];
  localNodeId: string;
  /** Monotonically increasing version number for state ordering */
  version: number;
  /** Unix timestamp when state was generated */
  timestamp: number;
}

// ==================== WebSocket Event Types ====================

/** Events sent from nodes to primary */
export interface ClusterClientToServerEvents {
  // Registration and heartbeat
  'node:register': (request: NodeRegistrationRequest) => void;
  'node:heartbeat': () => void;

  // State updates
  'state:update': (state: { projects: Project[]; instances: ClaudeInstance[] }) => void;

  // Instance events (from remote node back to primary)
  'instance:output': (instanceId: string, data: StreamMessage) => void;
  'instance:status': (instanceId: string, status: InstanceStatus) => void;
  'instance:error': (instanceId: string, error: string) => void;
  'instance:exit': (instanceId: string, code: number) => void;
  'instance:rawOutput': (instanceId: string, data: string) => void;
  'instance:sessionId': (instanceId: string, sessionId: string) => void;
  'instance:terminalTitle': (instanceId: string, title: string) => void;

  // Cross-node instance creation request (secondary -> primary -> target node)
  'instance:createRequest': (request: RemoteInstanceRequest) => void;

  // Shell events (from remote node back to primary)
  'shell:createRequest': (nodeId: string, projectId: string) => void;
  'shell:output': (shellId: string, data: string) => void;
  'shell:exit': (shellId: string, code: number) => void;

  // Resize request (secondary -> primary -> target node)
  'instance:resizeRequest': (
    instanceId: string,
    nodeId: string,
    cols: number,
    rows: number
  ) => void;

  // Permission events (secondary -> primary)
  'permissions:updated': (event: ClusterPermissionChangeEvent) => void;

  // Hook and subagent events (from remote node back to primary)
  'instance:hookStatus': (instanceId: string, data: HookStatusUpdate) => void;
  'hook:activity': (data: {
    instanceId: string;
    toolName?: string;
    files?: string[];
    timestamp: number;
  }) => void;
  'subagent:started': (data: { instanceId: string; subagent: SubagentInstance }) => void;
  'subagent:completed': (data: { instanceId: string; subagent: SubagentInstance }) => void;

  // Context sharing events (from remote node back to primary)
  'context:instanceUpdated': (data: { projectId: string; context: SharedInstanceContext }) => void;
  'context:knowledgeUpdated': (data: {
    projectId: string;
    knowledge: ProjectSharedKnowledge;
  }) => void;
  'context:updated': (event: ContextUpdateEvent) => void;
}

/** Events sent from primary to nodes */
export interface ClusterServerToClientEvents {
  // Registration response
  'node:registered': (response: NodeRegistrationResponse) => void;
  'node:rejected': (error: string) => void;

  // Cluster state
  'cluster:state': (state: ClusterState) => void;
  'node:joined': (node: ClusterNode) => void;
  'node:left': (nodeId: string) => void;
  'node:updated': (node: ClusterNode) => void;

  // Commands to nodes
  'instance:create': (request: RemoteInstanceRequest, requestId: string) => void;
  'instance:kill': (instanceId: string) => void;
  'instance:input': (instanceId: string, input: string) => void;
  'instance:resize': (instanceId: string, cols: number, rows: number) => void;
  'instance:dimensionSync': (instanceId: string, cols: number, rows: number) => void;

  // Shell commands to nodes
  'shell:create': (projectId: string, requestId: string) => void;

  // Forwarded instance events (from other nodes)
  'instance:output': (instanceId: string, nodeId: string, data: StreamMessage) => void;
  'instance:status': (instanceId: string, nodeId: string, status: InstanceStatus) => void;
  'instance:error': (instanceId: string, nodeId: string, error: string) => void;
  'instance:exit': (instanceId: string, nodeId: string, code: number) => void;
  'instance:rawOutput': (instanceId: string, nodeId: string, data: string) => void;
  'instance:sessionId': (instanceId: string, nodeId: string, sessionId: string) => void;
  'instance:terminalTitle': (instanceId: string, nodeId: string, title: string) => void;

  // Permission events
  'permissions:changed': (event: ClusterPermissionChangeEvent) => void;
  'permissions:denied': (action: string, reason: string) => void;

  // Forwarded hook and subagent events (from other nodes)
  'instance:hookStatus': (instanceId: string, nodeId: string, data: HookStatusUpdate) => void;
  'hook:activity': (
    nodeId: string,
    data: { instanceId: string; toolName?: string; files?: string[]; timestamp: number }
  ) => void;
  'subagent:started': (
    nodeId: string,
    data: { instanceId: string; subagent: SubagentInstance }
  ) => void;
  'subagent:completed': (
    nodeId: string,
    data: { instanceId: string; subagent: SubagentInstance }
  ) => void;

  // Forwarded context sharing events (from other nodes)
  'context:instanceUpdated': (data: { projectId: string; context: SharedInstanceContext }) => void;
  'context:knowledgeUpdated': (data: {
    projectId: string;
    knowledge: ProjectSharedKnowledge;
  }) => void;
  'context:updated': (event: ContextUpdateEvent) => void;
}

// ==================== Authentication Types ====================

/** Challenge-response for node authentication */
export interface ClusterAuthChallenge {
  challenge: string;
  timestamp: number;
}

/** Response to authentication challenge */
export interface ClusterAuthResponse {
  nodeId: string;
  nodeName: string;
  signature: string; // HMAC-SHA256 of challenge with shared secret
  timestamp: number;
}

// ==================== Status Types ====================

/** Status of cluster connection */
export interface ClusterStatus {
  enabled: boolean;
  role: ClusterNodeRole;
  connected: boolean;
  nodeCount: number;
  nodes: ClusterNode[];
  localNodeId: string;
  error?: string;
}

// ==================== IPC Types ====================

/** Cluster IPC event types */
export interface ClusterIpcEvents {
  'cluster:stateChanged': (state: ClusterState) => void;
  'cluster:nodeJoined': (node: ClusterNode) => void;
  'cluster:nodeLeft': (nodeId: string) => void;
  'cluster:error': (error: string) => void;
  'cluster:connected': () => void;
  'cluster:disconnected': () => void;
}

// ==================== Utility Types ====================

/** Instance routing info - determines which node should handle an instance */
export interface InstanceRouting {
  instanceId: string;
  nodeId: string;
  isLocal: boolean;
}

/** Map of instance IDs to their routing info */
export type InstanceRoutingMap = Map<string, InstanceRouting>;
