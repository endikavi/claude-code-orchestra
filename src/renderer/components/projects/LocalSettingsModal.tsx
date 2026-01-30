import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';

interface LocalSettingsModalProps {
  projectPath: string;
  onClose: () => void;
}

const DEFAULT_SETTINGS = `{
  "permissions": {
    "allow": [],
    "deny": []
  },
  "env": {}
}`;

export function LocalSettingsModal({ projectPath, onClose }: LocalSettingsModalProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.localSettings.read(projectPath);
      if (result.success) {
        const loadedContent = result.content || DEFAULT_SETTINGS;
        // Pretty print JSON
        try {
          const parsed: unknown = JSON.parse(loadedContent);
          const formatted = JSON.stringify(parsed, null, 2);
          setContent(formatted);
          setOriginalContent(formatted);
        } catch {
          setContent(loadedContent);
          setOriginalContent(loadedContent);
        }
        setFileExists(result.exists ?? false);
      } else {
        setError(result.error || t('localSettings.failedToLoad'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('localSettings.failedToLoad'));
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const validateJson = (value: string): boolean => {
    try {
      JSON.parse(value);
      setParseError(null);
      return true;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('localSettings.invalidJson'));
      return false;
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    if (value.trim()) {
      validateJson(value);
    } else {
      setParseError(null);
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      setError(t('localSettings.emptyContent'));
      return;
    }

    if (!validateJson(content)) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Format JSON before saving
      const parsed: unknown = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);

      const result = await window.electronAPI.localSettings.write(projectPath, formatted);
      if (result.success) {
        setOriginalContent(formatted);
        setContent(formatted);
        setFileExists(true);
        onClose();
      } else {
        setError(result.error || t('localSettings.failedToSave'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('localSettings.failedToSave'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormat = () => {
    try {
      const parsed: unknown = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      setContent(formatted);
      setParseError(null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('localSettings.invalidJson'));
    }
  };

  const hasChanges = content !== originalContent;
  const isValidJson = content.trim() && !parseError;

  return (
    <Modal title={t('localSettings.title')} onClose={onClose} width="xl">
      <div className="space-y-4">
        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('localSettings.description')}</p>

        {/* File path */}
        <div className="text-xs text-gray-500 dark:text-gray-500 font-mono bg-gray-100 dark:bg-neutral-950 px-3 py-2 rounded">
          {projectPath}/.claude/settings.local.json
          {!fileExists && (
            <span className="ml-2 text-yellow-600 dark:text-yellow-500">
              ({t('localSettings.newFile')})
            </span>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <span className="text-gray-500 dark:text-gray-400">{t('common.loading')}</span>
          </div>
        ) : (
          <>
            <div className="relative">
              <textarea
                value={content}
                onChange={handleContentChange}
                className={`w-full h-80 px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-neutral-950 border rounded focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none ${
                  parseError
                    ? 'border-red-500 dark:border-red-500'
                    : isValidJson
                      ? 'border-green-500 dark:border-green-500'
                      : 'border-gray-200 dark:border-neutral-700'
                }`}
                placeholder={DEFAULT_SETTINGS}
                spellCheck={false}
              />
              {/* Validation status indicator */}
              <div className="mt-2 flex items-center gap-2">
                {content.trim() &&
                  (parseError ? (
                    <div className="flex items-center gap-1.5 text-red-500">
                      <InvalidIcon />
                      <span className="text-xs">{t('localSettings.invalidJson')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-green-500">
                      <ValidIcon />
                      <span className="text-xs">{t('localSettings.validJson')}</span>
                    </div>
                  ))}
              </div>
              {parseError && (
                <p className="mt-1 text-xs text-red-400 font-mono bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                  {parseError}
                </p>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={handleFormat}
                disabled={!content.trim() || !!parseError}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('localSettings.format')}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !!parseError || !hasChanges}
                  className="px-4 py-2 text-sm bg-sky-500 text-white rounded hover:bg-sky-500/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ValidIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function InvalidIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
