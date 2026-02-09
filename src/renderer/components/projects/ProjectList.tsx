import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { useClusterStore } from '../../stores/clusterStore';
import { ContextMenu } from '../common/ContextMenu';
import { GitStatusBadge } from './GitStatusBadge';
import { ProjectSection, SortableProjectItem } from './ProjectSection';
import {
  PlayCircleIcon as PlayIcon,
  EditIcon,
  TrashIcon,
  TerminalIcon,
  SettingsIcon,
} from '@renderer/components/icons';
import { Skeleton } from '../common/Skeleton';
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
  // Use useShallow to prevent unnecessary re-renders
  const {
    projects: localProjects,
    selectedProjectId,
    selectProject,
    deleteProject,
    isLoading,
  } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      selectedProjectId: state.selectedProjectId,
      selectProject: state.selectProject,
      deleteProject: state.deleteProject,
      isLoading: state.isLoading,
    }))
  );
  const { getInstancesByProject, createShellInstance, selectShell, selectInstance } =
    useInstanceStore(
      useShallow((state) => ({
        getInstancesByProject: state.getInstancesByProject,
        createShellInstance: state.createShellInstance,
        selectShell: state.selectShell,
        selectInstance: state.selectInstance,
      }))
    );
  const {
    setShowProjectModal,
    setShowInstanceModal,
    setShowLocalSettingsModal,
    projectOrder,
    setProjectOrder,
    addProjectToOrder,
  } = useUIStore(
    useShallow((state) => ({
      setShowProjectModal: state.setShowProjectModal,
      setShowInstanceModal: state.setShowInstanceModal,
      setShowLocalSettingsModal: state.setShowLocalSettingsModal,
      projectOrder: state.projectOrder,
      setProjectOrder: state.setProjectOrder,
      addProjectToOrder: state.addProjectToOrder,
    }))
  );

  // Cluster state
  const {
    isConnected: clusterConnected,
    globalProjects,
    nodes: connectedNodes,
  } = useClusterStore(
    useShallow((state) => ({
      isConnected: state.isConnected,
      globalProjects: state.globalProjects,
      nodes: state.nodes,
    }))
  );

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Separate local and cluster projects
  const { sortedLocalProjects, clusterProjectsByNode, newProjectIds } = useMemo(() => {
    // Get local projects (either from globalProjects if cluster connected, or localProjects)
    const allLocalProjects: Project[] = clusterConnected
      ? (globalProjects.filter((p) => p.isLocal) as Project[])
      : localProjects;

    // Sort local projects according to saved order
    const orderedIds = new Set(projectOrder);
    const inOrder: Project[] = [];
    const notInOrder: Project[] = [];

    for (const project of allLocalProjects) {
      if (orderedIds.has(project.id)) {
        inOrder.push(project);
      } else {
        notInOrder.push(project);
      }
    }

    // Sort inOrder according to projectOrder
    inOrder.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));

    // New projects go at the beginning
    const sortedLocalProjects = [...notInOrder, ...inOrder];

    // Collect new project IDs (to be added to order in useEffect)
    const newProjectIds = notInOrder.map((p) => p.id);

    // Get cluster projects grouped by node
    const clusterProjectsByNode: Record<string, { nodeName: string; projects: GlobalProject[] }> =
      {};

    if (clusterConnected) {
      for (const project of globalProjects) {
        if (!project.isLocal && 'nodeId' in project) {
          const nodeId = project.nodeId;
          if (!clusterProjectsByNode[nodeId]) {
            const node = connectedNodes.find((n) => n.id === nodeId);
            clusterProjectsByNode[nodeId] = {
              nodeName: node?.name || project.nodeName || nodeId,
              projects: [],
            };
          }
          clusterProjectsByNode[nodeId].projects.push(project);
        }
      }
    }

    return { sortedLocalProjects, clusterProjectsByNode, newProjectIds };
  }, [localProjects, clusterConnected, globalProjects, projectOrder, connectedNodes]);

  // Add new projects to order (moved from useMemo to avoid setState during render)
  // Using queueMicrotask to ensure the update happens outside the render cycle
  useEffect(() => {
    if (newProjectIds.length === 0) return;

    queueMicrotask(() => {
      for (const projectId of newProjectIds) {
        addProjectToOrder(projectId);
      }
    });
  }, [newProjectIds, addProjectToOrder]);

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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = projectOrder.indexOf(active.id as string);
        const newIndex = projectOrder.indexOf(over.id as string);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(projectOrder, oldIndex, newIndex);
          setProjectOrder(newOrder);
        }
      }
    },
    [projectOrder, setProjectOrder]
  );

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

  const renderProjectItem = (project: Project | GlobalProject, isDraggable: boolean = false) => {
    const instances = getInstancesByProject(project.id);
    const runningCount = instances.filter(
      (i) => i.status === 'running' || i.status === 'starting' || i.status === 'tool_executing'
    ).length;
    const isSelected = selectedProjectId === project.id;

    const projectContent = (
      <div
        className={`p-2 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? 'bg-primary-muted dark:bg-neutral-800 border border-primary/50 shadow-sm'
            : 'bg-white/50 dark:bg-neutral-900 hover:bg-[var(--color-bg-elevated)] dark:hover:bg-neutral-750 border border-transparent'
        }`}
        onClick={() => {
          selectProject(project.id);
          onProjectSelect?.();
        }}
        onContextMenu={(e) => handleContextMenu(e, project)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {/* Color indicator bar */}
            <div
              className="w-1 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.color || '#6b7280' }}
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
              {project.name}
            </span>
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
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-500 truncate pl-3">
          {project.path}
        </div>
        {/* Git status badge */}
        {isElectron && isProjectLocal(project) && (
          <div className="mt-1.5 pl-3">
            <GitStatusBadge projectId={project.id} compact />
          </div>
        )}
        {instances.length > 0 && (
          <div className="mt-2 flex gap-1 pl-3">
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

    if (isDraggable) {
      return (
        <SortableProjectItem key={project.id} id={project.id}>
          {projectContent}
        </SortableProjectItem>
      );
    }

    return <div key={project.id}>{projectContent}</div>;
  };

  const hasLocalProjects = sortedLocalProjects.length > 0;
  const hasClusterProjects = Object.keys(clusterProjectsByNode).length > 0;

  if (isLoading && !hasLocalProjects && !hasClusterProjects) {
    return (
      <div className="p-2">
        <Skeleton.List count={4} variant="project" />
      </div>
    );
  }

  if (!hasLocalProjects && !hasClusterProjects) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-500 text-sm">
        {t('sidebar.noProjects')}
      </div>
    );
  }

  const localProjectIds = sortedLocalProjects.map((p) => p.id);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="p-2">
          {/* Local Projects Section */}
          {hasLocalProjects && (
            <ProjectSection
              sectionId="local"
              title={t('sidebar.localProjects')}
              projectCount={sortedLocalProjects.length}
              projectIds={localProjectIds}
              isDraggable={true}
            >
              {sortedLocalProjects.map((project) => renderProjectItem(project, true))}
            </ProjectSection>
          )}

          {/* Cluster Projects Sections */}
          {hasClusterProjects &&
            Object.entries(clusterProjectsByNode).map(([nodeId, { nodeName, projects }]) => (
              <ProjectSection
                key={nodeId}
                sectionId={nodeId}
                title={nodeName}
                projectCount={projects.length}
                isDraggable={false}
                badge={
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded ml-1">
                    {t('sidebar.cluster')}
                  </span>
                }
              >
                {projects.map((project) => renderProjectItem(project, false))}
              </ProjectSection>
            ))}
        </div>
      </DndContext>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          items={[
            {
              label: t('project.newInstance'),
              onClick: handleNewInstance,
              icon: <PlayIcon className="w-4 h-4" />,
            },
            // Show terminal in Electron for both local and remote projects
            ...(isElectron
              ? [
                  {
                    label: t('project.openTerminal'),
                    onClick: () => {
                      void handleOpenTerminal();
                    },
                    icon: <TerminalIcon className="w-4 h-4" />,
                  },
                ]
              : []),
            // Only show local settings for local projects in Electron
            ...(isElectron && contextMenu.isLocal
              ? [
                  {
                    label: t('project.localSettings'),
                    onClick: handleLocalSettings,
                    icon: <SettingsIcon className="w-4 h-4" />,
                  },
                ]
              : []),
            // Only show edit/delete for local projects
            ...(contextMenu.isLocal
              ? [
                  {
                    label: t('project.editProject'),
                    onClick: handleEdit,
                    icon: <EditIcon className="w-4 h-4" />,
                  },
                  { type: 'separator' as const },
                  {
                    label: t('project.deleteProject'),
                    onClick: handleDelete,
                    icon: <TrashIcon className="w-4 h-4" />,
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

// Move colors outside component to prevent recreation on each render
const STATUS_COLORS: Record<string, string> = {
  starting: 'bg-yellow-500',
  running: 'bg-green-500',
  needs_permission: 'bg-orange-500',
  tool_executing: 'bg-blue-500',
  completed: 'bg-gray-500',
  error: 'bg-red-500',
  killed: 'bg-gray-600',
};

// Memoize to prevent unnecessary re-renders when parent re-renders
const StatusDot = React.memo(function StatusDot({ status }: { status: string }) {
  return (
    <div
      className={`w-2 h-2 rounded-full ${STATUS_COLORS[status] || 'bg-gray-500'} ${
        status === 'running' || status === 'starting' ? 'status-pulse' : ''
      }`}
      title={status}
    />
  );
});
