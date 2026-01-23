/**
 * Hook for managing Claude instances in the TUI
 */

import { useState, useEffect, useCallback } from 'react';
import { getProcessManager } from '../../../services/ProcessManager.js';
import { DataStore } from '../../../services/DataStore.js';
import type { ClaudeInstance, ClaudeModel, InstanceMode } from '@shared/types/index.js';
import type { InstanceListItem } from '../types.js';

export interface UseInstancesResult {
  instances: InstanceListItem[];
  selectedInstance: ClaudeInstance | null;
  isLoading: boolean;
  error: string | null;
  selectInstance: (id: string | null) => void;
  createInstance: (prompt?: string) => Promise<ClaudeInstance | null>;
  killInstance: (id?: string) => void;
  sendInput: (input: string) => void;
  refreshInstances: () => void;
}

export function useInstances(projectId: string | null): UseInstancesResult {
  const [instances, setInstances] = useState<InstanceListItem[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstances = useCallback(() => {
    try {
      const pm = getProcessManager();
      const allInstances = projectId ? pm.getInstancesByProject(projectId) : pm.getAllInstances();

      const instanceItems: InstanceListItem[] = allInstances.map((i) => ({
        id: i.id,
        projectId: i.projectId,
        status: i.status,
        title: i.id.slice(0, 8),
        model: i.model,
        createdAt: i.createdAt,
      }));

      setInstances(instanceItems);
      setError(null);

      // Clear selection if instance no longer exists
      if (selectedInstanceId && !allInstances.find((i) => i.id === selectedInstanceId)) {
        setSelectedInstanceId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load instances');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedInstanceId]);

  useEffect(() => {
    loadInstances();

    // Listen for instance events
    const pm = getProcessManager();

    const onInstanceCreated = () => loadInstances();
    const onInstanceRemoved = () => loadInstances();
    const onStatus = () => loadInstances();

    pm.on('instanceCreated', onInstanceCreated);
    pm.on('instanceRemoved', onInstanceRemoved);
    pm.on('instance:status', onStatus);

    // Refresh periodically for status updates
    const interval = setInterval(loadInstances, 1000);

    return () => {
      pm.off('instanceCreated', onInstanceCreated);
      pm.off('instanceRemoved', onInstanceRemoved);
      pm.off('instance:status', onStatus);
      clearInterval(interval);
    };
  }, [loadInstances]);

  const selectInstance = useCallback((id: string | null) => {
    setSelectedInstanceId(id);
  }, []);

  const createInstance = useCallback(
    (prompt?: string): ClaudeInstance | null => {
      if (!projectId) {
        setError('No project selected');
        return null;
      }

      try {
        const pm = getProcessManager();
        const dataStore = DataStore.getInstance();
        const project = dataStore.getProjectById(projectId);

        if (!project) {
          setError('Project not found');
          return null;
        }

        const model: ClaudeModel = 'sonnet';
        const mode: InstanceMode = 'interactive';

        const instance = pm.createInstance({
          projectId,
          model,
          mode,
          prompt,
        });

        setSelectedInstanceId(instance.id);
        loadInstances();
        return instance;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create instance');
        return null;
      }
    },
    [projectId, loadInstances]
  );

  const killInstance = useCallback(
    (id?: string) => {
      const targetId = id || selectedInstanceId;
      if (!targetId) return;

      try {
        const pm = getProcessManager();
        pm.killInstance(targetId);

        if (targetId === selectedInstanceId) {
          setSelectedInstanceId(null);
        }

        loadInstances();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to kill instance');
      }
    },
    [selectedInstanceId, loadInstances]
  );

  const sendInput = useCallback(
    (input: string) => {
      if (!selectedInstanceId) return;

      try {
        const pm = getProcessManager();
        pm.sendInput(selectedInstanceId, input);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send input');
      }
    },
    [selectedInstanceId]
  );

  const selectedInstance = selectedInstanceId
    ? getProcessManager().getInstance(selectedInstanceId)
    : null;

  return {
    instances,
    selectedInstance,
    isLoading,
    error,
    selectInstance,
    createInstance,
    killInstance,
    sendInput,
    refreshInstances: loadInstances,
  };
}
