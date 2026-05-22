/**
 * runFixtureDiff — worktree verification harness for the Fix-it round loop.
 *
 * Runs the deterministic fix-it fixtures in THIS checkout and reports, as JSON
 * on stdout:
 *   - the target fixture's structural diff (matched / partial / missing paths)
 *     so the driver can measure PARTIAL progress on a multi-bug prompt, and
 *   - a pass/fail line for every spec-fix-*.yaml so the driver can detect
 *     regressions (a previously-green fixture going red).
 *
 * A fixture "passes" when diffFixture reports no missing expected paths
 * (mirrors FixItFixtures.test.ts). Run from the worktree:
 *   npx tsx server/src/compiler/pipeline/fixtures/runFixtureDiff.ts --target <specId>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { diffFixture } from './FixtureDiff.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_FIX_PATTERN = /^spec-fix-.+\.yaml$/;

interface FixtureReport {
  name: string;
  passed: boolean;
  missing: string[];
  partial: string[];
  matched: string[];
  error?: string;
}

function targetArg(): string | undefined {
  const idx = process.argv.indexOf('--target');
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function evaluate(fileName: string): Promise<FixtureReport> {
  try {
    const fixture = parseFixture(readFileSync(join(__dirname, fileName), 'utf-8'));
    const result = await runFixture(fixture);
    const diff = diffFixture(result, fixture.expected);
    return {
      name: fixture.name,
      passed: diff.missing.length === 0,
      missing: diff.missing,
      partial: diff.partial,
      matched: diff.matched,
    };
  } catch (err) {
    // A fixture that throws is treated as failing, not a harness crash, so one
    // bad fixture can't sink the whole no-regression report.
    return {
      name: fileName.replace(/\.yaml$/, ''),
      passed: false,
      missing: [],
      partial: [],
      matched: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const target = targetArg();
  const files = readdirSync(__dirname).filter((f) => SPEC_FIX_PATTERN.test(f)).sort();
  const reports: FixtureReport[] = [];
  for (const file of files) reports.push(await evaluate(file));

  const targetReport = target ? reports.find((r) => r.name === target) ?? null : null;
  process.stdout.write(
    JSON.stringify({
      target,
      targetReport,
      suite: reports.map((r) => ({ name: r.name, passed: r.passed })),
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`runFixtureDiff failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
