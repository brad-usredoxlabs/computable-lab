#!/usr/bin/env tsx
/**
 * MIXFRAC-1 bless script (MANIFEST re-bless exactly ONCE, spec §6 bait 3 /
 * §10): loads each golden fixture through the SAME replayKernel the vitest
 * suite uses, writes the __records__/<name>.golden.json from the live replay,
 * and prints the before/after sha256 for every manifest entry the run touches
 * (existing records re-blessed + new fixtures/records blessed).
 *
 * Run: cd <wt>/server && npx tsx scripts/mixfrac-bless.mts [--write]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOLDENS_DIR,
  loadManifest,
  manifestFixturePath,
  manifestHashMismatches,
  recordFromManifest,
  runGolden,
  sha256File,
  loadFixture,
  manifestEntry,
} from '../src/compiler/scientistIntent/goldens/replayKernel.js';

const write = process.argv.includes('--write');
const manifest = loadManifest();

// name -> fixture path + record path (relative to goldens/). Existing entries
// are re-blessed; the three MIXFRAC-1 entries are blessed for the first time.
const targets = [
  {
    name: 'golden.intent-to-clarification.unresolvable-mixture-component',
    fixture: 'fixtures/unresolvable-mixture-component.yaml',
    record: '__records__/unresolvable-mixture-component.golden.json',
  },
  {
    name: 'golden.intent-to-clarification.mixfrac-canonical-ambiguous',
    fixture: 'fixtures/mixfrac-canonical-ambiguous.yaml',
    record: '__records__/mixfrac-canonical-ambiguous.golden.json',
  },
  {
    name: 'golden.intent-to-graph.mixfrac-canonical-flat',
    fixture: 'fixtures/mixfrac-canonical-flat.yaml',
    record: '__records__/mixfrac-canonical-flat.golden.json',
  },
  {
    name: 'golden.intent-to-graph.mixfrac-final-volume',
    fixture: 'fixtures/mixfrac-final-volume.yaml',
    record: '__records__/mixfrac-final-volume.golden.json',
  },
  {
    name: 'golden.intent-to-clarification.mixfrac-on-top',
    fixture: 'fixtures/mixfrac-on-top.yaml',
    record: '__records__/mixfrac-on-top.golden.json',
  },
] as const;

console.log('manifest hash mismatches BEFORE bless:');
try {
  for (const m of manifestHashMismatches(manifest)) console.log('  ' + m);
} catch (error) {
  // A blessed record that does not exist on disk yet (a first bless) is not a
  // mismatch — the manifest entry is the promise, the record is its product.
  console.log('  (pre-check skipped: ' + String(error) + ')');
}

for (const target of targets) {
  const name = target.name;
  const fixturePath = join(GOLDENS_DIR, target.fixture);
  const recordPath = join(GOLDENS_DIR, target.record);
  const fixtureBefore = sha256File(fixturePath);
  const recordBefore = existsSync(recordPath) ? sha256File(recordPath) : '(absent)';

  const fixture = loadFixture(fixturePath);
  const run = await runGolden(fixture);
  const body = JSON.parse(JSON.stringify(run.normalized)) as Record<string, unknown>;
  const serialized = JSON.stringify({ status: run.status, body });
  if (write) writeFileSync(recordPath, serialized);
  const recordAfter = existsSync(recordPath) ? sha256File(recordPath) : '(not yet written — dry run)';

  console.log(`\n${name}`);
  console.log(`  fixture  ${fixturePath}`);
  console.log(`    sha256 ${fixtureBefore}`);
  console.log(`  record   ${recordPath}`);
  console.log(`    before ${recordBefore}`);
  console.log(`    after  ${recordAfter}`);
  console.log(`  status   ${run.status}`);
  console.log(`  clarifications ${JSON.stringify((body['clarifications'] as unknown[] | undefined) ?? null)?.slice(0, 4000)}`);
  const events = (body['terminalArtifacts'] as Record<string, unknown> | undefined)?.['events'];
  if (Array.isArray(events)) {
    console.log(`  events ${events.length}`);
    console.log(`  first-event details ${JSON.stringify((events[0] as Record<string, unknown>)?.['details'])?.slice(0, 3000)}`);
  }
}
