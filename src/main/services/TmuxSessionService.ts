import { execFile } from 'child_process';
import { isTmuxAvailable, getTmuxPath } from '../utils/tmux';
import type { TmuxSession, TmuxSessionListResponse } from '@shared/types';

function execFileAsync(cmd: string, args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

let instance: TmuxSessionService | null = null;

export function getTmuxSessionService(): TmuxSessionService {
  if (!instance) {
    instance = new TmuxSessionService();
  }
  return instance;
}

export class TmuxSessionService {
  async listSessions(): Promise<TmuxSessionListResponse> {
    if (!isTmuxAvailable()) {
      return { available: false, sessions: [] };
    }

    const tmuxPath = getTmuxPath();

    let rawOutput: string;
    try {
      rawOutput = await execFileAsync(tmuxPath, [
        'list-sessions',
        '-F',
        '#{session_name}\t#{session_path}\t#{session_created}\t#{session_attached}\t#{session_windows}',
      ]);
    } catch {
      // tmux server not running or no sessions → not an error, just empty
      return { available: true, sessions: [] };
    }

    const lines = rawOutput.trim().split('\n').filter(Boolean);
    const sessions: TmuxSession[] = [];

    for (const line of lines) {
      const [sessionName, sessionPath, createdEpoch, attached, windows] = line.split('\t');
      if (!sessionName) continue;

      // Get actual pane working directory (more accurate than session_path)
      let workingDirectory = sessionPath || '';
      try {
        const paneDir = await execFileAsync(tmuxPath, [
          'display-message',
          '-p',
          '-t',
          sessionName,
          '#{pane_current_path}',
        ]);
        if (paneDir.trim()) {
          workingDirectory = paneDir.trim();
        }
      } catch {
        // Fallback to session_path
      }

      sessions.push({
        sessionName,
        workingDirectory,
        createdAt: parseInt(createdEpoch || '0', 10) * 1000,
        isAttached: attached === '1',
        isOrchestraSession: sessionName.startsWith('orchestra-'),
        windowCount: parseInt(windows || '1', 10),
      });
    }

    return { available: true, sessions };
  }
}
