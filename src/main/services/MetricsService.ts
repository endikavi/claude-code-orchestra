import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  ToolUseEvent,
  StopEvent,
  HookMetricEntry,
  ToolUsageMetric,
  SessionMetric,
  ProjectMetricsSummary,
  MetricsDataPoint,
  MetricsTimeSeries,
  MetricsPeriod,
  MetricsQueryOptions,
  DashboardMetricsSummary,
  CostBreakdown,
  UsageTrends,
  PermissionDecision,
} from '@shared/types';

// Max entries to keep in memory
const MAX_METRIC_ENTRIES = 10000;
const _MAX_SESSIONS = 500; // Reserved for future session limiting

// Cleanup interval (1 hour)
const CLEANUP_INTERVAL = 60 * 60 * 1000;

// Retention period (30 days)
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionStartEvent {
  instanceId: string;
  projectId: string;
  sessionId?: string;
  timestamp: number;
}

interface PermissionCheckEvent {
  instanceId: string;
  projectId: string;
  toolName: string;
  decision: PermissionDecision;
  timestamp: number;
}

interface HookEvent {
  instanceId: string;
  projectId: string;
  eventType: string;
  timestamp: number;
}

export class MetricsService extends EventEmitter {
  private static instance: MetricsService | null = null;
  private metricEntries: HookMetricEntry[] = [];
  private sessions: Map<string, SessionMetric> = new Map();
  private toolUsageCache: Map<string, ToolUsageMetric> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.startCleanupInterval();
  }

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries();
    }, CLEANUP_INTERVAL);
  }

  /**
   * Clean up old entries
   */
  private cleanupOldEntries(): void {
    const cutoff = Date.now() - RETENTION_MS;
    let cleaned = 0;

    // Clean metric entries
    const originalLength = this.metricEntries.length;
    this.metricEntries = this.metricEntries.filter((e) => e.timestamp > cutoff);
    cleaned += originalLength - this.metricEntries.length;

    // Trim to max size if needed
    if (this.metricEntries.length > MAX_METRIC_ENTRIES) {
      this.metricEntries = this.metricEntries.slice(-MAX_METRIC_ENTRIES);
    }

    // Clean old sessions
    for (const [id, session] of this.sessions) {
      if (session.status !== 'active' && session.startTime < cutoff) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[MetricsService] Cleaned up ${cleaned} old entries`);
    }
  }

  /**
   * Record a hook event
   */
  public recordHookEvent(event: HookEvent): void {
    const entry: HookMetricEntry = {
      id: randomUUID(),
      instanceId: event.instanceId,
      projectId: event.projectId,
      eventType: event.eventType,
      success: true,
      timestamp: event.timestamp,
    };

    this.metricEntries.push(entry);
    this.emit('metric:recorded', entry);
  }

  /**
   * Record a tool use event
   */
  public recordToolUse(event: ToolUseEvent): void {
    const entry: HookMetricEntry = {
      id: randomUUID(),
      instanceId: event.instanceId,
      projectId: event.projectId,
      sessionId: event.sessionId,
      eventType: 'PostToolUse',
      toolName: event.toolName,
      success: event.success,
      durationMs: event.durationMs,
      timestamp: event.timestamp,
      metadata: JSON.stringify({ toolInput: event.toolInput }),
    };

    this.metricEntries.push(entry);

    // Update tool usage cache
    const cached = this.toolUsageCache.get(event.toolName) || {
      toolName: event.toolName,
      count: 0,
      successCount: 0,
      failureCount: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
    };

    cached.count++;
    if (event.success) cached.successCount++;
    else cached.failureCount++;
    if (event.durationMs) {
      cached.totalDurationMs += event.durationMs;
      cached.avgDurationMs = cached.totalDurationMs / cached.count;
    }

    this.toolUsageCache.set(event.toolName, cached);

    // Update session tool count
    const sessionKey = `${event.instanceId}`;
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.toolUseCount++;
      if (!session.toolsUsed.includes(event.toolName)) {
        session.toolsUsed.push(event.toolName);
      }
    }

    this.emit('metric:toolUse', event);
  }

  /**
   * Record a session start
   */
  public recordSessionStart(event: SessionStartEvent): void {
    const sessionKey = event.instanceId;

    const session: SessionMetric = {
      sessionId: event.sessionId || event.instanceId,
      instanceId: event.instanceId,
      projectId: event.projectId,
      startTime: event.timestamp,
      totalCostUsd: 0,
      toolsUsed: [],
      toolUseCount: 0,
      messageCount: 0,
      status: 'active',
    };

    this.sessions.set(sessionKey, session);

    const entry: HookMetricEntry = {
      id: randomUUID(),
      instanceId: event.instanceId,
      projectId: event.projectId,
      sessionId: event.sessionId,
      eventType: 'SessionStart',
      success: true,
      timestamp: event.timestamp,
    };

    this.metricEntries.push(entry);
    this.emit('metric:sessionStart', session);
  }

  /**
   * Record a session end
   */
  public recordSessionEnd(event: StopEvent): void {
    const sessionKey = event.instanceId;
    const session = this.sessions.get(sessionKey);

    if (session) {
      session.endTime = event.timestamp;
      session.durationMs = event.timestamp - session.startTime;
      session.totalCostUsd = event.totalCostUsd || session.totalCostUsd;
      session.status = event.reason === 'error' ? 'error' : 'completed';
    }

    const entry: HookMetricEntry = {
      id: randomUUID(),
      instanceId: event.instanceId,
      projectId: event.projectId,
      sessionId: event.sessionId,
      eventType: 'SessionEnd',
      success: true,
      durationMs: event.durationMs,
      costUsd: event.totalCostUsd,
      timestamp: event.timestamp,
    };

    this.metricEntries.push(entry);
    this.emit('metric:sessionEnd', event);
  }

  /**
   * Record a permission check
   */
  public recordPermissionCheck(event: PermissionCheckEvent): void {
    const entry: HookMetricEntry = {
      id: randomUUID(),
      instanceId: event.instanceId,
      projectId: event.projectId,
      eventType: 'PermissionCheck',
      toolName: event.toolName,
      success: event.decision === 'allow',
      timestamp: event.timestamp,
      metadata: JSON.stringify({ decision: event.decision }),
    };

    this.metricEntries.push(entry);
    this.emit('metric:permission', event);
  }

  /**
   * Get tool usage metrics
   */
  public getToolUsage(options: MetricsQueryOptions = {}): ToolUsageMetric[] {
    // If no filters, return cached values
    if (!options.projectId && !options.startDate && !options.endDate) {
      return [...this.toolUsageCache.values()].sort((a, b) => b.count - a.count);
    }

    // Calculate from entries
    const toolMap = new Map<string, ToolUsageMetric>();

    for (const entry of this.metricEntries) {
      if (entry.eventType !== 'PostToolUse' || !entry.toolName) continue;

      if (options.projectId && entry.projectId !== options.projectId) continue;
      if (options.startDate && entry.timestamp < options.startDate) continue;
      if (options.endDate && entry.timestamp > options.endDate) continue;

      const metric = toolMap.get(entry.toolName) || {
        toolName: entry.toolName,
        count: 0,
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
      };

      metric.count++;
      if (entry.success) metric.successCount++;
      else metric.failureCount++;
      if (entry.durationMs) {
        metric.totalDurationMs += entry.durationMs;
        metric.avgDurationMs = metric.totalDurationMs / metric.count;
      }

      toolMap.set(entry.toolName, metric);
    }

    const results = [...toolMap.values()].sort((a, b) => b.count - a.count);

    if (options.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get session metrics
   */
  public getSessions(options: MetricsQueryOptions = {}): SessionMetric[] {
    let results = [...this.sessions.values()];

    if (options.projectId) {
      results = results.filter((s) => s.projectId === options.projectId);
    }

    if (options.instanceId) {
      results = results.filter((s) => s.instanceId === options.instanceId);
    }

    if (options.startDate) {
      results = results.filter((s) => s.startTime >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter((s) => s.startTime <= options.endDate!);
    }

    results.sort((a, b) => b.startTime - a.startTime);

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get project metrics summary
   */
  public getProjectSummary(projectId: string): ProjectMetricsSummary {
    const sessions = this.getSessions({ projectId });
    const toolUsage = this.getToolUsage({ projectId });

    const activeSessions = sessions.filter((s) => s.status === 'active').length;
    const completedSessions = sessions.filter((s) => s.status !== 'active');
    const totalCostUsd = sessions.reduce((sum, s) => sum + (s.totalCostUsd || 0), 0);

    const avgDuration =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0) /
          completedSessions.length
        : 0;

    const lastActivity = sessions.length > 0 ? Math.max(...sessions.map((s) => s.startTime)) : 0;

    return {
      projectId,
      projectName: '', // Caller should fill this in
      totalSessions: sessions.length,
      activeSessions,
      totalCostUsd,
      avgSessionDurationMs: avgDuration,
      toolUsage: toolUsage.slice(0, 10),
      lastActivity,
    };
  }

  /**
   * Get time series data
   */
  public getTimeSeries(options: MetricsQueryOptions = {}): MetricsTimeSeries {
    const period = options.period || 'day';
    const endTime = options.endDate || Date.now();
    const periodMs = this.getPeriodMs(period);
    const startTime = options.startDate || endTime - periodMs * 30; // Default 30 periods

    const dataPoints: MetricsDataPoint[] = [];
    let currentTime = startTime;

    while (currentTime < endTime) {
      const periodEnd = currentTime + periodMs;

      const periodEntries = this.metricEntries.filter(
        (e) =>
          e.timestamp >= currentTime &&
          e.timestamp < periodEnd &&
          (!options.projectId || e.projectId === options.projectId)
      );

      const sessionEntries = periodEntries.filter((e) => e.eventType === 'SessionStart');
      const toolEntries = periodEntries.filter((e) => e.eventType === 'PostToolUse');

      const toolUsage: Record<string, number> = {};
      for (const entry of toolEntries) {
        if (entry.toolName) {
          toolUsage[entry.toolName] = (toolUsage[entry.toolName] || 0) + 1;
        }
      }

      const costEntries = periodEntries.filter((e) => e.costUsd);
      const totalCost = costEntries.reduce((sum, e) => sum + (e.costUsd || 0), 0);

      dataPoints.push({
        timestamp: currentTime,
        period,
        sessionCount: sessionEntries.length,
        toolUseCount: toolEntries.length,
        totalCostUsd: totalCost,
        avgSessionDurationMs: 0, // Would need session data
        toolUsage,
      });

      currentTime = periodEnd;
    }

    return {
      period,
      dataPoints,
      startTime,
      endTime,
    };
  }

  /**
   * Get period milliseconds
   */
  private getPeriodMs(period: MetricsPeriod): number {
    switch (period) {
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'week':
        return 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Get dashboard summary
   */
  public getDashboardSummary(): DashboardMetricsSummary {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;

    const allSessions = [...this.sessions.values()];
    const activeInstances = allSessions.filter((s) => s.status === 'active').length;

    const sessionsToday = allSessions.filter((s) => s.startTime >= todayStart).length;
    const sessionsThisWeek = allSessions.filter((s) => s.startTime >= weekStart).length;

    const costEntries = this.metricEntries.filter((e) => e.costUsd);
    const costToday = costEntries
      .filter((e) => e.timestamp >= todayStart)
      .reduce((sum, e) => sum + (e.costUsd || 0), 0);
    const costThisWeek = costEntries
      .filter((e) => e.timestamp >= weekStart)
      .reduce((sum, e) => sum + (e.costUsd || 0), 0);

    // Get unique projects
    const projectIds = new Set(this.metricEntries.map((e) => e.projectId));

    return {
      totalProjects: projectIds.size,
      activeInstances,
      totalSessions: allSessions.length,
      totalCostUsd: costEntries.reduce((sum, e) => sum + (e.costUsd || 0), 0),
      sessionsToday,
      sessionsThisWeek,
      costToday,
      costThisWeek,
      topTools: this.getToolUsage({ limit: 5 }),
      topProjects: [], // Caller should fill this
      recentSessions: this.getSessions({ limit: 10 }),
    };
  }

  /**
   * Get cost breakdown
   */
  public getCostBreakdown(options: MetricsQueryOptions = {}): CostBreakdown {
    const costEntries = this.metricEntries.filter(
      (e) =>
        e.costUsd &&
        (!options.startDate || e.timestamp >= options.startDate) &&
        (!options.endDate || e.timestamp <= options.endDate)
    );

    const byProject: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    const byDay: { date: string; cost: number }[] = [];

    const dayMap = new Map<string, number>();

    for (const entry of costEntries) {
      byProject[entry.projectId] = (byProject[entry.projectId] || 0) + (entry.costUsd || 0);

      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      dayMap.set(date, (dayMap.get(date) || 0) + (entry.costUsd || 0));
    }

    for (const [date, cost] of dayMap) {
      byDay.push({ date, cost });
    }
    byDay.sort((a, b) => a.date.localeCompare(b.date));

    return {
      total: costEntries.reduce((sum, e) => sum + (e.costUsd || 0), 0),
      byProject,
      byModel,
      byDay,
    };
  }

  /**
   * Get usage trends
   */
  public getUsageTrends(period: MetricsPeriod = 'week'): UsageTrends {
    const now = Date.now();
    const periodMs = this.getPeriodMs(period);

    const currentStart = now - periodMs;
    const previousStart = currentStart - periodMs;

    const currentEntries = this.metricEntries.filter(
      (e) => e.timestamp >= currentStart && e.timestamp < now
    );
    const previousEntries = this.metricEntries.filter(
      (e) => e.timestamp >= previousStart && e.timestamp < currentStart
    );

    const current = {
      sessions: currentEntries.filter((e) => e.eventType === 'SessionStart').length,
      toolUses: currentEntries.filter((e) => e.eventType === 'PostToolUse').length,
      cost: currentEntries.reduce((sum, e) => sum + (e.costUsd || 0), 0),
    };

    const previous = {
      sessions: previousEntries.filter((e) => e.eventType === 'SessionStart').length,
      toolUses: previousEntries.filter((e) => e.eventType === 'PostToolUse').length,
      cost: previousEntries.reduce((sum, e) => sum + (e.costUsd || 0), 0),
    };

    const calcChange = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

    return {
      period,
      currentPeriod: current,
      previousPeriod: previous,
      percentChange: {
        sessions: calcChange(current.sessions, previous.sessions),
        toolUses: calcChange(current.toolUses, previous.toolUses),
        cost: calcChange(current.cost, previous.cost),
      },
    };
  }

  /**
   * Get raw metric entries
   */
  public getEntries(options: MetricsQueryOptions = {}): HookMetricEntry[] {
    let results = [...this.metricEntries];

    if (options.projectId) {
      results = results.filter((e) => e.projectId === options.projectId);
    }

    if (options.instanceId) {
      results = results.filter((e) => e.instanceId === options.instanceId);
    }

    if (options.startDate) {
      results = results.filter((e) => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter((e) => e.timestamp <= options.endDate!);
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metricEntries = [];
    this.sessions.clear();
    this.toolUsageCache.clear();
    this.emit('metrics:cleared');
  }

  /**
   * Destroy the metrics service
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    MetricsService.instance = null;
  }
}

// Export singleton getter
export function getMetricsService(): MetricsService {
  return MetricsService.getInstance();
}
