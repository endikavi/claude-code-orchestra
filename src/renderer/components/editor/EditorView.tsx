import { useCallback } from 'react';
import { useEditorStore } from '@renderer/stores/editorStore';
import { MonacoEditor } from './MonacoEditor';
import { EmptyState } from '@renderer/components/common/EmptyState';
import { FileIcon } from '@renderer/components/icons';

export function EditorView() {
  const openFiles = useEditorStore((s) => s.openFiles);
  const activeFilePath = useEditorStore((s) => s.activeFilePath);
  const updateContent = useEditorStore((s) => s.updateContent);
  const saveFile = useEditorStore((s) => s.saveFile);
  const isFileDirty = useEditorStore((s) => s.isFileDirty);

  const activeFile = openFiles.find((f) => f.relativePath === activeFilePath);

  const handleChange = useCallback(
    (value: string) => {
      if (activeFilePath) {
        updateContent(activeFilePath, value);
      }
    },
    [activeFilePath, updateContent]
  );

  const handleSave = useCallback(() => {
    if (activeFilePath) {
      saveFile(activeFilePath);
    }
  }, [activeFilePath, saveFile]);

  if (!activeFile) {
    return (
      <EmptyState
        icon={<FileIcon className="w-12 h-12 text-neutral-400" />}
        title="No file open"
        description="Select a file from the explorer to start editing"
      />
    );
  }

  const dirty = isFileDirty(activeFile.relativePath);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <MonacoEditor
          content={activeFile.content}
          language={activeFile.language}
          onChange={handleChange}
          onSave={handleSave}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
        <span className="truncate">{activeFile.relativePath}</span>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {dirty && (
            <span className="flex items-center gap-1 text-amber-500">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Modified
            </span>
          )}
          <span>{activeFile.language}</span>
        </div>
      </div>
    </div>
  );
}
