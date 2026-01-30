import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProxyStore } from '../../stores/proxyStore';
import type { ConsoleEntry, ConsoleLevel } from '@shared/types/devtools';

// Inline icons
function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

interface ConsolePanelProps {
  viewId: string;
}

const LEVEL_COLORS: Record<ConsoleLevel, { bg: string; text: string; border: string }> = {
  log: {
    bg: 'bg-gray-100 dark:bg-neutral-800',
    text: 'text-gray-700 dark:text-gray-300',
    border: 'border-gray-200 dark:border-neutral-700',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  warn: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  debug: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
  },
};

const LEVEL_LABELS: Record<ConsoleLevel, string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

export function ConsolePanel({ viewId }: ConsolePanelProps) {
  const { t } = useTranslation();
  const {
    getDevToolsState,
    getConsoleEntries,
    getConsoleCounts,
    toggleConsolePanel,
    setConsoleFilter,
    clearConsoleEntries,
  } = useProxyStore();

  const devToolsState = getDevToolsState(viewId);
  const entries = getConsoleEntries(viewId);
  const counts = getConsoleCounts(viewId);

  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && listRef.current && devToolsState.consolePanelOpen) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length, autoScroll, devToolsState.consolePanelOpen]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const handleCopyEntry = useCallback(async (entry: ConsoleEntry) => {
    try {
      await navigator.clipboard.writeText(entry.message);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }, []);

  // Filter buttons
  const filterOptions: Array<{ level: ConsoleLevel | null; label: string; count?: number }> =
    useMemo(
      () => [
        { level: null, label: t('devtools.console.all', 'All'), count: counts.total },
        { level: 'error', label: LEVEL_LABELS.error, count: counts.error },
        { level: 'warn', label: LEVEL_LABELS.warn, count: counts.warn },
        { level: 'log', label: LEVEL_LABELS.log, count: counts.log },
        { level: 'info', label: LEVEL_LABELS.info, count: counts.info },
        { level: 'debug', label: LEVEL_LABELS.debug, count: counts.debug },
      ],
      [counts, t]
    );

  const isOpen = devToolsState.consolePanelOpen;

  return (
    <div
      className={`
        border-t border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950
        transition-all duration-200 flex flex-col
        ${isOpen ? 'h-48' : 'h-8'}
      `}
    >
      {/* Header / Toggle bar */}
      <div
        className="flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 cursor-pointer select-none"
        onClick={() => toggleConsolePanel(viewId)}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDownIcon className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronUpIcon className="w-4 h-4 text-gray-500" />
          )}
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {t('devtools.console.title', 'Console')}
          </span>

          {/* Badge counts when collapsed */}
          {!isOpen && (counts.error > 0 || counts.warn > 0) && (
            <div className="flex items-center gap-1">
              {counts.error > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                  {counts.error}
                </span>
              )}
              {counts.warn > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400">
                  {counts.warn}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Filter and clear buttons (only when open) */}
        {isOpen && (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()} // Prevent toggle when clicking buttons
          >
            {/* Filter buttons */}
            <div className="flex items-center gap-0.5">
              {filterOptions.map((opt) => (
                <button
                  key={opt.level ?? 'all'}
                  onClick={() => setConsoleFilter(viewId, opt.level)}
                  className={`
                    px-1.5 py-0.5 text-xs rounded transition-colors
                    ${
                      devToolsState.consoleFilter === opt.level
                        ? 'bg-sky-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
                    }
                  `}
                >
                  {opt.label}
                  {opt.count !== undefined && opt.count > 0 && (
                    <span className="ml-0.5 opacity-70">({opt.count})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Clear button */}
            <button
              onClick={() => clearConsoleEntries(viewId)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-500 dark:text-gray-400"
              title={t('devtools.console.clear', 'Clear console')}
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Console entries list (only when open) */}
      {isOpen && (
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-xs"
          onScroll={handleScroll}
        >
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
              {t('devtools.console.empty', 'No console output')}
            </div>
          ) : (
            entries.map((entry) => (
              <ConsoleEntryRow
                key={entry.id}
                entry={entry}
                onCopy={() => handleCopyEntry(entry)}
                formatTime={formatTime}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface ConsoleEntryRowProps {
  entry: ConsoleEntry;
  onCopy: () => void;
  formatTime: (timestamp: number) => string;
}

function ConsoleEntryRow({ entry, onCopy, formatTime }: ConsoleEntryRowProps) {
  const colors = LEVEL_COLORS[entry.level];

  return (
    <div
      className={`
        group flex items-start gap-2 px-2 py-1 border-b
        ${colors.bg} ${colors.border} hover:opacity-90
      `}
    >
      {/* Timestamp */}
      <span className="flex-shrink-0 text-gray-400 dark:text-gray-500 text-[10px] leading-4 mt-0.5">
        {formatTime(entry.timestamp)}
      </span>

      {/* Level badge */}
      <span
        className={`
          flex-shrink-0 px-1 py-0 text-[10px] font-semibold rounded leading-4
          ${colors.text} bg-white/50 dark:bg-black/20
        `}
      >
        {LEVEL_LABELS[entry.level]}
      </span>

      {/* Message */}
      <span className={`flex-1 ${colors.text} break-all whitespace-pre-wrap leading-4`}>
        {entry.message}
      </span>

      {/* Source info (if available) */}
      {entry.source && (
        <span className="flex-shrink-0 text-gray-400 dark:text-gray-500 text-[10px] truncate max-w-32">
          {entry.source}
          {entry.line !== undefined && `:${entry.line}`}
        </span>
      )}

      {/* Copy button (visible on hover) */}
      <button
        onClick={onCopy}
        className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
        title="Copy"
      >
        <CopyIcon className="w-3 h-3 text-gray-400" />
      </button>
    </div>
  );
}
