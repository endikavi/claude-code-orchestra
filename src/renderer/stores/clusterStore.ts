import { create } from 'zustand';
import type {
  ClusterConfig,
  ClusterStatus,
  ClusterState,
  ClusterNode,
  GlobalProject,
  GlobalInstance,
  RemoteInstanceRequest,
  ClusterNodePrivacy,
  ClusterPermissionChangeEvent,
} from '@shared/types/cluster';
import type { ClaudeInstance } from '@shared/types';

// Check if running in Electron
const isElectron = () => {
  return (
    typeof window !== 'undefined' &&
    typeof window.electronAPI !== 'undefined' &&
    typeof window.electronAPI.cluster !== 'undefined'
  );
};

interface ClusterStoreState {
  // Configuration
  config: ClusterConfig | null;
  status: ClusterStatus | null;

  // Cluster state
  nodes: ClusterNode[];
  localNodeId: string;
  globalProjects: GlobalProject[];
  globalInstances: GlobalInstance[];

  // Privacy settings
  privacy: ClusterNodePrivacy | null;

  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadConfig: () => Promise<void>;
  updateConfig: (config: Partial<ClusterConfig>) => Promise<void>;
  loadStatus: () => Promise<void>;
  startCluster: () => Promise<void>;
  stopCluster: () => Promise<void>;
  generateSecret: () => Promise<string | null>;
  loadGlobalProjects: () => Promise<void>;
  loadGlobalInstances: () => Promise<void>;
  createRemoteInstance: (request: RemoteInstanceRequest) => Promise<ClaudeInstance | null>;
  sendRemoteInput: (instanceId: string, nodeId: string, input: string) => Promise<void>;
  killRemoteInstance: (instanceId: string, nodeId: string) => Promise<void>;
  resizeRemoteInstance: (
    instanceId: string,
    nodeId: string,
    cols: number,
    rows: number
  ) => Promise<void>;

  // Privacy actions
  loadPrivacy: () => Promise<void>;
  updatePrivacy: (updates: Partial<ClusterNodePrivacy>) => Promise<void>;
  addTrustedNode: (nodeId: string) => Promise<void>;
  removeTrustedNode: (nodeId: string) => Promise<void>;

  // State updates from events
  handleStateChanged: (state: ClusterState) => void;
  handleNodeJoined: (node: ClusterNode) => void;
  handleNodeLeft: (nodeId: string) => void;
  handleConnected: () => void;
  handleDisconnected: () => void;
  handleError: (error: string) => void;
  handlePermissionsChanged: (event: ClusterPermissionChangeEvent) => void;

  // Setup listeners
  setupListeners: () => () => void;

  // Selectors
  getNodeById: (nodeId: string) => ClusterNode | undefined;
  getProjectsByNode: (nodeId: string) => GlobalProject[];
  getInstancesByNode: (nodeId: string) => GlobalInstance[];
  isClusterEnabled: () => boolean;
  isPrimary: () => boolean;
  isSecondary: () => boolean;
  isTrustedNode: (nodeId: string) => boolean;
}

export const useClusterStore = create<ClusterStoreState>((set, get) => ({
  config: null,
  status: null,
  nodes: [],
  localNodeId: '',
  globalProjects: [],
  globalInstances: [],
  privacy: null,
  isConnected: false,
  isLoading: false,
  error: null,

  loadConfig: async () => {
    if (!isElectron()) return;
    try {
      const config = await window.electronAPI.cluster.getConfig();
      set({ config, localNodeId: config.nodeId });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load cluster config' });
    }
  },

  updateConfig: async (updates) => {
    if (!isElectron()) return;
    set({ isLoading: true, error: null });
    try {
      const config = await window.electronAPI.cluster.updateConfig(updates);
      set({ config, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update cluster config',
        isLoading: false,
      });
    }
  },

  loadStatus: async () => {
    if (!isElectron()) return;
    try {
      const status = await window.electronAPI.cluster.getStatus();
      set({
        status,
        isConnected: status.connected,
        nodes: status.nodes,
        localNodeId: status.localNodeId,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load cluster status' });
    }
  },

  startCluster: async () => {
    if (!isElectron()) return;
    set({ isLoading: true, error: null });
    try {
      // First, enable cluster mode in config
      await window.electronAPI.cluster.updateConfig({ enabled: true });

      // Then start the cluster
      const result = await window.electronAPI.cluster.start();
      if (result.success && result.status) {
        set({
          status: result.status,
          isConnected: result.status.connected,
          nodes: result.status.nodes,
          isLoading: false,
        });
        // Reload config to reflect enabled state
        const config = await window.electronAPI.cluster.getConfig();
        set({ config });
      } else {
        // If start failed, disable cluster mode
        await window.electronAPI.cluster.updateConfig({ enabled: false });
        set({ error: result.error || 'Failed to start cluster', isLoading: false });
      }
    } catch (error) {
      // If error, disable cluster mode
      await window.electronAPI.cluster.updateConfig({ enabled: false }).catch(() => {});
      set({
        error: error instanceof Error ? error.message : 'Failed to start cluster',
        isLoading: false,
      });
    }
  },

  stopCluster: async () => {
    if (!isElectron()) return;
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.cluster.stop();
      if (result.success) {
        // Disable cluster mode in config
        await window.electronAPI.cluster.updateConfig({ enabled: false });
        const config = await window.electronAPI.cluster.getConfig();
        set({
          config,
          isConnected: false,
          nodes: [],
          globalProjects: [],
          globalInstances: [],
          isLoading: false,
        });
      } else {
        set({ error: result.error || 'Failed to stop cluster', isLoading: false });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to stop cluster',
        isLoading: false,
      });
    }
  },

  generateSecret: async () => {
    if (!isElectron()) return null;
    try {
      const result = await window.electronAPI.cluster.generateSecret();
      if (result.success && result.secret) {
        // Reload config to get the new secret
        await get().loadConfig();
        return result.secret;
      }
      return null;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to generate secret' });
      return null;
    }
  },

  loadGlobalProjects: async () => {
    if (!isElectron()) return;
    try {
      const globalProjects = await window.electronAPI.cluster.getGlobalProjects();
      set({ globalProjects });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load global projects' });
    }
  },

  loadGlobalInstances: async () => {
    if (!isElectron()) return;
    try {
      const globalInstances = await window.electronAPI.cluster.getGlobalInstances();
      set({ globalInstances });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load global instances' });
    }
  },

  createRemoteInstance: async (request) => {
    if (!isElectron()) return null;
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.cluster.createRemoteInstance(request);
      set({ isLoading: false });
      if (result.success && result.data) {
        // Reload global instances
        await get().loadGlobalInstances();
        return result.data;
      }
      set({ error: result.error || 'Failed to create remote instance' });
      return null;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create remote instance',
        isLoading: false,
      });
      return null;
    }
  },

  sendRemoteInput: async (instanceId, nodeId, input) => {
    if (!isElectron()) return;
    try {
      await window.electronAPI.cluster.sendRemoteInput(instanceId, nodeId, input);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to send remote input' });
    }
  },

  killRemoteInstance: async (instanceId, nodeId) => {
    if (!isElectron()) return;
    try {
      await window.electronAPI.cluster.killRemoteInstance(instanceId, nodeId);
      // Reload global instances
      await get().loadGlobalInstances();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to kill remote instance' });
    }
  },

  resizeRemoteInstance: async (instanceId, nodeId, cols, rows) => {
    if (!isElectron()) return;
    try {
      await window.electronAPI.cluster.resizeRemoteInstance(instanceId, nodeId, cols, rows);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to resize remote instance' });
    }
  },

  loadPrivacy: async () => {
    if (!isElectron()) return;
    try {
      const privacy = await window.electronAPI.cluster.getPrivacy();
      set({ privacy });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load privacy settings' });
    }
  },

  updatePrivacy: async (updates) => {
    if (!isElectron()) return;
    set({ isLoading: true, error: null });
    try {
      const privacy = await window.electronAPI.cluster.updatePrivacy(updates);
      set({ privacy, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update privacy settings',
        isLoading: false,
      });
    }
  },

  addTrustedNode: async (nodeId) => {
    const { privacy } = get();
    if (!privacy) return;

    const trustedNodeIds = [...privacy.trustedNodeIds];
    if (!trustedNodeIds.includes(nodeId)) {
      trustedNodeIds.push(nodeId);
      await get().updatePrivacy({ trustedNodeIds });
    }
  },

  removeTrustedNode: async (nodeId) => {
    const { privacy } = get();
    if (!privacy) return;

    const trustedNodeIds = privacy.trustedNodeIds.filter((id) => id !== nodeId);
    await get().updatePrivacy({ trustedNodeIds });
  },

  handleStateChanged: (state) => {
    set({
      nodes: state.nodes,
      localNodeId: state.localNodeId,
    });
    // Reload global data
    void get().loadGlobalProjects();
    void get().loadGlobalInstances();
  },

  handleNodeJoined: (node) => {
    set((state) => ({
      nodes: [...state.nodes.filter((n) => n.id !== node.id), node],
    }));
    // Reload global data
    void get().loadGlobalProjects();
    void get().loadGlobalInstances();
  },

  handleNodeLeft: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, status: 'offline' as const } : n)),
    }));
    // Reload global data
    void get().loadGlobalProjects();
    void get().loadGlobalInstances();
  },

  handleConnected: () => {
    set({ isConnected: true, error: null });
    // Reload status and global data
    void get().loadStatus();
    void get().loadGlobalProjects();
    void get().loadGlobalInstances();
  },

  handleDisconnected: () => {
    set({ isConnected: false });
  },

  handleError: (error) => {
    set({ error });
  },

  handlePermissionsChanged: (event) => {
    console.log('[ClusterStore] Permissions changed:', event);
    // Reload privacy settings and global data
    void get().loadPrivacy();
    void get().loadGlobalProjects();
    void get().loadGlobalInstances();
  },

  setupListeners: () => {
    // Cluster listeners are only available in Electron, not in web client
    if (!isElectron()) {
      return () => {};
    }

    const {
      handleStateChanged,
      handleNodeJoined,
      handleNodeLeft,
      handleConnected,
      handleDisconnected,
      handleError,
    } = get();

    const unsubStateChanged = window.electronAPI.cluster.onStateChanged(handleStateChanged);
    const unsubNodeJoined = window.electronAPI.cluster.onNodeJoined(handleNodeJoined);
    const unsubNodeLeft = window.electronAPI.cluster.onNodeLeft(handleNodeLeft);
    const unsubConnected = window.electronAPI.cluster.onConnected(handleConnected);
    const unsubDisconnected = window.electronAPI.cluster.onDisconnected(handleDisconnected);
    const unsubError = window.electronAPI.cluster.onError(handleError);

    return () => {
      unsubStateChanged();
      unsubNodeJoined();
      unsubNodeLeft();
      unsubConnected();
      unsubDisconnected();
      unsubError();
    };
  },

  getNodeById: (nodeId) => {
    return get().nodes.find((n) => n.id === nodeId);
  },

  getProjectsByNode: (nodeId) => {
    return get().globalProjects.filter((p) => p.nodeId === nodeId);
  },

  getInstancesByNode: (nodeId) => {
    return get().globalInstances.filter((i) => i.nodeId === nodeId);
  },

  isClusterEnabled: () => {
    return get().config?.enabled ?? false;
  },

  isPrimary: () => {
    return get().config?.role === 'primary';
  },

  isSecondary: () => {
    return get().config?.role === 'secondary';
  },

  isTrustedNode: (nodeId) => {
    return get().privacy?.trustedNodeIds.includes(nodeId) ?? false;
  },
}));
