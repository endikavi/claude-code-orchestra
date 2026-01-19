import { useCallback } from 'react';
import { useInstanceStore } from '../stores/instanceStore';
import { useClusterStore } from '../stores/clusterStore';

/**
 * Hook to send input to a Claude instance, handling both local and remote (cluster) instances.
 * Routes input to the appropriate handler based on whether the instance is local or remote.
 */
export function useInstanceInput(instanceId: string) {
  const { sendInput } = useInstanceStore();
  const { globalInstances, sendRemoteInput, isConnected: clusterConnected } = useClusterStore();

  // Check if instance is remote (belongs to another node in the cluster)
  const remoteInstance = clusterConnected
    ? globalInstances.find((i) => i.id === instanceId && !i.isLocal)
    : undefined;

  const send = useCallback(
    async (input: string) => {
      if (remoteInstance) {
        // Remote instance - send through cluster
        await sendRemoteInput(instanceId, remoteInstance.nodeId, input);
      } else {
        // Local instance - send directly
        await sendInput(instanceId, input);
      }
    },
    [instanceId, remoteInstance, sendRemoteInput, sendInput]
  );

  return {
    send,
    isRemote: !!remoteInstance,
  };
}
