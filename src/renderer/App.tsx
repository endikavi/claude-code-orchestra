import { useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { MainContent } from './components/layout/MainContent';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useProjectStore } from './stores/projectStore';
import { useInstanceStore } from './stores/instanceStore';
import { useUIStore } from './stores/uiStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const setupListeners = useInstanceStore((state) => state.setupListeners);
  const initializeFromMain = useUIStore((state) => state.initializeFromMain);

  // Setup keyboard shortcuts
  useKeyboardShortcuts();

  const loadInstances = useInstanceStore((state) => state.loadInstances);

  useEffect(() => {
    // Initialize UI settings from main process (Electron only)
    void initializeFromMain();

    // Load projects and instances on mount
    void loadProjects();
    void loadInstances();

    // Setup instance listeners
    const cleanup = setupListeners();

    return () => {
      cleanup();
    };
  }, [loadProjects, loadInstances, setupListeners, initializeFromMain]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-claude-cream dark:bg-gray-900 text-gray-800 dark:text-white overflow-hidden">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <ErrorBoundary>
            <Sidebar />
          </ErrorBoundary>
          <ErrorBoundary>
            <MainContent />
          </ErrorBoundary>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
