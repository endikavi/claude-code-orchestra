import { create } from 'zustand';
import type {
  GlobalPermissionConfig,
  PermissionRule,
  PermissionLogEntry,
  PermissionStats,
  PermissionLogQueryOptions,
} from '@shared/types';

interface PermissionState {
  config: GlobalPermissionConfig | null;
  log: PermissionLogEntry[];
  stats: PermissionStats | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadConfig: () => Promise<void>;
  setConfig: (config: Partial<GlobalPermissionConfig>) => Promise<void>;
  addRule: (
    rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ) => Promise<PermissionRule | null>;
  updateRule: (id: string, updates: Partial<PermissionRule>) => Promise<PermissionRule | null>;
  removeRule: (id: string) => Promise<boolean>;
  loadLog: (options?: PermissionLogQueryOptions) => Promise<void>;
  loadStats: () => Promise<void>;
  clearLog: () => Promise<void>;
}

// Check if running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI && 'permission' in window.electronAPI;
};

export const usePermissionStore = create<PermissionState>((set) => ({
  config: null,
  log: [],
  stats: null,
  isLoading: false,
  error: null,

  loadConfig: async () => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const config = await window.electronAPI.permission.getConfig();
      set({ config, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load permission config';
      set({ error: message, isLoading: false });
    }
  },

  setConfig: async (config: Partial<GlobalPermissionConfig>) => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.permission.setConfig(config);
      set((state) => ({
        config: state.config ? { ...state.config, ...config } : null,
      }));
    } catch (error) {
      console.error('Failed to set permission config:', error);
    }
  },

  addRule: async (rule) => {
    if (!isElectron()) return null;

    try {
      const newRule = await window.electronAPI.permission.addRule(rule);
      set((state) => ({
        config: state.config
          ? {
              ...state.config,
              globalRules: [...state.config.globalRules, newRule],
            }
          : null,
      }));
      return newRule;
    } catch (error) {
      console.error('Failed to add permission rule:', error);
      return null;
    }
  },

  updateRule: async (id: string, updates: Partial<PermissionRule>) => {
    if (!isElectron()) return null;

    try {
      const updatedRule = await window.electronAPI.permission.updateRule(id, updates);
      if (updatedRule) {
        set((state) => ({
          config: state.config
            ? {
                ...state.config,
                globalRules: state.config.globalRules.map((r) => (r.id === id ? updatedRule : r)),
              }
            : null,
        }));
      }
      return updatedRule;
    } catch (error) {
      console.error('Failed to update permission rule:', error);
      return null;
    }
  },

  removeRule: async (id: string) => {
    if (!isElectron()) return false;

    try {
      const success = await window.electronAPI.permission.removeRule(id);
      if (success) {
        set((state) => ({
          config: state.config
            ? {
                ...state.config,
                globalRules: state.config.globalRules.filter((r) => r.id !== id),
              }
            : null,
        }));
      }
      return success;
    } catch (error) {
      console.error('Failed to remove permission rule:', error);
      return false;
    }
  },

  loadLog: async (options?: PermissionLogQueryOptions) => {
    if (!isElectron()) return;

    try {
      const log = await window.electronAPI.permission.getLog(options);
      set({ log });
    } catch (error) {
      console.error('Failed to load permission log:', error);
    }
  },

  loadStats: async () => {
    if (!isElectron()) return;

    try {
      const stats = await window.electronAPI.permission.getStats();
      set({ stats });
    } catch (error) {
      console.error('Failed to load permission stats:', error);
    }
  },

  clearLog: async () => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.permission.clearLog();
      set({ log: [] });
    } catch (error) {
      console.error('Failed to clear permission log:', error);
    }
  },
}));
