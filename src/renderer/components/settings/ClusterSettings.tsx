import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useClusterStore } from '../../stores/clusterStore';
import { ClusterPrivacySettings } from './ClusterPrivacySettings';
import type { ClusterNodeRole, ClusterNode } from '@shared/types/cluster';

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
  } = useClusterStore();

  const [nodeName, setNodeName] = useState('');
  const [primaryHost, setPrimaryHost] = useState('');
  const [primaryPort, setPrimaryPort] = useState('');
  const [clusterPort, setClusterPort] = useState('');
  const [showSecret, setShowSecret] = useState(false);

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
    }
  }, [config]);

  // Poll status when connected
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      void loadStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, [isConnected, loadStatus]);

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
        <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-700 dark:text-red-400 text-sm">
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
            className="flex-1 px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange"
          />
          <button
            onClick={handleUpdateNodeName}
            disabled={isLoading || !nodeName.trim()}
            className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50"
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
          <code className="flex-1 px-3 py-2 text-xs bg-gray-100 dark:bg-gray-800 rounded-md font-mono overflow-x-auto">
            {config?.nodeId || '...'}
          </code>
          <button
            onClick={() => copyToClipboard(config?.nodeId || '')}
            className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
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
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                config?.role === option.value
                  ? 'bg-claude-orange/10 border-claude-orange/50'
                  : 'bg-white/50 dark:bg-gray-700/50 border-claude-tan/50 dark:border-gray-600 hover:bg-white/70 dark:hover:bg-gray-600/50'
              }`}
            >
              <input
                type="radio"
                name="clusterRole"
                value={option.value}
                checked={config?.role === option.value}
                onChange={() => handleUpdateRole(option.value)}
                disabled={isConnected && config?.role !== 'standalone'}
                className="mt-1 w-4 h-4 text-claude-orange focus:ring-claude-orange"
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
        <div className="space-y-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
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
                className="w-32 px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange disabled:opacity-50"
              />
              <button
                onClick={handleUpdateClusterPort}
                disabled={isLoading || isConnected}
                className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50"
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
                  className="w-full px-3 py-2 pr-10 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md font-mono"
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
                className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
                title={t('common.copy', 'Copy')}
              >
                <ClipboardIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleGenerateSecret}
                disabled={isLoading}
                className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50"
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
        </div>
      )}

      {/* Secondary Node Settings */}
      {config?.role === 'secondary' && (
        <div className="space-y-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
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
                className="flex-1 px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange disabled:opacity-50"
              />
              <input
                type="number"
                value={primaryPort}
                onChange={(e) => setPrimaryPort(e.target.value)}
                placeholder="3847"
                disabled={isConnected}
                min={1}
                max={65535}
                className="w-24 px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange disabled:opacity-50"
              />
              <button
                onClick={handleUpdatePrimaryHost}
                disabled={isLoading || isConnected}
                className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50"
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
              className="w-full px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* Connection Toggle */}
      {config?.role !== 'standalone' && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600">
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
            className={`px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 ${
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
                className="flex items-center justify-between p-3 rounded-lg bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600"
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
                        <span className="ml-2 text-xs text-claude-orange">
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
        <div className="pt-4 border-t border-claude-tan/30 dark:border-gray-600">
          <ClusterPrivacySettings />
        </div>
      )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
      />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}
