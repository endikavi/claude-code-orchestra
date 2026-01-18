import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { platform } from 'os';
import type { AvailableShell } from '@shared/types';

/**
 * Detects available shells on the system
 */
export class ShellDetector {
  private static instance: ShellDetector | null = null;

  public static getInstance(): ShellDetector {
    if (!ShellDetector.instance) {
      ShellDetector.instance = new ShellDetector();
    }
    return ShellDetector.instance;
  }

  /**
   * Get all available shells on the current platform
   */
  getAvailableShells(): AvailableShell[] {
    const os = platform();

    if (os === 'win32') {
      return this.getWindowsShells();
    } else {
      return this.getUnixShells();
    }
  }

  /**
   * Get available shells on Windows
   */
  private getWindowsShells(): AvailableShell[] {
    const shells: AvailableShell[] = [];

    // PowerShell (recommended for Claude)
    const powershellPaths = [
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
    ];

    for (const path of powershellPaths) {
      if (existsSync(path)) {
        const isPwsh = path.includes('pwsh.exe');
        shells.push({
          id: isPwsh ? 'pwsh' : 'powershell',
          name: isPwsh ? 'PowerShell 7' : 'Windows PowerShell',
          path,
          isDefault: false,
          canRunClaude: true, // PowerShell can run Claude
        });
      }
    }

    // CMD
    const cmdPath = 'C:\\Windows\\System32\\cmd.exe';
    if (existsSync(cmdPath)) {
      shells.push({
        id: 'cmd',
        name: 'Command Prompt (CMD)',
        path: cmdPath,
        isDefault: false,
        canRunClaude: true, // CMD can also run Claude if in PATH
      });
    }

    // Git Bash (if installed)
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];

    for (const path of gitBashPaths) {
      if (existsSync(path)) {
        shells.push({
          id: 'git-bash',
          name: 'Git Bash',
          path,
          isDefault: false,
          canRunClaude: true,
        });
        break;
      }
    }

    // WSL Bash (if installed)
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    if (existsSync(wslPath)) {
      shells.push({
        id: 'wsl',
        name: 'WSL (Windows Subsystem for Linux)',
        path: wslPath,
        isDefault: false,
        canRunClaude: true,
      });
    }

    // Mark PowerShell as default (best for Claude on Windows)
    const powershellShell = shells.find((s) => s.id === 'powershell' || s.id === 'pwsh');
    if (powershellShell) {
      powershellShell.isDefault = true;
    } else if (shells.length > 0) {
      shells[0].isDefault = true;
    }

    return shells;
  }

  /**
   * Get available shells on Unix-like systems (Linux/macOS)
   */
  private getUnixShells(): AvailableShell[] {
    const shells: AvailableShell[] = [];
    const userShell = process.env.SHELL || '/bin/bash';

    // Try to read /etc/shells for available shells
    const commonShells = [
      { id: 'bash', name: 'Bash', paths: ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash'] },
      { id: 'zsh', name: 'Zsh', paths: ['/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh'] },
      { id: 'fish', name: 'Fish', paths: ['/usr/bin/fish', '/usr/local/bin/fish'] },
      { id: 'sh', name: 'Bourne Shell', paths: ['/bin/sh', '/usr/bin/sh'] },
      { id: 'dash', name: 'Dash', paths: ['/bin/dash', '/usr/bin/dash'] },
      { id: 'ksh', name: 'Korn Shell', paths: ['/bin/ksh', '/usr/bin/ksh'] },
      { id: 'tcsh', name: 'TCSH', paths: ['/bin/tcsh', '/usr/bin/tcsh'] },
    ];

    // Try to get shells from /etc/shells
    let systemShells: string[] = [];
    try {
      const output = execSync('cat /etc/shells 2>/dev/null || echo ""', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      systemShells = output
        .split('\n')
        .filter((line) => line.startsWith('/'))
        .map((line) => line.trim());
    } catch {
      // Fallback to common shells
    }

    for (const shellInfo of commonShells) {
      for (const path of shellInfo.paths) {
        if (existsSync(path) || systemShells.includes(path)) {
          const isUserDefault = path === userShell || userShell.endsWith(`/${shellInfo.id}`);
          shells.push({
            id: shellInfo.id,
            name: shellInfo.name,
            path,
            isDefault: isUserDefault,
            canRunClaude: true, // All Unix shells can run Claude
          });
          break; // Only add first found path for each shell
        }
      }
    }

    // If no shell was marked as default, mark the first one
    if (shells.length > 0 && !shells.some((s) => s.isDefault)) {
      // Try to match user's SHELL
      const userShellMatch = shells.find(
        (s) => s.path === userShell || userShell.endsWith(`/${s.id}`)
      );
      if (userShellMatch) {
        userShellMatch.isDefault = true;
      } else {
        shells[0].isDefault = true;
      }
    }

    return shells;
  }

  /**
   * Get the default shell for the current platform
   */
  getDefaultShell(): AvailableShell | undefined {
    const shells = this.getAvailableShells();
    return shells.find((s) => s.isDefault) || shells[0];
  }

  /**
   * Get a shell by its ID
   */
  getShellById(id: string): AvailableShell | undefined {
    const shells = this.getAvailableShells();
    return shells.find((s) => s.id === id);
  }

  /**
   * Get a shell by its path
   */
  getShellByPath(path: string): AvailableShell | undefined {
    const shells = this.getAvailableShells();
    return shells.find((s) => s.path === path);
  }

  /**
   * Check if a shell path is valid
   */
  isValidShell(path: string): boolean {
    return existsSync(path);
  }
}
