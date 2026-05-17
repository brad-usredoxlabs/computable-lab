import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import type { CompletionRequest, CompletionResponse, InferenceClient } from '../ai/types.js';
import { foundryToolAgentTools, runFoundryToolAgent } from './FoundryToolAgent.js';

function response(message: CompletionResponse['choices'][number]['message'], finish_reason: CompletionResponse['choices'][number]['finish_reason']): CompletionResponse {
  return {
    id: 'mock',
    choices: [{ index: 0, message, finish_reason }],
  };
}

describe('FoundryToolAgent', () => {
  it('runs tool calls, writes a trace, and returns complete when the model promises completion', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'foundry-tool-agent-'));
    try {
      const complete = vi.fn(async (request: CompletionRequest) => {
        if (complete.mock.calls.length === 1) {
          expect(request.tools?.map((tool) => tool.function.name)).toContain('write_file');
          return response({
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-write',
                type: 'function',
                function: {
                  name: 'write_file',
                  arguments: JSON.stringify({ path: 'out.txt', content: 'hello from tool agent\n' }),
                },
              },
            ],
          }, 'tool_calls');
        }

        const toolMessage = request.messages.find((message) => message.role === 'tool');
        expect(toolMessage?.content).toContain('wrote');
        return response({
          role: 'assistant',
          content: `Done.\n<promise>COMPLETE</promise>`,
        }, 'stop');
      });
      const client = {
        complete,
        completeStream: vi.fn(),
      } as unknown as InferenceClient;

      const progress: string[] = [];
      const tracePath = join(workdir, 'trace.jsonl');
      const result = await runFoundryToolAgent({
        client,
        model: 'mock-model',
        workdir,
        prompt: 'write the file',
        tracePath,
        onProgress: (event) => {
          progress.push(`${event.phase}:${event.message}`);
        },
      });

      expect(result.status).toBe('complete');
      expect(result.turns).toBe(2);
      expect(result.toolCalls).toBe(1);
      expect(await readFile(join(workdir, 'out.txt'), 'utf-8')).toBe('hello from tool agent\n');
      const trace = await readFile(tracePath, 'utf-8');
      expect(trace).toContain('"type":"tool_result"');
      expect(trace).toContain('"tool":"write_file"');
      expect(progress.some((line) => line.includes('tool_started:Calling write_file'))).toBe(true);
      expect(progress.some((line) => line.includes('complete:Tool agent complete'))).toBe(true);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('offers the expected built-in tools', () => {
    expect(foundryToolAgentTools().map((tool) => tool.function.name)).toEqual([
      'shell',
      'read_file',
      'write_file',
      'edit_file',
      'list_directory',
      'glob_files',
      'grep',
    ]);
  });

  it('nudges the model until the completion marker appears', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'foundry-tool-agent-nudge-'));
    try {
      const complete = vi.fn(async () => {
        if (complete.mock.calls.length === 1) {
          return response({ role: 'assistant', content: 'I am not done yet.' }, 'stop');
        }
        return response({ role: 'assistant', content: '<promise>COMPLETE</promise>' }, 'stop');
      });
      const client = {
        complete,
        completeStream: vi.fn(),
      } as unknown as InferenceClient;

      const result = await runFoundryToolAgent({
        client,
        model: 'mock-model',
        workdir,
        prompt: 'finish',
        maxTurns: 3,
      });

      expect(result.status).toBe('complete');
      expect(result.turns).toBe(2);
      const secondRequest = complete.mock.calls[1]![0] as CompletionRequest;
      expect(secondRequest.messages.at(-1)?.content).toContain('Continue working');
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });
});
