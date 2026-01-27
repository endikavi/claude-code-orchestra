import { useMemo } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useConversationStore } from '../../stores/conversationStore';
import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { ProjectModal } from '../projects/ProjectModal';
import { LocalSettingsModal } from '../projects/LocalSettingsModal';
import { InstanceModal } from '../instances/InstanceModal';
import { SettingsModal } from '../settings/SettingsModal';
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

export function MainContent() {
  const { selectedProjectId } = useProjectStore();
  const {
    instances: allInstances,
    selectedInstanceId,
    getInstancesByProject,
    selectedShellId,
    activeSplitId,
    getActiveSplit,
    removingInstanceIds,
  } = useInstanceStore();
  const { globalInstances, isConnected: clusterConnected } = useClusterStore();
  const { viewingConversation } = useConversationStore();
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
  } = useUIStore();
  const isMobile = useIsMobile();

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

  // View mode for instances - always terminal for interactive use
  const effectiveViewMode = 'terminal';

  const isViewingHistory = viewingConversation !== null;

  // Get active split if any
  const activeSplit = getActiveSplit();

  return (
    <main className="flex-1 flex flex-col bg-claude-cream dark:bg-gray-900 overflow-hidden">
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
      {showProjectModal && <ProjectModal onClose={() => setShowProjectModal(false)} />}
      {showInstanceModal && selectedProjectId && (
        <InstanceModal projectId={selectedProjectId} onClose={() => setShowInstanceModal(false)} />
      )}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
      {showLocalSettingsModal && localSettingsProjectPath && (
        <LocalSettingsModal
          projectPath={localSettingsProjectPath}
          onClose={() => setShowLocalSettingsModal(false)}
        />
      )}

      {/* Mobile keyboard for terminal interaction */}
      {isMobile && selectedInstanceId && effectiveViewMode === 'terminal' && !selectedShellId && (
        <MobileKeyboard instanceId={selectedInstanceId} />
      )}
      {/* Note: Shell terminals use direct input, no mobile keyboard needed */}
    </main>
  );
}
