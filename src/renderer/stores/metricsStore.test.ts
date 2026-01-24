import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMetricsStore } from './metricsStore';

// Store original electronAPI
const originalElectronAPI = window.electronAPI;

describe('metricsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useMetricsStore.setState({
      toolUsage: [],
      sessions: [],
      projectSummary: null,
      timeSeries: null,
      dashboardSummary: null,
      costBreakdown: null,
      usageTrends: null,
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
    it('should have empty toolUsage array', () => {
      const state = useMetricsStore.getState();
      expect(state.toolUsage).toEqual([]);
    });

    it('should have empty sessions array', () => {
      const state = useMetricsStore.getState();
      expect(state.sessions).toEqual([]);
    });

    it('should have null summaries initially', () => {
      const state = useMetricsStore.getState();
      expect(state.projectSummary).toBeNull();
      expect(state.timeSeries).toBeNull();
      expect(state.dashboardSummary).toBeNull();
      expect(state.costBreakdown).toBeNull();
      expect(state.usageTrends).toBeNull();
    });

    it('should not be loading initially', () => {
      const state = useMetricsStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should have no error initially', () => {
      const state = useMetricsStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('loadToolUsage', () => {
    it('should load tool usage data', async () => {
      const mockToolUsage = [
        { tool: 'Read', count: 10, avgDuration: 100 },
        { tool: 'Write', count: 5, avgDuration: 200 },
      ];

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getToolUsage: vi.fn().mockResolvedValue(mockToolUsage),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadToolUsage();

      const state = useMetricsStore.getState();
      expect(state.toolUsage).toEqual(mockToolUsage);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should handle error when loading tool usage', async () => {
      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getToolUsage: vi.fn().mockRejectedValue(new Error('Network error')),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadToolUsage();

      const state = useMetricsStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });

    it('should do nothing when not in Electron', async () => {
      // @ts-expect-error - deliberately setting to simulate non-electron
      window.electronAPI = undefined;

      await useMetricsStore.getState().loadToolUsage();

      const state = useMetricsStore.getState();
      expect(state.toolUsage).toEqual([]);
    });
  });

  describe('loadSessions', () => {
    it('should load sessions data', async () => {
      const mockSessions = [
        { id: 'session1', startTime: 1000, endTime: 2000 },
        { id: 'session2', startTime: 3000, endTime: 4000 },
      ];

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getSessions: vi.fn().mockResolvedValue(mockSessions),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadSessions();

      const state = useMetricsStore.getState();
      expect(state.sessions).toEqual(mockSessions);
    });

    it('should handle error when loading sessions', async () => {
      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getSessions: vi.fn().mockRejectedValue(new Error('DB error')),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadSessions();

      const state = useMetricsStore.getState();
      expect(state.error).toBe('DB error');
    });
  });

  describe('loadProjectSummary', () => {
    it('should load project summary', async () => {
      const mockSummary = {
        projectId: 'proj1',
        totalSessions: 10,
        totalCost: 5.5,
      };

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getProjectSummary: vi.fn().mockResolvedValue(mockSummary),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadProjectSummary('proj1');

      const state = useMetricsStore.getState();
      expect(state.projectSummary).toEqual(mockSummary);
    });

    it('should handle error when loading project summary', async () => {
      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getProjectSummary: vi.fn().mockRejectedValue(new Error('Not found')),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadProjectSummary('proj1');

      const state = useMetricsStore.getState();
      expect(state.error).toBe('Not found');
    });
  });

  describe('loadTimeSeries', () => {
    it('should load time series data', async () => {
      const mockTimeSeries = {
        labels: ['Jan', 'Feb', 'Mar'],
        data: [10, 20, 30],
      };

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getTimeSeries: vi.fn().mockResolvedValue(mockTimeSeries),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadTimeSeries();

      const state = useMetricsStore.getState();
      expect(state.timeSeries).toEqual(mockTimeSeries);
    });

    it('should handle error when loading time series', async () => {
      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getTimeSeries: vi.fn().mockRejectedValue(new Error('Timeout')),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadTimeSeries();

      const state = useMetricsStore.getState();
      expect(state.error).toBe('Timeout');
    });
  });

  describe('loadDashboardSummary', () => {
    it('should load dashboard summary', async () => {
      const mockDashboard = {
        totalInstances: 5,
        activeInstances: 2,
        totalCost: 100,
      };

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getDashboardSummary: vi.fn().mockResolvedValue(mockDashboard),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadDashboardSummary();

      const state = useMetricsStore.getState();
      expect(state.dashboardSummary).toEqual(mockDashboard);
    });
  });

  describe('loadCostBreakdown', () => {
    it('should load cost breakdown', async () => {
      const mockCostBreakdown = {
        total: 50.0,
        byProject: { proj1: 30, proj2: 20 },
      };

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getCostBreakdown: vi.fn().mockResolvedValue(mockCostBreakdown),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadCostBreakdown();

      const state = useMetricsStore.getState();
      expect(state.costBreakdown).toEqual(mockCostBreakdown);
    });
  });

  describe('loadUsageTrends', () => {
    it('should load usage trends', async () => {
      const mockTrends = {
        period: 'week',
        trend: 'up',
        percentChange: 15,
      };

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          getUsageTrends: vi.fn().mockResolvedValue(mockTrends),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().loadUsageTrends('week');

      const state = useMetricsStore.getState();
      expect(state.usageTrends).toEqual(mockTrends);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics data', async () => {
      // Set some initial data
      useMetricsStore.setState({
        toolUsage: [{ tool: 'Test', count: 1 }] as never[],
        sessions: [{ id: 'test' }] as never[],
        projectSummary: { projectId: 'test' } as never,
        timeSeries: { data: [] } as never,
        dashboardSummary: { total: 1 } as never,
        costBreakdown: { total: 1 } as never,
        usageTrends: { trend: 'up' } as never,
      });

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          clear: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().clearMetrics();

      const state = useMetricsStore.getState();
      expect(state.toolUsage).toEqual([]);
      expect(state.sessions).toEqual([]);
      expect(state.projectSummary).toBeNull();
      expect(state.timeSeries).toBeNull();
      expect(state.dashboardSummary).toBeNull();
      expect(state.costBreakdown).toBeNull();
      expect(state.usageTrends).toBeNull();
    });

    it('should handle error silently when clearing fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      window.electronAPI = {
        ...window.electronAPI,
        metrics: {
          ...window.electronAPI.metrics,
          clear: vi.fn().mockRejectedValue(new Error('Clear failed')),
        },
      } as typeof window.electronAPI;

      await useMetricsStore.getState().clearMetrics();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
