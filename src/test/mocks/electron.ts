import { vi } from 'vitest';

export const mockApp = {
  getPath: vi.fn((name: string) => {
    switch (name) {
      case 'userData':
        return '/mock/userData';
      case 'home':
        return '/mock/home';
      default:
        return `/mock/${name}`;
    }
  }),
  getVersion: vi.fn(() => '1.0.0'),
  getName: vi.fn(() => 'claude-code-orchestra'),
  quit: vi.fn(),
  on: vi.fn(),
  whenReady: vi.fn().mockResolvedValue(undefined),
};

export const mockBrowserWindow = vi.fn().mockImplementation(() => ({
  loadURL: vi.fn(),
  loadFile: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  webContents: {
    send: vi.fn(),
    on: vi.fn(),
    openDevTools: vi.fn(),
  },
  show: vi.fn(),
  hide: vi.fn(),
  close: vi.fn(),
  minimize: vi.fn(),
  maximize: vi.fn(),
  isMaximized: vi.fn(() => false),
  unmaximize: vi.fn(),
}));

export const mockIpcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  removeHandler: vi.fn(),
  removeAllListeners: vi.fn(),
};

export const mockIpcRenderer = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
};

export const mockDialog = {
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/mock/path'] }),
  showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: '/mock/save/path' }),
  showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
};

// Default export for vi.mock('electron')
export default {
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  ipcRenderer: mockIpcRenderer,
  dialog: mockDialog,
};
