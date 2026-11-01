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
 * A real interceptor names the AI path with a route/fetch VERB on the
 * same line. The QUOTED-PATH patterns match that verb + quoted-path shape;
 * a plain prose mention of the path (no verb, no quoted path) does NOT trip
 * THOSE patterns, so documenting the ban in prose is safe FOR THEM. The
 * regex-literal pattern is the exception to that rule: it matches the path
 * written as an UNQUOTED REGEX LITERAL (the most idiomatic bypass — the
 * shape the quoted-path patterns cannot see at all), so a regex literal
 * naming the path DOES trip it, even in a comment. That is why the module
 * doc comments were reworded (13cd40e6) so no prose carries a
 * verb / regex-literal shape naming the path.
 *
 * D10 (adversarial gate 2026-10-31): the original four patterns missed the
 * MOST idiomatic bypass shapes — a regex-literal route target
 * a page.route whose argument is the banned path as a REGEX LITERAL), a
 * split-string fetch (a quoted /api/ part concatenated with a quoted ai
 * part), and axios/node-http callers. The pattern set now
 * covers: quoted path strings, REGEX LITERALS (escaped or bare slashes),
 * split-string assembly (a quoted /api/ part concatenated with a quoted
 * ai part), and every common HTTP client verb (fetch/axios/http(s).request).
 *
 * RESIDUAL LIMIT (documented — line-based scanner): the scanner is
 * line-oriented. Path assembly across LINES, via intermediate variables
 * with no client verb on the same line, or in percent-/unicode-encoded
 * form, is not caught. The residual is why the pattern list is DATA (add a
 * row when a new shape appears) and why the check is a GUARD, not a proof.
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
    // whose pattern string (QUOTED) names the AI path.
    id: 'playwright-route-ai',
    re: new RegExp(`(\\.route\\s*\\(|\\bpage\\.route\\b|\\bcontext\\.route\\b|\\bbrowser\\.route\\b)[^\\n]*['"][^'"]*${AI_PATH}`, 'i'),
    why: 'a Playwright route intercepts the AI HTTP surface (banned)',
  },
  {
    // D10: a route/RegExp argument that is a REGEX LITERAL naming the AI
    // path — the most idiomatic bypass: a page.route whose argument is
    // the banned path written as a REGEX LITERAL (backslash-escaped
    // slashes). The literal fragments: slash, optional backslash-slash,
    // api, optional backslash-slash, ai — so escaped, bare, and
    // unescaped-slash forms all match; the /api/analysis-runs family
    // never does (it is a different, allowed surface).
    id: 'route-regex-literal-ai',
    re: new RegExp(`(?:\\.route\\s*\\(|\\broute\\s*\\(|new\\s+RegExp\\s*\\()\\s*\/(?:\\\\/)?api(?:\\\\/)?ai`, 'i'),
    why: 'a route/RegExp argument is a REGEX LITERAL naming the AI path (banned)',
  },
  {
    // a route('...AI_PATH...') call whose first arg string names the AI path.
    id: 'route-fn-ai',
    re: new RegExp(`\\broute\\s*\\(\\s*['"][^'"]*${AI_PATH}`, 'i'),
    why: 'a route(...) call targets the AI HTTP surface (banned)',
  },
  {
    // a fetch call whose URL literal (quoted or template) is the AI path —
    // anywhere in the call's argument list (a concatenated quoted path
    // counts: the verb + the quoted path are what make an interception).
    id: 'fetch-ai',
    re: new RegExp(`\\bfetch\\s*\\([^\\n]*['"\`][^\\n]*${AI_PATH}`, 'i'),
    why: 'a fetch() call targets the AI HTTP surface (banned)',
  },
  {
    // D10: an axios call whose URL literal is the AI path.
    id: 'axios-ai',
    re: new RegExp(`\\baxios\\.[A-Za-z]+\\s*\\([^\\n]*['"\`][^\\n]*${AI_PATH}`, 'i'),
    why: 'an axios call targets the AI HTTP surface (banned)',
  },
  {
    // D10: a node http(s).request call whose URL/path literal is the AI path.
    id: 'node-http-request-ai',
    re: new RegExp(`\\bhttps?\\.request\\s*\\([^\\n]*['"\`][^\\n]*${AI_PATH}`, 'i'),
    why: 'a node http(s).request call targets the AI HTTP surface (banned)',
  },
  {
    // D10: SPLIT-STRING assembly — an HTTP client verb whose URL is built
    // by concatenating a quoted part ending in /api/ with a quoted part
    // that begins ai (the path is assembled from pieces, never one
    // literal).
    id: 'split-string-ai-verb',
    re: new RegExp(`\\b(?:fetch|axios|got|ky|request)\\b[^\\n]*['"][^'"]*/api/['"]\\s*\\+\\s*['"][^'"]*ai`, 'i'),
    why: 'a split-string URL builds the AI path across quoted parts (banned)',
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
