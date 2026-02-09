/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll } from 'vitest';

// Mock Electron IPC for renderer tests
const mockElectronAPI = {
  project: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn(),
  },
  instance: {
    create: vi.fn(),
    kill: vi.fn(),
    sendInput: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    getByProject: vi.fn().mockResolvedValue([]),
    onOutput: vi.fn().mockReturnValue(vi.fn()),
    onStatusChange: vi.fn().mockReturnValue(vi.fn()),
    onStatus: vi.fn().mockReturnValue(vi.fn()),
    onError: vi.fn().mockReturnValue(vi.fn()),
    onExit: vi.fn().mockReturnValue(vi.fn()),
    onRawOutput: vi.fn().mockReturnValue(vi.fn()),
    onSessionId: vi.fn().mockReturnValue(vi.fn()),
    onSync: vi.fn().mockReturnValue(vi.fn()),
    resize: vi.fn(),
    resume: vi.fn(),
  },
  session: {
    getCount: vi.fn().mockResolvedValue(0),
    getAvailable: vi.fn().mockResolvedValue([]),
    importBatch: vi.fn().mockResolvedValue({ imported: 0, failed: 0, errors: [] }),
  },
  conversation: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getByProject: vi.fn().mockResolvedValue([]),
    getById: vi.fn(),
    addMessage: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
  },
  config: {
    getClaudeSettings: vi.fn().mockResolvedValue({}),
    getMcpServers: vi.fn().mockResolvedValue({}),
  },
  dialog: {
    selectDirectory: vi.fn(),
  },
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
  },
  uiSettings: {
    get: vi.fn().mockResolvedValue({
      viewMode: 'terminal',
      theme: 'dark',
      language: 'en',
      sidebarWidth: 280,
      sidebarCollapsed: false,
    }),
    update: vi.fn().mockResolvedValue(undefined),
  },
  shell: {
    create: vi.fn(),
    kill: vi.fn(),
    sendInput: vi.fn(),
    resize: vi.fn(),
    onRawOutput: vi.fn().mockReturnValue(vi.fn()),
    onStatus: vi.fn().mockReturnValue(vi.fn()),
    onExit: vi.fn().mockReturnValue(vi.fn()),
  },
  metrics: {
    getToolUsage: vi.fn().mockResolvedValue([]),
    getSessions: vi.fn().mockResolvedValue([]),
    getProjectSummary: vi.fn().mockResolvedValue(null),
    getTimeSeries: vi.fn().mockResolvedValue(null),
    getDashboardSummary: vi.fn().mockResolvedValue(null),
    getCostBreakdown: vi.fn().mockResolvedValue(null),
    getUsageTrends: vi.fn().mockResolvedValue(null),
    clear: vi.fn().mockResolvedValue(undefined),
  },
  git: {
    getStatus: vi.fn().mockResolvedValue(null),
    refresh: vi.fn().mockResolvedValue(null),
    onStatusChanged: vi.fn().mockReturnValue(vi.fn()),
  },
  permission: {
    getConfig: vi.fn().mockResolvedValue(null),
    setConfig: vi.fn().mockResolvedValue(undefined),
    addRule: vi.fn().mockResolvedValue(null),
    updateRule: vi.fn().mockResolvedValue(null),
    removeRule: vi.fn().mockResolvedValue(false),
    getLog: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue(null),
    clearLog: vi.fn().mockResolvedValue(undefined),
  },
  notification: {
    getAll: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ total: 0, unread: 0, byType: {}, byPriority: {} }),
    getPreferences: vi.fn().mockResolvedValue(null),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
    setPreferences: vi.fn().mockResolvedValue(undefined),
    onNew: vi.fn().mockReturnValue(vi.fn()),
    onUpdated: vi.fn().mockReturnValue(vi.fn()),
    onDismissed: vi.fn().mockReturnValue(vi.fn()),
    onDeleted: vi.fn().mockReturnValue(vi.fn()),
    onAllRead: vi.fn().mockReturnValue(vi.fn()),
    onCleared: vi.fn().mockReturnValue(vi.fn()),
  },
};

// Attach to window for renderer process tests (skip in node environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true,
  });

  // Mock matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock ResizeObserver
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
}

// Suppress console errors in tests unless explicitly needed
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
