import { describe, it, expect } from 'vitest';
import { hashContextKey, ContextCache, ContextCacheKeyParts } from './ContextCache';

describe('hashContextKey', () => {
  const baseParts: ContextCacheKeyParts = {
    event_graph_id: 'EG-001',
    event_graph_content_hash: 'abc123def456',
    subject_id: 'WELL-A1',
    timepoint_event_index: 5,
  };

  it('produces a stable hash for identical inputs', () => {
    const hash1 = hashContextKey(baseParts);
    const hash2 = hashContextKey(baseParts);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(32);
  });

  it('produces different hash when subject_id changes', () => {
    const hash1 = hashContextKey(baseParts);
    const hash2 = hashContextKey({
      ...baseParts,
      subject_id: 'WELL-B2',
    });
    expect(hash1).not.toBe(hash2);
  });

  it('is insensitive to key order in derivation_versions', () => {
    const hash1 = hashContextKey({
      ...baseParts,
      derivation_versions: { a: '1', b: '2' },
    });
    const hash2 = hashContextKey({
      ...baseParts,
      derivation_versions: { b: '2', a: '1' },
    });
    expect(hash1).toBe(hash2);
  });

  it('includes derivation_versions in hash when present', () => {
    const hash1 = hashContextKey({
      ...baseParts,
      derivation_versions: { model: 'v1' },
    });
    const hash2 = hashContextKey(baseParts);
    expect(hash1).not.toBe(hash2);
  });
});

describe('ContextCache', () => {
  it('basic set and get work correctly', () => {
    const cache = new ContextCache<{ foo: number }>(10);
    cache.set('k1', { foo: 1 });
    expect(cache.get('k1')).toEqual({ foo: 1 });
    expect(cache.has('k1')).toBe(true);
  });

  it('returns undefined for missing keys', () => {
    const cache = new ContextCache(10);
    expect(cache.get('nonexistent')).toBeUndefined();
    expect(cache.has('nonexistent')).toBe(false);
  });

  it('enforces LRU eviction when capacity is exceeded', () => {
    const cache = new ContextCache(2);
    cache.set('k1', 'value1');
    cache.set('k2', 'value2');
    cache.set('k3', 'value3');

    // k1 should be evicted
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k2')).toBe(true);
    expect(cache.has('k3')).toBe(true);
    expect(cache.size()).toBe(2);
  });

  it('touch-on-get: get moves key to end of LRU order', () => {
    const cache = new ContextCache(2);
    cache.set('k1', 'value1');
    cache.set('k2', 'value2');
    
    // Access k1 to move it to the end
    cache.get('k1');
    
    // Now set k3 - should evict k2 (the least recently used)
    cache.set('k3', 'value3');

    expect(cache.has('k1')).toBe(true);
    expect(cache.has('k2')).toBe(false);
    expect(cache.has('k3')).toBe(true);
  });

  it('throws RangeError when capacity is less than 1', () => {
    expect(() => new ContextCache(0)).toThrow(RangeError);
    expect(() => new ContextCache(-1)).toThrow(RangeError);
  });

  it('clear removes all entries', () => {
    const cache = new ContextCache(10);
    cache.set('k1', 'value1');
    cache.set('k2', 'value2');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k2')).toBe(false);
  });

  it('updating existing key does not increase size', () => {
    const cache = new ContextCache(2);
    cache.set('k1', 'value1');
    cache.set('k1', 'updated-value');
    expect(cache.size()).toBe(1);
    expect(cache.get('k1')).toBe('updated-value');
  });

  it('capacity of 1 works correctly', () => {
    const cache = new ContextCache(1);
    cache.set('k1', 'value1');
    expect(cache.size()).toBe(1);
    cache.set('k2', 'value2');
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k2')).toBe(true);
    expect(cache.size()).toBe(1);
  });
});
