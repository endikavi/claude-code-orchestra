import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useUIStore } from './uiStore';

// Mock i18next
vi.mock('i18next', () => ({
  default: {
    language: 'en',
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  },
}));

// Store original electronAPI
const originalElectronAPI = window.electronAPI;

describe('uiStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useUIStore.setState({
      viewMode: 'terminal',
      theme: 'dark',
      language: 'en',
      sidebarWidth: 280,
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      showProjectModal: false,
      showInstanceModal: false,
      showSettingsModal: false,
      editingProject: null,
      _hasHydrated: false,
    });

    // Reset mocks
    vi.clearAllMocks();

    // Reset DOM state
    document.documentElement.classList.remove('dark');

    // Restore electronAPI to original state
    window.electronAPI = originalElectronAPI;
  });

  afterEach(() => {
    // Restore electronAPI after each test
    window.electronAPI = originalElectronAPI;
  });

  describe('initial state', () => {
    it('should have terminal as default view mode', () => {
      const state = useUIStore.getState();
      expect(state.viewMode).toBe('terminal');
    });

    it('should have dark as default theme', () => {
      const state = useUIStore.getState();
      expect(state.theme).toBe('dark');
    });

    it('should have en as default language', () => {
      const state = useUIStore.getState();
      expect(state.language).toBe('en');
    });

    it('should have 280 as default sidebar width', () => {
      const state = useUIStore.getState();
      expect(state.sidebarWidth).toBe(280);
    });

    it('should have sidebar not collapsed by default', () => {
      const state = useUIStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
    });

    it('should have all modals closed by default', () => {
      const state = useUIStore.getState();
      expect(state.showProjectModal).toBe(false);
      expect(state.showInstanceModal).toBe(false);
      expect(state.showSettingsModal).toBe(false);
    });
  });

  describe('setViewMode', () => {
    it('should set view mode to structured', () => {
      useUIStore.getState().setViewMode('structured');
      expect(useUIStore.getState().viewMode).toBe('structured');
    });

    it('should set view mode to terminal', () => {
      useUIStore.setState({ viewMode: 'structured' });
      useUIStore.getState().setViewMode('terminal');
      expect(useUIStore.getState().viewMode).toBe('terminal');
    });
  });

  describe('toggleViewMode', () => {
    it('should toggle from terminal to structured', () => {
      useUIStore.getState().toggleViewMode();
      expect(useUIStore.getState().viewMode).toBe('structured');
    });

    it('should toggle from structured to terminal', () => {
      useUIStore.setState({ viewMode: 'structured' });
      useUIStore.getState().toggleViewMode();
      expect(useUIStore.getState().viewMode).toBe('terminal');
    });
  });

  describe('setTheme', () => {
    it('should set theme to light', () => {
      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('should set theme to dark', () => {
      useUIStore.setState({ theme: 'light' });
      useUIStore.getState().setTheme('dark');
      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('should apply dark class to document when theme is dark', () => {
      useUIStore.getState().setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should remove dark class from document when theme is light', () => {
      document.documentElement.classList.add('dark');
      useUIStore.getState().setTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from dark to light', () => {
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('should toggle from light to dark', () => {
      useUIStore.setState({ theme: 'light' });
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('should apply correct class on toggle', () => {
      document.documentElement.classList.add('dark');
      useUIStore.getState().toggleTheme(); // dark -> light
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      useUIStore.getState().toggleTheme(); // light -> dark
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('setLanguage', () => {
    it('should set language to es', () => {
      useUIStore.getState().setLanguage('es');
      expect(useUIStore.getState().language).toBe('es');
    });

    it('should set language to en', () => {
      useUIStore.setState({ language: 'es' });
      useUIStore.getState().setLanguage('en');
      expect(useUIStore.getState().language).toBe('en');
    });
  });

  describe('sidebar operations', () => {
    it('setSidebarWidth should update width', () => {
      useUIStore.getState().setSidebarWidth(350);
      expect(useUIStore.getState().sidebarWidth).toBe(350);
    });

    it('setSidebarCollapsed should update collapsed state', () => {
      useUIStore.getState().setSidebarCollapsed(true);
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    });

    it('toggleSidebar should toggle collapsed state', () => {
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });

    it('setSidebarMobileOpen should update mobile open state', () => {
      useUIStore.getState().setSidebarMobileOpen(true);
      expect(useUIStore.getState().sidebarMobileOpen).toBe(true);
    });
  });

  describe('modal operations', () => {
    it('setShowProjectModal should toggle project modal', () => {
      useUIStore.getState().setShowProjectModal(true);
      expect(useUIStore.getState().showProjectModal).toBe(true);

      useUIStore.getState().setShowProjectModal(false);
      expect(useUIStore.getState().showProjectModal).toBe(false);
    });

    it('setShowProjectModal should set editing project id', () => {
      useUIStore.getState().setShowProjectModal(true, 'proj-123');
      expect(useUIStore.getState().showProjectModal).toBe(true);
      expect(useUIStore.getState().editingProject).toBe('proj-123');
    });

    it('setShowProjectModal should clear editing project when not provided', () => {
      useUIStore.setState({ editingProject: 'proj-123' });
      useUIStore.getState().setShowProjectModal(true);
      expect(useUIStore.getState().editingProject).toBeNull();
    });

    it('setShowInstanceModal should toggle instance modal', () => {
      useUIStore.getState().setShowInstanceModal(true);
      expect(useUIStore.getState().showInstanceModal).toBe(true);

      useUIStore.getState().setShowInstanceModal(false);
      expect(useUIStore.getState().showInstanceModal).toBe(false);
    });

    it('setShowSettingsModal should toggle settings modal', () => {
      useUIStore.getState().setShowSettingsModal(true);
      expect(useUIStore.getState().showSettingsModal).toBe(true);

      useUIStore.getState().setShowSettingsModal(false);
      expect(useUIStore.getState().showSettingsModal).toBe(false);
    });
  });

  describe('initializeFromMain', () => {
    it('should set _hasHydrated to true in non-electron environment', async () => {
      // Temporarily remove electronAPI to simulate non-electron
      const tempAPI = window.electronAPI;
      // @ts-expect-error - deliberately setting to simulate non-electron
      window.electronAPI = undefined;

      await useUIStore.getState().initializeFromMain();

      expect(useUIStore.getState()._hasHydrated).toBe(true);

      // Restore
      window.electronAPI = tempAPI;
    });

    it('should load settings from main in electron environment', async () => {
      const mockSettings = {
        viewMode: 'structured' as const,
        theme: 'light' as const,
        language: 'es' as const,
        sidebarWidth: 300,
        sidebarCollapsed: true,
      };

      // Mock electronAPI with uiSettings
      window.electronAPI = {
        ...window.electronAPI,
        uiSettings: {
          get: vi.fn().mockResolvedValue(mockSettings),
          update: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      await useUIStore.getState().initializeFromMain();

      const state = useUIStore.getState();
      expect(state.viewMode).toBe('structured');
      expect(state.theme).toBe('light');
      expect(state.language).toBe('es');
      expect(state.sidebarWidth).toBe(300);
      expect(state.sidebarCollapsed).toBe(true);
      expect(state._hasHydrated).toBe(true);
    });

    it('should handle errors when loading from main', async () => {
      // Mock electronAPI with failing uiSettings
      window.electronAPI = {
        ...window.electronAPI,
        uiSettings: {
          get: vi.fn().mockRejectedValue(new Error('Failed to load')),
          update: vi.fn().mockResolvedValue(undefined),
        },
      } as typeof window.electronAPI;

      // Should not throw
      await useUIStore.getState().initializeFromMain();

      // Should still mark as hydrated
      expect(useUIStore.getState()._hasHydrated).toBe(true);
    });
  });
});
