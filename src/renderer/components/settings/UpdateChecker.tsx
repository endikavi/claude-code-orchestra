import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
}

interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

export function UpdateChecker() {
  const { t } = useTranslation();
  const [state, setState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');

  // Get current version on mount
  useEffect(() => {
    window.electronAPI.update.getVersion().then(setCurrentVersion).catch(console.error);
  }, []);

  // Setup event listeners
  useEffect(() => {
    const unsubscribeChecking = window.electronAPI.update.onChecking(() => {
      setState('checking');
    });

    const unsubscribeAvailable = window.electronAPI.update.onAvailable((data) => {
      setState('available');
      setUpdateInfo((prev) => (prev ? { ...prev, latestVersion: data.version } : null));
    });

    const unsubscribeNotAvailable = window.electronAPI.update.onNotAvailable(() => {
      setState('idle');
    });

    const unsubscribeProgress = window.electronAPI.update.onProgress((data) => {
      setState('downloading');
      setProgress(data);
    });

    const unsubscribeDownloaded = window.electronAPI.update.onDownloaded(() => {
      setState('downloaded');
      setProgress(null);
    });

    const unsubscribeError = window.electronAPI.update.onError((data) => {
      setState('error');
      setError(data.message);
    });

    // Check for startup notification
    const unsubscribeStartup = window.electronAPI.update.onStartupAvailable((data) => {
      if (data.updateAvailable) {
        setState('available');
        setUpdateInfo(data);
      }
    });

    return () => {
      unsubscribeChecking();
      unsubscribeAvailable();
      unsubscribeNotAvailable();
      unsubscribeProgress();
      unsubscribeDownloaded();
      unsubscribeError();
      unsubscribeStartup();
    };
  }, []);

  const checkForUpdates = useCallback(async () => {
    setState('checking');
    setError(null);
    try {
      const result = await window.electronAPI.update.check();
      setUpdateInfo(result);
      setState(result.updateAvailable ? 'available' : 'idle');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    setState('downloading');
    try {
      await window.electronAPI.update.download();
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }, []);

  const installUpdate = useCallback(() => {
    window.electronAPI.update.install();
  }, []);

  const openReleaseUrl = useCallback(() => {
    if (updateInfo?.releaseUrl) {
      window.electronAPI.shell.openExternal(updateInfo.releaseUrl);
    }
  }, [updateInfo?.releaseUrl]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <UpdateIcon className="w-5 h-5" />
        {t('settings.updates.title', 'Software Updates')}
      </h3>

      <div className="space-y-4">
        {/* Current version */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {t('settings.updates.currentVersion', 'Current version')}
          </span>
          <span className="text-sm font-mono text-gray-900 dark:text-white">v{currentVersion}</span>
        </div>

        {/* Update status */}
        {state === 'idle' && !updateInfo?.updateAvailable && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="w-4 h-4" />
            {t('settings.updates.upToDate', 'You are running the latest version')}
          </div>
        )}

        {state === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <SpinnerIcon className="w-4 h-4 animate-spin" />
            {t('settings.updates.checking', 'Checking for updates...')}
          </div>
        )}

        {state === 'available' && updateInfo && (
          <div className="bg-claude-orange/10 dark:bg-claude-orange/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-claude-orange">
              <UpdateAvailableIcon className="w-4 h-4" />
              {t('settings.updates.available', 'Update available!')}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {t('settings.updates.newVersion', 'New version')}:{' '}
              <strong>v{updateInfo.latestVersion}</strong>
            </div>
            {updateInfo.publishedAt && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {t('settings.updates.released', 'Released')}:{' '}
                {new Date(updateInfo.publishedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {state === 'downloading' && progress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {t('settings.updates.downloading', 'Downloading update...')}
              </span>
              <span className="text-gray-900 dark:text-white">{Math.round(progress.percent)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-claude-orange h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formatBytes(progress.transferred)} / {formatBytes(progress.total)} (
              {formatBytes(progress.bytesPerSecond)}/s)
            </div>
          </div>
        )}

        {state === 'downloaded' && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
              <CheckIcon className="w-4 h-4" />
              {t('settings.updates.downloaded', 'Update downloaded!')}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {t(
                'settings.updates.restartRequired',
                'Restart the application to install the update.'
              )}
            </div>
          </div>
        )}

        {state === 'error' && error && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <ErrorIcon className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          {(state === 'idle' || state === 'error') && (
            <button
              onClick={checkForUpdates}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
            >
              {t('settings.updates.checkNow', 'Check for updates')}
            </button>
          )}

          {state === 'available' && (
            <>
              <button
                onClick={downloadUpdate}
                className="px-3 py-1.5 text-sm bg-claude-orange hover:bg-claude-orange/90 text-white rounded-md transition-colors"
              >
                {t('settings.updates.download', 'Download update')}
              </button>
              {updateInfo?.releaseUrl && (
                <button
                  onClick={openReleaseUrl}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                >
                  {t('settings.updates.viewRelease', 'View release notes')}
                </button>
              )}
            </>
          )}

          {state === 'downloaded' && (
            <button
              onClick={installUpdate}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              {t('settings.updates.restartNow', 'Restart now')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Icon components
function UpdateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function UpdateAvailableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
      />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
