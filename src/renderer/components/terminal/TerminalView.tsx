import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal, ITheme } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useUIStore } from '../../stores/uiStore';
import { ContextMenu } from '../common/ContextMenu';
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

export function TerminalView({ instanceId }: TerminalViewProps) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isNearBottomRef = useRef(true); // Track if user is near bottom for smart scroll
  const hasAutoFocusedRef = useRef(false); // Track if we've auto-focused after ready
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { sendInput, getInstanceOutput, updateTerminalTitle, instances } = useInstanceStore();
  const {
    globalInstances,
    sendRemoteInput,
    resizeRemoteInstance,
    isConnected: clusterConnected,
  } = useClusterStore();
  const theme = useUIStore((state) => state.theme);

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
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 10000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      terminal.open(container);

      // Setup smart scroll tracking - detect when user scrolls away from bottom
      const viewport = container.querySelector('.xterm-viewport') as HTMLElement;
      if (viewport) {
        viewport.addEventListener('scroll', () => {
          const { scrollTop, scrollHeight, clientHeight } = viewport;
          const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
          isNearBottomRef.current = distanceFromBottom < SCROLL_THRESHOLD;
        });
      }

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

  // Subscribe to raw output with smart scroll
  useEffect(() => {
    const unsubscribe = window.electronAPI.instance.onRawOutput((id, data) => {
      if (id === instanceId && xtermRef.current) {
        xtermRef.current.write(data, () => {
          // Only auto-scroll if user is near the bottom
          // This prevents jumping while user is reading previous content
          if (isNearBottomRef.current) {
            xtermRef.current?.scrollToBottom();
          }
        });
      }
    });

    return unsubscribe;
  }, [instanceId]);

  // Update terminal theme when global theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = theme === 'dark' ? darkTerminalTheme : lightTerminalTheme;
    }
  }, [theme]);

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
