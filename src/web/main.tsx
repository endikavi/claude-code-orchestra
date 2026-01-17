// Set web version flag BEFORE any imports that might use it
// This must be at the very top so TitleBar and other components can detect web mode
(window as unknown as { __WEB_VERSION__: boolean }).__WEB_VERSION__ = true;

import React from 'react';
import ReactDOM from 'react-dom/client';
import { WebApp } from './WebApp';
import '@renderer/styles/index.css';
import '@renderer/i18n';

// Apply persisted theme immediately to prevent flash of default theme
try {
  const stored = localStorage.getItem('claude-code-orchestra-ui');
  if (stored) {
    const { state } = JSON.parse(stored) as { state?: { theme?: string } };
    if (state?.theme) {
      document.documentElement.classList.toggle('dark', state.theme === 'dark');
    }
  }
} catch {
  // Default to dark theme if localStorage read fails
  document.documentElement.classList.add('dark');
}

// Mount the web app
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <WebApp />
  </React.StrictMode>
);
