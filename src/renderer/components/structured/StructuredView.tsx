import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../../stores/instanceStore';
import { ChatInput } from './ChatInput';
import { PermissionBar } from './PermissionBar';
import { getStatusBadgeConfig } from '../../utils/statusConfig';
import type { StreamMessage, ContentBlock } from '@shared/types';

interface StructuredViewProps {
  instanceId: string;
}

export function StructuredView({ instanceId }: StructuredViewProps) {
  const { t } = useTranslation();
  const { getInstanceOutput, getSelectedInstance, getPendingPermissionForInstance } =
    useInstanceStore();
  const output = getInstanceOutput(instanceId);
  const instance = getSelectedInstance();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check for pending MCP permission prompt
  const pendingPermission = getPendingPermissionForInstance(instanceId);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output?.messages.length]);

  const status = instance?.status || 'starting';
  const isPending = status === 'pending';
  // Show permission bar when status is 'needs_permission' OR when there's a pending MCP permission
  const showPermissionBar = status === 'needs_permission' || pendingPermission !== undefined;

  // For pending instances, show welcome screen with chat input
  if (isPending) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <ChatIcon className="w-12 h-12 mx-auto mb-4 text-sky-500" />
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
              {t('structuredChat.welcome.title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              {t('structuredChat.welcome.description')}
            </p>
            {instance && (
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-4 p-3 bg-white/50 dark:bg-neutral-900 rounded border border-gray-200 dark:border-neutral-700">
                <span className="font-medium">{t('instance.model')}:</span> {instance.model}
                {instance.planMode && <span className="ml-2">&bull; {t('instance.planMode')}</span>}
              </div>
            )}
          </div>
        </div>
        <ChatInput instanceId={instanceId} status={status} />
      </div>
    );
  }

  // For starting/running instances with no output yet, show spinner
  if (!output || output.messages.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-500">
          <div className="text-center">
            <SpinnerIcon className="w-8 h-8 mx-auto mb-3 animate-spin text-gray-400 dark:text-gray-600" />
            <p>{t('structuredChat.waitingForOutput')}</p>
          </div>
        </div>
        {/* Show chat input even when waiting */}
        {!showPermissionBar && <ChatInput instanceId={instanceId} status={status} />}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages - scrollable area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Instance info */}
        {instance && (
          <div className="bg-white/50 dark:bg-neutral-900 rounded p-4 border border-gray-200 dark:border-neutral-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Instance</span>
              <StatusBadge status={instance.status} />
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
              <div>Model: {instance.model}</div>
              <div>Mode: {instance.mode}</div>
              <div className="truncate" title={instance.prompt}>
                Prompt: {instance.prompt}
              </div>
            </div>
          </div>
        )}

        {/* Messages - filter out user messages that only contain tool_results */}
        {output.messages
          .filter((message) => {
            // Keep all non-user messages
            if (message.type !== 'user') return true;
            // Filter out user messages that only contain tool_result content
            // These are automatic responses from tool executions, not actual user input
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const content = message.message?.content as any;
            if (!content) return false;
            // If content is a string (plain user message from Claude CLI), show it
            if (typeof content === 'string') return content.length > 0;
            // If content is an array, check if all are tool_results (hide those)
            if (Array.isArray(content)) {
              if (content.length === 0) return false;
              const allToolResults = content.every(
                (block: { type: string }) => block.type === 'tool_result'
              );
              return !allToolResults;
            }
            return true;
          })
          .map((message, index) => (
            <MessageCard key={index} message={message} />
          ))}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Permission bar - shown when needs_permission */}
      {showPermissionBar && <PermissionBar instanceId={instanceId} />}

      {/* Chat input - shown when not needs_permission */}
      {!showPermissionBar && <ChatInput instanceId={instanceId} status={status} />}
    </div>
  );
}

function MessageCard({ message }: { message: StreamMessage }) {
  const typeColors: Record<string, string> = {
    system: 'border-blue-500/50 bg-blue-500/10',
    assistant: 'border-sky-500/50 bg-sky-500/10',
    user: 'border-green-500/50 bg-green-500/10',
    result: 'border-purple-500/50 bg-purple-500/10',
  };

  const typeLabels: Record<string, string> = {
    system: 'System',
    assistant: 'Assistant',
    user: 'User',
    result: 'Result',
  };

  return (
    <div
      className={`rounded border p-4 ${typeColors[message.type] || 'border-gray-200 dark:border-neutral-700 bg-white/50 dark:bg-neutral-900'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {typeLabels[message.type] || message.type}
          {message.subtype && ` (${message.subtype})`}
        </span>
        {message.cost_usd !== undefined && (
          <span className="text-xs text-gray-500 dark:text-gray-500">
            ${message.cost_usd.toFixed(4)}
          </span>
        )}
      </div>

      {/* System message details */}
      {message.type === 'system' && (
        <div className="space-y-2 text-sm">
          {message.session_id && (
            <div className="text-gray-600 dark:text-gray-400">
              Session:{' '}
              <code className="text-gray-700 dark:text-gray-300">{message.session_id}</code>
            </div>
          )}
          {message.tools && message.tools.length > 0 && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">Tools:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {message.tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-0.5 bg-gray-200 dark:bg-neutral-800 rounded text-xs text-gray-700 dark:text-gray-300"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assistant message content */}
      {message.type === 'assistant' && message.message?.content && (
        <div className="space-y-3">
          {message.message.content.map((block, index) => (
            <ContentBlockView key={index} block={block} />
          ))}
        </div>
      )}

      {/* User message content */}
      {message.type === 'user' && message.message?.content && (
        <UserMessageContent content={message.message.content} />
      )}

      {/* Result message */}
      {message.type === 'result' && (
        <div className="space-y-2">
          {message.is_error && (
            <div className="text-red-500 dark:text-red-400 text-sm font-medium">Error</div>
          )}
          {message.result && (
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-gray-100 dark:bg-neutral-950 rounded p-3">
              {message.result}
            </div>
          )}
          {message.duration_ms !== undefined && (
            <div className="text-xs text-gray-500 dark:text-gray-500">
              Duration: {(message.duration_ms / 1000).toFixed(2)}s
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  if (block.type === 'text') {
    return (
      <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
        {block.text}
      </div>
    );
  }

  if (block.type === 'tool_use') {
    return (
      <div className="bg-gray-100 dark:bg-neutral-950 rounded p-3 border border-gray-200 dark:border-neutral-700">
        <div className="flex items-center gap-2 mb-2">
          <ToolIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-500 dark:text-blue-400">{block.name}</span>
        </div>
        <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      </div>
    );
  }

  if (block.type === 'thinking') {
    return (
      <details className="bg-gray-100 dark:bg-neutral-950 rounded border border-gray-200 dark:border-neutral-700">
        <summary className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-300">
          Thinking...
        </summary>
        <div className="px-3 pb-3 text-sm text-gray-500 dark:text-gray-500 whitespace-pre-wrap">
          {block.thinking}
        </div>
      </details>
    );
  }

  return null;
}

// Handle user message content which can be string or ContentBlock[] at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function UserMessageContent({ content }: { content: any }) {
  // String content (plain user message from Claude CLI)
  if (typeof content === 'string') {
    return (
      <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{content}</div>
    );
  }

  // Array content (ContentBlock[])
  if (Array.isArray(content)) {
    return (
      <div className="space-y-3">
        {content.map((block: ContentBlock, index: number) => (
          <ContentBlockView key={index} block={block} />
        ))}
      </div>
    );
  }

  return null;
}

function StatusBadge({ status }: { status: string }) {
  const { bg, text } = getStatusBadgeConfig(status as import('@shared/types').InstanceStatus);

  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${bg} ${text}`}>{status}</span>;
}

function SpinnerIcon({ className }: { className?: string }) {
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

function ToolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}
