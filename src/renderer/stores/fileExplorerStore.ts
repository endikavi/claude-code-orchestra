import { create } from 'zustand';
import type { FileTreeEntry, GitFileEntry } from '@shared/types';

interface FileExplorerState {
  // Root entries per project path
  trees: Record<string, FileTreeEntry[]>;
  // Expanded directories per project path
  expandedDirs: Record<string, Record<string, boolean>>;
  // Git changed files per project path
  gitFiles: Record<string, GitFileEntry[]>;
  // Highlighted file path per project
  highlightedFile: Record<string, string | null>;
  // Search query per project
  searchQuery: Record<string, string>;
  // All files for quick open (flat list per project)
  allFiles: Record<string, string[]>;
  // Loading states
  isLoading: boolean;
  directoryLoading: Record<string, boolean>;

  // Actions
  setSearchQuery: (projectPath: string, query: string) => void;
  clearSearch: (projectPath: string) => void;
  loadRootDirectory: (projectPath: string) => Promise<void>;
  loadAllFiles: (projectPath: string) => Promise<void>;
  expandDirectory: (projectPath: string, dirPath: string) => Promise<void>;
  collapseDirectory: (projectPath: string, dirPath: string) => void;
  toggleDirectory: (projectPath: string, dirPath: string) => Promise<void>;
  updateGitStatus: (projectPath: string, files: GitFileEntry[]) => void;
  clearProject: (projectPath: string) => void;
  revealFile: (projectPath: string, filePath: string) => Promise<void>;
}

export const useFileExplorerStore = create<FileExplorerState>()((set, get) => ({
  trees: {},
  expandedDirs: {},
  gitFiles: {},
  highlightedFile: {},
  searchQuery: {},
  allFiles: {},
  isLoading: false,
  directoryLoading: {},

  setSearchQuery: (projectPath: string, query: string) => {
    set((state) => ({
      searchQuery: { ...state.searchQuery, [projectPath]: query },
    }));
  },

  clearSearch: (projectPath: string) => {
    set((state) => {
      const { [projectPath]: _, ...rest } = state.searchQuery;
      return { searchQuery: rest };
    });
  },

  loadRootDirectory: async (projectPath: string) => {
    if (!projectPath) return;

    set({ isLoading: true });
    try {
      const result = await window.electronAPI.files.listDirectory(projectPath, '');
      set((state) => ({
        trees: { ...state.trees, [projectPath]: result.entries },
        isLoading: false,
      }));
    } catch (error) {
      console.error('[FileExplorerStore] Error loading root directory:', error);
      set({ isLoading: false });
    }
  },

  loadAllFiles: async (projectPath: string) => {
    if (!projectPath) return;
    try {
      const files = await window.electronAPI.files.glob(projectPath);
      set((state) => ({
        allFiles: { ...state.allFiles, [projectPath]: files },
      }));
    } catch (error) {
      console.error('[FileExplorerStore] Error loading all files:', error);
    }
  },

  expandDirectory: async (projectPath: string, dirPath: string) => {
    set((state) => ({
      expandedDirs: {
        ...state.expandedDirs,
        [projectPath]: { ...state.expandedDirs[projectPath], [dirPath]: true },
      },
      directoryLoading: { ...state.directoryLoading, [dirPath]: true },
    }));

    try {
      const result = await window.electronAPI.files.listDirectory(projectPath, dirPath);

      set((state) => {
        // Find and update the directory node in the tree
        const tree = [...(state.trees[projectPath] || [])];
        const updatedTree = updateTreeNode(tree, dirPath, result.entries);

        return {
          trees: { ...state.trees, [projectPath]: updatedTree },
          directoryLoading: { ...state.directoryLoading, [dirPath]: false },
        };
      });
    } catch (error) {
      console.error('[FileExplorerStore] Error expanding directory:', error);
      set((state) => ({
        directoryLoading: { ...state.directoryLoading, [dirPath]: false },
      }));
    }
  },

  collapseDirectory: (projectPath: string, dirPath: string) => {
    set((state) => ({
      expandedDirs: {
        ...state.expandedDirs,
        [projectPath]: { ...state.expandedDirs[projectPath], [dirPath]: false },
      },
    }));
  },

  toggleDirectory: async (projectPath: string, dirPath: string) => {
    const isExpanded = get().expandedDirs[projectPath]?.[dirPath];
    if (isExpanded) {
      get().collapseDirectory(projectPath, dirPath);
    } else {
      await get().expandDirectory(projectPath, dirPath);
    }
  },

  updateGitStatus: (projectPath: string, files: GitFileEntry[]) => {
    set((state) => ({
      gitFiles: { ...state.gitFiles, [projectPath]: files },
    }));
  },

  clearProject: (projectPath: string) => {
    set((state) => {
      const { [projectPath]: _t, ...trees } = state.trees;
      const { [projectPath]: _e, ...expandedDirs } = state.expandedDirs;
      const { [projectPath]: _g, ...gitFiles } = state.gitFiles;
      return { trees, expandedDirs, gitFiles };
    });
  },

  revealFile: async (projectPath: string, filePath: string) => {
    // Compute parent directories to expand
    const parts = filePath.split('/');
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? current + '/' + parts[i] : parts[i];
      const isExpanded = get().expandedDirs[projectPath]?.[current];
      if (!isExpanded) {
        await get().expandDirectory(projectPath, current);
      }
    }

    // Set highlighted file
    set((state) => ({
      highlightedFile: { ...state.highlightedFile, [projectPath]: filePath },
    }));

    // Auto-clear highlight after 3 seconds
    setTimeout(() => {
      set((state) => {
        if (state.highlightedFile[projectPath] === filePath) {
          return { highlightedFile: { ...state.highlightedFile, [projectPath]: null } };
        }
        return state;
      });
    }, 3000);
  },
}));

/**
 * Recursively update a tree node's children by path
 */
function updateTreeNode(
  tree: FileTreeEntry[],
  targetPath: string,
  children: FileTreeEntry[]
): FileTreeEntry[] {
  return tree.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children };
    }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return {
        ...node,
        children: updateTreeNode(node.children, targetPath, children),
      };
    }
    return node;
  });
}
