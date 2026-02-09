import { useState, useCallback, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useInstanceInput } from '../../hooks/useInstanceInput';
import { useInstanceStore } from '../../stores/instanceStore';
import { SendIcon, SendingIcon } from '@renderer/components/icons';
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
function isInputEnabled(status: InstanceStatus, hasSessionId: boolean): boolean {
  // Enable for pending (first message activates the instance)
  // Enable for running/waiting_input (normal interaction)
  // Enable for completed if we have a sessionId (can resume the conversation)
  if (status === 'pending' || status === 'running' || status === 'waiting_input') {
    return true;
  }
  // Allow resuming completed instances that have a session
  if (status === 'completed' && hasSessionId) {
    return true;
  }
  return false;
}

export function ChatInput({ instanceId, status, initialPrompt }: ChatInputProps) {
  const { t } = useTranslation();
  const { sendJson } = useInstanceInput(instanceId);
  const { activatePendingInstance, resumeCompletedInstance, instances } = useInstanceStore(
    useShallow((s) => ({
      activatePendingInstance: s.activatePendingInstance,
      resumeCompletedInstance: s.resumeCompletedInstance,
      instances: s.instances,
    }))
  );
  const [message, setMessage] = useState(initialPrompt || '');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get current instance to check for sessionId
  const instance = instances.find((i) => i.id === instanceId);
  const hasSessionId = Boolean(instance?.sessionId);

  const isPending = status === 'pending';
  const isCompleted = status === 'completed';
  const enabled = isInputEnabled(status, hasSessionId);

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
      } else if (isCompleted && hasSessionId) {
        // Resume completed instance with new message
        await resumeCompletedInstance(instanceId, message.trim());
      } else {
        // Send message as JSON for stream-json mode (structured view uses non-interactive Claude)
        await sendJson(message.trim());
      }
      setMessage('');
    } finally {
      setIsSending(false);
    }
  }, [
    message,
    enabled,
    isSending,
    isPending,
    isCompleted,
    hasSessionId,
    instanceId,
    activatePendingInstance,
    resumeCompletedInstance,
    sendJson,
  ]);

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
    <div className="border-t border-gray-200 dark:border-neutral-700 bg-white/50 dark:bg-neutral-900/50 p-3">
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
            flex-1 resize-none rounded border px-3 py-2 text-sm
            transition-colors duration-200
            ${
              enabled
                ? 'border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-950 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-sky-500 dark:focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50'
                : 'border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-900 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }
          `}
        />
        <button
          onClick={handleSend}
          disabled={!enabled || !message.trim() || isSending}
          className={`
            shrink-0 rounded px-4 py-2 text-sm font-medium
            transition-colors duration-200
            ${
              enabled && message.trim() && !isSending
                ? 'bg-sky-500 text-white hover:bg-sky-500/90 active:bg-sky-500/80'
                : 'bg-gray-200 dark:bg-neutral-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
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
