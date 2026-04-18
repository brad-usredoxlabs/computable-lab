import { describe, it, expect } from 'vitest';
import { detectSourceDrift, PromotionCompiler, computeSourceContentHash } from './PromotionCompiler.js';
import type { Context } from '../types/context.js';

describe('detectSourceDrift', () => {
  const compiler = new PromotionCompiler();

  it('should report no drift for identical context', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-1',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
      ],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');
    const result = detectSourceDrift(promotion, context);

    expect(result.drifted).toBe(false);
    expect(result.previous_hash).toBe(result.current_hash);
  });

  it('should detect drift on contents change', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-2',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
      ],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');

    // Mutate the context's contents
    const mutatedContext: Context = {
      ...context,
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 200, // Changed from 100 to 200
          volume_unit: 'uL',
        },
      ],
    };

    const result = detectSourceDrift(promotion, mutatedContext);

    expect(result.drifted).toBe(true);
    expect(result.previous_hash).not.toBe(result.current_hash);
    expect(result.reason).toBe('context content hash changed since promotion');
  });

  it('should detect drift on observed field change', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-3',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
      ],
      observed: {
        'od600': {
          value: 0.5,
          unit: 'AU',
          measured_at: '2024-01-01T00:00:00Z',
        },
      },
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');

    // Mutate the observed field
    const mutatedContext: Context = {
      ...context,
      observed: {
        'od600': {
          value: 0.8, // Changed from 0.5 to 0.8
          unit: 'AU',
          measured_at: '2024-01-01T00:00:00Z',
        },
      },
    };

    const result = detectSourceDrift(promotion, mutatedContext);

    expect(result.drifted).toBe(true);
    expect(result.reason).toBe('context content hash changed since promotion');
    expect(result.previous_hash).not.toBe(result.current_hash);
  });

  it('should report no drift after cosmetic key reorder', () => {
    // Create context A with one insertion order
    const contextA: Context = {
      kind: 'context',
      id: 'ctx-test-4',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
      ],
      observed: {
        'od600': {
          value: 0.5,
          unit: 'AU',
          measured_at: '2024-01-01T00:00:00Z',
        },
      },
      created_at: '2024-01-01T00:00:00Z',
    };

    // Create context B with same data but different key insertion order
    // In JavaScript, object key order can vary based on insertion
    // We use Object.assign to create a new object with keys in a different order
    const contextB: Context = Object.assign(
      { kind: 'context', id: 'ctx-test-4' } as Context,
      {
        contents: [
          {
            material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
            volume_unit: 'uL', // Different order: unit before volume_value
            volume_value: 100,
          },
        ],
        observed: {
          'od600': {
            measured_at: '2024-01-01T00:00:00Z', // Different order: measured_at first
            value: 0.5,
            unit: 'AU',
          },
        },
        created_at: '2024-01-01T00:00:00Z',
      }
    );

    const { promotion } = compiler.promote(contextA, 'context-snapshot');
    const result = detectSourceDrift(promotion, contextB);

    // Canonicalization should make their hashes equal
    expect(result.drifted).toBe(false);
    expect(result.previous_hash).toBe(result.current_hash);
  });

  it('should include reason string on drift', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-5',
      contents: [
        {
          material: { kind: 'record', id: 'mat-dmso', type: 'material-spec' },
          volume_value: 50,
          volume_unit: 'uL',
        },
      ],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');

    // Create a completely different context
    const differentContext: Context = {
      kind: 'context',
      id: 'ctx-test-5-different',
      contents: [
        {
          material: { kind: 'record', id: 'mat-ethanol', type: 'material-spec' },
          volume_value: 1000,
          volume_unit: 'mL',
        },
      ],
      observed: {
        'ph': {
          value: 7.0,
          unit: 'pH',
          measured_at: '2024-01-01T00:00:00Z',
        },
      },
      created_at: '2024-01-01T00:00:00Z',
    };

    const result = detectSourceDrift(promotion, differentContext);

    expect(result.drifted).toBe(true);
    expect(result.reason).toBe('context content hash changed since promotion');
    expect(result.previous_hash).toHaveLength(64); // SHA-256 hex is 64 chars
    expect(result.current_hash).toHaveLength(64);
  });

  it('should return full 64-char SHA-256 hashes', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-6',
      contents: [],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');
    const result = detectSourceDrift(promotion, context);

    expect(result.previous_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.current_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should not mutate the currentContext argument', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-7',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
      ],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');
    
    // Deep clone to compare
    const originalContext = JSON.parse(JSON.stringify(context));
    
    detectSourceDrift(promotion, context);

    expect(context).toEqual(originalContext);
  });

  it('should detect drift when adding new content entries', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-8',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
      ],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');

    const contextWithExtraContent: Context = {
      ...context,
      contents: [
        ...context.contents,
        {
          material: { kind: 'record', id: 'mat-dmso', type: 'material-spec' },
          volume_value: 10,
          volume_unit: 'uL',
        },
      ],
    };

    const result = detectSourceDrift(promotion, contextWithExtraContent);

    expect(result.drifted).toBe(true);
    expect(result.reason).toBe('context content hash changed since promotion');
  });

  it('should detect drift when removing content entries', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-9',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
        {
          material: { kind: 'record', id: 'mat-dmso', type: 'material-spec' },
          volume_value: 10,
          volume_unit: 'uL',
        },
      ],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');

    const contextWithLessContent: Context = {
      ...context,
      contents: [context.contents[0]], // Remove second entry
    };

    const result = detectSourceDrift(promotion, contextWithLessContent);

    expect(result.drifted).toBe(true);
    expect(result.reason).toBe('context content hash changed since promotion');
  });

  it('should use computeSourceContentHash for both hashes', () => {
    const context: Context = {
      kind: 'context',
      id: 'ctx-test-10',
      contents: [
        {
          material: { kind: 'record', id: 'mat-h2o2', type: 'material-spec' },
          volume_value: 100,
          volume_unit: 'uL',
        },
      ],
      observed: {},
      created_at: '2024-01-01T00:00:00Z',
    };

    const { promotion } = compiler.promote(context, 'context-snapshot');
    
    // Verify that the promotion's source_content_hash matches what computeSourceContentHash produces
    expect(promotion.source_content_hash).toBe(computeSourceContentHash(context));
    
    const result = detectSourceDrift(promotion, context);
    expect(result.current_hash).toBe(computeSourceContentHash(context));
  });
});
