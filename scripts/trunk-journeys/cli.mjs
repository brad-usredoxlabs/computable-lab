/**
 * trunk-journeys — CLI shared helper (plain ESM .mjs, no TS).
 *
 * The thin `node ...mjs` shims delegate to the TS entry via `npx tsx` (which
 * resolves the .ts entry + its .ts imports). This keeps the literal entry
 * points (`node run-trunk-journeys.mjs --help`, `node check-green.mjs`)
 * working with bare node while the driver itself stays TypeScript.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const HERE = dirname(fileURLToPath(import.meta.url));

/** Delegate to a TS entry via tsx, inheriting stdio. Returns the exit code. */
export function runTs(entryTs, argv) {
  try {
    execFileSync('npx', ['tsx', entryTs, ...argv], { stdio: 'inherit', cwd: HERE });
    return 0;
  } catch (e) {
    return typeof e.status === 'number' ? e.status : 2;
  }
}
