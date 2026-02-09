import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useInstanceStore } from '../../stores/instanceStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useEditorStore } from '../../stores/editorStore';
import { ChevronDownIcon, ChevronRightIcon, TerminalIcon, FileIcon } from '../icons';
import { getStatusTabConfig } from '../../utils/statusConfig';
import type { ClaudeInstance, ShellInstance } from '@shared/types';

interface OpenFileRef {
  relativePath: string;
  projectPath: string;
  basename: string;
}

interface OtherProjectRow {
  projectId: string;
  projectName: string;
  projectPath?: string;
  projectColor?: string;
  instances: ClaudeInstance[];
  shells: ShellInstance[];
  files: OpenFileRef[];
  hasRunning: boolean;
}

export function ActiveProjectsBar() {
  const { t } = useTranslation();
  const instances = useInstanceStore((s) => s.instances);
  const shellInstances = useInstanceStore((s) => s.shellInstances);
  const { projects, selectedProjectId } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      selectedProjectId: s.selectedProjectId,
    }))
  );
  const { otherProjectBarsCollapsed, setOtherProjectBarsCollapsed } = useUIStore(
    useShallow((s) => ({
      otherProjectBarsCollapsed: s.otherProjectBarsCollapsed,
      setOtherProjectBarsCollapsed: s.setOtherProjectBarsCollapsed,
    }))
  );
  const openFiles = useEditorStore((s) => s.openFiles);

  const otherProjects = useMemo((): OtherProjectRow[] => {
    const groups = new Map<string, OtherProjectRow>();

    // Helper to ensure a group exists for a project
    const ensureGroup = (projectId: string): OtherProjectRow | null => {
      if (projectId === selectedProjectId) return null;
      if (!groups.has(projectId)) {
        const project = projects.find((p) => p.id === projectId);
        groups.set(projectId, {
          projectId,
          projectName: project?.name || 'No Project',
          projectPath: project?.path,
          projectColor: project?.color,
          instances: [],
          shells: [],
          files: [],
          hasRunning: false,
        });
      }
      return groups.get(projectId) || null;
    };

    // Group instances by project, excluding the current project
    instances.forEach((inst) => {
      const projectId = inst.projectId || 'no-project';
      if (inst.isHidden) return;
      const row = ensureGroup(projectId);
      if (!row) return;
      row.instances.push(inst);
      if (inst.status === 'running' || inst.status === 'tool_executing') {
        row.hasRunning = true;
      }
    });

    // Group shells by project, excluding the current project
    shellInstances.forEach((shell) => {
      const projectId = shell.projectId || 'no-project';
      const row = ensureGroup(projectId);
      if (row) row.shells.push(shell);
    });

    // Group open editor files by project, excluding the current project
    const selectedProject = projects.find((p) => p.id === selectedProjectId);
    const selectedProjectPath = selectedProject?.path;
    openFiles.forEach((file) => {
      // Skip files belonging to the current project
      if (file.projectPath === selectedProjectPath) return;
      // Find which project this file belongs to
      const project = projects.find((p) => p.path === file.projectPath);
      if (!project) return;
      const row = ensureGroup(project.id);
      if (!row) return;
      row.files.push({
        relativePath: file.relativePath,
        projectPath: file.projectPath,
        basename: file.relativePath.split('/').pop() || file.relativePath,
      });
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.hasRunning && !b.hasRunning) return -1;
      if (!a.hasRunning && b.hasRunning) return 1;
      return a.projectName.localeCompare(b.projectName);
    });
  }, [instances, shellInstances, openFiles, projects, selectedProjectId]);

  if (otherProjects.length === 0) return null;

  const handleProjectClick = (projectId: string) => {
    const projStore = useProjectStore.getState();
    projStore.selectProject(projectId === 'no-project' ? null : projectId);
    // selectProject already clears instance/shell selection,
    // so the project view (with tasks) is shown
  };

  const handleTabClick = (projectId: string, type: 'instance' | 'shell', id: string) => {
    const projStore = useProjectStore.getState();
    const instStore = useInstanceStore.getState();
    projStore.selectProject(projectId === 'no-project' ? null : projectId);
    if (type === 'instance') {
      instStore.selectInstance(id);
      instStore.selectShell(null);
    } else {
      instStore.selectShell(id);
      instStore.selectInstance(null);
    }
    useEditorStore.setState({ activeFilePath: null });
  };

  const handleFileTabClick = (projectId: string, relativePath: string) => {
    const projStore = useProjectStore.getState();
    const instStore = useInstanceStore.getState();
    projStore.selectProject(projectId === 'no-project' ? null : projectId);
    instStore.selectInstance(null);
    instStore.selectShell(null);
    useEditorStore.setState({ activeFilePath: relativePath });
  };

  return (
    <div className="bg-[var(--color-bg-subtle)] border-b border-[var(--color-border-default)] shrink-0">
      {/* Collapse toggle */}
      <div className="flex items-center h-6 px-1.5">
        <button
          onClick={() => setOtherProjectBarsCollapsed(!otherProjectBarsCollapsed)}
          className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={
            otherProjectBarsCollapsed
              ? t('activeProjects.expandOtherProjects')
              : t('activeProjects.collapseOtherProjects')
          }
        >
          {otherProjectBarsCollapsed ? (
            <ChevronRightIcon className="w-3 h-3" />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )}
          <span>
            {otherProjects.length} {otherProjects.length === 1 ? 'project' : 'projects'}
          </span>
        </button>
      </div>

      {/* Project rows */}
      {!otherProjectBarsCollapsed &&
        otherProjects.map((row) => (
          <div
            key={row.projectId}
            className="flex items-center h-7 px-1.5 gap-1 overflow-x-auto scrollbar-thin"
          >
            {/* Project name */}
            <button
              onClick={() => handleProjectClick(row.projectId)}
              className="flex items-center gap-1.5 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded transition-colors shrink-0 whitespace-nowrap"
              title={t('activeProjects.switchTo', { project: row.projectName })}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: row.projectColor || '#6B7280' }}
              />
              <span className="truncate max-w-[100px]">{row.projectName}</span>
            </button>

            <div className="w-px h-3.5 bg-gray-300 dark:bg-neutral-700 shrink-0" />

            {/* Instance mini-tabs */}
            {row.instances.map((inst) => {
              const statusConfig = getStatusTabConfig(inst.status);
              return (
                <button
                  key={inst.id}
                  onClick={() => handleTabClick(row.projectId, 'instance', inst.id)}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded transition-colors shrink-0 whitespace-nowrap"
                  title={inst.prompt || inst.id}
                >
                  <span className="relative flex shrink-0">
                    <span
                      className={`inline-flex rounded-full h-1.5 w-1.5 ${statusConfig.color}`}
                    />
                    {statusConfig.pulse && (
                      <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusConfig.color} opacity-75`}
                      />
                    )}
                  </span>
                  <span className="truncate max-w-[80px]">
                    {inst.prompt || inst.terminalTitle || inst.id.slice(0, 6)}
                  </span>
                </button>
              );
            })}

            {/* Shell mini-tabs */}
            {row.shells.map((shell) => (
              <button
                key={shell.id}
                onClick={() => handleTabClick(row.projectId, 'shell', shell.id)}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded transition-colors shrink-0 whitespace-nowrap"
                title={t('activeProjects.shell')}
              >
                <TerminalIcon className="w-3 h-3" />
                <span>{t('activeProjects.shell')}</span>
              </button>
            ))}

            {/* File mini-tabs */}
            {row.files.map((file) => (
              <button
                key={file.relativePath}
                onClick={() => handleFileTabClick(row.projectId, file.relativePath)}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-neutral-800 rounded transition-colors shrink-0 whitespace-nowrap"
                title={file.relativePath}
              >
                <FileIcon className="w-3 h-3" />
                <span className="truncate max-w-[80px]">{file.basename}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}
