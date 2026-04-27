/**
 * Tests for ProtocolExtractPass.
 */

import { describe, it, expect } from 'vitest';
import {
  createProtocolExtractPass,
  type CreateProtocolExtractPassDeps,
} from './ProtocolExtractPass.js';
import type { PipelineState } from '../types.js';
import type { RecordEnvelope } from '../../../types/RecordEnvelope.js';
import type { StoreResult } from '../../../store/types.js';

/**
 * Build a mock CreateProtocolExtractPassDeps with the given extraction result.
 */
function buildDeps(extractionResult: {
  candidates: Array<{
    target_kind: string;
    draft: Record<string, unknown>;
    confidence?: number;
  }>;
}): CreateProtocolExtractPassDeps {
  const capturedEnvelopes: RecordEnvelope[] = [];

  return {
    runChunkedExtraction: async () => {
      return {
        candidates: extractionResult.candidates,
      } as any;
    },
    recordStore: {
      create: async (options: {
        envelope: RecordEnvelope;
        message?: string;
      }): Promise<StoreResult> => {
        capturedEnvelopes.push(options.envelope);
        return { success: true, envelope: options.envelope };
      },
    } as any,
  };
}

/**
 * Build a minimal PipelineState with the given input.
 */
function buildState(input: Record<string, unknown>): PipelineState {
  return {
    input,
    context: {},
    meta: {},
    outputs: new Map(),
    diagnostics: [],
  };
}

describe('createProtocolExtractPass', () => {
  it('success case: mock extractor returns 1 candidate → candidateCount=1, variantLabels=[]', async () => {
    const deps = buildDeps({
      candidates: [
        {
          target_kind: 'protocol',
          draft: {
            display_name: 'Test Protocol',
            variant_label: null,
            sections: [{ step: 1, verb: 'add_material' }],
          },
          confidence: 0.92,
        },
      ],
    });

    const pass = createProtocolExtractPass(deps);

    const result = await pass.run({
      pass_id: 'protocol_extract',
      state: buildState({
        text: 'Add 100uL of buffer to the well and incubate at 37C for 30 minutes.',
        evidenceCitations: [{ source: 'lab-notebook-1', page: 3 }],
      }),
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      extractionDraftRef: string;
      candidateCount: number;
      variantLabels: string[];
    };
    expect(output.candidateCount).toBe(1);
    expect(output.variantLabels).toEqual([]);
    expect(output.extractionDraftRef).toMatch(/^XDR-protocol-/);
  });

  it('multi-variant case: returns 2 candidates with variant labels → variantLabels preserved', async () => {
    const deps = buildDeps({
      candidates: [
        {
          target_kind: 'protocol',
          draft: {
            display_name: 'Cell Culture Protocol',
            variant_label: 'cell culture',
            sections: [],
          },
          confidence: 0.88,
        },
        {
          target_kind: 'protocol',
          draft: {
            display_name: 'Plant Matter Protocol',
            variant_label: 'plant matter',
            sections: [],
          },
          confidence: 0.75,
        },
      ],
    });

    const pass = createProtocolExtractPass(deps);

    const result = await pass.run({
      pass_id: 'protocol_extract',
      state: buildState({
        text: 'Grow cells in DMEM with 10% FBS at 37C.',
      }),
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      extractionDraftRef: string;
      candidateCount: number;
      variantLabels: string[];
    };
    expect(output.candidateCount).toBe(2);
    expect(output.variantLabels).toEqual(['cell culture', 'plant matter']);
  });

  it('empty case: returns 0 candidates → warning diagnostic emitted, output still has extractionDraftRef', async () => {
    const deps = buildDeps({
      candidates: [],
    });

    const pass = createProtocolExtractPass(deps);

    const result = await pass.run({
      pass_id: 'protocol_extract',
      state: buildState({
        text: 'Some text that yields no candidates.',
      }),
    });

    expect(result.ok).toBe(true);
    const output = result.output as {
      extractionDraftRef: string;
      candidateCount: number;
      variantLabels: string[];
    };
    expect(output.candidateCount).toBe(0);
    expect(output.variantLabels).toEqual([]);
    expect(output.extractionDraftRef).toMatch(/^XDR-protocol-/);

    // Verify warning diagnostic
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]!.severity).toBe('warning');
    expect(result.diagnostics![0]!.code).toBe('protocol_extract_empty');
    expect(result.diagnostics![0]!.message).toContain('zero candidates');
  });

  it('missing text: input has no text → ok=false with error diagnostic', async () => {
    const deps = buildDeps({
      candidates: [],
    });

    const pass = createProtocolExtractPass(deps);

    const result = await pass.run({
      pass_id: 'protocol_extract',
      state: buildState({
        evidenceCitations: [],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]!.severity).toBe('error');
    expect(result.diagnostics![0]!.code).toBe('missing_text');
    expect(result.diagnostics![0]!.message).toContain('non-empty text');
  });
});
