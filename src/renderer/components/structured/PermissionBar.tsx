import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceInput } from '../../hooks/useInstanceInput';
import { useInstanceStore } from '../../stores/instanceStore';

interface PermissionBarProps {
  instanceId: string;
}

export function PermissionBar({ instanceId }: PermissionBarProps) {
  const { t } = useTranslation();
  const { send } = useInstanceInput(instanceId);
  const [isSending, setIsSending] = useState(false);

  // Get pending permission from store (for MCP permission prompt tool)
  const pendingPermission = useInstanceStore((state) =>
    state.getPendingPermissionForInstance(instanceId)
  );
  const respondToPermission = useInstanceStore((state) => state.respondToPermission);

  // Handler for MCP permission prompt (structured view)
  const handleMcpAllow = useCallback(async () => {
    if (isSending || !pendingPermission) return;
    setIsSending(true);
    try {
      await respondToPermission(pendingPermission.id, {
        allowed: true,
        updatedInput: pendingPermission.toolInput,
      });
    } finally {
      setIsSending(false);
    }
  }, [respondToPermission, pendingPermission, isSending]);

  const handleMcpDeny = useCallback(async () => {
    if (isSending || !pendingPermission) return;
    setIsSending(true);
    try {
      await respondToPermission(pendingPermission.id, {
        allowed: false,
        message: 'User denied this action',
      });
    } finally {
      setIsSending(false);
    }
  }, [respondToPermission, pendingPermission, isSending]);

  // Handler for terminal-based permission (fallback for non-MCP mode)
  const handleTerminalAccept = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await send('y\r');
    } finally {
      setIsSending(false);
    }
  }, [send, isSending]);

  const handleTerminalReject = useCallback(async () => {
    if (isSending) return;
    setIsSending(true);
    try {
      await send('n\r');
    } finally {
      setIsSending(false);
    }
  }, [send, isSending]);

  // Use MCP handlers if there's a pending permission, otherwise use terminal handlers
  const handleAccept = pendingPermission ? handleMcpAllow : handleTerminalAccept;
  const handleReject = pendingPermission ? handleMcpDeny : handleTerminalReject;

  // Format tool input for display
  const formatToolInput = (input: Record<string, unknown>): string => {
    // Special handling for common tools
    if ('command' in input && typeof input.command === 'string') {
      return input.command;
    }
    if ('file_path' in input && typeof input.file_path === 'string') {
      return input.file_path;
    }
    // Fallback to JSON
    return JSON.stringify(input, null, 2);
  };

  return (
    <div className="border-t border-orange-500/30 bg-orange-500/10 dark:bg-orange-500/5 p-4">
      {/* Show detailed permission info if available (MCP mode) */}
      {pendingPermission && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldIcon className="w-5 h-5 text-orange-500" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">
              {t('permissionPrompt.toolRequest', { tool: pendingPermission.toolName })}
            </span>
          </div>
          <div className="bg-white/50 dark:bg-neutral-800/50 rounded p-3 border border-orange-500/20">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all font-mono overflow-x-auto max-h-32">
              {formatToolInput(pendingPermission.toolInput)}
            </pre>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        {!pendingPermission && (
          <span className="text-sm text-orange-700 dark:text-orange-400 font-medium mr-2">
            {t('structuredChat.permissionRequired')}
          </span>
        )}
        <button
          onClick={handleAccept}
          disabled={isSending}
          className={`
            flex items-center gap-2 rounded px-6 py-2.5 text-sm font-medium
            transition-colors duration-200
            ${
              isSending
                ? 'bg-green-300 dark:bg-green-800 text-green-100 cursor-not-allowed'
                : 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
            }
          `}
        >
          <CheckIcon className="w-4 h-4" />
          {t('permissionPrompt.allow')}
        </button>
        <button
          onClick={handleReject}
          disabled={isSending}
          className={`
            flex items-center gap-2 rounded px-6 py-2.5 text-sm font-medium
            transition-colors duration-200
            ${
              isSending
                ? 'bg-red-300 dark:bg-red-800 text-red-100 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
            }
          `}
        >
          <XIcon className="w-4 h-4" />
          {t('permissionPrompt.deny')}
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
