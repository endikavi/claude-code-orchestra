import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useInstanceStore, stripTerminalQueryResponses } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { ContextMenu } from '../common/ContextMenu';
import { getTerminalFontFamily } from '../../utils/terminalFonts';
import { getXtermTmuxCompatibleOptions } from '../../utils/xtermOptions';
import { CopyIcon, PasteIcon } from '@renderer/components/icons';
import { sharedResizeObserver } from '../../utils/sharedResizeObserver';
import '@xterm/xterm/css/xterm.css';

// Terminal themes for dark and light modes
const darkTerminalTheme: ITheme = {
  background: '#0a0a0a', // neutral-950
  foreground: '#e5e5e5', // neutral-200
  cursor: '#0ea5e9', // sky-500
  cursorAccent: '#0a0a0a',
  selectionBackground: 'rgba(14, 165, 233, 0.3)', // sky-500
  black: '#0a0a0a',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e5e5e5',
  brightBlack: '#525252', // neutral-600
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
};

const lightTerminalTheme: ITheme = {
  background: '#fafafa', // neutral-50
  foreground: '#262626', // neutral-800
  cursor: '#0ea5e9', // sky-500
  cursorAccent: '#fafafa',
  selectionBackground: 'rgba(14, 165, 233, 0.3)', // sky-500
  black: '#1f2937',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#fafafa',
  brightBlack: '#6b7280',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#f5f5f5', // gray-100
};

interface ShellTerminalViewProps {
  shellId: string;
}

// Threshold in pixels to consider "near bottom" for smart scroll
const SCROLL_THRESHOLD = 50;

/**
 * Output buffer for batching terminal writes with flicker prevention
 *
 * Key insight: To prevent flickering, we must hide the viewport BEFORE any
 * ANSI cursor-home sequences are processed by xterm. Using requestAnimationFrame
 * is too late because it runs just before paint.
 *
 * Strategy:
 * 1. On first data chunk: hide viewport immediately
 * 2. Batch subsequent data with setTimeout(0) - faster than rAF but still allows batching
 * 3. On flush: write data with scroll fix, then restore visibility
 */
class OutputBuffer {
  private buffer = '';
  private pending = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private onFlush: ((data: string) => void) | null = null;
  private onHide: (() => void) | null = null;

  setCallbacks(onFlush: (data: string) => void, onHide: () => void): void {
    this.onFlush = onFlush;
    this.onHide = onHide;
  }

  write(data: string): void {
    const isFirstChunk = this.buffer === '';
    this.buffer += data;

    if (!this.onFlush) return;

    // Hide viewport immediately on first chunk (before any batching delay)
    if (isFirstChunk && this.onHide) {
      this.onHide();
    }

    if (this.pending) return;

    this.pending = true;
    // Use setTimeout(0) instead of rAF - runs sooner, before paint
    this.timeoutId = setTimeout(() => {
      const chunk = this.buffer;
      this.buffer = '';
      this.pending = false;
      this.timeoutId = null;

      if (chunk && this.onFlush) {
        this.onFlush(chunk);
      }
    }, 0);
  }

  clear(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.buffer = '';
    this.pending = false;
    this.onFlush = null;
    this.onHide = null;
  }
}

export function ShellTerminalView({ shellId }: ShellTerminalViewProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null); // Track viewport for scroll suppression
  const isNearBottomRef = useRef(true); // Track if user is near bottom for smart scroll
  const pendingScrollRef = useRef(false); // Track if we need to restore scroll after CSI H
  const outputBufferRef = useRef<OutputBuffer>(new OutputBuffer()); // Buffer for batching writes
  const scrollLockRef = useRef(false); // Lock scroll position during writes to prevent flicker
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { sendShellInput, getShellOutput } = useInstanceStore(
    useShallow((s) => ({
      sendShellInput: s.sendShellInput,
      getShellOutput: s.getShellOutput,
    }))
  );
  const theme = useUIStore((state) => state.theme);
  const terminalFont = useUIStore((state) => state.terminalFont);
  const tmuxMode = useUIStore((state) => state.tmuxMode);

  const output = getShellOutput(shellId);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCopy = useCallback(() => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
      // Restore focus to terminal after copy
      xtermRef.current.focus();
    }
    setContextMenu(null);
  }, []);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && xtermRef.current) {
        void sendShellInput(shellId, text);
      }
    } catch (err) {
      console.error('Failed to paste:', err);
    }
    setContextMenu(null);
    // Restore focus to terminal after paste
    xtermRef.current?.focus();
  }, [sendShellInput, shellId]);

  // Safe fit function that won't throw
  const safeFit = () => {
    if (!fitAddonRef.current || !terminalRef.current || !xtermRef.current) return;

    // Check if container has dimensions
    const { clientWidth, clientHeight } = terminalRef.current;
    if (clientWidth === 0 || clientHeight === 0) return;

    try {
      fitAddonRef.current.fit();
    } catch (e) {
      // Ignore fit errors - they happen when terminal isn't ready
      console.debug('Shell terminal fit error (safe to ignore):', e);
    }
  };

  // Initialize terminal
  // NOTE: Empty dependency array is intentional - terminal should only initialize once per mount.
  // The parent component uses key={shellId} to force remount when shell changes.
  // Theme changes are handled by a separate useEffect below.
  useEffect(() => {
    if (!terminalRef.current) return;

    // Capture current values to avoid stale closure issues
    const currentShellId = shellId;
    const currentTheme = theme;
    const currentTerminalFont = terminalFont;
    const currentOutput = output;
    const currentSendShellInput = sendShellInput;
    const currentTmuxMode = tmuxMode;

    // Wait for container to have dimensions before initializing terminal
    const container = terminalRef.current;
    let initTimer: ReturnType<typeof setTimeout>;
    let animationFrameId: number;

    const initTerminal = () => {
      // Check if container has dimensions
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        // Retry after a short delay
        initTimer = setTimeout(() => {
          animationFrameId = requestAnimationFrame(initTerminal);
        }, 50);
        return;
      }

      // Clear container to avoid residual content
      container.innerHTML = '';

      const tmuxOptions = getXtermTmuxCompatibleOptions({ isTmuxSession: currentTmuxMode });

      const terminal = new Terminal({
        theme: currentTheme === 'dark' ? darkTerminalTheme : lightTerminalTheme,
        fontFamily: getTerminalFontFamily(currentTerminalFont),
        fontSize: 14,
        lineHeight: 1,
        cursorBlink: true,
        cursorStyle: 'bar',
        // tmux compatibility (see TerminalView.tsx for rationale)
        convertEol: tmuxOptions.convertEol,
        scrollback: tmuxOptions.scrollback,
        allowProposedApi: true,
        scrollOnUserInput: false, // Prevent auto-scroll on input to reduce flicker
      });

      const fitAddon = new FitAddon();
      // Configure WebLinksAddon with custom handler to properly open links in Electron
      const webLinksAddon = new WebLinksAddon((_event, uri) => {
        // Use IPC to open external URLs safely through the main process
        void window.electronAPI.shell.openExternal(uri);
      });

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      // Load Unicode11 addon for proper emoji and wide character width calculation
      const unicode11Addon = new Unicode11Addon();
      terminal.loadAddon(unicode11Addon);
      terminal.unicode.activeVersion = '11';

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      terminal.open(container);

      // Setup smart scroll tracking - detect when user scrolls away from bottom
      // NOTE: We update synchronously (no rAF throttling) because the flicker
      // prevention logic needs accurate isNearBottom values immediately when
      // data arrives. The performance cost is minimal since scroll events
      // only fire during user interaction, not during programmatic scrolls.
      const viewport = container.querySelector('.xterm-viewport') as HTMLElement;
      if (viewport) {
        viewportRef.current = viewport;
        viewport.addEventListener(
          'scroll',
          () => {
            const { scrollTop, scrollHeight, clientHeight } = viewport;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            isNearBottomRef.current = distanceFromBottom < SCROLL_THRESHOLD;
          },
          { passive: true }
        );

        // Monkey-patch scrollTop to prevent xterm.js from changing scroll position during writes
        // This blocks the viewport sync that happens when CSI H (cursor home) is processed
        const scrollTopDesc =
          Object.getOwnPropertyDescriptor(viewport, 'scrollTop') ||
          Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');

        if (scrollTopDesc) {
          Object.defineProperty(viewport, 'scrollTop', {
            get() {
              return scrollTopDesc.get!.call(this);
            },
            set(value: number) {
              // Only allow scroll changes when not locked
              if (!scrollLockRef.current) {
                scrollTopDesc.set!.call(this, value);
              }
            },
            configurable: true,
          });
        }
      }

      // Register CSI handler to intercept cursor-home sequences (CSI H, CSI ;H, CSI 1;1H)
      // This provides additional protection against scroll jumps by scheduling
      // immediate scroll restoration when cursor moves to top
      const csiDisposable = terminal.parser.registerCsiHandler({ final: 'H' }, (params) => {
        const row = params[0] || 1;
        // If cursor moving to row 1 and we should auto-scroll, mark for restoration
        if (row === 1 && isNearBottomRef.current && pendingScrollRef.current) {
          // Schedule immediate scroll restoration
          queueMicrotask(() => {
            xtermRef.current?.scrollToBottom();
          });
        }
        return false; // Let default handler process the sequence
      });

      // Store disposable for cleanup
      const originalDispose = terminal.dispose.bind(terminal);
      terminal.dispose = () => {
        csiDisposable.dispose();
        originalDispose();
      };

      // In tmux mode, intercept mouse wheel events at the DOM level (capture phase)
      // and handle them as local xterm.js scroll instead of letting xterm.js forward
      // them to the PTY as mouse escape sequences (which tmux → Claude TUI interprets
      // as input navigation instead of scrolling the output).
      if (currentTmuxMode) {
        const SCROLL_LINES = 3;
        container.addEventListener(
          'wheel',
          (event: WheelEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.deltaY < 0) {
              terminal.scrollLines(-SCROLL_LINES);
            } else if (event.deltaY > 0) {
              terminal.scrollLines(SCROLL_LINES);
            }
          },
          { capture: true, passive: false }
        );
      }

      // Delay fit to ensure terminal renderer is fully initialized
      initTimer = setTimeout(() => {
        animationFrameId = requestAnimationFrame(() => {
          safeFit();

          // Force tmux to redraw by sending a nudge resize (cols-1 then cols)
          // This triggers SIGWINCH which makes tmux repaint its TUI
          if (currentTmuxMode && xtermRef.current) {
            const { cols, rows } = xtermRef.current;
            if (cols > 1) {
              setTimeout(() => {
                window.electronAPI.shell.resize(currentShellId, cols - 1, rows);
                setTimeout(() => {
                  window.electronAPI.shell.resize(currentShellId, cols, rows);
                  safeFit();
                }, 50);
              }, 150);
            }
          }
        });
      }, 100);

      // Handle user input - filter xterm.js-generated DA responses to prevent PTY echo loop
      terminal.onData((data) => {
        const filtered = stripTerminalQueryResponses(data);
        if (filtered) {
          void currentSendShellInput(currentShellId, filtered);
        }
      });

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        window.electronAPI.shell.resize(currentShellId, cols, rows);
      });

      // Write existing output and scroll to bottom
      if (currentOutput?.rawOutput) {
        terminal.write(stripTerminalQueryResponses(currentOutput.rawOutput), () => {
          terminal.scrollToBottom();
        });
      }
    };

    // Start initialization with a small delay to ensure DOM is ready
    animationFrameId = requestAnimationFrame(initTerminal);

    return () => {
      clearTimeout(initTimer);
      cancelAnimationFrame(animationFrameId);
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle resize using shared ResizeObserver singleton
  useEffect(() => {
    // For tmux-backed sessions, avoid resize storms (SIGWINCH + redraw) by:
    // - Debouncing resizes (300-500ms)
    // - Ignoring tiny changes (<5px)
    const DEBOUNCE_MS = tmuxMode ? 350 : 0;
    const IGNORE_PX = tmuxMode ? 5 : 0;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSize: { w: number; h: number } | null = null;

    const scheduleFit = () => {
      if (DEBOUNCE_MS > 0) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          requestAnimationFrame(() => safeFit());
        }, DEBOUNCE_MS);
      } else {
        requestAnimationFrame(() => safeFit());
      }
    };

    const handleResize = () => {
      scheduleFit();
    };

    window.addEventListener('resize', handleResize);

    // Use shared ResizeObserver for better performance with multiple terminals
    let unobserve: (() => void) | undefined;
    if (terminalRef.current) {
      unobserve = sharedResizeObserver.observe(terminalRef.current, (entry) => {
        const { width, height } = entry.contentRect;

        if (IGNORE_PX > 0 && lastSize) {
          if (
            Math.abs(width - lastSize.w) < IGNORE_PX &&
            Math.abs(height - lastSize.h) < IGNORE_PX
          ) {
            return;
          }
        }

        lastSize = { w: width, h: height };
        scheduleFit();
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      unobserve?.();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [tmuxMode]);

  // Subscribe to raw output with smart scroll and flicker suppression
  // Claude CLI sends ANSI escape sequences that move cursor to top (CSI H, CSI 1;1H)
  // This causes visible flickering when scrollToBottom() is called after write()
  // Solution: Multi-layered approach:
  // 1. Hide viewport IMMEDIATELY when first data chunk arrives (before batching delay)
  // 2. Batch data with setTimeout(0) - faster than rAF, runs before paint
  // 3. Save scroll position before write
  // 4. Write batched data
  // 5. Restore scroll synchronously in write callback
  // 6. Restore visibility after scroll is set
  useEffect(() => {
    const outputBuffer = outputBufferRef.current;

    // Callback to hide viewport immediately when data starts arriving
    const handleHide = () => {
      const viewport = viewportRef.current;
      if (viewport && isNearBottomRef.current) {
        viewport.style.visibility = 'hidden';
        pendingScrollRef.current = true;
      }
    };

    // Callback to flush batched data to terminal
    const handleFlush = (batchedData: string) => {
      if (!xtermRef.current) return;

      const viewport = viewportRef.current;
      const shouldAutoScroll = isNearBottomRef.current;

      if (shouldAutoScroll && viewport) {
        // Lock scroll position to prevent xterm.js from changing it during write
        scrollLockRef.current = true;

        // Save current scroll position (viewport may already be hidden)
        const savedScrollTop = viewport.scrollTop;
        const savedScrollHeight = viewport.scrollHeight;

        xtermRef.current.write(batchedData, () => {
          // Restore scroll synchronously in callback (before any paint)
          if (xtermRef.current && viewport) {
            // Unlock scroll so we can set the position
            scrollLockRef.current = false;

            // Calculate new scroll position to stay at bottom
            const newScrollHeight = viewport.scrollHeight;
            const scrollDelta = newScrollHeight - savedScrollHeight;

            // If content was added, adjust scroll to stay at same relative position
            if (scrollDelta > 0) {
              viewport.scrollTop = savedScrollTop + scrollDelta;
            }

            // Ensure we're at bottom
            xtermRef.current.scrollToBottom();

            // Clear pending flag and restore visibility
            pendingScrollRef.current = false;
            viewport.style.visibility = '';
          }
        });
      } else {
        // Not auto-scrolling, just write normally
        xtermRef.current.write(batchedData);
        // Restore visibility in case it was hidden
        if (viewport) {
          pendingScrollRef.current = false;
          viewport.style.visibility = '';
        }
      }
    };

    outputBuffer.setCallbacks(handleFlush, handleHide);

    // Subscribe to raw output and buffer the data
    const unsubscribe = window.electronAPI.shell.onRawOutput((id, rawData) => {
      if (id === shellId) {
        outputBuffer.write(stripTerminalQueryResponses(rawData));
      }
    });

    return () => {
      unsubscribe();
      outputBuffer.clear();
    };
  }, [shellId]);

  // Update terminal theme when global theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme === 'dark' ? darkTerminalTheme : lightTerminalTheme;
    }
  }, [theme]);

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ minHeight: 0 }}
        onContextMenu={handleContextMenu}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: t('terminal.copy'),
              onClick: handleCopy,
              icon: <CopyIcon className="w-4 h-4" />,
            },
            {
              label: t('terminal.paste'),
              onClick: handlePaste,
              icon: <PasteIcon className="w-4 h-4" />,
            },
          ]}
        />
      )}
    </div>
  );
}
