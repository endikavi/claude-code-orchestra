import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../common/Spinner';
import type { JiraGlobalConfig, JiraUser } from '@shared/types/jira';
import { CheckCircleIcon, XCircleIcon } from '@renderer/components/icons';

export function JiraSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<JiraGlobalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    user?: JiraUser;
    error?: string;
  } | null>(null);

  // Form state for editing
  const [baseUrl, setBaseUrl] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const jiraConfig = await window.electronAPI.jira.getGlobalConfig();
      setConfig(jiraConfig);
      setBaseUrl(jiraConfig.baseUrl);
      setUserEmail(jiraConfig.userEmail);
      setApiToken(jiraConfig.apiToken);
    } catch (error) {
      console.error('Failed to load Jira config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // Check for changes
  useEffect(() => {
    if (!config) return;
    const changed =
      baseUrl !== config.baseUrl || userEmail !== config.userEmail || apiToken !== config.apiToken;
    setHasChanges(changed);
    // Clear validation result when config changes
    if (changed) {
      setValidationResult(null);
    }
  }, [baseUrl, userEmail, apiToken, config]);

  const handleSave = async () => {
    try {
      const updated = await window.electronAPI.jira.updateGlobalConfig({
        baseUrl: baseUrl.trim(),
        userEmail: userEmail.trim(),
        apiToken: apiToken.trim(),
      });
      setConfig(updated);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save Jira config:', error);
    }
  };

  const handleValidate = async () => {
    // Save first if there are changes
    if (hasChanges) {
      await handleSave();
    }

    setValidating(true);
    setValidationResult(null);

    try {
      const result = await window.electronAPI.jira.validateCredentials();
      setValidationResult(result);
    } catch (error) {
      setValidationResult({
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 dark:bg-neutral-600 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-300 dark:bg-neutral-600 rounded w-full mb-3"></div>
          <div className="h-8 bg-gray-300 dark:bg-neutral-600 rounded w-full mb-3"></div>
          <div className="h-8 bg-gray-300 dark:bg-neutral-600 rounded w-full"></div>
        </div>
      </div>
    );
  }

  const canValidate = baseUrl.trim() && userEmail.trim() && apiToken.trim();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          {t('jira.settings.title', 'Jira Integration')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t(
            'jira.settings.description',
            'Configure your Jira credentials to import issues and sync task status.'
          )}
        </p>
      </div>

      {/* Connection Status */}
      {config?.isConfigured && (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
          <CheckCircleIcon className="w-5 h-5 text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-400">
            {t('jira.settings.connected', 'Connected to Jira')}
          </span>
        </div>
      )}

      {/* Configuration Form */}
      <div className="space-y-4">
        {/* Base URL */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('jira.settings.baseUrl', 'Jira URL')}
          </label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-company.atlassian.net"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('jira.settings.baseUrlHint', 'Your Jira Cloud instance URL')}
          </p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('jira.settings.email', 'Email')}
          </label>
          <input
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="your-email@company.com"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('jira.settings.emailHint', 'Your Atlassian account email')}
          </p>
        </div>

        {/* API Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('jira.settings.apiToken', 'API Token')}
          </label>
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="********"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('jira.settings.apiTokenHint', 'Create an API token at')}{' '}
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-500 hover:text-sky-600"
              onClick={(e) => {
                e.preventDefault();
                window.electronAPI.shell.openExternal(
                  'https://id.atlassian.com/manage-profile/security/api-tokens'
                );
              }}
            >
              Atlassian API Tokens
            </a>
          </p>
        </div>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div
          className={`p-3 rounded border ${
            validationResult.valid
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}
        >
          {validationResult.valid ? (
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              <div>
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  {t('jira.settings.validationSuccess', 'Connection successful!')}
                </span>
                {validationResult.user && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                    {t('jira.settings.loggedInAs', 'Logged in as {{name}}', {
                      name: validationResult.user.displayName,
                    })}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <XCircleIcon className="w-5 h-5 text-red-500" />
              <div>
                <span className="text-sm font-medium text-red-700 dark:text-red-400">
                  {t('jira.settings.validationFailed', 'Connection failed')}
                </span>
                {validationResult.error && (
                  <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                    {validationResult.error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleValidate}
          disabled={!canValidate || validating}
          className={`px-4 py-2 text-sm rounded-sm transition-colors ${
            canValidate && !validating
              ? 'bg-sky-500 hover:bg-sky-600 text-white'
              : 'bg-gray-300 dark:bg-neutral-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          }`}
        >
          {validating ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner className="w-4 h-4" />
              {t('jira.settings.validating', 'Validating...')}
            </span>
          ) : (
            t('jira.settings.validateConnection', 'Validate Connection')
          )}
        </button>

        {hasChanges && (
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 text-gray-700 dark:text-gray-300 rounded-sm transition-colors"
          >
            {t('common.save', 'Save')}
          </button>
        )}
      </div>

      {/* Help Text */}
      <div className="pt-4 border-t border-gray-200 dark:border-neutral-700">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('jira.settings.howToUse', 'How to use')}
        </h4>
        <ol className="text-xs text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside">
          <li>{t('jira.settings.step1', 'Enter your Jira Cloud URL and credentials above')}</li>
          <li>{t('jira.settings.step2', 'Click "Validate Connection" to test the connection')}</li>
          <li>{t('jira.settings.step3', 'Enable Jira integration in project settings')}</li>
          <li>{t('jira.settings.step4', 'Import issues from the Ralph Tasks board')}</li>
        </ol>
      </div>
    </div>
  );
}

function LoadingSpinner({ className }: { className?: string }) {
  return <Spinner size="sm" className={className} />;
}
