/**
 * Build identity for the SERVING tree (L2-P1-BUILDINFO-1 buildinfo).
 *
 * `resolveBuildInfo()` derives the revision of the tree that actually serves
 * from git at process start: `git rev-parse HEAD` executed against the repo
 * root this module lives in (derived from `import.meta.url`, not
 * `process.cwd()`). The result is cached in a module-level variable so a GET
 * per /meta does not pay a fresh git exec each time.
 *
 * Contract: on ANY failure (missing git, not a checkout, timeout) it returns
 * `{ sha: 'unknown', builtAt: <ISO now> }` and never throws — /meta must
 * still answer 200. Identity is derived, never a hand-typed literal.
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Shape of the build identity surfaced under /meta `build`. */
export interface BuildInfo {
  /** 40-char hex sha of the serving tree's HEAD, or 'unknown' if unresolvable. */
  sha: string;
  /** ISO timestamp of when the revision was resolved at process start. */
  builtAt: string;
}

/**
 * Repo root containing this module: server/src/api/handlers -> four levels up
 * is the git worktree root (where the serving tree's .git lives). Derived,
 * not assumed from process.cwd().
 */
const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..',
);

/** Bound the git call: short timeout, small buffer (HEAD sha is 40 bytes). */
const GIT_TIMEOUT_MS = 2000;
const GIT_MAX_BUFFER = 4096;

let cached: BuildInfo | null = null;

function resolveFromGit(): BuildInfo {
  const out = execSync('git rev-parse HEAD', {
    cwd: REPO_ROOT,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).trim();
  const sha = out.split('\n')[0] ?? '';
  return {
    sha: /^[0-9a-f]{40}$/.test(sha) ? sha : 'unknown',
    builtAt: new Date().toISOString(),
  };
}

/**
 * Resolve the serving tree's revision, cached for the process lifetime.
 * Never throws: on any failure returns `{ sha: 'unknown', builtAt: <now> }`.
 */
export function resolveBuildInfo(): BuildInfo {
  if (cached) return cached;
  try {
    cached = resolveFromGit();
  } catch {
    cached = { sha: 'unknown', builtAt: new Date().toISOString() };
  }
  return cached;
}
