import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';

interface MobileKeyboardProps {
  instanceId: string;
}

export function MobileKeyboard({ instanceId }: MobileKeyboardProps) {
  const { t } = useTranslation();
  const { sendInput } = useInstanceStore();
  const { globalInstances, sendRemoteInput, isConnected: clusterConnected } = useClusterStore();
  const [isOpen, setIsOpen] = useState(false);

  // Check if instance is remote (belongs to another node)
  const remoteInstance = clusterConnected
    ? globalInstances.find((i) => i.id === instanceId && !i.isLocal)
    : null;

  const handleKey = useCallback(
    (key: string) => {
      if (remoteInstance) {
        // Remote instance - send through cluster
        void sendRemoteInput(instanceId, remoteInstance.nodeId, key);
      } else {
        // Local instance - send directly
        void sendInput(instanceId, key);
      }
    },
    [instanceId, remoteInstance, sendRemoteInput, sendInput]
  );

  // Key codes
  const KEYS = {
    TAB: '\t',
    ENTER: '\r',
    SPACE: ' ',
    UP: '\x1b[A',
    DOWN: '\x1b[B',
    // Permission keys for Claude Code
    YES: 'y',
    NO: 'n',
    ESCAPE: '\x1b',
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-claude-orange hover:bg-claude-tan text-white shadow-lg flex items-center justify-center transition-colors"
        title={t('mobileKeyboard.open')}
      >
        <KeyboardIcon className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-claude-beige dark:bg-gray-800 border-t border-claude-tan/30 dark:border-gray-700 p-2 pb-safe">
      {/* Close button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 rounded-md hover:bg-claude-tan/20 dark:hover:bg-gray-700 transition-colors"
          title={t('mobileKeyboard.close')}
        >
          <CloseIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      {/* Keyboard grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* First row: Tab, Up, Permission toggle (y/n) */}
        <KeyButton onClick={() => handleKey(KEYS.TAB)} label="Tab" />
        <KeyButton onClick={() => handleKey(KEYS.UP)} label={<ArrowUpIcon />} />
        <div className="flex gap-1">
          <KeyButton
            onClick={() => handleKey(KEYS.YES)}
            label="Y"
            className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-700 dark:text-green-400"
            title={t('mobileKeyboard.accept')}
          />
          <KeyButton
            onClick={() => handleKey(KEYS.NO)}
            label="N"
            className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-700 dark:text-red-400"
            title={t('mobileKeyboard.reject')}
          />
        </div>

        {/* Second row: Space, Down, Enter */}
        <KeyButton onClick={() => handleKey(KEYS.SPACE)} label="Space" />
        <KeyButton onClick={() => handleKey(KEYS.DOWN)} label={<ArrowDownIcon />} />
        <KeyButton
          onClick={() => handleKey(KEYS.ENTER)}
          label="Enter"
          className="bg-claude-orange/20 hover:bg-claude-orange/30 text-claude-orange"
        />
      </div>

      {/* Extra row for Escape */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <KeyButton
          onClick={() => handleKey(KEYS.ESCAPE)}
          label="Esc"
          className="bg-gray-500/20 hover:bg-gray-500/30"
        />
      </div>
    </div>
  );
}

interface KeyButtonProps {
  onClick: () => void;
  label: React.ReactNode;
  className?: string;
  title?: string;
}

function KeyButton({ onClick, label, className = '', title }: KeyButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`h-12 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium text-sm flex items-center justify-center transition-colors active:scale-95 ${className}`}
      title={title}
    >
      {label}
    </button>
  );
}

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19V5M5 12l7-7 7 7"
      />
      <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={2} />
      <path
        strokeLinecap="round"
        strokeWidth={2}
        d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
