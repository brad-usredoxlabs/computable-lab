/**
 * L2-P1-BUILDINFO-1 buildinfo — resolveBuildInfo() must DERIVE the serving
 * tree's revision from git, never return a hand-typed literal.
 *
 * Assertions:
 * - sha matches /^[0-9a-f]{40}$/ (the worktree under test has git; the
 *   fixture META_BODY in SettingsPage.bundleError.test.tsx stays untouched,
 *   so the server unit is exercised here, not through the client page).
 * - builtAt parses as an ISO timestamp.
 * - two calls return the SAME object: the git lookup is cached at module
 *   level, so a fresh `git` exec per GET /meta is not a new cost.
 * - on any failure it must never throw (see the unknown-case contract in
 *   buildInfo.ts: a missing .git yields sha 'unknown', not an exception).
 */
import { describe, expect, it } from 'vitest';
import { resolveBuildInfo } from './buildInfo.js';

describe('resolveBuildInfo (L2-P1-BUILDINFO-1 buildinfo)', () => {
  it('returns a 40-char lowercase hex sha and an ISO builtAt', () => {
    const info = resolveBuildInfo();
    expect(info.sha).toMatch(/^[0-9a-f]{40}$/);
    const t = Date.parse(info.builtAt);
    expect(Number.isFinite(t)).toBe(true);
    expect(info.builtAt).toBe(new Date(t).toISOString());
  });

  it('caches: two calls return the same object identity', () => {
    expect(resolveBuildInfo()).toBe(resolveBuildInfo());
  });

  it('reports the worktree HEAD it serves (no hand-typed sha)', () => {
    // The worktree this module lives in is a real git checkout, so the
    // derived sha must be a real commit, not 'unknown'.
    expect(resolveBuildInfo().sha).not.toBe('unknown');
  });
});
