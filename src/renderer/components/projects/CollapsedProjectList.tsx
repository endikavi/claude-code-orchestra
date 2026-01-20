import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useUIStore } from '../../stores/uiStore';
import type { Project } from '@shared/types';
import type { GlobalProject } from '@shared/types/cluster';

export function CollapsedProjectList() {
  const { t } = useTranslation();
  const { projects: localProjects, selectedProjectId, selectProject } = useProjectStore();
  const { getInstancesByProject } = useInstanceStore();
  const {
    isConnected: clusterConnected,
    globalProjects,
    nodes: connectedNodes,
  } = useClusterStore();
  const { projectOrder, collapsedSections, toggleSectionCollapsed } = useUIStore();

  // Separate and sort projects
  const { sortedLocalProjects, clusterProjectsByNode } = useMemo(() => {
    // Get local projects
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

    inOrder.sort((a, b) => projectOrder.indexOf(a.id) - projectOrder.indexOf(b.id));
    const sortedLocalProjects = [...notInOrder, ...inOrder];

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

    return { sortedLocalProjects, clusterProjectsByNode };
  }, [localProjects, clusterConnected, globalProjects, projectOrder, connectedNodes]);

  const hasLocalProjects = sortedLocalProjects.length > 0;
  const hasClusterProjects = Object.keys(clusterProjectsByNode).length > 0;

  if (!hasLocalProjects && !hasClusterProjects) {
    return null;
  }

  const renderProjectButton = (project: Project | GlobalProject, isCluster: boolean = false) => {
    const instances = getInstancesByProject(project.id);
    const runningCount = instances.filter(
      (i) => i.status === 'running' || i.status === 'starting' || i.status === 'tool_executing'
    ).length;
    const isSelected = selectedProjectId === project.id;

    // Get initials (first letter or first two letters)
    const initials = project.name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <div key={project.id} className="relative group">
        <button
          onClick={() => selectProject(project.id)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all ${
            isSelected
              ? 'ring-2 ring-claude-orange ring-offset-2 ring-offset-claude-beige dark:ring-offset-gray-800'
              : 'hover:scale-105'
          }`}
          style={{ backgroundColor: project.color || '#6b7280' }}
          title={project.name}
        >
          <span className="text-white">{initials}</span>
        </button>

        {/* Running indicator */}
        {runningCount > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 status-pulse flex items-center justify-center">
            <span className="text-[10px] text-white font-bold">{runningCount}</span>
          </div>
        )}

        {/* Cluster indicator */}
        {isCluster && (
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
            </svg>
          </div>
        )}

        {/* Tooltip */}
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
          {project.name}
          {'nodeName' in project && 'isLocal' in project && !project.isLocal && (
            <span className="text-blue-300 ml-1">[{project.nodeName}]</span>
          )}
          {project.hostname && <span className="text-gray-400 ml-1">@{project.hostname}</span>}
        </div>
      </div>
    );
  };

  const renderSectionDivider = (
    sectionId: string,
    label: string,
    isCluster: boolean = false,
    collapsed: boolean = false
  ) => {
    return (
      <button
        onClick={() => toggleSectionCollapsed(sectionId)}
        className="w-10 h-6 flex items-center justify-center group"
        title={`${label} - ${collapsed ? t('sidebar.expandSection') : t('sidebar.collapseSection')}`}
      >
        <div className="flex items-center gap-1">
          {isCluster ? (
            <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
            </svg>
          ) : (
            <svg
              className="w-3 h-3 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          )}
          <svg
            className={`w-2 h-2 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
    );
  };

  const isLocalCollapsed = collapsedSections.local;

  return (
    <div className="p-2 space-y-2 flex flex-col items-center">
      {/* Local projects section */}
      {hasLocalProjects && (
        <>
          {renderSectionDivider('local', t('sidebar.localProjects'), false, isLocalCollapsed)}
          {!isLocalCollapsed &&
            sortedLocalProjects.map((project) => renderProjectButton(project, false))}
        </>
      )}

      {/* Cluster sections */}
      {hasClusterProjects &&
        Object.entries(clusterProjectsByNode).map(([nodeId, { nodeName, projects }]) => {
          const isNodeCollapsed = collapsedSections.clusters[nodeId] ?? false;
          return (
            <div key={nodeId} className="flex flex-col items-center space-y-2">
              {renderSectionDivider(nodeId, nodeName, true, isNodeCollapsed)}
              {!isNodeCollapsed && projects.map((project) => renderProjectButton(project, true))}
            </div>
          );
        })}
    </div>
  );
}
