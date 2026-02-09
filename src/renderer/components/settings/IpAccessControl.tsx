import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SecurityConfig, IpAccessRule } from '@shared/types';
import { TrashIcon } from '@renderer/components/icons';

export function IpAccessControl() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SecurityConfig | null>(null);
  const [rules, setRules] = useState<IpAccessRule[]>([]);
  const [newRuleValue, setNewRuleValue] = useState('');
  const [newRuleDescription, setNewRuleDescription] = useState('');
  const [testIp, setTestIp] = useState('');
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [securityConfig, ipRules] = await Promise.all([
        window.electronAPI.security.getConfig(),
        window.electronAPI.security.getIpRules(),
      ]);
      setConfig(securityConfig);
      setRules(ipRules);
    } catch (error) {
      console.error('Failed to load security config:', error);
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
        ipAccess: { ...config.ipAccess, enabled: !config.ipAccess.enabled },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleModeChange = async (mode: 'allowlist' | 'denylist') => {
    if (!config) return;

    try {
      const updated = await window.electronAPI.security.updateConfig({
        ipAccess: { ...config.ipAccess, mode },
      });
      setConfig(updated);
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleAddRule = async () => {
    if (!config || !newRuleValue.trim()) return;

    try {
      const ruleType = config.ipAccess.mode === 'allowlist' ? 'allow' : 'deny';
      const newRule = await window.electronAPI.security.addIpRule({
        type: ruleType,
        value: newRuleValue.trim(),
        description: newRuleDescription.trim() || undefined,
      });
      setRules([newRule, ...rules]);
      setNewRuleValue('');
      setNewRuleDescription('');
    } catch (error) {
      console.error('Failed to add rule:', error);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await window.electronAPI.security.deleteIpRule(id);
      setRules(rules.filter((r) => r.id !== id));
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleTestIp = async () => {
    if (!testIp.trim()) return;

    try {
      const result = await window.electronAPI.security.testIp(testIp.trim());
      setTestResult(result);
    } catch (error) {
      console.error('Failed to test IP:', error);
    }
  };

  if (loading || !config) {
    return (
      <div className="bg-white/50 dark:bg-neutral-700/50 rounded p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 dark:bg-neutral-600 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-300 dark:bg-neutral-600 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/50 dark:bg-neutral-700/50 rounded p-4 space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('security.ipAccess.title')}
        </h4>
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.ipAccess.enabled}
            onChange={handleToggleEnabled}
            className="sr-only peer"
          />
          <div className="relative w-11 h-6 bg-gray-300 dark:bg-neutral-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:bg-sky-500"></div>
        </label>
      </div>

      {config.ipAccess.enabled && (
        <>
          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              onClick={() => handleModeChange('allowlist')}
              className={`flex-1 px-3 py-2 text-xs rounded-sm transition-colors ${
                config.ipAccess.mode === 'allowlist'
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-200 dark:bg-neutral-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-neutral-500'
              }`}
            >
              {t('security.ipAccess.allowlist')}
            </button>
            <button
              onClick={() => handleModeChange('denylist')}
              className={`flex-1 px-3 py-2 text-xs rounded-sm transition-colors ${
                config.ipAccess.mode === 'denylist'
                  ? 'bg-sky-500 text-white'
                  : 'bg-gray-200 dark:bg-neutral-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-neutral-500'
              }`}
            >
              {t('security.ipAccess.denylist')}
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {config.ipAccess.mode === 'allowlist'
              ? t('security.ipAccess.allowlistDesc')
              : t('security.ipAccess.denylistDesc')}
          </p>

          {/* Add rule form */}
          <div className="space-y-2">
            <input
              type="text"
              value={newRuleValue}
              onChange={(e) => setNewRuleValue(e.target.value)}
              placeholder={t('security.ipAccess.ipPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newRuleDescription}
                onChange={(e) => setNewRuleDescription(e.target.value)}
                placeholder={t('security.ipAccess.descriptionPlaceholder')}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                onClick={handleAddRule}
                disabled={!newRuleValue.trim()}
                className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('security.ipAccess.add')}
              </button>
            </div>
          </div>

          {/* Rules list */}
          {rules.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-2 bg-gray-100 dark:bg-neutral-600 rounded-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-gray-800 dark:text-white truncate">
                      {rule.value}
                    </div>
                    {rule.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {rule.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="ml-2 p-1 text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
              {t('security.ipAccess.noRules')}
            </p>
          )}

          {/* Test IP */}
          <div className="pt-2 border-t border-gray-200 dark:border-neutral-600">
            <div className="flex gap-2">
              <input
                type="text"
                value={testIp}
                onChange={(e) => {
                  setTestIp(e.target.value);
                  setTestResult(null);
                }}
                placeholder={t('security.ipAccess.testPlaceholder')}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400"
              />
              <button
                onClick={handleTestIp}
                disabled={!testIp.trim()}
                className="px-3 py-2 text-sm bg-gray-200 dark:bg-neutral-600 hover:bg-gray-300 dark:hover:bg-neutral-500 text-gray-700 dark:text-gray-300 rounded-sm transition-colors disabled:opacity-50"
              >
                {t('security.ipAccess.test')}
              </button>
            </div>
            {testResult && (
              <div
                className={`mt-2 text-xs px-2 py-1 rounded ${
                  testResult.allowed
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}
              >
                {testResult.allowed ? '✓' : '✗'} {testResult.reason}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
