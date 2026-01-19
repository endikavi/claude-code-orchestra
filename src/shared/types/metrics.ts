// Time period for aggregation
export type MetricsPeriod = 'hour' | 'day' | 'week' | 'month';

// Tool usage metric
export interface ToolUsageMetric {
  toolName: string;
  count: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

// Session metric
export interface SessionMetric {
  sessionId: string;
  instanceId: string;
  projectId: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  totalCostUsd: number;
  toolsUsed: string[];
  toolUseCount: number;
  messageCount: number;
  status: 'active' | 'completed' | 'error' | 'killed';
}

// Project metrics summary
export interface ProjectMetricsSummary {
  projectId: string;
  projectName: string;
  totalSessions: number;
  activeSessions: number;
  totalCostUsd: number;
  avgSessionDurationMs: number;
  toolUsage: ToolUsageMetric[];
  lastActivity: number;
}

// Aggregated metrics data point
export interface MetricsDataPoint {
  timestamp: number; // Start of period
  period: MetricsPeriod;
  sessionCount: number;
  toolUseCount: number;
  totalCostUsd: number;
  avgSessionDurationMs: number;
  toolUsage: Record<string, number>;
}

// Time series data for charts
export interface MetricsTimeSeries {
  period: MetricsPeriod;
  dataPoints: MetricsDataPoint[];
  startTime: number;
  endTime: number;
}

// Hook metrics raw entry (stored in DB)
export interface HookMetricEntry {
  id: string;
  instanceId: string;
  projectId: string;
  sessionId?: string;
  eventType: string; // Hook event type
  toolName?: string;
  success: boolean;
  durationMs?: number;
  costUsd?: number;
  metadata?: string; // JSON stringified extra data
  timestamp: number;
}

// Dashboard metrics summary
export interface DashboardMetricsSummary {
  // Overall stats
  totalProjects: number;
  activeInstances: number;
  totalSessions: number;
  totalCostUsd: number;

  // Time-based stats
  sessionsToday: number;
  sessionsThisWeek: number;
  costToday: number;
  costThisWeek: number;

  // Tool stats
  topTools: ToolUsageMetric[];

  // Project stats
  topProjects: ProjectMetricsSummary[];

  // Recent activity
  recentSessions: SessionMetric[];
}

// Metrics query options
export interface MetricsQueryOptions {
  projectId?: string;
  instanceId?: string;
  period?: MetricsPeriod;
  startDate?: number;
  endDate?: number;
  limit?: number;
  groupBy?: 'project' | 'tool' | 'day' | 'hour';
}

// Cost breakdown
export interface CostBreakdown {
  total: number;
  byProject: Record<string, number>;
  byModel: Record<string, number>;
  byDay: { date: string; cost: number }[];
}

// Usage trends
export interface UsageTrends {
  period: MetricsPeriod;
  currentPeriod: {
    sessions: number;
    toolUses: number;
    cost: number;
  };
  previousPeriod: {
    sessions: number;
    toolUses: number;
    cost: number;
  };
  percentChange: {
    sessions: number;
    toolUses: number;
    cost: number;
  };
}

// Chart configuration
export interface MetricsChartConfig {
  type: 'line' | 'bar' | 'pie' | 'area';
  title: string;
  dataKey: string;
  color?: string;
  showLegend?: boolean;
  stacked?: boolean;
}

// Export format
export type MetricsExportFormat = 'json' | 'csv';

// Export options
export interface MetricsExportOptions {
  format: MetricsExportFormat;
  includeRawData: boolean;
  includeSummary: boolean;
  dateRange?: {
    start: number;
    end: number;
  };
  projectIds?: string[];
}
