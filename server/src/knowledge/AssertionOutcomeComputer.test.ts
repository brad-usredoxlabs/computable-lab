/**
 * Tests for AssertionOutcomeComputer
 */

import { describe, it, expect } from 'vitest';
import { computeAssertionOutcome, type AssertionLike, type ComputedOutcome } from './AssertionOutcomeComputer.js';
import type { Context } from '../types/context.js';

describe('AssertionOutcomeComputer', () => {
  // Helper to create a minimal context
  function makeContext(id: string, totalVolume?: number): Context {
    const ctx: Context = {
      id,
      subject_ref: { kind: 'record', type: 'well', id: `PLATE:${id}`, label: id },
    };
    if (totalVolume !== undefined) {
      ctx.total_volume = { value: totalVolume, unit: 'uL' };
    }
    return ctx;
  }

  describe('scope: single_context', () => {
    it('should return unknown direction with reason for single_context scope', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-001',
        scope: 'single_context',
        context_refs: [{ kind: 'record', id: 'CTX-001', type: 'context' }],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-001', makeContext('CTX-001', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.measure).toBe('total_volume');
      expect(result.reason).toContain('comparison or series');
    });
  });

  describe('scope: global', () => {
    it('should return unknown direction with reason for global scope', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-002',
        scope: 'global',
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-001', makeContext('CTX-001', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('comparison or series');
    });
  });

  describe('scope: comparison', () => {
    it('should return increased when total_volume increases', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-003',
        scope: 'comparison',
        context_refs: [
          { kind: 'record', id: 'CTX-A', type: 'context' },
          { kind: 'record', id: 'CTX-B', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-A', makeContext('CTX-A', 100));
      contexts.set('CTX-B', makeContext('CTX-B', 150));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('increased');
      expect(result.deltas).toHaveLength(1);
      expect(result.deltas?.[0]).toBe(50);
    });

    it('should return no_change when total_volume is the same', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-004',
        scope: 'comparison',
        context_refs: [
          { kind: 'record', id: 'CTX-A', type: 'context' },
          { kind: 'record', id: 'CTX-B', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-A', makeContext('CTX-A', 100));
      contexts.set('CTX-B', makeContext('CTX-B', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('no_change');
      expect(result.deltas).toHaveLength(1);
      expect(result.deltas?.[0]).toBe(0);
    });

    it('should return decreased when total_volume decreases', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-005',
        scope: 'comparison',
        context_refs: [
          { kind: 'record', id: 'CTX-A', type: 'context' },
          { kind: 'record', id: 'CTX-B', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-A', makeContext('CTX-A', 150));
      contexts.set('CTX-B', makeContext('CTX-B', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('decreased');
      expect(result.deltas).toHaveLength(1);
      expect(result.deltas?.[0]).toBe(-50);
    });

    it('should return unknown when a context is missing', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-006',
        scope: 'comparison',
        context_refs: [
          { kind: 'record', id: 'CTX-A', type: 'context' },
          { kind: 'record', id: 'CTX-MISSING', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-A', makeContext('CTX-A', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('missing context');
      expect(result.reason).toContain('CTX-MISSING');
    });

    it('should handle observed.<key> measure with increased value', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-007',
        scope: 'comparison',
        context_refs: [
          { kind: 'record', id: 'CTX-A', type: 'context' },
          { kind: 'record', id: 'CTX-B', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-A', {
        id: 'CTX-A',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-A', label: 'CTX-A' },
        observed: { od600: 0.2 },
      });
      contexts.set('CTX-B', {
        id: 'CTX-B',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-B', label: 'CTX-B' },
        observed: { od600: 0.8 },
      });

      const result = computeAssertionOutcome(assertion, contexts, 'observed.od600');

      expect(result.direction).toBe('increased');
      expect(result.deltas).toHaveLength(1);
      expect(Math.abs(result.deltas![0] - 0.6)).toBeLessThan(1e-9);
    });

    it('should return unknown for non-numeric observed values', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-008',
        scope: 'comparison',
        context_refs: [
          { kind: 'record', id: 'CTX-A', type: 'context' },
          { kind: 'record', id: 'CTX-B', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-A', {
        id: 'CTX-A',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-A', label: 'CTX-A' },
        observed: { status: 'active' },
      });
      contexts.set('CTX-B', {
        id: 'CTX-B',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-B', label: 'CTX-B' },
        observed: { status: 'inactive' },
      });

      const result = computeAssertionOutcome(assertion, contexts, 'observed.status');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('non-numeric measure');
    });

    it('should handle properties.<key> measure', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-009',
        scope: 'comparison',
        context_refs: [
          { kind: 'record', id: 'CTX-A', type: 'context' },
          { kind: 'record', id: 'CTX-B', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-A', {
        id: 'CTX-A',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-A', label: 'CTX-A' },
        properties: { pH: 7.0 },
      });
      contexts.set('CTX-B', {
        id: 'CTX-B',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-B', label: 'CTX-B' },
        properties: { pH: 7.5 },
      });

      const result = computeAssertionOutcome(assertion, contexts, 'properties.pH');

      expect(result.direction).toBe('increased');
      expect(result.deltas).toHaveLength(1);
      expect(Math.abs(result.deltas![0] - 0.5)).toBeLessThan(1e-9);
    });
  });

  describe('scope: series', () => {
    it('should return increased for monotonic increasing series', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-010',
        scope: 'series',
        context_refs: [
          { kind: 'record', id: 'CTX-1', type: 'context' },
          { kind: 'record', id: 'CTX-2', type: 'context' },
          { kind: 'record', id: 'CTX-3', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', makeContext('CTX-1', 100));
      contexts.set('CTX-2', makeContext('CTX-2', 150));
      contexts.set('CTX-3', makeContext('CTX-3', 200));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('increased');
      expect(result.deltas).toHaveLength(2);
      expect(result.deltas?.[0]).toBe(50);
      expect(result.deltas?.[1]).toBe(50);
    });

    it('should return mixed for non-monotonic series', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-011',
        scope: 'series',
        context_refs: [
          { kind: 'record', id: 'CTX-1', type: 'context' },
          { kind: 'record', id: 'CTX-2', type: 'context' },
          { kind: 'record', id: 'CTX-3', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', makeContext('CTX-1', 100));
      contexts.set('CTX-2', makeContext('CTX-2', 150));
      contexts.set('CTX-3', makeContext('CTX-3', 120));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('mixed');
      expect(result.deltas).toHaveLength(2);
      expect(result.deltas?.[0]).toBe(50);
      expect(result.deltas?.[1]).toBe(-30);
    });

    it('should return decreased for monotonic decreasing series', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-012',
        scope: 'series',
        context_refs: [
          { kind: 'record', id: 'CTX-1', type: 'context' },
          { kind: 'record', id: 'CTX-2', type: 'context' },
          { kind: 'record', id: 'CTX-3', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', makeContext('CTX-1', 200));
      contexts.set('CTX-2', makeContext('CTX-2', 150));
      contexts.set('CTX-3', makeContext('CTX-3', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('decreased');
      expect(result.deltas).toHaveLength(2);
      expect(result.deltas?.[0]).toBe(-50);
      expect(result.deltas?.[1]).toBe(-50);
    });

    it('should return no_change for constant series', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-013',
        scope: 'series',
        context_refs: [
          { kind: 'record', id: 'CTX-1', type: 'context' },
          { kind: 'record', id: 'CTX-2', type: 'context' },
          { kind: 'record', id: 'CTX-3', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', makeContext('CTX-1', 100));
      contexts.set('CTX-2', makeContext('CTX-2', 100));
      contexts.set('CTX-3', makeContext('CTX-3', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('no_change');
      expect(result.deltas).toHaveLength(2);
      expect(result.deltas?.[0]).toBe(0);
      expect(result.deltas?.[1]).toBe(0);
    });

    it('should return unknown when a context is missing in series', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-014',
        scope: 'series',
        context_refs: [
          { kind: 'record', id: 'CTX-1', type: 'context' },
          { kind: 'record', id: 'CTX-MISSING', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', makeContext('CTX-1', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('missing context');
      expect(result.reason).toContain('CTX-MISSING');
    });

    it('should handle series with observed.<key> measures', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-015',
        scope: 'series',
        context_refs: [
          { kind: 'record', id: 'CTX-1', type: 'context' },
          { kind: 'record', id: 'CTX-2', type: 'context' },
          { kind: 'record', id: 'CTX-3', type: 'context' },
        ],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', {
        id: 'CTX-1',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-1', label: 'CTX-1' },
        observed: { od600: 0.2 },
      });
      contexts.set('CTX-2', {
        id: 'CTX-2',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-2', label: 'CTX-2' },
        observed: { od600: 0.5 },
      });
      contexts.set('CTX-3', {
        id: 'CTX-3',
        subject_ref: { kind: 'record', type: 'well', id: 'PLATE:CTX-3', label: 'CTX-3' },
        observed: { od600: 0.8 },
      });

      const result = computeAssertionOutcome(assertion, contexts, 'observed.od600');

      expect(result.direction).toBe('increased');
      expect(result.deltas).toHaveLength(2);
      expect(Math.abs(result.deltas![0] - 0.3)).toBeLessThan(1e-9);
      expect(Math.abs(result.deltas![1] - 0.3)).toBeLessThan(1e-9);
    });
  });

  describe('edge cases', () => {
    it('should return unknown for comparison with only one context ref', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-016',
        scope: 'comparison',
        context_refs: [{ kind: 'record', id: 'CTX-1', type: 'context' }],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', makeContext('CTX-1', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('exactly 2 context refs');
    });

    it('should return unknown for series with only one context ref', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-017',
        scope: 'series',
        context_refs: [{ kind: 'record', id: 'CTX-1', type: 'context' }],
      };

      const contexts = new Map<string, Context>();
      contexts.set('CTX-1', makeContext('CTX-1', 100));

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('at least 2 context refs');
    });

    it('should handle empty context_refs for comparison', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-018',
        scope: 'comparison',
        context_refs: [],
      };

      const contexts = new Map<string, Context>();

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('exactly 2 context refs');
    });

    it('should handle empty context_refs for series', () => {
      const assertion: AssertionLike = {
        kind: 'assertion',
        id: 'AST-019',
        scope: 'series',
        context_refs: [],
      };

      const contexts = new Map<string, Context>();

      const result = computeAssertionOutcome(assertion, contexts, 'total_volume');

      expect(result.direction).toBe('unknown');
      expect(result.reason).toContain('at least 2 context refs');
    });
  });
});
