import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubagentInstance } from '@shared/types';

interface SubagentCardProps {
  subagent: SubagentInstance;
}

export function SubagentCard({ subagent }: SubagentCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = () => {
    switch (subagent.status) {
      case 'running':
        return 'bg-green-500';
      case 'completed':
        return 'bg-blue-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = () => {
    switch (subagent.status) {
      case 'running':
        return (
          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
        );
      case 'completed':
        return (
          <svg
            className="h-4 w-4 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg
            className="h-4 w-4 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  const getSubagentTypeBadge = () => {
    const colors: Record<string, string> = {
      Explore: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      Plan: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      Bash: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'general-purpose': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    };
    return (
      colors[subagent.subagentType] ||
      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    );
  };

  const formatDuration = () => {
    if (!subagent.completedAt) {
      const elapsed = Date.now() - subagent.startedAt;
      const seconds = Math.floor(elapsed / 1000);
      return `${seconds}s`;
    }
    const duration = subagent.completedAt - subagent.startedAt;
    const seconds = Math.floor(duration / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const truncateResult = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  return (
    <div
      className={`
        p-3 rounded-lg border transition-all
        ${
          subagent.status === 'running'
            ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
            : subagent.status === 'error'
              ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${getSubagentTypeBadge()}`}
          >
            {subagent.subagentType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDuration()}</span>
          {getStatusIcon()}
        </div>
      </div>

      {/* Description */}
      <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mt-2 line-clamp-2">
        {subagent.description}
      </h4>

      {/* Result/Error (expandable) */}
      {(subagent.result || subagent.error) && (
        <div className="mt-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-claude-orange hover:underline flex items-center gap-1"
          >
            {isExpanded ? t('common.collapse') : t('common.expand')}
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
          </button>
          {isExpanded && (
            <div className="mt-2 p-2 rounded bg-gray-100 dark:bg-gray-700 max-h-64 overflow-auto">
              {subagent.error ? (
                <pre className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">
                  {subagent.error}
                </pre>
              ) : (
                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                  {subagent.result}
                </pre>
              )}
            </div>
          )}
          {!isExpanded && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
              {subagent.error
                ? truncateResult(subagent.error)
                : truncateResult(subagent.result || '')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
