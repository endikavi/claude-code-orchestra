import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../stores/projectStore';
import { useInstanceStore } from '../stores/instanceStore';
import { useUIStore } from '../stores/uiStore';

export function useKeyboardShortcuts() {
  const { selectedProjectId } = useProjectStore(
    useShallow((s) => ({
      selectedProjectId: s.selectedProjectId,
    }))
  );
  const { instances, selectedInstanceId, selectInstance, killInstance } = useInstanceStore(
    useShallow((s) => ({
      instances: s.instances,
      selectedInstanceId: s.selectedInstanceId,
      selectInstance: s.selectInstance,
      killInstance: s.killInstance,
    }))
  );
  const { setShowProjectModal, setShowInstanceModal, setShowQuickOpen } = useUIStore(
    useShallow((s) => ({
      setShowProjectModal: s.setShowProjectModal,
      setShowInstanceModal: s.setShowInstanceModal,
      setShowQuickOpen: s.setShowQuickOpen,
    }))
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl+P: Quick Open (works even in inputs)
      if (isMod && e.key === 'p') {
        e.preventDefault();
        setShowQuickOpen(true);
        return;
      }

      // Ignore if typing in an input (for other shortcuts)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedProjectId,
    selectedInstanceId,
    instances,
    setShowProjectModal,
    setShowInstanceModal,
    setShowQuickOpen,
    killInstance,
    selectInstance,
  ]);
}
