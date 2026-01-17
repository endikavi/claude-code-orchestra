import { useEffect, useRef } from 'react';
import { Terminal, ITheme } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
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

export function TerminalView({ instanceId }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { sendInput, getInstanceOutput, updateTerminalTitle } = useInstanceStore();
  const theme = useUIStore((state) => state.theme);

  const output = getInstanceOutput(instanceId);

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
    const currentSendInput = sendInput;
    const currentUpdateTitle = updateTerminalTitle;

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

      // Delay fit to ensure terminal renderer is fully initialized
      // xterm.js needs time to setup the renderer before we can fit
      initTimer = setTimeout(() => {
        animationFrameId = requestAnimationFrame(() => {
          safeFit();
        });
      }, 100);

      // Handle user input
      terminal.onData((data) => {
        void currentSendInput(currentInstanceId, data);
      });

      // Handle resize
      terminal.onResize(({ cols, rows }) => {
        window.electronAPI.instance.resize(currentInstanceId, cols, rows);
      });

      // Handle terminal title changes (set by Claude CLI via ANSI escape sequences)
      terminal.onTitleChange((title) => {
        currentUpdateTitle(currentInstanceId, title);
      });

      // Write existing output
      if (currentOutput?.rawOutput) {
        terminal.write(currentOutput.rawOutput);
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

  // Subscribe to raw output
  useEffect(() => {
    const unsubscribe = window.electronAPI.instance.onRawOutput((id, data) => {
      if (id === instanceId && xtermRef.current) {
        xtermRef.current.write(data);
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

  return (
    <div className="h-full flex flex-col bg-claude-cream dark:bg-[#1a1a2e]">
      <div ref={terminalRef} className="flex-1 p-2" style={{ minHeight: 0 }} />
    </div>
  );
}
