import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon, FileIcon } from '@renderer/components/icons';
import { useUIStore } from '@renderer/stores/uiStore';
import { useFileExplorerStore } from '@renderer/stores/fileExplorerStore';
import { useEditorStore } from '@renderer/stores/editorStore';
import { useProjectStore } from '@renderer/stores/projectStore';
import { fuzzySort } from '@renderer/utils/fuzzyMatch';
import { Spinner } from '@renderer/components/common/Spinner';

const MAX_RESULTS = 15;

function HighlightedText({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;

  const indexSet = new Set(indices);
  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let current = '';
  let isHighlighted = false;

  for (let i = 0; i < text.length; i++) {
    const shouldHighlight = indexSet.has(i);
    if (shouldHighlight !== isHighlighted) {
      if (current) parts.push({ text: current, highlighted: isHighlighted });
      current = '';
      isHighlighted = shouldHighlight;
    }
    current += text[i];
  }
  if (current) parts.push({ text: current, highlighted: isHighlighted });

  return (
    <>
      {parts.map((part, i) =>
        part.highlighted ? (
          <span key={i} className="text-primary font-semibold">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

export function QuickOpen() {
  const { t } = useTranslation();
  const setShowQuickOpen = useUIStore((s) => s.setShowQuickOpen);
  const allFiles = useFileExplorerStore((s) => s.allFiles);
  const loadAllFiles = useFileExplorerStore((s) => s.loadAllFiles);
  const openFile = useEditorStore((s) => s.openFile);
  const projects = useProjectStore((s) => s.projects);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );
  const projectPath = selectedProject?.path || '';

  // Load files on mount
  useEffect(() => {
    if (projectPath && !allFiles[projectPath]) {
      setIsLoading(true);
      loadAllFiles(projectPath).finally(() => setIsLoading(false));
    }
  }, [projectPath, allFiles, loadAllFiles]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const files = allFiles[projectPath] || [];

  const results = useMemo(() => {
    const sorted = fuzzySort(files, query, (f) => f);
    return sorted.slice(0, MAX_RESULTS);
  }, [files, query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const close = useCallback(() => {
    setShowQuickOpen(false);
  }, [setShowQuickOpen]);

  const openSelected = useCallback(() => {
    const result = results[selectedIndex];
    if (result && projectPath) {
      openFile(projectPath, result.item);
      close();
    }
  }, [results, selectedIndex, projectPath, openFile, close]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          openSelected();
          break;
      }
    },
    [close, results.length, openSelected]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(value);
    }, 50);
    // Update the input immediately for responsiveness
    e.target.value = value;
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const getFileName = (filePath: string) => {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  };

  const getDirPath = (filePath: string) => {
    const parts = filePath.split('/');
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/');
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[70] flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-lg shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center px-3 border-b border-neutral-200 dark:border-neutral-700">
          <SearchIcon className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={t('quickOpen.placeholder')}
            className="w-full px-3 py-3 bg-transparent text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 outline-none"
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
              <Spinner size="sm" />
              {t('quickOpen.loading')}
            </div>
          ) : results.length === 0 && query ? (
            <div className="py-8 text-center text-sm text-neutral-400">
              {t('quickOpen.noResults')}
            </div>
          ) : (
            results.map((result, index) => {
              const fileName = getFileName(result.item);
              const dirPath = getDirPath(result.item);
              // Calculate indices for file name portion only
              const fileNameStart = result.item.length - fileName.length;
              const fileIndices = result.indices
                .filter((i) => i >= fileNameStart)
                .map((i) => i - fileNameStart);

              return (
                <div
                  key={result.item}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${
                    index === selectedIndex
                      ? 'bg-primary/10 text-neutral-900 dark:text-neutral-100'
                      : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                  onClick={() => {
                    setSelectedIndex(index);
                    openFile(projectPath, result.item);
                    close();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <FileIcon className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="text-sm truncate">
                    <HighlightedText text={fileName} indices={fileIndices} />
                  </span>
                  {dirPath && (
                    <span className="text-xs text-neutral-400 truncate ml-auto shrink-0">
                      {dirPath}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
