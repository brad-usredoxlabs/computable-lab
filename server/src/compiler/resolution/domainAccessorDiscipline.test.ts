// @vitest-environment node
/**
 * Ruling c94bd866 §1.2 / acceptance #6 (decisions/COMPBIND-D2-ownership-l2t2410-ruling.md:42-46,
 * :67-69): "No module may call `.toLowerCase()` on a domain slot, and no module outside
 * `scientistIntent/vocabulary.ts` may read `.domain` directly."
 *
 * This test scans production TypeScript in `server/src/compiler/` to enforce the source-scan
 * discipline: every consumer of a declared domain slot routes through `declaredDomains`, and no
 * code outside the owning module lowercases the slot or reads it raw.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const compilerDir = join(__dirname, '..');

function collectTsFiles(dir: string, depth = 0): string[] {
  if (depth > 10) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        results.push(...collectTsFiles(join(dir, entry.name), depth + 1));
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        results.push(join(dir, entry.name));
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

describe('domain-accessor-discipline (ruling c94bd866 §2 item 6)', () => {
  const files = collectTsFiles(compilerDir);

  it('no raw .domain reads outside vocabulary.ts (except the annotated declaredSlot in strategies.ts)', () => {
    const matches: Array<{ file: string; line: number; text: string }> = [];
    for (const filePath of files) {
      const relPath = relative(compilerDir, filePath);
      if (relPath.includes('scientistIntent/vocabulary.ts')) continue;
      const content = readFileSync(filePath, 'utf-8');
      content.split('\n').forEach((line, idx) => {
        // Match `declared.domain` — the slot read that must go through declaredDomains
        if (/\bdeclared\.domain\b/.test(line)) {
          matches.push({ file: relPath, line: idx + 1, text: line.trim() });
        }
      });
    }
    // Exactly one allowed read: the annotated declaredSlot in strategies.ts
    expect(matches.length).toBe(1);
    if (matches.length === 1) {
      expect(matches[0].file).toBe('resolution/strategies.ts');
    }
  });

  it('no domain.toLowerCase() outside vocabulary.ts', () => {
    const matches: Array<{ file: string; line: number; text: string }> = [];
    for (const filePath of files) {
      const relPath = relative(compilerDir, filePath);
      if (relPath.includes('scientistIntent/vocabulary.ts')) continue;
      const content = readFileSync(filePath, 'utf-8');
      content.split('\n').forEach((line, idx) => {
        // Match domain.toLowerCase() or Domain!.toLowerCase() — the casing transform
        // that declaredDomains owns exclusively
        if (/\bdomain\.toLowerCase\(\)/.test(line) || /\bDomain!\.toLowerCase\(\)/.test(line)) {
          matches.push({ file: relPath, line: idx + 1, text: line.trim() });
        }
      });
    }
    expect(matches.length).toBe(0);
  });
});
