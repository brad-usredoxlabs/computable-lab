/**
 * LabStateCache — In-memory LRU cache for LabStateSnapshot persistence
 * across conversation turns.
 *
 * Keyed by `conversationId`, this cache allows the second turn of a chat
 * to automatically inherit the first turn's lab state.
 */

import type { LabStateSnapshot } from './LabState.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface LabStateCache {
  get(key: string): LabStateSnapshot | undefined;
  put(key: string, snapshot: LabStateSnapshot): void;
  size(): number;
}

export interface LabStateCacheOptions {
  maxEntries?: number; // default 50
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createInMemoryLabStateCache(
  opts: LabStateCacheOptions = {},
): LabStateCache {
  const max = opts.maxEntries ?? 50;
  const map = new Map<string, LabStateSnapshot>();

  return {
    get(key) {
      const v = map.get(key);
      if (v !== undefined) {
        // LRU bump: delete then re-insert to move to end
        map.delete(key);
        map.set(key, v);
      }
      return v;
    },
    put(key, snapshot) {
      if (map.has(key)) map.delete(key);
      map.set(key, snapshot);
      while (map.size > max) {
        const first = map.keys().next().value;
        if (first !== undefined) map.delete(first);
      }
    },
    size() {
      return map.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Module-level singleton for convenience
// ---------------------------------------------------------------------------

let defaultCache: LabStateCache | null = null;

export function getDefaultLabStateCache(): LabStateCache {
  if (!defaultCache) defaultCache = createInMemoryLabStateCache();
  return defaultCache;
}
