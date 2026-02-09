import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../../stores/projectStore';
import { Spinner } from '../common/Spinner';
import { useInstanceStore } from '../../stores/instanceStore';
import { usePolling } from '../../hooks/usePolling';
import type { TmuxSession } from '@shared/types';

export function TmuxSessionList() {
  const { t } = useTranslation();
  const selectProject = useProjectStore((s) => s.selectProject);
  const addShellInstance = useInstanceStore((s) => s.addShellInstance);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attachingSession, setAttachingSession] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const result = await window.electronAPI.tmux.getSessions();
      setAvailable(result.available);
      setSessions(result.sessions);
    } catch {
      setAvailable(false);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(() => void fetchSessions(), 8000);

  const handleReconnect = useCallback(
    async (sessionName: string) => {
      setAttachingSession(sessionName);
      try {
        const result = await window.electronAPI.tmux.attachSession(sessionName);
        if (result.success && result.projectId && result.shell) {
          selectProject(result.projectId);
          addShellInstance(result.shell);
        }
      } finally {
        setAttachingSession(null);
      }
    },
    [selectProject, addShellInstance]
  );

  if (loading || !available || sessions.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 w-full max-w-lg mx-auto">
      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {t('tmux.detectedSessions')}
      </h4>
      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.sessionName}
            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {session.sessionName}
                </span>
                {session.isOrchestraSession && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 font-medium">
                    {t('tmux.orchestraSession')}
                  </span>
                )}
                {session.isAttached && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">
                    {t('tmux.attached')}
                  </span>
                )}
              </div>
              <div
                className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate"
                title={session.workingDirectory}
              >
                {session.workingDirectory}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                {session.windowCount} {t('tmux.windows')}
                {session.createdAt > 0 && (
                  <>
                    {' · '}
                    {t('tmux.created')} {new Date(session.createdAt).toLocaleDateString()}
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => handleReconnect(session.sessionName)}
              disabled={attachingSession !== null}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {attachingSession === session.sessionName ? (
                <span className="flex items-center gap-1">
                  <Spinner size="xs" />
                </span>
              ) : (
                t('tmux.reconnect')
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
