import { useEffect } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useInstanceStore } from '../stores/instanceStore';
import { useUIStore } from '../stores/uiStore';

export function useKeyboardShortcuts() {
  const { selectedProjectId } = useProjectStore();
  const { instances, selectedInstanceId, selectInstance, killInstance } = useInstanceStore();
  const { setShowProjectModal, setShowInstanceModal, toggleViewMode } = useUIStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl+N: New project
      if (isMod && e.key === 'n') {
        e.preventDefault();
        setShowProjectModal(true);
        return;
      }

      // Ctrl+T: New instance (if project selected)
      if (isMod && e.key === 't' && selectedProjectId) {
        e.preventDefault();
        setShowInstanceModal(true);
        return;
      }

      // Ctrl+W: Close current instance
      if (isMod && e.key === 'w' && selectedInstanceId) {
        e.preventDefault();
        void killInstance(selectedInstanceId);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab: Switch tabs
      if (isMod && e.key === 'Tab') {
        e.preventDefault();
        const projectInstances = instances.filter((i) => i.projectId === selectedProjectId);
        if (projectInstances.length <= 1) return;

        const currentIndex = projectInstances.findIndex((i) => i.id === selectedInstanceId);
        let nextIndex: number;

        if (e.shiftKey) {
          nextIndex = currentIndex <= 0 ? projectInstances.length - 1 : currentIndex - 1;
        } else {
          nextIndex = currentIndex >= projectInstances.length - 1 ? 0 : currentIndex + 1;
        }

        selectInstance(projectInstances[nextIndex].id);
        return;
      }

      // Ctrl+\: Toggle view mode
      if (isMod && e.key === '\\') {
        e.preventDefault();
        toggleViewMode();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedProjectId,
    selectedInstanceId,
    instances,
    setShowProjectModal,
    setShowInstanceModal,
    killInstance,
    selectInstance,
    toggleViewMode,
  ]);
}
