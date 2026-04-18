import { describe, it, expect } from 'vitest';
import { PromotionCompiler, computeSourceContentHash } from './PromotionCompiler.js';
import type { Context } from '../types/context.js';

const subject = { kind: 'record' as const, id: 'LI-1', type: 'labware-instance' };

describe('PromotionCompiler', () => {
  it('computeSourceContentHash is stable for equivalent objects', () => {
    const a: Context = { id: 'CTX-1', subject_ref: subject, contents: [], total_volume: { value: 100, unit: 'uL' } };
    const b: Context = { id: 'CTX-1', subject_ref: subject, total_volume: { value: 100, unit: 'uL' }, contents: [] };
    expect(computeSourceContentHash(a)).toBe(computeSourceContentHash(b));
  });

  it('rejects partial contexts for material-instance', () => {
    const ctx: Context = { id: 'CTX-2', subject_ref: subject, contents: [] };
    (ctx as unknown as Record<string, unknown>).completeness = 'partial';
    const pc = new PromotionCompiler();
    expect(() => pc.promote(ctx, 'material-instance')).toThrow(/partial/);
  });

  it('allows partial contexts for context-snapshot and stamps locked hash', () => {
    const ctx: Context = { id: 'CTX-3', subject_ref: subject, contents: [] };
    (ctx as unknown as Record<string, unknown>).completeness = 'partial';
    const pc = new PromotionCompiler();
    const result = pc.promote(ctx, 'context-snapshot');
    expect(result.snapshot.completeness_at_promotion).toBe('partial');
    expect(result.promotion.output_kind).toBe('context-snapshot');
    expect(result.promotion.source_content_hash).toBe(result.snapshot.content_hash);
    expect(result.source_content_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
