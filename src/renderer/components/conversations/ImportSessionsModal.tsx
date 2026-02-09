import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Modal } from '../common/Modal';
import { Spinner } from '../common/Spinner';
import { useConversationStore } from '../../stores/conversationStore';

interface ImportSessionsModalProps {
  projectId: string;
  projectPath: string;
  onClose: () => void;
  onImported: () => void;
}

export function ImportSessionsModal({
  projectId,
  projectPath,
  onClose,
  onImported,
}: ImportSessionsModalProps) {
  const { t } = useTranslation();
  const {
    availableSessions,
    isLoadingSessions,
    isImporting,
    loadAvailableSessions,
    importSessions,
  } = useConversationStore(
    useShallow((s) => ({
      availableSessions: s.availableSessions,
      isLoadingSessions: s.isLoadingSessions,
      isImporting: s.isImporting,
      loadAvailableSessions: s.loadAvailableSessions,
      importSessions: s.importSessions,
    }))
  );

  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<{ imported: number; failed: number } | null>(
    null
  );

  useEffect(() => {
    void loadAvailableSessions(projectPath);
  }, [projectPath, loadAvailableSessions]);

  const notImportedSessions = availableSessions.filter((s) => !s.isImported);

  const handleToggleSession = (sessionId: string) => {
    setSelectedSessions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedSessions.size === notImportedSessions.length) {
      setSelectedSessions(new Set());
    } else {
      setSelectedSessions(new Set(notImportedSessions.map((s) => s.sessionId)));
    }
  };

  const handleImport = async () => {
    if (selectedSessions.size === 0) return;

    try {
      const result = await importSessions(Array.from(selectedSessions), projectId, projectPath);
      setImportResult({ imported: result.imported, failed: result.failed });
      setSelectedSessions(new Set());

      if (result.imported > 0) {
        onImported();
      }
    } catch (error) {
      console.error('Failed to import sessions:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Modal title={t('import.title')} onClose={onClose} width="lg">
      <div className="space-y-4">
        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
          <p className="text-sm text-blue-700 dark:text-blue-300">{t('import.description')}</p>
        </div>

        {/* Loading state */}
        {isLoadingSessions && (
          <div className="flex items-center justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div
            className={`rounded p-3 ${
              importResult.failed > 0
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            }`}
          >
            <p
              className={`text-sm ${
                importResult.failed > 0
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-green-700 dark:text-green-300'
              }`}
            >
              {t('import.result', { imported: importResult.imported, failed: importResult.failed })}
            </p>
          </div>
        )}

        {/* No sessions available */}
        {!isLoadingSessions && availableSessions.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p>{t('import.noSessions')}</p>
          </div>
        )}

        {/* All sessions imported */}
        {!isLoadingSessions && availableSessions.length > 0 && notImportedSessions.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p>{t('import.allImported')}</p>
          </div>
        )}

        {/* Session list */}
        {!isLoadingSessions && notImportedSessions.length > 0 && (
          <>
            {/* Select all checkbox */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-neutral-700 pb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSessions.size === notImportedSessions.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 dark:border-neutral-600 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('import.selectAll')} ({notImportedSessions.length})
                </span>
              </label>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedSessions.size} {t('import.selected')}
              </span>
            </div>

            {/* Sessions */}
            <div className="max-h-80 overflow-y-auto space-y-2">
              {notImportedSessions.map((session) => (
                <div
                  key={session.sessionId}
                  onClick={() => handleToggleSession(session.sessionId)}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    selectedSessions.has(session.sessionId)
                      ? 'border-sky-500 bg-sky-500/5 dark:bg-sky-500/10'
                      : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedSessions.has(session.sessionId)}
                      onChange={() => handleToggleSession(session.sessionId)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-neutral-600 text-sky-500 focus:ring-sky-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {session.firstUserMessage
                            ? truncateText(session.firstUserMessage, 60)
                            : t('import.noPreview')}
                        </p>
                        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {formatDate(session.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                            />
                          </svg>
                          {session.messageCount} {t('common.messages')}
                        </span>
                        <span
                          className="font-mono text-gray-400 dark:text-gray-600 truncate"
                          title={session.sessionId}
                        >
                          {session.sessionId.substring(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Already imported sessions (collapsed) */}
        {!isLoadingSessions && availableSessions.filter((s) => s.isImported).length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              {t('import.alreadyImported', {
                count: availableSessions.filter((s) => s.isImported).length,
              })}
            </summary>
            <div className="mt-2 space-y-2 opacity-50">
              {availableSessions
                .filter((s) => s.isImported)
                .map((session) => (
                  <div
                    key={session.sessionId}
                    className="p-2 rounded border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800"
                  >
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {session.firstUserMessage || session.sessionId}
                    </p>
                  </div>
                ))}
            </div>
          </details>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-neutral-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            {t('common.close')}
          </button>
          <button
            onClick={handleImport}
            disabled={selectedSessions.size === 0 || isImporting}
            className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-500-dark text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting ? (
              <>
                <Spinner size="sm" />
                {t('import.importing')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                {t('import.importSelected', { count: selectedSessions.size })}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
