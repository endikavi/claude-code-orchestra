import { create } from 'zustand';
import type {
  ToolUsageMetric,
  SessionMetric,
  ProjectMetricsSummary,
  MetricsTimeSeries,
  DashboardMetricsSummary,
  CostBreakdown,
  UsageTrends,
  MetricsQueryOptions,
  MetricsPeriod,
} from '@shared/types';

interface MetricsState {
  toolUsage: ToolUsageMetric[];
  sessions: SessionMetric[];
  projectSummary: ProjectMetricsSummary | null;
  timeSeries: MetricsTimeSeries | null;
  dashboardSummary: DashboardMetricsSummary | null;
  costBreakdown: CostBreakdown | null;
  usageTrends: UsageTrends | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadToolUsage: (options?: MetricsQueryOptions) => Promise<void>;
  loadSessions: (options?: MetricsQueryOptions) => Promise<void>;
  loadProjectSummary: (projectId: string) => Promise<void>;
  loadTimeSeries: (options?: MetricsQueryOptions) => Promise<void>;
  loadDashboardSummary: () => Promise<void>;
  loadCostBreakdown: (options?: MetricsQueryOptions) => Promise<void>;
  loadUsageTrends: (period?: MetricsPeriod) => Promise<void>;
  clearMetrics: () => Promise<void>;
}

// Check if running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI && 'metrics' in window.electronAPI;
};

export const useMetricsStore = create<MetricsState>((set) => ({
  toolUsage: [],
  sessions: [],
  projectSummary: null,
  timeSeries: null,
  dashboardSummary: null,
  costBreakdown: null,
  usageTrends: null,
  isLoading: false,
  error: null,

  loadToolUsage: async (options?: MetricsQueryOptions) => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const toolUsage = await window.electronAPI.metrics.getToolUsage(options);
      set({ toolUsage, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load tool usage';
      set({ error: message, isLoading: false });
    }
  },

  loadSessions: async (options?: MetricsQueryOptions) => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const sessions = await window.electronAPI.metrics.getSessions(options);
      set({ sessions, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load sessions';
      set({ error: message, isLoading: false });
    }
  },

  loadProjectSummary: async (projectId: string) => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const projectSummary = await window.electronAPI.metrics.getProjectSummary(projectId);
      set({ projectSummary, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load project summary';
      set({ error: message, isLoading: false });
    }
  },

  loadTimeSeries: async (options?: MetricsQueryOptions) => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const timeSeries = await window.electronAPI.metrics.getTimeSeries(options);
      set({ timeSeries, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load time series';
      set({ error: message, isLoading: false });
    }
  },

  loadDashboardSummary: async () => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const dashboardSummary = await window.electronAPI.metrics.getDashboardSummary();
      set({ dashboardSummary, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dashboard summary';
      set({ error: message, isLoading: false });
    }
  },

  loadCostBreakdown: async (options?: MetricsQueryOptions) => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const costBreakdown = await window.electronAPI.metrics.getCostBreakdown(options);
      set({ costBreakdown, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load cost breakdown';
      set({ error: message, isLoading: false });
    }
  },

  loadUsageTrends: async (period?: MetricsPeriod) => {
    if (!isElectron()) return;

    set({ isLoading: true, error: null });
    try {
      const usageTrends = await window.electronAPI.metrics.getUsageTrends(period);
      set({ usageTrends, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load usage trends';
      set({ error: message, isLoading: false });
    }
  },

  clearMetrics: async () => {
    if (!isElectron()) return;

    try {
      await window.electronAPI.metrics.clear();
      set({
        toolUsage: [],
        sessions: [],
        projectSummary: null,
        timeSeries: null,
        dashboardSummary: null,
        costBreakdown: null,
        usageTrends: null,
      });
    } catch (error) {
      console.error('Failed to clear metrics:', error);
    }
  },
}));
