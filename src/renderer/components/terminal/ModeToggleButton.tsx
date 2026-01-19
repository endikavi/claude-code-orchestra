import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';

interface ModeToggleButtonProps {
  instanceId: string;
}

// Detect OS for correct keyboard shortcut
function getOsShortcut(): { key: string; label: string } {
  const platform = navigator.platform.toLowerCase();

  if (platform.includes('win')) {
    // Windows: Alt+M sends ESC followed by 'm'
    return { key: '\x1bm', label: 'Alt+M' };
  } else if (platform.includes('linux')) {
    // Linux: Shift+Tab sends CSI Z (backtab)
    return { key: '\x1b[Z', label: 'Shift+Tab' };
  } else {
    // macOS and others: default to Shift+Tab
    return { key: '\x1b[Z', label: 'Shift+Tab' };
  }
}

export function ModeToggleButton({ instanceId }: ModeToggleButtonProps) {
  const { t } = useTranslation();
  const { sendInput } = useInstanceStore();
  const { globalInstances, sendRemoteInput, isConnected: clusterConnected } = useClusterStore();
  const shortcut = getOsShortcut();

  // Check if instance is remote (belongs to another node)
  const remoteInstance = clusterConnected
    ? globalInstances.find((i) => i.id === instanceId && !i.isLocal)
    : null;

  const handleClick = useCallback(() => {
    if (remoteInstance) {
      // Remote instance - send through cluster
      void sendRemoteInput(instanceId, remoteInstance.nodeId, shortcut.key);
    } else {
      // Local instance - send directly
      void sendInput(instanceId, shortcut.key);
    }
  }, [instanceId, remoteInstance, sendRemoteInput, sendInput, shortcut.key]);

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-20 left-4 z-50 w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      title={`${t('modeToggle.title')} (${shortcut.label})`}
    >
      <ModeIcon className="w-6 h-6" />
    </button>
  );
}

function ModeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 9l4-4 4 4m0 6l-4 4-4-4"
      />
    </svg>
  );
}
