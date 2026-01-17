import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SecurityConfig } from '@shared/types';

export function AuthSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      const securityConfig = await window.electronAPI.security.getConfig();
      setConfig(securityConfig);
    } catch (error) {
      console.error('Failed to load security config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleUpdateAuth = async (updates: Partial<SecurityConfig['auth']>) => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        auth: { ...config.auth, ...updates },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update auth config:', error);
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
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('security.auth.title')}
      </h4>

      {/* Token Expiration */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          {t('security.auth.tokenExpiration')}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="720"
            value={config.auth.tokenExpirationHours}
            onChange={(e) =>
              handleUpdateAuth({ tokenExpirationHours: parseInt(e.target.value, 10) || 24 })
            }
            className="w-20 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {t('security.auth.hours')}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('security.auth.tokenExpirationDesc')}
        </p>
      </div>

      {/* Max Concurrent Sessions */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          {t('security.auth.maxSessions')}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="100"
            value={config.auth.maxConcurrentSessions}
            onChange={(e) =>
              handleUpdateAuth({ maxConcurrentSessions: parseInt(e.target.value, 10) || 0 })
            }
            className="w-20 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {config.auth.maxConcurrentSessions === 0
              ? t('security.auth.unlimited')
              : t('security.auth.perIp')}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('security.auth.maxSessionsDesc')}
        </p>
      </div>

      {/* Inactivity Timeout */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
          {t('security.auth.inactivityTimeout')}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="1440"
            value={config.auth.inactivityTimeoutMinutes}
            onChange={(e) =>
              handleUpdateAuth({ inactivityTimeoutMinutes: parseInt(e.target.value, 10) || 0 })
            }
            className="w-20 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {config.auth.inactivityTimeoutMinutes === 0
              ? t('security.auth.disabled')
              : t('security.auth.minutes')}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t('security.auth.inactivityTimeoutDesc')}
        </p>
      </div>
    </div>
  );
}
