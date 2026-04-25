/**
 * Tests for the emit_downstream_queue pass (spec-039).
 *
 * Verifies that the pass reads downstreamCompileJobs from ai_precompile
 * and passes them through to its output as downstreamQueue.
 */

import { describe, it, expect } from 'vitest';
import { createEmitDownstreamQueuePass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';

describe('createEmitDownstreamQueuePass', () => {
  const pass = createEmitDownstreamQueuePass();

  it('has the correct id and family', () => {
    expect(pass.id).toBe('emit_downstream_queue');
    expect(pass.family).toBe('emit');
  });

  it('passes through downstreamCompileJobs from ai_precompile', () => {
    const downstreamJobs = [
      { kind: 'qPCR', description: 'Quantitative PCR analysis' },
      { kind: 'GC-FID' },
      { kind: 'GC-MS', params: { column: 'DB-5' } },
      { kind: 'plate-reader' },
      { kind: 'imaging', description: 'Fluorescence microscopy' },
    ];

    const state: PipelineState = {
      input: { prompt: 'test', attachments: [] },
      outputs: new Map([
        ['ai_precompile', { downstreamCompileJobs: downstreamJobs }],
      ]),
    };

    const result = pass.run({ pass_id: 'emit_downstream_queue', state });

    expect(result.ok).toBe(true);
    expect(result.output.downstreamQueue).toHaveLength(5);
    expect(result.output.downstreamQueue[0]).toEqual({ kind: 'qPCR', description: 'Quantitative PCR analysis' });
    expect(result.output.downstreamQueue[1]).toEqual({ kind: 'GC-FID' });
    expect(result.output.downstreamQueue[2]).toEqual({ kind: 'GC-MS', params: { column: 'DB-5' } });
    expect(result.output.downstreamQueue[3]).toEqual({ kind: 'plate-reader' });
    expect(result.output.downstreamQueue[4]).toEqual({ kind: 'imaging', description: 'Fluorescence microscopy' });
  });

  it('returns empty array when ai_precompile has no downstreamCompileJobs', () => {
    const state: PipelineState = {
      input: { prompt: 'test', attachments: [] },
      outputs: new Map([
        ['ai_precompile', {}],
      ]),
    };

    const result = pass.run({ pass_id: 'emit_downstream_queue', state });

    expect(result.ok).toBe(true);
    expect(result.output.downstreamQueue).toHaveLength(0);
  });

  it('returns empty array when ai_precompile is not in outputs', () => {
    const state: PipelineState = {
      input: { prompt: 'test', attachments: [] },
      outputs: new Map(),
    };

    const result = pass.run({ pass_id: 'emit_downstream_queue', state });

    expect(result.ok).toBe(true);
    expect(result.output.downstreamQueue).toHaveLength(0);
  });
});
