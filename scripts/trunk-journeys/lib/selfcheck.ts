/**
 * trunk-journeys — SELF-CHECK (fail closed).
 *
 * The spec's hard rule: REAL transport only; NO fetch/route interception of
 * /api/ai/** anywhere in the harness. Model-layer fakes are allowed ONLY at
 * the model/engine boundary, never at the /api/ai/** HTTP boundary.
 *
 * This module makes that a MACHINE-CHECKED invariant: the driver scans its OWN
 * source files (the whole harness dir) + the journeys YAML for the banned
 * interception patterns below and FAILS CLOSED (non-zero, before any journey
 * runs) if any appear. The patterns are DATA (this exported list), not code
 * policy — the scanner is a dumb matcher.
 *
 * What counts as "banned interception" (a line that would reroute / fake the
 * /api/ai/** HTTP surface): a Playwright `route(...)`/`page.route(...)`/
 * `context.route(...)` or a fetch/route-table whose pattern matches the
 * /api/ai path. We match the PATTERN STRING (the URL/prefix being intercepted),
 * not the word "route" alone, so legitimate `apiClient.getAnalysisRun` calls
 * and the `/api/analysis-runs` family (a DIFFERENT, allowed surface) do NOT
 * trip it. The `/api/ai/**` prefix is the ONLY banned surface.
 */

/** The banned interception patterns (DATA — the scanner applies these verbatim).
 *  Each is a regex that matches a line INTERCEPTING (route/fetch/mock table)
 *  the /api/ai/** surface. A plain mention of "/api/ai" in a comment is NOT
 *  banned by itself — the pattern requires an interception verb (route/fetch/
 *  mock/hook) on the same line, so documenting the ban (as this comment does)
 *  never self-triggers. */
export const BANNED_INTERCEPTION_PATTERNS: Array<{ id: string; re: RegExp; why: string }> = [
  {
    id: 'playwright-route-api-ai',
    // page.route / context.route / browser.route / .route( with a /api/ai pattern
    re: /(\.route\s*\(|\bpage\.route\b|\bcontext\.route\b|\bbrowser\.route\b)[^;]*\/api\/ai/i,
    why: 'a Playwright route intercepts the /api/ai/** HTTP surface (banned)',
  },
  {
    id: 'route-fn-api-ai',
    // a route('...') / route(..., handler) call whose first arg string names /api/ai
    re: /\broute\s*\(\s*['"][^'"]*\/api\/ai[^'"]*['"]/i,
    why: 'a route(...) call targets /api/ai/** (banned)',
  },
  {
    id: 'fetch-intercept-api-ai',
    // a fetch/axios/msw-style call or mock whose URL/prefix is /api/ai
    re: /(\bfetch\s*\(|\baxios\.\w+\s*\(|\brest\.\w+\s*\(|\bmsw\b|\bsetupServer\s*\()[^;]*['"][^'"]*\/api\/ai['"]/i,
    why: 'a fetch/mock layer targets /api/ai/** (banned)',
  },
  {
    id: 'route-table-api-ai',
    // a declarative route table entry (YAML/JSON/TS) mapping the /api/ai prefix
    re: /['"]?(route|prefix|match|pattern|url|endpoint)['"]?\s*[:=]\s*['"][^'"]*\/api\/ai[^'"]*['"]/i,
    why: 'a route-table entry targets the /api/ai/** prefix (banned)',
  },
];

export interface ScanFile {
  path: string;
  content: string;
}

export interface Violation {
  file: string;
  line: number;
  patternId: string;
  why: string;
  excerpt: string;
}

/** Scan each file's lines against the banned patterns. Returns all violations. */
export function scanForBannedInterception(files: ScanFile[]): Violation[] {
  const out: Violation[] = [];
  for (const f of files) {
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of BANNED_INTERCEPTION_PATTERNS) {
        if (p.re.test(line)) {
          out.push({
            file: f.path,
            line: i + 1,
            patternId: p.id,
            why: p.why,
            excerpt: line.trim().slice(0, 120),
          });
          break; // one finding per line (the most-specific pattern is enough)
        }
      }
    }
  }
  return out;
}

/** Fail CLOSED: throw a descriptive Error if ANY violation exists. */
export function assertNoBannedInterception(violations: Violation[]): void {
  if (violations.length === 0) return;
  const detail = violations
    .map((v) => `  ${v.file}:${v.line} [${v.patternId}] ${v.why}\n      ${v.excerpt}`)
    .join('\n');
  throw new Error(
    `SELF-CHECK FAILED (fail closed): the harness contains a banned /api/ai/** interception.\n` +
      `REAL transport only — no fetch/route interception of /api/ai/** anywhere. Remove it and re-run.\n` +
      `${detail}`,
  );
}
