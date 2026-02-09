export interface TmuxSession {
  sessionName: string;
  workingDirectory: string;
  createdAt: number; // ms timestamp
  isAttached: boolean;
  isOrchestraSession: boolean; // name starts with "orchestra-"
  windowCount: number;
}

export interface TmuxSessionListResponse {
  available: boolean;
  sessions: TmuxSession[];
}

export interface TmuxAttachResult {
  success: boolean;
  instanceId?: string;
  projectId?: string;
  shell?: import('./index').ShellInstance;
  error?: string;
}
