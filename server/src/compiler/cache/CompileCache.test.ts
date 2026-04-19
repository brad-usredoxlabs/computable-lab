import { describe, it, expect } from 'vitest';
import { CompileCache, computeCompileCacheKey, type CompileCacheKeyArgs } from './CompileCache.js';

describe('computeCompileCacheKey', () => {
  const baseArgs: CompileCacheKeyArgs = {
    pipelineId: 'protocol-compile',
    input: { foo: 'bar' },
    policyProfile: 'default',
    derivationVersions: { 'model-a': '1.0.0' },
  };

  it('Hash stable: same args twice → same key', () => {
    const key1 = computeCompileCacheKey(baseArgs);
    const key2 = computeCompileCacheKey(baseArgs);
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  it('Hash sensitive: change any field → different key', () => {
    const key1 = computeCompileCacheKey(baseArgs);
    
    const key2 = computeCompileCacheKey({ ...baseArgs, pipelineId: 'other-pipeline' });
    expect(key2).not.toBe(key1);

    const key3 = computeCompileCacheKey({ ...baseArgs, input: { foo: 'baz' } });
    expect(key3).not.toBe(key1);

    const key4 = computeCompileCacheKey({ ...baseArgs, policyProfile: 'strict' });
    expect(key4).not.toBe(key1);

    const key5 = computeCompileCacheKey({ ...baseArgs, derivationVersions: { 'model-a': '2.0.0' } });
    expect(key5).not.toBe(key1);
  });

  it('Key field ordering irrelevant: {a:1,b:2} and {b:2,a:1} as input → same key', () => {
    const key1 = computeCompileCacheKey({
      ...baseArgs,
      input: { a: 1, b: 2 },
    });
    const key2 = computeCompileCacheKey({
      ...baseArgs,
      input: { b: 2, a: 1 },
    });
    expect(key1).toBe(key2);
  });
});

describe('CompileCache', () => {
  it('Put/get round-trip: put("k", v) then get("k") returns v', () => {
    const cache = new CompileCache<string>();
    cache.put('k', 'value');
    expect(cache.get('k')).toBe('value');
  });

  it('Miss: get("nope") returns undefined', () => {
    const cache = new CompileCache<string>();
    expect(cache.get('nope')).toBeUndefined();
  });

  it('LRU eviction: maxEntries: 2, put k1, k2, k3 → k1 evicted', () => {
    const cache = new CompileCache<string>({ maxEntries: 2 });
    cache.put('k1', 'v1');
    cache.put('k2', 'v2');
    cache.put('k3', 'v3');

    expect(cache.get('k1')).toBeUndefined(); // evicted
    expect(cache.get('k2')).toBe('v2');
    expect(cache.get('k3')).toBe('v3');
  });

  it('LRU refresh: put k1, k2; get("k1"); put k3 → k2 evicted, k1 retained', () => {
    const cache = new CompileCache<string>({ maxEntries: 2 });
    cache.put('k1', 'v1');
    cache.put('k2', 'v2');
    
    // Access k1 to make it most recent
    cache.get('k1');
    
    // Now k2 is the LRU entry
    cache.put('k3', 'v3');

    expect(cache.get('k1')).toBe('v1'); // retained
    expect(cache.get('k2')).toBeUndefined(); // evicted
    expect(cache.get('k3')).toBe('v3');
  });

  it('Clear: after clear(), size() is 0, get(anyKey) is undefined', () => {
    const cache = new CompileCache<string>();
    cache.put('k1', 'v1');
    cache.put('k2', 'v2');
    
    expect(cache.size()).toBe(2);
    
    cache.clear();
    
    expect(cache.size()).toBe(0);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k2')).toBeUndefined();
  });

  it('Default maxEntries is 256', () => {
    const cache = new CompileCache();
    expect(cache.size()).toBe(0);
    
    // Add 256 entries
    for (let i = 0; i < 256; i++) {
      cache.put(`key${i}`, `value${i}`);
    }
    expect(cache.size()).toBe(256);
    
    // Add one more - should evict the first
    cache.put('key256', 'value256');
    expect(cache.size()).toBe(256);
    expect(cache.get('key0')).toBeUndefined();
    expect(cache.get('key256')).toBe('value256');
  });

  it('get() refreshes LRU recency', () => {
    const cache = new CompileCache<string>({ maxEntries: 3 });
    cache.put('k1', 'v1');
    cache.put('k2', 'v2');
    cache.put('k3', 'v3');
    
    // Access k1 to make it most recent
    cache.get('k1');
    
    // Add k4 - should evict k2 (the LRU), not k1
    cache.put('k4', 'v4');
    
    expect(cache.get('k1')).toBe('v1'); // retained due to refresh
    expect(cache.get('k2')).toBeUndefined(); // evicted
    expect(cache.get('k3')).toBe('v3');
    expect(cache.get('k4')).toBe('v4');
  });

  it('put() with existing key updates value and refreshes recency', () => {
    const cache = new CompileCache<string>({ maxEntries: 2 });
    cache.put('k1', 'v1');
    cache.put('k2', 'v2');
    
    // Update k1 - should not evict, just update and refresh
    cache.put('k1', 'v1-updated');
    
    // Verify the update worked
    expect(cache.get('k1')).toBe('v1-updated');
    expect(cache.get('k2')).toBe('v2');
    expect(cache.size()).toBe(2);
    
    // Reset cache for the eviction test
    cache.clear();
    cache.put('k1', 'v1');
    cache.put('k2', 'v2');
    
    // Access k1 to make it most recent (without calling get which would refresh)
    // Actually, let's just test that put() with existing key refreshes recency
    cache.put('k1', 'v1-updated');
    
    // Now k2 is the LRU entry
    cache.put('k3', 'v3');
    
    // k1 should be retained (was refreshed by put), k2 should be evicted
    expect(cache.get('k1')).toBe('v1-updated');
    expect(cache.get('k2')).toBeUndefined();
    expect(cache.get('k3')).toBe('v3');
  });
});
