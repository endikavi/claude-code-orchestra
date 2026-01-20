import { useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { MainContent } from './components/layout/MainContent';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useProjectStore } from './stores/projectStore';
import { useInstanceStore } from './stores/instanceStore';
import { useUIStore } from './stores/uiStore';
import { useClusterStore } from './stores/clusterStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { setupOrchestrationEventListeners } from './stores/orchestrationStore';

function App() {
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const setupProjectListeners = useProjectStore((state) => state.setupListeners);
  const setupInstanceListeners = useInstanceStore((state) => state.setupListeners);
  const initializeFromMain = useUIStore((state) => state.initializeFromMain);

  // Cluster store
  const loadClusterConfig = useClusterStore((state) => state.loadConfig);
  const loadClusterStatus = useClusterStore((state) => state.loadStatus);
  const loadGlobalProjects = useClusterStore((state) => state.loadGlobalProjects);
  const setupClusterListeners = useClusterStore((state) => state.setupListeners);

  // Setup keyboard shortcuts
  useKeyboardShortcuts();

  const loadInstances = useInstanceStore((state) => state.loadInstances);

  useEffect(() => {
    // Initialize UI settings from main process (Electron only)
    void initializeFromMain();

    // Load projects and instances on mount
    void loadProjects();
    void loadInstances();

    // Setup listeners for projects and instances
    const cleanupProjects = setupProjectListeners();
    const cleanupInstances = setupInstanceListeners();

    // Initialize cluster (load config, status, and setup listeners)
    void loadClusterConfig().then(() => {
      void loadClusterStatus();
      void loadGlobalProjects();
    });
    const cleanupCluster = setupClusterListeners();

    // Setup orchestration (subagent tracking) event listeners globally
    const cleanupOrchestration = setupOrchestrationEventListeners();

    return () => {
      cleanupProjects();
      cleanupInstances();
      cleanupCluster();
      cleanupOrchestration();
    };
  }, [
    loadProjects,
    loadInstances,
    setupProjectListeners,
    setupInstanceListeners,
    initializeFromMain,
    loadClusterConfig,
    loadClusterStatus,
    loadGlobalProjects,
    setupClusterListeners,
  ]);

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
