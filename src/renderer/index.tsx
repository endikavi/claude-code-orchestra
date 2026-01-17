import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './i18n';

// Apply initial theme to prevent flash
// For Electron: default to dark, actual setting will be loaded from main process
// For Web: read from localStorage if available
const isElectron =
  typeof window !== 'undefined' && window.electronAPI && 'uiSettings' in window.electronAPI;

if (!isElectron) {
  // Web version: try to read from localStorage
  try {
    const stored = localStorage.getItem('claude-code-orchestra-ui');
    if (stored) {
      const { state } = JSON.parse(stored) as { state?: { theme?: string } };
      if (state?.theme) {
        document.documentElement.classList.toggle('dark', state.theme === 'dark');
      } else {
        document.documentElement.classList.add('dark');
      }
    } else {
      document.documentElement.classList.add('dark');
    }
  } catch {
    document.documentElement.classList.add('dark');
  }
} else {
  // Electron: default to dark theme, will be updated after IPC load
  document.documentElement.classList.add('dark');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
