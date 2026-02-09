import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useClusterStore } from '../../stores/clusterStore';
import { Spinner } from '../common/Spinner';
import { ClusterPrivacySettings } from './ClusterPrivacySettings';
import { usePolling } from '../../hooks/usePolling';
import type { ClusterNodeRole, ClusterNode } from '@shared/types/cluster';
import type { SslConfig } from '@shared/types/ssl';
import { ClipboardIcon, EyeIcon, EyeOffIcon } from '@renderer/components/icons';

export function ClusterSettings() {
  const { t } = useTranslation();
  const {
    config,
    status,
    nodes,
    isConnected,
    isLoading,
    error,
    loadConfig,
    updateConfig,
    loadStatus,
    startCluster,
    stopCluster,
    generateSecret,
    setupListeners,
  } = useClusterStore(
    useShallow((s) => ({
      config: s.config,
      status: s.status,
      nodes: s.nodes,
      isConnected: s.isConnected,
      isLoading: s.isLoading,
      error: s.error,
      loadConfig: s.loadConfig,
      updateConfig: s.updateConfig,
      loadStatus: s.loadStatus,
      startCluster: s.startCluster,
      stopCluster: s.stopCluster,
      generateSecret: s.generateSecret,
      setupListeners: s.setupListeners,
    }))
  );

  const [nodeName, setNodeName] = useState('');
  const [primaryHost, setPrimaryHost] = useState('');
  const [primaryPort, setPrimaryPort] = useState('');
  const [clusterPort, setClusterPort] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // SSL state
  const [sslEnabled, setSslEnabled] = useState(false);
  const [sslSelfSigned, setSslSelfSigned] = useState(true);
  const [sslCertPath, setSslCertPath] = useState('');
  const [sslKeyPath, setSslKeyPath] = useState('');
  const [sslError, setSslError] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    void loadConfig();
    void loadStatus();
    const cleanup = setupListeners();
    return cleanup;
  }, [loadConfig, loadStatus, setupListeners]);

  // Update local state when config changes
  useEffect(() => {
    if (config) {
      setNodeName(config.nodeName);
      setPrimaryHost(config.primaryHost || '');
      setPrimaryPort(config.primaryPort.toString());
      setClusterPort(config.primaryPort.toString());

      // Load SSL config
      if (config.ssl) {
        setSslEnabled(config.ssl.enabled);
        setSslSelfSigned(config.ssl.selfSigned ?? true);
        setSslCertPath(config.ssl.certPath || '');
        setSslKeyPath(config.ssl.keyPath || '');
      }
    }
  }, [config]);

  // Poll status when connected
  usePolling(() => void loadStatus(), 10000, isConnected);

  const handleUpdateRole = async (role: ClusterNodeRole) => {
    await updateConfig({ role });
  };

  const handleUpdateNodeName = async () => {
    if (!nodeName.trim()) return;
    await updateConfig({ nodeName: nodeName.trim() });
  };

  const handleUpdatePrimaryHost = async () => {
    await updateConfig({
      primaryHost: primaryHost.trim(),
      primaryPort: parseInt(primaryPort, 10) || 3847,
    });
  };

  const handleUpdateClusterPort = async () => {
    await updateConfig({
      primaryPort: parseInt(clusterPort, 10) || 3847,
    });
  };

  const handleGenerateSecret = async () => {
    const secret = await generateSecret();
    if (secret) {
      setShowSecret(true);
    }
  };

  const handleToggleCluster = async () => {
    if (status?.connected || (config?.role === 'primary' && config?.enabled)) {
      await stopCluster();
    } else {
      await startCluster();
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  // SSL handlers
  const handleToggleSsl = async () => {
    if (!config) return;

    const newSslEnabled = !sslEnabled;
    setSslEnabled(newSslEnabled);
    setSslError(null);

    try {
      const sslConfig: SslConfig = {
        enabled: newSslEnabled,
        selfSigned: sslSelfSigned,
        certPath: sslCertPath || undefined,
        keyPath: sslKeyPath || undefined,
      };

      await updateConfig({ ssl: sslConfig });
    } catch {
      setSslError('Failed to update SSL configuration');
      setSslEnabled(!newSslEnabled);
    }
  };

  const handleSslTypeChange = async (useSelfSigned: boolean) => {
    if (!config) return;

    setSslSelfSigned(useSelfSigned);
    setSslError(null);

    try {
      await updateConfig({
        ssl: {
          ...config.ssl,
          selfSigned: useSelfSigned,
        },
      });
    } catch {
      setSslError('Failed to update SSL configuration');
      setSslSelfSigned(!useSelfSigned);
    }
  };

  const handleSslPathsBlur = async () => {
    if (!config) return;

    if (sslCertPath !== config.ssl?.certPath || sslKeyPath !== config.ssl?.keyPath) {
      try {
        await updateConfig({
          ssl: {
            ...config.ssl,
            certPath: sslCertPath || undefined,
            keyPath: sslKeyPath || undefined,
          },
        });
      } catch {
        setSslError('Failed to update SSL configuration');
      }
    }
  };

  const roleOptions: { value: ClusterNodeRole; label: string; description: string }[] = [
    {
      value: 'standalone',
      label: t('cluster.roleStandalone', 'Standalone'),
      description: t('cluster.roleStandaloneDesc', 'Not connected to any cluster'),
    },
    {
      value: 'primary',
      label: t('cluster.rolePrimary', 'Primary'),
      description: t('cluster.rolePrimaryDesc', 'Accept connections from other nodes'),
    },
    {
      value: 'secondary',
      label: t('cluster.roleSecondary', 'Secondary'),
      description: t('cluster.roleSecondaryDesc', 'Connect to a primary node'),
    },
  ];

  const hasSecret = config?.sharedSecret && config.sharedSecret.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('cluster.title', 'Multi-Node Cluster')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          {t(
            'cluster.description',
            'Connect multiple Claude Code Orchestra instances across different computers'
          )}
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded bg-red-500/20 border border-red-500/50 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Node Name */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('cluster.nodeName', 'Node Name')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nodeName}
            onChange={(e) => setNodeName(e.target.value)}
            placeholder={t('cluster.nodeNamePlaceholder', 'My Computer')}
            className="flex-1 px-3 py-2 text-sm bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button
            onClick={handleUpdateNodeName}
            disabled={isLoading || !nodeName.trim()}
            className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50"
          >
            {t('common.save', 'Save')}
          </button>
        </div>
      </div>

      {/* Node ID (read-only) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('cluster.nodeId', 'Node ID')}
        </label>
        <div className="flex gap-2">
          <code className="flex-1 px-3 py-2 text-xs bg-gray-100 dark:bg-neutral-800 rounded-sm font-mono overflow-x-auto">
            {config?.nodeId || '...'}
          </code>
          <button
            onClick={() => copyToClipboard(config?.nodeId || '')}
            className="px-3 py-2 text-sm bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 rounded-sm transition-colors"
            title={t('common.copy', 'Copy')}
          >
            <ClipboardIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Role Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('cluster.role', 'Cluster Role')}
        </label>
        <div className="space-y-2">
          {roleOptions.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-3 rounded cursor-pointer border transition-colors ${
                config?.role === option.value
                  ? 'bg-sky-500/10 border-sky-500/50'
                  : 'bg-white/50 dark:bg-neutral-700/50 border-gray-200 dark:border-neutral-600 hover:bg-white/70 dark:hover:bg-neutral-600/50'
              }`}
            >
              <input
                type="radio"
                name="clusterRole"
                value={option.value}
                checked={config?.role === option.value}
                onChange={() => handleUpdateRole(option.value)}
                disabled={isConnected && config?.role !== 'standalone'}
                className="mt-1 w-4 h-4 text-sky-500 focus:ring-sky-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {option.label}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Primary Node Settings */}
      {config?.role === 'primary' && (
        <div className="space-y-4 p-4 rounded bg-blue-500/10 border border-blue-500/30">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('cluster.primarySettings', 'Primary Node Settings')}
          </h4>

          {/* Cluster Port */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              {t('cluster.clusterPort', 'Cluster Port')}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={clusterPort}
                onChange={(e) => setClusterPort(e.target.value)}
                placeholder="3847"
                disabled={isConnected}
                min={1}
                max={65535}
                className="w-32 px-3 py-2 text-sm bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
              />
              <button
                onClick={handleUpdateClusterPort}
                disabled={isLoading || isConnected}
                className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50"
              >
                {t('common.save', 'Save')}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t(
                'cluster.clusterPortDesc',
                'Port for the cluster server. Secondary nodes will connect to this port.'
              )}
            </p>
          </div>

          {/* Shared Secret */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              {t('cluster.sharedSecret', 'Shared Secret')}
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={config?.sharedSecret || ''}
                  readOnly
                  className="w-full px-3 py-2 pr-10 text-sm bg-gray-100 dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-sm font-mono"
                />
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {showSecret ? (
                    <EyeOffIcon className="w-4 h-4" />
                  ) : (
                    <EyeIcon className="w-4 h-4" />
                  )}
                </button>
              </div>
              <button
                onClick={() => copyToClipboard(config?.sharedSecret || '')}
                disabled={!hasSecret}
                className="px-3 py-2 text-sm bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 rounded-sm transition-colors disabled:opacity-50"
                title={t('common.copy', 'Copy')}
              >
                <ClipboardIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleGenerateSecret}
                disabled={isLoading}
                className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50"
              >
                {hasSecret
                  ? t('cluster.regenerateSecret', 'Regenerate')
                  : t('cluster.generateSecret', 'Generate')}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t(
                'cluster.sharedSecretDesc',
                'Share this secret with secondary nodes to allow them to connect'
              )}
            </p>
          </div>

          {/* SSL/TLS Configuration for Primary */}
          <div className="space-y-3 pt-3 border-t border-blue-500/30">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  {t('cluster.sslTitle', 'SSL/TLS Encryption')}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('cluster.sslDescription', 'Use HTTPS/WSS for cluster communication')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={sslEnabled}
                onChange={handleToggleSsl}
                className="w-4 h-4 text-sky-500 bg-white/50 dark:bg-neutral-700/50 border-gray-200 dark:border-neutral-600 rounded focus:ring-sky-500"
              />
            </div>

            {/* Restart warning */}
            {isConnected && sslEnabled !== (config?.ssl?.enabled ?? false) && (
              <div className="p-2 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>
                  {t(
                    'cluster.sslRestartRequired',
                    'Stop and start the cluster for SSL changes to take effect'
                  )}
                </span>
              </div>
            )}

            {sslEnabled && (
              <div className="space-y-2">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={sslSelfSigned}
                      onChange={() => handleSslTypeChange(true)}
                      className="w-4 h-4 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-sm text-gray-800 dark:text-white">
                      {t('cluster.sslSelfSigned', 'Self-Signed')}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!sslSelfSigned}
                      onChange={() => handleSslTypeChange(false)}
                      className="w-4 h-4 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-sm text-gray-800 dark:text-white">
                      {t('cluster.sslCustom', 'Custom')}
                    </span>
                  </label>
                </div>

                {!sslSelfSigned && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={sslCertPath}
                      onChange={(e) => setSslCertPath(e.target.value)}
                      onBlur={handleSslPathsBlur}
                      placeholder={t('cluster.sslCertPath', 'Certificate path (.crt/.pem)')}
                      className="w-full px-3 py-2 text-sm bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <input
                      type="text"
                      value={sslKeyPath}
                      onChange={(e) => setSslKeyPath(e.target.value)}
                      onBlur={handleSslPathsBlur}
                      placeholder={t('cluster.sslKeyPath', 'Private key path (.key)')}
                      className="w-full px-3 py-2 text-sm bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                )}

                {sslError && <p className="text-xs text-red-500 dark:text-red-400">{sslError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Secondary Node Settings */}
      {config?.role === 'secondary' && (
        <div className="space-y-4 p-4 rounded bg-purple-500/10 border border-purple-500/30">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('cluster.secondarySettings', 'Secondary Node Settings')}
          </h4>

          {/* Primary Host */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              {t('cluster.primaryHost', 'Primary Node Address')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={primaryHost}
                onChange={(e) => setPrimaryHost(e.target.value)}
                placeholder="192.168.1.100 or hostname.local"
                disabled={isConnected}
                className="flex-1 px-3 py-2 text-sm bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
              />
              <input
                type="number"
                value={primaryPort}
                onChange={(e) => setPrimaryPort(e.target.value)}
                placeholder="3847"
                disabled={isConnected}
                min={1}
                max={65535}
                className="w-24 px-3 py-2 text-sm bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
              />
              <button
                onClick={handleUpdatePrimaryHost}
                disabled={isLoading || isConnected}
                className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50"
              >
                {t('common.save', 'Save')}
              </button>
            </div>
          </div>

          {/* Shared Secret Input */}
          <div className="space-y-2">
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              {t('cluster.sharedSecret', 'Shared Secret')}
            </label>
            <input
              type="password"
              value={config?.sharedSecret || ''}
              onChange={(e) => updateConfig({ sharedSecret: e.target.value })}
              placeholder={t('cluster.enterSharedSecret', 'Enter shared secret from primary node')}
              disabled={isConnected}
              className="w-full px-3 py-2 text-sm bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
            />
          </div>

          {/* SSL/TLS Configuration for Secondary */}
          <div className="space-y-3 pt-3 border-t border-purple-500/30">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  {t('cluster.sslTitle', 'SSL/TLS Encryption')}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('cluster.sslSecondaryDescription', 'Connect to primary using HTTPS/WSS')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={sslEnabled}
                onChange={handleToggleSsl}
                className="w-4 h-4 text-sky-500 bg-white/50 dark:bg-neutral-700/50 border-gray-200 dark:border-neutral-600 rounded focus:ring-sky-500"
              />
            </div>

            {/* Restart warning for secondary */}
            {isConnected && sslEnabled !== (config?.ssl?.enabled ?? false) && (
              <div className="p-2 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>
                  {t(
                    'cluster.sslRestartRequired',
                    'Disconnect and reconnect for SSL changes to take effect'
                  )}
                </span>
              </div>
            )}

            {sslEnabled && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sslSelfSigned}
                    onChange={(e) => handleSslTypeChange(e.target.checked)}
                    className="w-4 h-4 text-sky-500 bg-white/50 dark:bg-neutral-700/50 border-gray-200 dark:border-neutral-600 rounded focus:ring-sky-500"
                  />
                  <span className="text-sm text-gray-800 dark:text-white">
                    {t('cluster.sslAllowSelfSigned', 'Allow self-signed certificates')}
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    'cluster.sslAllowSelfSignedDesc',
                    'Enable this if the primary node uses a self-signed certificate'
                  )}
                </p>

                {sslError && <p className="text-xs text-red-500 dark:text-red-400">{sslError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection Toggle */}
      {config?.role !== 'standalone' && (
        <div className="flex items-center justify-between p-4 rounded bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-white">
              {t('cluster.status', 'Cluster Status')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isConnected
                ? config?.role === 'primary'
                  ? t('cluster.acceptingConnections', 'Accepting connections')
                  : t('cluster.connectedToPrimary', 'Connected to primary')
                : t('cluster.notConnected', 'Not connected')}
            </p>
          </div>
          <button
            onClick={handleToggleCluster}
            disabled={isLoading || (config?.role === 'secondary' && !hasSecret)}
            className={`px-4 py-2 text-sm rounded-sm transition-colors disabled:opacity-50 ${
              isConnected
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : isConnected ? (
              t('cluster.disconnect', 'Disconnect')
            ) : (
              t('cluster.connect', 'Connect')
            )}
          </button>
        </div>
      )}

      {/* Connected Nodes List */}
      {isConnected && nodes.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('cluster.connectedNodes', 'Connected Nodes')} ({nodes.length})
          </h4>
          <div className="space-y-2">
            {nodes.map((node: ClusterNode) => (
              <div
                key={node.id}
                className="flex items-center justify-between p-3 rounded bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      node.status === 'online'
                        ? 'bg-green-500'
                        : node.status === 'connecting'
                          ? 'bg-yellow-500 animate-pulse'
                          : 'bg-gray-400'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      {node.name}
                      {node.id === config?.nodeId && (
                        <span className="ml-2 text-xs text-sky-500">
                          ({t('cluster.thisNode', 'This node')})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {node.projects.length} {t('cluster.projects', 'projects')} ·{' '}
                      {node.instances.length} {t('cluster.instances', 'instances')}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    node.role === 'primary'
                      ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
                      : 'bg-purple-500/20 text-purple-700 dark:text-purple-400'
                  }`}
                >
                  {node.role === 'primary'
                    ? t('cluster.rolePrimary', 'Primary')
                    : t('cluster.roleSecondary', 'Secondary')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Privacy Settings - only show when cluster is enabled */}
      {config?.role !== 'standalone' && (
        <div className="pt-4 border-t border-gray-200 dark:border-neutral-600">
          <ClusterPrivacySettings />
        </div>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return <Spinner size="sm" />;
}
