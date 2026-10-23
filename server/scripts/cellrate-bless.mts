#!/usr/bin/env tsx
/**
 * CELLRATE-1 bless script (MANIFEST re-bless exactly ONCE, spec §6 bait 3):
 * blesses the NEW golden fixture + record (cells-rate-per-volume) through the
 * SAME replayKernel the vitest suite uses, and prints the before/after sha256
 * for the ONE deliberate treeState re-bless (the wire-schema pin — the wire
 * schema genuinely changed per §5.1) plus the new fixture/record entries.
 *
 * Run: cd <wt>/server && npx tsx scripts/cellrate-bless.mts [--write]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOLDENS_DIR,
  loadManifest,
  manifestHashMismatches,
  runGolden,
  sha256File,
  loadFixture,
} from '../src/compiler/scientistIntent/goldens/replayKernel.js';
import { writeFileSync } from 'node:fs';

const write = process.argv.includes('--write');
const manifest = loadManifest();

console.log('manifest hash mismatches BEFORE bless:');
try {
  for (const m of manifestHashMismatches(manifest)) console.log('  ' + m);
} catch (error) {
  // A blessed record that does not exist on disk yet (a first bless) is not a
  // mismatch — the manifest entry is the promise, the record is its product.
  console.log('  (pre-check skipped: ' + String(error) + ')');
}

const targets = [
  {
    name: 'golden.intent-to-graph.cells-rate-per-volume',
    fixture: 'fixtures/cells-rate-per-volume.yaml',
    record: '__records__/cells-rate-per-volume.golden.json',
  },
] as const;

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
  const events = (body['terminalArtifacts'] as Record<string, unknown> | undefined)?.['events'];
  if (Array.isArray(events)) {
    console.log(`  events ${events.length}`);
    for (const e of events) {
      const details = (e as Record<string, unknown>)?.['details'];
      console.log(`  event details ${JSON.stringify(details)}`);
    }
  }
  // THE WALL pin at the golden plane: the serialized record must not carry the
  // computed total.
  console.log(`  WALL: serialized record contains "20000"? ${serialized.includes('20000')}`);
}

// The ONE treeState pin this item moves: the wire schema. Print before/after.
const wirePath = join(GOLDENS_DIR, '..', '..', '..', '..', 'schema', 'workflow', 'scientist-intent.schema.yaml');
console.log('\ntreeState pin (wire schema):');
console.log(`  manifest ${manifest.treeState.find((t) => t.path.includes('scientist-intent.schema.yaml'))?.sha256}`);
console.log(`  actual   ${sha256File(wirePath)}`);
