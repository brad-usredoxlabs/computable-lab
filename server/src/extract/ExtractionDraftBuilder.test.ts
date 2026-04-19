/**
 * Tests for ExtractionDraftBuilder.
 */

import { describe, it, expect } from 'vitest';
import { buildExtractionDraft } from './ExtractionDraftBuilder.js';
import type { ExtractionCandidate } from './ExtractorAdapter.js';
import type { AmbiguitySpan } from './MentionResolver.js';
import type { PassDiagnostic } from '../compiler/pipeline/types.js';

describe('buildExtractionDraft', () => {
  it('returns body with kind extraction-draft, status pending_review, and empty candidates for minimal valid input', () => {
    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: []
    });

    expect(result.kind).toBe('extraction-draft');
    expect(result.status).toBe('pending_review');
    expect(result.candidates.length).toBe(0);
    expect(result.recordId).toBe('XDR-test-v1');
    expect(result.source_artifact).toEqual({ kind: 'file', id: 'test-file-1' });
    expect(typeof result.created_at).toBe('string');
  });

  it('throws when recordId does not start with XDR-', () => {
    expect(() => buildExtractionDraft({
      recordId: 'INVALID-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: []
    })).toThrow(/recordId must start with 'XDR-', got: INVALID-test-v1/);
  });

  it('passes through candidates with their original ambiguity_spans preserved', () => {
    const originalAmbiguitySpans: AmbiguitySpan[] = [
      {
        path: 'contents[0].material',
        reason: 'material name matched 2 records',
        matched_candidate_ids: ['MSP-a', 'MSP-b']
      }
    ];

    const candidate: ExtractionCandidate = {
      target_kind: 'material-spec',
      draft: { name: 'H2O2' },
      confidence: 0.9,
      ambiguity_spans: originalAmbiguitySpans
    };

    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [candidate]
    });

    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]!.ambiguity_spans).toEqual(originalAmbiguitySpans);
  });

  it('folds ambiguity_spans_by_candidate into per-candidate spans when provided', () => {
    const existingSpans: AmbiguitySpan[] = [
      {
        path: 'contents[0].material',
        reason: 'material name matched 2 records',
        matched_candidate_ids: ['MSP-a', 'MSP-b']
      }
    ];

    const newSpans: AmbiguitySpan[] = [
      {
        path: 'contents[1].protocol',
        reason: 'protocol name ambiguous',
        matched_candidate_ids: ['PRM-x']
      }
    ];

    const candidate: ExtractionCandidate = {
      target_kind: 'material-spec',
      draft: { name: 'H2O2' },
      confidence: 0.9,
      ambiguity_spans: existingSpans
    };

    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [candidate],
      ambiguity_spans_by_candidate: [newSpans]
    });

    expect(result.candidates.length).toBe(1);
    const combinedSpans = result.candidates[0]!.ambiguity_spans;
    expect(combinedSpans).toBeDefined();
    expect(combinedSpans!.length).toBe(2);
    // Existing spans first
    expect(combinedSpans![0]).toEqual(existingSpans[0]);
    // Then new spans
    expect(combinedSpans![1]).toEqual(newSpans[0]);
  });

  it('uses now() injection for deterministic created_at', () => {
    const fixedDate = new Date('2024-01-15T10:30:00.000Z');
    
    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [],
      now: () => fixedDate
    });

    expect(result.created_at).toBe('2024-01-15T10:30:00.000Z');
  });

  it('handles multiple candidates with mixed ambiguity spans', () => {
    const candidate1: ExtractionCandidate = {
      target_kind: 'material-spec',
      draft: { name: 'H2O2' },
      confidence: 0.9
    };

    const candidate2: ExtractionCandidate = {
      target_kind: 'protocol',
      draft: { name: 'mixing-protocol' },
      confidence: 0.8,
      ambiguity_spans: [
        {
          path: 'steps[0].operator',
          reason: 'operator name ambiguous',
          matched_candidate_ids: ['OP-1', 'OP-2']
        }
      ]
    };

    const newSpansForCandidate1: AmbiguitySpan[] = [
      {
        path: 'metadata.source',
        reason: 'source reference unclear',
        matched_candidate_ids: ['SRC-1']
      }
    ];

    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'publication', id: 'pub-123' },
      candidates: [candidate1, candidate2],
      ambiguity_spans_by_candidate: [newSpansForCandidate1, []]
    });

    expect(result.candidates.length).toBe(2);
    
    // First candidate should have the new spans added
    expect(result.candidates[0]!.ambiguity_spans).toBeDefined();
    expect(result.candidates[0]!.ambiguity_spans!.length).toBe(1);
    expect(result.candidates[0]!.ambiguity_spans![0]).toEqual(newSpansForCandidate1[0]);

    // Second candidate should keep its original spans
    expect(result.candidates[1]!.ambiguity_spans).toBeDefined();
    expect(result.candidates[1]!.ambiguity_spans!.length).toBe(1);
    expect(result.candidates[1]!.ambiguity_spans![0]).toEqual(candidate2.ambiguity_spans![0]);
  });

  it('handles candidates without ambiguity_spans when ambiguity_spans_by_candidate is empty', () => {
    const candidate: ExtractionCandidate = {
      target_kind: 'material-spec',
      draft: { name: 'H2O2' },
      confidence: 0.9
    };

    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [candidate],
      ambiguity_spans_by_candidate: [[]]
    });

    expect(result.candidates.length).toBe(1);
    // Should not have ambiguity_spans property if empty
    expect(result.candidates[0]!.ambiguity_spans).toBeUndefined();
  });

  it('includes diagnostics and extractor_profile when provided', () => {
    const diagnostics: PassDiagnostic[] = [
      {
        severity: 'warning',
        code: 'LOW_CONF',
        message: 'Low confidence extraction',
        pass_id: 'extract-1'
      }
    ];

    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [],
      diagnostics,
      extractor_profile: 'qwen3.5-122b-int4'
    });

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]!.severity).toBe('warning');
    expect(result.diagnostics![0]!.code).toBe('LOW_CONF');
    expect(result.diagnostics![0]!.message).toBe('Low confidence extraction');
    expect(result.diagnostics![0]!.pass_id).toBe('extract-1');
    expect(result.extractor_profile).toBe('qwen3.5-122b-int4');
  });

  it('omits diagnostics and extractor_profile when not provided', () => {
    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: []
    });

    expect(result.diagnostics).toBeUndefined();
    expect(result.extractor_profile).toBeUndefined();
  });

  it('omits diagnostics when empty array is provided', () => {
    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [],
      diagnostics: []
    });

    expect(result.diagnostics).toBeUndefined();
  });

  it('passes through evidence_span and uncertainty fields on candidates', () => {
    const candidate: ExtractionCandidate = {
      target_kind: 'material-spec',
      draft: { name: 'DMSO' },
      confidence: 0.85,
      evidence_span: 'We added 10 µL of DMSO',
      uncertainty: 'medium'
    };

    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [candidate]
    });

    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0]!.evidence_span).toBe('We added 10 µL of DMSO');
    expect(result.candidates[0]!.uncertainty).toBe('medium');
  });
});
