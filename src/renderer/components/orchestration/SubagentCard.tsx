import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubagentInstance } from '@shared/types';

interface SubagentCardProps {
  subagent: SubagentInstance;
}

export function SubagentCard({ subagent }: SubagentCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<string>('');

  // Update elapsed time for running subagents
  useEffect(() => {
    if (subagent.status !== 'running') {
      setElapsedTime(formatDuration(subagent.startedAt, subagent.completedAt));
      return;
    }

    // Update every second for running subagents
    const updateElapsed = () => {
      setElapsedTime(formatDuration(subagent.startedAt));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [subagent.status, subagent.startedAt, subagent.completedAt]);

  const formatDuration = (startedAt: number, completedAt?: number) => {
    const end = completedAt || Date.now();
    const duration = end - startedAt;
    const seconds = Math.floor(duration / 1000);

    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const getTypeConfig = (type: string) => {
    const configs: Record<
      string,
      { bg: string; text: string; darkBg: string; darkText: string; icon: React.ReactNode }
    > = {
      Explore: {
        bg: 'bg-purple-100',
        text: 'text-purple-700',
        darkBg: 'dark:bg-purple-900/40',
        darkText: 'dark:text-purple-300',
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        ),
      },
      Plan: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        darkBg: 'dark:bg-blue-900/40',
        darkText: 'dark:text-blue-300',
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        ),
      },
      Bash: {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        darkBg: 'dark:bg-orange-900/40',
        darkText: 'dark:text-orange-300',
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        ),
      },
      'general-purpose': {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        darkBg: 'dark:bg-gray-700',
        darkText: 'dark:text-gray-300',
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        ),
      },
    };

    return (
      configs[type] || {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        darkBg: 'dark:bg-gray-700',
        darkText: 'dark:text-gray-300',
        icon: (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        ),
      }
    );
  };

  const getStatusConfig = () => {
    switch (subagent.status) {
      case 'running':
        return {
          borderColor: 'border-green-300 dark:border-green-600',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          statusIcon: (
            <div className="relative">
              <div className="animate-spin h-4 w-4 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ),
          statusText: t('orchestration.status.running'),
          statusPill: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        };
      case 'completed':
        return {
          borderColor: 'border-gray-200 dark:border-gray-700',
          bgColor: 'bg-white dark:bg-gray-800/50',
          statusIcon: (
            <svg
              className="h-4 w-4 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ),
          statusText: t('orchestration.status.completed'),
          statusPill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
        };
      case 'error':
        return {
          borderColor: 'border-red-300 dark:border-red-600',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          statusIcon: (
            <svg
              className="h-4 w-4 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ),
          statusText: t('orchestration.status.error'),
          statusPill: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
        };
      default:
        return {
          borderColor: 'border-gray-200 dark:border-gray-700',
          bgColor: 'bg-white dark:bg-gray-800/50',
          statusIcon: null,
          statusText: '',
          statusPill: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
        };
    }
  };

  const typeConfig = getTypeConfig(subagent.subagentType);
  const statusConfig = getStatusConfig();

  const hasContent = subagent.result || subagent.error;

  return (
    <div
      className={`
        rounded-lg border transition-all overflow-hidden
        ${statusConfig.borderColor} ${statusConfig.bgColor}
      `}
    >
      {/* Main Content */}
      <div className="p-3">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {/* Type Badge with Icon */}
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0
                ${typeConfig.bg} ${typeConfig.text} ${typeConfig.darkBg} ${typeConfig.darkText}
              `}
            >
              {typeConfig.icon}
              {subagent.subagentType}
            </span>

            {/* Description */}
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-2 flex-1">
              {subagent.description}
            </p>
          </div>

          {/* Status & Duration */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {elapsedTime}
            </span>
            {statusConfig.statusIcon}
          </div>
        </div>

        {/* Actions Row */}
        <div className="flex items-center gap-3 mt-2">
          {/* Show Prompt Button */}
          {subagent.prompt && (
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-claude-orange dark:hover:text-claude-orange flex items-center gap-1 transition-colors"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showPrompt ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {showPrompt ? t('orchestration.hidePrompt') : t('orchestration.showPrompt')}
            </button>
          )}

          {/* Expand Result Button */}
          {hasContent && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-claude-orange hover:text-claude-orange/80 flex items-center gap-1 transition-colors"
            >
              <svg
                className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              {isExpanded ? t('common.collapse') : t('common.expand')}{' '}
              {subagent.error ? t('orchestration.error') : t('orchestration.result')}
            </button>
          )}
        </div>
      </div>

      {/* Prompt Section (Collapsible) */}
      {showPrompt && subagent.prompt && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            {t('orchestration.prompt')}
          </div>
          <div className="max-h-32 overflow-auto rounded bg-white dark:bg-gray-800 p-2">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
              {subagent.prompt}
            </pre>
          </div>
        </div>
      )}

      {/* Result/Error Section (Collapsible) */}
      {isExpanded && hasContent && (
        <div
          className={`
            border-t p-3
            ${
              subagent.error
                ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30'
                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'
            }
          `}
        >
          <div
            className={`
              flex items-center gap-1.5 text-xs font-medium mb-2
              ${subagent.error ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}
            `}
          >
            {subagent.error ? (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                {t('orchestration.error')}
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {t('orchestration.result')}
              </>
            )}
          </div>
          <div
            className={`
              max-h-64 overflow-auto rounded p-2
              ${subagent.error ? 'bg-red-100 dark:bg-red-900/40' : 'bg-white dark:bg-gray-800'}
            `}
          >
            <pre
              className={`
                text-xs whitespace-pre-wrap font-mono
                ${subagent.error ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}
              `}
            >
              {subagent.error || subagent.result}
            </pre>
          </div>
        </div>
      )}

      {/* Result Preview (when collapsed) */}
      {!isExpanded && hasContent && (
        <div className="px-3 pb-3">
          <p
            className={`
              text-xs line-clamp-1
              ${subagent.error ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}
            `}
          >
            {subagent.error || subagent.result}
          </p>
        </div>
      )}
    </div>
  );
}
