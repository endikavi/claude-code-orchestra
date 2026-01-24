import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, ITheme } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { ContextMenu } from '../common/ContextMenu';
import { getTerminalFontFamily } from '../../utils/terminalFonts';
import 'xterm/css/xterm.css';

// Terminal themes for dark and light modes
const darkTerminalTheme: ITheme = {
  background: '#1a1a2e',
  foreground: '#e4e4e7',
  cursor: '#da7756',
  cursorAccent: '#1a1a2e',
  selectionBackground: 'rgba(218, 119, 86, 0.3)',
  black: '#1a1a2e',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e4e4e7',
  brightBlack: '#4a4a6a',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
};

const lightTerminalTheme: ITheme = {
  background: '#e8dcd0', // claude-cream
  foreground: '#374151', // gray-700
  cursor: '#da7756', // claude-orange
  cursorAccent: '#e8dcd0',
  selectionBackground: 'rgba(212, 162, 127, 0.3)', // claude-tan with opacity
  black: '#1f2937',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#e8dcd0',
  brightBlack: '#6b7280',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#f5f0e8', // claude-beige
};

interface ShellTerminalViewProps {
  shellId: string;
}

// Threshold in pixels to consider "near bottom" for smart scroll
const SCROLL_THRESHOLD = 50;

export function ShellTerminalView({ shellId }: ShellTerminalViewProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null); // Track viewport for scroll suppression
  const isNearBottomRef = useRef(true); // Track if user is near bottom for smart scroll
  const pendingScrollRef = useRef(false); // Track if we need to restore scroll after CSI H
  const scrollLockRef = useRef(false); // Lock scroll position during writes to prevent flicker
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { sendShellInput, getShellOutput } = useInstanceStore();
  const theme = useUIStore((state) => state.theme);
  const terminalFont = useUIStore((state) => state.terminalFont);

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

      const terminal = new Terminal({
        theme: currentTheme === 'dark' ? darkTerminalTheme : lightTerminalTheme,
        fontFamily: getTerminalFontFamily(currentTerminalFont),
        fontSize: 14,
        lineHeight: 1,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 5000, // Reduced from 10000 for better memory usage
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

      // Delay fit to ensure terminal renderer is fully initialized
      initTimer = setTimeout(() => {
        animationFrameId = requestAnimationFrame(() => {
          safeFit();
        });
      }, 100);

      // Handle user input - send directly to shell
      terminal.onData((data) => {
        void currentSendShellInput(currentShellId, data);
      });

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        window.electronAPI.shell.resize(currentShellId, cols, rows);
      });

      // Write existing output and scroll to bottom
      if (currentOutput?.rawOutput) {
        terminal.write(currentOutput.rawOutput, () => {
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

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      // Use requestAnimationFrame to batch resize operations
      requestAnimationFrame(() => {
        safeFit();
      });
    };

    window.addEventListener('resize', handleResize);

    // Also observe the container
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize observer calls
      requestAnimationFrame(() => {
        safeFit();
      });
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, []);

  // Subscribe to raw output from shell with smart scroll and flicker suppression
  // This uses the same technique as TerminalView to prevent visible scroll jumps
  // Solution: Multi-layered approach:
  // 1. Lock scroll position with monkey-patch
  // 2. Hide viewport IMMEDIATELY when data arrives
  // 3. Save exact scroll position before write
  // 4. Mark pending scroll for CSI handler
  // 5. Unlock scroll and restore position in write callback
  // 6. Restore visibility synchronously after scroll is set
  useEffect(() => {
    const unsubscribe = window.electronAPI.shell.onRawOutput((id, data) => {
      if (id === shellId && xtermRef.current) {
        const viewport = viewportRef.current;
        const shouldAutoScroll = isNearBottomRef.current;

        if (shouldAutoScroll && viewport) {
          // Lock scroll position to prevent xterm.js from changing it during write
          scrollLockRef.current = true;

          // Hide viewport IMMEDIATELY to prevent any visible jump
          viewport.style.visibility = 'hidden';
          pendingScrollRef.current = true;

          // Save current scroll position
          const savedScrollTop = viewport.scrollTop;
          const savedScrollHeight = viewport.scrollHeight;

          xtermRef.current.write(data, () => {
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

              // Clear pending flag and restore visibility synchronously
              pendingScrollRef.current = false;
              viewport.style.visibility = '';
            }
          });
        } else {
          // Not auto-scrolling, just write normally
          xtermRef.current.write(data);
        }
      }
    });

    return unsubscribe;
  }, [shellId]);

  // Update terminal theme when global theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme === 'dark' ? darkTerminalTheme : lightTerminalTheme;
    }
  }, [theme]);

  return (
    <div className="h-full flex flex-col bg-claude-cream dark:bg-[#1a1a2e]">
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
              icon: <CopyIcon />,
            },
            {
              label: t('terminal.paste'),
              onClick: handlePaste,
              icon: <PasteIcon />,
            },
          ]}
        />
      )}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function PasteIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  );
}
