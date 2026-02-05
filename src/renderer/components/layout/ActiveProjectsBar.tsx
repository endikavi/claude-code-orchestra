import { useMemo } from 'react';
import { useInstanceStore } from '../../stores/instanceStore';
import { useProjectStore } from '../../stores/projectStore';

interface ProjectTab {
  projectId: string;
  projectName: string;
  projectColor?: string;
  instanceCount: number;
  hasRunning: boolean;
  firstInstanceId: string;
}

export function ActiveProjectsBar() {
  const instances = useInstanceStore((s) => s.instances);
  const selectInstance = useInstanceStore((s) => s.selectInstance);
  const selectShell = useInstanceStore((s) => s.selectShell);
  const { projects, selectedProjectId, selectProject } = useProjectStore();

  const projectTabs = useMemo((): ProjectTab[] => {
    const groups = new Map<string, ProjectTab>();

    instances.forEach((inst) => {
      const projectId = inst.projectId || 'no-project';
      if (!groups.has(projectId)) {
        const project = projects.find((p) => p.id === projectId);
        groups.set(projectId, {
          projectId,
          projectName: project?.name || 'No Project',
          projectColor: project?.color,
          instanceCount: 0,
          hasRunning: false,
          firstInstanceId: inst.id,
        });
      }
      const tab = groups.get(projectId);
      if (!tab) return;
      tab.instanceCount++;
      if (inst.status === 'running' || inst.status === 'tool_executing') {
        tab.hasRunning = true;
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.hasRunning && !b.hasRunning) return -1;
      if (!a.hasRunning && b.hasRunning) return 1;
      return a.projectName.localeCompare(b.projectName);
    });
  }, [instances, projects]);

  // Don't render if less than 2 projects with instances
  if (projectTabs.length < 2) return null;

  const handleTabClick = (tab: ProjectTab) => {
    selectShell(null);
    selectProject(tab.projectId === 'no-project' ? null : tab.projectId);
    selectInstance(tab.firstInstanceId);
  };

  return (
    <div className="h-8 bg-gray-50 dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700 flex items-center px-2 overflow-x-auto shrink-0">
      <div className="flex items-center gap-1">
        {projectTabs.map((tab) => {
          const isActive =
            tab.projectId === selectedProjectId ||
            (tab.projectId === 'no-project' && !selectedProjectId);

          return (
            <button
              key={tab.projectId}
              onClick={() => handleTabClick(tab)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-sky-500/10 text-sky-500'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-800'
              }`}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: tab.projectColor || '#6B7280' }}
              />
              <span className="truncate max-w-[120px]">{tab.projectName}</span>
              <span className="text-[10px] opacity-70">{tab.instanceCount}</span>
              {tab.hasRunning && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
