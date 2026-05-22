import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('pages a large file with read_file offset so code past the truncation cap is reachable', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'foundry-tool-agent-bigread-'));
    try {
      // ~120K chars; the marker sits well past the 60K read cap so the first
      // (no-offset) read cannot reach it — exactly the situation that wedged
      // the coder on the 138K-char ChatbotCompilePasses.ts.
      const lines = Array.from({ length: 3000 }, (_, i) =>
        i === 2499 ? 'UNIQUE_LATE_MARKER_LINE' : `line ${i} ${'x'.repeat(30)}`,
      );
      await writeFile(join(workdir, 'big.ts'), lines.join('\n'), 'utf-8');

      const complete = vi.fn(async () => {
        const n = complete.mock.calls.length;
        if (n === 1) {
          return response({
            role: 'assistant', content: null,
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'big.ts' }) } }],
          }, 'tool_calls');
        }
        if (n === 2) {
          return response({
            role: 'assistant', content: null,
            tool_calls: [{ id: 'c2', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'big.ts', offset: 2490 }) } }],
          }, 'tool_calls');
        }
        return response({ role: 'assistant', content: '<promise>COMPLETE</promise>' }, 'stop');
      });
      const client = { complete, completeStream: vi.fn() } as unknown as InferenceClient;

      const tracePath = join(workdir, 'trace.jsonl');
      const result = await runFoundryToolAgent({ client, model: 'mock-model', workdir, prompt: 'read it', tracePath });
      expect(result.status).toBe('complete');

      const trace = await readFile(tracePath, 'utf-8');
      const toolResults = trace.split('\n').filter(Boolean)
        .map((l) => JSON.parse(l) as { type?: string; result?: { content?: string } })
        .filter((e) => e.type === 'tool_result');
      const first = toolResults[0]!.result!.content!;
      const second = toolResults[1]!.result!.content!;

      // First read is truncated and tells the model how to reach the rest.
      expect(first).not.toContain('UNIQUE_LATE_MARKER_LINE');
      expect(first).toContain('Read further with read_file');
      // Paging by offset reaches the late code.
      expect(second).toContain('UNIQUE_LATE_MARKER_LINE');
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

  it('nudges once, late, to commit an edit when the model keeps investigating without editing', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'foundry-tool-agent-late-nudge-'));
    try {
      // Never edits, never completes -> runs to max turns.
      const complete = vi.fn(async () =>
        response({ role: 'assistant', content: 'still looking into it' }, 'stop'),
      );
      const client = {
        complete,
        completeStream: vi.fn(),
      } as unknown as InferenceClient;

      const result = await runFoundryToolAgent({
        client,
        model: 'mock-model',
        workdir,
        prompt: 'fix it',
        maxTurns: 20,
      });

      expect(result.status).toBe('max-turns');
      // Deadline = floor(20 * 0.6) = 12: the commit-an-edit nudge appears in
      // the turn-13 request, not earlier.
      const turn13 = complete.mock.calls[12]![0] as CompletionRequest;
      expect(String(turn13.messages.at(-1)?.content ?? '')).toContain('without editing yet');
      // Before the deadline it's the soft "Continue working" nudge.
      const turn2 = complete.mock.calls[1]![0] as CompletionRequest;
      expect(String(turn2.messages.at(-1)?.content ?? '')).toContain('Continue working');
      // Single fire: the nudge appears exactly once across the whole transcript.
      const finalMessages = (complete.mock.calls.at(-1)![0] as CompletionRequest).messages;
      const nudgeCount = finalMessages.filter((m) => String(m.content ?? '').includes('without editing yet')).length;
      expect(nudgeCount).toBe(1);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('recovers from a context-length 400 by compacting and retrying instead of failing', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'foundry-tool-agent-ctx-overflow-'));
    try {
      // First call simulates the provider rejecting an over-long prompt
      // (the real failure mode: transcript grew past the model window). The
      // agent must compact + retry rather than surface a 'failed' result.
      const complete = vi.fn(async () => {
        if (complete.mock.calls.length === 1) {
          throw new Error(
            'Inference error 400: {"error":{"message":"This model\'s maximum context length is 131074 tokens. '
            + 'However, you requested 16384 output tokens and your prompt contains at least 114691 input tokens"}}',
          );
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
        prompt: 'fix it',
        maxTurns: 3,
      });

      expect(result.status).toBe('complete');
      // One rejected call + one successful retry within the same turn.
      expect(complete).toHaveBeenCalledTimes(2);
      expect(result.turns).toBe(1);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

  it('retries once on a transient "fetch failed" inference error instead of failing', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'foundry-tool-agent-transient-'));
    try {
      // The architect endpoint dropping an oversized request body — what
      // killed the senior at turn 73. Must retry, not fail.
      const complete = vi.fn(async () => {
        if (complete.mock.calls.length === 1) {
          throw new Error('Inference fetch failed to http://thunderbeast:8000/v1/chat/completions ("fetch failed", 358431 bytes). request body exceeded server limits.');
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
        prompt: 'fix it',
        maxTurns: 3,
      });

      expect(result.status).toBe('complete');
      expect(complete).toHaveBeenCalledTimes(2);
      expect(result.turns).toBe(1);
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  });

});
