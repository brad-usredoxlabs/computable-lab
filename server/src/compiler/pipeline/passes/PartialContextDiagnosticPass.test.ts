/**
 * Tests for PartialContextDiagnosticPass
 */

import { describe, it, expect } from 'vitest';
import { createPartialContextDiagnosticPass, PartialContextDiagnosticArgs } from './PartialContextDiagnosticPass.js';
import type { PipelineState } from '../types.js';

function buildState(context: Record<string, unknown>): PipelineState {
  return {
    input: {},
    context,
    meta: {},
    outputs: new Map(),
    diagnostics: [],
  };
}

describe('PartialContextDiagnosticPass', () => {
  describe('when all required keys are present', () => {
    it('returns {ok: true} with no diagnostics and no outcome', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a', 'b.c'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        a: 1,
        b: { c: 2 },
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toBeUndefined();
      expect(result.outcome).toBeUndefined();
    });
  });

  describe('when one key is missing', () => {
    it('emits one diagnostic with the correct missing_key and outcome', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a', 'b.d'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        a: 1,
        b: { c: 2 },
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.outcome).toBe('needs-missing-fact');
      expect(result.diagnostics?.[0].code).toBe('needs-missing-fact');
      expect(result.diagnostics?.[0].severity).toBe('warning');
      expect(result.diagnostics?.[0].details?.missing_key).toBe('b.d');
      expect(result.diagnostics?.[0].message).toContain("context key 'b.d' is not resolved");
    });
  });

  describe('when multiple keys are missing', () => {
    it('emits one diagnostic per missing key', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a', 'b.c', 'd.e.f', 'g'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        a: 1,
        // b.c missing
        // d.e.f missing
        // g missing
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toHaveLength(3);
      expect(result.outcome).toBe('needs-missing-fact');

      const missingKeys = result.diagnostics?.map((d) => d.details?.missing_key);
      expect(missingKeys).toContain('b.c');
      expect(missingKeys).toContain('d.e.f');
      expect(missingKeys).toContain('g');

      // All diagnostics should have the same code
      for (const diag of result.diagnostics!) {
        expect(diag.code).toBe('needs-missing-fact');
        expect(diag.severity).toBe('warning');
      }
    });
  });

  describe('when a key value is null', () => {
    it('treats null as missing and emits a diagnostic', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        a: null,
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.outcome).toBe('needs-missing-fact');
      expect(result.diagnostics?.[0].details?.missing_key).toBe('a');
    });
  });

  describe('when suggestedSourceByKey is provided', () => {
    it('includes the suggested_source in the diagnostic data', () => {
      const suggestedSourceByKey = new Map<string, string>();
      suggestedSourceByKey.set('a', 'observe-event');
      suggestedSourceByKey.set('b.c', 'material-spec');

      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a', 'b.c', 'd'],
        suggestedSourceByKey,
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        // a missing
        // b.c missing
        // d missing
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toHaveLength(3);

      const diagA = result.diagnostics?.find((d) => d.details?.missing_key === 'a');
      const diagBC = result.diagnostics?.find((d) => d.details?.missing_key === 'b.c');
      const diagD = result.diagnostics?.find((d) => d.details?.missing_key === 'd');

      expect(diagA?.details?.suggested_source).toBe('observe-event');
      expect(diagBC?.details?.suggested_source).toBe('material-spec');
      expect(diagD?.details?.suggested_source).toBeUndefined();
    });
  });

  describe('when a custom passId is provided', () => {
    it('uses the custom passId in all diagnostics', () => {
      const args: PartialContextDiagnosticArgs = {
        passId: 'check_well_ready',
        requiredKeys: ['well.status'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        well: {},
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics?.[0].pass_id).toBe('check_well_ready');
      expect(result.diagnostics?.[0].details?.missing_key).toBe('well.status');
    });
  });

  describe('when context is undefined', () => {
    it('treats all required keys as missing', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a', 'b.c'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state: PipelineState = {
        input: {},
        context: undefined as unknown as Record<string, unknown>,
        meta: {},
        outputs: new Map(),
        diagnostics: [],
      };

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toHaveLength(2);
      expect(result.outcome).toBe('needs-missing-fact');
    });
  });

  describe('nested path resolution', () => {
    it('correctly resolves deeply nested paths', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a.b.c.d', 'x.y'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        a: { b: { c: { d: 'value' } } },
        x: { y: 'other' },
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toBeUndefined();
      expect(result.outcome).toBeUndefined();
    });

    it('detects missing intermediate paths', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['a.b.c.d'],
      };
      const pass = createPartialContextDiagnosticPass(args);
      const state = buildState({
        a: { b: {} }, // c is missing
      });

      const result = pass.run({ pass_id: pass.id, state });

      expect(result.ok).toBe(true);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics?.[0].details?.missing_key).toBe('a.b.c.d');
    });
  });

  describe('default passId', () => {
    it('uses "partial_context_diagnostic" when no passId is provided', () => {
      const args: PartialContextDiagnosticArgs = {
        requiredKeys: ['missing_key'],
      };
      const pass = createPartialContextDiagnosticPass(args);

      expect(pass.id).toBe('partial_context_diagnostic');
      expect(pass.family).toBe('derive_context');

      const state = buildState({});
      const result = pass.run({ pass_id: pass.id, state });

      expect(result.diagnostics?.[0].pass_id).toBe('partial_context_diagnostic');
    });
  });
});
