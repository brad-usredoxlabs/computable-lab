/**
 * L2-SUITE-A — the HONESTY-HELPER PARITY PIN (OQ3 ruling: "a pinned parity
 * test (vitest, in server or app per OQ3) feeds both implementations the same
 * five fixture shapes (FREEFORM acceptance #2 (a)-(e)) and asserts identical
 * verdicts — drift between driver and helper is a defect").
 *
 * The three implementations fed the SAME five fixtures:
 *   1. THE COMMITTED TS HELPER — server/src/ai/honestOutcome.ts
 *      (L2-FREEFORM-1's assertHonestOutcome / classifyHonestOutcome),
 *      in-process import (the source of truth; SUITE-A consumes, never
 *      re-implements — spec acceptance #2: "do not let SUITE-A
 *      re-implement it");
 *   2. THE NODE CLI — .hermes/plans/harness/l2-suite-a/lib/honest-cli.ts
 *      (the thin bridge the python driver shells out to; OQ3 (ii) — ONE
 *      implementation, no drift surface);
 *   3. THE DRIVER'S PYTHON RE-ENCODE — .hermes/plans/harness/l2-suite-a/
 *      lib/verdict-cli.py (lib/verdict.py), re-encoded structurally for the
 *      driver's in-line use.
 *
 * The five fixtures (FREEFORM acceptance #2, verbatim shapes):
 *   (a) events-bearing result (bound labwareId, probe supplies the id set)
 *       → "events-bound";
 *   (b) cards result → "cards";
 *   (c) error result → "honest-failure";
 *   (d) success:true + empty everything → THROWS (the silent
 *       success-with-zero-mountable);
 *   (e) H1's shipped shape — events>0 with an UNBOUND raw-label labwareId
 *       and no cards/error → THROWS ("events-bound" requires every event's
 *       labwareId ∈ deck ids ∪ resolved record ids).
 *
 * Run (cwd=server): npx vitest run src/ai/L2SuiteA.honestOutcome.parity.test.ts
 * Zero model calls; zero store writes; pure fixture classification.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertHonestOutcome, classifyHonestOutcome } from './honestOutcome.js';

const HARNESS_DIR = resolve(process.cwd(), '..', '.hermes', 'plans', 'harness', 'l2-suite-a');
const NODE_CLI = resolve(HARNESS_DIR, 'lib', 'honest-cli.ts');
const PYTHON_CLI = resolve(HARNESS_DIR, 'lib', 'verdict-cli.py');

/** The five FREEFORM acceptance #2 fixture shapes (a)-(e), verbatim.
 *  Each: { result, context?, expected: verdict | 'THROW' }. */
const FIXTURES: Array<{
  name: string;
  result: Record<string, unknown>;
  context?: { deckIds?: readonly string[]; resolvedIds?: readonly string[] };
  expected: 'events-bound' | 'cards' | 'honest-failure' | 'THROW';
}> = [
  {
    name: '(a) events-bearing result (bound labwareId)',
    result: {
      success: true,
      events: [{ labwareId: 'LAB-plate-1', event_type: 'add_material', details: { well: 'A1' } }],
    },
    context: { deckIds: ['LAB-plate-1'], resolvedIds: [] },
    expected: 'events-bound',
  },
  {
    name: '(b) cards result',
    result: {
      success: true,
      clarificationRequests: [{ id: 'unresolved-1', prompt: 'Which plate?', options: [] }],
    },
    expected: 'cards',
  },
  {
    name: '(c) error result',
    result: { success: false, error: 'the wall names itself' },
    expected: 'honest-failure',
  },
  {
    name: '(d) success:true + empty everything (the silent shape)',
    result: { success: true, events: [] },
    expected: 'THROW',
  },
  {
    name: '(e) H1 shipped shape: events>0 with an UNBOUND raw-label labwareId',
    result: {
      success: true,
      events: [{ labwareId: 'plate1', event_type: 'add_material', details: { well: 'A1' } }],
    },
    context: { deckIds: ['LAB-plate-1'], resolvedIds: ['MAT-dmem-1'] },
    expected: 'THROW',
  },
];

/** The stdin/stdout CLI contract (both CLIs): the fixture's JSON document on
 *  stdin; the verdict on stdout with exit 0, or nonzero + the helper's
 *  "NOT an honest outcome" dump on stderr for the two throw shapes. */
function runCliWithStdin(
  executable: string,
  args: string[],
  stdin: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveP) => {
    const child = spawn(executable, args);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      resolveP({ code: 127, stdout, stderr: stderr + String(err) });
    });
    child.on('close', (code) => {
      resolveP({ code: code ?? -1, stdout, stderr });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function cliPayload(fixture: (typeof FIXTURES)[number]): string {
  const payload: Record<string, unknown> = { result: fixture.result };
  if (fixture.context) payload.context = fixture.context;
  return JSON.stringify(payload);
}

describe('L2-SUITE-A honest-outcome parity pin (OQ3: ONE trichotomy, three feeds)', () => {
  for (const fixture of FIXTURES) {
    it(`TS helper classifies ${fixture.name} → ${fixture.expected}`, () => {
      let verdict: string | null;
      let threw = false;
      try {
        verdict = classifyHonestOutcome(fixture.result, fixture.context);
      } catch {
        verdict = null;
        threw = true;
      }
      if (fixture.expected === 'THROW') {
        // Both shapes are REJECTED by the helper: (d) the silent shape makes
        // classifyHonestOutcome return null (and assertHonestOutcome throws
        // there); (e) the unbound raw-label shape makes classifyHonestOutcome
        // THROW in its own events loop (the H1 fail-loud contract). Assert the
        // GATE contract either way: no verdict + assert-throw.
        expect(verdict).toBeNull();
        expect(() => assertHonestOutcome(fixture.result, fixture.context)).toThrow();
      } else {
        expect(threw).toBe(false);
        expect(verdict).toBe(fixture.expected);
      }
    });

    it(`node CLI (honest-cli.ts) matches ${fixture.name} → ${fixture.expected}`, async () => {
      const out = await runCliWithStdin(process.execPath, [NODE_CLI], cliPayload(fixture));
      if (fixture.expected === 'THROW') {
        expect(out.code).toBe(1);
        expect(out.stdout.trim()).toBe('');
        // the helper's delivered-channel dump rides stderr
        expect(out.stderr).toMatch(/NOT an honest outcome/);
      } else {
        expect(out.code).toBe(0);
        expect(out.stdout.trim()).toBe(fixture.expected);
      }
    });

    it(`python re-encode (verdict-cli.py) matches ${fixture.name} → ${fixture.expected}`, async () => {
      const out = await runCliWithStdin('python3', [PYTHON_CLI], cliPayload(fixture));
      if (fixture.expected === 'THROW') {
        expect(out.code).toBe(1);
        expect(out.stdout.trim()).toBe('');
        expect(out.stderr).toMatch(/NOT an honest outcome/);
      } else {
        expect(out.code).toBe(0);
        expect(out.stdout.trim()).toBe(fixture.expected);
      }
    });
  }

  it('drift guard: all three feeds agree on every fixture verdict', async () => {
    const verdicts: string[][] = [];
    for (const fixture of FIXTURES) {
      const row: string[] = [];
      // TS helper
      try {
        const v = classifyHonestOutcome(fixture.result, fixture.context);
        row.push(v === null ? 'THROW' : v);
      } catch {
        row.push('THROW');
      }
      const node = await runCliWithStdin(process.execPath, [NODE_CLI], cliPayload(fixture));
      row.push(node.code === 0 ? node.stdout.trim() : 'THROW');
      const py = await runCliWithStdin('python3', [PYTHON_CLI], cliPayload(fixture));
      row.push(py.code === 0 ? py.stdout.trim() : 'THROW');
      verdicts.push(row);
      expect(row, `fixture ${fixture.name}: feeds disagree: ${row.join(' | ')}`).toEqual(
        [row[0], row[0], row[0]],
      );
    }
    // the expected column is the FREEFORM acceptance #2 verdicts, verbatim
    expect(verdicts.map((r) => r[0])).toEqual([
      'events-bound',
      'cards',
      'honest-failure',
      'THROW',
      'THROW',
    ]);
  });
});
