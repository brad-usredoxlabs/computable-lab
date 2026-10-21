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
 * Quote-aware enough not to cut a `//` inside a string literal.
 */
function stripComments(source: string): string {
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines: string[] = [];
  let inTemplate = false;
  for (const line of withoutBlock.split('\n')) {
    let cut = -1;
    let quote: string | null = null;
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (quote !== null) {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === quote) quote = null;
      } else if (inTemplate) {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '`') inTemplate = false;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '`') {
        inTemplate = true;
      } else if (c === '/' && line[i + 1] === '/') {
        cut = i;
        break;
      }
      i += 1;
    }
    lines.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return lines.join('\n');
}

const USES_DIRNAME = /\b__dirname\b/;
const HAS_SHIM = /fileURLToPath\(\s*import\.meta\.url\s*\)/;
const HAS_IMPORT_META_DIRNAME = /import\.meta\.dirname/;

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
      legal: HAS_SHIM.test(code) || HAS_IMPORT_META_DIRNAME.test(code),
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
