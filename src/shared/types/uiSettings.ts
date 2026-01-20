import type { Language } from './index';

export type ViewMode = 'terminal' | 'structured';
export type Theme = 'dark' | 'light';

export interface CollapsedSections {
  local: boolean;
  clusters: Record<string, boolean>; // nodeId -> collapsed
}

export interface UISettings {
  viewMode: ViewMode;
  theme: Theme;
  language: Language;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  projectOrder: string[]; // IDs of local projects in custom order
  collapsedSections: CollapsedSections;
}
