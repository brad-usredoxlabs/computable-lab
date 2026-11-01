#!/usr/bin/env tsx
/**
 * trunk-journeys — check-green (the tick's pre-claim read).
 *
 * RED-BLOCKS-CLAIMS, FAIL CLOSED. The tick reads the receipts home BEFORE
 * claiming new work. Policy (adversarial gate D1/D7/D2 — 2026-10-31 fix run):
 *
 *   - The NEWEST receipt dir is AUTHORITATIVE. If it lacks a parseable
 *     journeys-verdict.json (a run that died mid-flight — spawn failure,
 *     SIGTERM, crash before the verdict write), check-green does NOT walk
 *     back to an older green: that would unblock claims on a dead run.
 *     -> code 3 (distinct blocking code).
 *   - A verdict's `result` must be 'green' AND its run scope complete:
 *     `declaredJourneys` (the journey set the run declared it would cover)
 *     must be covered by the recorded journey results. A partial run
 *     (`--only J1` over the declared J1+J2 set) is a scoped run: it gates
 *     its OWN scope (all-green over the scoped set) but does NOT gate the
 *     full set -> code 4 (blocks claims on the full set).
 *   - An `isolation: 'violated'` flag (the driver sets it when the live-dir
 *     digest proof fails) blocks regardless of journey results -> code 5.
 *   - `result: 'red'` -> code 1 (claims DECLINED).
 *   - `result: 'green'` + full scope + isolation ok -> code 0.
 *   - No receipt dirs at all -> code 0 (EXPLICIT permissive policy: nothing
 *     has ever run, so nothing red can block a claim).
 *   - Corrupt/unparseable newest verdict -> code 2 (fail closed).
 *
 * This is a pure READ of the machine-readable verdict file — it does NOT run
 * the journeys (that is the driver's job).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DEFAULT_RECEIPTS_HOME = '/home/brad/.hermes/cl/receipts/L1-TRUNK-JOURNEYS';

interface VerdictJourney {
  id: string;
  result: string;
  failed_step?: string | null;
}

interface Verdict {
  result: 'green' | 'red' | string;
  journeys: VerdictJourney[];
  /** The journey set this run declared it would cover (the scope). */
  declaredJourneys?: string[];
  /** Driver's isolation proof verdict: 'ok' | 'violated' (absent = legacy run, not a violation). */
  isolation?: 'ok' | 'violated' | string;
  generatedAt?: string;
}

/** The NEWEST receipt dir (by mtime) — or null when no run dirs exist. */
function newestRunDir(receiptsHome: string): string | null {
  if (!existsSync(receiptsHome)) return null;
  const dirs = readdirSync(receiptsHome, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, mtimeMs: statSync(join(receiptsHome, d.name)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  return dirs.length > 0 ? join(receiptsHome, dirs[dirs.length - 1].name) : null;
}

/**
 * Does the verdict cover the full declared journey set? The run's declared
 * scope (declaredJourneys) must equal the set of recorded journey results,
 * and every recorded result must be green.
 *
 * O-A (FIX RUN 2): a verdict that recorded NO declaredJourneys has an UNKNOWN
 * declared scope — we cannot confirm the full set was covered, so fail CLOSED
 * (block). The old code returned true for legacy verdicts unconditionally, so
 * a pre-fix `--only J1` green ("{result:green, journeys:[J1]}", no
 * declaredJourneys) exited 0 and the message wrongly claimed "full declared
 * set". The no-run-dirs case is a SEPARATE path (newestRunDir === null ->
 * code 0) and stays permissive — this predicate is only reached when a run
 * dir + verdict exist.
 */
function fullScopeCovered(v: Verdict): boolean {
  const declared = v.declaredJourneys;
  const results = v.journeys ?? [];
  const resultIds = new Set(results.map((j) => j.id));
  if (results.length === 0) return false;
  // O-A: no declared scope recorded -> unknown scope -> fail closed (block).
  if (declared === undefined || declared.length === 0) return false;
  // The recorded set must cover EXACTLY the declared scope (no missing, no
  // extras) and be all green.
  for (const id of declared) if (!resultIds.has(id)) return false;
  if (results.length !== declared.length) return false;
  return results.every((j) => j.result === 'green');
}

export function checkGreen(receiptsHome: string = DEFAULT_RECEIPTS_HOME): { code: number; message: string } {
  const newestDir = newestRunDir(receiptsHome);
  if (newestDir === null) {
    return { code: 0, message: `check-green: no receipt dirs under ${receiptsHome} — nothing has run (explicit permissive policy: claim not blocked)` };
  }
  const path = join(newestDir, 'journeys-verdict.json');
  if (!existsSync(path)) {
    return {
      code: 3,
      message: `check-green: UNKNOWN — the NEWEST receipt dir ${newestDir} has no journeys-verdict.json (a run died before writing its verdict). Fail-closed: claims are BLOCKED until a complete run writes a verdict.`,
    };
  }
  let verdict: Verdict;
  try {
    verdict = JSON.parse(readFileSync(path, 'utf8')) as Verdict;
  } catch (e) {
    return { code: 2, message: `check-green: could not parse ${path}: ${e instanceof Error ? e.message : e}` };
  }
  if (verdict.isolation === 'violated') {
    return {
      code: 5,
      message: `check-green: ISOLATION VIOLATED — verdict ${path} records isolation:'violated' (the live-dir digest proof failed). Fail-closed: claims are BLOCKED.`,
    };
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
    if (!fullScopeCovered(verdict)) {
      const declared = verdict.declaredJourneys ?? [];
      const have = (verdict.journeys ?? []).map((j) => `${j.id}=${j.result}`).join(', ');
      return {
        code: 4,
        message: `check-green: PARTIAL — latest verdict ${path} is green only for ${have} of the declared set [${declared.join(', ')}]. A scoped run does not gate the full set; claims are BLOCKED until the full declared set runs green.`,
      };
    }
    // fullScopeCovered===true here implies declaredJourneys is present AND the
    // recorded set covers it exactly AND every journey is green (O-A), so the
    // "full declared set" claim is now accurate (the old wording fired on the
    // legacy no-declaredJourneys path too — that path now blocks).
    return { code: 0, message: `check-green: GREEN — latest verdict ${path} is green (${(verdict.journeys ?? []).length} journeys; the full declared set [${(verdict.declaredJourneys ?? []).join(', ')}] is covered and every journey is green; isolation ok)` };
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
