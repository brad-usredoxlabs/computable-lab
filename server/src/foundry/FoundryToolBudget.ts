import type { ChatMessage } from '../ai/types.js';
import type { ToolCall } from '../ai/types.js';

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

function coerceInlineToolValue(key: string, value: string): string | number {
  if (/^(startLine|endLine|maxResults|maxFiles|timeoutMs|topK|candidateK)$/.test(key)) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return value.trim();
}

export function extractInlineXmlToolCalls(content: string | null | undefined): ToolCall[] {
  if (!content || !content.includes('<tool_call>')) return [];
  const calls: ToolCall[] = [];
  const toolCallPattern = /<tool_call>\s*<function=([A-Za-z0-9_]+)>\s*([\s\S]*?)\s*<\/function>\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = toolCallPattern.exec(content)) !== null) {
    const name = match[1];
    const body = match[2] ?? '';
    if (!name) continue;
    const args: Record<string, string | number> = {};
    const parameterPattern = /<parameter=([A-Za-z0-9_]+)>\s*([\s\S]*?)\s*<\/parameter>/g;
    let parameterMatch: RegExpExecArray | null;
    while ((parameterMatch = parameterPattern.exec(body)) !== null) {
      const key = parameterMatch[1];
      if (!key) continue;
      args[key] = coerceInlineToolValue(key, parameterMatch[2] ?? '');
    }
    calls.push({
      id: `inline_tool_${calls.length + 1}`,
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    });
  }
  return calls;
}
