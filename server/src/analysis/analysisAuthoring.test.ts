import { describe, it, expect } from 'vitest';
import type { InferenceClient, CompletionResponse } from '../ai/types.js';
import { AnalysisAuthoringService, SYSTEM_PROMPT, buildSystemPrompt } from './analysisAuthoring.js';

const VALID_DRAFT_JSON = JSON.stringify({
  title: 'GC peak area',
  entryScript: [
    "def run(ctx):",
    "    trace = ctx.input('trace').read_signal()",
    "    x = trace['axis']",
    "    y = trace['values']",
    "    low, high = ctx.parameters['window']",
    "    chosen = [(xx, yy) for xx, yy in zip(x, y) if low <= xx <= high]",
    "    area = sum(yy for _, yy in chosen)",
    "    ctx.publish('peak_results', [{'start': low, 'end': high, 'area': area}], kind='table')",
    "    ctx.metric('total_area', area, unit='a.u.', label='Area under window')",
    "    ctx.view('results', 'table', artifact='peak_results')",
  ].join('\n'),
  methodNotes: 'top-hat integration, no baseline',
  inputs: [{ name: 'trace', dataKind: 'signal', required: true }],
  parameterSchema: { type: 'object', properties: { window: { type: 'array' } } },
});

const BAD_SYNTAX_JSON = JSON.stringify({
  title: 'broken',
  entryScript: "def run(ctx):\n    trace = ctx.input('trace').read_signal(\n    x = 1 +",
  inputs: [],
  parameterSchema: {},
});

function fakeClient(responses: string[], rejected: string[] = []): InferenceClient {
  let i = 0;
  return {
    async complete() {
      const content = i < responses.length ? responses[i] : '{}';
      const reject = i < rejected.length ? rejected[i] : '';
      i += 1;
      if (reject) throw new Error(reject);
      const res: CompletionResponse = {
        id: 'res',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      };
      return res;
    },
    async *completeStream() { /* unused */ },
  } as InferenceClient;
}

const INPUTS = [{ name: 'trace', dataKind: 'signal', label: 'GC trace' }];

describe('AnalysisAuthoringService.draftMethod', () => {
  it('returns a validated draft on the first attempt', async () => {
    const service = new AnalysisAuthoringService({
      inferenceClient: fakeClient([VALID_DRAFT_JSON]),
      inferenceConfig: { baseUrl: 'http://fake', model: 'm' },
    });
    const result = await service.draftMethod({ prompt: 'integrate under window', inputs: INPUTS });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.draft?.title).toBe('GC peak area');
    expect(result.draft?.inputs[0].name).toBe('trace');
    expect(result.draft?.parameterSchema).toBeDefined();
    expect(result.draft?.entryScript).toContain('ctx.input');
  });

  it('repairs a syntax-error draft in a bounded loop', async () => {
    const service = new AnalysisAuthoringService({
      inferenceClient: fakeClient([BAD_SYNTAX_JSON, VALID_DRAFT_JSON]),
      inferenceConfig: { baseUrl: 'http://fake', model: 'm' },
    });
    const result = await service.draftMethod({ prompt: 'x', inputs: INPUTS });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect((result.errors ?? []).join('\n')).toMatch(/Python syntax error/);
  });

  it('fails when the model never produces a valid draft (bounded)', async () => {
    const service = new AnalysisAuthoringService({
      inferenceClient: fakeClient([BAD_SYNTAX_JSON, BAD_SYNTAX_JSON, BAD_SYNTAX_JSON]),
      inferenceConfig: { baseUrl: 'http://fake', model: 'm' },
    });
    const result = await service.draftMethod({ prompt: 'x', inputs: INPUTS, maxAttempts: 3 });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
  });

  it('fails when the model references an undeclared (non-optional) input', async () => {
    const bad = JSON.stringify({
      title: 'req missing',
      entryScript: "def run(ctx):\n    t = ctx.input('phantom').read_signal()\n    ctx.publish('o', t, kind='signal')",
      inputs: [{ name: 'phantom', dataKind: 'signal', required: true }],
      parameterSchema: {},
    });
    const service = new AnalysisAuthoringService({
      inferenceClient: fakeClient([bad, VALID_DRAFT_JSON]),
      inferenceConfig: { baseUrl: 'http://fake', model: 'm' },
    });
    const result = await service.draftMethod({ prompt: 'x', inputs: INPUTS });
    expect(result.ok).toBe(true); // repaired on 2nd attempt
    expect(result.attempts).toBe(2);
    expect((result.errors ?? []).join('\n')).toMatch(/phantom/);
  });

  it('rejects a hardcoded script that never reads ctx', async () => {
    const hardcoded = JSON.stringify({
      title: 'cheat',
      entryScript: "def run(ctx):\n    ctx.publish('o', [1,2,3], kind='table')",
      inputs: [],
      parameterSchema: {},
    });
    const service = new AnalysisAuthoringService({
      inferenceClient: fakeClient([hardcoded]),
      inferenceConfig: { baseUrl: 'http://fake', model: 'm' },
    });
    const result = await service.draftMethod({ prompt: 'x', inputs: INPUTS });
    expect(result.ok).toBe(false);
  });

  it('throws AI_UNCONFIGURED when no client is configured', async () => {
    const service = new AnalysisAuthoringService({});
    try {
      await service.draftMethod({ prompt: 'x', inputs: INPUTS });
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as { code?: string }).code).toBe('AI_UNCONFIGURED');
    }
  });
});

describe('prompt building', () => {
  it('includes declared inputs and the example script', () => {
    const prompt = buildSystemPrompt(INPUTS);
    expect(prompt).toContain('AUTHORIZED INPUT DATASETS');
    expect(prompt).toContain('trace');
    expect(prompt).toContain('EXAMPLE');
  });

  it('includes prior errors on a repair attempt', () => {
    const prompt = buildSystemPrompt(INPUTS, 'Python syntax error: ...');
    expect(prompt).toContain('PREVIOUS ATTEMPT ERRORS');
    expect(prompt).toContain('Python syntax error');
  });
});