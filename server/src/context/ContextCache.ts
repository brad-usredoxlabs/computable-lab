import { createHash } from 'node:crypto';

/**
 * Parts used to construct a cache key for context computation.
 * The caller is responsible for providing the event_graph_content_hash.
 */
export interface ContextCacheKeyParts {
  event_graph_id: string;
  event_graph_content_hash: string;   // caller computes this
  subject_id: string;                 // e.g. "WELL-A1"
  timepoint_event_index: number;      // resolved by TimeCoordinateResolver
  derivation_versions?: Record<string, string>; // {model_id: version}
}

/**
 * Produces a stable 32-character hex string from context cache key parts.
 * Canonicalizes derivation_versions by sorting keys before JSON serialization.
 */
export function hashContextKey(parts: ContextCacheKeyParts): string {
  const canonical: Record<string, unknown> = {
    event_graph_id: parts.event_graph_id,
    event_graph_content_hash: parts.event_graph_content_hash,
    subject_id: parts.subject_id,
    timepoint_event_index: parts.timepoint_event_index,
  };

  if (parts.derivation_versions && Object.keys(parts.derivation_versions).length > 0) {
    // Sort keys to ensure deterministic serialization
    const sorted: Record<string, string> = {};
    const sortedKeys = Object.keys(parts.derivation_versions).sort();
    for (const key of sortedKeys) {
      const val = parts.derivation_versions[key];
      if (val !== undefined) {
        sorted[key] = val;
      }
    }
    canonical.derivation_versions = sorted;
  }

  const json = JSON.stringify(canonical);
  const hash = createHash('sha256').update(json).digest('hex');
  return hash.slice(0, 32);
}

/**
 * LRU cache for computed contexts.
 * Uses a Map to preserve insertion order; on get/set, moves accessed items to the tail.
 * Evicts from the head when capacity is exceeded.
 */
export class ContextCache<V = unknown> {
  private cache: Map<string, V>;
  private capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError('ContextCache capacity must be >= 1');
    }
    this.capacity = capacity;
    this.cache = new Map<string, V>();
  }

  /**
   * Get a value from the cache.
   * If present, moves the key to the tail (most recently used).
   */
  get(key: string): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    // Move to tail: delete and re-insert
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set a value in the cache.
   * If the key already exists, updates it and moves to tail.
   * If capacity is exceeded after insertion, evicts the least recently used (head).
   */
  set(key: string, value: V): void {
    // If key exists, remove it first so we can re-insert at tail
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);

    // Evict from head if over capacity
    if (this.cache.size > this.capacity) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  /**
   * Check if a key exists in the cache.
   * Does NOT update LRU order.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Return the number of items currently in the cache.
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
