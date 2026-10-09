#!/usr/bin/env tsx
/**
 * golden-replay.ts — SPINE-6 reproduction command (orch ruling OQ1(a): one
 * assertion home, two runners). Re-runs the six fixture replays + the typed
 * assertions through the SAME pure replayKernel the vitest suite uses, plus
 * the manifest hash self-check, and exits 0/1. Offline, hermetic, no network:
 * the only seams are the canned model adapter and the fixture store (spec §4.1
 * — the parse/vocabulary/pipeline/engine/spine run REAL inside the kernel).
 *
 * This script is what satisfies the manifest's "exit 0 from a clean checkout"
 * clause. NOT collected by vitest (lives under server/scripts/, outside src/).
 *
 * Run: cd <wt>/server && npx tsx scripts/golden-replay.ts
 */
import { join } from 'node:path';
import {
  GOLDENS_DIR,
  classifyCompileResponse,
  countHintEligibleLabeledArgs,
  deepEqualGolden,
  fixtureFromManifest,
  loadManifest,
  lookupAgainstFixtureStore,
  manifestHashMismatches,
  recordFromManifest,
  runGolden,
} from '../src/compiler/scientistIntent/goldens/replayKernel.js';

interface Check { name: string; ok: boolean; detail?: string }

const checks: Check[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, ...(detail ? { detail } : {}) });
}

const manifest = loadManifest();

// Manifest self-check first: pinned rule/fixture/record hashes vs disk.
const mismatches = manifestHashMismatches(manifest);
check('manifest.versions-current', mismatches.length === 0, mismatches.join('\n'));

const graphNames = [
  'golden.intent-to-graph.transfer-read',
  'golden.intent-to-graph.labware-hint-regression',
] as const;
const barNames = [
  'golden.intent-to-clarification.ambiguous-material',
  'golden.intent-to-clarification.unknown-local-term',
  'golden.intent-to-clarification.labware-hint-lookup-failure',
  'golden.intent-to-clarification.model-unresolved-passthrough',
] as const;

for (const name of graphNames) {
  const fixture = fixtureFromManifest(manifest, name);
  const run = await runGolden(fixture);
  const record = recordFromManifest(manifest, name);
  const eq = deepEqualGolden(run, record);
  check(`${name} deep-equal`, eq.ok, eq.diff);
  check(`${name} status 200`, run.status === 200);
  check(`${name} outcome complete`, run.payload['outcome'] === 'complete');
  check(`${name} zero writes`, run.spies.writeCalls === 0);
  if (name === 'golden.intent-to-graph.transfer-read') {
    // Amended fixture-1 clauses (ruling amendment l2t0140): setup invariant +
    // store-spy arithmetic.
    const missA = await lookupAgainstFixtureStore(fixture, 'source plate');
    const missB = await lookupAgainstFixtureStore(fixture, 'destination plate');
    check('transfer-read spine-arm invariant (lookup => [])', missA.length === 0 && missB.length === 0);
    const n = countHintEligibleLabeledArgs(fixture.modelOutput);
    check('transfer-read spy arithmetic == 0', run.spies.labwareListCalls - run.spies.materialListCalls - n === 0,
      `labwareListCalls=${run.spies.labwareListCalls} materialListCalls=${run.spies.materialListCalls} N=${n}`);
  }
  if (name === 'golden.intent-to-graph.labware-hint-regression') {
    check('labware-hint-regression search ran once', run.spies.searchLabwareByHintCalls === 1);
  }
}

for (const name of barNames) {
  const fixture = fixtureFromManifest(manifest, name);
  const run = await runGolden(fixture);
  const record = recordFromManifest(manifest, name);
  const eq = deepEqualGolden(run, record);
  check(`${name} deep-equal`, eq.ok, eq.diff);
  check(`${name} status 422`, run.status === 422);
  const verdict = classifyCompileResponse(run.status, run.payload);
  check(`${name} classified NOT_SUCCESS_CLARIFICATION`, verdict === 'NOT_SUCCESS_CLARIFICATION');
  const ta = run.payload['terminalArtifacts'] as Record<string, unknown>;
  const keys = Object.keys(ta).sort();
  check(`${name} atomic zero-artifact`, JSON.stringify(keys) === JSON.stringify(['directives', 'events', 'gaps', 'protocolIntent'])
    && JSON.stringify(ta['events']) === '[]' && JSON.stringify(ta['gaps']) === '[]');
  check(`${name} zero writes`, run.spies.writeCalls === 0);
}

console.log('SPINE-6 golden replay (offline, hermetic — canned model adapter + fixture store only)');
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `\n      ${c.detail}` : ''}`);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
