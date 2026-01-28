import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useUIStore } from '../../stores/uiStore';
import { useProxyStore } from '../../stores/proxyStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { getStatusTabConfig } from '../../utils/statusConfig';
import { ContextMenu } from '../common/ContextMenu';
import type { InstanceStatus, ShellInstanceStatus, ClaudeInstance, SplitTab } from '@shared/types';

export function InstanceTabs() {
  const { t } = useTranslation();
  const { selectedProjectId, getSelectedProject } = useProjectStore();
  const {
    instances: allInstances,
    selectedInstanceId,
    selectInstance,
    getInstancesByProject,
    killInstance,
    selectedShellId,
    selectShell,
    getShellsByProject,
    killShellInstance,
    splitTabs,
    activeSplitId,
    createSplit,
    removeSplit,
    selectSplit,
    removingInstanceIds,
  } = useInstanceStore();
  const { globalProjects, globalInstances, isConnected: clusterConnected } = useClusterStore();
  const { setShowInstanceModal, viewMode, toggleViewMode } = useUIStore();
  const isMobile = useIsMobile();

  // Get project from local or global projects
  const project = useMemo(() => {
    // First try local project
    const localProject = getSelectedProject();
    if (localProject) return localProject;

    // If cluster is connected, try global projects
    if (clusterConnected && selectedProjectId) {
      return globalProjects.find((p) => p.id === selectedProjectId);
    }
    return undefined;
  }, [getSelectedProject, clusterConnected, selectedProjectId, globalProjects]);

  // Get instances from local or global instances
  const instances = useMemo((): ClaudeInstance[] => {
    if (!selectedProjectId) return [];

    // Get local instances for this project
    const local = getInstancesByProject(selectedProjectId);

    // If cluster is connected, also get global instances for this project
    let combined: ClaudeInstance[];
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

  const shells = useMemo(
    () => (selectedProjectId ? getShellsByProject(selectedProjectId) : []),
    [selectedProjectId, getShellsByProject]
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
    tabType: 'instance' | 'shell';
    tabIndex: number;
  } | null>(null);

  // Get IDs of instances/shells that are in splits
  const idsInSplits = useMemo(() => {
    const ids = new Set<string>();
    for (const split of splitTabs.values()) {
      ids.add(split.leftInstanceId);
      ids.add(split.rightInstanceId);
    }
    return ids;
  }, [splitTabs]);

  // Filter instances and shells that are NOT in splits
  const visibleInstances = useMemo(
    () => instances.filter((i) => !idsInSplits.has(i.id)),
    [instances, idsInSplits]
  );

  const visibleShells = useMemo(
    () => shells.filter((s) => !idsInSplits.has(s.id)),
    [shells, idsInSplits]
  );

  // Combined list of all tabs for determining split targets
  const allTabs = useMemo(() => {
    const tabs: Array<{ id: string; type: 'instance' | 'shell'; index: number }> = [];
    visibleInstances.forEach((i, idx) => tabs.push({ id: i.id, type: 'instance', index: idx }));
    visibleShells.forEach((s, idx) =>
      tabs.push({ id: s.id, type: 'shell', index: visibleInstances.length + idx })
    );
    return tabs;
  }, [visibleInstances, visibleShells]);

  // Handle context menu for tabs
  const handleTabContextMenu = (
    e: React.MouseEvent,
    tabId: string,
    tabType: 'instance' | 'shell',
    tabIndex: number
  ) => {
    e.preventDefault();
    // Disable splits on mobile
    if (isMobile) return;
    setContextMenu({ x: e.clientX, y: e.clientY, tabId, tabType, tabIndex });
  };

  // Handle split action
  const handleSplit = () => {
    if (!contextMenu) return;

    const currentTabIndex = allTabs.findIndex(
      (t) => t.id === contextMenu.tabId && t.type === contextMenu.tabType
    );
    const nextTab = allTabs[currentTabIndex + 1];

    if (nextTab) {
      createSplit(contextMenu.tabId, nextTab.id, contextMenu.tabType, nextTab.type);
    }
    setContextMenu(null);
  };

  // Check if split is available (there's a tab to the right)
  const canSplit = useMemo(() => {
    if (!contextMenu) return false;
    const currentTabIndex = allTabs.findIndex(
      (t) => t.id === contextMenu.tabId && t.type === contextMenu.tabType
    );
    return currentTabIndex < allTabs.length - 1;
  }, [contextMenu, allTabs]);

  // Get proxy views
  const { proxyViews } = useProxyStore();

  // Get title for an instance, shell, or proxy
  const getTabTitle = (id: string, type: 'instance' | 'shell' | 'proxy'): string => {
    if (type === 'instance') {
      const instance = instances.find((i) => i.id === id);
      return instance?.terminalTitle || instance?.prompt || 'New session';
    }
    if (type === 'proxy') {
      const proxyView = proxyViews.get(id);
      return proxyView?.title || `Preview :${proxyView?.port || '?'}`;
    }
    return 'Shell';
  };

  // Get status for an instance, shell, or proxy
  const getTabStatus = (
    id: string,
    type: 'instance' | 'shell' | 'proxy'
  ): InstanceStatus | ShellInstanceStatus => {
    if (type === 'instance') {
      const instance = instances.find((i) => i.id === id);
      return instance?.status || 'starting';
    }
    if (type === 'proxy') {
      // Proxy views are always "running"
      return 'running';
    }
    const shell = shells.find((s) => s.id === id);
    return shell?.status || 'running';
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2 pt-1.5 px-1.5 sm:pt-2 sm:px-2 bg-claude-beige dark:bg-gray-800 border-b border-claude-tan/30 dark:border-gray-700 overflow-x-auto scrollbar-hide">
      {/* Project name/icon - clickable to go to history */}
      {project && (
        <button
          onClick={() => {
            selectInstance(null);
            selectSplit(null);
          }}
          className={`flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 flex-shrink-0 hover:bg-claude-tan/20 dark:hover:bg-gray-700 rounded-md transition-colors cursor-pointer ${
            isMobile
              ? 'p-2 min-w-[44px] min-h-[44px] justify-center'
              : 'px-3 py-1 border-r border-claude-tan/30 dark:border-gray-700 pr-4'
          }`}
          title="View conversation history"
        >
          <div
            className="w-3 h-3 sm:w-2.5 sm:h-2.5 rounded-full"
            style={{ backgroundColor: project.color || '#6b7280' }}
          />
          {!isMobile && (
            <span className="font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
              {project.name}
            </span>
          )}
        </button>
      )}

      {/* Split tabs */}
      {Array.from(splitTabs.values()).map((split) => (
        <SplitTabComponent
          key={split.id}
          split={split}
          isSelected={activeSplitId === split.id}
          leftTitle={getTabTitle(split.leftInstanceId, split.leftType)}
          rightTitle={getTabTitle(split.rightInstanceId, split.rightType)}
          leftStatus={getTabStatus(split.leftInstanceId, split.leftType)}
          rightStatus={getTabStatus(split.rightInstanceId, split.rightType)}
          leftType={split.leftType}
          rightType={split.rightType}
          onSelect={() => selectSplit(split.id)}
          onClose={() => removeSplit(split.id)}
          isMobile={isMobile}
        />
      ))}

      {/* Instance tabs */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {visibleInstances.map((instance, index) => (
          <InstanceTab
            key={instance.id}
            id={instance.id}
            status={instance.status}
            prompt={instance.prompt}
            terminalTitle={instance.terminalTitle}
            isSelected={instance.id === selectedInstanceId && !selectedShellId && !activeSplitId}
            onSelect={() => {
              selectShell(null);
              selectSplit(null);
              selectInstance(instance.id);
            }}
            onClose={() => killInstance(instance.id)}
            onContextMenu={(e) => handleTabContextMenu(e, instance.id, 'instance', index)}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* Shell tabs */}
      {visibleShells.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {visibleShells.map((shell, index) => (
            <ShellTab
              key={shell.id}
              id={shell.id}
              status={shell.status}
              isSelected={shell.id === selectedShellId && !activeSplitId}
              onSelect={() => {
                selectInstance(null);
                selectSplit(null);
                selectShell(shell.id);
              }}
              onClose={() => killShellInstance(shell.id)}
              onContextMenu={(e) =>
                handleTabContextMenu(e, shell.id, 'shell', visibleInstances.length + index)
              }
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      {/* View mode toggle for new instances */}
      <button
        onClick={toggleViewMode}
        className="flex items-center gap-1 px-2 py-1.5 sm:py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-700 rounded transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 justify-center flex-shrink-0"
        title={
          viewMode === 'terminal'
            ? t('tabs.newInstancesTerminal', 'New instances: Terminal view')
            : t('tabs.newInstancesStructured', 'New instances: Structured view')
        }
      >
        {viewMode === 'terminal' ? (
          <TerminalIcon className="w-4 h-4" />
        ) : (
          <ChatBubbleIcon className="w-4 h-4" />
        )}
      </button>

      {/* New instance button */}
      <button
        onClick={() => setShowInstanceModal(true)}
        className="flex items-center gap-1 px-2 py-1.5 sm:py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-700 rounded transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 justify-center flex-shrink-0"
        title={t('tabs.newInstance', 'New instance')}
      >
        <PlusIcon className="w-4 h-4" />
      </button>

      {/* Context menu for split actions */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            ...(canSplit
              ? [
                  {
                    label: t('tabs.splitTerminal', 'Split terminal'),
                    onClick: handleSplit,
                    icon: <SplitIcon />,
                  },
                  { type: 'separator' as const },
                ]
              : []),
            {
              label: t('tabs.close', 'Close'),
              onClick: () => {
                if (contextMenu.tabType === 'instance') {
                  void killInstance(contextMenu.tabId);
                } else {
                  void killShellInstance(contextMenu.tabId);
                }
                setContextMenu(null);
              },
              icon: <CloseIcon className="w-4 h-4" />,
              danger: true,
            },
          ]}
        />
      )}
    </div>
  );
}

interface InstanceTabProps {
  id: string;
  status: InstanceStatus;
  prompt?: string;
  terminalTitle?: string;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  isMobile?: boolean;
}

function InstanceTab({
  id: _id,
  status,
  prompt,
  terminalTitle,
  isSelected,
  onSelect,
  onClose,
  onContextMenu,
  isMobile = false,
}: InstanceTabProps) {
  // Use terminal title if available, otherwise fallback to prompt or default text
  const displayText = terminalTitle || prompt || 'New session';
  // Truncate more aggressively on mobile
  const maxLength = isMobile ? 15 : 30;
  const truncatedText =
    displayText.length > maxLength ? displayText.slice(0, maxLength) + '...' : displayText;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 cursor-pointer transition-colors group min-h-[44px] sm:min-h-0 flex-shrink-0 ${
        isSelected
          ? 'bg-claude-tan/30 dark:bg-gray-700 text-gray-800 dark:text-white rounded-t-md'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-750 rounded-md'
      }`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={displayText}
    >
      <StatusBadge status={status} />
      <span className="text-sm truncate max-w-[100px] sm:max-w-[150px]">{truncatedText}</span>
      <button
        onClick={handleClose}
        className={`p-1 sm:p-0.5 hover:bg-claude-tan/40 dark:hover:bg-gray-600 rounded transition-opacity ${
          isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        title="Close instance"
      >
        <CloseIcon className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: InstanceStatus }) {
  const { color, pulse, label } = getStatusTabConfig(status);

  return (
    <div className={`w-2 h-2 rounded-full ${color} ${pulse ? 'status-pulse' : ''}`} title={label} />
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

interface ShellTabProps {
  id: string;
  status: ShellInstanceStatus;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  isMobile?: boolean;
}

function ShellTab({
  id: _id,
  status,
  isSelected,
  onSelect,
  onClose,
  onContextMenu,
  isMobile = false,
}: ShellTabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 cursor-pointer transition-colors group min-h-[44px] sm:min-h-0 flex-shrink-0 ${
        isSelected
          ? 'bg-claude-tan/30 dark:bg-gray-700 text-gray-800 dark:text-white rounded-t-md'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-750 rounded-md'
      }`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title="Shell"
    >
      <ShellStatusBadge status={status} />
      <TerminalIcon className="w-4 h-4" />
      <span className="text-sm truncate max-w-[100px] sm:max-w-[150px]">Shell</span>
      <button
        onClick={handleClose}
        className={`p-1 sm:p-0.5 hover:bg-claude-tan/40 dark:hover:bg-gray-600 rounded transition-opacity ${
          isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        title="Close shell"
      >
        <CloseIcon className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
      </button>
    </div>
  );
}

function ShellStatusBadge({ status }: { status: ShellInstanceStatus }) {
  const config: Record<ShellInstanceStatus, { color: string; pulse: boolean; label: string }> = {
    running: { color: 'bg-green-500', pulse: true, label: 'Running' },
    completed: { color: 'bg-gray-500', pulse: false, label: 'Completed' },
    error: { color: 'bg-red-500', pulse: false, label: 'Error' },
    killed: { color: 'bg-gray-600', pulse: false, label: 'Killed' },
  };

  const { color, pulse, label } = config[status];

  return (
    <div className={`w-2 h-2 rounded-full ${color} ${pulse ? 'status-pulse' : ''}`} title={label} />
  );
}

// Split tab component
interface SplitTabComponentProps {
  split: SplitTab;
  isSelected: boolean;
  leftTitle: string;
  rightTitle: string;
  leftStatus: InstanceStatus | ShellInstanceStatus;
  rightStatus: InstanceStatus | ShellInstanceStatus;
  leftType: 'instance' | 'shell' | 'proxy';
  rightType: 'instance' | 'shell' | 'proxy';
  onSelect: () => void;
  onClose: () => void;
  isMobile?: boolean;
}

function SplitTabComponent({
  split: _split,
  isSelected,
  leftTitle,
  rightTitle,
  leftStatus,
  rightStatus,
  leftType,
  rightType,
  onSelect,
  onClose,
  isMobile = false,
}: SplitTabComponentProps) {
  // Truncate titles more aggressively for split tabs
  const maxLength = isMobile ? 8 : 15;
  const truncate = (text: string) =>
    text.length > maxLength ? text.slice(0, maxLength) + '...' : text;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  // Get combined status color (show most urgent status)
  const getStatusConfig = (status: InstanceStatus | ShellInstanceStatus) => {
    if (status === 'running' || status === 'tool_executing') {
      return { color: 'bg-green-500', pulse: true };
    }
    if (status === 'needs_permission' || status === 'waiting_input') {
      return { color: 'bg-yellow-500', pulse: true };
    }
    if (status === 'error') {
      return { color: 'bg-red-500', pulse: false };
    }
    if (status === 'starting') {
      return { color: 'bg-blue-500', pulse: true };
    }
    return { color: 'bg-gray-500', pulse: false };
  };

  const leftConfig = getStatusConfig(leftStatus);
  const rightConfig = getStatusConfig(rightStatus);

  // Render type-specific icon
  const renderTypeIcon = (type: 'instance' | 'shell' | 'proxy') => {
    if (type === 'proxy') {
      return <GlobeIcon className="w-3 h-3 text-claude-orange" />;
    }
    if (type === 'shell') {
      return <TerminalIcon className="w-3 h-3 text-gray-500 dark:text-gray-400" />;
    }
    return null;
  };

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 cursor-pointer transition-colors group min-h-[44px] sm:min-h-0 flex-shrink-0 ${
        isSelected
          ? 'bg-claude-tan/30 dark:bg-gray-700 text-gray-800 dark:text-white rounded-t-md'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-750 rounded-md'
      }`}
      onClick={onSelect}
      title={`${leftTitle} | ${rightTitle}`}
    >
      {/* Left indicator */}
      {leftType === 'proxy' ? (
        renderTypeIcon(leftType)
      ) : (
        <div
          className={`w-2 h-2 rounded-full ${leftConfig.color} ${leftConfig.pulse ? 'status-pulse' : ''}`}
        />
      )}

      {/* Split icon */}
      <SplitIcon className="w-3 h-3 text-gray-500 dark:text-gray-400" />

      {/* Right indicator */}
      {rightType === 'proxy' ? (
        renderTypeIcon(rightType)
      ) : (
        <div
          className={`w-2 h-2 rounded-full ${rightConfig.color} ${rightConfig.pulse ? 'status-pulse' : ''}`}
        />
      )}

      {/* Combined title */}
      <span className="text-sm truncate max-w-[150px] sm:max-w-[200px]">
        {truncate(leftTitle)} | {truncate(rightTitle)}
      </span>

      {/* Close button */}
      <button
        onClick={handleClose}
        className={`p-1 sm:p-0.5 hover:bg-claude-tan/40 dark:hover:bg-gray-600 rounded transition-opacity ${
          isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        title="Close split"
      >
        <CloseIcon className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
      </button>
    </div>
  );
}

function SplitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}
