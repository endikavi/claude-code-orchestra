import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProxyStore } from '../../stores/proxyStore';
import { ConsolePanel } from './ConsolePanel';
import { InspectorToolbar } from './InspectorToolbar';
import { DevToolsContextMenu, useDevToolsContextMenu } from './DevToolsContextMenu';
import type { ProxyView as ProxyViewType } from '@shared/types';
import type { ConsoleLevel, ContextMenuAction, ElementInfo } from '@shared/types/devtools';

// Inline icons
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}

interface ProxyViewElectronProps {
  view: ProxyViewType;
  onClose?: () => void;
}

// Map webview console levels to our ConsoleLevel type
const WEBVIEW_LEVEL_MAP: Record<number, ConsoleLevel> = {
  0: 'log',
  1: 'warn',
  2: 'error',
  3: 'debug',
};

/**
 * ProxyViewElectron component uses Electron's <webview> tag
 * which provides native console-message events and context isolation.
 */
export function ProxyViewElectron({ view, onClose }: ProxyViewElectronProps) {
  const { t } = useTranslation();
  const { closeProxyView, addConsoleEntry, getDevToolsState, toggleInspector } = useProxyStore();
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [currentPath, setCurrentPath] = useState(view.path);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState(view.path);

  const devToolsState = getDevToolsState(view.id);

  // Context menu state
  const { contextMenuPosition, contextMenuElement, showContextMenu, hideContextMenu } =
    useDevToolsContextMenu();

  // Build the URL to display (direct localhost access in Electron)
  const getUrl = useCallback(
    (path: string) => {
      return `http://localhost:${view.port}${path}`;
    },
    [view.port]
  );

  const handleClose = useCallback(() => {
    closeProxyView(view.id);
    onClose?.();
  }, [closeProxyView, view.id, onClose]);

  const handleRefresh = useCallback(() => {
    if (webviewRef.current) {
      setIsLoading(true);
      setError(null);
      webviewRef.current.reload();
    }
  }, []);

  const handleNavigate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const newPath = inputPath.startsWith('/') ? inputPath : `/${inputPath}`;
      setCurrentPath(newPath);
      setIsLoading(true);
      setError(null);
      if (webviewRef.current) {
        webviewRef.current.src = getUrl(newPath);
      }
    },
    [inputPath, getUrl]
  );

  const handleOpenExternal = useCallback(() => {
    const url = `http://localhost:${view.port}${currentPath}`;
    window.open(url, '_blank');
  }, [view.port, currentPath]);

  // Update input when path changes
  useEffect(() => {
    setInputPath(currentPath);
  }, [currentPath]);

  // Setup webview event listeners
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // Handle console messages from the webview
    const handleConsoleMessage = (e: Electron.ConsoleMessageEvent) => {
      const level = WEBVIEW_LEVEL_MAP[e.level] || 'log';
      addConsoleEntry(view.id, {
        level,
        message: e.message,
        timestamp: Date.now(),
        source: e.sourceId,
        line: e.line,
      });
    };

    // Handle load events
    const handleDidStartLoading = () => {
      setIsLoading(true);
      setError(null);
    };

    const handleDidStopLoading = () => {
      setIsLoading(false);
    };

    const handleDidFailLoad = (e: Electron.DidFailLoadEvent) => {
      // Ignore aborted loads (e.g., navigation before page finished)
      if (e.errorCode === -3) return;
      setIsLoading(false);
      setError(
        t('proxy.connectionError', 'Failed to connect to port {{port}}', { port: view.port })
      );
    };

    // Handle context menu for copying HTML
    const handleContextMenuAsync = async (e: Electron.ContextMenuEvent) => {
      if (!devToolsState.inspectorEnabled) return;

      try {
        // Get element info at click position
        const elementInfo = (await webview.executeJavaScript(`
          (function() {
            const el = document.elementFromPoint(${e.params.x}, ${e.params.y});
            if (!el) return null;

            const rect = el.getBoundingClientRect();
            return {
              tagName: el.tagName,
              outerHTML: el.outerHTML.substring(0, 10000),
              innerHTML: el.innerHTML.substring(0, 5000),
              textContent: (el.textContent || '').substring(0, 1000),
              id: el.id || undefined,
              classNames: Array.from(el.classList),
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            };
          })()
        `)) as ElementInfo | null;

        if (elementInfo) {
          showContextMenu({ x: e.params.x, y: e.params.y }, elementInfo);
        }
      } catch (err) {
        console.error('Failed to get element info:', err);
      }
    };

    // Wrapper to handle async function in event listener
    const handleContextMenu = (e: Electron.ContextMenuEvent) => {
      void handleContextMenuAsync(e);
    };

    webview.addEventListener('console-message', handleConsoleMessage);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad);
    webview.addEventListener('context-menu', handleContextMenu);

    return () => {
      webview.removeEventListener('console-message', handleConsoleMessage);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad);
      webview.removeEventListener('context-menu', handleContextMenu);
    };
  }, [view.id, view.port, addConsoleEntry, devToolsState.inspectorEnabled, showContextMenu, t]);

  // Handle inspector mode - inject highlight script
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    if (devToolsState.inspectorEnabled) {
      // Inject inspector highlight script
      void webview.executeJavaScript(`
        (function() {
          if (window.__inspectorCleanup) window.__inspectorCleanup();

          const overlay = document.createElement('div');
          overlay.id = '__inspector-overlay';
          overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;border:2px solid #f97316;background:rgba(249,115,22,0.1);display:none;';
          document.body.appendChild(overlay);

          const handleMouseMove = (e) => {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (el && el !== overlay) {
              const rect = el.getBoundingClientRect();
              overlay.style.left = rect.left + 'px';
              overlay.style.top = rect.top + 'px';
              overlay.style.width = rect.width + 'px';
              overlay.style.height = rect.height + 'px';
              overlay.style.display = 'block';
            }
          };

          document.addEventListener('mousemove', handleMouseMove);

          window.__inspectorCleanup = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            overlay.remove();
            delete window.__inspectorCleanup;
          };
        })()
      `);
    } else {
      // Remove inspector
      void webview.executeJavaScript(`
        if (window.__inspectorCleanup) window.__inspectorCleanup();
      `);
    }
  }, [devToolsState.inspectorEnabled]);

  // Handle context menu actions
  const handleContextMenuAction = useCallback(
    async (action: ContextMenuAction) => {
      if (!contextMenuElement) return;

      switch (action) {
        case 'copy-html':
          await navigator.clipboard.writeText(contextMenuElement.outerHTML);
          break;
        case 'copy-text':
          await navigator.clipboard.writeText(contextMenuElement.textContent);
          break;
        case 'send-to-terminal':
          // Send HTML to active terminal instance
          // This will be implemented when we add the IPC channel
          if (view.instanceId && window.electronAPI?.instance) {
            try {
              await window.electronAPI.instance.sendInput(
                view.instanceId,
                contextMenuElement.outerHTML
              );
            } catch (err) {
              console.error('Failed to send to terminal:', err);
            }
          }
          break;
        case 'inspect':
          toggleInspector(view.id);
          break;
      }
    },
    [contextMenuElement, view.instanceId, view.id, toggleInspector]
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Navigation bar */}
      <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        {/* Port indicator */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-claude-orange/10 text-claude-orange text-sm font-medium">
          <GlobeIcon className="w-4 h-4" />
          <span>:{view.port}</span>
        </div>

        {/* Path input */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center gap-1">
          <input
            type="text"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            className="flex-1 px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-claude-orange/50"
            placeholder="/"
          />
        </form>

        {/* DevTools toolbar */}
        <InspectorToolbar viewId={view.id} />

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            title={t('proxy.refresh', 'Refresh')}
            disabled={isLoading}
          >
            <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            title={t('proxy.openExternal', 'Open in browser')}
          >
            <ExternalLinkIcon className="w-4 h-4" />
          </button>

          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-400 hover:text-red-600"
            title={t('common.close', 'Close')}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <RefreshIcon className="w-5 h-5 animate-spin" />
              <span>{t('common.loading', 'Loading...')}</span>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-10">
            <div className="text-center p-4">
              <div className="text-red-500 dark:text-red-400 mb-2">{error}</div>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 rounded bg-claude-orange text-white hover:bg-claude-orange/90"
              >
                {t('proxy.retry', 'Retry')}
              </button>
            </div>
          </div>
        )}

        {/* Webview - uses Electron's webview tag */}
        <webview
          ref={webviewRef as React.RefObject<Electron.WebviewTag>}
          src={getUrl(view.path)}
          className="w-full h-full"
          /* Security settings for Electron webview - use @ts-ignore since
             TypeScript's React types don't include Electron webview attributes */
          // @ts-expect-error - Electron webview attribute
          // eslint-disable-next-line react/no-unknown-property
          nodeintegration="false"
          // @ts-expect-error - Electron webview attribute
          // eslint-disable-next-line react/no-unknown-property
          allowpopups="false"
        />
      </div>

      {/* Console panel */}
      <ConsolePanel viewId={view.id} />

      {/* Context menu */}
      <DevToolsContextMenu
        position={contextMenuPosition}
        element={contextMenuElement}
        onAction={handleContextMenuAction}
        onClose={hideContextMenu}
      />
    </div>
  );
}
