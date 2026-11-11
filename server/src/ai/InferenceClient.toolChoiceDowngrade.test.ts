// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInferenceClient } from './InferenceClient.js';
import type { CompletionRequest } from './types.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

const tools = [
  { type: 'function' as const, function: { name: 'agent_intent', parameters: { type: 'object' }, description: 'Propose' } },
  { type: 'function' as const, function: { name: 'other', parameters: { type: 'object' }, description: 'Other' } },
];

const config = {
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'qwen/qwen3.5-plus',
  enableThinking: true,
};

const okResponse = {
  id: 'ok',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hello', tool_calls: [{ id: 'call', type: 'function', function: { name: 'agent_intent', arguments: '{}' } } ] }, finish_reason: 'tool_calls' }],
};

describe('tool_choice downgrade observability', () => {
  it('qwen+thinking with forced tool → body has auto, warn emitted, response carries signal', async () => {
    const bodies: any[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (_url: string, init: RequestInit | undefined) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(okResponse));
    });

    const request: CompletionRequest = {
      model: 'qwen/qwen3.5-plus',
      messages: [{ role: 'user', content: 'Propose a probe' }],
      tools,
      tool_choice: { type: 'function', function: { name: 'agent_intent' } },
      max_tokens: 4096,
    };

    const client = createInferenceClient(config);
    const response = await client.complete(request);

    // Request body sent has tool_choice:'auto' and only the named tool
    expect(bodies).toHaveLength(1);
    expect(bodies[0].tool_choice).toBe('auto');
    expect(bodies[0].tools).toEqual([tools[0]]);

    // Warn line emitted with model and reason token
    const downgradeWarns = warnSpy.mock.calls.filter((args: string[]) =>
      args[0] && typeof args[0] === 'string' && args[0].includes('tool_choice downgraded'),
    );
    expect(downgradeWarns).toHaveLength(1);
    expect(downgradeWarns[0][0]).toContain('qwen');
    expect(downgradeWarns[0][0]).toContain('qwen-thinking');

    // Response carries the signal field
    expect(response.toolChoiceDowngraded).toBeDefined();
    expect(response.toolChoiceDowngraded?.reason).toBe('qwen-thinking');
    expect(response.toolChoiceDowngraded?.model).toBe('qwen/qwen3.5-plus');

    warnSpy.mockRestore();
  });

  it('non-qwen with forced tool → no downgrade, no warn, field absent', async () => {
    const bodies: any[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (_url: string, init: RequestInit | undefined) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(okResponse));
    });

    const request: CompletionRequest = {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
      tools,
      tool_choice: { type: 'function', function: { name: 'agent_intent' } },
      max_tokens: 1024,
    };

    const client = createInferenceClient({ ...config, model: 'openai/gpt-4o' });
    const response = await client.complete(request);

    // Body keeps forced tool_choice
    expect(bodies[0].tool_choice).toEqual({ type: 'function', function: { name: 'agent_intent' } });

    // No warn
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('tool_choice downgraded'));

    // Field is ABSENT (not undefined)
    expect('toolChoiceDowngraded' in response).toBe(false);

    warnSpy.mockRestore();
  });

  it('provider-400 tool_choice retry → one retry, one warn, response carries provider reason', async () => {
    const bodies: any[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (_url: string, init: RequestInit | undefined) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'Provider returned error', metadata: { raw: 'The tool_choice parameter does not support being set to required or object in thinking mode', provider_name: 'Alibaba' } } }), { status: 400 });
      }
      return new Response(JSON.stringify(okResponse));
    });

    const request: CompletionRequest = {
      model: 'openrouter/auto',
      messages: [{ role: 'user', content: 'Propose a probe' }],
      tools,
      tool_choice: { type: 'function', function: { name: 'agent_intent' } },
      max_tokens: 4096,
    };

    const client = createInferenceClient(config);
    const response = await client.complete(request);

    // Exactly two bodies sent (original + downgraded retry)
    expect(bodies).toHaveLength(2);
    expect(bodies[0].tool_choice).toEqual({ type: 'function', function: { name: 'agent_intent' } });
    expect(bodies[1].tool_choice).toBe('auto');

    // Exactly one warn with provider reason
    const downgradeWarns = warnSpy.mock.calls.filter((args: string[]) =>
      args[0] && typeof args[0] === 'string' && args[0].includes('tool_choice downgraded'),
    );
    expect(downgradeWarns).toHaveLength(1);
    expect(downgradeWarns[0][0]).toContain('provider-400-tool-choice');

    // Response carries the provider reason
    expect(response.toolChoiceDowngraded).toBeDefined();
    expect(response.toolChoiceDowngraded?.reason).toBe('provider-400-tool-choice');
    expect(response.toolChoiceDowngraded?.model).toBe('openrouter/auto');

    warnSpy.mockRestore();
  });
});
