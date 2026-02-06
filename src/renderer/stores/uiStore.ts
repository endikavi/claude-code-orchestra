import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import i18n from 'i18next';
import type { Language, SharedContextSettings } from '@shared/types';
import { DEFAULT_SHARED_CONTEXT_SETTINGS } from '@shared/types/sharedContext';
import type {
  UISettings,
  ViewMode,
  Theme,
  CollapsedSections,
  TerminalFont,
  RepaintSettings,
  RightPanelMode,
} from '@shared/types/uiSettings';
import { DEFAULT_REPAINT_SETTINGS } from '@shared/types/uiSettings';

interface UIState extends UISettings {
  _hasHydrated: boolean;
  sidebarMobileOpen: boolean;
  showProjectModal: boolean;
  showInstanceModal: boolean;
  showSettingsModal: boolean;
  showLocalSettingsModal: boolean;
  showNotificationPanel: boolean;
  editingProject: string | null;
  localSettingsProjectPath: string | null;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLanguage: (language: Language) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;
  setShowProjectModal: (show: boolean, editingId?: string | null) => void;
  setShowInstanceModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setShowLocalSettingsModal: (show: boolean, projectPath?: string | null) => void;
  setShowNotificationPanel: (show: boolean) => void;
  toggleNotificationPanel: () => void;
  initializeFromMain: () => Promise<void>;

  // Project ordering actions
  setProjectOrder: (order: string[]) => void;
  reorderProject: (projectId: string, newIndex: number) => void;
  addProjectToOrder: (projectId: string) => void;
  removeProjectFromOrder: (projectId: string) => void;

  // Section collapse actions
  toggleSectionCollapsed: (sectionId: string) => void;
  setSectionCollapsed: (sectionId: string, collapsed: boolean) => void;

  // Terminal settings
  setTerminalFont: (font: TerminalFont) => void;
  setTmuxMode: (enabled: boolean) => void;

  // Shared context settings
  sharedContext: SharedContextSettings;
  setSharedContext: (settings: Partial<SharedContextSettings>) => void;

  // Repaint settings (experimental TUI fix)
  repaintSettings: RepaintSettings;
  setRepaintSettings: (settings: Partial<RepaintSettings>) => void;

  // Right panel
  rightPanelMode: RightPanelMode;
  setRightPanelMode: (mode: RightPanelMode) => void;
  toggleRightPanel: (panel: 'tasks' | 'teams') => void;
}

// Check if running in Electron with uiSettings API
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI && 'uiSettings' in window.electronAPI;
};

// Apply theme to DOM
const applyTheme = (theme: Theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
};

// Sync language with i18n
const syncLanguage = (language: Language) => {
  if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
};

// Save settings to main process (Electron only)
const saveToMain = (settings: Partial<UISettings>) => {
  if (isElectron()) {
    void window.electronAPI.uiSettings.update(settings);
  }
};

// Custom storage for zustand that uses IPC for Electron
const createElectronStorage = () => {
  return createJSONStorage(() => ({
    getItem: (name: string): string | null => {
      // For Electron, we load from main process separately
      // Return null here to use default state, then hydrate from main
      if (isElectron()) {
        return null;
      }
      // For web, use localStorage
      return localStorage.getItem(name);
    },
    setItem: (name: string, value: string): void => {
      // For web, save to localStorage
      if (!isElectron()) {
        localStorage.setItem(name, value);
      }
      // For Electron, we save via IPC in the actions
    },
    removeItem: (name: string): void => {
      if (!isElectron()) {
        localStorage.removeItem(name);
      }
    },
  }));
};

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      viewMode: 'terminal',
      theme: 'dark',
      language: 'en',
      sidebarWidth: 280,
      sidebarCollapsed: false,
      projectOrder: [],
      collapsedSections: { local: false, clusters: {} },
      terminalFont: 'embedded',
      sharedContext: DEFAULT_SHARED_CONTEXT_SETTINGS,
      repaintSettings: DEFAULT_REPAINT_SETTINGS,
      rightPanelMode: 'tasks' as RightPanelMode,
      tmuxMode: false,
      sidebarMobileOpen: false,
      showProjectModal: false,
      showInstanceModal: false,
      showSettingsModal: false,
      showLocalSettingsModal: false,
      showNotificationPanel: false,
      editingProject: null,
      localSettingsProjectPath: null,
      _hasHydrated: false,

      // Initialize from main process (Electron only)
      initializeFromMain: async () => {
        if (isElectron()) {
          try {
            const settings = await window.electronAPI.uiSettings.get();
            set({
              viewMode: settings.viewMode,
              theme: settings.theme,
              language: settings.language,
              sidebarWidth: settings.sidebarWidth,
              sidebarCollapsed: settings.sidebarCollapsed,
              projectOrder: settings.projectOrder || [],
              collapsedSections: settings.collapsedSections || { local: false, clusters: {} },
              terminalFont: settings.terminalFont || 'embedded',
              sharedContext: settings.sharedContext || DEFAULT_SHARED_CONTEXT_SETTINGS,
              repaintSettings: settings.repaintSettings || DEFAULT_REPAINT_SETTINGS,
              rightPanelMode: settings.rightPanelMode || 'tasks',
              tmuxMode: settings.tmuxMode ?? false,
              _hasHydrated: true,
            });
            // Apply theme and language after loading
            applyTheme(settings.theme);
            syncLanguage(settings.language);
          } catch (error) {
            console.error('Failed to load UI settings from main:', error);
            set({ _hasHydrated: true });
          }
        } else {
          set({ _hasHydrated: true });
        }
      },

      setViewMode: (mode) => {
        set({ viewMode: mode });
        saveToMain({ viewMode: mode });
      },

      toggleViewMode: () => {
        const newMode = get().viewMode === 'terminal' ? 'structured' : 'terminal';
        set({ viewMode: newMode });
        saveToMain({ viewMode: newMode });
      },

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
        saveToMain({ theme });
      },

      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        set({ theme: newTheme });
        saveToMain({ theme: newTheme });
      },

      setLanguage: (language) => {
        syncLanguage(language);
        set({ language });
        saveToMain({ language });
      },

      setSidebarWidth: (width) => {
        set({ sidebarWidth: width });
        saveToMain({ sidebarWidth: width });
      },

      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
        saveToMain({ sidebarCollapsed: collapsed });
      },

      toggleSidebar: () => {
        const collapsed = !get().sidebarCollapsed;
        set({ sidebarCollapsed: collapsed });
        saveToMain({ sidebarCollapsed: collapsed });
      },

      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),

      setShowProjectModal: (show, editingId = null) =>
        set({ showProjectModal: show, editingProject: editingId }),

      setShowInstanceModal: (show) => set({ showInstanceModal: show }),

      setShowSettingsModal: (show) => set({ showSettingsModal: show }),

      setShowLocalSettingsModal: (show, projectPath = null) =>
        set({ showLocalSettingsModal: show, localSettingsProjectPath: projectPath }),

      setShowNotificationPanel: (show) => set({ showNotificationPanel: show }),

      toggleNotificationPanel: () =>
        set((state) => ({ showNotificationPanel: !state.showNotificationPanel })),

      // Project ordering actions
      setProjectOrder: (order) => {
        set({ projectOrder: order });
        saveToMain({ projectOrder: order });
      },

      reorderProject: (projectId, newIndex) => {
        const currentOrder = get().projectOrder;
        const currentIndex = currentOrder.indexOf(projectId);

        // If project is not in order, add it at the new index
        if (currentIndex === -1) {
          const newOrder = [...currentOrder];
          newOrder.splice(newIndex, 0, projectId);
          set({ projectOrder: newOrder });
          saveToMain({ projectOrder: newOrder });
          return;
        }

        // Reorder
        const newOrder = [...currentOrder];
        newOrder.splice(currentIndex, 1);
        newOrder.splice(newIndex, 0, projectId);
        set({ projectOrder: newOrder });
        saveToMain({ projectOrder: newOrder });
      },

      addProjectToOrder: (projectId) => {
        const currentOrder = get().projectOrder;
        if (!currentOrder.includes(projectId)) {
          // Add new projects at the beginning
          const newOrder = [projectId, ...currentOrder];
          set({ projectOrder: newOrder });
          saveToMain({ projectOrder: newOrder });
        }
      },

      removeProjectFromOrder: (projectId) => {
        const currentOrder = get().projectOrder;
        const newOrder = currentOrder.filter((id) => id !== projectId);
        set({ projectOrder: newOrder });
        saveToMain({ projectOrder: newOrder });
      },

      // Section collapse actions
      toggleSectionCollapsed: (sectionId) => {
        const currentSections = get().collapsedSections;
        let newSections: CollapsedSections;

        if (sectionId === 'local') {
          newSections = { ...currentSections, local: !currentSections.local };
        } else {
          // It's a cluster section
          newSections = {
            ...currentSections,
            clusters: {
              ...currentSections.clusters,
              [sectionId]: !currentSections.clusters[sectionId],
            },
          };
        }

        set({ collapsedSections: newSections });
        saveToMain({ collapsedSections: newSections });
      },

      setSectionCollapsed: (sectionId, collapsed) => {
        const currentSections = get().collapsedSections;
        let newSections: CollapsedSections;

        if (sectionId === 'local') {
          newSections = { ...currentSections, local: collapsed };
        } else {
          newSections = {
            ...currentSections,
            clusters: {
              ...currentSections.clusters,
              [sectionId]: collapsed,
            },
          };
        }

        set({ collapsedSections: newSections });
        saveToMain({ collapsedSections: newSections });
      },

      // Terminal settings
      setTerminalFont: (font) => {
        set({ terminalFont: font });
        saveToMain({ terminalFont: font });
      },

      setTmuxMode: (enabled) => {
        set({ tmuxMode: enabled });
        saveToMain({ tmuxMode: enabled });
      },

      // Shared context settings
      setSharedContext: (settings) => {
        const current = get().sharedContext;
        const updated = { ...current, ...settings };
        set({ sharedContext: updated });
        saveToMain({ sharedContext: updated });
      },

      // Repaint settings (experimental TUI fix)
      setRepaintSettings: (settings) => {
        const current = get().repaintSettings;
        const updated = { ...current, ...settings };
        set({ repaintSettings: updated });
        saveToMain({ repaintSettings: updated });
      },

      // Right panel
      setRightPanelMode: (mode) => {
        set({ rightPanelMode: mode });
        saveToMain({ rightPanelMode: mode });
      },

      toggleRightPanel: (panel) => {
        const current = get().rightPanelMode;
        const newMode: RightPanelMode = current === panel ? 'none' : panel;
        set({ rightPanelMode: newMode });
        saveToMain({ rightPanelMode: newMode });
      },
    }),
    {
      name: 'claude-code-orchestra-ui',
      storage: createElectronStorage(),
      partialize: (state) => ({
        viewMode: state.viewMode,
        theme: state.theme,
        language: state.language,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        projectOrder: state.projectOrder,
        collapsedSections: state.collapsedSections,
        terminalFont: state.terminalFont,
        sharedContext: state.sharedContext,
        repaintSettings: state.repaintSettings,
        rightPanelMode: state.rightPanelMode,
        tmuxMode: state.tmuxMode,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && !isElectron()) {
          // For web version, apply theme and language after localStorage hydration
          applyTheme(state.theme);
          syncLanguage(state.language);
          useUIStore.setState({ _hasHydrated: true });
        }
      },
    }
  )
);
