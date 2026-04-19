/**
 * Tests for ExtractionDraftBuilder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildExtractionDraft } from './ExtractionDraftBuilder.js';
import type { ExtractionCandidate } from './ExtractorAdapter.js';
import type { AmbiguitySpan } from './MentionResolver.js';

describe('buildExtractionDraft', () => {
  it('returns body with kind extraction-draft, status pending_review, and empty candidates for minimal valid input', () => {
    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: []
    });

    assert.strictEqual(result.kind, 'extraction-draft');
    assert.strictEqual(result.status, 'pending_review');
    assert.strictEqual(result.candidates.length, 0);
    assert.strictEqual(result.recordId, 'XDR-test-v1');
    assert.deepStrictEqual(result.source_artifact, { kind: 'file', id: 'test-file-1' });
    assert(typeof result.created_at === 'string');
  });

  it('throws when recordId does not start with XDR-', () => {
    assert.throws(
      () => buildExtractionDraft({
        recordId: 'INVALID-test-v1',
        source_artifact: { kind: 'file', id: 'test-file-1' },
        candidates: []
      }),
      /recordId must start with 'XDR-', got: INVALID-test-v1/
    );
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

    assert.strictEqual(result.candidates.length, 1);
    assert.deepStrictEqual(result.candidates[0]!.ambiguity_spans, originalAmbiguitySpans);
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

    assert.strictEqual(result.candidates.length, 1);
    const combinedSpans = result.candidates[0]!.ambiguity_spans;
    assert.ok(combinedSpans);
    assert.strictEqual(combinedSpans.length, 2);
    // Existing spans first
    assert.deepStrictEqual(combinedSpans[0], existingSpans[0]);
    // Then new spans
    assert.deepStrictEqual(combinedSpans[1], newSpans[0]);
  });

  it('uses now() injection for deterministic created_at', () => {
    const fixedDate = new Date('2024-01-15T10:30:00.000Z');
    
    const result = buildExtractionDraft({
      recordId: 'XDR-test-v1',
      source_artifact: { kind: 'file', id: 'test-file-1' },
      candidates: [],
      now: () => fixedDate
    });

    assert.strictEqual(result.created_at, '2024-01-15T10:30:00.000Z');
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

    assert.strictEqual(result.candidates.length, 2);
    
    // First candidate should have the new spans added
    assert.ok(result.candidates[0]!.ambiguity_spans);
    assert.strictEqual(result.candidates[0]!.ambiguity_spans!.length, 1);
    assert.deepStrictEqual(result.candidates[0]!.ambiguity_spans![0], newSpansForCandidate1[0]);

    // Second candidate should keep its original spans
    assert.ok(result.candidates[1]!.ambiguity_spans);
    assert.strictEqual(result.candidates[1]!.ambiguity_spans!.length, 1);
    assert.deepStrictEqual(result.candidates[1]!.ambiguity_spans![0], candidate2.ambiguity_spans![0]);
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

    assert.strictEqual(result.candidates.length, 1);
    // Should not have ambiguity_spans property if empty
    assert.strictEqual(result.candidates[0]!.ambiguity_spans, undefined);
  });
});
