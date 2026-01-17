import { create } from 'zustand';
import type { Project } from '@shared/types';

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadProjects: () => Promise<void>;
  createProject: (data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Project>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;

  // Selectors
  getSelectedProject: () => Project | undefined;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  isLoading: false,
  error: null,

  loadProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const projects = await window.electronAPI.project.getAll();
      set({ projects, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load projects',
        isLoading: false,
      });
    }
  },

  createProject: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const project = await window.electronAPI.project.create(data);
      set((state) => ({
        projects: [project, ...state.projects],
        isLoading: false,
      }));
      return project;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create project',
        isLoading: false,
      });
      throw error;
    }
  },

  updateProject: async (project) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await window.electronAPI.project.update(project);
      set((state) => ({
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update project',
        isLoading: false,
      });
      throw error;
    }
  },

  deleteProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await window.electronAPI.project.delete(id);
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete project',
        isLoading: false,
      });
      throw error;
    }
  },

  selectProject: (id) => {
    set({ selectedProjectId: id });
  },

  getSelectedProject: () => {
    const state = get();
    return state.projects.find((p) => p.id === state.selectedProjectId);
  },
}));
