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

interface DiffDetail {
  path: string;
  expected: unknown;
  actual: unknown;
}

interface FixtureReport {
  name: string;
  passed: boolean;
  missing: string[];
  partial: string[];
  matched: string[];
  /** expected-vs-actual at each missing/partial path (target only). */
  diffDetails?: DiffDetail[];
  error?: string;
}

function targetArg(): string | undefined {
  const idx = process.argv.indexOf('--target');
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

// Resolve a diff path like "terminalArtifacts.deckLayoutPlan.pinned[0].labwareHint"
// against a {outcome, terminalArtifacts} root. Returns undefined if absent.
function valueAtPath(root: unknown, path: string): unknown {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: unknown = root;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[tok];
  }
  return cur;
}

function clip(value: unknown): unknown {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof s === 'string' && s.length > 200) return `${s.slice(0, 200)}…`;
  return value;
}

async function evaluate(fileName: string, withDetails: boolean): Promise<FixtureReport> {
  try {
    const fixture = parseFixture(readFileSync(join(__dirname, fileName), 'utf-8'));
    const result = await runFixture(fixture);
    const diff = diffFixture(result, fixture.expected);
    const report: FixtureReport = {
      name: fixture.name,
      passed: diff.missing.length === 0,
      missing: diff.missing,
      partial: diff.partial,
      matched: diff.matched,
    };
    if (withDetails) {
      const expectedRoot = { outcome: fixture.expected.outcome, terminalArtifacts: fixture.expected.terminalArtifacts };
      const actualRoot = { outcome: result.outcome, terminalArtifacts: result.terminalArtifacts };
      report.diffDetails = [...diff.missing, ...diff.partial].map((path) => ({
        path,
        expected: clip(valueAtPath(expectedRoot, path)),
        actual: clip(valueAtPath(actualRoot, path)),
      }));
    }
    return report;
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
  for (const file of files) reports.push(await evaluate(file, target != null));

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
