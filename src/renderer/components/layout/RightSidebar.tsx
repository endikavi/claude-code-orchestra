import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { TasksPanel } from '../tasks';
import { TeamPanel } from '../teams/TeamPanel';

export function RightSidebar() {
  const rightPanelMode = useUIStore((s) => s.rightPanelMode);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const isMobile = useIsMobile();

  if (rightPanelMode === 'none') return null;

  const panelContent =
    rightPanelMode === 'teams' ? (
      <TeamPanel onClose={() => toggleRightPanel('teams')} />
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
        <div className="fixed inset-0 z-50 bg-white dark:bg-neutral-950">{panelContent}</div>
      </>
    );
  }

  // Desktop: inline side panel
  return (
    <div className="w-80 shrink-0 border-l border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-950/50 overflow-hidden">
      {panelContent}
    </div>
  );
}
