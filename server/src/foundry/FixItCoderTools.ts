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

const INSPECT_EVENTS_HARNESS_REL = 'src/compiler/pipeline/fixtures/inspectEvents.ts';
const INSPECT_EVENTS_MAX_CHARS = 8000;

/**
 * `inspect_events` — dump `terminalArtifacts.events` for a prompt in a
 * scannable shape. List mode gives a per-event summary (position, eventId,
 * event_type, labwareId, t_offset, detail keys); detail mode (position) gives
 * the full event + colocated labStateDelta + resolvedRefs/resolvedLabwareRefs
 * so the coder can cross-reference deps manually.
 *
 * Events in this codebase carry NO explicit dependency edges — ordering is
 * array-position; deps are implicit through labStateDelta + resolved refs.
 * The tool exposes that structure; it does not pretend to emit an adjacency
 * list. Lookup uses position (stable across runs), not eventId (randomised).
 */
export function makeInspectEventsTool(repoRoot: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'inspect_events',
        description:
          'Inspect terminalArtifacts.events for a prompt. Without `position`: per-event '
          + 'summary (position, eventId, event_type, labwareId, t_offset, detail keys). With '
          + '`position`: full event at that index, plus colocated labStateDelta + '
          + 'resolvedLabwareRefs + resolvedRefs so you can cross-reference dependencies '
          + 'manually (events carry no explicit dep edges in this codebase).',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The prompt to compile.' },
            position: {
              type: 'integer',
              description:
                'Optional. Zero-based index into the events array to drill into. Use list '
                + 'mode first to discover positions. Position is stable across runs; eventId is not.',
            },
          },
          required: ['prompt'],
        },
      },
    },
    handler: async (args) => {
      const started = Date.now();
      const prompt = typeof args['prompt'] === 'string' ? args['prompt'] : '';
      const rawPosition = args['position'];
      if (!prompt.trim()) {
        return { ok: false, content: 'error: prompt is required', durationMs: Date.now() - started };
      }
      if (!existsSync(join(repoRoot, 'server', INSPECT_EVENTS_HARNESS_REL))) {
        return { ok: false, content: 'inspect_events: harness unavailable', durationMs: Date.now() - started };
      }
      const harnessArgs = ['tsx', INSPECT_EVENTS_HARNESS_REL, '--prompt', prompt];
      if (typeof rawPosition === 'number' && Number.isInteger(rawPosition)) {
        harnessArgs.push('--position', String(rawPosition));
      } else if (typeof rawPosition === 'string' && rawPosition.trim()) {
        harnessArgs.push('--position', rawPosition.trim());
      }
      try {
        const { stdout } = await execFileAsync('npx', harnessArgs, {
          cwd: join(repoRoot, 'server'),
          timeout: 120_000,
          maxBuffer: 16 * 1024 * 1024,
        });
        const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
        const parsed = JSON.parse(line) as {
          prompt?: string;
          outcome?: string;
          mode?: 'list' | 'detail';
          totalEvents?: number;
          events?: Array<{
            position?: number;
            eventId?: string | null;
            event_type?: string | null;
            labwareId?: string | null;
            t_offset?: string | null;
            detailKeys?: string[];
          }>;
          labStateDeltaPresent?: boolean;
          resolvedLabwareRefsPresent?: boolean;
          resolvedRefsPresent?: boolean;
          position?: number;
          found?: boolean;
          event?: unknown;
          labStateDelta?: unknown;
          resolvedLabwareRefs?: unknown;
          resolvedRefs?: unknown;
          reason?: string;
        };
        if (parsed.mode === 'list') {
          const flags = [
            parsed.labStateDeltaPresent ? 'labStateDelta' : '',
            parsed.resolvedLabwareRefsPresent ? 'resolvedLabwareRefs' : '',
            parsed.resolvedRefsPresent ? 'resolvedRefs' : '',
          ].filter(Boolean).join(', ') || '(none)';
          const lines = (parsed.events ?? []).map((e) => {
            const keys = (e.detailKeys ?? []).join(',');
            return `  #${e.position}  ${e.event_type ?? '?'}${e.labwareId ? `  labware=${e.labwareId}` : ''}${e.t_offset ? `  t=${e.t_offset}` : ''}  details={${keys}}  id=${e.eventId ?? '?'}`;
          }).join('\n') || '  (no events)';
          const content = `inspect_events(${JSON.stringify(prompt)}): ${parsed.totalEvents ?? 0} events (outcome: ${parsed.outcome ?? '?'})\nColocated: ${flags}\n${lines}`;
          return { ok: true, content, durationMs: Date.now() - started };
        }
        // detail mode
        if (parsed.found === false) {
          const content = `inspect_events: position not found.\n${parsed.reason ?? `total events: ${parsed.totalEvents ?? 0}`}`;
          return { ok: true, content, durationMs: Date.now() - started };
        }
        const body = JSON.stringify(
          {
            event: parsed.event,
            labStateDelta: parsed.labStateDelta,
            resolvedLabwareRefs: parsed.resolvedLabwareRefs,
            resolvedRefs: parsed.resolvedRefs,
          },
          null,
          2,
        );
        const clipped = body.length > INSPECT_EVENTS_MAX_CHARS
          ? `${body.slice(0, INSPECT_EVENTS_MAX_CHARS)}\n… [clipped ${body.length - INSPECT_EVENTS_MAX_CHARS} more chars]`
          : body;
        const content = `inspect_events(${JSON.stringify(prompt)}, position=${parsed.position}):\n${clipped}`;
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `inspect_events error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}

const PROBE_PASS_HARNESS_REL = 'src/compiler/pipeline/fixtures/probePass.ts';
const PROBE_PASS_OUTPUT_CHARS = 8000;

/**
 * `probe_pass` — run the deterministic compile on a prompt and return either
 * the list of pipeline pass names (list mode) or one named pass's intermediate
 * output (detail mode). This is what shows the coder WHICH stage of the
 * pipeline owns a diverging field — `probe` shows only the final terminal
 * artifacts.
 */
export function makeProbePassTool(repoRoot: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'probe_pass',
        description:
          'Run the deterministic compile on a prompt and inspect intermediate pipeline state. '
          + 'Without `pass_name`: list every pass that ran (in registration order, as a list of ids). '
          + 'With `pass_name`: dump that pass\'s output as JSON — use this to locate which stage '
          + 'first produces the wrong value (e.g. compare deterministic_precompile vs resolve_labware '
          + 'vs plan_deck_layout) by reading their intermediate outputs.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'The prompt to compile.' },
            pass_name: {
              type: 'string',
              description: 'Optional. Pass id to drill into. Omit to list all passes that ran.',
            },
          },
          required: ['prompt'],
        },
      },
    },
    handler: async (args) => {
      const started = Date.now();
      const prompt = typeof args['prompt'] === 'string' ? args['prompt'] : '';
      const passName = typeof args['pass_name'] === 'string' ? args['pass_name'].trim() : '';
      if (!prompt.trim()) {
        return { ok: false, content: 'error: prompt is required', durationMs: Date.now() - started };
      }
      if (!existsSync(join(repoRoot, 'server', PROBE_PASS_HARNESS_REL))) {
        return { ok: false, content: 'probe_pass: harness unavailable', durationMs: Date.now() - started };
      }
      const harnessArgs = ['tsx', PROBE_PASS_HARNESS_REL, '--prompt', prompt];
      if (passName) harnessArgs.push('--pass', passName);
      try {
        const { stdout } = await execFileAsync('npx', harnessArgs, {
          cwd: join(repoRoot, 'server'),
          timeout: 120_000,
          maxBuffer: 16 * 1024 * 1024,
        });
        const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
        const parsed = JSON.parse(line) as {
          prompt?: string;
          outcome?: string;
          mode?: 'list' | 'detail';
          passNames?: string[];
          passName?: string;
          exists?: boolean;
          output?: unknown;
          availablePassNames?: string[];
        };
        if (parsed.mode === 'list') {
          const lines = (parsed.passNames ?? []).map((n) => `  - ${n}`).join('\n');
          const content = `probe_pass(${JSON.stringify(prompt)}): ${parsed.passNames?.length ?? 0} passes (outcome: ${parsed.outcome ?? '?'})\n${lines}`;
          return { ok: true, content, durationMs: Date.now() - started };
        }
        if (parsed.exists === false) {
          const sample = (parsed.availablePassNames ?? []).slice(0, 30).join(', ');
          const content = `probe_pass: pass ${JSON.stringify(parsed.passName)} did not run for this prompt.\nAvailable: ${sample}${(parsed.availablePassNames?.length ?? 0) > 30 ? ', …' : ''}`;
          return { ok: true, content, durationMs: Date.now() - started };
        }
        const json = JSON.stringify(parsed.output, null, 2);
        const clipped = json.length > PROBE_PASS_OUTPUT_CHARS
          ? `${json.slice(0, PROBE_PASS_OUTPUT_CHARS)}\n… [clipped ${json.length - PROBE_PASS_OUTPUT_CHARS} more chars]`
          : json;
        const content = `probe_pass(${JSON.stringify(prompt)}, pass=${JSON.stringify(parsed.passName)}):\n${clipped}`;
        return { ok: true, content, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `probe_pass error: ${message}`, durationMs: Date.now() - started };
      }
    },
  };
}

const RESOLVE_TERM_HARNESS_REL = 'src/compiler/pipeline/fixtures/resolveTerm.ts';
const RESOLVE_TERM_TABLES = ['labware'] as const;
const RESOLVE_TERM_MAX_CHARS = 4000;

/**
 * `resolve_term` — exercise the actual matcher the compiler/fixture uses to
 * turn a hint into a recordId, for a specific table. Distinct from
 * `inspect_registry` (catalog browse): this runs the matching function so
 * the coder can see whether the bug is in the matcher logic vs the catalog
 * data. Currently supports `labware`; other tables resolve inside compiler
 * passes — use `probe` instead.
 */
export function makeResolveTermTool(repoRoot: string): FoundryToolAgentTool {
  return {
    definition: {
      type: 'function',
      function: {
        name: 'resolve_term',
        description:
          'Run the per-table matcher for a hint and see what recordId(s) it returns. '
          + 'Use this to diagnose bugs where the wrong recordId is chosen (matcher logic) '
          + 'vs the right record is missing (catalog data — check via inspect_registry). '
          + `Supported tables: ${RESOLVE_TERM_TABLES.join(', ')}. For other tables, use \`probe\` with a synthesised prompt.`,
        parameters: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: `Table to resolve against. Supported: ${RESOLVE_TERM_TABLES.join(', ')}.`,
            },
            hint: { type: 'string', description: 'The hint to resolve, e.g. "12-well reservoir".' },
          },
          required: ['table', 'hint'],
        },
      },
    },
    handler: async (args) => {
      const started = Date.now();
      const table = typeof args['table'] === 'string' ? args['table'].trim() : '';
      const hint = typeof args['hint'] === 'string' ? args['hint'].trim() : '';
      if (!table) {
        return { ok: false, content: 'error: table is required', durationMs: Date.now() - started };
      }
      if (!hint) {
        return { ok: false, content: 'error: hint is required', durationMs: Date.now() - started };
      }
      if (!existsSync(join(repoRoot, 'server', RESOLVE_TERM_HARNESS_REL))) {
        return { ok: false, content: 'resolve_term: harness unavailable', durationMs: Date.now() - started };
      }
      try {
        const { stdout } = await execFileAsync(
          'npx',
          ['tsx', RESOLVE_TERM_HARNESS_REL, '--table', table, '--hint', hint],
          { cwd: join(repoRoot, 'server'), timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
        );
        const line = stdout.trim().split('\n').filter(Boolean).at(-1) ?? '{}';
        const parsed = JSON.parse(line) as {
          table?: string;
          hint?: string;
          supported?: boolean;
          supportedTables?: string[];
          alternatives?: string[];
          reason?: string;
          matches?: Array<{ recordId: string; title?: string; inRegistry?: boolean }>;
          aliasRecordIds?: string[];
          aliasNotInRegistry?: string[];
        };
        if (parsed.supported === false) {
          const alts = (parsed.alternatives ?? []).map((a) => `  - ${a}`).join('\n');
          const supp = (parsed.supportedTables ?? []).join(', ');
          const reason = parsed.reason ?? '';
          const content =
            `resolve_term: table ${JSON.stringify(parsed.table)} not supported.\n`
            + `Supported: ${supp}\n${reason ? `Reason: ${reason}\n` : ''}Alternatives:\n${alts}`;
          return { ok: true, content, durationMs: Date.now() - started };
        }
        const matchLines = (parsed.matches ?? []).length
          ? (parsed.matches ?? [])
            .map((m) => {
              const reg = m.inRegistry === undefined ? '' : `  (inRegistry: ${m.inRegistry})`;
              return `  - ${m.recordId}${reg}`;
            })
            .join('\n')
          : '  (no match)';
        const stale = (parsed.aliasNotInRegistry ?? []).length
          ? `\nalias entries NOT in canonical registry (test↔prod divergences):\n  ${(parsed.aliasNotInRegistry ?? []).join(', ')}`
          : '';
        const content =
          `resolve_term(${parsed.table}, ${JSON.stringify(parsed.hint)}):\n`
          + `matches:\n${matchLines}${stale}`;
        const clipped = content.length > RESOLVE_TERM_MAX_CHARS
          ? `${content.slice(0, RESOLVE_TERM_MAX_CHARS)}\n… [clipped ${content.length - RESOLVE_TERM_MAX_CHARS} more chars]`
          : content;
        return { ok: true, content: clipped, durationMs: Date.now() - started };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, content: `resolve_term error: ${message}`, durationMs: Date.now() - started };
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
