import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';

export function CollapsedProjectList() {
  const { projects, selectedProjectId, selectProject } = useProjectStore();
  const { getInstancesByProject } = useInstanceStore();

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="p-2 space-y-2 flex flex-col items-center">
      {projects.map((project) => {
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

            {/* Tooltip */}
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
              {project.name}
              {project.hostname && <span className="text-gray-400 ml-1">@{project.hostname}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
