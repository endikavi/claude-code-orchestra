import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { IdeDiffRequestEvent } from '@shared/types';

interface DiffViewerProps {
  diff: IdeDiffRequestEvent;
  onResolve: (applied: boolean) => void;
  onClose: () => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'context', content: oldLines[i - 1], oldLineNum: i, newLineNum: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', content: newLines[j - 1], newLineNum: j });
      j--;
    } else if (i > 0) {
      result.unshift({ type: 'removed', content: oldLines[i - 1], oldLineNum: i });
      i--;
    }
  }

  return result;
}

export function DiffViewer({ diff, onResolve, onClose }: DiffViewerProps) {
  const { t } = useTranslation();

  const diffLines = useMemo(
    () => computeDiff(diff.oldContent, diff.newContent),
    [diff.oldContent, diff.newContent]
  );

  const addedCount = diffLines.filter((l) => l.type === 'added').length;
  const removedCount = diffLines.filter((l) => l.type === 'removed').length;

  const fileName = diff.filePath.split('/').pop() || diff.filePath;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
            {t('files.diffTitle')}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {diff.tab_name || fileName}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-600 dark:text-green-400">
            +{addedCount} {t('files.linesAdded')}
          </span>
          <span className="text-red-600 dark:text-red-400">
            -{removedCount} {t('files.linesRemoved')}
          </span>
          <button
            onClick={onClose}
            className="ml-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-neutral-800"
          >
            <svg
              className="h-4 w-4 text-gray-500"
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
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        {diffLines.map((line, idx) => (
          <div
            key={idx}
            className={`flex ${
              line.type === 'added'
                ? 'bg-green-50 dark:bg-green-950/30'
                : line.type === 'removed'
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : ''
            }`}
          >
            <div className="w-12 shrink-0 text-right pr-2 py-0.5 text-gray-400 dark:text-gray-600 select-none border-r border-gray-200 dark:border-neutral-800">
              {line.oldLineNum || ''}
            </div>
            <div className="w-12 shrink-0 text-right pr-2 py-0.5 text-gray-400 dark:text-gray-600 select-none border-r border-gray-200 dark:border-neutral-800">
              {line.newLineNum || ''}
            </div>
            <div className="w-6 shrink-0 text-center py-0.5 select-none">
              <span
                className={
                  line.type === 'added'
                    ? 'text-green-600 dark:text-green-400'
                    : line.type === 'removed'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-300 dark:text-gray-700'
                }
              >
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
            </div>
            <div className="flex-1 py-0.5 pr-4 whitespace-pre overflow-x-auto text-gray-800 dark:text-gray-200">
              {line.content}
            </div>
          </div>
        ))}
      </div>

      {/* Footer with actions */}
      <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-neutral-700">
        <button
          onClick={() => onResolve(false)}
          className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
        >
          {t('files.reject')}
        </button>
        <button
          onClick={() => onResolve(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 dark:bg-green-700 rounded-md hover:bg-green-700 dark:hover:bg-green-600 transition-colors"
        >
          {t('files.accept')}
        </button>
      </div>
    </div>
  );
}
