import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** One fixture's pass/fail in the deterministic suite. */
export interface SuiteFixtureResult {
  name: string;
  passed: boolean;
}

/** Structural result for the target fixture. */
export interface TargetFixtureResult {
  name: string;
  passed: boolean;
  /** Expected terminalArtifacts paths still unsatisfied (lower = closer). */
  missing: string[];
  partial: string[];
  matched: string[];
}

/** A point-in-time verification of the worktree against the fix-it fixtures. */
export interface FixtureVerification {
  target: TargetFixtureResult | null;
  suite: SuiteFixtureResult[];
}

export type ProgressVerdict = 'pass' | 'progress' | 'stuck';

const HARNESS_REL = 'src/compiler/pipeline/fixtures/runFixtureDiff.ts';
const VERIFY_TIMEOUT_MS = 240_000;

/**
 * Run the deterministic fix-it fixtures in `repoRoot` (a worktree) and return
 * the target's structural diff plus the whole suite's pass/fail. Used to take
 * a baseline before a coder round and to measure the patch afterward.
 */
export async function runFixtureVerification(repoRoot: string, specId: string): Promise<FixtureVerification> {
  const { stdout } = await execFileAsync('npx', ['tsx', HARNESS_REL, '--target', specId], {
    cwd: join(repoRoot, 'server'),
    timeout: VERIFY_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  // The harness prints one JSON line; ignore any preceding noise.
  const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
  const parsed = JSON.parse(line) as {
    targetReport?: TargetFixtureResult | null;
    suite?: SuiteFixtureResult[];
  };
  return {
    target: parsed.targetReport ?? null,
    suite: parsed.suite ?? [],
  };
}

/**
 * Decide whether a patch is landable, given the verification before the round
 * (`baseline`) and after the patch (`post`):
 *
 *   - PASS     — the target fixture fully passes (no missing expected paths).
 *   - PROGRESS — target still fails, BUT it satisfies strictly more expected
 *     paths than before, introduces no NEW miss in the target, and regresses
 *     no previously-passing fixture in the suite. Safe to commit and re-run.
 *   - STUCK    — a regression, or no measurable forward progress.
 *
 * The no-regression guarantee (suite + within-target) is what makes committing
 * partial progress safe: a landed round can never make things worse.
 */
export function evaluateProgress(baseline: FixtureVerification, post: FixtureVerification): ProgressVerdict {
  const target = post.target;
  if (!target) return 'stuck';
  if (target.passed && target.missing.length === 0) return 'pass';

  // Suite regression: any fixture green at baseline that is now red.
  const baselinePassing = new Set(baseline.suite.filter((f) => f.passed).map((f) => f.name));
  for (const f of post.suite) {
    if (f.name !== target.name && baselinePassing.has(f.name) && !f.passed) return 'stuck';
  }

  // Within-target regression: a path now missing that wasn't before.
  const baselineMissing = new Set(baseline.target?.missing ?? []);
  // If we have no baseline target, treat all current misses as pre-existing.
  const hadBaselineTarget = baseline.target != null;
  if (hadBaselineTarget) {
    for (const path of target.missing) {
      if (!baselineMissing.has(path)) return 'stuck';
    }
    // Strict forward progress: fewer missing expected paths than before.
    if (target.missing.length < baselineMissing.size) return 'progress';
    return 'stuck';
  }

  // No baseline target to compare against (shouldn't happen — the driver writes
  // the fixture before baseline) — only treat a full pass as landable.
  return 'stuck';
}
