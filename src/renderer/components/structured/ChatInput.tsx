import { useState, useCallback, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceInput } from '../../hooks/useInstanceInput';
import { useInstanceStore } from '../../stores/instanceStore';
import type { InstanceStatus } from '@shared/types';

interface ChatInputProps {
  instanceId: string;
  status: InstanceStatus;
  initialPrompt?: string; // Optional initial prompt to pre-fill (from preset)
}

const MIN_ROWS = 1;
const MAX_ROWS = 6;

/**
 * Determines if input should be enabled based on instance status
 */
function isInputEnabled(status: InstanceStatus): boolean {
  // Enable for pending (first message activates the instance)
  // Enable for running/waiting_input (normal interaction)
  return status === 'pending' || status === 'running' || status === 'waiting_input';
}

export function ChatInput({ instanceId, status, initialPrompt }: ChatInputProps) {
  const { t } = useTranslation();
  const { sendJson } = useInstanceInput(instanceId);
  const { activatePendingInstance } = useInstanceStore();
  const [message, setMessage] = useState(initialPrompt || '');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isPending = status === 'pending';
  const enabled = isInputEnabled(status);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get proper scrollHeight
    textarea.style.height = 'auto';

    // Calculate line height (approximately 24px for text-sm)
    const lineHeight = 24;
    const minHeight = lineHeight * MIN_ROWS;
    const maxHeight = lineHeight * MAX_ROWS;

    // Clamp the height between min and max
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [message]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !enabled || isSending) return;

    setIsSending(true);
    try {
      if (isPending) {
        // First message: activate the pending instance with this prompt
        await activatePendingInstance(instanceId, message.trim());
      } else {
        // Send message as JSON for stream-json mode (structured view uses non-interactive Claude)
        await sendJson(message.trim());
      }
      setMessage('');
    } finally {
      setIsSending(false);
    }
  }, [message, enabled, isSending, isPending, instanceId, activatePendingInstance, sendJson]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends message, Shift+Enter adds new line
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  }, []);

  return (
    <div className="border-t border-claude-tan/30 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 p-3">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={!enabled || isSending}
          placeholder={
            isPending
              ? t('structuredChat.pendingPlaceholder')
              : enabled
                ? t('structuredChat.placeholder')
                : t('structuredChat.disabledPlaceholder')
          }
          rows={1}
          className={`
            flex-1 resize-none rounded-lg border px-3 py-2 text-sm
            transition-colors duration-200
            ${
              enabled
                ? 'border-claude-tan/50 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-claude-orange dark:focus:border-claude-orange focus:outline-none focus:ring-1 focus:ring-claude-orange/50'
                : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }
          `}
        />
        <button
          onClick={handleSend}
          disabled={!enabled || !message.trim() || isSending}
          className={`
            shrink-0 rounded-lg px-4 py-2 text-sm font-medium
            transition-colors duration-200
            ${
              enabled && message.trim() && !isSending
                ? 'bg-claude-orange text-white hover:bg-claude-orange/90 active:bg-claude-orange/80'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isSending ? (
            <SendingIcon className="w-5 h-5 animate-spin" />
          ) : (
            <SendIcon className="w-5 h-5" />
          )}
        </button>
      </div>
      <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
        {t('structuredChat.hint')}
      </div>
    </div>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
      />
    </svg>
  );
}

function SendingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
