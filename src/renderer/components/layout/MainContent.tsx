import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
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
import { StructuredView } from '../structured/StructuredView';
import { EmptyState } from '../common/EmptyState';
import { ConversationHistory } from '../conversations/ConversationHistory';
import { ConversationViewer } from '../conversations/ConversationViewer';
import { MobileKeyboard } from '../terminal/MobileKeyboard';
import { ModeToggleButton } from '../terminal/ModeToggleButton';

export function MainContent() {
  const { t } = useTranslation();
  const { selectedProjectId } = useProjectStore();
  const { selectedInstanceId, getInstancesByProject, selectedShellId } = useInstanceStore();
  const { viewingConversation } = useConversationStore();
  const {
    viewMode,
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

  const projectInstances = selectedProjectId ? getInstancesByProject(selectedProjectId) : [];
  const hasInstances = projectInstances.length > 0;
  const isViewingHistory = viewMode === 'structured' && viewingConversation !== null;

  return (
    <main className="flex-1 flex flex-col bg-claude-cream dark:bg-gray-900 overflow-hidden">
      {selectedProjectId ? (
        <>
          {/* Instance tabs - hide when viewing history in structured mode */}
          {!isViewingHistory && <InstanceTabs />}

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            {isViewingHistory ? (
              <ConversationViewer />
            ) : selectedShellId ? (
              // Shell is selected - always show terminal view for shell
              <ShellTerminalView key={selectedShellId} shellId={selectedShellId} />
            ) : hasInstances && selectedInstanceId ? (
              viewMode === 'terminal' ? (
                <TerminalView key={selectedInstanceId} instanceId={selectedInstanceId} />
              ) : (
                <StructuredView key={selectedInstanceId} instanceId={selectedInstanceId} />
              )
            ) : (
              <ConversationHistory
                projectId={selectedProjectId}
                onNewConversation={() => setShowInstanceModal(true)}
              />
            )}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<FolderEmptyIcon />}
          title={t('emptyState.noProjectSelected')}
          description={t('emptyState.selectProject')}
          action={{
            label: t('project.addProject'),
            onClick: () => setShowProjectModal(true),
          }}
        />
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

      {/* Mode toggle button for Claude instances */}
      {selectedInstanceId && viewMode === 'terminal' && !selectedShellId && (
        <ModeToggleButton instanceId={selectedInstanceId} />
      )}

      {/* Mobile keyboard for terminal interaction */}
      {isMobile && selectedInstanceId && viewMode === 'terminal' && !selectedShellId && (
        <MobileKeyboard instanceId={selectedInstanceId} />
      )}
      {/* Note: Shell terminals use direct input, no mobile keyboard needed */}
    </main>
  );
}

function FolderEmptyIcon() {
  return (
    <svg
      className="w-16 h-16 text-gray-400 dark:text-gray-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}
