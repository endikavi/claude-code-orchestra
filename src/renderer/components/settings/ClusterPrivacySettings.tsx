import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useClusterStore } from '@renderer/stores/clusterStore';

// Icon components
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m9 5.197v1"
      />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

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
  } = useClusterStore();

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
