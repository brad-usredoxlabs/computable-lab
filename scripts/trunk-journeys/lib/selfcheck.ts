/**
 * trunk-journeys — SELF-CHECK (fail closed).
 *
 * The spec's hard rule: REAL transport only; NO fetch/route interception of
 * the AI HTTP surface anywhere in the harness. Model-layer fakes are allowed
 * ONLY at the model/engine boundary, never at the AI HTTP boundary.
 *
 * This module makes that a MACHINE-CHECKED invariant: the driver scans its OWN
 * source files (the whole harness dir) + the journeys YAML for the banned
 * interception patterns below and FAILS CLOSED (non-zero, before any journey
 * runs) if any appear. The patterns are DATA (this exported list); the scanner
 * is a dumb matcher.
 *
 * The banned path literal is assembled from TWO parts below (not one literal)
 * so the pattern definitions + this documentation never contain a
 * verb-adjacent full path that would self-trigger the scanner — the check
 * targets real interceptor LINES (a route/fetch verb + the quoted path), so
 * prose and the pattern table itself stay clean.
 *
 * A real interceptor names the quoted AI path with a route/fetch VERB on the
 * same line. The patterns match that verb+path shape; a plain mention of the
 * path in prose (no verb, no quoted path) does NOT trip them, so documenting
 * the ban is safe.
 */

/** The banned AI HTTP path prefix, in two parts (see the module note). */
const AI_PATH_A = '/api/ai';
const AI_PATH_B = '';
const AI_PATH = AI_PATH_A + AI_PATH_B;

/** The banned interception patterns (DATA — the scanner applies these verbatim).
 *  Each regex matches a line that INTERCEPTS (a route/fetch verb) the AI HTTP
 *  surface. Legit lines — apiClient calls, the /api/analysis-runs family (a
 *  DIFFERENT, allowed surface), comments — do not trip them. */
export const BANNED_INTERCEPTION_PATTERNS: Array<{ id: string; re: RegExp; why: string }> = [
  {
    // Playwright route: page.route / context.route / browser.route / .route(
    // whose pattern string names the AI path.
    id: 'playwright-route-ai',
    re: new RegExp(`(\\.route\\s*\\(|\\bpage\\.route\\b|\\bcontext\\.route\\b|\\bbrowser\\.route\\b)[^\\n]*['"][^'"]*${AI_PATH}`, 'i'),
    why: 'a Playwright route intercepts the AI HTTP surface (banned)',
  },
  {
    // a route('...AI_PATH...') call whose first arg string names the AI path.
    id: 'route-fn-ai',
    re: new RegExp(`\\broute\\s*\\(\\s*['"][^'"]*${AI_PATH}`, 'i'),
    why: 'a route(...) call targets the AI HTTP surface (banned)',
  },
  {
    // a fetch/axios call whose URL literal is the AI path.
    id: 'fetch-ai',
    re: new RegExp(`\\bfetch\\s*\\(\\s*(?:\`|['"])\\s*[^\\n]*${AI_PATH}`, 'i'),
    why: 'a fetch() call targets the AI HTTP surface (banned)',
  },
  {
    // a declarative route-table entry (prefix/match/pattern/url) set to the AI path.
    id: 'route-table-ai',
    re: new RegExp(`['"]?(route|prefix|match|pattern|url|endpoint)['"]?\\s*[:=]\\s*['"][^'"]*${AI_PATH}`, 'i'),
    why: 'a route-table entry targets the AI HTTP prefix (banned)',
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
    `SELF-CHECK FAILED (fail closed): the harness contains a banned AI-HTTP interception.\n` +
      `REAL transport only — no fetch/route interception of the AI HTTP surface. Remove it and re-run.\n` +
      `${detail}`,
  );
}
