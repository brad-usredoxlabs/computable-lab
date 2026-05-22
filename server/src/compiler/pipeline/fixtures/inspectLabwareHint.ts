/**
 * inspectLabwareHint — worktree harness for the Fix-it coder's `resolve_labware`
 * tool. Runs the fixture labware matcher (the same one fixtures use,
 * buildTestSearchLabwareByHint) for a hint and reports what it resolves to,
 * plus the alias-map record IDs available — so the coder can see WHY a hint
 * resolves to the wrong definition without instrumenting the test harness.
 *
 *   npx tsx server/src/compiler/pipeline/fixtures/inspectLabwareHint.ts --hint "12-well reservoir"
 */
import { buildTestSearchLabwareByHint, TEST_LABWARE_ALIAS_MAP } from './FixtureRunner.js';

function hintArg(): string {
  const idx = process.argv.indexOf('--hint');
  return idx >= 0 ? process.argv[idx + 1] ?? '' : '';
}

async function main(): Promise<void> {
  const hint = hintArg();
  const search = buildTestSearchLabwareByHint();
  const matched = await search(hint);
  // Distinct record IDs the alias map can resolve to (the valid targets).
  const aliasRecordIds = Array.from(new Set(Object.values(TEST_LABWARE_ALIAS_MAP))).sort();
  process.stdout.write(JSON.stringify({ hint, matched, aliasRecordIds }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`inspectLabwareHint failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
