import type { StreamMessage } from '@shared/types';

export function getLastAssistantText(messages: StreamMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'assistant' && msg.message?.content) {
      for (let j = msg.message.content.length - 1; j >= 0; j--) {
        const block = msg.message.content[j];
        if (block.type === 'text') {
          return block.text;
        }
      }
    }
  }
  return null;
}

export function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

export function getLastToolName(messages: StreamMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use') {
          return block.name;
        }
      }
    }
  }
  return null;
}
