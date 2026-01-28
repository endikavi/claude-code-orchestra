import { useCallback } from 'react';
import { useInstanceStore } from '../stores/instanceStore';
import { useClusterStore } from '../stores/clusterStore';

/**
 * Hook to send input to a Claude instance, handling both local and remote (cluster) instances.
 * Routes input to the appropriate handler based on whether the instance is local or remote.
 *
 * Provides two methods:
 * - send: For raw terminal input (interactive mode)
 * - sendJson: For JSON-formatted messages (stream-json mode / structured view)
 */
export function useInstanceInput(instanceId: string) {
  const { sendInput, sendJsonMessage } = useInstanceStore();
  const { globalInstances, sendRemoteInput, isConnected: clusterConnected } = useClusterStore();

  // Check if instance is remote (belongs to another node in the cluster)
  const remoteInstance = clusterConnected
    ? globalInstances.find((i) => i.id === instanceId && !i.isLocal)
    : undefined;

  // Send raw terminal input (for interactive mode)
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

  // Send JSON-formatted message (for stream-json mode / structured view)
  const sendJson = useCallback(
    async (message: string) => {
      if (remoteInstance) {
        // Remote instance - for now, use regular send (cluster may need update for JSON)
        // TODO: Add sendRemoteJsonMessage to cluster store if needed
        await sendRemoteInput(instanceId, remoteInstance.nodeId, message);
      } else {
        // Local instance - send as JSON message
        await sendJsonMessage(instanceId, message);
      }
    },
    [instanceId, remoteInstance, sendRemoteInput, sendJsonMessage]
  );

  return {
    send,
    sendJson,
    isRemote: !!remoteInstance,
  };
}
