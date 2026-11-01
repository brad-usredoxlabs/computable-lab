#!/usr/bin/env node
/**
 * trunk-journeys — check-green (the tick's pre-claim read), BARE NODE ESM.
 *
 * RED-BLOCKS-CLAIMS, FAIL CLOSED. Mirror of check-green.ts (keep in sync):
 * the NEWEST receipt dir is AUTHORITATIVE — newest dir without a parseable
 * journeys-verdict.json -> code 3 (fail closed; do NOT walk back to an older
 * green). Green verdicts must cover the FULL declared journey set
 * (declaredJourneys) and record isolation ok — a partial/scoped green ->
 * code 4; isolation:'violated' -> code 5; red -> code 1; corrupt -> 2; no
 * receipt dirs at all -> code 0 (explicit permissive policy).
 *
 *   node check-green.mjs [receiptsHome]
 *   receiptsHome default: /home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_RECEIPTS_HOME = '/home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS';

/** The NEWEST receipt dir (by mtime) — or null when no run dirs exist. */
function newestRunDir(receiptsHome) {
  if (!existsSync(receiptsHome)) return null;
  const dirs = readdirSync(receiptsHome, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, mtimeMs: statSync(join(receiptsHome, d.name)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  return dirs.length > 0 ? join(receiptsHome, dirs[dirs.length - 1].name) : null;
}

/** Full declared scope covered: declared set == recorded set, all green.
 *  O-A (FIX RUN 2): no declaredJourneys -> UNKNOWN scope -> fail closed
 *  (block); the old mirror returned true for legacy verdicts. */
function fullScopeCovered(v) {
  const declared = v.declaredJourneys;
  const results = v.journeys ?? [];
  const resultIds = new Set(results.map((j) => j.id));
  if (results.length === 0) return false;
  if (declared === undefined || declared.length === 0) return false; // O-A: no declared scope -> unknown -> fail closed
  for (const id of declared) if (!resultIds.has(id)) return false;
  if (results.length !== declared.length) return false;
  return results.every((j) => j.result === 'green');
}

export function checkGreen(receiptsHome = DEFAULT_RECEIPTS_HOME) {
  const newestDir = newestRunDir(receiptsHome);
  if (newestDir === null) {
    return { code: 0, message: `check-green: no receipt dirs under ${receiptsHome} — nothing has run (explicit permissive policy: claim not blocked)` };
  }
  const path = join(newestDir, 'journeys-verdict.json');
  if (!existsSync(path)) {
    return { code: 3, message: `check-green: UNKNOWN — the NEWEST receipt dir ${newestDir} has no journeys-verdict.json (a run died before writing its verdict). Fail-closed: claims are BLOCKED until a complete run writes a verdict.` };
  }
  let verdict;
  try {
    verdict = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { code: 2, message: `check-green: could not parse ${path}: ${e instanceof Error ? e.message : e}` };
  }
  if (verdict.isolation === 'violated') {
    return { code: 5, message: `check-green: ISOLATION VIOLATED — verdict ${path} records isolation:'violated' (the live-dir digest proof failed). Fail-closed: claims are BLOCKED.` };
  }
  if (verdict.result === 'red') {
    const reds = (verdict.journeys ?? []).filter((j) => j.result === 'red').map((j) => `${j.id}${j.failed_step ? ` (failed step ${j.failed_step})` : ''}`);
    return {
      code: 1,
      message: `check-green: RED — latest verdict ${path} is red${reds.length ? ` (${reds.join(', ')})` : ''}. Ready set is empty; new claims are DECLINED until the red journey is fixed and re-run green.`,
    };
  }
  if (verdict.result === 'green') {
    if (!fullScopeCovered(verdict)) {
      const declared = verdict.declaredJourneys ?? [];
      const have = (verdict.journeys ?? []).map((j) => `${j.id}=${j.result}`).join(', ');
      return { code: 4, message: `check-green: PARTIAL — latest verdict ${path} is green only for ${have} of the declared set [${declared.join(', ')}]. A scoped run does not gate the full set; claims are BLOCKED until the full declared set runs green.` };
    }
    // O-A: fullScopeCovered===true implies declaredJourneys present + full
    // coverage + all green, so the "full declared set" claim is accurate.
    return { code: 0, message: `check-green: GREEN — latest verdict ${path} is green (${(verdict.journeys ?? []).length} journeys; the full declared set [${(verdict.declaredJourneys ?? []).join(', ')}] is covered and every journey is green; isolation ok)` };
  }
  return { code: 2, message: `check-green: unrecognized verdict result '${verdict.result}' at ${path}` };
}

const argReceipts = process.argv[2] ?? DEFAULT_RECEIPTS_HOME;
const { code, message } = checkGreen(argReceipts);
console.log(message);
process.exit(code);
