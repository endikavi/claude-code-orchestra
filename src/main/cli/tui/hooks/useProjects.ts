/**
 * Hook for managing projects in the TUI
 */

import { useState, useEffect, useCallback } from 'react';
import { DataStore } from '../../../services/DataStore.js';
import type { Project } from '@shared/types/index.js';
import type { ProjectListItem } from '../types.js';
import { getProcessManager } from '../../../services/ProcessManager.js';

export interface UseProjectsResult {
  projects: ProjectListItem[];
  selectedProject: Project | null;
  isLoading: boolean;
  error: string | null;
  selectProject: (id: string | null) => void;
  refreshProjects: () => void;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(() => {
    try {
      const dataStore = DataStore.getInstance();
      const processManager = getProcessManager();
      const allProjects = dataStore.getAllProjects();
      const allInstances = processManager.getAllInstances();

      // Map projects with instance counts
      const projectItems: ProjectListItem[] = allProjects.map((p) => ({
        id: p.id,
        name: p.name,
        path: p.path,
        color: p.color,
        instanceCount: allInstances.filter((i) => i.projectId === p.id).length,
      }));

      setProjects(projectItems);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();

    // Refresh projects periodically
    const interval = setInterval(loadProjects, 2000);
    return () => clearInterval(interval);
  }, [loadProjects]);

  const selectProject = useCallback((id: string | null) => {
    setSelectedProjectId(id);
  }, []);

  const selectedProject = selectedProjectId
    ? DataStore.getInstance().getProjectById(selectedProjectId)
    : null;

  return {
    projects,
    selectedProject,
    isLoading,
    error,
    selectProject,
    refreshProjects: loadProjects,
  };
}
