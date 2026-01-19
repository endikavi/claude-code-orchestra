import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { useClusterStore } from '../../stores/clusterStore';
import { ContextMenu } from '../common/ContextMenu';
import { GitStatusBadge } from './GitStatusBadge';
import type { Project } from '@shared/types';
import type { GlobalProject } from '@shared/types/cluster';

// Check if running in Electron (has full API) vs Web (limited API)
const isElectron =
  typeof window !== 'undefined' && window.electronAPI && 'uiSettings' in window.electronAPI;

interface ProjectListProps {
  onProjectSelect?: () => void;
}

export function ProjectList({ onProjectSelect }: ProjectListProps) {
  const { t } = useTranslation();
  const {
    projects: localProjects,
    selectedProjectId,
    selectProject,
    deleteProject,
  } = useProjectStore();
  const { getInstancesByProject, createShellInstance, selectShell, selectInstance } =
    useInstanceStore();
  const { setShowProjectModal, setShowInstanceModal, setShowLocalSettingsModal } = useUIStore();

  // Cluster state
  const { isConnected: clusterConnected, globalProjects } = useClusterStore();

  // Use global projects when cluster is connected, otherwise use local projects
  const projects: (Project | GlobalProject)[] = useMemo(() => {
    if (clusterConnected && globalProjects.length > 0) {
      return globalProjects;
    }
    return localProjects;
  }, [clusterConnected, globalProjects, localProjects]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    project: Project | GlobalProject;
    isLocal: boolean;
  } | null>(null);

  // Helper to check if a project is local
  const isProjectLocal = (project: Project | GlobalProject): boolean => {
    return !('isLocal' in project) || project.isLocal === true;
  };

  const handleContextMenu = (e: React.MouseEvent, project: Project | GlobalProject) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, project, isLocal: isProjectLocal(project) });
  };

  const handleCloseContextMenu = () => setContextMenu(null);

  const handleEdit = () => {
    if (contextMenu) {
      setShowProjectModal(true, contextMenu.project.id);
      handleCloseContextMenu();
    }
  };

  const handleDelete = () => {
    if (contextMenu) {
      void deleteProject(contextMenu.project.id);
      handleCloseContextMenu();
    }
  };

  const handleNewInstance = () => {
    if (contextMenu) {
      selectProject(contextMenu.project.id);
      setShowInstanceModal(true);
      handleCloseContextMenu();
    }
  };

  const handleOpenTerminal = async () => {
    if (contextMenu) {
      // Select the project first
      selectProject(contextMenu.project.id);

      try {
        if (contextMenu.isLocal) {
          // Local project - create shell directly
          const shell = await createShellInstance(contextMenu.project.id);
          // Deselect any claude instance and select the shell
          selectInstance(null);
          selectShell(shell.id);
        } else if ('nodeId' in contextMenu.project) {
          // Remote project - use cluster to create shell on remote node
          const result = await window.electronAPI.cluster.createRemoteShell(
            contextMenu.project.nodeId,
            contextMenu.project.id
          );
          if (!result.success) {
            console.error('Failed to create remote shell:', result.error);
          }
          // Note: The shell will be created on the remote node and synced via cluster state
        }
      } catch (error) {
        console.error('Failed to create shell:', error);
      }
      handleCloseContextMenu();
    }
  };

  const handleLocalSettings = () => {
    if (contextMenu) {
      setShowLocalSettingsModal(true, contextMenu.project.path);
      handleCloseContextMenu();
    }
  };

  if (projects.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-500 text-sm">
        {t('sidebar.noProjects')}
      </div>
    );
  }

  return (
    <>
      <div className="p-2 space-y-1">
        {projects.map((project) => {
          const instances = getInstancesByProject(project.id);
          const runningCount = instances.filter(
            (i) =>
              i.status === 'running' || i.status === 'starting' || i.status === 'tool_executing'
          ).length;
          const isSelected = selectedProjectId === project.id;

          return (
            <div
              key={project.id}
              className={`p-3 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-claude-tan/30 dark:bg-gray-700 border border-claude-orange/50'
                  : 'bg-white/50 dark:bg-gray-800 hover:bg-white/70 dark:hover:bg-gray-750 border border-transparent'
              }`}
              onClick={() => {
                selectProject(project.id);
                onProjectSelect?.();
              }}
              onContextMenu={(e) => handleContextMenu(e, project)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color || '#6b7280' }}
                  />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {project.name}
                  </span>
                  {/* Show node name for cluster projects */}
                  {'nodeName' in project && !project.isLocal && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded flex-shrink-0">
                      {project.nodeName}
                    </span>
                  )}
                  {project.hostname && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-shrink-0">
                      @{project.hostname}
                    </span>
                  )}
                </div>
                {runningCount > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-green-500 status-pulse" />
                    <span className="text-xs text-gray-600 dark:text-gray-400">{runningCount}</span>
                  </div>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-500 truncate pl-5">
                {project.path}
              </div>
              {/* Git status badge */}
              {isElectron && isProjectLocal(project) && (
                <div className="mt-1.5 pl-5">
                  <GitStatusBadge projectId={project.id} compact />
                </div>
              )}
              {instances.length > 0 && (
                <div className="mt-2 flex gap-1 pl-5">
                  {instances.slice(0, 5).map((instance) => (
                    <StatusDot key={instance.id} status={instance.status} />
                  ))}
                  {instances.length > 5 && (
                    <span className="text-xs text-gray-500 dark:text-gray-500">
                      +{instances.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          items={[
            { label: t('project.newInstance'), onClick: handleNewInstance, icon: <PlayIcon /> },
            // Show terminal in Electron for both local and remote projects
            ...(isElectron
              ? [
                  {
                    label: t('project.openTerminal'),
                    onClick: () => {
                      void handleOpenTerminal();
                    },
                    icon: <TerminalIcon />,
                  },
                ]
              : []),
            // Only show local settings for local projects in Electron
            ...(isElectron && contextMenu.isLocal
              ? [
                  {
                    label: t('project.localSettings'),
                    onClick: handleLocalSettings,
                    icon: <SettingsIcon />,
                  },
                ]
              : []),
            // Only show edit/delete for local projects
            ...(contextMenu.isLocal
              ? [
                  { label: t('project.editProject'), onClick: handleEdit, icon: <EditIcon /> },
                  { type: 'separator' as const },
                  {
                    label: t('project.deleteProject'),
                    onClick: handleDelete,
                    icon: <TrashIcon />,
                    danger: true,
                  },
                ]
              : []),
          ]}
        />
      )}
    </>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    starting: 'bg-yellow-500',
    running: 'bg-green-500',
    needs_permission: 'bg-orange-500',
    tool_executing: 'bg-blue-500',
    completed: 'bg-gray-500',
    error: 'bg-red-500',
    killed: 'bg-gray-600',
  };

  return (
    <div
      className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-500'} ${
        status === 'running' || status === 'starting' ? 'status-pulse' : ''
      }`}
      title={status}
    />
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}
