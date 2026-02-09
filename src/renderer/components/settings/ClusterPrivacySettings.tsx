import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useClusterStore } from '@renderer/stores/clusterStore';
import {
  ShieldIcon,
  EyeIcon,
  UsersIcon,
  TerminalIcon,
  XIcon,
  CheckIcon,
} from '@renderer/components/icons';

interface ClusterPrivacySettingsProps {
  className?: string;
}

export function ClusterPrivacySettings({ className = '' }: ClusterPrivacySettingsProps) {
  const { t } = useTranslation();
  const {
    privacy,
    nodes,
    localNodeId,
    loadPrivacy,
    updatePrivacy,
    addTrustedNode,
    removeTrustedNode,
    isTrustedNode,
    isLoading,
  } = useClusterStore(
    useShallow((s) => ({
      privacy: s.privacy,
      nodes: s.nodes,
      localNodeId: s.localNodeId,
      loadPrivacy: s.loadPrivacy,
      updatePrivacy: s.updatePrivacy,
      addTrustedNode: s.addTrustedNode,
      removeTrustedNode: s.removeTrustedNode,
      isTrustedNode: s.isTrustedNode,
      isLoading: s.isLoading,
    }))
  );

  useEffect(() => {
    loadPrivacy();
  }, [loadPrivacy]);

  if (!privacy) {
    return null;
  }

  const remoteNodes = nodes.filter((n) => n.id !== localNodeId && n.status === 'online');

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <ShieldIcon className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-medium">{t('cluster.privacy.title', 'Cluster Privacy')}</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('cluster.privacy.description', 'Control what other nodes can see and do')}
      </p>

      {/* Default Visibility */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <EyeIcon className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">
            {t('cluster.privacy.defaultVisibility', 'Default Visibility')}
          </h4>
        </div>

        <div className="space-y-2 pl-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacy.shareProjectsByDefault}
              onChange={(e) => updatePrivacy({ shareProjectsByDefault: e.target.checked })}
              disabled={isLoading}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">
              {t('cluster.privacy.shareProjects', 'Share projects by default')}
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacy.shareInstancesByDefault}
              onChange={(e) => updatePrivacy({ shareInstancesByDefault: e.target.checked })}
              disabled={isLoading}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">
              {t('cluster.privacy.shareInstances', 'Share instances by default')}
            </span>
          </label>
        </div>
      </div>

      {/* Remote Control */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">
            {t('cluster.privacy.remoteControl', 'Remote Control')}
          </h4>
        </div>

        <div className="space-y-2 pl-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacy.allowRemoteInstanceCreation}
              onChange={(e) => updatePrivacy({ allowRemoteInstanceCreation: e.target.checked })}
              disabled={isLoading}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">
              {t('cluster.privacy.allowRemoteCreate', 'Allow remote instance creation')}
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacy.allowRemoteInstanceInput}
              onChange={(e) => updatePrivacy({ allowRemoteInstanceInput: e.target.checked })}
              disabled={isLoading}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">
              {t('cluster.privacy.allowRemoteInput', 'Allow remote input')}
            </span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacy.allowRemoteInstanceKill}
              onChange={(e) => updatePrivacy({ allowRemoteInstanceKill: e.target.checked })}
              disabled={isLoading}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">
              {t('cluster.privacy.allowRemoteKill', 'Allow remote kill')}
            </span>
          </label>
        </div>
      </div>

      {/* Trusted Nodes */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UsersIcon className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">
            {t('cluster.privacy.trustedNodes', 'Trusted Nodes')}
          </h4>
        </div>

        <p className="text-xs text-muted-foreground pl-6">
          {t(
            'cluster.privacy.trustedNodesDesc',
            'Trusted nodes bypass all restrictions and have full access'
          )}
        </p>

        {remoteNodes.length === 0 ? (
          <p className="text-sm text-muted-foreground pl-6 italic">
            {t('cluster.privacy.noRemoteNodes', 'No remote nodes connected')}
          </p>
        ) : (
          <div className="space-y-2 pl-6">
            {remoteNodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      node.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-sm font-medium">{node.name}</span>
                  <span className="text-xs text-muted-foreground">({node.id.slice(0, 8)}...)</span>
                </div>

                <button
                  onClick={() =>
                    isTrustedNode(node.id) ? removeTrustedNode(node.id) : addTrustedNode(node.id)
                  }
                  disabled={isLoading}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                    isTrustedNode(node.id)
                      ? 'bg-green-500/20 text-green-600 hover:bg-red-500/20 hover:text-red-600'
                      : 'bg-muted hover:bg-primary/20 hover:text-primary'
                  }`}
                  title={
                    isTrustedNode(node.id)
                      ? t('cluster.privacy.removeTrust', 'Remove from trusted')
                      : t('cluster.privacy.addTrust', 'Add to trusted')
                  }
                >
                  {isTrustedNode(node.id) ? (
                    <>
                      <CheckIcon className="w-3 h-3" />
                      {t('cluster.privacy.trusted', 'Trusted')}
                    </>
                  ) : (
                    <>
                      <XIcon className="w-3 h-3" />
                      {t('cluster.privacy.notTrusted', 'Not trusted')}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Show trusted nodes that are not currently connected */}
        {privacy.trustedNodeIds.length > 0 && (
          <div className="pl-6 mt-2">
            <p className="text-xs text-muted-foreground mb-1">
              {t('cluster.privacy.trustedNodesList', 'Trusted node IDs:')}
            </p>
            <div className="flex flex-wrap gap-1">
              {privacy.trustedNodeIds.map((nodeId) => {
                const connectedNode = nodes.find((n) => n.id === nodeId);
                return (
                  <span
                    key={nodeId}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                      connectedNode
                        ? 'bg-green-500/20 text-green-600'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {connectedNode ? connectedNode.name : nodeId.slice(0, 8) + '...'}
                    <button
                      onClick={() => removeTrustedNode(nodeId)}
                      className="hover:text-red-500"
                      title={t('cluster.privacy.removeFromTrusted', 'Remove from trusted')}
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
