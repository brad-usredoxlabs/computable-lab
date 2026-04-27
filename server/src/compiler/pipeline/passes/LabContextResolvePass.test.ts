/**
 * Tests for LabContextResolvePass.
 *
 * Covers:
 * 1. Empty directive → smart defaults, no LLM call
 * 2. Override case → labwareKind='384-well-plate'
 * 3. Multi-field override → plateCount + sampleCount
 * 4. Markdown-wrapped JSON → extractJson handles fences
 * 5. Validation failure then retry success → two LLM calls, output reflects retry
 * 6. Both attempts fail → defaults with warning diagnostic
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createLabContextResolvePass,
  type CreateLabContextResolvePassDeps,
} from './LabContextResolvePass.js';

/**
 * Build a mock LLM client that returns the given responses in order.
 */
function buildMockLlm(responses: string[]) {
  const complete = vi.fn().mockImplementation(async (args: { prompt: string }) => {
    const response = responses.shift();
    return response ?? '';
  });
  return { complete };
}

/**
 * Build minimal deps with a mock LLM client.
 */
function buildDeps(llmClient: {
  complete: (args: { prompt: string; maxTokens?: number }) => Promise<string>;
}): CreateLabContextResolvePassDeps {
  return { llmClient };
}

/**
 * Build a minimal PipelineState with the given input.
 */
function buildState(input: Record<string, unknown>) {
  return {
    input,
    context: {},
    meta: {},
    outputs: new Map(),
    diagnostics: [],
  };
}

describe('createLabContextResolvePass', () => {
  it('empty directive → returns smart defaults, no LLM call', async () => {
    const mockLlm = buildMockLlm([]);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    const result = await pass.run({
      pass_id: 'lab_context_resolve',
      state: buildState({ directiveText: '' }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: '96-well-plate',
        plateCount: 1,
        sampleCount: 96,
        equipmentOverrides: [],
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(mockLlm.complete).not.toHaveBeenCalled();
  });

  it('whitespace-only directive → returns smart defaults, no LLM call', async () => {
    const mockLlm = buildMockLlm([]);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    const result = await pass.run({
      pass_id: 'lab_context_resolve',
      state: buildState({ directiveText: '   ' }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: '96-well-plate',
        plateCount: 1,
        sampleCount: 96,
        equipmentOverrides: [],
      },
    });
    expect(mockLlm.complete).not.toHaveBeenCalled();
  });

  it('override case: "adapt for 384-well plates" → labwareKind=384-well-plate', async () => {
    const mockLlm = buildMockLlm(['{"labwareKind": "384-well-plate"}']);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    const result = await pass.run({
      pass_id: 'lab_context_resolve',
      state: buildState({
        directiveText: 'adapt for 384-well plates',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: '384-well-plate',
        plateCount: 1,
        sampleCount: 96,
        equipmentOverrides: [],
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(mockLlm.complete).toHaveBeenCalledTimes(1);
  });

  it('multi-field override: "use 4 plates with 192 samples" → plateCount=4, sampleCount=192', async () => {
    const mockLlm = buildMockLlm([
      '{"plateCount": 4, "sampleCount": 192}',
    ]);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    const result = await pass.run({
      pass_id: 'lab_context_resolve',
      state: buildState({
        directiveText: 'use 4 plates with 192 samples',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: '96-well-plate',
        plateCount: 4,
        sampleCount: 192,
        equipmentOverrides: [],
      },
    });
    expect(mockLlm.complete).toHaveBeenCalledTimes(1);
  });

  it('markdown-wrapped JSON → extractJson handles fences', async () => {
    const mockLlm = buildMockLlm([
      '```json\n{"plateCount": 2}\n```',
    ]);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    const result = await pass.run({
      pass_id: 'lab_context_resolve',
      state: buildState({
        directiveText: 'use 2 plates',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: '96-well-plate',
        plateCount: 2,
        sampleCount: 96,
        equipmentOverrides: [],
      },
    });
    expect(mockLlm.complete).toHaveBeenCalledTimes(1);
  });

  it('validation failure then retry success → two LLM calls, output reflects retry', async () => {
    const mockLlm = buildMockLlm([
      '{invalid json}',
      '{"labwareKind": "6-well-plate"}',
    ]);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    const result = await pass.run({
      pass_id: 'lab_context_resolve',
      state: buildState({
        directiveText: 'use 6-well plates',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: '6-well-plate',
        plateCount: 1,
        sampleCount: 96,
        equipmentOverrides: [],
      },
    });
    expect(result.diagnostics).toEqual([]);
    expect(mockLlm.complete).toHaveBeenCalledTimes(2);
  });

  it('both attempts fail → defaults with warning diagnostic', async () => {
    const mockLlm = buildMockLlm([
      'not json at all',
      'still not json',
    ]);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    const result = await pass.run({
      pass_id: 'lab_context_resolve',
      state: buildState({
        directiveText: 'do something',
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: '96-well-plate',
        plateCount: 1,
        sampleCount: 96,
        equipmentOverrides: [],
      },
    });
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]!.severity).toBe('warning');
    expect(result.diagnostics![0]!.code).toBe(
      'lab_context_resolve_llm_failed',
    );
    expect(result.diagnostics![0]!.message).toContain(
      'LLM override extraction failed twice',
    );
    expect(mockLlm.complete).toHaveBeenCalledTimes(2);
  });

  it('custom defaults via deps.defaults are merged onto SMART_DEFAULTS', async () => {
    const mockLlm = buildMockLlm([]);
    const pass = createLabContextResolvePass(
      buildDeps(mockLlm),
    );

    // Override defaults for testing
    const passWithDefaults = createLabContextResolvePass({
      llmClient: mockLlm,
      defaults: { labwareKind: 'custom-plate', plateCount: 2 },
    });

    const result = await passWithDefaults.run({
      pass_id: 'lab_context_resolve',
      state: buildState({ directiveText: '' }),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      labContext: {
        labwareKind: 'custom-plate',
        plateCount: 2,
        sampleCount: 96,
        equipmentOverrides: [],
      },
    });
  });

  it('pass has correct id and family', () => {
    const mockLlm = buildMockLlm([]);
    const pass = createLabContextResolvePass(buildDeps(mockLlm));

    expect(pass.id).toBe('lab_context_resolve');
    expect(pass.family).toBe('normalize');
  });
});
