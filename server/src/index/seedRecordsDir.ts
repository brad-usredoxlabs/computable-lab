import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locate records/seed/ relative to the compiled server file. Returns
 * null if the directory does not exist.
 *
 * Walks up from this file until it finds a records/seed directory or
 * reaches the filesystem root. This lets the loader work in both dev
 * (server started from server/) and production (compiled dist/) layouts.
 */
export function resolveSeedRecordsDir(startFrom?: string): string | null {
  const start = startFrom ?? dirname(fileURLToPath(import.meta.url));
  let current = start;
  while (true) {
    const candidate = resolve(current, 'records', 'seed');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(current, '..');
    if (parent === current) return null;
    current = parent;
  }
}
