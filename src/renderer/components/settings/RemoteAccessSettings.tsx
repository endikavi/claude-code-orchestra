import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { RemoteConfig, RemoteServerStatus, RemoteSession } from '@shared/types/remote';
import type { SslConfig } from '@shared/types/ssl';

export function RemoteAccessSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [status, setStatus] = useState<RemoteServerStatus | null>(null);
  const [password, setPassword] = useState('');
  const [newPort, setNewPort] = useState('');
  const [customHostname, setCustomHostname] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSL state
  const [sslEnabled, setSslEnabled] = useState(false);
  const [sslSelfSigned, setSslSelfSigned] = useState(true);
  const [sslLetsEncrypt, setSslLetsEncrypt] = useState(false);
  const [sslCertPath, setSslCertPath] = useState('');
  const [sslKeyPath, setSslKeyPath] = useState('');
  const [acmeEmail, setAcmeEmail] = useState('');
  const [leGenerating, setLeGenerating] = useState(false);
  const [sslCertValidation, setSslCertValidation] = useState<{
    valid: boolean;
    error?: string;
    daysRemaining?: number;
  } | null>(null);

  // Load config and status
  const loadData = useCallback(async () => {
    // Check if electronAPI.remote is available (not available in web-only mode)
    if (!window.electronAPI?.remote) {
      return;
    }
    try {
      const [configData, statusData] = await Promise.all([
        window.electronAPI.remote.getConfig(),
        window.electronAPI.remote.getStatus(),
      ]);
      setConfig(configData);
      setStatus(statusData);
      setNewPort(configData.port.toString());
      setCustomHostname(configData.customHostname || '');

      // Load SSL config
      if (configData.ssl) {
        setSslEnabled(configData.ssl.enabled);
        setSslLetsEncrypt(configData.ssl.letsEncrypt ?? false);
        setSslSelfSigned(configData.ssl.letsEncrypt ? false : (configData.ssl.selfSigned ?? true));
        setSslCertPath(configData.ssl.certPath || '');
        setSslKeyPath(configData.ssl.keyPath || '');
        setAcmeEmail(configData.ssl.acmeEmail || '');

        // Auto-validate existing LE cert
        if (configData.ssl.letsEncrypt && configData.ssl.certPath && window.electronAPI?.ssl) {
          window.electronAPI.ssl
            .validateCert(configData.ssl.certPath)
            .then((result) => {
              setSslCertValidation({
                valid: result.valid,
                error: result.error,
                daysRemaining: result.daysRemaining,
              });
            })
            .catch(() => {
              // ignore validation errors on load
            });
        }
      }

      // Load QR code if web access is enabled and server is running
      if (configData.webAccessEnabled && statusData.running) {
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
      if (status?.running && window.electronAPI?.remote) {
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

  const handleToggleWebAccess = async () => {
    setLoading(true);
    setError(null);

    try {
      if (config?.webAccessEnabled) {
        // Disable web access (server keeps running for internal functionality)
        await window.electronAPI.remote.stopServer();
      } else {
        // Enable web access
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

  const handleToggleAllowAnyCors = async () => {
    if (!config) return;

    try {
      await window.electronAPI.remote.updateConfig({ allowAnyCors: !config.allowAnyCors });
      await loadData();
    } catch {
      setError(t('remoteAccess.failedToUpdate'));
    }
  };

  const handleCustomHostnameBlur = async () => {
    if (!config) return;

    // Only update if the value has changed
    if (customHostname !== config.customHostname) {
      try {
        await window.electronAPI.remote.updateConfig({ customHostname });
        await loadData();
      } catch {
        setError(t('remoteAccess.failedToUpdate'));
      }
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

  // SSL handlers
  const handleToggleSsl = async () => {
    if (!config) return;

    const newSslEnabled = !sslEnabled;
    setSslEnabled(newSslEnabled);

    try {
      const sslConfig: SslConfig = {
        enabled: newSslEnabled,
        selfSigned: sslSelfSigned,
        letsEncrypt: sslLetsEncrypt,
        acmeEmail: acmeEmail || undefined,
        certPath: sslCertPath || undefined,
        keyPath: sslKeyPath || undefined,
      };

      await window.electronAPI.remote.updateConfig({ ssl: sslConfig });
      await loadData();
    } catch {
      setError(t('remoteAccess.failedToUpdate'));
      setSslEnabled(!newSslEnabled);
    }
  };

  const handleSslModeChange = async (mode: 'selfSigned' | 'custom' | 'letsEncrypt') => {
    if (!config) return;

    const prevSelfSigned = sslSelfSigned;
    const prevLetsEncrypt = sslLetsEncrypt;

    setSslSelfSigned(mode === 'selfSigned');
    setSslLetsEncrypt(mode === 'letsEncrypt');
    setSslCertValidation(null);

    try {
      await window.electronAPI.remote.updateConfig({
        ssl: {
          ...config.ssl,
          selfSigned: mode === 'selfSigned',
          letsEncrypt: mode === 'letsEncrypt',
        },
      });
      await loadData();
    } catch {
      setError(t('remoteAccess.failedToUpdate'));
      setSslSelfSigned(prevSelfSigned);
      setSslLetsEncrypt(prevLetsEncrypt);
    }
  };

  const handleSslPathsBlur = async () => {
    if (!config) return;

    // Only update if paths have changed
    if (sslCertPath !== config.ssl?.certPath || sslKeyPath !== config.ssl?.keyPath) {
      try {
        await window.electronAPI.remote.updateConfig({
          ssl: {
            ...config.ssl,
            certPath: sslCertPath || undefined,
            keyPath: sslKeyPath || undefined,
          },
        });
        await loadData();
      } catch {
        setError(t('remoteAccess.failedToUpdate'));
      }
    }
  };

  const handleValidateCert = async () => {
    if (!sslCertPath || !window.electronAPI?.ssl) return;

    try {
      const result = await window.electronAPI.ssl.validateCert(sslCertPath);
      setSslCertValidation({
        valid: result.valid,
        error: result.error,
        daysRemaining: result.daysRemaining,
      });
    } catch {
      setSslCertValidation({ valid: false, error: 'Validation failed' });
    }
  };

  const handleGenerateSelfSigned = async () => {
    if (!window.electronAPI?.ssl) return;

    setLoading(true);
    try {
      const result = await window.electronAPI.ssl.generateSelfSigned('localhost', 365);
      if (result.success) {
        setSslCertPath(result.certPath || '');
        setSslKeyPath(result.keyPath || '');
        setSslCertValidation({ valid: true, daysRemaining: 365 });
      } else {
        setError(result.error || 'Failed to generate certificate');
      }
    } catch {
      setError('Failed to generate certificate');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLetsEncrypt = async () => {
    if (!window.electronAPI?.ssl || !customHostname) return;

    setLeGenerating(true);
    setError(null);
    setSslCertValidation(null);

    try {
      const result = await window.electronAPI.ssl.generateLetsEncrypt(
        customHostname,
        acmeEmail || undefined
      );
      if (result.success && result.certPath && result.keyPath) {
        // Update config with the new cert paths and LE mode
        await window.electronAPI.remote.updateConfig({
          ssl: {
            enabled: true,
            selfSigned: false,
            letsEncrypt: true,
            certPath: result.certPath,
            keyPath: result.keyPath,
            acmeEmail: acmeEmail || undefined,
          },
        });

        // Validate the new cert
        const validation = await window.electronAPI.ssl.validateCert(result.certPath);
        setSslCertValidation({
          valid: validation.valid,
          error: validation.error,
          daysRemaining: validation.daysRemaining,
        });

        await loadData();
      } else {
        setError(result.error || "Failed to generate Let's Encrypt certificate");
      }
    } catch {
      setError("Failed to generate Let's Encrypt certificate");
    } finally {
      setLeGenerating(false);
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

      {/* Custom Hostname */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('remoteAccess.customHostname')}
        </label>
        <input
          type="text"
          value={customHostname}
          onChange={(e) => setCustomHostname(e.target.value)}
          onBlur={handleCustomHostnameBlur}
          placeholder={t('remoteAccess.customHostnamePlaceholder')}
          className="w-full max-w-sm px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('remoteAccess.customHostnameDescription')}
        </p>
      </div>

      {/* Web Access Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-white">
            {t('remoteAccess.webAccess', 'Web Access')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {config?.webAccessEnabled
              ? t('remoteAccess.webAccessEnabled', 'Remote web access enabled')
              : t('remoteAccess.webAccessDisabled', 'Remote web access disabled')}
          </p>
          {status?.running && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              {t('remoteAccess.serverRunning', 'Server running on port')} {status.port}
            </p>
          )}
        </div>
        <button
          onClick={handleToggleWebAccess}
          disabled={loading || !hasPassword}
          className={`px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 ${
            config?.webAccessEnabled
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {loading ? (
            <LoadingSpinner />
          ) : config?.webAccessEnabled ? (
            t('remoteAccess.disableWebAccess', 'Disable')
          ) : (
            t('remoteAccess.enableWebAccess', 'Enable')
          )}
        </button>
      </div>

      {/* Info: Server always runs for internal functionality */}
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <p className="text-xs text-blue-700 dark:text-blue-400">
          {t(
            'remoteAccess.serverAlwaysRunning',
            'The internal server always runs for hooks and MCP functionality. Web access controls whether remote clients can connect.'
          )}
        </p>
      </div>

      {/* Allow Any CORS Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config?.allowAnyCors ?? false}
          onChange={handleToggleAllowAnyCors}
          disabled={!hasPassword}
          className="w-4 h-4 text-claude-orange bg-white/50 dark:bg-gray-700/50 border-claude-tan/50 dark:border-gray-600 rounded focus:ring-claude-orange disabled:opacity-50"
        />
        <div>
          <span className="text-sm text-gray-800 dark:text-white">
            {t('remoteAccess.allowAnyCors')}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('remoteAccess.allowAnyCorsDescription')}
          </p>
        </div>
      </label>

      {/* SSL/TLS Configuration */}
      <div className="space-y-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('remoteAccess.sslTitle', 'SSL/TLS Encryption')}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('remoteAccess.sslDescription', 'Enable HTTPS for secure communication')}
            </p>
          </div>
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={sslEnabled}
              onChange={handleToggleSsl}
              disabled={!hasPassword}
              className="w-4 h-4 text-claude-orange bg-white/50 dark:bg-gray-700/50 border-claude-tan/50 dark:border-gray-600 rounded focus:ring-claude-orange disabled:opacity-50"
            />
          </label>
        </div>

        {/* Warning when SSL config changed while server running */}
        {status?.running && sslEnabled !== (config?.ssl?.enabled ?? false) && (
          <div className="p-2 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>
              {t(
                'remoteAccess.sslRestartRequired',
                'Stop and start the server for SSL changes to take effect'
              )}
            </span>
          </div>
        )}

        {sslEnabled && (
          <>
            {/* SSL Type Selection */}
            <div className="space-y-2">
              <label className="block text-sm text-gray-700 dark:text-gray-300">
                {t('remoteAccess.sslType', 'Certificate Type')}
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={sslSelfSigned && !sslLetsEncrypt}
                    onChange={() => handleSslModeChange('selfSigned')}
                    className="w-4 h-4 text-claude-orange focus:ring-claude-orange"
                  />
                  <span className="text-sm text-gray-800 dark:text-white">
                    {t('remoteAccess.sslSelfSigned', 'Self-Signed')}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!sslSelfSigned && !sslLetsEncrypt}
                    onChange={() => handleSslModeChange('custom')}
                    className="w-4 h-4 text-claude-orange focus:ring-claude-orange"
                  />
                  <span className="text-sm text-gray-800 dark:text-white">
                    {t('remoteAccess.sslCustom', 'Custom Certificate')}
                  </span>
                </label>
                <label
                  className={`flex items-center gap-2 ${customHostname ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                >
                  <input
                    type="radio"
                    checked={sslLetsEncrypt}
                    onChange={() => handleSslModeChange('letsEncrypt')}
                    disabled={!customHostname}
                    className="w-4 h-4 text-claude-orange focus:ring-claude-orange disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-800 dark:text-white">
                    {t('remoteAccess.sslLetsEncrypt', "Let's Encrypt")}
                  </span>
                </label>
              </div>
              {!customHostname && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t(
                    'remoteAccess.sslLetsEncryptNeedsHostname',
                    "Set a custom hostname above to use Let's Encrypt"
                  )}
                </p>
              )}
            </div>

            {sslSelfSigned && !sslLetsEncrypt ? (
              /* Self-signed certificate info */
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    'remoteAccess.sslSelfSignedInfo',
                    'A self-signed certificate will be auto-generated. Browsers will show a security warning, but traffic is still encrypted.'
                  )}
                </p>
                <button
                  onClick={handleGenerateSelfSigned}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50"
                >
                  {t('remoteAccess.sslGenerateCert', 'Generate New Certificate')}
                </button>
              </div>
            ) : sslLetsEncrypt ? (
              /* Let's Encrypt panel */
              <div className="space-y-3">
                {/* Warning about port 80 */}
                <div className="p-2 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs flex items-center gap-2">
                  <span>&#9888;</span>
                  <span>
                    {t(
                      'remoteAccess.sslLetsEncryptPort80',
                      'Port 80 must be open and accessible from the internet for HTTP-01 challenge verification.'
                    )}
                  </span>
                </div>

                {/* Email input */}
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    {t('remoteAccess.sslAcmeEmail', 'Email (optional)')}
                  </label>
                  <input
                    type="email"
                    value={acmeEmail}
                    onChange={(e) => setAcmeEmail(e.target.value)}
                    placeholder={t('remoteAccess.sslAcmeEmailPlaceholder', 'admin@example.com')}
                    className="w-full max-w-sm px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t(
                      'remoteAccess.sslAcmeEmailDescription',
                      "Used for certificate expiry notifications from Let's Encrypt"
                    )}
                  </p>
                </div>

                {/* Domain display */}
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    {t('remoteAccess.sslDomain', 'Domain')}
                  </label>
                  <p className="text-sm font-mono text-gray-800 dark:text-white px-3 py-2 bg-white/30 dark:bg-gray-800/30 rounded-md border border-claude-tan/30 dark:border-gray-700">
                    {customHostname}
                  </p>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerateLetsEncrypt}
                  disabled={leGenerating || !customHostname}
                  className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {leGenerating && <LoadingSpinner />}
                  {leGenerating
                    ? t('remoteAccess.sslLetsEncryptGenerating', 'Generating...')
                    : t('remoteAccess.sslLetsEncryptGenerate', 'Generate Certificate')}
                </button>

                {/* Validity info */}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    'remoteAccess.sslLetsEncryptValidity',
                    'Certificates are valid for 90 days. Regenerate before expiry.'
                  )}
                </p>
              </div>
            ) : (
              /* Custom certificate paths */
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    {t('remoteAccess.sslCertPath', 'Certificate Path (.crt/.pem)')}
                  </label>
                  <input
                    type="text"
                    value={sslCertPath}
                    onChange={(e) => setSslCertPath(e.target.value)}
                    onBlur={handleSslPathsBlur}
                    placeholder="/path/to/certificate.crt"
                    className="w-full px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                    {t('remoteAccess.sslKeyPath', 'Private Key Path (.key)')}
                  </label>
                  <input
                    type="text"
                    value={sslKeyPath}
                    onChange={(e) => setSslKeyPath(e.target.value)}
                    onBlur={handleSslPathsBlur}
                    placeholder="/path/to/private.key"
                    className="w-full px-3 py-2 text-sm bg-white/50 dark:bg-gray-700/50 border border-claude-tan/50 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-claude-orange"
                  />
                </div>
                <button
                  onClick={handleValidateCert}
                  disabled={!sslCertPath || loading}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
                >
                  {t('remoteAccess.sslValidate', 'Validate Certificate')}
                </button>
              </div>
            )}

            {/* Certificate validation result */}
            {sslCertValidation && (
              <div
                className={`p-2 rounded text-sm ${
                  sslCertValidation.valid
                    ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                    : 'bg-red-500/20 text-red-700 dark:text-red-400'
                }`}
              >
                {sslCertValidation.valid
                  ? t('remoteAccess.sslCertValid', 'Certificate valid') +
                    (sslCertValidation.daysRemaining
                      ? ` (${sslCertValidation.daysRemaining} days remaining)`
                      : '')
                  : sslCertValidation.error ||
                    t('remoteAccess.sslCertInvalid', 'Certificate invalid')}
              </div>
            )}
          </>
        )}
      </div>

      {/* Connection Info (shown when web access is enabled) */}
      {config?.webAccessEnabled && status?.running && status.url && (
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
      {config?.webAccessEnabled &&
        status?.running &&
        status.sessions &&
        status.sessions.length > 0 && (
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
