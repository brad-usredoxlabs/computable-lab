/**
 * OLS search result caching layer.
 * 
 * Caches search results in localStorage with TTL to reduce API calls
 * and improve UX with faster repeated searches.
 */

import type { OLSSearchResult } from './olsClient'

/**
 * Cache key prefix
 */
const CACHE_KEY_PREFIX = 'ols_cache_'

/**
 * Cache TTL: 7 days in milliseconds
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
}

/**
 * Generate a cache key from search parameters.
 */
export function makeCacheKey(query: string, ontologies: string[]): string {
  const sortedOntologies = [...ontologies].sort().join(',')
  return `${query.toLowerCase()}|${sortedOntologies}`
}

/**
 * Get cached OLS results if available and not expired.
 */
export function getCachedOLSResults(key: string): OLSSearchResult[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key)
    if (!raw) return null
    
    const entry: CacheEntry<OLSSearchResult[]> = JSON.parse(raw)
    
    // Check if expired
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_PREFIX + key)
      return null
    }
    
    if (!Array.isArray(entry.data) || entry.data.length === 0) {
      localStorage.removeItem(CACHE_KEY_PREFIX + key)
      return null
    }

    return entry.data
  } catch {
    // Parse error or storage error
    return null
  }
}

/**
 * Store OLS results in cache.
 */
export function setCachedOLSResults(key: string, data: OLSSearchResult[]): void {
  try {
    if (!Array.isArray(data) || data.length === 0) {
      localStorage.removeItem(CACHE_KEY_PREFIX + key)
      return
    }
    const entry: CacheEntry<OLSSearchResult[]> = {
      data,
      timestamp: Date.now(),
    }
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry))
  } catch {
    // Storage full or disabled - ignore
  }
}

/**
 * Clear all OLS cache entries.
 */
export function clearOLSCache(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch {
    // Storage error - ignore
  }
}

/**
 * Clear expired OLS cache entries.
 */
export function clearExpiredOLSCache(): void {
  try {
    const keysToRemove: string[] = []
    const now = Date.now()
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const raw = localStorage.getItem(key)
          if (raw) {
            const entry: CacheEntry<unknown> = JSON.parse(raw)
            if (now - entry.timestamp > CACHE_TTL_MS) {
              keysToRemove.push(key)
            }
          }
        } catch {
          // Invalid entry - remove it
          keysToRemove.push(key)
        }
      }
    }
    
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch {
    // Storage error - ignore
  }
}

/**
 * Get cache statistics.
 */
export function getOLSCacheStats(): { count: number; totalSize: number } {
  let count = 0
  let totalSize = 0
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        count++
        const value = localStorage.getItem(key)
        if (value) {
          totalSize += key.length + value.length
        }
      }
    }
  } catch {
    // Storage error
  }
  
  return { count, totalSize }
}

/**
 * Single-term label cache for quick lookups.
 * Stores just CURIE -> label mappings.
 */
const LABEL_CACHE_KEY = 'ols_label_cache'
const MAX_LABEL_CACHE_SIZE = 1000

interface LabelCache {
  entries: Record<string, string>
  timestamp: number
}

/**
 * Get a cached label for a CURIE.
 */
export function getCachedLabel(curie: string): string | null {
  try {
    const raw = localStorage.getItem(LABEL_CACHE_KEY)
    if (!raw) return null
    
    const cache: LabelCache = JSON.parse(raw)
    
    // Check if expired
    if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(LABEL_CACHE_KEY)
      return null
    }
    
    return cache.entries[curie] ?? null
  } catch {
    return null
  }
}

/**
 * Store a label for a CURIE.
 */
export function setCachedLabel(curie: string, label: string): void {
  try {
    let cache: LabelCache
    const raw = localStorage.getItem(LABEL_CACHE_KEY)
    
    if (raw) {
      cache = JSON.parse(raw)
      // Check if expired - reset if so
      if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
        cache = { entries: {}, timestamp: Date.now() }
      }
    } else {
      cache = { entries: {}, timestamp: Date.now() }
    }
    
    // Check size limit
    const keys = Object.keys(cache.entries)
    if (keys.length >= MAX_LABEL_CACHE_SIZE) {
      // Remove oldest entries (first 100)
      for (let i = 0; i < 100 && i < keys.length; i++) {
        delete cache.entries[keys[i]]
      }
    }
    
    cache.entries[curie] = label
    localStorage.setItem(LABEL_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Storage error - ignore
  }
}

/**
 * Batch store labels from search results.
 */
export function cacheLabelsFromResults(results: OLSSearchResult[]): void {
  for (const result of results) {
    if (result.obo_id && result.label) {
      setCachedLabel(result.obo_id, result.label)
    }
  }
}
