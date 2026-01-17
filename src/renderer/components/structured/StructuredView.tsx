import { useInstanceStore } from '../../stores/instanceStore';
import type { StreamMessage, ContentBlock } from '@shared/types';

interface StructuredViewProps {
  instanceId: string;
}

export function StructuredView({ instanceId }: StructuredViewProps) {
  const { getInstanceOutput, getSelectedInstance } = useInstanceStore();
  const output = getInstanceOutput(instanceId);
  const instance = getSelectedInstance();

  if (!output || output.messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-500">
        <div className="text-center">
          <SpinnerIcon className="w-8 h-8 mx-auto mb-3 animate-spin text-gray-400 dark:text-gray-600" />
          <p>Waiting for output...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Instance info */}
      {instance && (
        <div className="bg-white/50 dark:bg-gray-800 rounded-lg p-4 border border-claude-tan/30 dark:border-gray-700">
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

      {/* Messages */}
      {output.messages.map((message, index) => (
        <MessageCard key={index} message={message} />
      ))}
    </div>
  );
}

function MessageCard({ message }: { message: StreamMessage }) {
  const typeColors: Record<string, string> = {
    system: 'border-blue-500/50 bg-blue-500/10',
    assistant: 'border-claude-orange/50 bg-claude-orange/10',
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
      className={`rounded-lg border p-4 ${typeColors[message.type] || 'border-claude-tan/30 dark:border-gray-700 bg-white/50 dark:bg-gray-800'}`}
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
                    className="px-2 py-0.5 bg-claude-tan/30 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300"
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

      {/* Result message */}
      {message.type === 'result' && (
        <div className="space-y-2">
          {message.is_error && (
            <div className="text-red-500 dark:text-red-400 text-sm font-medium">Error</div>
          )}
          {message.result && (
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-claude-cream dark:bg-gray-900 rounded p-3">
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
      <div className="bg-claude-cream dark:bg-gray-900 rounded-lg p-3 border border-claude-tan/30 dark:border-gray-700">
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
      <details className="bg-claude-cream dark:bg-gray-900 rounded-lg border border-claude-tan/30 dark:border-gray-700">
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    starting: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    running: { bg: 'bg-green-500/20', text: 'text-green-400' },
    needs_permission: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
    tool_executing: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    completed: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
    error: { bg: 'bg-red-500/20', text: 'text-red-400' },
    killed: { bg: 'bg-gray-600/20', text: 'text-gray-500' },
  };

  const { bg, text } = config[status] || { bg: 'bg-gray-500/20', text: 'text-gray-400' };

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
