/**
 * Tests for ClassifyPromotionInputPass
 *
 * Covers the classification logic for promotion-compile pipeline input branching.
 */

import { describe, it, expect } from 'vitest';
import { createClassifyPromotionInputPass } from './ClassifyPromotionInputPass.js';
import type { PipelineState } from '../types.js';

/**
 * Creates a minimal PipelineState for testing.
 */
function makeState(input: Record<string, unknown>): PipelineState {
  return {
    input,
    context: {},
    meta: {},
    outputs: new Map(),
    diagnostics: [],
  };
}

describe('ClassifyPromotionInputPass', () => {
  const pass = createClassifyPromotionInputPass();

  it('should have correct id', () => {
    expect(pass.id).toBe('classify_promotion_input');
  });

  it('should have correct family', () => {
    expect(pass.family).toBe('parse');
  });

  describe('context branch', () => {
    it('should classify context input as context branch', async () => {
      const state = makeState({
        context_snapshot: {
          material_class: 'well',
          contents: [{ material: 'H2O2', volume: 100 }],
        },
        target_kind: 'material',
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.output).toBeDefined();
      expect((result.output as { meta?: { branch?: string } }).meta?.branch).toBe('context');
    });

    it('should classify context input with additional fields as context branch', async () => {
      const state = makeState({
        context_snapshot: {
          material_class: 'plate',
          events: [],
        },
        target_kind: 'context',
        extra_field: 'ignored',
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect((result.output as { meta?: { branch?: string } }).meta?.branch).toBe('context');
    });
  });

  describe('extraction branch', () => {
    it('should classify extraction input as extraction branch', async () => {
      const state = makeState({
        draft_record_id: 'XDR-001',
        candidate_path: 'candidates[0]',
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.output).toBeDefined();
      expect((result.output as { meta?: { branch?: string } }).meta?.branch).toBe('extraction');
    });

    it('should classify extraction input with additional fields as extraction branch', async () => {
      const state = makeState({
        draft_record_id: 'XDR-002',
        candidate_path: 'candidates[1]',
        confidence: 0.95,
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect((result.output as { meta?: { branch?: string } }).meta?.branch).toBe('extraction');
    });
  });

  describe('ambiguous input', () => {
    it('should fail when input is empty', async () => {
      const state = makeState({});

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.length).toBe(1);
      expect(result.diagnostics?.[0].code).toBe('ambiguous_promotion_input');
      expect(result.diagnostics?.[0].message).toContain('neither context nor extraction');
    });

    it('should fail when both context and extraction fields are present', async () => {
      const state = makeState({
        context_snapshot: { material_class: 'well' },
        target_kind: 'material',
        draft_record_id: 'XDR-001',
        candidate_path: 'candidates[0]',
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.length).toBe(1);
      expect(result.diagnostics?.[0].code).toBe('ambiguous_promotion_input');
      expect(result.diagnostics?.[0].message).toContain('both context and extraction');
    });

    it('should fail when only context_snapshot is present without target_kind', async () => {
      const state = makeState({
        context_snapshot: { material_class: 'well' },
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.[0].code).toBe('ambiguous_promotion_input');
    });

    it('should fail when only target_kind is present without context_snapshot', async () => {
      const state = makeState({
        target_kind: 'material',
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.[0].code).toBe('ambiguous_promotion_input');
    });

    it('should fail when only draft_record_id is present without candidate_path', async () => {
      const state = makeState({
        draft_record_id: 'XDR-001',
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.[0].code).toBe('ambiguous_promotion_input');
    });

    it('should fail when only candidate_path is present without draft_record_id', async () => {
      const state = makeState({
        candidate_path: 'candidates[0]',
      });

      const result = await pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(false);
      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics?.[0].code).toBe('ambiguous_promotion_input');
    });
  });
});
