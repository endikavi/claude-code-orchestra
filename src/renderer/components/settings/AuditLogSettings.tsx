import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SecurityConfig, AuditLogEntry } from '@shared/types';

export function AuditLogSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([]);
  const [logCount, setLogCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [securityConfig, count] = await Promise.all([
        window.electronAPI.security.getConfig(),
        window.electronAPI.security.getAuditLogCount(),
      ]);
      setConfig(securityConfig);
      setLogCount(count);
    } catch (error) {
      console.error('Failed to load audit log config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadRecentLogs = async () => {
    try {
      const logs = await window.electronAPI.security.getAuditLog({ limit: 50 });
      setRecentLogs(logs);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    }
  };

  const handleToggleEnabled = async () => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        auditLog: { ...config.auditLog, enabled: !config.auditLog.enabled },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update audit log config:', error);
    }
  };

  const handleUpdateAuditLog = async (updates: Partial<SecurityConfig['auditLog']>) => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        auditLog: { ...config.auditLog, ...updates },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update audit log config:', error);
    }
  };

  const handleToggleEvent = async (event: keyof SecurityConfig['auditLog']['logEvents']) => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        auditLog: {
          ...config.auditLog,
          logEvents: {
            ...config.auditLog.logEvents,
            [event]: !config.auditLog.logEvents[event],
          },
        },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update audit log config:', error);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm(t('security.auditLog.confirmClear'))) return;

    try {
      await window.electronAPI.security.clearAuditLog();
      setLogCount(0);
      setRecentLogs([]);
    } catch (error) {
      console.error('Failed to clear audit log:', error);
    }
  };

  const handleShowLogs = async () => {
    if (!showLogs) {
      await loadRecentLogs();
    }
    setShowLogs(!showLogs);
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

  const eventLabels: Record<keyof SecurityConfig['auditLog']['logEvents'], string> = {
    login: t('security.auditLog.events.login'),
    logout: t('security.auditLog.events.logout'),
    failedLogin: t('security.auditLog.events.failedLogin'),
    sessionKick: t('security.auditLog.events.sessionKick'),
    instanceCreate: t('security.auditLog.events.instanceCreate'),
    instanceKill: t('security.auditLog.events.instanceKill'),
    configChange: t('security.auditLog.events.configChange'),
  };

  return (
    <div className="bg-white/50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('security.auditLog.title')}
        </h4>
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.auditLog.enabled}
            onChange={handleToggleEnabled}
            className="sr-only peer"
          />
          <div className="relative w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-claude-orange"></div>
        </label>
      </div>

      {config.auditLog.enabled && (
        <>
          {/* Retention */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600 dark:text-gray-400">
              {t('security.auditLog.retention')}
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={config.auditLog.retentionDays}
              onChange={(e) =>
                handleUpdateAuditLog({ retentionDays: parseInt(e.target.value, 10) || 30 })
              }
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {t('security.auditLog.days')}
            </span>
          </div>

          {/* Events to log */}
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
              {t('security.auditLog.eventsToLog')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(eventLabels) as Array<keyof typeof eventLabels>).map((event) => (
                <label key={event} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.auditLog.logEvents[event]}
                    onChange={() => handleToggleEvent(event)}
                    className="w-4 h-4 text-claude-orange bg-gray-100 border-gray-300 rounded focus:ring-claude-orange dark:focus:ring-claude-orange dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {eventLabels[event]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Log count and actions */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {t('security.auditLog.totalEntries', { count: logCount })}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleShowLogs}
                  className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded transition-colors"
                >
                  {showLogs ? t('security.auditLog.hideLogs') : t('security.auditLog.viewLogs')}
                </button>
                {logCount > 0 && (
                  <button
                    onClick={handleClearLogs}
                    className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded transition-colors"
                  >
                    {t('security.auditLog.clear')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Recent logs */}
          {showLogs && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`text-xs p-2 rounded ${
                      log.success ? 'bg-gray-100 dark:bg-gray-600' : 'bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium ${
                          log.success
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {log.event.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 font-mono">
                      {log.ip}
                      {log.details && ` - ${log.details}`}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                  {t('security.auditLog.noLogs')}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
