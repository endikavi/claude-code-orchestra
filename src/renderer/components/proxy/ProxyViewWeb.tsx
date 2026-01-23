import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProxyStore } from '../../stores/proxyStore';
import { ConsolePanel } from './ConsolePanel';
import { InspectorToolbar } from './InspectorToolbar';
import { DevToolsContextMenu, useDevToolsContextMenu } from './DevToolsContextMenu';
import type { ProxyView as ProxyViewType } from '@shared/types';
import type {
  ContextMenuAction,
  DevToolsMessage,
  ConsoleMessagePayload,
  ContextMenuPayload,
} from '@shared/types/devtools';

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

interface ProxyViewWebProps {
  view: ProxyViewType;
  onClose?: () => void;
}

/**
 * ProxyViewWeb component uses an iframe with script injection
 * for console capture when running in web client mode.
 *
 * The proxy server injects a script that:
 * - Intercepts console.log/warn/error/info calls
 * - Sends them to parent via postMessage
 * - Handles context menu for element inspection
 */
export function ProxyViewWeb({ view, onClose }: ProxyViewWebProps) {
  const { t } = useTranslation();
  const { closeProxyView, addConsoleEntry, getDevToolsState, toggleInspector } = useProxyStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentPath, setCurrentPath] = useState(view.path);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState(view.path);

  const devToolsState = getDevToolsState(view.id);

  // Context menu state
  const { contextMenuPosition, contextMenuElement, showContextMenu, hideContextMenu } =
    useDevToolsContextMenu();

  // Build the proxy URL (through the web server's proxy endpoint)
  const getProxyUrl = useCallback(
    (path: string) => {
      // Add devtools injection flag
      const params = new URLSearchParams();
      params.set('__devtools', '1');
      params.set('__viewId', view.id);
      if (devToolsState.inspectorEnabled) {
        params.set('__inspector', '1');
      }
      const queryString = params.toString();
      const separator = path.includes('?') ? '&' : '?';
      return `/api/proxy/${view.port}${path}${separator}${queryString}`;
    },
    [view.port, view.id, devToolsState.inspectorEnabled]
  );

  const handleClose = useCallback(() => {
    closeProxyView(view.id);
    onClose?.();
  }, [closeProxyView, view.id, onClose]);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current) {
      setIsLoading(true);
      setError(null);
      iframeRef.current.src = getProxyUrl(currentPath);
    }
  }, [currentPath, getProxyUrl]);

  const handleNavigate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const newPath = inputPath.startsWith('/') ? inputPath : `/${inputPath}`;
      setCurrentPath(newPath);
      setIsLoading(true);
      setError(null);
    },
    [inputPath]
  );

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setError(t('proxy.connectionError', 'Failed to connect to port {{port}}', { port: view.port }));
  }, [view.port, t]);

  const handleOpenExternal = useCallback(() => {
    // Open via proxy URL so it can be accessed remotely
    const url = `${window.location.origin}/api/proxy/${view.port}${currentPath}`;
    window.open(url, '_blank');
  }, [view.port, currentPath]);

  // Update input when path changes
  useEffect(() => {
    setInputPath(currentPath);
  }, [currentPath]);

  // Initial load and reload on path change
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.src = getProxyUrl(currentPath);
    }
  }, [currentPath, getProxyUrl]);

  // Listen for postMessage from injected devtools script
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin - should be same origin for proxied content
      if (event.origin !== window.location.origin) return;

      try {
        const message = event.data as DevToolsMessage;
        if (!message || !message.type) return;

        // Check if message is for this view
        const viewId = (message as unknown as { viewId?: string }).viewId;
        if (viewId && viewId !== view.id) return;

        switch (message.type) {
          case 'console': {
            const payload = message.payload as ConsoleMessagePayload;
            addConsoleEntry(view.id, {
              level: payload.level,
              message: payload.message,
              timestamp: message.timestamp,
              source: payload.source,
              line: payload.line,
              column: payload.column,
              stack: payload.stack,
            });
            break;
          }
          case 'context-menu': {
            const payload = message.payload as ContextMenuPayload;
            showContextMenu({ x: payload.x, y: payload.y }, payload.element);
            break;
          }
          case 'ready':
            // Script injected and ready
            break;
        }
      } catch {
        // Invalid message format, ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [view.id, addConsoleEntry, showContextMenu]);

  // Send inspector state to iframe
  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;

    try {
      iframeRef.current.contentWindow.postMessage(
        {
          type: devToolsState.inspectorEnabled ? 'enable-inspector' : 'disable-inspector',
        },
        '*'
      );
    } catch {
      // Cross-origin error, will be handled by page reload
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
          // In web mode, we need to send via WebSocket
          // This would be handled by the webAPI bridge
          if (view.instanceId && 'webAPI' in window) {
            try {
              const webAPI = (
                window as unknown as {
                  webAPI: { instance: { sendInput: (id: string, text: string) => Promise<void> } };
                }
              ).webAPI;
              await webAPI.instance.sendInput(view.instanceId, contextMenuElement.outerHTML);
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
      <div className="flex-1 relative">
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

        {/* iframe */}
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          title={view.title || `Preview :${view.port}`}
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
