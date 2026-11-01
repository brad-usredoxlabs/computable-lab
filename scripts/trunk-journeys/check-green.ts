#!/usr/bin/env tsx
/**
 * trunk-journeys — check-green (the tick's pre-claim read).
 *
 * RED-BLOCKS-CLAIMS: the tick reads the NEWEST journeys-verdict.json under the
 * receipts home BEFORE claiming new work. If the newest verdict is RED, this
 * exits NON-ZERO (the claim is declined); if GREEN, it exits 0. No verdict yet
 * = exit 0 with a note (nothing has run — the claim is not blocked by a red).
 *
 * This is a pure READ of the machine-readable verdict file — it does NOT run
 * the journeys (that is the driver's job). The receipt set's verdict file is
 * the authoritative signal; this is just its one-line consumer.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_RECEIPTS_HOME = '/home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS';

interface Verdict {
  result: 'green' | 'red' | string;
  journeys: Array<{ id: string; result: string; failed_step?: string | null }>;
  generatedAt?: string;
}

function newestVerdictPath(receiptsHome: string): string | null {
  if (!existsSync(receiptsHome)) return null;
  const dirs = readdirSync(receiptsHome, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, mtimeMs: statSync(join(receiptsHome, d.name)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const candidate = join(receiptsHome, dirs[i].name, 'journeys-verdict.json');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function checkGreen(receiptsHome: string = DEFAULT_RECEIPTS_HOME): { code: number; message: string } {
  const path = newestVerdictPath(receiptsHome);
  if (!path) {
    return { code: 0, message: 'check-green: no journeys-verdict.json yet under ' + receiptsHome + ' — nothing red, claim not blocked' };
  }
  let verdict: Verdict;
  try {
    verdict = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { code: 2, message: `check-green: could not parse ${path}: ${e instanceof Error ? e.message : e}` };
  }
  if (verdict.result === 'red') {
    const reds = (verdict.journeys ?? []).filter((j) => j.result === 'red').map((j) => `${j.id}${j.failed_step ? ` (failed step ${j.failed_step})` : ''}`);
    return {
      code: 1,
      message:
        `check-green: RED — latest verdict ${path} is red ${reds.length > 0 ? '(' + reds.join(', ') + ')' : ''}. ` +
        'Ready set is empty; new claims are DECLINED until the red journey is fixed and re-run green.',
    };
  }
  if (verdict.result === 'green') {
    return { code: 0, message: `check-green: GREEN — latest verdict ${path} is green (${(verdict.journeys ?? []).length} journeys)` };
  }
  return { code: 2, message: `check-green: unrecognized verdict result '${verdict.result}' at ${path}` };
}

function main(): number {
  const argReceipts = process.argv[2] ?? DEFAULT_RECEIPTS_HOME;
  const { code, message } = checkGreen(argReceipts);
  console.log(message);
  return code;
}

function isMain(): boolean {
  // Must be exact-entry, not suffix-guess: any import of this module (e.g. the
  // unit tests importing checkGreen) runs with argv[1] set and must NOT
  // self-execute the gate. (D6: the suite cannot even import checkGreen while
  // the suffix test fires.)
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(`file://${resolve(entry)}`).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exit(main());
}
