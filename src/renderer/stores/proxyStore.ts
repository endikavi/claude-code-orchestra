import { create } from 'zustand';
import type { ProxyConfig, AllowedPort, ProxyView, ProxyViewDevToolsState } from '@shared/types';
import type { ConsoleEntry, ConsoleLevel, ConsoleCounts } from '@shared/types/devtools';
import { useInstanceStore } from './instanceStore';

/** Maximum console entries to keep per view */
const MAX_CONSOLE_ENTRIES = 1000;

interface ProxyState {
  // Config state
  config: ProxyConfig;
  allowedPorts: AllowedPort[];
  isLoading: boolean;
  error: string | null;

  // Active proxy views
  proxyViews: Map<string, ProxyView>;
  activeProxyViewId: string | null;

  // DevTools state per view
  devToolsState: Map<string, ProxyViewDevToolsState>;
  consoleEntries: Map<string, ConsoleEntry[]>;

  // Config actions
  loadConfig: () => Promise<void>;
  updateConfig: (config: Partial<ProxyConfig>) => Promise<void>;
  addPort: (port: number, description?: string) => Promise<void>;
  removePort: (port: number) => Promise<void>;

  // Proxy view actions
  openProxyView: (data: {
    port: number;
    path?: string;
    title?: string;
    instanceId?: string;
  }) => string;
  closeProxyView: (viewId: string) => void;
  selectProxyView: (viewId: string | null) => void;
  getProxyViewsForInstance: (instanceId: string) => ProxyView[];

  // DevTools actions
  toggleInspector: (viewId: string) => void;
  toggleConsolePanel: (viewId: string) => void;
  setConsoleFilter: (viewId: string, filter: ConsoleLevel | null) => void;
  addConsoleEntry: (viewId: string, entry: Omit<ConsoleEntry, 'id'>) => void;
  clearConsoleEntries: (viewId: string) => void;
  getConsoleEntries: (viewId: string) => ConsoleEntry[];
  getConsoleCounts: (viewId: string) => ConsoleCounts;
  getDevToolsState: (viewId: string) => ProxyViewDevToolsState;

  // Event listener setup
  setupListeners: () => () => void;
}

// Check if we're in web mode (API bridge available)
const isWebMode = () => {
  return typeof window !== 'undefined' && 'webAPI' in window;
};

// Check if we're in Electron mode
const isElectronMode = () => {
  return typeof window !== 'undefined' && 'electronAPI' in window;
};

// API wrapper for both Electron and Web modes
const getApi = () => {
  if (isWebMode()) {
    return (window as unknown as { webAPI: { proxy: ProxyApi } }).webAPI.proxy;
  }
  if (isElectronMode()) {
    // Electron API needs to be implemented in preload
    return (window.electronAPI as unknown as { proxy: ProxyApi }).proxy;
  }
  return null;
};

interface ProxyApi {
  getConfig: () => Promise<{ success: boolean; data?: ProxyConfig; error?: string }>;
  updateConfig: (
    config: Partial<ProxyConfig>
  ) => Promise<{ success: boolean; data?: ProxyConfig; error?: string }>;
  getPorts: () => Promise<{ success: boolean; data?: AllowedPort[]; error?: string }>;
  addPort: (
    port: number,
    description?: string
  ) => Promise<{ success: boolean; data?: AllowedPort; error?: string }>;
  removePort: (port: number) => Promise<{ success: boolean; error?: string }>;
}

/** Helper to generate unique IDs */
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Default devtools state for a new view */
const getDefaultDevToolsState = (): ProxyViewDevToolsState => ({
  inspectorEnabled: false,
  consolePanelOpen: false,
  consoleFilter: null,
});

export const useProxyStore = create<ProxyState>((set, get) => ({
  config: {
    enabled: false,
    maxConcurrentTunnels: 5,
    rateLimitPerMinute: 100,
  },
  allowedPorts: [],
  isLoading: false,
  error: null,
  proxyViews: new Map(),
  activeProxyViewId: null,
  devToolsState: new Map(),
  consoleEntries: new Map(),

  loadConfig: async () => {
    const api = getApi();
    if (!api) return;

    set({ isLoading: true, error: null });
    try {
      const [configRes, portsRes] = await Promise.all([api.getConfig(), api.getPorts()]);

      if (configRes.success && configRes.data) {
        set({ config: configRes.data });
      }
      if (portsRes.success && portsRes.data) {
        set({ allowedPorts: portsRes.data });
      }
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load proxy config',
        isLoading: false,
      });
    }
  },

  updateConfig: async (configUpdate) => {
    const api = getApi();
    if (!api) return;

    set({ isLoading: true, error: null });
    try {
      const res = await api.updateConfig(configUpdate);
      if (res.success && res.data) {
        set({ config: res.data, isLoading: false });
      } else {
        set({
          error: res.error || 'Failed to update config',
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update config',
        isLoading: false,
      });
    }
  },

  addPort: async (port, description) => {
    const api = getApi();
    if (!api) return;

    set({ isLoading: true, error: null });
    try {
      const res = await api.addPort(port, description);
      if (res.success && res.data) {
        const newPort = res.data;
        set((state) => ({
          allowedPorts: [...state.allowedPorts, newPort],
          isLoading: false,
        }));
      } else {
        set({
          error: res.error || 'Failed to add port',
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to add port',
        isLoading: false,
      });
    }
  },

  removePort: async (port) => {
    const api = getApi();
    if (!api) return;

    set({ isLoading: true, error: null });
    try {
      const res = await api.removePort(port);
      if (res.success) {
        set((state) => ({
          allowedPorts: state.allowedPorts.filter((p) => p.port !== port),
          isLoading: false,
        }));
      } else {
        set({
          error: res.error || 'Failed to remove port',
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to remove port',
        isLoading: false,
      });
    }
  },

  openProxyView: (data) => {
    const viewId = `proxy-${data.port}-${Date.now()}`;
    const proxyView: ProxyView = {
      id: viewId,
      port: data.port,
      path: data.path || '/',
      title: data.title,
      instanceId: data.instanceId,
      createdAt: Date.now(),
    };

    set((state) => {
      const proxyViews = new Map(state.proxyViews);
      proxyViews.set(viewId, proxyView);

      // Initialize devtools state for this view
      const devToolsState = new Map(state.devToolsState);
      devToolsState.set(viewId, getDefaultDevToolsState());

      // Initialize empty console entries for this view
      const consoleEntries = new Map(state.consoleEntries);
      consoleEntries.set(viewId, []);

      return {
        proxyViews,
        devToolsState,
        consoleEntries,
        activeProxyViewId: viewId,
      };
    });

    // Register view with server for MCP tools access
    if (data.instanceId) {
      if (isElectronMode() && window.electronAPI?.devtools?.registerView) {
        window.electronAPI.devtools.registerView(viewId, data.instanceId).catch((err) => {
          console.error('[ProxyStore] Failed to register view with server:', err);
        });
      } else if (isWebMode()) {
        // In web mode, emit via socket
        const webAPI = (
          window as unknown as {
            webAPI?: {
              devtools?: {
                registerView?: (
                  viewId: string,
                  instanceId: string
                ) => Promise<{ success: boolean }>;
              };
            };
          }
        ).webAPI;
        if (webAPI?.devtools?.registerView) {
          webAPI.devtools.registerView(viewId, data.instanceId).catch((err) => {
            console.error('[ProxyStore] Failed to register view with server:', err);
          });
        }
      }
    }

    return viewId;
  },

  closeProxyView: (viewId) => {
    set((state) => {
      const proxyViews = new Map(state.proxyViews);
      proxyViews.delete(viewId);

      // Clean up devtools state
      const devToolsState = new Map(state.devToolsState);
      devToolsState.delete(viewId);

      // Clean up console entries
      const consoleEntries = new Map(state.consoleEntries);
      consoleEntries.delete(viewId);

      // If this was the active view, clear selection
      let newActiveId = state.activeProxyViewId;
      if (state.activeProxyViewId === viewId) {
        // Select another view if available
        const remaining = Array.from(proxyViews.keys());
        newActiveId = remaining.length > 0 ? remaining[0] : null;
      }

      return {
        proxyViews,
        devToolsState,
        consoleEntries,
        activeProxyViewId: newActiveId,
      };
    });
  },

  selectProxyView: (viewId) => {
    set({ activeProxyViewId: viewId });
  },

  getProxyViewsForInstance: (instanceId) => {
    const views = Array.from(get().proxyViews.values());
    return views.filter((v) => v.instanceId === instanceId);
  },

  // DevTools actions
  toggleInspector: (viewId) => {
    set((state) => {
      const devToolsState = new Map(state.devToolsState);
      const current = devToolsState.get(viewId) || getDefaultDevToolsState();
      devToolsState.set(viewId, {
        ...current,
        inspectorEnabled: !current.inspectorEnabled,
      });
      return { devToolsState };
    });
  },

  toggleConsolePanel: (viewId) => {
    set((state) => {
      const devToolsState = new Map(state.devToolsState);
      const current = devToolsState.get(viewId) || getDefaultDevToolsState();
      devToolsState.set(viewId, {
        ...current,
        consolePanelOpen: !current.consolePanelOpen,
      });
      return { devToolsState };
    });
  },

  setConsoleFilter: (viewId, filter) => {
    set((state) => {
      const devToolsState = new Map(state.devToolsState);
      const current = devToolsState.get(viewId) || getDefaultDevToolsState();
      devToolsState.set(viewId, {
        ...current,
        consoleFilter: filter,
      });
      return { devToolsState };
    });
  },

  addConsoleEntry: (viewId, entry) => {
    set((state) => {
      const consoleEntries = new Map(state.consoleEntries);
      const entries = consoleEntries.get(viewId) || [];

      const newEntry: ConsoleEntry = {
        ...entry,
        id: generateId(),
      };

      // Add new entry and trim to max size
      const newEntries = [...entries, newEntry];
      if (newEntries.length > MAX_CONSOLE_ENTRIES) {
        newEntries.splice(0, newEntries.length - MAX_CONSOLE_ENTRIES);
      }

      consoleEntries.set(viewId, newEntries);
      return { consoleEntries };
    });

    // Sync to server for MCP tools access
    if (isElectronMode() && window.electronAPI?.devtools?.addConsoleEntry) {
      window.electronAPI.devtools.addConsoleEntry(viewId, entry).catch((err) => {
        console.error('[ProxyStore] Failed to sync console entry to server:', err);
      });
    } else if (isWebMode()) {
      const webAPI = (
        window as unknown as {
          webAPI?: {
            devtools?: {
              addConsoleEntry?: (
                viewId: string,
                entry: Omit<ConsoleEntry, 'id'>
              ) => Promise<{ success: boolean }>;
            };
          };
        }
      ).webAPI;
      if (webAPI?.devtools?.addConsoleEntry) {
        webAPI.devtools.addConsoleEntry(viewId, entry).catch((err) => {
          console.error('[ProxyStore] Failed to sync console entry to server:', err);
        });
      }
    }
  },

  clearConsoleEntries: (viewId) => {
    set((state) => {
      const consoleEntries = new Map(state.consoleEntries);
      consoleEntries.set(viewId, []);
      return { consoleEntries };
    });
  },

  getConsoleEntries: (viewId) => {
    const state = get();
    const entries = state.consoleEntries.get(viewId) || [];
    const devTools = state.devToolsState.get(viewId);
    const filter = devTools?.consoleFilter;

    if (!filter) {
      return entries;
    }

    return entries.filter((e) => e.level === filter);
  },

  getConsoleCounts: (viewId) => {
    const entries = get().consoleEntries.get(viewId) || [];
    const counts: ConsoleCounts = {
      log: 0,
      info: 0,
      warn: 0,
      error: 0,
      debug: 0,
      total: entries.length,
    };

    for (const entry of entries) {
      counts[entry.level]++;
    }

    return counts;
  },

  getDevToolsState: (viewId) => {
    return get().devToolsState.get(viewId) || getDefaultDevToolsState();
  },

  setupListeners: () => {
    // Listen for proxy:open events from MCP tool
    const handleProxyOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{
        port: number;
        path?: string;
        split?: boolean;
        title?: string;
        instanceId?: string;
      }>;
      if (customEvent.detail) {
        const { port, path, split, title, instanceId } = customEvent.detail;
        const viewId = get().openProxyView({ port, path, title, instanceId });

        // If split is true and we have an instanceId, create a split view
        if (split && instanceId) {
          useInstanceStore.getState().createSplit(instanceId, viewId, 'instance', 'proxy');
        }
      }
    };

    window.addEventListener('proxy:open', handleProxyOpen);

    // Also listen via IPC if available
    let unsubIpc: (() => void) | undefined;
    if (
      isElectronMode() &&
      (window.electronAPI as { proxy?: { onOpen?: (cb: (data: unknown) => void) => () => void } })
        .proxy?.onOpen
    ) {
      unsubIpc = (
        window.electronAPI as {
          proxy: {
            onOpen: (
              cb: (data: {
                port: number;
                path?: string;
                split?: boolean;
                title?: string;
                instanceId?: string;
              }) => void
            ) => () => void;
          };
        }
      ).proxy.onOpen((data) => {
        const viewId = get().openProxyView(data);

        // If split is true and we have an instanceId, create a split view
        if (data.split && data.instanceId) {
          useInstanceStore.getState().createSplit(data.instanceId, viewId, 'instance', 'proxy');
        }
      });
    }

    return () => {
      window.removeEventListener('proxy:open', handleProxyOpen);
      unsubIpc?.();
    };
  },
}));
