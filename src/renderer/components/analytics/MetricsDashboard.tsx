import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMetricsStore } from '../../stores/metricsStore';
import { ToolUsageChart } from './ToolUsageChart';
import type { MetricsPeriod } from '@shared/types';

export function MetricsDashboard() {
  const { t } = useTranslation();
  const {
    toolUsage,
    dashboardSummary,
    costBreakdown,
    usageTrends,
    isLoading,
    loadToolUsage,
    loadDashboardSummary,
    loadCostBreakdown,
    loadUsageTrends,
  } = useMetricsStore();

  const [period, setPeriod] = useState<MetricsPeriod>('week');

  useEffect(() => {
    loadDashboardSummary();
    loadToolUsage({ period });
    loadCostBreakdown({ period });
    loadUsageTrends(period);
  }, [period, loadDashboardSummary, loadToolUsage, loadCostBreakdown, loadUsageTrends]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
            {t('analytics.title', 'Usage Analytics')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('analytics.description', 'Track Claude usage patterns and costs')}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {(['day', 'week', 'month', 'all'] as MetricsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t(`analytics.period.${p}`, p.charAt(0).toUpperCase() + p.slice(1))}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {dashboardSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            title={t('analytics.totalSessions', 'Total Sessions')}
            value={dashboardSummary.totalSessions}
            icon={<SessionIcon className="w-5 h-5" />}
            color="blue"
          />
          <SummaryCard
            title={t('analytics.activeInstances', 'Active Instances')}
            value={dashboardSummary.activeInstances}
            icon={<ActiveIcon className="w-5 h-5" />}
            color="green"
          />
          <SummaryCard
            title={t('analytics.sessionsToday', 'Sessions Today')}
            value={dashboardSummary.sessionsToday}
            icon={<ToolIcon className="w-5 h-5" />}
            color="purple"
          />
          <SummaryCard
            title={t('analytics.totalCost', 'Total Cost')}
            value={`$${dashboardSummary.totalCostUsd.toFixed(2)}`}
            icon={<CostIcon className="w-5 h-5" />}
            color="orange"
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tool Usage */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-claude-tan/30 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white mb-4">
            {t('analytics.toolUsage', 'Tool Usage')}
          </h3>
          {isLoading ? <LoadingSpinner /> : <ToolUsageChart data={toolUsage} />}
        </div>

        {/* Cost Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-claude-tan/30 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white mb-4">
            {t('analytics.costBreakdown', 'Cost Breakdown')}
          </h3>
          {costBreakdown ? (
            <CostBreakdownChart data={costBreakdown} />
          ) : isLoading ? (
            <LoadingSpinner />
          ) : (
            <EmptyState message={t('analytics.noCostData', 'No cost data available')} />
          )}
        </div>
      </div>

      {/* Trends */}
      {usageTrends && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-claude-tan/30 dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium text-gray-800 dark:text-white mb-4">
            {t('analytics.usageTrends', 'Usage Trends')}
          </h3>
          <TrendsDisplay trends={usageTrends} />
        </div>
      )}
    </div>
  );
}

// Summary Card Component
interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'orange';
}

function SummaryCard({ title, value, icon, color }: SummaryCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-claude-tan/30 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{title}</p>
        </div>
      </div>
    </div>
  );
}

// Cost Breakdown Chart
interface CostBreakdownChartProps {
  data: {
    total: number;
    byModel: Record<string, number>;
    byProject: Record<string, number>;
  };
}

function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  const { t } = useTranslation();
  const modelEntries = Object.entries(data.byModel).sort((a, b) => b[1] - a[1]);
  const projectEntries = Object.entries(data.byProject).sort((a, b) => b[1] - a[1]);

  if (modelEntries.length === 0 && projectEntries.length === 0) {
    return <EmptyState message={t('analytics.noCostData', 'No cost data available')} />;
  }

  return (
    <div className="space-y-4">
      {/* By Model */}
      {modelEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {t('analytics.byModel', 'By Model')}
          </h4>
          <div className="space-y-2">
            {modelEntries.slice(0, 5).map(([model, cost]) => (
              <div key={model} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">{model}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  ${cost.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By Project */}
      {projectEntries.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {t('analytics.byProject', 'By Project')}
          </h4>
          <div className="space-y-2">
            {projectEntries.slice(0, 5).map(([project, cost]) => (
              <div key={project} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
                  {project}
                </span>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  ${cost.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('analytics.total', 'Total')}
          </span>
          <span className="text-lg font-bold text-claude-orange">${data.total.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}

// Trends Display
import type { UsageTrends } from '@shared/types';

function TrendsDisplay({ trends }: { trends: UsageTrends }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <TrendItem
        label={t('analytics.sessions', 'Sessions')}
        change={trends.percentChange.sessions}
        current={trends.currentPeriod.sessions}
        previous={trends.previousPeriod.sessions}
      />
      <TrendItem
        label={t('analytics.toolCalls', 'Tool Uses')}
        change={trends.percentChange.toolUses}
        current={trends.currentPeriod.toolUses}
        previous={trends.previousPeriod.toolUses}
      />
      <TrendItem
        label={t('analytics.cost', 'Cost')}
        change={trends.percentChange.cost}
        current={trends.currentPeriod.cost}
        previous={trends.previousPeriod.cost}
        isCurrency
      />
    </div>
  );
}

interface TrendItemProps {
  label: string;
  change: number;
  current: number;
  previous: number;
  isCurrency?: boolean;
}

function TrendItem({ label, change, current, previous, isCurrency }: TrendItemProps) {
  const isPositive = change > 0;
  const isNegative = change < 0;

  // For costs, negative change is good (cost went down)
  const isGood = isCurrency ? isNegative : isPositive;

  const formatValue = (val: number) => {
    if (isCurrency) return `$${val.toFixed(2)}`;
    return val.toString();
  };

  return (
    <div className="text-center bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-800 dark:text-white mb-1">{formatValue(current)}</p>
      <div
        className={`flex items-center justify-center gap-1 text-sm ${
          isGood
            ? 'text-green-600 dark:text-green-400'
            : change === 0
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-red-600 dark:text-red-400'
        }`}
      >
        {isPositive && <ArrowUpIcon className="w-3 h-3" />}
        {isNegative && <ArrowDownIcon className="w-3 h-3" />}
        <span className="font-medium">
          {change === 0 ? '--' : `${Math.abs(change).toFixed(1)}%`}
        </span>
        <span className="text-gray-400 text-xs">vs {formatValue(previous)}</span>
      </div>
    </div>
  );
}

// Helper Components
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-claude-orange" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
      <ChartIcon className="w-8 h-8 mb-2 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// Icons
function SessionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function ActiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
      />
    </svg>
  );
}

function ToolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function CostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 10l7-7m0 0l7 7m-7-7v18"
      />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 14l-7 7m0 0l-7-7m7 7V3"
      />
    </svg>
  );
}
