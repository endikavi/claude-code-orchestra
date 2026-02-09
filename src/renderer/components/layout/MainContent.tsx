import { useMemo, lazy, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useConversationStore } from '../../stores/conversationStore';
import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
const ProjectModal = lazy(() =>
  import('../projects/ProjectModal').then((m) => ({ default: m.ProjectModal }))
);
const LocalSettingsModal = lazy(() =>
  import('../projects/LocalSettingsModal').then((m) => ({ default: m.LocalSettingsModal }))
);
const InstanceModal = lazy(() =>
  import('../instances/InstanceModal').then((m) => ({ default: m.InstanceModal }))
);
const SettingsModal = lazy(() =>
  import('../settings/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);

import { InstanceTabs } from '../instances/InstanceTabs';
import { TerminalView } from '../terminal/TerminalView';
import { ShellTerminalView } from '../terminal/ShellTerminalView';
import { SplitTerminalView } from '../terminal/SplitTerminalView';
import { StructuredView } from '../structured/StructuredView';
import { ConversationHistory } from '../conversations/ConversationHistory';
import { ProjectContentTabs } from '../ralphTasks/ProjectContentTabs';
import { ConversationViewer } from '../conversations/ConversationViewer';
import { MobileKeyboard } from '../terminal/MobileKeyboard';
import { OrchestraView } from '../orchestration/OrchestraView';
import { useEditorStore } from '../../stores/editorStore';
import { EditorView } from '../editor';

export function MainContent() {
  const { selectedProjectId } = useProjectStore(
    useShallow((s) => ({
      selectedProjectId: s.selectedProjectId,
    }))
  );
  const {
    instances: allInstances,
    selectedInstanceId,
    getInstancesByProject,
    selectedShellId,
    activeSplitId,
    getActiveSplit,
    removingInstanceIds,
  } = useInstanceStore(
    useShallow((s) => ({
      instances: s.instances,
      selectedInstanceId: s.selectedInstanceId,
      getInstancesByProject: s.getInstancesByProject,
      selectedShellId: s.selectedShellId,
      activeSplitId: s.activeSplitId,
      getActiveSplit: s.getActiveSplit,
      removingInstanceIds: s.removingInstanceIds,
    }))
  );
  const { globalInstances, isConnected: clusterConnected } = useClusterStore(
    useShallow((s) => ({
      globalInstances: s.globalInstances,
      isConnected: s.isConnected,
    }))
  );
  const viewingConversation = useConversationStore((s) => s.viewingConversation);
  const {
    showProjectModal,
    showInstanceModal,
    showSettingsModal,
    showLocalSettingsModal,
    localSettingsProjectPath,
    setShowProjectModal,
    setShowInstanceModal,
    setShowSettingsModal,
    setShowLocalSettingsModal,
    viewMode: defaultViewMode,
  } = useUIStore(
    useShallow((s) => ({
      showProjectModal: s.showProjectModal,
      showInstanceModal: s.showInstanceModal,
      showSettingsModal: s.showSettingsModal,
      showLocalSettingsModal: s.showLocalSettingsModal,
      localSettingsProjectPath: s.localSettingsProjectPath,
      setShowProjectModal: s.setShowProjectModal,
      setShowInstanceModal: s.setShowInstanceModal,
      setShowSettingsModal: s.setShowSettingsModal,
      setShowLocalSettingsModal: s.setShowLocalSettingsModal,
      viewMode: s.viewMode,
    }))
  );
  const isMobile = useIsMobile();
  const { activeFilePath: activeEditorFile, openFiles: editorOpenFiles } = useEditorStore(
    useShallow((s) => ({
      activeFilePath: s.activeFilePath,
      openFiles: s.openFiles,
    }))
  );

  // Only show editor if active file belongs to the current project
  const selectedProject = useProjectStore((s) => s.getSelectedProject());
  const activeEditorFileForProject = useMemo(() => {
    if (!activeEditorFile || !selectedProject) return null;
    const file = editorOpenFiles.find((f) => f.relativePath === activeEditorFile);
    return file?.projectPath === selectedProject.path ? activeEditorFile : null;
  }, [activeEditorFile, editorOpenFiles, selectedProject]);

  // Get instances from local or global instances
  const projectInstances = useMemo(() => {
    if (!selectedProjectId) return [];

    // Get local instances for this project
    const local = getInstancesByProject(selectedProjectId);

    // If cluster is connected, also get global instances for this project
    let combined;
    if (clusterConnected) {
      const global = globalInstances.filter((i) => i.projectId === selectedProjectId && !i.isLocal);
      // Combine, avoiding duplicates (prefer local if same id)
      const localIds = new Set(local.map((i) => i.id));
      combined = [...local, ...global.filter((i) => !localIds.has(i.id))];
    } else {
      combined = local;
    }

    // Filter out instances that are being removed (prevents ghost tabs)
    return combined.filter((i) => !removingInstanceIds.has(i.id));
    // Note: allInstances is included to trigger recalculation when instances change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProjectId,
    getInstancesByProject,
    clusterConnected,
    globalInstances,
    allInstances,
    removingInstanceIds,
  ]);

  const hasInstances = projectInstances.length > 0;

  // View mode for instances - use the instance's viewMode (set at creation time)
  // Fallback to the global viewMode setting if the instance doesn't have one
  const selectedInstance = projectInstances.find((i) => i.id === selectedInstanceId);
  const effectiveViewMode = selectedInstance?.viewMode ?? defaultViewMode;

  const isViewingHistory = viewingConversation !== null;

  // Get active split if any
  const activeSplit = getActiveSplit();

  return (
    <main className="flex-1 flex flex-col bg-gray-100 dark:bg-neutral-950 overflow-hidden">
      {selectedProjectId ? (
        <>
          {/* Header with tabs */}
          {!isViewingHistory && <InstanceTabs />}

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            {isViewingHistory ? (
              <ConversationViewer />
            ) : activeSplitId && activeSplit ? (
              // Split view is active - show two terminals side by side
              <SplitTerminalView key={activeSplitId} split={activeSplit} />
            ) : selectedShellId ? (
              // Shell is selected - always show terminal view for shell
              <ShellTerminalView key={selectedShellId} shellId={selectedShellId} />
            ) : activeEditorFileForProject ? (
              // Editor file is active (scoped to current project)
              <EditorView />
            ) : hasInstances && selectedInstanceId ? (
              effectiveViewMode === 'terminal' ? (
                <TerminalView key={selectedInstanceId} instanceId={selectedInstanceId} />
              ) : (
                <StructuredView key={selectedInstanceId} instanceId={selectedInstanceId} />
              )
            ) : (
              <ProjectContentTabs
                projectId={selectedProjectId}
                onNewConversation={() => setShowInstanceModal(true)}
              />
            )}
          </div>
        </>
      ) : (
        // Home view: Orchestra dashboard (subagent tracking)
        <OrchestraView />
      )}

      {/* Modals */}
      {showProjectModal && (
        <Suspense fallback={null}>
          <ProjectModal onClose={() => setShowProjectModal(false)} />
        </Suspense>
      )}
      {showInstanceModal && selectedProjectId && (
        <Suspense fallback={null}>
          <InstanceModal
            projectId={selectedProjectId}
            onClose={() => setShowInstanceModal(false)}
          />
        </Suspense>
      )}
      {showSettingsModal && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setShowSettingsModal(false)} />
        </Suspense>
      )}
      {showLocalSettingsModal && localSettingsProjectPath && (
        <Suspense fallback={null}>
          <LocalSettingsModal
            projectPath={localSettingsProjectPath}
            onClose={() => setShowLocalSettingsModal(false)}
          />
        </Suspense>
      )}

      {/* Mobile keyboard for terminal interaction */}
      {isMobile && selectedInstanceId && effectiveViewMode === 'terminal' && !selectedShellId && (
        <MobileKeyboard instanceId={selectedInstanceId} />
      )}
      {/* Note: Shell terminals use direct input, no mobile keyboard needed */}
    </main>
  );
}
