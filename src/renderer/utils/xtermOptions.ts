import type { ITerminalOptions } from 'xterm';

export interface XtermOptionsFlags {
  /**
   * True when the PTY behind this xterm is a tmux session.
   *
   * Important: This should be an explicit signal (recommended). Avoid guessing from output.
   */
  isTmuxSession: boolean;
}

/**
 * Build xterm.js options that are safe for tmux-backed sessions.
 *
 * Rationale (tmux):
 * - tmux is a terminal multiplexer; it manages its own screen state, scrollback, and redraws.
 * - Enabling convertEol/windowsMode in tmux sessions can cause inconsistent newline handling
 *   and visual corruption, especially around redraws/splits.
 * - xterm scrollback duplicates tmux history; however, we keep a local scrollback buffer
 *   so the user can scroll with the mouse wheel (handled via attachCustomWheelEventHandler
 *   in TerminalView to prevent events from being forwarded to tmux/Claude TUI).
 */
export function getXtermTmuxCompatibleOptions(
  flags: XtermOptionsFlags
): Pick<ITerminalOptions, 'convertEol' | 'windowsMode' | 'scrollback'> {
  if (flags.isTmuxSession) {
    return {
      convertEol: false,
      windowsMode: false,
      scrollback: 5000,
    };
  }

  return {
    // Keep default behavior for non-tmux shells.
    convertEol: true,
    windowsMode: false,
    scrollback: 5000,
  };
}
