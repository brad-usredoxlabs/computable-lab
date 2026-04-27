/**
 * Tests for hint pass-through in extractionPipelineRun.
 * 
 * spec-019: verifies that target_kinds and hint are forwarded into
 * pipeline state so downstream passes can read them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runExtractionPipeline } from './extractionPipelineRun.js';
import type { ExtractorAdapter, ExtractionRequest, ExtractionResult } from '../../../extract/ExtractorAdapter.js';
import type { ResolutionCandidate } from '../../../extract/MentionResolver.js';
import type { PipelineSpec } from './PipelineRunner.js';

// Capture the input passed to runPipeline
let capturedInput: Record<string, unknown> | undefined;

vi.mock('./PipelineLoader.js', () => ({
  loadPipeline: vi.fn(() => ({
    pipelineId: 'test-extraction',
    entrypoint: 'extractor_run',
    passes: [],
  })),
}));

vi.mock('./PipelineRunner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./PipelineRunner.js')>();
  return {
    ...actual,
    runPipeline: vi.fn(async (spec: PipelineSpec, registry: unknown, input: Record<string, unknown>) => {
      capturedInput = input;
      return {
        ok: true,
        outputs: new Map(),
        diagnostics: [],
        pass_statuses: [],
        pass_outcomes: new Map(),
      };
    }),
  };
});

describe('extractionPipelineRun hint pass-through', () => {
  beforeEach(() => {
    capturedInput = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes target_kinds into pipeline state', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => ({
        candidates: [],
        diagnostics: [],
      }),
    };

    const candidatesByKind = new Map<string, ReadonlyArray<ResolutionCandidate>>();

    await runExtractionPipeline({
      pipelinePath: 'nonexistent.yaml',
      extractor: stubExtractor,
      candidatesByKind,
      source_artifact: { kind: 'file', id: 'test' },
      text: 'some text',
      target_kinds: ['protocol'],
    });

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.target_kinds).toEqual(['protocol']);
  });

  it('passes hint into pipeline state', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => ({
        candidates: [],
        diagnostics: [],
      }),
    };

    const candidatesByKind = new Map<string, ReadonlyArray<ResolutionCandidate>>();

    await runExtractionPipeline({
      pipelinePath: 'nonexistent.yaml',
      extractor: stubExtractor,
      candidatesByKind,
      source_artifact: { kind: 'file', id: 'test' },
      text: 'some text',
      hint: { target_kind: 'protocol', custom_key: 'custom_value' },
    });

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.hint).toEqual({ target_kind: 'protocol', custom_key: 'custom_value' });
  });

  it('passes both target_kinds and hint together', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => ({
        candidates: [],
        diagnostics: [],
      }),
    };

    const candidatesByKind = new Map<string, ReadonlyArray<ResolutionCandidate>>();

    await runExtractionPipeline({
      pipelinePath: 'nonexistent.yaml',
      extractor: stubExtractor,
      candidatesByKind,
      source_artifact: { kind: 'file', id: 'test' },
      text: 'some text',
      target_kinds: ['protocol', 'material'],
      hint: { directive: 'test' },
    });

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.target_kinds).toEqual(['protocol', 'material']);
    expect(capturedInput!.hint).toEqual({ directive: 'test' });
  });

  it('omits target_kinds when not provided', async () => {
    const stubExtractor: ExtractorAdapter = {
      extract: async (): Promise<ExtractionResult> => ({
        candidates: [],
        diagnostics: [],
      }),
    };

    const candidatesByKind = new Map<string, ReadonlyArray<ResolutionCandidate>>();

    await runExtractionPipeline({
      pipelinePath: 'nonexistent.yaml',
      extractor: stubExtractor,
      candidatesByKind,
      source_artifact: { kind: 'file', id: 'test' },
      text: 'some text',
    });

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.target_kinds).toBeUndefined();
    expect(capturedInput!.hint).toBeUndefined();
  });
});
