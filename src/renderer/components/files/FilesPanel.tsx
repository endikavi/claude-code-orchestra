import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { Spinner } from '../common/Spinner';
import { Modal } from '../common/Modal';
import { useFileExplorerStore } from '../../stores/fileExplorerStore';
import { useEditorStore } from '../../stores/editorStore';
import { GitChanges } from './GitChanges';
import { FileTree } from './FileTree';
import { FileSearchInput } from './FileSearchInput';
import { InlineRenameInput } from './InlineRenameInput';
import { DiffViewer } from './DiffViewer';
import {
  FileIcon,
  FolderPlusIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CopyIcon,
  RefreshIcon,
  WarningIcon,
} from '@renderer/components/icons';
import { showToast } from '@renderer/stores/toastStore';
import type { FileTreeEntry, GitStatus, IdeDiffRequestEvent } from '@shared/types';

function filterEntries(entries: FileTreeEntry[], query: string): FileTreeEntry[] {
  if (!query) return entries;
  const lowerQuery = query.toLowerCase();

  return entries.reduce<FileTreeEntry[]>((acc, entry) => {
    if (entry.type === 'file') {
      if (entry.name.toLowerCase().includes(lowerQuery)) {
        acc.push(entry);
      }
    } else {
      const filteredChildren = entry.children ? filterEntries(entry.children, query) : [];
      if (entry.name.toLowerCase().includes(lowerQuery) || filteredChildren.length > 0) {
        acc.push({
          ...entry,
          children: filteredChildren.length > 0 ? filteredChildren : entry.children,
        });
      }
    }
    return acc;
  }, []);
}

interface FilesPanelProps {
  className?: string;
  onClose?: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  entry: FileTreeEntry | null; // null = background right-click
}

export function FilesPanel({ className = '', onClose }: FilesPanelProps) {
  const { t } = useTranslation();
  const selectedProject = useProjectStore((s) => s.selectedProjectId);
  const projects = useProjectStore((s) => s.projects);

  const trees = useFileExplorerStore((s) => s.trees);
  const gitFiles = useFileExplorerStore((s) => s.gitFiles);
  const highlightedFile = useFileExplorerStore((s) => s.highlightedFile);
  const isLoading = useFileExplorerStore((s) => s.isLoading);
  const loadRootDirectory = useFileExplorerStore((s) => s.loadRootDirectory);
  const expandDirectory = useFileExplorerStore((s) => s.expandDirectory);
  const updateGitStatus = useFileExplorerStore((s) => s.updateGitStatus);
  const revealFile = useFileExplorerStore((s) => s.revealFile);
  const searchQuery = useFileExplorerStore((s) => s.searchQuery);
  const setSearchQuery = useFileExplorerStore((s) => s.setSearchQuery);
  const clearSearch = useFileExplorerStore((s) => s.clearSearch);

  const openFile = useEditorStore((s) => s.openFile);
  const handleFileRenamed = useEditorStore((s) => s.handleFileRenamed);
  const handleFileDeleted = useEditorStore((s) => s.handleFileDeleted);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const project = projects.find((p) => p.id === selectedProject);
  const projectPath = project?.path || '';

  const rootEntries = projectPath ? trees[projectPath] || [] : [];
  const currentGitFiles = projectPath ? gitFiles[projectPath] || [] : [];
  const currentSearchQuery = projectPath ? searchQuery[projectPath] || '' : '';
  const filteredEntries = useMemo(
    () => (currentSearchQuery ? filterEntries(rootEntries, currentSearchQuery) : rootEntries),
    [rootEntries, currentSearchQuery]
  );

  const [activeDiff, setActiveDiff] = useState<IdeDiffRequestEvent | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<{
    dirPath: string;
    type: 'file' | 'directory';
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FileTreeEntry | null>(null);

  // Load root directory when project changes
  useEffect(() => {
    if (projectPath && !trees[projectPath]) {
      void loadRootDirectory(projectPath);
    }
  }, [projectPath, trees, loadRootDirectory]);

  // Subscribe to IDE integration events
  useEffect(() => {
    if (!window.electronAPI?.ide) return;

    const cleanupFileOpened = window.electronAPI.ide.onFileOpened((event) => {
      if (projectPath) {
        void revealFile(projectPath, event.filePath);
      }
    });

    const cleanupDiffRequested = window.electronAPI.ide.onDiffRequested((event) => {
      setActiveDiff(event);
    });

    return () => {
      cleanupFileOpened();
      cleanupDiffRequested();
    };
  }, [projectPath, revealFile]);

  // Subscribe to git status changes for file list
  useEffect(() => {
    if (!projectPath || !window.electronAPI?.git?.onStatusChanged) return;

    // Load initial git status
    if (project?.id) {
      void window.electronAPI.git.getStatus(project.id).then((status: GitStatus | null) => {
        if (status?.files) {
          updateGitStatus(projectPath, status.files);
        }
      });
    }

    // Listen for changes
    const cleanup = window.electronAPI.git.onStatusChanged(
      (_projectId: string, status: GitStatus) => {
        if (status.files) {
          updateGitStatus(projectPath, status.files);
        }
      }
    );

    return cleanup;
  }, [projectPath, project?.id, updateGitStatus]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Close context menu on scroll
  useEffect(() => {
    if (!contextMenu) return;
    const handleScroll = () => setContextMenu(null);
    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, [contextMenu]);

  // Ctrl+F to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && projectPath) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [projectPath]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (projectPath) clearSearch(projectPath);
        searchInputRef.current?.blur();
      }
    },
    [projectPath, clearSearch]
  );

  const handleContextMenu = useCallback((event: React.MouseEvent, entry: FileTreeEntry) => {
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  }, []);

  const handleBackgroundContextMenu = useCallback((event: React.MouseEvent) => {
    // Only trigger on the background area itself, not on tree entries
    if (event.target === event.currentTarget) {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, entry: null });
    }
  }, []);

  const handleFileOpen = useCallback(
    (entry: FileTreeEntry) => {
      if (entry.type === 'file' && projectPath) {
        openFile(projectPath, entry.path);
      }
    },
    [projectPath, openFile]
  );

  // Get parent directory of a path
  const getParentDir = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts.slice(0, -1).join('/') || '';
  };

  // Refresh a directory after an operation
  const refreshDir = useCallback(
    async (dirPath: string) => {
      if (!projectPath) return;
      if (dirPath === '') {
        await loadRootDirectory(projectPath);
      } else {
        await expandDirectory(projectPath, dirPath);
      }
    },
    [projectPath, loadRootDirectory, expandDirectory]
  );

  // File operations
  const handleRename = useCallback(
    async (oldPath: string, newName: string) => {
      if (!projectPath) return;
      const parentDir = getParentDir(oldPath);
      const newPath = parentDir ? `${parentDir}/${newName}` : newName;
      const result = await window.electronAPI.files.rename(projectPath, oldPath, newPath);
      if (result.success) {
        handleFileRenamed(oldPath, newPath);
        await refreshDir(parentDir);
        showToast('success', t('toast.fileRenamed'));
      }
      setRenamingPath(null);
    },
    [projectPath, handleFileRenamed, refreshDir, t]
  );

  const handleCreate = useCallback(
    async (dirPath: string, name: string, type: 'file' | 'directory') => {
      if (!projectPath) return;
      const relativePath = dirPath ? `${dirPath}/${name}` : name;
      const result = await window.electronAPI.files.create(projectPath, relativePath, type);
      if (result.success) {
        await refreshDir(dirPath);
        // If file was created, open it
        if (type === 'file') {
          openFile(projectPath, relativePath);
        }
        showToast('success', t('toast.fileCreated'));
      }
      setCreatingIn(null);
    },
    [projectPath, openFile, refreshDir, t]
  );

  const handleDelete = useCallback(async () => {
    if (!projectPath || !confirmDelete) return;
    const result = await window.electronAPI.files.delete(projectPath, confirmDelete.path);
    if (result.success) {
      handleFileDeleted(confirmDelete.path);
      const parentDir = getParentDir(confirmDelete.path);
      await refreshDir(parentDir);
      showToast('success', t('toast.fileDeleted'));
    }
    setConfirmDelete(null);
  }, [projectPath, confirmDelete, handleFileDeleted, refreshDir, t]);

  const handleCopyPath = useCallback(
    (filePath: string) => {
      void navigator.clipboard.writeText(filePath);
      showToast('success', t('toast.pathCopied'));
      setContextMenu(null);
    },
    [t]
  );

  // Context menu actions
  const menuActions = {
    open: (entry: FileTreeEntry) => {
      handleFileOpen(entry);
      setContextMenu(null);
    },
    newFile: (dirPath: string) => {
      setCreatingIn({ dirPath, type: 'file' });
      setContextMenu(null);
    },
    newFolder: (dirPath: string) => {
      setCreatingIn({ dirPath, type: 'directory' });
      setContextMenu(null);
    },
    rename: (entry: FileTreeEntry) => {
      setRenamingPath(entry.path);
      setContextMenu(null);
    },
    delete: (entry: FileTreeEntry) => {
      setConfirmDelete(entry);
      setContextMenu(null);
    },
    copyPath: (entry: FileTreeEntry) => {
      handleCopyPath(entry.path);
    },
    refresh: () => {
      if (projectPath) {
        void loadRootDirectory(projectPath);
      }
      setContextMenu(null);
    },
  };

  const totalChanges = currentGitFiles.length;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="sticky top-0 bg-[var(--color-bg-subtle)] z-10 px-4 py-3 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <svg
              className="h-5 w-5 text-sky-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            {t('files.title')}
          </h2>
          <div className="flex items-center gap-2">
            {totalChanges > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {totalChanges} {t('files.modified').toLowerCase()}
              </span>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors"
                aria-label={t('common.close')}
              >
                <svg
                  className="h-5 w-5 text-gray-500 dark:text-gray-400"
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
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      {projectPath && !isLoading && (
        <FileSearchInput
          ref={searchInputRef}
          value={currentSearchQuery}
          onChange={(value) => setSearchQuery(projectPath, value)}
          onClear={() => clearSearch(projectPath)}
          onKeyDown={handleSearchKeyDown}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!projectPath ? (
          // No project selected
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <svg
              className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3"
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
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('files.noProject')}</p>
          </div>
        ) : isLoading ? (
          // Loading state
          <div className="flex items-center justify-center p-8">
            <Spinner size="sm" className="h-5 w-5" />
          </div>
        ) : (
          <div className="p-3">
            {/* Git Changes Section */}
            {currentGitFiles.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 mb-2">
                  {t('files.gitChanges')}
                </h3>
                <GitChanges
                  files={currentGitFiles}
                  onFileClick={(filePath) => {
                    if (projectPath) openFile(projectPath, filePath);
                  }}
                />
              </div>
            )}

            {/* File Explorer Section */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 mb-2">
                {t('files.explorer')}
              </h3>
              {rootEntries.length > 0 ? (
                <div onContextMenu={handleBackgroundContextMenu} className="min-h-[100px]">
                  {creatingIn && creatingIn.dirPath === '' && (
                    <div
                      className="flex items-center gap-1.5 py-1 pr-2"
                      style={{ paddingLeft: 24 }}
                    >
                      <InlineRenameInput
                        initialName=""
                        onSubmit={(name) => handleCreate('', name, creatingIn.type)}
                        onCancel={() => setCreatingIn(null)}
                        selectNameOnly={false}
                      />
                    </div>
                  )}
                  {currentSearchQuery && filteredEntries.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-4 text-center">
                      {t('files.noResults')}
                    </p>
                  ) : (
                    <FileTree
                      projectPath={projectPath}
                      entries={filteredEntries}
                      highlightedFile={projectPath ? highlightedFile[projectPath] : null}
                      highlightQuery={currentSearchQuery || undefined}
                      onContextMenu={handleContextMenu}
                      onFileOpen={handleFileOpen}
                      renamingPath={renamingPath}
                      onRenameSubmit={handleRename}
                      onRenameCancel={() => setRenamingPath(null)}
                      creatingIn={creatingIn}
                      onCreateSubmit={handleCreate}
                      onCreateCancel={() => setCreatingIn(null)}
                    />
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 px-2">
                  {t('common.loading')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {activeDiff && (
        <DiffViewer
          diff={activeDiff}
          onResolve={(applied) => {
            window.electronAPI.ide.resolveDiff(activeDiff.requestId, applied);
            setActiveDiff(null);
          }}
          onClose={() => {
            window.electronAPI.ide.resolveDiff(activeDiff.requestId, false);
            setActiveDiff(null);
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && <ContextMenu menu={contextMenu} actions={menuActions} />}

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <Modal title={t('files.delete')} onClose={() => setConfirmDelete(null)} width="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <WarningIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {confirmDelete.type === 'directory'
                  ? t('files.confirmDeleteDir', { name: confirmDelete.name })
                  : t('files.confirmDelete', { name: confirmDelete.name })}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 text-sm rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                {t('files.delete', 'Delete')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Context menu component
interface ContextMenuProps {
  menu: ContextMenuState;
  actions: {
    open: (entry: FileTreeEntry) => void;
    newFile: (dirPath: string) => void;
    newFolder: (dirPath: string) => void;
    rename: (entry: FileTreeEntry) => void;
    delete: (entry: FileTreeEntry) => void;
    copyPath: (entry: FileTreeEntry) => void;
    refresh: () => void;
  };
}

function ContextMenu({ menu, actions }: ContextMenuProps) {
  const { t } = useTranslation();
  const { entry, x, y } = menu;

  // Ensure menu stays within viewport
  const adjustedStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 50,
  };

  const itemClass =
    'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-700 text-left transition-colors';
  const separatorClass = 'border-t border-gray-200 dark:border-neutral-700 my-1';

  if (!entry) {
    // Background context menu
    return (
      <div
        style={adjustedStyle}
        className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-md shadow-lg py-1 min-w-[160px] animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={itemClass} onClick={() => actions.newFile('')}>
          <PlusIcon className="w-3.5 h-3.5" />
          {t('files.newFile', 'New File')}
        </button>
        <button className={itemClass} onClick={() => actions.newFolder('')}>
          <FolderPlusIcon className="w-3.5 h-3.5" />
          {t('files.newFolder', 'New Folder')}
        </button>
        <div className={separatorClass} />
        <button className={itemClass} onClick={actions.refresh}>
          <RefreshIcon className="w-3.5 h-3.5" />
          {t('files.refresh', 'Refresh')}
        </button>
      </div>
    );
  }

  if (entry.type === 'directory') {
    return (
      <div
        style={adjustedStyle}
        className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-md shadow-lg py-1 min-w-[160px] animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={itemClass} onClick={() => actions.newFile(entry.path)}>
          <PlusIcon className="w-3.5 h-3.5" />
          {t('files.newFile', 'New File')}
        </button>
        <button className={itemClass} onClick={() => actions.newFolder(entry.path)}>
          <FolderPlusIcon className="w-3.5 h-3.5" />
          {t('files.newFolder', 'New Folder')}
        </button>
        <div className={separatorClass} />
        <button className={itemClass} onClick={() => actions.rename(entry)}>
          <EditIcon className="w-3.5 h-3.5" />
          {t('files.rename', 'Rename')}
        </button>
        <button className={`${itemClass} !text-red-500`} onClick={() => actions.delete(entry)}>
          <TrashIcon className="w-3.5 h-3.5" />
          {t('files.delete', 'Delete')}
        </button>
        <div className={separatorClass} />
        <button className={itemClass} onClick={() => actions.copyPath(entry)}>
          <CopyIcon className="w-3.5 h-3.5" />
          {t('files.copyPath', 'Copy Path')}
        </button>
      </div>
    );
  }

  // File context menu
  return (
    <div
      style={adjustedStyle}
      className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-md shadow-lg py-1 min-w-[160px] animate-fadeIn"
      onClick={(e) => e.stopPropagation()}
    >
      <button className={itemClass} onClick={() => actions.open(entry)}>
        <FileIcon className="w-3.5 h-3.5" />
        {t('files.open', 'Open')}
      </button>
      <div className={separatorClass} />
      <button className={itemClass} onClick={() => actions.rename(entry)}>
        <EditIcon className="w-3.5 h-3.5" />
        {t('files.rename', 'Rename')}
      </button>
      <button className={`${itemClass} !text-red-500`} onClick={() => actions.delete(entry)}>
        <TrashIcon className="w-3.5 h-3.5" />
        {t('files.delete', 'Delete')}
      </button>
      <div className={separatorClass} />
      <button className={itemClass} onClick={() => actions.copyPath(entry)}>
        <CopyIcon className="w-3.5 h-3.5" />
        {t('files.copyPath', 'Copy Path')}
      </button>
    </div>
  );
}
