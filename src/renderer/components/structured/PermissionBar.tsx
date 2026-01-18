import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceInput } from '../../hooks/useInstanceInput';

interface PermissionBarProps {
  instanceId: string;
}

export function PermissionBar({ instanceId }: PermissionBarProps) {
  const { t } = useTranslation();
  const { send } = useInstanceInput(instanceId);
  const [isSending, setIsSending] = useState(false);

  const handleAccept = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await send('y\r');
    } finally {
      setIsSending(false);
    }
  }, [send, isSending]);

  const handleReject = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await send('n\r');
    } finally {
      setIsSending(false);
    }
  }, [send, isSending]);

  return (
    <div className="border-t border-orange-500/30 bg-orange-500/10 dark:bg-orange-500/5 p-4">
      <div className="flex items-center justify-center gap-3">
        <span className="text-sm text-orange-700 dark:text-orange-400 font-medium mr-2">
          {t('structuredChat.permissionRequired')}
        </span>
        <button
          onClick={handleAccept}
          disabled={isSending}
          className={`
            flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium
            transition-colors duration-200
            ${
              isSending
                ? 'bg-green-300 dark:bg-green-800 text-green-100 cursor-not-allowed'
                : 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
            }
          `}
        >
          <CheckIcon className="w-4 h-4" />
          {t('structuredChat.accept')}
        </button>
        <button
          onClick={handleReject}
          disabled={isSending}
          className={`
            flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium
            transition-colors duration-200
            ${
              isSending
                ? 'bg-red-300 dark:bg-red-800 text-red-100 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
            }
          `}
        >
          <XIcon className="w-4 h-4" />
          {t('structuredChat.reject')}
        </button>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
