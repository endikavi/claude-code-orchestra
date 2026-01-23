/**
 * DevTools Inspector Script
 *
 * This script is injected into proxied HTML pages to enable:
 * - Console interception (log, warn, error, info, debug)
 * - Element highlighting on hover (inspector mode)
 * - Context menu for copying HTML
 *
 * Communication with parent frame via postMessage.
 */

/**
 * Generate the devtools injection script.
 * @param viewId - The proxy view ID for routing messages
 * @param inspectorEnabled - Whether inspector highlighting should be enabled
 */
export function generateInspectorScript(viewId: string, inspectorEnabled: boolean): string {
  // The script is self-contained and runs in the page context
  return `
(function() {
  'use strict';

  // Prevent double injection
  if (window.__devtoolsInjected) return;
  window.__devtoolsInjected = true;

  const VIEW_ID = ${JSON.stringify(viewId)};
  let inspectorEnabled = ${inspectorEnabled};

  // Generate unique message ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  // Send message to parent frame
  function sendMessage(type, payload) {
    try {
      window.parent.postMessage({
        type: type,
        id: generateId(),
        timestamp: Date.now(),
        viewId: VIEW_ID,
        payload: payload
      }, '*');
    } catch (e) {
      // Cross-origin error, ignore
    }
  }

  // ========== Console Interception ==========
  const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console)
  };

  function formatArgs(args) {
    return args.map(function(arg) {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
  }

  function getCallSite() {
    try {
      const err = new Error();
      const stack = err.stack || '';
      const lines = stack.split('\\n');
      // Skip Error, wrapper, and console method lines
      for (let i = 3; i < lines.length; i++) {
        const line = lines[i];
        // Skip internal frames
        if (line.includes('__devtools')) continue;
        // Extract URL and line number
        const match = line.match(/(?:at\\s+)?(?:.*\\s+)?(?:\\()?([^\\s()]+):(\\d+):(\\d+)\\)?/);
        if (match) {
          return {
            source: match[1],
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10)
          };
        }
      }
    } catch (e) {}
    return {};
  }

  function createInterceptor(level) {
    return function() {
      const args = Array.prototype.slice.call(arguments);
      const callSite = getCallSite();

      // Call original
      originalConsole[level].apply(console, args);

      // Send to parent
      sendMessage('console', {
        level: level,
        message: formatArgs(args),
        source: callSite.source,
        line: callSite.line,
        column: callSite.column
      });
    };
  }

  console.log = createInterceptor('log');
  console.warn = createInterceptor('warn');
  console.error = createInterceptor('error');
  console.info = createInterceptor('info');
  console.debug = createInterceptor('debug');

  // Also capture unhandled errors
  window.addEventListener('error', function(event) {
    sendMessage('console', {
      level: 'error',
      message: event.message || 'Unknown error',
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error ? event.error.stack : undefined
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var message = reason instanceof Error ? reason.message : String(reason);
    var stack = reason instanceof Error ? reason.stack : undefined;

    sendMessage('console', {
      level: 'error',
      message: 'Unhandled Promise Rejection: ' + message,
      stack: stack
    });
  });

  // ========== Element Inspector ==========
  var overlay = null;

  function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = '__devtools-overlay';
    overlay.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 2147483647',
      'border: 2px solid #f97316',
      'background: rgba(249, 115, 22, 0.1)',
      'display: none',
      'box-sizing: border-box'
    ].join(';');
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  function getElementInfo(el) {
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return {
      tagName: el.tagName,
      outerHTML: el.outerHTML.substring(0, 10000),
      innerHTML: el.innerHTML.substring(0, 5000),
      textContent: (el.textContent || '').substring(0, 1000),
      id: el.id || undefined,
      classNames: Array.from(el.classList || []),
      styles: {
        width: style.width,
        height: style.height,
        display: style.display,
        position: style.position
      },
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  }

  function handleMouseMove(e) {
    if (!inspectorEnabled || !overlay) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== overlay) {
      var rect = el.getBoundingClientRect();
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.display = 'block';
    }
  }

  function handleContextMenu(e) {
    if (!inspectorEnabled) return;

    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay) return;

    e.preventDefault();

    // Get element position relative to viewport for menu positioning
    var elementInfo = getElementInfo(el);

    sendMessage('context-menu', {
      x: e.clientX,
      y: e.clientY,
      element: elementInfo
    });
  }

  function enableInspector() {
    inspectorEnabled = true;
    createOverlay();
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
  }

  function disableInspector() {
    inspectorEnabled = false;
    removeOverlay();
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('contextmenu', handleContextMenu, true);
  }

  // Initialize inspector state
  if (inspectorEnabled) {
    enableInspector();
  }

  // ========== Listen for commands from parent ==========
  window.addEventListener('message', function(event) {
    // Only accept messages from our parent
    if (event.source !== window.parent) return;

    var data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'enable-inspector':
        enableInspector();
        break;
      case 'disable-inspector':
        disableInspector();
        break;
      case 'get-element-at':
        var x = data.x || 0;
        var y = data.y || 0;
        var targetEl = document.elementFromPoint(x, y);
        sendMessage('element-info', getElementInfo(targetEl));
        break;
    }
  });

  // Notify parent that script is ready
  sendMessage('ready', { viewId: VIEW_ID });
})();
`;
}

/**
 * Generate a minified version of the script for production.
 * For now, we'll use the same script but could minify in the future.
 */
export function getInspectorScriptMinified(viewId: string, inspectorEnabled: boolean): string {
  // In production, this could be a pre-minified version
  return generateInspectorScript(viewId, inspectorEnabled);
}

/**
 * Wrap the script in a <script> tag for HTML injection.
 */
export function getInspectorScriptTag(viewId: string, inspectorEnabled: boolean): string {
  const script = generateInspectorScript(viewId, inspectorEnabled);
  return `<script>${script}</script>`;
}
