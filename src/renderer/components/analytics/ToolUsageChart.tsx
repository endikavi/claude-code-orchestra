import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ToolUsageMetric } from '@shared/types';

interface ToolUsageChartProps {
  data: ToolUsageMetric[];
  maxItems?: number;
}

export function ToolUsageChart({ data, maxItems = 10 }: ToolUsageChartProps) {
  const { t } = useTranslation();

  // Sort by count and take top items
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.count - a.count).slice(0, maxItems);
  }, [data, maxItems]);

  const maxCount = useMemo(() => {
    return Math.max(...sortedData.map((d) => d.count), 1);
  }, [sortedData]);

  if (sortedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
        <ChartIcon className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">{t('analytics.noToolUsage', 'No tool usage data available')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedData.map((item) => {
        const percentage = (item.count / maxCount) * 100;
        const successRate = item.count > 0 ? (item.successCount / item.count) * 100 : 0;

        return (
          <div key={item.toolName} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-800 dark:text-white">{item.toolName}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {item.count} {t('analytics.uses', 'uses')}
              </span>
            </div>
            <div className="relative h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              {/* Total bar */}
              <div
                className="absolute inset-y-0 left-0 bg-claude-tan/50 dark:bg-gray-600 transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
              {/* Success portion */}
              <div
                className="absolute inset-y-0 left-0 bg-green-500/70 dark:bg-green-600/70 transition-all duration-500"
                style={{ width: `${(percentage * successRate) / 100}%` }}
              />
              {/* Labels */}
              <div className="absolute inset-0 flex items-center justify-between px-2 text-xs">
                <span className="text-gray-700 dark:text-gray-300 font-medium">
                  {successRate.toFixed(0)}% {t('analytics.success', 'success')}
                </span>
                {item.avgDurationMs > 0 && (
                  <span className="text-gray-500 dark:text-gray-400">
                    {formatDuration(item.avgDurationMs)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
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
