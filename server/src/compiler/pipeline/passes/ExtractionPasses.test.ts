/**
 * Tests for ExtractionPasses.
 */

import { describe, it, expect } from 'vitest';
import { createExtractorRunPass, createMentionResolvePass, createDraftAssemblePass } from './ExtractionPasses.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from '../../../extract/ExtractorAdapter.js';
import type { ResolutionCandidate } from '../../../extract/MentionResolver.js';
import type { PipelineState } from '../types.js';

describe('createExtractorRunPass', () => {
  it('happy path: stub extractor returns 1 candidate -> output has 1 candidate, ok', async () => {
    // Create a stub extractor that returns a single candidate
    const stubExtractor: ExtractorAdapter = {
      extract: async (req: ExtractionRequest): Promise<ExtractionResult> => {
        return {
          candidates: [
            {
              target_kind: 'material-spec',
              draft: { name: 'H2O2', volume: 100 },
              confidence: 0.95
            }
          ],
          diagnostics: []
        };
      }
    };

    const pass = createExtractorRunPass(stubExtractor);
    
    const mockState: PipelineState = {
      input: { text: 'Add 100uL of H2O2 to the mixture' },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: []
    };

    const result = await pass.run({ pass_id: 'extractor_run', state: mockState });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as ExtractionResult;
    expect(output.candidates.length).toBe(1);
    expect(output.candidates[0]!.target_kind).toBe('material-spec');
    expect(output.candidates[0]!.draft).toEqual({ name: 'H2O2', volume: 100 });
  });

  it('returns ok=false when zero candidates AND error-severity diagnostic', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => {
        return {
          candidates: [],
          diagnostics: [
            {
              severity: 'error',
              code: 'EXTRACTION_FAILED',
              message: 'Failed to parse input text'
            }
          ]
        };
      }
    };

    const pass = createExtractorRunPass(stubExtractor);
    
    const mockState: PipelineState = {
      input: { text: 'invalid text' },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: []
    };

    const result = await pass.run({ pass_id: 'extractor_run', state: mockState });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]!.severity).toBe('error');
  });

  it('returns ok=true when zero candidates but no error diagnostics', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => {
        return {
          candidates: [],
          diagnostics: [
            {
              severity: 'info',
              code: 'NO_MATCHES',
              message: 'No candidates found'
            }
          ]
        };
      }
    };

    const pass = createExtractorRunPass(stubExtractor);
    
    const mockState: PipelineState = {
      input: { text: 'some text' },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: []
    };

    const result = await pass.run({ pass_id: 'extractor_run', state: mockState });

    expect(result.ok).toBe(true);
  });
});

describe('createMentionResolvePass', () => {
  it('resolves a simple mention in a candidate draft -> output has resolved draft, empty ambiguity_spans', async () => {
    // Create a candidate index with a single material
    const candidatesByKind = new Map<string, ReadonlyArray<ResolutionCandidate>>();
    candidatesByKind.set('material', [
      {
        record_id: 'MSP-h2o2',
        kind: 'material',
        name: 'H2O2'
      }
    ]);

    const pass = createMentionResolvePass(candidatesByKind);

    // Mock state with extractor output containing a mention marker
    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['extractor_run', {
          candidates: [
            {
              target_kind: 'material-spec',
              draft: {
                name: 'H2O2 Solution',
                material_ref: { _mention: 'H2O2', _kind: 'material' }
              },
              confidence: 0.9
            }
          ],
          diagnostics: []
        }]
      ]),
      diagnostics: []
    };

    const result = await pass.run({ pass_id: 'mention_resolve', state: mockState });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as { resolved_candidates: unknown[]; ambiguity_spans_by_candidate: unknown[][] };
    expect(output.resolved_candidates.length).toBe(1);
    
    const resolvedDraft = (output.resolved_candidates[0] as any).draft;
    // The mention should be resolved to a record ref
    expect(resolvedDraft.material_ref).toEqual({
      kind: 'record',
      id: 'MSP-h2o2',
      type: 'material'
    });
    
    // No ambiguity spans since it resolved cleanly
    expect(output.ambiguity_spans_by_candidate[0].length).toBe(0);
  });

  it('surfaces ambiguity when mention matches 2 records -> ambiguity_spans_by_candidate[0].length === 1', async () => {
    // Create a candidate index with two materials matching the same name
    const candidatesByKind = new Map<string, ReadonlyArray<ResolutionCandidate>>();
    candidatesByKind.set('material', [
      {
        record_id: 'MSP-h2o2-stock',
        kind: 'material',
        name: 'H2O2'
      },
      {
        record_id: 'MSP-h2o2-diluted',
        kind: 'material',
        name: 'H2O2'
      }
    ]);

    const pass = createMentionResolvePass(candidatesByKind);

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['extractor_run', {
          candidates: [
            {
              target_kind: 'material-spec',
              draft: {
                name: 'H2O2',
                material_ref: { _mention: 'H2O2', _kind: 'material' }
              },
              confidence: 0.9
            }
          ],
          diagnostics: []
        }]
      ]),
      diagnostics: []
    };

    const result = await pass.run({ pass_id: 'mention_resolve', state: mockState });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as { resolved_candidates: unknown[]; ambiguity_spans_by_candidate: unknown[][] };
    
    // Should have exactly one ambiguity span
    expect(output.ambiguity_spans_by_candidate[0].length).toBe(1);
    
    const span = output.ambiguity_spans_by_candidate[0][0] as any;
    expect(span.path).toBe('material_ref');
    expect(span.reason).toMatch(/ambiguous|matched/i);
  });
});

describe('createDraftAssemblePass', () => {
  it('end-to-end: pipeline run produces extraction-draft with kind extraction-draft', async () => {
    // Create a stub extractor
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => {
        return {
          candidates: [
            {
              target_kind: 'material-spec',
              draft: {
                name: 'H2O2',
                material_ref: { _mention: 'H2O2', _kind: 'material' }
              },
              confidence: 0.95
            }
          ],
          diagnostics: []
        };
      }
    };

    // Create candidate index
    const candidatesByKind = new Map<string, ReadonlyArray<ResolutionCandidate>>();
    candidatesByKind.set('material', [
      {
        record_id: 'MSP-h2o2',
        kind: 'material',
        name: 'H2O2'
      }
    ]);

    // Create passes
    const extractorPass = createExtractorRunPass(stubExtractor);
    const resolvePass = createMentionResolvePass(candidatesByKind);
    const assemblePass = createDraftAssemblePass({
      recordIdPrefix: 'XDR-test-',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      now: () => new Date('2024-01-15T10:30:00.000Z')
    });

    // Run passes in sequence, threading state
    let stateOutputs = new Map<string, unknown>();
    let stateDiagnostics = [];

    // Run extractor_pass
    const extractorResult = await extractorPass.run({
      pass_id: 'extractor_run',
      state: {
        input: { text: 'Add H2O2 to the mixture' },
        context: {},
        meta: {},
        outputs: stateOutputs,
        diagnostics: stateDiagnostics
      }
    });

    expect(extractorResult.ok).toBe(true);
    stateOutputs = new Map(stateOutputs).set('extractor_run', extractorResult.output);

    // Run mention_resolve
    const resolveResult = await resolvePass.run({
      pass_id: 'mention_resolve',
      state: {
        input: {},
        context: {},
        meta: {},
        outputs: stateOutputs,
        diagnostics: stateDiagnostics
      }
    });

    expect(resolveResult.ok).toBe(true);
    stateOutputs = new Map(stateOutputs).set('mention_resolve', resolveResult.output);

    // Run draft_assemble
    const assembleResult = await assemblePass.run({
      pass_id: 'draft_assemble',
      state: {
        input: {},
        context: {},
        meta: {},
        outputs: stateOutputs,
        diagnostics: stateDiagnostics
      }
    });

    expect(assembleResult.ok).toBe(true);
    expect(assembleResult.output).toBeDefined();
    
    const draft = assembleResult.output as any;
    expect(draft.kind).toBe('extraction-draft');
    expect(draft.status).toBe('pending_review');
    expect(draft.recordId.startsWith('XDR-test-')).toBe(true);
    expect(draft.candidates.length).toBe(1);
    expect(draft.created_at).toBe('2024-01-15T10:30:00.000Z');
  });
});
