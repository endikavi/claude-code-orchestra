import type { Language } from './index';

export type ViewMode = 'terminal' | 'structured';
export type Theme = 'dark' | 'light';

export interface UISettings {
  viewMode: ViewMode;
  theme: Theme;
  language: Language;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}
