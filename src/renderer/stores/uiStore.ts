import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import i18n from 'i18next';
import type { Language } from '@shared/types';
import type { UISettings, ViewMode, Theme } from '@shared/types/uiSettings';

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
