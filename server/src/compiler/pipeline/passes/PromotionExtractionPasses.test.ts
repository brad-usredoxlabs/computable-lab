/**
 * Tests for PromotionExtractionPasses
 *
 * Covers the three extraction-branch passes:
 * - validate_extraction_candidate
 * - resolve_target_schema
 * - project_extraction_promotion
 */

import { describe, expect, it } from 'vitest';
import type { PipelineState } from '../types.js';
import {
  createValidateExtractionCandidatePass,
  createResolveTargetSchemaPass,
  createProjectExtractionPromotionPass,
} from './PromotionExtractionPasses.js';

// Helper to create a minimal PipelineState for testing
function makeState(
  input: Record<string, unknown>,
  outputsMap?: Map<string, unknown>
): PipelineState {
  return {
    input,
    context: {},
    meta: {},
    outputs: outputsMap ?? new Map(),
    diagnostics: [],
  };
}

describe('createValidateExtractionCandidatePass', () => {
  const pass = createValidateExtractionCandidatePass();

  it('should succeed when candidate has all required fields', () => {
    const state = makeState({
      candidate: {
        target_kind: 'protocol',
        draft: { foo: 'bar' },
        confidence: 0.95,
      },
    });

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      target_kind: 'protocol',
      draft: { foo: 'bar' },
      confidence: 0.95,
    });
    expect(result.diagnostics?.length).toBe(0);
  });

  it('should fail when candidate is missing', () => {
    const state = makeState({});

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'INVALID_EXTRACTION_CANDIDATE')).toBe(true);
  });

  it('should fail when target_kind is missing', () => {
    const state = makeState({
      candidate: {
        draft: { foo: 'bar' },
        confidence: 0.95,
      },
    });

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'INVALID_EXTRACTION_CANDIDATE')).toBe(true);
  });

  it('should fail when draft is missing', () => {
    const state = makeState({
      candidate: {
        target_kind: 'protocol',
        confidence: 0.95,
      },
    });

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'INVALID_EXTRACTION_CANDIDATE')).toBe(true);
  });

  it('should fail when confidence is missing', () => {
    const state = makeState({
      candidate: {
        target_kind: 'protocol',
        draft: { foo: 'bar' },
      },
    });

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'INVALID_EXTRACTION_CANDIDATE')).toBe(true);
  });
});

describe('createResolveTargetSchemaPass', () => {
  const pass = createResolveTargetSchemaPass();

  it('should resolve target_kind to schemaId for known kinds', () => {
    const outputs = new Map<string, unknown>();
    outputs.set('validate_extraction_candidate', {
      target_kind: 'protocol',
      draft: {},
      confidence: 0.9,
    });
    const state = makeState({}, outputs);

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      schemaId: 'protocol.schema.yaml',
      target_kind: 'protocol',
    });
  });

  it('should fall back to state.input.candidate when validate_extraction_candidate output is missing', () => {
    const state = makeState({
      candidate: {
        target_kind: 'material-spec',
        draft: {},
        confidence: 0.8,
      },
    });

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      schemaId: 'material-spec.schema.yaml',
      target_kind: 'material-spec',
    });
  });

  it('should fail when target_kind is missing', () => {
    const state = makeState({
      candidate: {
        draft: {},
        confidence: 0.9,
      },
    });

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'NO_TARGET_KIND')).toBe(true);
  });

  it('should fail when target_kind is unknown', () => {
    const state = makeState({
      candidate: {
        target_kind: 'unknown-kind',
        draft: {},
        confidence: 0.9,
      },
    });

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'UNKNOWN_TARGET_KIND')).toBe(true);
  });

  it('should resolve all known target kinds', () => {
    const testCases: Array<{ kind: string; schema: string }> = [
      { kind: 'material-spec', schema: 'material-spec.schema.yaml' },
      { kind: 'protocol', schema: 'protocol.schema.yaml' },
      { kind: 'equipment-spec', schema: 'equipment-spec.schema.yaml' },
      { kind: 'labware-spec', schema: 'labware-spec.schema.yaml' },
    ];

    for (const { kind, schema } of testCases) {
      const outputs = new Map<string, unknown>();
      outputs.set('validate_extraction_candidate', {
        target_kind: kind,
        draft: {},
        confidence: 0.9,
      });
      const state = makeState({}, outputs);
      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.output).toEqual({
        schemaId: schema,
        target_kind: kind,
      });
    }
  });
});

describe('createProjectExtractionPromotionPass', () => {
  it('should produce extraction-promotion record with fixed now function', () => {
    const fixedDate = new Date('2024-01-15T10:30:00.000Z');
    const pass = createProjectExtractionPromotionPass({
      now: () => fixedDate,
    });

    const validatedDraft = { foo: 'bar', baz: 123 };
    const candidate = {
      target_kind: 'protocol',
      draft: { foo: 'bar' },
      confidence: 0.95,
    };
    const sourceDraftId = 'draft-123';

    const outputs = new Map<string, unknown>();
    outputs.set('schema_validate_draft', validatedDraft);
    outputs.set('validate_extraction_candidate', candidate);

    const state = makeState({ source_draft_id: sourceDraftId }, outputs);

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      kind: 'extraction-promotion',
      recordId: 'XPR-2024-01-15T10-30-00-000Z-v1',
      source_draft_id: 'draft-123',
      target_kind: 'protocol',
      target_record: validatedDraft,
      created_at: '2024-01-15T10:30:00.000Z',
    });
  });

  it('should use custom recordIdPrefix when provided', () => {
    const fixedDate = new Date('2024-06-01T00:00:00.000Z');
    const pass = createProjectExtractionPromotionPass({
      recordIdPrefix: 'CUSTOM-',
      now: () => fixedDate,
    });

    const outputs = new Map<string, unknown>();
    outputs.set('schema_validate_draft', { data: 'test' });
    outputs.set('validate_extraction_candidate', {
      target_kind: 'material-spec',
      draft: {},
      confidence: 0.8,
    });

    const state = makeState({ source_draft_id: 'draft-456' }, outputs);

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(true);
    expect((result.output as Record<string, unknown>).recordId).toMatch(/^CUSTOM-2024-06-01T00-00-00-000Z-v1$/);
  });

  it('should fail when schema_validate_draft is missing', () => {
    const pass = createProjectExtractionPromotionPass();
    const outputs = new Map<string, unknown>();
    outputs.set('validate_extraction_candidate', {
      target_kind: 'protocol',
      draft: {},
      confidence: 0.9,
    });
    const state = makeState({ source_draft_id: 'draft-123' }, outputs);

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'MISSING_PROMOTION_INPUTS')).toBe(true);
  });

  it('should fail when candidate is missing', () => {
    const pass = createProjectExtractionPromotionPass();
    const outputs = new Map<string, unknown>();
    outputs.set('schema_validate_draft', { foo: 'bar' });
    const state = makeState({ source_draft_id: 'draft-123' }, outputs);

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'MISSING_PROMOTION_INPUTS')).toBe(true);
  });

  it('should fail when source_draft_id is missing', () => {
    const pass = createProjectExtractionPromotionPass();
    const outputs = new Map<string, unknown>();
    outputs.set('schema_validate_draft', { foo: 'bar' });
    outputs.set('validate_extraction_candidate', {
      target_kind: 'protocol',
      draft: {},
      confidence: 0.9,
    });
    const state = makeState({}, outputs);

    const result = pass.run({ pass_id: pass.id, state });

    expect(result.ok).toBe(false);
    expect(result.diagnostics?.some(d => d.code === 'MISSING_PROMOTION_INPUTS')).toBe(true);
  });
});
