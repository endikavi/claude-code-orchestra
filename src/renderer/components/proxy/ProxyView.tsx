import { useMemo } from 'react';
import type { ProxyView as ProxyViewType } from '@shared/types';
import { ProxyViewElectron } from './ProxyViewElectron';
import { ProxyViewWeb } from './ProxyViewWeb';

interface ProxyViewProps {
  view: ProxyViewType;
  onClose?: () => void;
}

/**
 * Detect if we're running in a true Electron context where webview is available.
 * This checks if we're in the actual Electron app, not just Vite dev server.
 */
function isElectronMode(): boolean {
  // Check for Electron-specific APIs AND that we're not in a browser dev server
  if (typeof window === 'undefined') return false;

  // Check if electronAPI exists and has the expected structure
  if (!('electronAPI' in window)) return false;

  // In Vite dev mode (browser), electronAPI won't be functional
  // Check for Electron's process object in renderer
  const electronProcess = (window as { process?: { type?: string } }).process;
  const hasElectronProcess =
    typeof electronProcess !== 'undefined' && electronProcess?.type === 'renderer';

  // Also check if we're running from Vite dev server
  const isViteDev = window.location.port === '5173' || window.location.port === '5174';

  return hasElectronProcess && !isViteDev;
}

/**
 * Detect if we're running in web client mode (remote access via WebSocket proxy).
 */
function isWebClientMode(): boolean {
  return typeof window !== 'undefined' && 'webAPI' in window;
}

/**
 * ProxyView component that automatically selects the appropriate
 * implementation based on the runtime environment:
 *
 * - Electron mode: Uses <webview> with native console-message events
 * - Web client mode: Uses <iframe> with script injection via proxy
 *
 * In Electron, we access localhost directly (no proxy needed).
 * In web mode, all requests go through the proxy server which
 * injects the devtools script into HTML responses.
 */
export function ProxyView({ view, onClose }: ProxyViewProps) {
  const mode = useMemo(() => {
    // In Vite dev mode, always use web mode (iframe with proxy)
    const isViteDev = window.location.port === '5173' || window.location.port === '5174';
    if (isViteDev) return 'web';

    if (isElectronMode()) return 'electron';
    if (isWebClientMode()) return 'web';
    return 'web'; // Default to web mode for safety
  }, []);

  if (mode === 'web') {
    return <ProxyViewWeb view={view} onClose={onClose} />;
  }

  return <ProxyViewElectron view={view} onClose={onClose} />;
}
