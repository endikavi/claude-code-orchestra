import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { RemoteConfig, RemoteServerStatus, RemoteSession } from '@shared/types/remote';

export function RemoteAccessSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [status, setStatus] = useState<RemoteServerStatus | null>(null);
  const [password, setPassword] = useState('');
  const [newPort, setNewPort] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load config and status
  const loadData = useCallback(async () => {
    try {
      const [configData, statusData] = await Promise.all([
        window.electronAPI.remote.getConfig(),
        window.electronAPI.remote.getStatus(),
      ]);
      setConfig(configData);
      setStatus(statusData);
      setNewPort(configData.port.toString());

      // Load QR code if server is running
      if (statusData.running) {
        const qrResult = await window.electronAPI.remote.getQrCode();
        if (qrResult.success && qrResult.qrCode) {
          setQrCode(qrResult.qrCode);
        }
      } else {
        setQrCode(null);
      }
    } catch (err) {
      console.error('Failed to load remote config:', err);
    }
  }, []);

  useEffect(() => {
    void loadData();

    // Poll status every 5 seconds when server is running
    const interval = setInterval(() => {
      if (status?.running) {
        void window.electronAPI.remote.getStatus().then(setStatus);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [loadData, status?.running]);

  const handleSetPassword = async () => {
    if (!password) {
      setError(t('remoteAccess.passwordRequired'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await window.electronAPI.remote.setPassword(password);
      setPassword('');
      await loadData();
    } catch {
      setError(t('remoteAccess.failedToSetPassword'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleServer = async () => {
    setLoading(true);
    setError(null);

    try {
      if (status?.running) {
        await window.electronAPI.remote.stopServer();
      } else {
        const port = parseInt(newPort, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          setError(t('remoteAccess.invalidPort'));
          setLoading(false);
          return;
        }

        const result = await window.electronAPI.remote.startServer(port);
        if (!result.success) {
          setError(result.error || t('remoteAccess.failedToStart'));
          setLoading(false);
          return;
        }
      }
      await loadData();
    } catch {
      setError(t('remoteAccess.serverError'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoStart = async () => {
    if (!config) return;

    try {
      await window.electronAPI.remote.updateConfig({ autoStart: !config.autoStart });
      await loadData();
    } catch {
      setError(t('remoteAccess.failedToUpdate'));
    }
  };

  const handleKickSession = async (sessionId: string) => {
    try {
      await window.electronAPI.remote.kickSession(sessionId);
      await loadData();
    } catch {
      setError(t('remoteAccess.failedToKick'));
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const hasPassword = config?.passwordHash && config.passwordHash.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('remoteAccess.title')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-500">{t('remoteAccess.description')}</p>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Password Setup */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('remoteAccess.password')}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              hasPassword ? t('remoteAccess.passwordSet') : t('remoteAccess.setPassword')
            }
            className="flex-1 px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange"
          />
          <button
            onClick={handleSetPassword}
            disabled={loading || !password}
            className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50"
          >
            {hasPassword ? t('remoteAccess.changePassword') : t('remoteAccess.setPassword')}
          </button>
        </div>
        {!hasPassword && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('remoteAccess.passwordWarning')}
          </p>
        )}
      </div>

      {/* Port Configuration */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('remoteAccess.port')}
        </label>
        <input
          type="number"
          value={newPort}
          onChange={(e) => setNewPort(e.target.value)}
          disabled={status?.running}
          min={1}
          max={65535}
          className="w-32 px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange disabled:opacity-50"
        />
      </div>

      {/* Server Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-white">
            {t('remoteAccess.serverStatus')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {status?.running ? t('remoteAccess.running') : t('remoteAccess.stopped')}
          </p>
        </div>
        <button
          onClick={handleToggleServer}
          disabled={loading || !hasPassword}
          className={`px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 ${
            status?.running
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {loading ? (
            <LoadingSpinner />
          ) : status?.running ? (
            t('remoteAccess.stopServer')
          ) : (
            t('remoteAccess.startServer')
          )}
        </button>
      </div>

      {/* Auto-start Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config?.autoStart ?? false}
          onChange={handleToggleAutoStart}
          disabled={!hasPassword}
          className="w-4 h-4 text-claude-orange bg-white/50 dark:bg-gray-700/50 border-claude-tan/50 dark:border-gray-600 rounded focus:ring-claude-orange disabled:opacity-50"
        />
        <div>
          <span className="text-sm text-gray-800 dark:text-white">
            {t('remoteAccess.autoStart')}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('remoteAccess.autoStartDescription')}
          </p>
        </div>
      </label>

      {/* Connection Info (shown when server is running) */}
      {status?.running && status.url && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/50">
          <div className="flex gap-4">
            {/* QR Code */}
            {qrCode && (
              <div className="flex-shrink-0">
                <img src={qrCode} alt="QR Code" className="w-32 h-32 rounded bg-white p-1" />
              </div>
            )}

            {/* Connection Details */}
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-gray-800 dark:text-white">
                {t('remoteAccess.connectionUrl')}
              </p>
              <button
                onClick={() => status.url && navigator.clipboard.writeText(status.url)}
                className="inline-flex items-center gap-2 px-2 py-1 text-sm bg-white/50 dark:bg-gray-700/50 rounded hover:bg-white/70 dark:hover:bg-gray-600/50 transition-colors text-left w-full"
                title={t('common.copy')}
              >
                <code className="truncate flex-1">{status.url}</code>
                <ClipboardIcon className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('remoteAccess.scanQr')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Active Sessions */}
      {status?.running && status.sessions && status.sessions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('remoteAccess.activeSessions')} ({status.sessions.length})
          </h4>
          <div className="space-y-2">
            {status.sessions.map((session: RemoteSession) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 rounded-lg bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600"
              >
                <div>
                  <p className="text-sm text-gray-800 dark:text-white">{session.ip}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {session.userAgent.substring(0, 50)}...
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('remoteAccess.connectedAt')}: {formatDate(session.connectedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleKickSession(session.id)}
                  className="px-3 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                >
                  {t('remoteAccess.kick')}
                </button>
              </div>
            ))}
          </div>
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
