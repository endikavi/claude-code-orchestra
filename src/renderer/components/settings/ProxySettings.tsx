import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProxyStore } from '../../stores/proxyStore';
import { COMMON_DEV_PORTS } from '@shared/types';
import { XIcon, CheckIcon } from '@renderer/components/icons';

/**
 * ProxySettings component for configuring the web proxy tunnel feature
 */
export function ProxySettings() {
  const { t } = useTranslation();
  const { config, allowedPorts, isLoading, error, loadConfig, updateConfig, addPort, removePort } =
    useProxyStore();

  const [newPort, setNewPort] = useState('');
  const [newPortDescription, setNewPortDescription] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const handleToggleEnabled = () => {
    void updateConfig({ enabled: !config.enabled });
  };

  const handleAddPort = () => {
    setAddError(null);
    const portNum = parseInt(newPort, 10);

    if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
      setAddError(t('proxy.invalidPort', 'Port must be between 1024 and 65535'));
      return;
    }

    if (allowedPorts.some((p) => p.port === portNum)) {
      setAddError(t('proxy.portExists', 'This port is already in the list'));
      return;
    }

    void addPort(portNum, newPortDescription || undefined);
    setNewPort('');
    setNewPortDescription('');
  };

  const handleRemovePort = (port: number) => {
    void removePort(port);
  };

  const handleAddCommonPort = (port: number, description: string) => {
    if (allowedPorts.some((p) => p.port === port)) {
      return; // Already added
    }
    void addPort(port, description);
  };

  return (
    <div className="space-y-6">
      {/* Error display */}
      {error && (
        <div className="p-3 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-4 rounded bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('proxy.enable', 'Enable Web Preview Proxy')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'proxy.enableDescription',
              'Allow Claude to open web previews of your development servers through the MCP preview_open tool'
            )}
          </p>
        </div>
        <button
          onClick={handleToggleEnabled}
          disabled={isLoading}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            config.enabled ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
              config.enabled ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Allowed Ports Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('proxy.allowedPorts', 'Allowed Ports')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t(
              'proxy.allowedPortsDescription',
              'Only these ports can be proxied for security. Add ports where your development servers run.'
            )}
          </p>
        </div>

        {/* Add new port form */}
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            value={newPort}
            onChange={(e) => setNewPort(e.target.value)}
            placeholder={t('proxy.portPlaceholder', 'Port (e.g., 3000)')}
            className="w-32 px-3 py-2 text-sm rounded-sm border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            min="1024"
            max="65535"
          />
          <input
            type="text"
            value={newPortDescription}
            onChange={(e) => setNewPortDescription(e.target.value)}
            placeholder={t('proxy.descriptionPlaceholder', 'Description (optional)')}
            className="flex-1 min-w-[150px] px-3 py-2 text-sm rounded-sm border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          />
          <button
            onClick={handleAddPort}
            disabled={isLoading || !newPort}
            className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('proxy.addPort', 'Add')}
          </button>
        </div>

        {addError && <p className="text-sm text-red-500 dark:text-red-400">{addError}</p>}

        {/* Current allowed ports list */}
        {allowedPorts.length > 0 ? (
          <div className="space-y-2">
            {allowedPorts.map((port) => (
              <div
                key={port.id}
                className="flex items-center justify-between p-3 rounded bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-sky-500 font-medium">:{port.port}</span>
                  {port.description && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {port.description}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRemovePort(port.port)}
                  className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title={t('proxy.removePort', 'Remove port')}
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-4 text-gray-500 dark:text-gray-400 text-sm">
            {t('proxy.noPorts', 'No ports configured. Add ports to enable preview proxying.')}
          </div>
        )}
      </div>

      {/* Common Development Ports */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('proxy.commonPorts', 'Quick Add Common Ports')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {COMMON_DEV_PORTS.map(({ port, description }) => {
            const isAdded = allowedPorts.some((p) => p.port === port);
            return (
              <button
                key={port}
                onClick={() => handleAddCommonPort(port, description)}
                disabled={isAdded}
                className={`px-3 py-1.5 text-sm rounded-sm border transition-colors ${
                  isAdded
                    ? 'bg-sky-500/20 border-sky-500 text-sky-500 cursor-default'
                    : 'bg-white/50 dark:bg-neutral-700/50 border-gray-200 dark:border-neutral-600 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-neutral-700'
                }`}
                title={description}
              >
                :{port}
                {isAdded && <CheckIcon className="w-3 h-3 inline-block ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rate Limiting Settings */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('proxy.rateLimiting', 'Rate Limiting')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              {t('proxy.maxConcurrentTunnels', 'Max Concurrent Tunnels')}
            </label>
            <input
              type="number"
              value={config.maxConcurrentTunnels}
              onChange={(e) =>
                void updateConfig({ maxConcurrentTunnels: parseInt(e.target.value, 10) || 5 })
              }
              className="w-full px-3 py-2 text-sm rounded-sm border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              min="1"
              max="20"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              {t('proxy.rateLimitPerMinute', 'Requests per minute')}
            </label>
            <input
              type="number"
              value={config.rateLimitPerMinute}
              onChange={(e) =>
                void updateConfig({ rateLimitPerMinute: parseInt(e.target.value, 10) || 100 })
              }
              className="w-full px-3 py-2 text-sm rounded-sm border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
              min="10"
              max="1000"
            />
          </div>
        </div>
      </div>

      {/* Security Info */}
      <div className="p-4 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
        <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
          {t('proxy.securityInfo', 'Security Information')}
        </h4>
        <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>{t('proxy.securityTip1', 'Only localhost (127.0.0.1) can be proxied')}</li>
          <li>{t('proxy.securityTip2', 'System ports (< 1024) are blocked for safety')}</li>
          <li>{t('proxy.securityTip3', 'Authentication is required for all proxy requests')}</li>
          <li>{t('proxy.securityTip4', 'Rate limiting prevents abuse')}</li>
        </ul>
      </div>
    </div>
  );
}
