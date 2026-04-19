/**
 * Tests for CandidatePromoter module.
 */

import { describe, it, expect } from 'vitest';
import { promoteCandidate, type SchemaValidator, type PromotionOutcome } from './CandidatePromoter.js';
import type { AmbiguitySpan } from './MentionResolver.js';

// Stub SchemaValidator for testing
function createStubValidator(ok: boolean, errors?: string[]): SchemaValidator {
  return {
    validate: () => (ok ? { ok: true } : { ok: false, errors: errors ?? ['validation error'] })
  };
}

// Helper to create a minimal candidate
function createCandidate(
  target_kind: string,
  draft: Record<string, unknown>,
  ambiguity_spans?: AmbiguitySpan[]
) {
  return {
    target_kind,
    draft,
    confidence: 0.9,
    ambiguity_spans
  };
}

describe('CandidatePromoter', () => {
  describe('promoteCandidate', () => {
    const targetSchemaIdByKind = new Map<string, string>([
      ['material-spec', 'schema/core/material-spec.schema.yaml'],
      ['protocol', 'schema/core/protocol.schema.yaml']
    ]);

    const sourceArtifactRef = {
      kind: 'file' as const,
      id: 'file-123',
      locator: '/path/to/file.pdf'
    };

    const fixedNow = () => new Date('2024-01-15T10:30:00Z');

    it('happy path: returns ok:true with canonical record and extraction-promotion', () => {
      const candidate = createCandidate('material-spec', {
        name: 'H2O2',
        concentration: { value: 30, unit: '%' }
      });

      const outcome = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-001',
        candidatePath: 'candidates[0]',
        sourceArtifactRef,
        targetRecordId: 'MSP-h2o2-001',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.record.kind).toBe('material-spec');
        expect(outcome.record.recordId).toBe('MSP-h2o2-001');
        expect(outcome.record.name).toBe('H2O2');
        
        expect(outcome.promotion.kind).toBe('extraction-promotion');
        expect(outcome.promotion.recordId).toBe('XPR-MSP-h2o2-001-v1');
        expect(outcome.promotion.output_kind).toBe('material-spec');
        expect(outcome.promotion.source_draft_ref).toEqual({
          kind: 'record',
          id: 'XDR-001',
          type: 'extraction-draft'
        });
        expect(outcome.promotion.candidate_path).toBe('candidates[0]');
        expect(outcome.promotion.source_artifact_ref).toBe(sourceArtifactRef);
        expect(outcome.promotion.output_ref).toEqual({
          kind: 'record',
          id: 'MSP-h2o2-001',
          type: 'material-spec'
        });
        expect(outcome.promotion.source_content_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(outcome.promotion.promoted_at).toBe('2024-01-15T10:30:00.000Z');
        expect(outcome.promotion.version).toBe(1);
      }
    });

    it('schema validation fails: returns ok:false with validation_errors', () => {
      const candidate = createCandidate('material-spec', {
        name: 'H2O2'
        // missing required field
      });

      const outcome = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-002',
        candidatePath: 'candidates[1]',
        sourceArtifactRef,
        targetRecordId: 'MSP-h2o2-002',
        targetSchemaIdByKind,
        validator: createStubValidator(false, ['missing required: concentration']),
        now: fixedNow
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toContain('validation');
        expect(outcome.validation_errors).toEqual(['missing required: concentration']);
      }
    });

    it('ambiguity blocks promotion: returns ok:false with ambiguity reason', () => {
      const ambiguitySpans: AmbiguitySpan[] = [
        {
          path: 'material_ref',
          reason: 'matched 3 material specs',
          matched_candidate_ids: ['MSP-a', 'MSP-b', 'MSP-c']
        }
      ];

      const candidate = createCandidate('material-spec', {
        name: 'H2O2',
        concentration: { value: 30, unit: '%' }
      }, ambiguitySpans);

      const outcome = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-003',
        candidatePath: 'candidates[2]',
        sourceArtifactRef,
        targetRecordId: 'MSP-h2o2-003',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toContain('ambiguity');
      }
    });

    it('unregistered target_kind: returns ok:false with kind in reason', () => {
      const candidate = createCandidate('unknown-kind', {
        someField: 'value'
      });

      const outcome = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-004',
        candidatePath: 'candidates[3]',
        sourceArtifactRef,
        targetRecordId: 'UNK-001',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.reason).toContain('unknown-kind');
        expect(outcome.reason).toContain('no schema registered');
      }
    });

    it('record overrides draft fields: kind and recordId come from args', () => {
      const candidate = createCandidate('material-spec', {
        kind: 'wrong-kind',
        recordId: 'wrong-id',
        name: 'H2O2',
        concentration: { value: 30, unit: '%' }
      });

      const outcome = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-005',
        candidatePath: 'candidates[4]',
        sourceArtifactRef,
        targetRecordId: 'MSP-correct-001',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.record.kind).toBe('material-spec');
        expect(outcome.record.recordId).toBe('MSP-correct-001');
        // The draft's wrong values should be overridden
        expect(outcome.record.name).toBe('H2O2');
      }
    });

    it('source_content_hash is reproducible with same inputs', () => {
      const candidate = createCandidate('material-spec', {
        name: 'H2O2',
        concentration: { value: 30, unit: '%' }
      });

      const outcome1 = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-006',
        candidatePath: 'candidates[5]',
        sourceArtifactRef,
        targetRecordId: 'MSP-h2o2-006',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      const outcome2 = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-006',
        candidatePath: 'candidates[5]',
        sourceArtifactRef,
        targetRecordId: 'MSP-h2o2-006',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      expect(outcome1.ok).toBe(true);
      expect(outcome2.ok).toBe(true);
      if (outcome1.ok && outcome2.ok) {
        expect(outcome1.promotion.source_content_hash).toBe(outcome2.promotion.source_content_hash);
      }
    });

    it('custom promotionRecordId is used when provided', () => {
      const candidate = createCandidate('material-spec', {
        name: 'DMSO',
        concentration: { value: 100, unit: '%' }
      });

      const outcome = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-007',
        candidatePath: 'candidates[6]',
        sourceArtifactRef,
        targetRecordId: 'MSP-dmso-001',
        promotionRecordId: 'XPR-custom-999',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.promotion.recordId).toBe('XPR-custom-999');
      }
    });

    it('source_artifact_ref and candidate_path are echoed from args', () => {
      const candidate = createCandidate('protocol', {
        name: 'ROS Assay',
        steps: []
      });

      const customArtifactRef = {
        kind: 'publication' as const,
        id: 'pub-456',
        locator: 'doi:10.1234/example'
      };

      const outcome = promoteCandidate({
        candidate,
        draftRecordId: 'XDR-008',
        candidatePath: 'candidates[7]',
        sourceArtifactRef: customArtifactRef,
        targetRecordId: 'PRT-ros-assay-001',
        targetSchemaIdByKind,
        validator: createStubValidator(true),
        now: fixedNow
      });

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.promotion.source_artifact_ref).toBe(customArtifactRef);
        expect(outcome.promotion.candidate_path).toBe('candidates[7]');
      }
    });
  });
});
