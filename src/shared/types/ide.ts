export interface IdeLockFile {
  pid: number;
  port: number;
  auth: string;
  version: 1;
}

export interface IdeOpenFileParams {
  filePath: string;
  line?: number;
  column?: number;
  preview?: boolean;
}

export interface IdeOpenDiffParams {
  filePath: string;
  oldContent: string;
  newContent: string;
  tab_name?: string;
}

export interface IdeWorkspaceFolder {
  uri: string; // file:// URI
  name: string;
}

export interface IdeOpenEditor {
  uri: string;
  languageId: string;
  isActive: boolean;
}

export interface IdeDiagnostic {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
}

// IPC events
export interface IdeFileOpenEvent {
  filePath: string;
  line?: number;
  column?: number;
}

export interface IdeDiffRequestEvent {
  requestId: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  tab_name?: string;
}
