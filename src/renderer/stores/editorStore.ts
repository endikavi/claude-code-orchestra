import { create } from 'zustand';
import { getLanguageFromPath } from '@renderer/utils/languageDetection';
import { showToast } from './toastStore';

interface OpenFile {
  relativePath: string;
  projectPath: string;
  content: string;
  originalContent: string; // for dirty detection
  language: string; // Monaco language ID
}

interface EditorState {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  pendingClose: { relativePath: string } | null;

  // Actions
  openFile: (projectPath: string, relativePath: string) => Promise<void>;
  closeFile: (relativePath: string) => void;
  forceCloseFile: (relativePath: string) => void;
  confirmClose: (action: 'save' | 'discard' | 'cancel') => Promise<void>;
  setActiveFile: (relativePath: string) => void;
  updateContent: (relativePath: string, content: string) => void;
  saveFile: (relativePath: string) => Promise<boolean>;
  isFileDirty: (relativePath: string) => boolean;
  handleFileRenamed: (oldPath: string, newPath: string) => void;
  handleFileDeleted: (relativePath: string) => void;
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  openFiles: [],
  activeFilePath: null,
  pendingClose: null,

  openFile: async (projectPath: string, relativePath: string) => {
    // If already open, just set as active
    const existing = get().openFiles.find((f) => f.relativePath === relativePath);
    if (existing) {
      set({ activeFilePath: relativePath });
      return;
    }

    try {
      const result = await window.electronAPI.files.readFile(projectPath, relativePath);

      // Don't open binary files or files that couldn't be read
      if (result.isBinary || result.content === null) {
        return;
      }

      const language = getLanguageFromPath(relativePath);

      set((state) => ({
        openFiles: [
          ...state.openFiles,
          {
            relativePath,
            projectPath,
            content: result.content!,
            originalContent: result.content!,
            language,
          },
        ],
        activeFilePath: relativePath,
      }));
    } catch (error) {
      console.error('[EditorStore] Error opening file:', error);
    }
  },

  closeFile: (relativePath: string) => {
    // If file is dirty, prompt for save instead of closing directly
    if (get().isFileDirty(relativePath)) {
      set({ pendingClose: { relativePath } });
      return;
    }
    get().forceCloseFile(relativePath);
  },

  forceCloseFile: (relativePath: string) => {
    set((state) => {
      const filtered = state.openFiles.filter((f) => f.relativePath !== relativePath);
      let newActive = state.activeFilePath;

      if (state.activeFilePath === relativePath) {
        // Set active to the last remaining file, or null
        newActive = filtered.length > 0 ? filtered[filtered.length - 1].relativePath : null;
      }

      return { openFiles: filtered, activeFilePath: newActive, pendingClose: null };
    });
  },

  confirmClose: async (action: 'save' | 'discard' | 'cancel') => {
    const { pendingClose } = get();
    if (!pendingClose) return;

    if (action === 'cancel') {
      set({ pendingClose: null });
      return;
    }

    if (action === 'save') {
      await get().saveFile(pendingClose.relativePath);
    }

    get().forceCloseFile(pendingClose.relativePath);
  },

  setActiveFile: (relativePath: string) => {
    set({ activeFilePath: relativePath });
  },

  updateContent: (relativePath: string, content: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.relativePath === relativePath ? { ...f, content } : f
      ),
    }));
  },

  saveFile: async (relativePath: string) => {
    const file = get().openFiles.find((f) => f.relativePath === relativePath);
    if (!file) return false;

    try {
      const result = await window.electronAPI.files.writeFile(
        file.projectPath,
        relativePath,
        file.content
      );

      if (result.success) {
        set((state) => ({
          openFiles: state.openFiles.map((f) =>
            f.relativePath === relativePath ? { ...f, originalContent: f.content } : f
          ),
        }));
        showToast('success', 'File saved successfully');
        return true;
      }

      showToast('error', 'Failed to save file');
      return false;
    } catch (error) {
      console.error('[EditorStore] Error saving file:', error);
      showToast('error', 'Failed to save file');
      return false;
    }
  },

  isFileDirty: (relativePath: string) => {
    const file = get().openFiles.find((f) => f.relativePath === relativePath);
    if (!file) return false;
    return file.content !== file.originalContent;
  },

  handleFileRenamed: (oldPath: string, newPath: string) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.relativePath === oldPath
          ? { ...f, relativePath: newPath, language: getLanguageFromPath(newPath) }
          : f
      ),
      activeFilePath: state.activeFilePath === oldPath ? newPath : state.activeFilePath,
    }));
  },

  handleFileDeleted: (relativePath: string) => {
    // Reuse closeFile logic
    get().closeFile(relativePath);
  },
}));
