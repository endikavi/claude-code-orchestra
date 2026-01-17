import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from './projectStore';
import type { Project } from '@shared/types';

// Mock data
const mockProjects: Project[] = [
  {
    id: '1',
    name: 'Project 1',
    path: '/path/to/project1',
    description: 'First project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '2',
    name: 'Project 2',
    path: '/path/to/project2',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

describe('projectStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useProjectStore.setState({
      projects: [],
      selectedProjectId: null,
      isLoading: false,
      error: null,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have empty projects array', () => {
      const state = useProjectStore.getState();
      expect(state.projects).toEqual([]);
    });

    it('should have no selected project', () => {
      const state = useProjectStore.getState();
      expect(state.selectedProjectId).toBeNull();
    });

    it('should not be loading', () => {
      const state = useProjectStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('should have no error', () => {
      const state = useProjectStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('loadProjects', () => {
    it('should load projects successfully', async () => {
      window.electronAPI.project.getAll = vi.fn().mockResolvedValue(mockProjects);

      await useProjectStore.getState().loadProjects();

      const state = useProjectStore.getState();
      expect(state.projects).toEqual(mockProjects);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should set isLoading to true while loading', async () => {
      let resolvePromise: (value: Project[]) => void;
      window.electronAPI.project.getAll = vi.fn().mockReturnValue(
        new Promise<Project[]>((resolve) => {
          resolvePromise = resolve;
        })
      );

      const loadPromise = useProjectStore.getState().loadProjects();

      expect(useProjectStore.getState().isLoading).toBe(true);

      resolvePromise!(mockProjects);
      await loadPromise;

      expect(useProjectStore.getState().isLoading).toBe(false);
    });

    it('should handle errors', async () => {
      const errorMessage = 'Network error';
      window.electronAPI.project.getAll = vi.fn().mockRejectedValue(new Error(errorMessage));

      await useProjectStore.getState().loadProjects();

      const state = useProjectStore.getState();
      expect(state.error).toBe(errorMessage);
      expect(state.isLoading).toBe(false);
      expect(state.projects).toEqual([]);
    });
  });

  describe('createProject', () => {
    it('should create a project and add it to the list', async () => {
      const newProject: Project = {
        id: '3',
        name: 'New Project',
        path: '/path/to/new',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      window.electronAPI.project.create = vi.fn().mockResolvedValue(newProject);

      const result = await useProjectStore.getState().createProject({
        name: 'New Project',
        path: '/path/to/new',
      });

      expect(result).toEqual(newProject);
      expect(useProjectStore.getState().projects).toContainEqual(newProject);
    });

    it('should add new project at the beginning of the list', async () => {
      useProjectStore.setState({ projects: mockProjects });

      const newProject: Project = {
        id: '3',
        name: 'New Project',
        path: '/path/to/new',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      window.electronAPI.project.create = vi.fn().mockResolvedValue(newProject);

      await useProjectStore.getState().createProject({
        name: 'New Project',
        path: '/path/to/new',
      });

      expect(useProjectStore.getState().projects[0]).toEqual(newProject);
    });

    it('should handle creation errors', async () => {
      window.electronAPI.project.create = vi.fn().mockRejectedValue(new Error('Creation failed'));

      await expect(
        useProjectStore.getState().createProject({
          name: 'New Project',
          path: '/path/to/new',
        })
      ).rejects.toThrow('Creation failed');

      expect(useProjectStore.getState().error).toBe('Creation failed');
    });
  });

  describe('updateProject', () => {
    it('should update an existing project', async () => {
      useProjectStore.setState({ projects: mockProjects });

      const updatedProject: Project = {
        ...mockProjects[0],
        name: 'Updated Name',
      };

      window.electronAPI.project.update = vi.fn().mockResolvedValue(updatedProject);

      await useProjectStore.getState().updateProject(updatedProject);

      const state = useProjectStore.getState();
      const project = state.projects.find((p) => p.id === '1');
      expect(project?.name).toBe('Updated Name');
    });

    it('should handle update errors', async () => {
      useProjectStore.setState({ projects: mockProjects });

      window.electronAPI.project.update = vi.fn().mockRejectedValue(new Error('Update failed'));

      await expect(useProjectStore.getState().updateProject(mockProjects[0])).rejects.toThrow(
        'Update failed'
      );

      expect(useProjectStore.getState().error).toBe('Update failed');
    });
  });

  describe('deleteProject', () => {
    it('should delete a project from the list', async () => {
      useProjectStore.setState({ projects: mockProjects });

      window.electronAPI.project.delete = vi.fn().mockResolvedValue(undefined);

      await useProjectStore.getState().deleteProject('1');

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.projects.find((p) => p.id === '1')).toBeUndefined();
    });

    it('should clear selection if deleted project was selected', async () => {
      useProjectStore.setState({ projects: mockProjects, selectedProjectId: '1' });

      window.electronAPI.project.delete = vi.fn().mockResolvedValue(undefined);

      await useProjectStore.getState().deleteProject('1');

      expect(useProjectStore.getState().selectedProjectId).toBeNull();
    });

    it('should keep selection if different project was deleted', async () => {
      useProjectStore.setState({ projects: mockProjects, selectedProjectId: '1' });

      window.electronAPI.project.delete = vi.fn().mockResolvedValue(undefined);

      await useProjectStore.getState().deleteProject('2');

      expect(useProjectStore.getState().selectedProjectId).toBe('1');
    });

    it('should handle deletion errors', async () => {
      useProjectStore.setState({ projects: mockProjects });

      window.electronAPI.project.delete = vi.fn().mockRejectedValue(new Error('Delete failed'));

      await expect(useProjectStore.getState().deleteProject('1')).rejects.toThrow('Delete failed');

      expect(useProjectStore.getState().error).toBe('Delete failed');
      expect(useProjectStore.getState().projects).toHaveLength(2); // Not deleted
    });
  });

  describe('selectProject', () => {
    it('should select a project', () => {
      useProjectStore.setState({ projects: mockProjects });

      useProjectStore.getState().selectProject('1');

      expect(useProjectStore.getState().selectedProjectId).toBe('1');
    });

    it('should clear selection when null is passed', () => {
      useProjectStore.setState({ projects: mockProjects, selectedProjectId: '1' });

      useProjectStore.getState().selectProject(null);

      expect(useProjectStore.getState().selectedProjectId).toBeNull();
    });
  });

  describe('getSelectedProject', () => {
    it('should return the selected project', () => {
      useProjectStore.setState({ projects: mockProjects, selectedProjectId: '1' });

      const selected = useProjectStore.getState().getSelectedProject();

      expect(selected).toEqual(mockProjects[0]);
    });

    it('should return undefined if no project is selected', () => {
      useProjectStore.setState({ projects: mockProjects, selectedProjectId: null });

      const selected = useProjectStore.getState().getSelectedProject();

      expect(selected).toBeUndefined();
    });

    it('should return undefined if selected id does not exist', () => {
      useProjectStore.setState({ projects: mockProjects, selectedProjectId: 'nonexistent' });

      const selected = useProjectStore.getState().getSelectedProject();

      expect(selected).toBeUndefined();
    });
  });
});
