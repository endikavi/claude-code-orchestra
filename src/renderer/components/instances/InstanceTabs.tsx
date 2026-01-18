import React from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import type { InstanceStatus, ShellInstanceStatus } from '@shared/types';

export function InstanceTabs() {
  const { selectedProjectId, getSelectedProject } = useProjectStore();
  const {
    selectedInstanceId,
    selectInstance,
    getInstancesByProject,
    killInstance,
    selectedShellId,
    selectShell,
    getShellsByProject,
    killShellInstance,
  } = useInstanceStore();
  const { setShowInstanceModal } = useUIStore();
  const isMobile = useIsMobile();

  const project = getSelectedProject();
  const instances = selectedProjectId ? getInstancesByProject(selectedProjectId) : [];
  const shells = selectedProjectId ? getShellsByProject(selectedProjectId) : [];

  return (
    <div className="flex items-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-claude-beige dark:bg-gray-800 border-b border-claude-tan/30 dark:border-gray-700 overflow-x-auto scrollbar-hide">
      {/* Project name/icon - clickable to go to history */}
      {project && (
        <button
          onClick={() => selectInstance(null)}
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

      {/* Instance tabs */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {instances.map((instance) => (
          <InstanceTab
            key={instance.id}
            id={instance.id}
            status={instance.status}
            prompt={instance.prompt}
            terminalTitle={instance.terminalTitle}
            isSelected={instance.id === selectedInstanceId && !selectedShellId}
            onSelect={() => {
              selectShell(null);
              selectInstance(instance.id);
            }}
            onClose={() => killInstance(instance.id)}
            isMobile={isMobile}
          />
        ))}
      </div>

      {/* Shell tabs */}
      {shells.length > 0 && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {shells.map((shell) => (
            <ShellTab
              key={shell.id}
              id={shell.id}
              status={shell.status}
              isSelected={shell.id === selectedShellId}
              onSelect={() => {
                selectInstance(null);
                selectShell(shell.id);
              }}
              onClose={() => killShellInstance(shell.id)}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      {/* New instance button */}
      <button
        onClick={() => setShowInstanceModal(true)}
        className="flex items-center gap-1 px-2 py-1.5 sm:py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-700 rounded transition-colors min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 justify-center flex-shrink-0"
        title="New instance"
      >
        <PlusIcon className="w-4 h-4" />
      </button>
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
      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md cursor-pointer transition-colors group min-h-[44px] sm:min-h-0 flex-shrink-0 ${
        isSelected
          ? 'bg-claude-tan/30 dark:bg-gray-700 text-gray-800 dark:text-white'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-750'
      }`}
      onClick={onSelect}
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
  const config: Record<InstanceStatus, { color: string; pulse: boolean; label: string }> = {
    starting: { color: 'bg-yellow-500', pulse: true, label: 'Starting' },
    running: { color: 'bg-green-500', pulse: true, label: 'Running' },
    waiting_input: { color: 'bg-cyan-500', pulse: false, label: 'Waiting for Input' },
    needs_permission: { color: 'bg-orange-500', pulse: true, label: 'Needs Permission' },
    tool_executing: { color: 'bg-blue-500', pulse: true, label: 'Executing Tool' },
    completed: { color: 'bg-gray-500', pulse: false, label: 'Completed' },
    error: { color: 'bg-red-500', pulse: false, label: 'Error' },
    killed: { color: 'bg-gray-600', pulse: false, label: 'Killed' },
  };

  const { color, pulse, label } = config[status];

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

interface ShellTabProps {
  id: string;
  status: ShellInstanceStatus;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
  isMobile?: boolean;
}

function ShellTab({
  id: _id,
  status,
  isSelected,
  onSelect,
  onClose,
  isMobile = false,
}: ShellTabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 rounded-md cursor-pointer transition-colors group min-h-[44px] sm:min-h-0 flex-shrink-0 ${
        isSelected
          ? 'bg-claude-tan/30 dark:bg-gray-700 text-gray-800 dark:text-white'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:bg-claude-tan/20 dark:hover:bg-gray-750'
      }`}
      onClick={onSelect}
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
