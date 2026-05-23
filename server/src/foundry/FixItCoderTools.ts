import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { runFixtureVerification } from './FixItProgressGate.js';
import type { FoundryToolAgentTool } from './FoundryToolAgent.js';

const execFileAsync = promisify(execFile);

function fmt(value: unknown): string {
  if (value === undefined) return '(absent)';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * `verify` — run the declared regression fixture deterministically and return
 * pass/fail plus, for every still-unsatisfied assertion, the EXPECTED vs ACTUAL
 * value. This is the gate's own check, exposed interactively so the coder sees
 * exactly what's still wrong after an edit instead of writing throwaway debug
 * scripts.
 */
export function makeVerifyTool(repoRoot: string, specId: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'verify',
        description:
          'Run the declared regression fixture and report whether it passes. On failure, '
          + 'lists each unsatisfied expected path with its EXPECTED vs ACTUAL value — use this '
          + 'to see precisely what is still wrong after an edit (do not write debug scripts for this).',
        parameters: { type: 'object', properties: {} },
      },
    },
    handler: async () => {
      const started = Date.now();
      try {
        const verification = await runFixtureVerification(repoRoot, specId);
        const target = verification.target;
        if (!target) {
          return { ok: false, content: 'verify: could not run the fixture (verification harness unavailable)', durationMs: Date.now() - started };
        }
        if (target.passed) {
          return { ok: true, content: 'PASS — every expected fixture path is satisfied. If this is the declared verification, you are done.', durationMs: Date.now() - started };
        }
        const details = target.diffDetails && target.diffDetails.length > 0
          ? target.diffDetails
          : target.missing.map((path) => ({ path, expected: undefined, actual: undefined }));
        const lines = details.map((d) => `- ${d.path}\n    expected: ${fmt(d.expected)}\n    actual:   ${fmt(d.actual)}`);
        const content = `FAIL — ${target.missing.length} unsatisfied path(s):\n${lines.join('\n')}`;
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `verify error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}

const PROBE_HARNESS_REL = 'src/compiler/pipeline/fixtures/probeCompile.ts';

/**
 * `probe` — run the deterministic compile on an ARBITRARY prompt and return
 * its key terminal artifacts. Use this to vary the failing prompt by ONE
 * dimension at a time (single clause vs conjunction; reversed order; modifier
 * present vs absent; verb/preposition swap) and observe which variation flips
 * the symptom — that variation names the pipeline stage that owns the bug.
 */
export function makeProbeTool(repoRoot: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'probe',
        description:
          'Run the deterministic compile on an arbitrary prompt and see what it emits '
          + '(deckLayoutPlan.pinned slots + labwareHints, event count + type histogram). '
          + 'Use probe to isolate variables BEFORE reading code: vary the failing prompt by '
          + 'one dimension (single clause vs conjunction, reversed order, modifier present vs '
          + 'absent, verb/preposition swap) — the variation that flips the symptom locates the bug.',
        parameters: {
          type: 'object',
          properties: { prompt: { type: 'string', description: 'The prompt to compile.' } },
          required: ['prompt'],
        },
      },
    },
    handler: async (args) => {
      const started = Date.now();
      const prompt = typeof args['prompt'] === 'string' ? args['prompt'] : '';
      if (!prompt.trim()) {
        return { ok: false, content: 'error: prompt is required', durationMs: Date.now() - started };
      }
      if (!existsSync(join(repoRoot, 'server', PROBE_HARNESS_REL))) {
        return { ok: false, content: 'probe: harness unavailable', durationMs: Date.now() - started };
      }
      try {
        const { stdout } = await execFileAsync('npx', ['tsx', PROBE_HARNESS_REL, '--prompt', prompt], {
          cwd: join(repoRoot, 'server'),
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
        const parsed = JSON.parse(line) as {
          prompt?: string;
          outcome?: string;
          pinned?: Array<{ slot?: string; labwareHint?: string }>;
          eventCount?: number;
          eventTypes?: Record<string, number>;
        };
        const pinnedLines = (parsed.pinned ?? []).length
          ? (parsed.pinned ?? [])
            .map((p) => `  - slot: ${fmt(p?.slot)}  labwareHint: ${fmt(p?.labwareHint)}`)
            .join('\n')
          : '  (none)';
        const evtTypeBits = Object.entries(parsed.eventTypes ?? {})
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        const evtSummary = parsed.eventCount ? `${parsed.eventCount} (${evtTypeBits})` : '0';
        const content = `PROBE: ${JSON.stringify(prompt)}\n  outcome: ${parsed.outcome ?? '?'}\n  pinned:\n${pinnedLines}\n  events: ${evtSummary}`;
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `probe error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}

const INSPECT_HARNESS_REL = 'src/compiler/pipeline/fixtures/inspectLabwareHint.ts';

/**
 * `resolve_labware` — show how the fixture's labware matcher resolves a hint:
 * the record ID(s) it returns, and the alias-map record IDs available. Lets the
 * coder see WHY a hint resolves to the wrong def (e.g. "12-well reservoir" →
 * generic_1_well_reservoir) without instrumenting the (off-limits) test harness.
 */
export function makeResolveLabwareTool(repoRoot: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'resolve_labware',
        description:
          'Inspect how the fixture labware matcher (searchLabwareByHint) resolves a hint: the '
          + 'record ID(s) it returns and why, plus the available alias-map record IDs. Use this '
          + 'to see why a labware hint resolves to the wrong definition.',
        parameters: {
          type: 'object',
          properties: { hint: { type: 'string', description: 'The labware hint to resolve, e.g. "12-well reservoir"' } },
          required: ['hint'],
        },
      },
    },
    handler: async (args) => {
      const started = Date.now();
      const hint = typeof args['hint'] === 'string' ? args['hint'].trim() : '';
      if (!hint) return { ok: false, content: 'error: hint is required', durationMs: Date.now() - started };
      if (!existsSync(join(repoRoot, 'server', INSPECT_HARNESS_REL))) {
        return { ok: false, content: 'resolve_labware: inspection harness unavailable', durationMs: Date.now() - started };
      }
      try {
        const { stdout } = await execFileAsync('npx', ['tsx', INSPECT_HARNESS_REL, '--hint', hint], {
          cwd: join(repoRoot, 'server'),
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
        const parsed = JSON.parse(line) as {
          hint?: string;
          matched?: Array<{ recordId: string; title: string }>;
          aliasRecordIds?: string[];
        };
        const matched = parsed.matched && parsed.matched.length > 0
          ? parsed.matched.map((m) => m.recordId).join(', ')
          : '(no match)';
        const available = (parsed.aliasRecordIds ?? []).join(', ') || '(none)';
        const content = `searchLabwareByHint(${JSON.stringify(hint)}) → ${matched}\n\nAvailable alias-map record IDs:\n${available}`;
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `resolve_labware error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}
