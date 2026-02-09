import { DataStore } from './DataStore';
import type { IdeWorkspaceFolder, IdeOpenEditor, IdeDiagnostic } from '@shared/types/ide';

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  py: 'python',
  json: 'json',
  md: 'markdown',
  css: 'css',
  html: 'html',
};

function inferLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext';
}

class IdeStateManager {
  private static instance: IdeStateManager | null = null;
  private openEditors: IdeOpenEditor[] = [];

  private constructor() {}

  static getInstance(): IdeStateManager {
    if (!IdeStateManager.instance) {
      IdeStateManager.instance = new IdeStateManager();
    }
    return IdeStateManager.instance;
  }

  getWorkspaceFolders(): IdeWorkspaceFolder[] {
    const projects = DataStore.getInstance().getAllProjects();
    return projects.map((project) => ({
      uri: `file://${project.path}`,
      name: project.name,
    }));
  }

  getOpenEditors(): IdeOpenEditor[] {
    return this.openEditors;
  }

  addOpenEditor(filePath: string, languageId?: string): void {
    const uri = `file://${filePath}`;
    const existing = this.openEditors.find((e) => e.uri === uri);

    // Mark all editors as inactive
    for (const editor of this.openEditors) {
      editor.isActive = false;
    }

    if (existing) {
      existing.isActive = true;
    } else {
      this.openEditors.push({
        uri,
        languageId: languageId ?? inferLanguageId(filePath),
        isActive: true,
      });
    }
  }

  setActiveEditor(filePath: string): void {
    const uri = `file://${filePath}`;
    for (const editor of this.openEditors) {
      editor.isActive = editor.uri === uri;
    }
  }

  removeOpenEditor(filePath: string): void {
    const uri = `file://${filePath}`;
    this.openEditors = this.openEditors.filter((e) => e.uri !== uri);
  }

  getCurrentSelection(): { text: string; filePath: string } {
    return { text: '', filePath: '' };
  }

  getDiagnostics(): IdeDiagnostic[] {
    return [];
  }
}

export function getIdeStateManager(): IdeStateManager {
  return IdeStateManager.getInstance();
}
