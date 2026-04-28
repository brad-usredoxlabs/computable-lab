/**
 * Timeout tests for EditorSuggestionService — fetchWithTimeout helper
 * and provider isolation on slow upstreams.
 *
 * Covers:
 *   - fetchWithTimeout resolves a fast (sub-100ms) mock cleanly
 *   - fetchWithTimeout aborts a slow mock with AbortError
 *   - resolveOntology with slow stubbed fetch returns [] (isolation)
 *   - resolveVendorSearch with slow stubbed fetch returns [] (isolation)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SuggestionItem } from './EditorSuggestionService';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a mock Response that resolves immediately with empty JSON.
 */
function mockFastResponse(): Response {
  return new Response(JSON.stringify({}), { status: 200 });
}

/**
 * Create a mock fetch that respects AbortController signal.
 * Returns a promise that never resolves (simulates a hanging request).
 */
function mockSlowFetch(): (url: string, init?: RequestInit) => Promise<Response> {
  return (url: string, init?: RequestInit) => {
    return new Promise((_, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          const error = new DOMException('The operation was aborted.', 'AbortError');
          reject(error);
        }, { once: true });
      }
      // Never resolves — simulates a hanging request
    });
  };
}

// ============================================================================
// Tests — fetchWithTimeout (fast + slow)
// ============================================================================

describe('fetchWithTimeout — fast fetch resolves', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a fast (sub-100ms) mock cleanly', async () => {
    const { fetchWithTimeout } = await import('./EditorSuggestionService');

    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFastResponse()));

    const result = await fetchWithTimeout('http://example/x', {}, 2000);
    expect(result.status).toBe(200);

    vi.stubGlobal('fetch', originalFetch);
  });
});

describe('fetchWithTimeout — slow fetch aborts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects with an AbortError when the mock is slow', async () => {
    const { fetchWithTimeout } = await import('./EditorSuggestionService');

    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(mockSlowFetch()));

    await expect(fetchWithTimeout('http://example/x', {}, 200)).rejects.toThrow(
      /aborted/i
    );

    vi.stubGlobal('fetch', originalFetch);
  });
});

// ============================================================================
// Tests — resolveOntology with slow upstream
// ============================================================================

describe('resolveOntology — slow upstream returns empty', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns [] and does NOT throw when fetch hangs', async () => {
    const { resolveOntology } = await import('./EditorSuggestionService');

    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(mockSlowFetch()));

    const result = await resolveOntology('foo', 5);
    expect(result).toEqual([]);

    vi.stubGlobal('fetch', originalFetch);
  });
});

// ============================================================================
// Tests — resolveVendorSearch with slow upstream
// ============================================================================

describe('resolveVendorSearch — slow upstream returns empty', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns [] and does NOT throw when fetch hangs', async () => {
    const { resolveVendorSearch } = await import('./EditorSuggestionService');

    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(mockSlowFetch()));

    const result = await resolveVendorSearch('bar', 5);
    expect(result).toEqual([]);

    vi.stubGlobal('fetch', originalFetch);
  });
});
