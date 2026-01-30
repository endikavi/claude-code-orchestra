import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TerminalPoolConfig, TerminalPoolStats } from '@shared/types/pool';

export function TerminalPoolSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<TerminalPoolConfig | null>(null);
  const [stats, setStats] = useState<TerminalPoolStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Load config and stats on mount
  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configData, statsData] = await Promise.all([
        window.electronAPI.pool.getConfig(),
        window.electronAPI.pool.getStats(),
      ]);
      setConfig(configData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load terminal pool data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!config) return;
    try {
      const updated = await window.electronAPI.pool.updateConfig({
        enabled: !config.enabled,
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to toggle pool:', error);
    }
  };

  const handleConfigChange = async (updates: Partial<TerminalPoolConfig>) => {
    if (!config) return;
    try {
      const updated = await window.electronAPI.pool.updateConfig(updates);
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update pool config:', error);
    }
  };

  const handleResetStats = async () => {
    try {
      await window.electronAPI.pool.resetStats();
      const statsData = await window.electronAPI.pool.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to reset stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!config || !stats) {
    return (
      <div className="p-4 text-red-500">
        {t('pool.loadError', 'Failed to load terminal pool configuration')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('pool.enable', 'Enable Terminal Pool')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'pool.enableDescription',
              'Pre-spawn terminals to accelerate Claude instance creation (10-30x faster)'
            )}
          </p>
        </div>
        <button
          onClick={handleToggleEnabled}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            config.enabled ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
          role="switch"
          aria-checked={config.enabled}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              config.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Pool configuration */}
      {config.enabled && (
        <div className="space-y-4">
          {/* Pool Size Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t('pool.minPoolSize', 'Minimum Pool Size')}
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={config.minPoolSize}
                onChange={(e) =>
                  handleConfigChange({
                    minPoolSize: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)),
                  })
                }
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-sm bg-white/50 dark:bg-neutral-700/50 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('pool.minPoolSizeDesc', 'Terminals kept ready (1-10)')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t('pool.maxPoolSize', 'Maximum Pool Size')}
              </label>
              <input
                type="number"
                min={config.minPoolSize}
                max={20}
                value={config.maxPoolSize}
                onChange={(e) =>
                  handleConfigChange({
                    maxPoolSize: Math.max(
                      config.minPoolSize,
                      Math.min(20, parseInt(e.target.value) || config.minPoolSize)
                    ),
                  })
                }
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-sm bg-white/50 dark:bg-neutral-700/50 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('pool.maxPoolSizeDesc', 'Maximum terminals allowed (min-20)')}
              </p>
            </div>
          </div>

          {/* Timeout Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t('pool.idleTimeout', 'Idle Timeout')}
              </label>
              <select
                value={config.idleTimeoutMs}
                onChange={(e) => handleConfigChange({ idleTimeoutMs: parseInt(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-sm bg-white/50 dark:bg-neutral-700/50 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value={0}>{t('pool.never', 'Never')}</option>
                <option value={60000}>{t('pool.minutes', '{{count}} min', { count: 1 })}</option>
                <option value={300000}>{t('pool.minutes', '{{count}} min', { count: 5 })}</option>
                <option value={600000}>{t('pool.minutes', '{{count}} min', { count: 10 })}</option>
                <option value={1800000}>{t('pool.minutes', '{{count}} min', { count: 30 })}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {t('pool.idleTimeoutDesc', 'Dispose unused terminals after')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {t('pool.replenishDelay', 'Replenish Delay')}
              </label>
              <select
                value={config.replenishDelayMs}
                onChange={(e) => handleConfigChange({ replenishDelayMs: parseInt(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-sm bg-white/50 dark:bg-neutral-700/50 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value={0}>{t('pool.immediately', 'Immediately')}</option>
                <option value={500}>{t('pool.ms', '{{count}} ms', { count: 500 })}</option>
                <option value={1000}>{t('pool.ms', '{{count}} ms', { count: 1000 })}</option>
                <option value={2000}>{t('pool.ms', '{{count}} ms', { count: 2000 })}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {t('pool.replenishDelayDesc', 'Delay before spawning new terminals')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="pt-4 border-t border-gray-200 dark:border-neutral-700">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('pool.statistics', 'Pool Statistics')}
          </h4>
          <button onClick={handleResetStats} className="text-xs text-sky-500 hover:underline">
            {t('pool.resetStats', 'Reset')}
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={t('pool.idleTerminals', 'Idle')} value={stats.idleCount} color="green" />
          <StatCard
            label={t('pool.assignedTerminals', 'In Use')}
            value={stats.assignedCount}
            color="blue"
          />
          <StatCard
            label={t('pool.acquireCount', 'Pool Hits')}
            value={stats.acquireCount}
            color="orange"
          />
          <StatCard
            label={t('pool.fallbackCount', 'Direct Spawns')}
            value={stats.fallbackCount}
            color="gray"
          />
        </div>

        {stats.acquireCount > 0 && (
          <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded">
            <div className="flex items-center gap-2">
              <SpeedIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                {t('pool.timeSaved', 'Avg time saved: ~{{ms}}ms per instance', {
                  ms: stats.avgTimeSavedMs,
                })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
        <div className="flex items-start gap-2">
          <ShieldIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">{t('pool.securityTitle', 'Local Only')}</p>
            <p>
              {t(
                'pool.securityDesc',
                'Terminal pool is only used for local requests. Remote and cluster requests always use direct spawn for security.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'orange' | 'gray';
}) {
  const colorClasses = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    gray: 'bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300',
  };

  return (
    <div className={`p-3 rounded ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}

function SpeedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}
