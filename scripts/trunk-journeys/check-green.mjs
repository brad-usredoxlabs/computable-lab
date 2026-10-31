#!/usr/bin/env node
/**
 * trunk-journeys — check-green (the tick's pre-claim read), BARE NODE ESM.
 *
 * RED-BLOCKS-CLAIMS: the tick reads the NEWEST journeys-verdict.json under the
 * receipts home BEFORE claiming new work. Newest verdict RED -> exit NON-ZERO
 * (claim declined); GREEN -> exit 0. No verdict yet -> exit 0 (nothing has run;
 * not blocked by a red). This is a pure READ of the machine-readable verdict
 * file — it does NOT run the journeys (that is the driver's job).
 *
 *   node check-green.mjs [receiptsHome]
 *   receiptsHome default: /home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_RECEIPTS_HOME = '/home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS';

function newestVerdictPath(receiptsHome) {
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

export function checkGreen(receiptsHome = DEFAULT_RECEIPTS_HOME) {
  const path = newestVerdictPath(receiptsHome);
  if (!path) {
    return { code: 0, message: `check-green: no journeys-verdict.json yet under ${receiptsHome} — nothing red, claim not blocked` };
  }
  let verdict;
  try {
    verdict = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { code: 2, message: `check-green: could not parse ${path}: ${e instanceof Error ? e.message : e}` };
  }
  if (verdict.result === 'red') {
    const reds = (verdict.journeys ?? []).filter((j) => j.result === 'red').map((j) => `${j.id}${j.failed_step ? ` (failed step ${j.failed_step})` : ''}`);
    return {
      code: 1,
      message: `check-green: RED — latest verdict ${path} is red${reds.length ? ` (${reds.join(', ')})` : ''}. Ready set is empty; new claims are DECLINED until the red journey is fixed and re-run green.`,
    };
  }
  if (verdict.result === 'green') {
    return { code: 0, message: `check-green: GREEN — latest verdict ${path} is green (${(verdict.journeys ?? []).length} journeys)` };
  }
  return { code: 2, message: `check-green: unrecognized verdict result '${verdict.result}' at ${path}` };
}

const argReceipts = process.argv[2] ?? DEFAULT_RECEIPTS_HOME;
const { code, message } = checkGreen(argReceipts);
console.log(message);
process.exit(code);
