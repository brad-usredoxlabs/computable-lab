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
const PROBE_FIELD_CHARS = 1500;
const PROBE_TOTAL_CHARS = 12_000;

function describeField(value: unknown): string {
  if (value === undefined) return '(absent)';
  if (value === null) return '(null)';
  if (Array.isArray(value)) return value.length === 0 ? '(empty)' : `${value.length} item(s)`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    return keys.length === 0 ? '(empty object)' : `object, ${keys.length} key(s)`;
  }
  return typeof value;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [clipped ${text.length - max} more chars]`;
}

function renderField(name: string, value: unknown): string {
  const header = `=== ${name} — ${describeField(value)} ===`;
  if (value === undefined || value === null) return header;
  const json = JSON.stringify(value, null, 2);
  return `${header}\n${clip(json, PROBE_FIELD_CHARS)}`;
}

/**
 * `probe` — run the deterministic compile on an ARBITRARY prompt and return
 * the top-level TerminalArtifacts fields most useful for debugging compiler
 * bugs. Use this to vary the failing prompt by ONE dimension at a time
 * (single clause vs conjunction; reversed order; modifier present vs absent;
 * verb/preposition swap) — the variation that flips a field's value names the
 * pipeline stage that owns the bug.
 */
export function makeProbeTool(repoRoot: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'probe',
        description:
          'Run the deterministic compile on an arbitrary prompt and dump the resulting '
          + 'TerminalArtifacts fields as labelled JSON blocks (events, gaps, deckLayoutPlan, '
          + 'labStateDelta, resolvedRefs, resolvedLabwareRefs, resourceManifest, executionScalePlan, '
          + 'deterministicProtocolPlan, protocolIntent, validationReport). Use probe to isolate '
          + 'variables BEFORE reading code: vary the failing prompt along one dimension and watch '
          + 'which field changes. Pass `fields` to narrow output to a specific subset; pass '
          + '["all"] to include every supported field.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The prompt to compile.' },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional. TerminalArtifacts top-level field names to include (e.g. ["events","deckLayoutPlan"]). '
                + 'Omit for the default set of fix-it-relevant fields. Use ["all"] for every supported field.',
            },
          },
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
      const fieldsArg = Array.isArray(args['fields'])
        ? (args['fields'] as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      const harnessArgs = ['tsx', PROBE_HARNESS_REL, '--prompt', prompt];
      if (fieldsArg.length > 0) harnessArgs.push('--fields', fieldsArg.join(','));
      try {
        const { stdout } = await execFileAsync('npx', harnessArgs, {
          cwd: join(repoRoot, 'server'),
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
        const parsed = JSON.parse(line) as {
          prompt?: string;
          outcome?: string;
          fields?: string[];
          data?: Record<string, unknown>;
        };
        const blocks: string[] = [];
        blocks.push(`PROBE: ${JSON.stringify(prompt)}\n  outcome: ${parsed.outcome ?? '?'}`);
        const fields = parsed.fields ?? [];
        const data = parsed.data ?? {};
        for (const f of fields) blocks.push(renderField(f, data[f]));
        const content = clip(blocks.join('\n\n'), PROBE_TOTAL_CHARS);
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `probe error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}

const INSPECT_REGISTRY_HARNESS_REL = 'src/compiler/pipeline/fixtures/inspectRegistry.ts';
const INSPECT_REGISTRY_LIST_CHARS = 8000;
const INSPECT_REGISTRY_RECORD_CHARS = 6000;
const INSPECT_REGISTRY_NAMES = [
  'assay-definitions',
  'assay-specs',
  'compound-classes',
  'curated-vendors',
  'execution-scale-profiles',
  'instruments',
  'issue-card-templates',
  'labware-definitions',
  'measurement-panels',
  'ontology-terms',
  'pipette-capabilities',
  'prompt-templates',
  'protocol-specs',
  'readout-definitions',
  'stamp-patterns',
] as const;

/**
 * `inspect_registry` — uniform inspector for any loadable foundry registry.
 *
 * Without a key: lists every record's id + label, so the coder can see what
 * exists for a noun class (labware, ontology terms, compound classes, etc.)
 * before grepping seed files by hand.
 *
 * With a key: dumps the full record so the coder can read its fields directly.
 *
 * Replaces the older labware-only resolve_labware; for "what does THIS hint
 * resolve to in the lookup table" (search semantics rather than catalog
 * contents), use `resolve_term` once it's wired.
 */
export function makeInspectRegistryTool(repoRoot: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'inspect_registry',
        description:
          'Inspect a foundry registry. Without `key`: list every record (id + label). '
          + 'With `key`: dump the full record. Use this to see what records EXIST for a '
          + 'noun class — labware, ontology terms, compound classes, execution-scale profiles, '
          + 'assays, etc. — and to read any record\'s fields directly. '
          + `Available registries: ${INSPECT_REGISTRY_NAMES.join(', ')}.`,
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              enum: [...INSPECT_REGISTRY_NAMES],
              description: 'Registry to inspect.',
            },
            key: {
              type: 'string',
              description: 'Optional. Record id (recordId or id) to drill into. Omit to list all records.',
            },
          },
          required: ['name'],
        },
      },
    },
    handler: async (args) => {
      const started = Date.now();
      const name = typeof args['name'] === 'string' ? args['name'].trim() : '';
      const key = typeof args['key'] === 'string' ? args['key'].trim() : '';
      if (!name) {
        return { ok: false, content: 'error: name is required', durationMs: Date.now() - started };
      }
      if (!existsSync(join(repoRoot, 'server', INSPECT_REGISTRY_HARNESS_REL))) {
        return { ok: false, content: 'inspect_registry: harness unavailable', durationMs: Date.now() - started };
      }
      const harnessArgs = ['tsx', INSPECT_REGISTRY_HARNESS_REL, '--name', name];
      if (key) harnessArgs.push('--key', key);
      try {
        const { stdout } = await execFileAsync('npx', harnessArgs, {
          cwd: join(repoRoot, 'server'),
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        });
        const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
        const parsed = JSON.parse(line) as {
          error?: string;
          available?: string[];
          registry?: string;
          totalEntries?: number;
          entries?: Array<{ id?: string; label?: string }>;
          found?: boolean;
          key?: string;
          record?: unknown;
          sampleIds?: string[];
        };
        if (parsed.error) {
          const avail = (parsed.available ?? []).join(', ');
          return { ok: false, content: `${parsed.error}\navailable: ${avail}`, durationMs: Date.now() - started };
        }
        if (parsed.key !== undefined && parsed.found === false) {
          const sample = (parsed.sampleIds ?? []).join(', ');
          const content = `inspect_registry(${parsed.registry}, key=${JSON.stringify(parsed.key)}): not found (${parsed.totalEntries ?? '?'} total entries).\nSample ids: ${sample || '(none)'}`;
          return { ok: true, content, durationMs: Date.now() - started };
        }
        if (parsed.found === true) {
          const json = JSON.stringify(parsed.record, null, 2);
          const clipped = json.length > INSPECT_REGISTRY_RECORD_CHARS
            ? `${json.slice(0, INSPECT_REGISTRY_RECORD_CHARS)}\n… [clipped ${json.length - INSPECT_REGISTRY_RECORD_CHARS} more chars]`
            : json;
          const content = `inspect_registry(${parsed.registry}, key=${JSON.stringify(parsed.key)}):\n${clipped}`;
          return { ok: true, content, durationMs: Date.now() - started };
        }
        // List mode
        const entries = parsed.entries ?? [];
        const lines = entries.map((e) => {
          const id = fmt(e?.id);
          const label = e?.label ? ` — ${e.label}` : '';
          return `  - ${id}${label}`;
        });
        let body = lines.join('\n');
        let suffix = '';
        if (body.length > INSPECT_REGISTRY_LIST_CHARS) {
          body = body.slice(0, INSPECT_REGISTRY_LIST_CHARS);
          suffix = `\n… [clipped; ${entries.length} total entries — use \`key\` to drill into a specific id]`;
        }
        const content = `inspect_registry(${parsed.registry}): ${parsed.totalEntries ?? entries.length} entries\n${body}${suffix}`;
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `inspect_registry error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}
