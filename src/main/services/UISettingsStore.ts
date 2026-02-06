import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { UISettings } from '@shared/types/uiSettings';
import { DEFAULT_REPAINT_SETTINGS } from '@shared/types/uiSettings';
import { DEFAULT_SHARED_CONTEXT_SETTINGS } from '@shared/types/sharedContext';

export type { UISettings } from '@shared/types/uiSettings';

const DEFAULT_SETTINGS: UISettings = {
  viewMode: 'terminal',
  theme: 'dark',
  language: 'en',
  sidebarWidth: 280,
  sidebarCollapsed: false,
  projectOrder: [],
  collapsedSections: {
    local: false,
    clusters: {},
  },
  terminalFont: 'embedded',
  sharedContext: DEFAULT_SHARED_CONTEXT_SETTINGS,
  repaintSettings: DEFAULT_REPAINT_SETTINGS,
  rightPanelMode: 'tasks',
  tmuxMode: false,
};

export class UISettingsStore {
  private static instance: UISettingsStore | null = null;
  private filePath: string;
  private settings: UISettings;

  private constructor() {
    // Store in user data directory
    const userDataPath = app.getPath('userData');
    this.filePath = path.join(userDataPath, 'ui-settings.json');
    this.settings = this.loadFromDisk();
  }

  public static getInstance(): UISettingsStore {
    if (!UISettingsStore.instance) {
      UISettingsStore.instance = new UISettingsStore();
    }
    return UISettingsStore.instance;
  }

  private loadFromDisk(): UISettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data) as Partial<UISettings>;
        // Merge with defaults to ensure all fields exist
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('[UISettingsStore] Failed to load settings:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (error) {
      console.error('[UISettingsStore] Failed to save settings:', error);
    }
  }

  getSettings(): UISettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<UISettings>): UISettings {
    this.settings = { ...this.settings, ...updates };
    this.saveToDisk();
    return this.getSettings();
  }

  resetSettings(): UISettings {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveToDisk();
    return this.getSettings();
  }
}
