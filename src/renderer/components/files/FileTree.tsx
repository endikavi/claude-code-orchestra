import { useState, useCallback, useMemo } from 'react';
import type { FileTreeEntry } from '@shared/types';
import { useFileExplorerStore } from '../../stores/fileExplorerStore';
import { Spinner } from '../common/Spinner';
import { GitStatusBadge } from './GitStatusBadge';
import { InlineRenameInput } from './InlineRenameInput';

interface FileTreeProps {
  projectPath: string;
  entries: FileTreeEntry[];
  depth?: number;
  highlightedFile?: string | null;
  highlightQuery?: string;
  onContextMenu?: (event: React.MouseEvent, entry: FileTreeEntry) => void;
  onFileOpen?: (entry: FileTreeEntry) => void;
  renamingPath?: string | null;
  onRenameSubmit?: (oldPath: string, newName: string) => void;
  onRenameCancel?: () => void;
  creatingIn?: { dirPath: string; type: 'file' | 'directory' } | null;
  onCreateSubmit?: (dirPath: string, name: string, type: 'file' | 'directory') => void;
  onCreateCancel?: () => void;
  focusedPath?: string | null;
  onFocusedPathChange?: (path: string | null) => void;
}

interface FileTreeNodeProps {
  projectPath: string;
  entry: FileTreeEntry;
  depth: number;
  highlightedFile?: string | null;
  highlightQuery?: string;
  onContextMenu?: (event: React.MouseEvent, entry: FileTreeEntry) => void;
  onFileOpen?: (entry: FileTreeEntry) => void;
  renamingPath?: string | null;
  onRenameSubmit?: (oldPath: string, newName: string) => void;
  onRenameCancel?: () => void;
  creatingIn?: { dirPath: string; type: 'file' | 'directory' } | null;
  onCreateSubmit?: (dirPath: string, name: string, type: 'file' | 'directory') => void;
  onCreateCancel?: () => void;
  focusedPath?: string | null;
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query) return <>{name}</>;
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerName.indexOf(lowerQuery);
  if (idx === -1) return <>{name}</>;

  return (
    <>
      {name.slice(0, idx)}
      <mark className="bg-yellow-200/50 dark:bg-yellow-500/30 text-inherit rounded-sm">
        {name.slice(idx, idx + query.length)}
      </mark>
      {name.slice(idx + query.length)}
    </>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  let color = 'text-gray-400';

  // Color by file type
  if (['ts', 'tsx'].includes(ext)) color = 'text-blue-400';
  else if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) color = 'text-yellow-400';
  else if (['json'].includes(ext)) color = 'text-yellow-600 dark:text-yellow-500';
  else if (['css', 'scss', 'less'].includes(ext)) color = 'text-purple-400';
  else if (['html', 'htm'].includes(ext)) color = 'text-orange-400';
  else if (['md', 'mdx'].includes(ext)) color = 'text-sky-400';
  else if (['py'].includes(ext)) color = 'text-green-400';
  else if (['sh', 'bash', 'zsh'].includes(ext)) color = 'text-green-500';
  else if (['yml', 'yaml', 'toml'].includes(ext)) color = 'text-red-400';
  else if (['svg', 'png', 'jpg', 'jpeg', 'gif', 'ico'].includes(ext)) color = 'text-pink-400';

  return (
    <svg
      className={`w-4 h-4 shrink-0 ${color}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

function FolderIcon({ open }: { open?: boolean }) {
  if (open) {
    return (
      <svg
        className="w-4 h-4 shrink-0 text-yellow-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
        />
      </svg>
    );
  }

  return (
    <svg
      className="w-4 h-4 shrink-0 text-yellow-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

function FileTreeNode({
  projectPath,
  entry,
  depth,
  highlightedFile,
  highlightQuery,
  onContextMenu,
  onFileOpen,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  creatingIn,
  onCreateSubmit,
  onCreateCancel,
  focusedPath,
}: FileTreeNodeProps) {
  const expandedDirs = useFileExplorerStore((s) => s.expandedDirs);
  const directoryLoading = useFileExplorerStore((s) => s.directoryLoading);
  const toggleDirectory = useFileExplorerStore((s) => s.toggleDirectory);

  const isExpanded = expandedDirs[projectPath]?.[entry.path] || false;
  const isLoading = directoryLoading[entry.path] || false;
  const isRenaming = renamingPath === entry.path;
  const isCreatingHere = creatingIn?.dirPath === entry.path;
  const isFocused = focusedPath === entry.path;

  const paddingLeft = 8 + depth * 16;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, entry);
  };

  const focusedClass = isFocused ? 'bg-sky-100 dark:bg-sky-900/30 ring-1 ring-sky-400/50' : '';

  if (entry.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => toggleDirectory(projectPath, entry.path)}
          onContextMenu={handleContextMenu}
          data-tree-path={entry.path}
          className={`w-full flex items-center gap-1.5 py-1 pr-2 text-left hover:bg-gray-100 dark:hover:bg-neutral-800/50 rounded transition-colors group ${focusedClass}`}
          style={{ paddingLeft }}
        >
          <svg
            className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <FolderIcon open={isExpanded} />
          {isRenaming ? (
            <InlineRenameInput
              initialName={entry.name}
              onSubmit={(newName) => onRenameSubmit?.(entry.path, newName)}
              onCancel={() => onRenameCancel?.()}
              selectNameOnly={false}
            />
          ) : (
            <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
              {highlightQuery ? (
                <HighlightedName name={entry.name} query={highlightQuery} />
              ) : (
                entry.name
              )}
            </span>
          )}
          {entry.gitStatus && <GitStatusBadge status={entry.gitStatus} />}
          {isLoading && <Spinner size="xs" className="shrink-0" />}
        </button>
        {isExpanded && (
          <>
            {isCreatingHere && onCreateSubmit && onCreateCancel && (
              <div
                className="flex items-center gap-1.5 py-1 pr-2"
                style={{ paddingLeft: paddingLeft + 16 }}
              >
                {creatingIn.type === 'directory' ? <FolderIcon /> : <FileIcon name="" />}
                <InlineRenameInput
                  initialName=""
                  onSubmit={(name) => onCreateSubmit(entry.path, name, creatingIn.type)}
                  onCancel={onCreateCancel}
                  selectNameOnly={false}
                />
              </div>
            )}
            {entry.children && (
              <FileTree
                projectPath={projectPath}
                entries={entry.children}
                depth={depth + 1}
                highlightedFile={highlightedFile}
                highlightQuery={highlightQuery}
                onContextMenu={onContextMenu}
                onFileOpen={onFileOpen}
                renamingPath={renamingPath}
                onRenameSubmit={onRenameSubmit}
                onRenameCancel={onRenameCancel}
                creatingIn={creatingIn}
                onCreateSubmit={onCreateSubmit}
                onCreateCancel={onCreateCancel}
                focusedPath={focusedPath}
              />
            )}
          </>
        )}
      </div>
    );
  }

  // File entry
  return (
    <div
      className={`flex items-center gap-1.5 py-1 pr-2 hover:bg-gray-100 dark:hover:bg-neutral-800/50 rounded transition-colors cursor-default ${highlightedFile === entry.path ? 'bg-sky-100 dark:bg-sky-900/30 ring-1 ring-sky-400/50' : ''} ${focusedClass}`}
      style={{ paddingLeft: paddingLeft + 16 }} // Extra indent for no chevron
      onContextMenu={handleContextMenu}
      onClick={() => onFileOpen?.(entry)}
      data-tree-path={entry.path}
    >
      <FileIcon name={entry.name} />
      {isRenaming ? (
        <InlineRenameInput
          initialName={entry.name}
          onSubmit={(newName) => onRenameSubmit?.(entry.path, newName)}
          onCancel={() => onRenameCancel?.()}
        />
      ) : (
        <span
          className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1"
          title={entry.path}
        >
          {highlightQuery ? (
            <HighlightedName name={entry.name} query={highlightQuery} />
          ) : (
            entry.name
          )}
        </span>
      )}
      {entry.gitStatus && <GitStatusBadge status={entry.gitStatus} />}
    </div>
  );
}

/**
 * Flatten visible entries for keyboard navigation.
 * Only includes entries that are visible (directories must be expanded to show children).
 */
function flattenVisibleEntries(
  entries: FileTreeEntry[],
  expandedDirs: Record<string, boolean>
): FileTreeEntry[] {
  const result: FileTreeEntry[] = [];
  for (const entry of entries) {
    result.push(entry);
    if (entry.type === 'directory' && expandedDirs[entry.path] && entry.children) {
      result.push(...flattenVisibleEntries(entry.children, expandedDirs));
    }
  }
  return result;
}

export function FileTree({
  projectPath,
  entries,
  depth = 0,
  highlightedFile,
  highlightQuery,
  onContextMenu,
  onFileOpen,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  creatingIn,
  onCreateSubmit,
  onCreateCancel,
  focusedPath: externalFocusedPath,
  onFocusedPathChange,
}: FileTreeProps) {
  const expandedDirs = useFileExplorerStore((s) => s.expandedDirs);
  const toggleDirectory = useFileExplorerStore((s) => s.toggleDirectory);
  const [internalFocusedPath, setInternalFocusedPath] = useState<string | null>(null);

  const isRoot = depth === 0;
  const focusedPath = externalFocusedPath !== undefined ? externalFocusedPath : internalFocusedPath;
  const setFocusedPath = onFocusedPathChange || setInternalFocusedPath;

  const projectExpandedDirs = expandedDirs[projectPath] || {};

  const flatEntries = useMemo(
    () => (isRoot ? flattenVisibleEntries(entries, projectExpandedDirs) : []),
    [isRoot, entries, projectExpandedDirs]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isRoot || flatEntries.length === 0) return;

      const currentIndex = focusedPath
        ? flatEntries.findIndex((entry) => entry.path === focusedPath)
        : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < flatEntries.length - 1 ? currentIndex + 1 : 0;
        const nextEntry = flatEntries[nextIndex];
        setFocusedPath(nextEntry.path);
        // Scroll into view
        const el = document.querySelector(`[data-tree-path="${CSS.escape(nextEntry.path)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : flatEntries.length - 1;
        const prevEntry = flatEntries[prevIndex];
        setFocusedPath(prevEntry.path);
        const el = document.querySelector(`[data-tree-path="${CSS.escape(prevEntry.path)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && focusedPath) {
        e.preventDefault();
        const entry = flatEntries.find((en) => en.path === focusedPath);
        if (entry) {
          if (entry.type === 'directory') {
            void toggleDirectory(projectPath, entry.path);
          } else {
            onFileOpen?.(entry);
          }
        }
      }
    },
    [isRoot, flatEntries, focusedPath, setFocusedPath, toggleDirectory, projectPath, onFileOpen]
  );

  if (entries.length === 0) return null;

  if (isRoot) {
    return (
      <div tabIndex={0} onKeyDown={handleKeyDown} className="outline-none">
        {entries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            projectPath={projectPath}
            entry={entry}
            depth={depth}
            highlightedFile={highlightedFile}
            highlightQuery={highlightQuery}
            onContextMenu={onContextMenu}
            onFileOpen={onFileOpen}
            renamingPath={renamingPath}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            creatingIn={creatingIn}
            onCreateSubmit={onCreateSubmit}
            onCreateCancel={onCreateCancel}
            focusedPath={focusedPath}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        <FileTreeNode
          key={entry.path}
          projectPath={projectPath}
          entry={entry}
          depth={depth}
          highlightedFile={highlightedFile}
          highlightQuery={highlightQuery}
          onContextMenu={onContextMenu}
          onFileOpen={onFileOpen}
          renamingPath={renamingPath}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
          creatingIn={creatingIn}
          onCreateSubmit={onCreateSubmit}
          onCreateCancel={onCreateCancel}
          focusedPath={focusedPath}
        />
      ))}
    </div>
  );
}
