/**
 * L2-SUITE-A — the HONESTY-HELPER PARITY PIN (OQ3 ruling: "a pinned parity
 * test (vitest, in server or app per OQ3) feeds both implementations the
 * same fixture shapes and asserts identical verdicts — drift between driver
 * and helper is a defect"; original scope: the FREEFORM acceptance #2
 * shapes (a)-(e), below verbatim).
 *
 * The three implementations fed the SAME fixture rows — eleven in total
 * (the inventory below; (g) is two rows, g1/g2):
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
 * The fixture inventory (eleven rows — FREEFORM acceptance #2 (a)-(e)
 * verbatim, extended by the D-1 ruling's RED-SHAPE (f)-(i) [L2-FREEFORM-1F]
 * and the (j) null anti-ghost pin [fix run 1, advc D5]; (g) is two rows,
 * g1/g2):
 *   (a) events-bearing result (bound labwareId, probe supplies the id set)
 *       → "events-bound";
 *   (b) cards result → "cards";
 *   (c) error result → "honest-failure";
 *   (d) success:true + empty everything → THROWS (the silent
 *       success-with-zero-mountable);
 *   (e) H1's shipped shape — events>0 with an UNBOUND raw-label labwareId
 *       and no cards/error → THROWS ("events-bound" requires every event's
 *       labwareId ∈ deck ids ∪ resolved record ids);
 *   (f) THE D-1 RECEIPT SHAPE (L2-FREEFORM-1F): {success:true,
 *       deckLayout:{platformId, variantId}} (P1 prompt-1's done, field-
 *       for-field from receipts/L2-SUITE-A/20261027T045347Z/prompt-1.json
 *       :6-12) → "action-delivered" — the structural action-delivered arm
 *       (non-null object + non-empty string platformId AND variantId);
 *   (g1) anti-ghost: {deckLayout:{}} → THROWS (an empty-but-present
 *       deckLayout never earns the arm, pre- AND post-arm);
 *   (g2) anti-ghost: {deckLayout:{platformId:'',variantId:''}} → THROWS
 *       (empty ids never earn the arm);
 *   (h) {deckLayout:{platformId:'manual'}} (variantId ABSENT) → THROWS
 *       (the arm requires BOTH ids — the D-1 ruling's RED-SHAPE (h));
 *   (i) error + delivered deckLayout → "honest-failure" (H4: error
 *       outranks the action arm — the defensive-order pin, the D-1 ruling's
 *       RED-SHAPE (i));
 *   (j) {deckLayout:null} → THROWS (the decision's third anti-ghost shape:
 *       an explicit null stays the silent shape — fix run 1, advc D5).
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

/** The eleven fixture rows (a)-(j) (FREEFORM acceptance #2 (a)-(e) verbatim
 *  + the D-1 ruling's (f)-(i), L2-FREEFORM-1F + the (j) null anti-ghost pin,
 *  fix run 1 advc D5; (g) is two rows, g1/g2). Each:
 *  { result, context?, expected: verdict | 'THROW' }. */
const FIXTURES: Array<{
  name: string;
  result: Record<string, unknown>;
  context?: { deckIds?: readonly string[]; resolvedIds?: readonly string[] };
  expected: 'events-bound' | 'cards' | 'honest-failure' | 'action-delivered' | 'THROW';
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
  // (f) THE D-1 RECEIPT SHAPE (L2-FREEFORM-1F): P1 prompt-1's done, field-
  // for-field from receipts/L2-SUITE-A/20261027T045347Z/prompt-1.json :6-12.
  // Pre-arm (the D-1 defect) this threw the silent shape — the pre-arm RED
  // is captured in /home/brad/.hermes/cl/lanes/2/freeform1f-RED-l2t0155.txt.
  // Post-arm the structural action-delivered arm admits the delivery.
  {
    name: '(f) D-1 receipt: deckLayout action {platformId:"manual", variantId:"manual_freeform"}',
    result: {
      success: true,
      deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
    },
    expected: 'action-delivered',
  },
  // (g) the anti-ghost set: an empty-but-present deckLayout never earns the
  // arm — THROWS pre- AND post-arm (both feeds).
  {
    name: '(g1) anti-ghost: deckLayout:{} (empty-but-present)',
    result: { success: true, deckLayout: {} },
    expected: 'THROW',
  },
  {
    name: '(g2) anti-ghost: deckLayout with empty ids {platformId:"", variantId:""}',
    result: { success: true, deckLayout: { platformId: '', variantId: '' } },
    expected: 'THROW',
  },
  // (h) well-formed platformId with variantId ABSENT — the arm requires BOTH
  // ids; this stays the silent shape (D-1 ruling's RED-SHAPE (h)).
  {
    name: '(h) deckLayout with variantId absent {platformId:"manual"}',
    result: { success: true, deckLayout: { platformId: 'manual' } },
    expected: 'THROW',
  },
  // (i) the DEFENSIVE ORDER pin (D-1 ruling's RED-SHAPE (i)): error outranks
  // the action arm — a well-formed deckLayout alongside an error is the
  // honest failure (the emit site makes the two mutually exclusive).
  // uifix2-fix2 D1: the error text is now the plain-language choice wall
  // (the raw validator string is retired — no implementation vocabulary in
  // the scientist channel; the fixture quotes the NEW shape).
  {
    name: '(i) error + delivered deckLayout (H4: error outranks the action arm)',
    result: {
      success: false,
      error: 'I could not tell which Manual layout you want. The Manual deck offers: Single SBS Plate, Manual Technician Mode or Manual Bench (freeform). Name one and I will switch to it.',
      deckLayout: { platformId: 'manual', variantId: 'manual_freeform' },
    },
    expected: 'honest-failure',
  },
  // (j) THE THIRD ANTI-GHOST SHAPE (fix run 1, advc D5): the D-1 decision
  // names `deckLayout: null` among the shapes that "must remain the silent
  // shape and throw" — an explicit null is rejected identically in both
  // feeds (TS: the arm's `deckLayout !== null` guard; python: None is not a
  // dict) and is pinned in all three feeds here.
  {
    name: '(j) anti-ghost: deckLayout:null (explicit null never earns the arm)',
    result: { success: true, deckLayout: null },
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
    // the expected column is the FREEFORM acceptance #2 verdicts (a)-(e)
    // verbatim, extended (L2-FREEFORM-1F) with the D-1 ruling's RED-SHAPE
    // (f)-(i) and the (j) null anti-ghost pin (fix run 1, advc D5): the
    // action-delivered arm is ADDITIVE — the shipped-defect shapes (d)/(e)
    // still THROW.
    expect(verdicts.map((r) => r[0])).toEqual([
      'events-bound',
      'cards',
      'honest-failure',
      'THROW',
      'THROW',
      'action-delivered',
      'THROW',
      'THROW',
      'THROW',
      'honest-failure',
      'THROW',
    ]);
  });
});
