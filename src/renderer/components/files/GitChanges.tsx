import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitFileEntry } from '@shared/types';
import { GitStatusBadge } from './GitStatusBadge';

interface GitChangesProps {
  files: GitFileEntry[];
  onFileClick?: (filePath: string) => void;
}

interface GroupedFiles {
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitFileEntry[];
}

function groupFiles(files: GitFileEntry[]): GroupedFiles {
  const staged: GitFileEntry[] = [];
  const unstaged: GitFileEntry[] = [];
  const untracked: GitFileEntry[] = [];

  for (const file of files) {
    if (file.indexStatus === '?' && file.workTreeStatus === '?') {
      untracked.push(file);
    } else {
      if (file.indexStatus !== ' ' && file.indexStatus !== '?') {
        staged.push(file);
      }
      if (file.workTreeStatus !== ' ' && file.workTreeStatus !== '?') {
        unstaged.push(file);
      }
    }
  }

  return { staged, unstaged, untracked };
}

export function GitChanges({ files, onFileClick }: GitChangesProps) {
  const { t } = useTranslation();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  if (files.length === 0) return null;

  const { staged, unstaged, untracked } = groupFiles(files);

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderFileList = (entries: GitFileEntry[], isStaged?: boolean) => (
    <div className="space-y-0.5 mt-1">
      {entries.map((file) => {
        const status =
          file.indexStatus === '?' ? '?' : isStaged ? file.indexStatus : file.workTreeStatus;
        return (
          <div
            key={`${file.path}-${isStaged ? 'staged' : 'unstaged'}`}
            className="flex items-center gap-2 px-3 py-1 rounded hover:bg-gray-100 dark:hover:bg-neutral-800/50 cursor-pointer"
            onClick={() => onFileClick?.(file.path)}
          >
            <GitStatusBadge status={status} isStaged={isStaged} />
            <span
              className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1"
              title={file.path}
            >
              {file.path}
            </span>
          </div>
        );
      })}
    </div>
  );

  const renderSection = (
    key: string,
    label: string,
    entries: GitFileEntry[],
    isStaged?: boolean,
    dotColor?: string
  ) => {
    if (entries.length === 0) return null;
    const isCollapsed = collapsedSections[key];

    return (
      <div key={key} className="mb-2">
        <button
          onClick={() => toggleSection(key)}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800/50 rounded transition-colors"
        >
          <svg
            className={`h-3 w-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          {label}
          <span className="text-gray-400 dark:text-gray-500 ml-auto">{entries.length}</span>
        </button>
        {!isCollapsed && renderFileList(entries, isStaged)}
      </div>
    );
  };

  return (
    <div>
      {renderSection('staged', t('files.staged'), staged, true, 'bg-green-500')}
      {renderSection('unstaged', t('files.modified'), unstaged, false, 'bg-yellow-500')}
      {renderSection('untracked', t('files.untracked'), untracked, undefined, 'bg-gray-400')}
    </div>
  );
}
