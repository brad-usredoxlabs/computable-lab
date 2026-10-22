/**
 * Class guard for the bare-__dirname-in-ESM defect class (ESM-DIRNAME-1).
 *
 * server/ is "type": "module" — native ESM has no __dirname. Any production
 * file that references __dirname must first define it in-file via the repo's
 * established shim (`fileURLToPath(import.meta.url)`) or use
 * `import.meta.dirname`. Vitest injects __dirname into transformed modules,
 * so no in-vitest import can catch a missing shim — this guard pins the
 * whole server/src tree at the source level instead.
 *
 * Test files are excluded: they run under vitest's injected __dirname.
 * Comment-only mentions are stripped before the check (prose must not hide a
 * real use, and a real use must not hide behind a comment).
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// This guard lives directly in server/src, so its own directory IS the scan root.
const serverSrc = dirname(fileURLToPath(import.meta.url));

function listNonTestTsFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      found.push(...listNonTestTsFiles(join(dir, entry.name)));
      continue;
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(join(dir, entry.name));
    }
  }
  return found.sort();
}

/**
 * Strip block and line comments so the guard sees code occurrences only.
 *
 * Single left-to-right scanner tracking string/template/regex state: a
 * slash-star and a double-slash open a comment ONLY when seen in CODE state.
 * A slash-star ... star-slash pair that lives inside string or template
 * literals is NOT a comment — regex pre-stripping block comments in isolation
 * let such a phantom pair delete every real line between them and silently
 * hide a bare `__dirname` use (adversarial review ESM-DIRNAME-1 defect 1).
 *
 * Consequences of the scanner (deliberate, conservative):
 * - unterminated block comments are kept verbatim (a real use inside one is
 *   still visible to the detectors; a comment-only mention is comment text);
 * - a stray unterminated quote swallows the rest of its line;
 * - regex literals are recognised only when a `/` in CODE state is preceded
 *   by an operator/punctuation token (division after an identifier or `)`
 *   is not mistaken for a regex), so `/*` inside a regex literal is stripped;
 * - `${ ... }` inside a template literal is CODE state: the scanner recurses
 *   into it up to the balanced `}`, so block/line comments inside a template
 *   EXPRESSION are stripped while the literal spans stay verbatim (a comment
 *   mention inside `${}` must not flag the file).
 */
function stripComments(source: string): string {
  const out: string[] = [];
  scanCode(source, out, { i: 0, prevCode: '' }, false);
  return out.join('');
}

/**
 * CODE-state scanner: appends every kept character to `out`, advancing `st`.
 *
 * When `inTemplateExpr` is true the scan stops at the `}` that closes a
 * template expression (that `}` is kept), tracking brace depth so an object
 * literal inside the expression does not end it early. `scanCode` calls
 * itself for `${ ... }` seen inside a template literal: the expression runs
 * in CODE state, so a `/*` or `//` inside it opens a real comment.
 */
function scanCode(
  source: string,
  out: string[],
  st: { i: number; prevCode: string },
  inTemplateExpr: boolean,
): void {
  let braceDepth = 0;
  while (st.i < source.length) {
    const c = source[st.i];
    const next = st.i + 1 < source.length ? source[st.i + 1] : '';
    if (inTemplateExpr && c === '}' && braceDepth === 0) {
      out.push(c);
      st.i += 1;
      st.prevCode = c;
      return;
    }
    if (c === '{') braceDepth += 1;
    else if (c === '}') braceDepth -= 1;
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', st.i + 2);
      if (end >= 0) {
        st.i = end + 2;
        continue;
      }
      out.push(c);
      st.i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', st.i);
      st.i = end >= 0 ? end : source.length;
      continue;
    }
    if (c === '"' || c === "'") {
      out.push(c);
      st.i += 1;
      while (st.i < source.length) {
        const s = source[st.i];
        if (s === '\\') {
          out.push(s, source[st.i + 1] ?? '');
          st.i += 2;
          continue;
        }
        out.push(s);
        st.i += 1;
        if (s === c || s === '\n') break;
      }
      st.prevCode = c;
      continue;
    }
    if (c === '`') {
      out.push(c);
      st.i += 1;
      while (st.i < source.length) {
        const s = source[st.i];
        if (s === '\\') {
          out.push(s, source[st.i + 1] ?? '');
          st.i += 2;
          continue;
        }
        if (s === '`') {
          out.push(s);
          st.i += 1;
          break;
        }
        if (s === '$' && source[st.i + 1] === '{') {
          out.push(s, '{');
          st.i += 2;
          scanCode(source, out, st, true);
          continue;
        }
        out.push(s);
        st.i += 1;
      }
      st.prevCode = '`';
      continue;
    }
    if (c === '/' && isRegexPosition(st.prevCode) && hasClosingSlash(source, st.i)) {
      out.push(c);
      st.i += 1;
      let inClass = false;
      while (st.i < source.length) {
        const s = source[st.i];
        if (s === '\\') {
          out.push(s, source[st.i + 1] ?? '');
          st.i += 2;
          continue;
        }
        if (s === '\n') break;
        out.push(s);
        st.i += 1;
        if (s === '[') inClass = true;
        else if (s === ']') inClass = false;
        else if (s === '/' && !inClass) break;
      }
      st.prevCode = '/';
      continue;
    }
    out.push(c);
    if (!/\s/.test(c)) st.prevCode = c;
    st.i += 1;
  }
}

/**
 * A `/` in CODE state starts a regex literal only when the previous code
 * token cannot end an expression: after an identifier, number, `)`, `]`,
 * or quote-ish closer it is division.
 */
function isRegexPosition(prevCode: string): boolean {
  if (prevCode === '') return true;
  return !/[A-Za-z0-9_$)\]"'`]/.test(prevCode);
}

/**
 * Lookahead: does the `/` at `start` have a matching unescaped closing `/`
 * on the same line (respecting character classes)? If not, the `/` is not a
 * regex opener and must fall through to plain code handling.
 */
function hasClosingSlash(source: string, start: number): boolean {
  let j = start + 1;
  let inClass = false;
  while (j < source.length) {
    const s = source[j];
    if (s === '\\') {
      j += 2;
      continue;
    }
    if (s === '\n') return false;
    if (s === '[') inClass = true;
    else if (s === ']') inClass = false;
    else if (s === '/' && !inClass) return true;
    j += 1;
  }
  return false;
}

const USES_DIRNAME = /\b__dirname\b/;
const HAS_SHIM = /fileURLToPath\(\s*import\.meta\.url\s*\)/;
const HAS_IMPORT_META_DIRNAME = /import\.meta\.dirname/;
/**
 * `__dirname` is only safe when it is actually BOUND in the file: a
 * `__dirname =` assignment (the shim) or a destructured `import.meta.dirname`
 * binding. HAS_SHIM alone is necessary but NOT sufficient — a file may call
 * fileURLToPath(import.meta.url) for another purpose while `__dirname` stays
 * undefined and the ReferenceError survives a GREEN guard (adversarial review
 * ESM-DIRNAME-1 defect 2).
 */
const HAS_DIRNAME_BINDING =
  /__dirname\s*=[^=]|(?:const|let|var)\s*\{[^}]*\b__dirname\b/;
/**
 * `import.meta.dirname ?? __dirname` (runChatbotCompile): the right operand is
 * never evaluated where `import.meta.dirname` exists, so the fallback shape is
 * legal. Any OTHER bare `__dirname` in such a file is not.
 */
const DIRNAME_FALLBACK = /import\.meta\.dirname\s*(?:\?\?|\|\|)\s*__dirname/g;
/**
 * `__dirname` bound DIRECTLY from `import.meta` (node >= 20.11 defines
 * `import.meta.dirname`): the plain `const __dirname = import.meta.dirname`
 * binding or the `const { dirname: __dirname } = import.meta` destructure.
 * Both are shapes the spec names as legal, and both genuinely define
 * `__dirname`, so — exactly like the fileURLToPath shim — every later bare
 * use in the file is legal. Without this arm the guard rejects a legal file
 * whose only binding is the import.meta one (adversarial review
 * ESM-DIRNAME-1 cycle-2 defect 2; the pre-fix guard accepted shape (a)).
 */
const HAS_IMPORT_META_DIRNAME_BINDING =
  /(?:const|let|var)\s+__dirname\s*=\s*import\.meta\.dirname|(?:const|let|var)\s*\{\s*dirname\s*:\s*__dirname\s*\}\s*=\s*import\.meta\b/;

/** Legality rule for a file that uses `__dirname` (stripped code only). */
export function isLegalDirnameUse(code: string): boolean {
  if (HAS_SHIM.test(code) && HAS_DIRNAME_BINDING.test(code)) return true;
  if (HAS_IMPORT_META_DIRNAME_BINDING.test(code)) return true;
  if (HAS_IMPORT_META_DIRNAME.test(code)) {
    const residual = code.replace(DIRNAME_FALLBACK, 'import.meta.dirname');
    return !USES_DIRNAME.test(residual);
  }
  return false;
}

interface DirnameFileReport {
  file: string;
  legal: boolean;
}

function scanServerSrc(): { scanned: number; users: DirnameFileReport[] } {
  const files = listNonTestTsFiles(serverSrc);
  const users: DirnameFileReport[] = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf-8'));
    if (!USES_DIRNAME.test(code)) continue;
    users.push({
      file,
      legal: isLegalDirnameUse(code),
    });
  }
  return { scanned: files.length, users };
}

describe('esmNoBareDirname class guard (server/src)', () => {
  it('scans the whole server/src tree and finds the __dirname users', () => {
    const { scanned, users } = scanServerSrc();
    console.log(`[esmNoBareDirname] scanned ${scanned} non-test .ts files; ${users.length} use __dirname`);

    // The tree is large; a guard that scanned almost nothing would be vacuous.
    expect(scanned).toBeGreaterThan(100);
    expect(users.length).toBeGreaterThan(3);

    const relative = users.map((u) => u.file.slice(serverSrc.length + 1));
    // The three files this item fixed must be present in the scanned set.
    for (const fixed of [
      'extract/prompts/loader.ts',
      'compiler/derive/seedModels.ts',
      'ingestion/extractorLibrary.ts',
    ]) {
      expect(relative).toContain(fixed);
    }
  });

  it('every non-test file that uses __dirname has an in-file ESM shim', () => {
    const { users } = scanServerSrc();
    const illegal = users.filter((u) => !u.legal).map((u) => u.file.slice(serverSrc.length + 1));
    expect(illegal).toEqual([]);
  });
});
