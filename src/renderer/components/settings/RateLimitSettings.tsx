import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SecurityConfig } from '@shared/types';

interface Lockout {
  ip: string;
  lockedAt: number;
  expiresAt: number;
  attempts: number;
}

export function RateLimitSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [lockouts, setLockouts] = useState<Lockout[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [securityConfig, activeLockouts] = await Promise.all([
        window.electronAPI.security.getConfig(),
        window.electronAPI.security.getLockouts(),
      ]);
      setConfig(securityConfig);
      setLockouts(activeLockouts);
    } catch (error) {
      console.error('Failed to load rate limit config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleEnabled = async () => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        rateLimit: { ...config.rateLimit, enabled: !config.rateLimit.enabled },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update rate limit config:', error);
    }
  };

  const handleToggleLockout = async () => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        rateLimit: { ...config.rateLimit, lockoutEnabled: !config.rateLimit.lockoutEnabled },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update rate limit config:', error);
    }
  };

  const handleUpdateRateLimit = async (updates: Partial<SecurityConfig['rateLimit']>) => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        rateLimit: { ...config.rateLimit, ...updates },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update rate limit config:', error);
    }
  };

  const handleUnlockIp = async (ip: string) => {
    try {
      await window.electronAPI.security.unlockIp(ip);
      setLockouts(lockouts.filter((l) => l.ip !== ip));
    } catch (error) {
      console.error('Failed to unlock IP:', error);
    }
  };

  if (loading || !config) {
    return (
      <div className="bg-white/50 dark:bg-gray-700/50 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('security.rateLimit.title')}
        </h4>
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.rateLimit.enabled}
            onChange={handleToggleEnabled}
            className="sr-only peer"
          />
          <div className="relative w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-claude-orange"></div>
        </label>
      </div>

      {config.rateLimit.enabled && (
        <>
          {/* Max Attempts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                {t('security.rateLimit.maxAttempts')}
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={config.rateLimit.maxAttempts}
                onChange={(e) =>
                  handleUpdateRateLimit({ maxAttempts: parseInt(e.target.value, 10) || 5 })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                {t('security.rateLimit.windowMinutes')}
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={config.rateLimit.windowMinutes}
                onChange={(e) =>
                  handleUpdateRateLimit({ windowMinutes: parseInt(e.target.value, 10) || 1 })
                }
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('security.rateLimit.description', {
              attempts: config.rateLimit.maxAttempts,
              minutes: config.rateLimit.windowMinutes,
            })}
          </p>

          {/* Lockout settings */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {t('security.rateLimit.lockout')}
              </span>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rateLimit.lockoutEnabled}
                  onChange={handleToggleLockout}
                  className="sr-only peer"
                />
                <div className="relative w-9 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-claude-orange"></div>
              </label>
            </div>

            {config.rateLimit.lockoutEnabled && (
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {t('security.rateLimit.lockoutMinutes')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={config.rateLimit.lockoutMinutes}
                  onChange={(e) =>
                    handleUpdateRateLimit({ lockoutMinutes: parseInt(e.target.value, 10) || 15 })
                  }
                  className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* Active lockouts */}
          {lockouts.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
              <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t('security.rateLimit.activeLockouts')}
              </h5>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {lockouts.map((lockout) => {
                  const remainingMs = lockout.expiresAt - Date.now();
                  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));

                  return (
                    <div
                      key={lockout.ip}
                      className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-xs"
                    >
                      <div>
                        <span className="font-mono text-red-700 dark:text-red-400">
                          {lockout.ip}
                        </span>
                        <span className="text-red-600 dark:text-red-400 ml-2">
                          ({remainingMin} {t('security.auth.minutes')})
                        </span>
                      </div>
                      <button
                        onClick={() => handleUnlockIp(lockout.ip)}
                        className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded transition-colors"
                      >
                        {t('security.rateLimit.unlock')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
