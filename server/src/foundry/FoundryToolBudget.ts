import type { ChatMessage } from '../ai/types.js';

function messageSize(message: ChatMessage): number {
  return JSON.stringify(message).length;
}

function totalSize(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + messageSize(message), 0);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars to keep Foundry prompt within budget]`;
}

export function boundedToolTranscript(input: {
  messages: ChatMessage[];
  maxToolContentChars: number;
  maxTranscriptChars: number;
}): ChatMessage[] {
  const messages = input.messages.map((message) => {
    if (message.role !== 'tool' || typeof message.content !== 'string') return { ...message };
    return {
      ...message,
      content: truncateText(message.content, input.maxToolContentChars),
    };
  });

  let currentSize = totalSize(messages);
  if (currentSize <= input.maxTranscriptChars) return messages;

  for (let index = 0; index < messages.length && currentSize > input.maxTranscriptChars; index += 1) {
    const message = messages[index];
    if (!message || message.role !== 'tool' || typeof message.content !== 'string') continue;
    const before = messageSize(message);
    message.content = truncateText(message.content, 1_000);
    currentSize -= before - messageSize(message);
  }

  for (let index = 0; index < messages.length && currentSize > input.maxTranscriptChars; index += 1) {
    const message = messages[index];
    if (!message || message.role === 'system' || message.role === 'tool' || typeof message.content !== 'string') continue;
    const before = messageSize(message);
    message.content = truncateText(message.content, 2_000);
    currentSize -= before - messageSize(message);
  }

  return messages;
}
