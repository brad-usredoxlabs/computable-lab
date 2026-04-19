import { createHash } from 'node:crypto';

/**
 * Canonicalize an object by sorting all object keys recursively.
 * Arrays are preserved in order.
 * 
 * keep in sync with PromotionCompiler.ts canonicalize()
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = canonicalize(obj[key]);
    }
    return sorted;
  }
  return value;
}

export interface CompileCacheKeyArgs {
  pipelineId: string;
  input: unknown;
  policyProfile: string;
  derivationVersions: Readonly<Record<string, string>>;
}

/**
 * Compute a SHA-256 hex key over canonicalized {pipelineId, input, policyProfile, derivationVersions}.
 */
export function computeCompileCacheKey(args: CompileCacheKeyArgs): string {
  const canonical = canonicalize(args);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export interface CompileCacheOptions {
  maxEntries?: number;
}

/**
 * Content-hash-keyed in-memory LRU cache for pipeline results.
 * Pure storage - no IO, no timers, no persistence.
 */
export class CompileCache<V> {
  private cache: Map<string, V>;
  private maxEntries: number;

  constructor(options?: CompileCacheOptions) {
    this.cache = new Map();
    this.maxEntries = options?.maxEntries ?? 256;
  }

  /**
   * Get a value by key. Refreshes LRU recency if found.
   */
  get(key: string): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Delete and reinsert to move to tail (most recent)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * Put a value into the cache. Evicts LRU entry on overflow.
   */
  put(key: string, value: V): void {
    // If key already exists, remove it first so we can reinsert at tail (refresh recency)
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.cache.set(key, value);
      return;
    }
    
    // New key: evict LRU if at capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * Return the current number of entries in the cache.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }
}
