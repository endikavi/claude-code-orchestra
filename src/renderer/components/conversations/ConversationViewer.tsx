import { useTranslation } from 'react-i18next';
import { useConversationStore } from '../../stores/conversationStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import type { StreamMessage, ContentBlock, ConversationMessage } from '@shared/types';

export function ConversationViewer() {
  const { t } = useTranslation();
  const { viewingConversation, viewingMessages, isLoadingViewer, closeConversationViewer } =
    useConversationStore();
  const { resumeConversation } = useInstanceStore();
  const { setViewMode } = useUIStore();

  if (!viewingConversation) {
    return null;
  }

  const handleResume = async () => {
    try {
      closeConversationViewer();
      setViewMode('terminal'); // Switch to terminal mode when resuming
      await resumeConversation(viewingConversation);
    } catch (error) {
      console.error('Failed to resume conversation:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const parseMessageContent = (message: ConversationMessage): StreamMessage | null => {
    try {
      return JSON.parse(message.content) as StreamMessage;
    } catch {
      return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-100 dark:bg-neutral-950">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={closeConversationViewer}
            className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-700 rounded transition-colors"
            title={t('common.back')}
          >
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>

          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 dark:text-white truncate">
              {viewingConversation.title}
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span className="uppercase">{viewingConversation.model}</span>
              <span>
                {viewingConversation.messageCount} {t('common.messages')}
              </span>
              <span>{formatDate(viewingConversation.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
              {t('viewer.readOnly')}
            </span>
            {viewingConversation.sessionId && (
              <button
                onClick={handleResume}
                className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-500-dark text-white rounded transition-colors text-sm font-medium"
              >
                <PlayIcon className="w-4 h-4" />
                {t('viewer.resume')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingViewer ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
          </div>
        ) : viewingMessages.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>{t('viewer.noMessages')}</p>
          </div>
        ) : (
          viewingMessages.map((message, index) => {
            const parsed = parseMessageContent(message);
            if (!parsed) return null;
            return <MessageCard key={index} message={parsed} />;
          })
        )}
      </div>
    </div>
  );
}

function MessageCard({ message }: { message: StreamMessage }) {
  const typeColors: Record<string, string> = {
    system: 'border-blue-500/50 bg-blue-500/10',
    assistant: 'border-sky-500/50 bg-sky-500/10',
    user: 'border-green-500/50 bg-green-500/10',
    result: 'border-purple-500/50 bg-purple-500/10',
    summary: 'border-yellow-500/50 bg-yellow-500/10',
  };

  const typeLabels: Record<string, string> = {
    system: 'System',
    assistant: 'Assistant',
    user: 'User',
    result: 'Result',
    summary: 'Summary',
  };

  // Extract user message content - can be in different formats
  const getUserContent = (): string | null => {
    if (message.type !== 'user') return null;

    // Check message.message.content (standard format)
    if (message.message?.content) {
      if (typeof message.message.content === 'string') {
        return message.message.content;
      }
      if (Array.isArray(message.message.content)) {
        const texts = message.message.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text);
        if (texts.length > 0) return texts.join('\n');
      }
    }

    // Check direct content property (alternative format from Claude CLI)
    const rawMessage = message as unknown as Record<string, unknown>;
    if (typeof rawMessage.content === 'string') {
      return rawMessage.content;
    }

    return null;
  };

  // Check if message has visible content
  const hasVisibleContent = (): boolean => {
    // System messages with session_id or tools are visible
    if (message.type === 'system') {
      return !!(message.session_id || (message.tools && message.tools.length > 0));
    }

    // Assistant messages need content blocks
    if (message.type === 'assistant') {
      return !!(message.message?.content && message.message.content.length > 0);
    }

    // User messages need content
    if (message.type === 'user') {
      return getUserContent() !== null;
    }

    // Result messages need result text
    if (message.type === 'result') {
      return !!(message.result || message.is_error);
    }

    // Summary and unknown types - skip if no specific content
    if (message.type === 'summary' || !typeLabels[message.type]) {
      return false;
    }

    return true;
  };

  // Skip empty messages
  if (!hasVisibleContent()) {
    return null;
  }

  const userContent = message.type === 'user' ? getUserContent() : null;

  return (
    <div
      className={`rounded border p-4 ${typeColors[message.type] || 'border-gray-200 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800'}`}
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
                    className="px-2 py-0.5 bg-gray-200 dark:bg-neutral-700 rounded text-xs text-gray-700 dark:text-gray-300"
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
      {message.type === 'user' && userContent && (
        <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
          {userContent}
        </div>
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

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
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
