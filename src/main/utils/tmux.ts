import { execFileSync } from 'child_process';

/**
 * Cached result of tmux availability check.
 * null = not yet checked, true/false = result.
 */
let cachedTmuxAvailable: boolean | null = null;
let cachedTmuxPath: string | null = null;

/**
 * Check whether tmux is available on this machine.
 * Result is cached after the first call.
 *
 * - Linux/macOS: runs `which tmux`
 * - Windows: runs `where tmux` (native tmux in PATH only; WSL not supported yet)
 */
export function isTmuxAvailable(): boolean {
  if (cachedTmuxAvailable !== null) {
    return cachedTmuxAvailable;
  }

  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(cmd, ['tmux'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const tmuxPath = result.trim().split('\n')[0]?.trim();
    if (tmuxPath) {
      cachedTmuxPath = tmuxPath;
      cachedTmuxAvailable = true;
      console.log(`[tmux] Found tmux at: ${cachedTmuxPath}`);
    } else {
      cachedTmuxAvailable = false;
      console.log('[tmux] tmux not found in PATH');
    }
  } catch {
    cachedTmuxAvailable = false;
    console.log('[tmux] tmux not available on this system');
  }

  return cachedTmuxAvailable;
}

/**
 * Get the cached tmux executable path, or 'tmux' as fallback.
 */
export function getTmuxPath(): string {
  return cachedTmuxPath ?? 'tmux';
}

/**
 * Build a tmux session name for a given instance ID.
 * Uses a stable prefix so sessions can be reconnected.
 */
export function getTmuxSessionName(instanceId: string): string {
  // tmux session names have limited characters; use a short prefix + first 12 chars of UUID
  return `orchestra-${instanceId.substring(0, 12)}`;
}

/**
 * Reset the cache (useful for testing).
 */
export function resetTmuxCache(): void {
  cachedTmuxAvailable = null;
  cachedTmuxPath = null;
}
