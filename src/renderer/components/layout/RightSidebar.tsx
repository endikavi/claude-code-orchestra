import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { TasksPanel } from '../tasks';
import { TeamPanel } from '../teams/TeamPanel';
import { FilesPanel } from '../files';

export function RightSidebar() {
  const rightPanelMode = useUIStore((s) => s.rightPanelMode);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const isMobile = useIsMobile();

  if (rightPanelMode === 'none') return null;

  const panelContent =
    rightPanelMode === 'teams' ? (
      <TeamPanel onClose={() => toggleRightPanel('teams')} />
    ) : rightPanelMode === 'files' ? (
      <FilesPanel onClose={() => toggleRightPanel('files')} />
    ) : (
      <TasksPanel onClose={() => toggleRightPanel('tasks')} />
    );

  // Mobile: overlay with backdrop
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => toggleRightPanel(rightPanelMode)}
        />
        <div className="fixed inset-0 z-50 bg-[var(--color-bg-subtle)]">{panelContent}</div>
      </>
    );
  }

  // Desktop: inline side panel
  return (
    <div className="w-80 shrink-0 border-l border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] overflow-hidden">
      {panelContent}
    </div>
  );
}
