import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal, ITheme } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useUIStore } from '../../stores/uiStore';
import { ContextMenu } from '../common/ContextMenu';
import { sharedResizeObserver } from '../../utils/sharedResizeObserver';
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

interface TerminalViewProps {
  instanceId: string;
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

export function TerminalView({ instanceId }: TerminalViewProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const viewportRef = useRef<HTMLElement | null>(null); // Track viewport for scroll suppression
  const isNearBottomRef = useRef(true); // Track if user is near bottom for smart scroll
  const hasAutoFocusedRef = useRef(false); // Track if we've auto-focused after ready
  const pendingScrollRef = useRef(false); // Track if we need to restore scroll after CSI H
  const outputBufferRef = useRef<OutputBuffer>(new OutputBuffer()); // Buffer for batching writes
  const scrollLockRef = useRef(false); // Lock scroll position during writes to prevent flicker
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // Use useShallow to prevent re-renders when unrelated store properties change
  const { sendInput, getInstanceOutput, updateTerminalTitle, instances } = useInstanceStore(
    useShallow((state) => ({
      sendInput: state.sendInput,
      getInstanceOutput: state.getInstanceOutput,
      updateTerminalTitle: state.updateTerminalTitle,
      instances: state.instances,
    }))
  );
  const {
    globalInstances,
    sendRemoteInput,
    resizeRemoteInstance,
    isConnected: clusterConnected,
  } = useClusterStore(
    useShallow((state) => ({
      globalInstances: state.globalInstances,
      sendRemoteInput: state.sendRemoteInput,
      resizeRemoteInstance: state.resizeRemoteInstance,
      isConnected: state.isConnected,
    }))
  );
  const theme = useUIStore((state) => state.theme);
  const terminalFont = useUIStore((state) => state.terminalFont);

  const output = getInstanceOutput(instanceId);

  // Get instance status for loading state and auto-focus
  const instance = instances.find((i) => i.id === instanceId);
  const status = instance?.status ?? 'starting';
  const isReady = status === 'running' || status === 'waiting_input';

  // Check if instance is remote (belongs to another node)
  const remoteInstance = clusterConnected
    ? globalInstances.find((i) => i.id === instanceId && !i.isLocal)
    : null;

  // Smart send input that routes to local or remote based on instance location
  const handleSendInput = useCallback(
    async (id: string, data: string) => {
      if (remoteInstance) {
        // Remote instance - send through cluster
        await sendRemoteInput(id, remoteInstance.nodeId, data);
      } else {
        // Local instance - send directly
        await sendInput(id, data);
      }
    },
    [remoteInstance, sendRemoteInput, sendInput]
  );

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
        void handleSendInput(instanceId, text);
      }
    } catch (err) {
      console.error('Failed to paste:', err);
    }
    setContextMenu(null);
    // Restore focus to terminal after paste
    xtermRef.current?.focus();
  }, [handleSendInput, instanceId]);

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
      console.debug('Terminal fit error (safe to ignore):', e);
    }
  };

  // Initialize terminal
  // NOTE: Empty dependency array is intentional - terminal should only initialize once per mount.
  // The parent component uses key={instanceId} to force remount when instance changes.
  // Theme changes are handled by a separate useEffect below.
  useEffect(() => {
    if (!terminalRef.current) return;

    // Capture current values to avoid stale closure issues
    const currentInstanceId = instanceId;
    const currentTheme = theme;
    const currentTerminalFont = terminalFont;
    const currentOutput = output;
    const currentHandleSendInput = handleSendInput;
    const currentUpdateTitle = updateTerminalTitle;
    const currentRemoteInstance = remoteInstance;

    // Wait for container to have dimensions before initializing terminal
    // This prevents xterm.js "dimensions" errors
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
      // xterm.js needs time to setup the renderer before we can fit
      initTimer = setTimeout(() => {
        animationFrameId = requestAnimationFrame(() => {
          safeFit();

          // Send initial resize after fit to sync remote PTY with client dimensions
          if (xtermRef.current) {
            const { cols, rows } = xtermRef.current;
            if (currentRemoteInstance) {
              void resizeRemoteInstance(
                currentInstanceId,
                currentRemoteInstance.nodeId,
                cols,
                rows
              );
            } else {
              window.electronAPI.instance.resize(currentInstanceId, cols, rows);
            }
          }
        });
      }, 100);

      // Handle user input
      terminal.onData((data) => {
        void currentHandleSendInput(currentInstanceId, data);
      });

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        if (currentRemoteInstance) {
          // Remote instance - resize through cluster
          void resizeRemoteInstance(currentInstanceId, currentRemoteInstance.nodeId, cols, rows);
        } else {
          // Local instance - resize directly
          window.electronAPI.instance.resize(currentInstanceId, cols, rows);
        }
      });

      // Handle terminal title changes (set by Claude CLI via ANSI escape sequences)
      terminal.onTitleChange((title) => {
        currentUpdateTitle(currentInstanceId, title);
      });

      // Write existing output and scroll to bottom
      if (currentOutput?.rawOutput) {
        terminal.write(currentOutput.rawOutput, () => {
          terminal.scrollToBottom();
        });
      }

      // Auto-focus terminal after initialization
      terminal.focus();
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
    const handleResize = () => {
      // Use requestAnimationFrame to batch resize operations
      requestAnimationFrame(() => {
        safeFit();
      });
    };

    window.addEventListener('resize', handleResize);

    // Use shared ResizeObserver for better performance with multiple terminals
    let unobserve: (() => void) | undefined;
    if (terminalRef.current) {
      unobserve = sharedResizeObserver.observe(terminalRef.current, () => {
        safeFit();
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      unobserve?.();
    };
  }, []);

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
    const unsubscribe = window.electronAPI.instance.onRawOutput((id, data) => {
      if (id === instanceId) {
        outputBuffer.write(data);
      }
    });

    return () => {
      unsubscribe();
      outputBuffer.clear();
    };
  }, [instanceId]);

  // Update terminal theme when global theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme === 'dark' ? darkTerminalTheme : lightTerminalTheme;
    }
  }, [theme]);

  // Listen for dimension sync events (multi-client synchronization)
  // When multiple clients are connected to the same instance, the server calculates
  // the minimum dimensions and broadcasts to all clients to prevent rendering issues
  useEffect(() => {
    const unsubscribe = window.electronAPI.instance.onDimensionSync?.((id, cols, rows) => {
      if (id === instanceId && xtermRef.current) {
        const term = xtermRef.current;
        // Only resize if dimensions are different
        if (term.cols !== cols || term.rows !== rows) {
          console.debug(
            `[TerminalView] Dimension sync for ${instanceId}: ${cols}x${rows} (current: ${term.cols}x${term.rows})`
          );
          term.resize(cols, rows);
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [instanceId]);

  // Auto-focus terminal when instance becomes ready (running/waiting_input)
  useEffect(() => {
    if (isReady && xtermRef.current && !hasAutoFocusedRef.current) {
      hasAutoFocusedRef.current = true;
      xtermRef.current.focus();
    }
  }, [isReady]);

  // Focus terminal when this component receives focus (e.g., tab switch)
  // This is triggered by the parent component via key change
  useEffect(() => {
    // Small delay to ensure terminal is rendered
    const focusTimer = setTimeout(() => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    }, 50);

    return () => clearTimeout(focusTimer);
  }, [instanceId]);

  return (
    <div className="h-full flex flex-col bg-claude-cream dark:bg-[#1a1a2e] relative">
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ minHeight: 0 }}
        onContextMenu={handleContextMenu}
      />
      {/* Loading overlay while instance is starting */}
      {status === 'starting' && (
        <div className="absolute inset-0 bg-claude-cream/80 dark:bg-[#1a1a2e]/80 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-claude-orange border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {t('terminal.starting', 'Starting Claude...')}
            </span>
          </div>
        </div>
      )}
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
