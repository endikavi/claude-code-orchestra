import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useGitStore } from '../../stores/gitStore';
import {
  GitBranchIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CheckIcon,
  EditIcon,
  QuestionIcon,
} from '@renderer/components/icons';
import type { GitStatus } from '@shared/types';

interface GitStatusBadgeProps {
  projectId: string;
  compact?: boolean;
}

export function GitStatusBadge({ projectId, compact = false }: GitStatusBadgeProps) {
  const { t } = useTranslation();
  const { getStatus, fetchStatus, setupListeners } = useGitStore(
    useShallow((s) => ({
      getStatus: s.getStatus,
      fetchStatus: s.fetchStatus,
      setupListeners: s.setupListeners,
    }))
  );
  const status = getStatus(projectId);

  // Setup listeners and fetch initial status
  useEffect(() => {
    const unsubscribe = setupListeners();
    void fetchStatus(projectId);
    return unsubscribe;
  }, [projectId, fetchStatus, setupListeners]);

  if (!status || !status.isRepo) {
    return null;
  }

  if (compact) {
    return <CompactBadge status={status} t={t} />;
  }

  return <FullBadge status={status} t={t} />;
}

interface BadgeProps {
  status: GitStatus;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function CompactBadge({ status }: BadgeProps) {
  const hasChanges = status.totalFiles > 0;
  const hasRemoteStatus = status.ahead > 0 || status.behind > 0;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {/* Branch name */}
      <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
        <GitBranchIcon className="w-3 h-3" />
        <span className="truncate max-w-[80px]">{status.branch}</span>
      </div>

      {/* Ahead/behind indicator */}
      {hasRemoteStatus && (
        <div className="flex items-center gap-0.5">
          {status.ahead > 0 && (
            <span className="text-green-600 dark:text-green-400 flex items-center">
              <ArrowUpIcon className="w-3 h-3" />
              {status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span className="text-orange-600 dark:text-orange-400 flex items-center">
              <ArrowDownIcon className="w-3 h-3" />
              {status.behind}
            </span>
          )}
        </div>
      )}

      {/* Changes indicator */}
      {hasChanges && (
        <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded text-[10px] font-medium">
          {status.totalFiles}
        </span>
      )}
    </div>
  );
}

function FullBadge({ status, t }: BadgeProps) {
  const hasChanges = status.totalFiles > 0;
  const stagedCount = status.staged.added + status.staged.modified + status.staged.deleted;
  const unstagedCount = status.unstaged.added + status.unstaged.modified + status.unstaged.deleted;

  // Format last commit time
  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return t('git.minutesAgo', { count: minutes });
    }
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return t('git.hoursAgo', { count: hours });
    }
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return t('git.daysAgo', { count: days });
    }
    // Show date
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white/50 dark:bg-neutral-800/50 rounded p-3 space-y-2">
      {/* Branch and remote status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="font-medium text-gray-800 dark:text-gray-200">{status.branch}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {status.ahead > 0 && (
            <span
              className="flex items-center gap-0.5 text-green-600 dark:text-green-400"
              title={t('git.ahead', { count: status.ahead })}
            >
              <ArrowUpIcon className="w-3.5 h-3.5" />
              {status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span
              className="flex items-center gap-0.5 text-orange-600 dark:text-orange-400"
              title={t('git.behind', { count: status.behind })}
            >
              <ArrowDownIcon className="w-3.5 h-3.5" />
              {status.behind}
            </span>
          )}
        </div>
      </div>

      {/* Changes summary */}
      {hasChanges && (
        <div className="flex flex-wrap gap-2 text-xs">
          {stagedCount > 0 && (
            <div
              className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded"
              title={t('git.staged')}
            >
              <CheckIcon className="w-3 h-3" />
              <span>
                {stagedCount} {t('git.staged')}
              </span>
            </div>
          )}
          {unstagedCount > 0 && (
            <div
              className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded"
              title={t('git.modified')}
            >
              <EditIcon className="w-3 h-3" />
              <span>
                {unstagedCount} {t('git.modified')}
              </span>
            </div>
          )}
          {status.untracked > 0 && (
            <div
              className="flex items-center gap-1 bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-400 px-2 py-1 rounded"
              title={t('git.untracked')}
            >
              <QuestionIcon className="w-3 h-3" />
              <span>
                {status.untracked} {t('git.untracked')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Diff stats */}
      {(status.linesAdded > 0 || status.linesRemoved > 0) && (
        <div className="flex items-center gap-3 text-xs">
          {status.linesAdded > 0 && (
            <span className="text-green-600 dark:text-green-400">+{status.linesAdded}</span>
          )}
          {status.linesRemoved > 0 && (
            <span className="text-red-600 dark:text-red-400">-{status.linesRemoved}</span>
          )}
        </div>
      )}

      {/* Last commit */}
      {status.lastCommitMessage && (
        <div className="text-xs text-gray-500 dark:text-gray-500 truncate">
          <span className="opacity-60">{formatTime(status.lastCommitTime)}</span>{' '}
          <span>{status.lastCommitMessage}</span>
        </div>
      )}
    </div>
  );
}

// Icons
