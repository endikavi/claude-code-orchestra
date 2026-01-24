import { useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar } from './components/layout/Sidebar';
import { MainContent } from './components/layout/MainContent';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { TimerProvider } from './contexts/TimerContext';
import { useProjectStore } from './stores/projectStore';
import { useInstanceStore } from './stores/instanceStore';
import { useUIStore } from './stores/uiStore';
import { useClusterStore } from './stores/clusterStore';
import { useProxyStore } from './stores/proxyStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { setupOrchestrationEventListeners } from './stores/orchestrationStore';
import { setupTaskEventListeners } from './stores/taskStore';

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

  // Proxy store
  const loadProxyConfig = useProxyStore((state) => state.loadConfig);
  const setupProxyListeners = useProxyStore((state) => state.setupListeners);

  // Setup keyboard shortcuts
  useKeyboardShortcuts();

  const loadInstances = useInstanceStore((state) => state.loadInstances);

  useEffect(() => {
    // Initialize UI settings from main process (Electron only)
    initializeFromMain().catch((err) =>
      console.error('[App] Failed to initialize from main:', err)
    );

    // Load projects and instances on mount
    loadProjects().catch((err) => console.error('[App] Failed to load projects:', err));
    loadInstances().catch((err) => console.error('[App] Failed to load instances:', err));

    // Setup listeners for projects and instances
    const cleanupProjects = setupProjectListeners();
    const cleanupInstances = setupInstanceListeners();

    // Initialize cluster (load config, status, and setup listeners)
    loadClusterConfig()
      .then(() => {
        loadClusterStatus().catch((err) =>
          console.error('[App] Failed to load cluster status:', err)
        );
        loadGlobalProjects().catch((err) =>
          console.error('[App] Failed to load global projects:', err)
        );
      })
      .catch((err) => console.error('[App] Failed to load cluster config:', err));
    const cleanupCluster = setupClusterListeners();

    // Setup orchestration (subagent tracking) event listeners globally
    const cleanupOrchestration = setupOrchestrationEventListeners();

    // Setup task tracking event listeners globally
    const cleanupTasks = setupTaskEventListeners();

    // Initialize proxy store (load config and setup listeners)
    loadProxyConfig().catch((err) => console.error('[App] Failed to load proxy config:', err));
    const cleanupProxy = setupProxyListeners();

    return () => {
      cleanupProjects();
      cleanupInstances();
      cleanupCluster();
      cleanupOrchestration();
      cleanupTasks();
      cleanupProxy();
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
    loadProxyConfig,
    setupProxyListeners,
  ]);

  return (
    <ErrorBoundary>
      <TimerProvider>
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
      </TimerProvider>
    </ErrorBoundary>
  );
}

export default App;
