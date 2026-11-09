/**
 * L2-SUITE-B — the SEQUENCE-LEG CLASSIFIER PARITY PIN (spec §3: "Implement as
 * a sequence-leg arm ... with its OWN parity-pin vitest file (sequence-leg
 * fixtures: grounded proposal, ungrounded-ref proposal -> forbidden, cards,
 * named wall, generic-failure -> forbidden)").
 *
 * The three encodings fed the SAME nine fixtures (the five spec §3
 * fixtures + the two resume-run notes-channel fixtures + the two
 * missing-surface-family fixtures (h)/(i), orch l2t2015):
 *   1. THE TS CLASSIFIER — .hermes/plans/harness/l2-suite-a/lib/
 *      sequence-leg.ts (classifySequenceLegOutcome — the ONE TS
 *      implementation home for the sequence trichotomy; additive, never
 *      editing FREEFORM's events-shaped assertHonestOutcome — B7);
 *   2. THE NODE CLI — .hermes/plans/harness/l2-suite-a/lib/
 *      sequence-leg-cli.ts (the thin bridge the python driver shells out to,
 *      SUITE-A's OQ3 (ii) ruling shape);
 *   3. THE DRIVER'S PYTHON RE-ENCODE — .hermes/plans/harness/l2-suite-a/
 *      lib/sequence_verdict_cli.py (lib/sequence_verdict.py), the driver's
 *      in-line classifier.
 *
 * The five fixtures (spec §3, verbatim shapes) PLUS one resume-run
 * fixture (f) that locks the classifier fix the live drive exposed:
 *   (a) grounded proposal — a sequenceProposal whose record refs all
 *       resolve in the request's context.records → "proposal";
 *       (its notes are the server's own proposal-turn text, no capability
 *       token — the classifier's nav/proposal arms outrank the notes
 *       scan, so a generic note on a successful turn can never launder);
 *   (b) ungrounded-ref proposal — a record ref NOT in context.records →
 *       FORBIDDEN (B2: the classifier THROWS; a harness that counts any
 *       sequenceProposal-shaped frame as `proposal` without ref-membership
 *       is the forbidden fourth outcome wearing a costume);
 *   (c) cards — clarificationRequests>0, no error → "cards";
 *   (d) named wall — an error that NAMES the missing endpoint
 *       ("Select an endpoint for mafft." — SequenceService.ts:141's own
 *       text class) → "honest-failure";
 *   (e) generic-failure — a generic model-failure line (no capability
 *       naming) → FORBIDDEN (B6: never launder a generic failure into an
 *       honest wall);
 *   (f) NAMED REFUSAL ON THE NOTES CHANNEL (resume-run fix, not spec §3):
 *       the workspace_action compile-rejection arm returns success:true
 *       with NO agent_action frame, NO cards, and the named refusal text
 *       ("Term ... did not resolve to any local term or workspace record.
 *       Nothing was focused..." — compileWorkspaceAction.ts:408) in
 *       notes (AgentOrchestrator.ts:3178-3182: "success:false would ride
 *       the existing error surface and read as an endpoint failure. The
 *       corrective text rides the notes channel"). Spec §3 names "the
 *       focus-guard's named refusal" an honest-failure → "honest-failure".
 *       A GENERIC notes line ("Done." / "Alignment complete.") must
 *       STILL be the forbidden silent shape (B6 stands on the notes
 *       channel too) — the live P9 drive's silent-shape FAIL is what
 *       motivated this fixture.
 *   (h) missing-surface compile refusal (orch l2t2015, live drive
 *       L2SB-195104 P9): success:true + notes + a pipeline_diagnostics
 *       frame carrying UNSUPPORTED_SURFACE's "An open-surface action
 *       requires a `surface`..." — the server's OWN structural-refusal
 *       family, named gap → "honest-failure";
 *   (i) generic prose that merely contains "requires a" without naming a
 *       backticked field or a target → still FORBIDDEN (the (h) token
 *       family must not launder vague prose — B6).
 *
 * The forbidden shapes carry expected='THROW': the classifier's throw
 * contract (nonzero exit on the CLIs, SequenceLegOutcomeError on the TS
 * path). OQ3 (c): the pin asserts the verdict, NEVER model-complement
 * correctness — no revcomp fixture exists and none may be added (B4).
 *
 * Run (cwd=server): npx vitest run src/ai/L2SuiteB.sequenceLeg.parity.test.ts
 * Zero model calls; zero store writes; pure fixture classification.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifySequenceLegOutcome,
  SequenceLegOutcomeError,
} from '../../../.hermes/plans/harness/l2-suite-a/lib/sequence-leg.ts';

const HARNESS_DIR = resolve(process.cwd(), '..', '.hermes', 'plans', 'harness', 'l2-suite-a');
const NODE_CLI = resolve(HARNESS_DIR, 'lib', 'sequence-leg-cli.ts');
const PYTHON_CLI = resolve(HARNESS_DIR, 'lib', 'sequence_verdict_cli.py');

const SEQUENCE_RECORD_IDS = [
  'SEQ-827c4175a52a4ef65916eca5',
  'SEQ-a4836e63051a779c44383e79',
  'SEQ-cb9f816907d51380eaabaec3',
  'SEQSET-2929fc77e3b581682f0b0ab7',
  'SEQEND-mafft-lane2',
  'SEQEND-blastn-lane2',
] as const;
const ENGINE_IDS = ['virtual-pcr', 'mafft', 'blastn'] as const;

/** The five sequence-leg fixtures (a)-(e), verbatim shapes. Each:
 *  { result, frames?, context?, expected: verdict | 'THROW' }. */
const FIXTURES: Array<{
  name: string;
  result: Record<string, unknown>;
  frames?: readonly unknown[];
  context?: { recordIds?: readonly string[]; engineIds?: readonly string[] };
  expected: 'proposal' | 'cards' | 'honest-failure' | 'THROW';
}> = [
  {
    name: '(a) grounded proposal (every record ref in context.records)',
    result: {
      success: true,
      sequenceProposal: {
        operation: 'run_mafft',
        requestId: 'req-p9-16s-001',
        endpointRef: { kind: 'record', type: 'sequence-endpoint', id: 'SEQEND-mafft-lane2' },
        inputs: {
          queries: { kind: 'record', type: 'sequence-collection', id: 'SEQSET-2929fc77e3b581682f0b0ab7' },
        },
        parameters: { strategy: 'auto', maxIterations: 0 },
        label: '16S alignment',
      },
      notes: ['Review the sequence action proposal before applying it.'],
    },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'proposal',
  },
  {
    name: '(b) ungrounded-ref proposal (a ref NOT in context.records → forbidden)',
    result: {
      success: true,
      sequenceProposal: {
        operation: 'run_mafft',
        requestId: 'req-p9-ungrounded',
        endpointRef: { kind: 'record', type: 'sequence-endpoint', id: 'SEQEND-mafft-lane2' },
        inputs: {
          queries: { kind: 'record', type: 'sequence', id: 'SEQ-INVENTED-0001' },
        },
        parameters: { strategy: 'auto', maxIterations: 0 },
        label: '16S alignment',
      },
    },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'THROW',
  },
  {
    name: '(c) cards (answerable clarification, no error)',
    result: {
      success: true,
      clarificationRequests: [
        {
          id: 'unresolved-16s-set',
          kind: 'selection',
          prompt: 'Which sequences are the 16S ones?',
          menuProvider: 'records',
          options: [
            { id: 'SEQ-827c4175a52a4ef65916eca5', label: 'pUC19 probe' },
            { id: 'SEQ-a4836e63051a779c44383e79', label: 'Gate Seq Alpha' },
            { id: 'SEQ-cb9f816907d51380eaabaec3', label: 'Gate Seq Beta' },
          ],
        },
      ],
    },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'cards',
  },
  {
    name: '(d) named wall (the missing-endpoint text class, SequenceService.ts:141)',
    result: { success: false, error: 'Select an endpoint for mafft.' },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'honest-failure',
  },
  {
    name: '(e) generic-failure (a model-failure line, no capability naming → forbidden)',
    result: {
      success: false,
      error:
        'Model returned an empty response (finish_reason=length). Try shortening the document or asking a more specific question.',
    },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'THROW',
  },
  {
    name: '(f) named refusal on the notes channel (compile-rejection arm, success:true → honest-failure)',
    result: {
      success: true,
      notes: [
        'Term "multiple sequence alignment tool" did not resolve to any local term or workspace record. Nothing was focused; name a term the lab already has, or author it as a local term first.',
      ],
    },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'honest-failure',
  },
  {
    name: '(g) generic notes line, no capability naming (success + no deliverable → forbidden)',
    result: {
      success: true,
      notes: ['Done. The alignment was requested.'],
    },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'THROW',
  },
  {
    name: '(h) missing-surface compile refusal on notes + pipeline_diagnostics frame (live drive L2SB-195104 P9 shape → honest-failure)',
    result: {
      success: true,
      notes: [
        'An open-surface action requires a `surface` naming a registered surface id.',
      ],
    },
    frames: [
      {
        type: 'pipeline_diagnostics',
        outcome: 'gap',
        diagnostics: [
          {
            pass_id: 'workspace-action-compile',
            code: 'UNSUPPORTED_SURFACE',
            severity: 'error',
            message: 'An open-surface action requires a `surface` naming a registered surface id.',
          },
        ],
      },
    ],
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'honest-failure',
  },
  {
    name: '(i) generic prose containing "requires a" but naming no backticked field (success + no deliverable → forbidden)',
    result: {
      success: true,
      notes: ['The request requires a little more context before it can run.'],
    },
    context: { recordIds: [...SEQUENCE_RECORD_IDS], engineIds: [...ENGINE_IDS] },
    expected: 'THROW',
  },
];

/** The stdin/stdout CLI contract (both CLIs): the fixture's JSON document on
 *  stdin; the verdict on stdout with exit 0, or nonzero + the classifier's
 *  "NOT an honest outcome" dump on stderr for the two forbidden shapes. */
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
  if (fixture.frames) payload.frames = fixture.frames;
  if (fixture.context) payload.context = fixture.context;
  return JSON.stringify(payload);
}

function tsVerdict(fixture: (typeof FIXTURES)[number]): string {
  try {
    return classifySequenceLegOutcome(fixture.result, fixture.frames, fixture.context);
  } catch (e) {
    if (e instanceof SequenceLegOutcomeError) return 'THROW';
    throw e;
  }
}

describe('L2-SUITE-B sequence-leg parity pin (spec §3: ONE trichotomy, three feeds)', () => {
  for (const fixture of FIXTURES) {
    it(`TS classifier (sequence-leg.ts) classifies ${fixture.name} → ${fixture.expected}`, () => {
      expect(tsVerdict(fixture)).toBe(fixture.expected);
    });

    it(`node CLI (sequence-leg-cli.ts) matches ${fixture.name} → ${fixture.expected}`, async () => {
      const out = await runCliWithStdin(process.execPath, [NODE_CLI], cliPayload(fixture));
      if (fixture.expected === 'THROW') {
        expect(out.code).toBe(1);
        expect(out.stdout.trim()).toBe('');
        // the classifier's delivered-channel dump rides stderr
        expect(out.stderr).toMatch(/NOT an honest outcome/);
      } else {
        expect(out.code).toBe(0);
        expect(out.stdout.trim()).toBe(fixture.expected);
      }
    });

    it(`python re-encode (sequence_verdict_cli.py) matches ${fixture.name} → ${fixture.expected}`, async () => {
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
      // TS classifier
      row.push(tsVerdict(fixture));
      const node = await runCliWithStdin(process.execPath, [NODE_CLI], cliPayload(fixture));
      row.push(node.code === 0 ? node.stdout.trim() : 'THROW');
      const py = await runCliWithStdin('python3', [PYTHON_CLI], cliPayload(fixture));
      row.push(py.code === 0 ? py.stdout.trim() : 'THROW');
      verdicts.push(row);
      expect(row, `fixture ${fixture.name}: feeds disagree: ${row.join(' | ')}`).toEqual([
        row[0],
        row[0],
        row[0],
      ]);
    }
    // the expected column is spec §3's own verdicts, verbatim (plus the
    // two resume-run fixtures (f)/(g) that lock the notes-channel fix and
    // the (h)/(i) missing-surface-family pair, orch l2t2015)
    expect(verdicts.map((r) => r[0])).toEqual([
      'proposal',
      'THROW',
      'cards',
      'honest-failure',
      'THROW',
      'honest-failure',
      'THROW',
      'honest-failure',
      'THROW',
    ]);
  });
});
