import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePermissionStore } from './permissionStore';

// Store original electronAPI
const originalElectronAPI = window.electronAPI;

describe('permissionStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePermissionStore.setState({
      config: null,
      log: [],
      stats: null,
      isLoading: false,
      error: null,
    });

    // Reset mocks
    vi.clearAllMocks();

    // Restore electronAPI to original state
    window.electronAPI = originalElectronAPI;
  });

  afterEach(() => {
    window.electronAPI = originalElectronAPI;
  });

  describe('initial state', () => {
    it('should have null config', () => {
      const state = usePermissionStore.getState();
      expect(state.config).toBeNull();
    });

    it('should have empty log', () => {
      const state = usePermissionStore.getState();
      expect(state.log).toEqual([]);
    });

    it('should have null stats', () => {
      const state = usePermissionStore.getState();
      expect(state.stats).toBeNull();
    });

    it('should not be loading', () => {
      const state = usePermissionStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('loadConfig', () => {
    it('should load permission config', async () => {
      const mockConfig = {
        enabled: true,
        globalRules: [{ id: 'rule1', pattern: '*.ts', action: 'allow' }],
        defaultBehavior: 'ask',
      };

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          getConfig: vi.fn().mockResolvedValue(mockConfig),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().loadConfig();

      const state = usePermissionStore.getState();
      expect(state.config).toEqual(mockConfig);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle error when loading config', async () => {
      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          getConfig: vi.fn().mockRejectedValue(new Error('Config error')),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().loadConfig();

      const state = usePermissionStore.getState();
      expect(state.error).toBe('Config error');
      expect(state.isLoading).toBe(false);
    });

    it('should do nothing when not in Electron', async () => {
      // @ts-expect-error - deliberately setting to simulate non-electron
      window.electronAPI = undefined;

      await usePermissionStore.getState().loadConfig();

      expect(usePermissionStore.getState().config).toBeNull();
    });
  });

  describe('setConfig', () => {
    it('should update config', async () => {
      // Set initial config
      usePermissionStore.setState({
        config: {
          enabled: false,
          globalRules: [],
          defaultBehavior: 'ask',
        } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          setConfig: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().setConfig({ enabled: true });

      const state = usePermissionStore.getState();
      expect(state.config?.enabled).toBe(true);
    });

    it('should handle error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      usePermissionStore.setState({
        config: { enabled: false, globalRules: [] } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          setConfig: vi.fn().mockRejectedValue(new Error('Set failed')),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().setConfig({ enabled: true });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('addRule', () => {
    it('should add a new rule', async () => {
      const existingRule = { id: 'rule1', pattern: '*.js', action: 'allow' };
      const newRule = {
        id: 'rule2',
        pattern: '*.ts',
        action: 'allow',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
      };

      usePermissionStore.setState({
        config: {
          enabled: true,
          globalRules: [existingRule],
        } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          addRule: vi.fn().mockResolvedValue(newRule),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().addRule({
        pattern: '*.ts',
        action: 'allow',
      } as never);

      expect(result).toEqual(newRule);
      const state = usePermissionStore.getState();
      expect(state.config?.globalRules).toHaveLength(2);
    });

    it('should return null when config is null', async () => {
      const newRule = { id: 'rule1', pattern: '*.ts' };

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          addRule: vi.fn().mockResolvedValue(newRule),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().addRule({
        pattern: '*.ts',
      } as never);

      expect(result).toEqual(newRule);
      // Config remains null
      expect(usePermissionStore.getState().config).toBeNull();
    });

    it('should return null on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          addRule: vi.fn().mockRejectedValue(new Error('Add failed')),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().addRule({
        pattern: '*.ts',
      } as never);

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('should return null when not in Electron', async () => {
      // @ts-expect-error - deliberately setting to simulate non-electron
      window.electronAPI = undefined;

      const result = await usePermissionStore.getState().addRule({
        pattern: '*.ts',
      } as never);

      expect(result).toBeNull();
    });
  });

  describe('updateRule', () => {
    it('should update an existing rule', async () => {
      const originalRule = { id: 'rule1', pattern: '*.js', action: 'allow' };
      const updatedRule = { id: 'rule1', pattern: '*.ts', action: 'allow' };

      usePermissionStore.setState({
        config: {
          enabled: true,
          globalRules: [originalRule],
        } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          updateRule: vi.fn().mockResolvedValue(updatedRule),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().updateRule('rule1', { pattern: '*.ts' });

      expect(result).toEqual(updatedRule);
      const state = usePermissionStore.getState();
      expect(state.config?.globalRules[0].pattern).toBe('*.ts');
    });

    it('should return null when update returns null', async () => {
      usePermissionStore.setState({
        config: {
          enabled: true,
          globalRules: [{ id: 'rule1', pattern: '*.js' }],
        } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          updateRule: vi.fn().mockResolvedValue(null),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().updateRule('rule1', { pattern: '*.ts' });

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          updateRule: vi.fn().mockRejectedValue(new Error('Update failed')),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().updateRule('rule1', { pattern: '*.ts' });

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('removeRule', () => {
    it('should remove a rule', async () => {
      const rule1 = { id: 'rule1', pattern: '*.js' };
      const rule2 = { id: 'rule2', pattern: '*.ts' };

      usePermissionStore.setState({
        config: {
          enabled: true,
          globalRules: [rule1, rule2],
        } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          removeRule: vi.fn().mockResolvedValue(true),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().removeRule('rule1');

      expect(result).toBe(true);
      const state = usePermissionStore.getState();
      expect(state.config?.globalRules).toHaveLength(1);
      expect(state.config?.globalRules[0].id).toBe('rule2');
    });

    it('should return false when removal fails', async () => {
      usePermissionStore.setState({
        config: {
          enabled: true,
          globalRules: [{ id: 'rule1', pattern: '*.js' }],
        } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          removeRule: vi.fn().mockResolvedValue(false),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().removeRule('rule1');

      expect(result).toBe(false);
      // Rule should still exist
      expect(usePermissionStore.getState().config?.globalRules).toHaveLength(1);
    });

    it('should return false on error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          removeRule: vi.fn().mockRejectedValue(new Error('Remove failed')),
        },
      } as typeof window.electronAPI;

      const result = await usePermissionStore.getState().removeRule('rule1');

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });

    it('should return false when not in Electron', async () => {
      // @ts-expect-error - deliberately setting to simulate non-electron
      window.electronAPI = undefined;

      const result = await usePermissionStore.getState().removeRule('rule1');

      expect(result).toBe(false);
    });
  });

  describe('loadLog', () => {
    it('should load permission log', async () => {
      const mockLog = [
        { id: 'log1', action: 'allow', timestamp: Date.now() },
        { id: 'log2', action: 'deny', timestamp: Date.now() },
      ];

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          getLog: vi.fn().mockResolvedValue(mockLog),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().loadLog();

      const state = usePermissionStore.getState();
      expect(state.log).toEqual(mockLog);
    });

    it('should pass query options', async () => {
      const mockGetLog = vi.fn().mockResolvedValue([]);

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          getLog: mockGetLog,
        },
      } as typeof window.electronAPI;

      const options = { limit: 10, offset: 0 };
      await usePermissionStore.getState().loadLog(options as never);

      expect(mockGetLog).toHaveBeenCalledWith(options);
    });

    it('should handle error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          getLog: vi.fn().mockRejectedValue(new Error('Log error')),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().loadLog();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('loadStats', () => {
    it('should load permission stats', async () => {
      const mockStats = {
        totalRequests: 100,
        allowed: 80,
        denied: 20,
      };

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          getStats: vi.fn().mockResolvedValue(mockStats),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().loadStats();

      const state = usePermissionStore.getState();
      expect(state.stats).toEqual(mockStats);
    });
  });

  describe('clearLog', () => {
    it('should clear permission log', async () => {
      usePermissionStore.setState({
        log: [{ id: 'log1' }, { id: 'log2' }] as never[],
      });

      window.electronAPI = {
        ...window.electronAPI,
        permission: {
          ...window.electronAPI.permission,
          clearLog: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await usePermissionStore.getState().clearLog();

      const state = usePermissionStore.getState();
      expect(state.log).toEqual([]);
    });
  });
});
