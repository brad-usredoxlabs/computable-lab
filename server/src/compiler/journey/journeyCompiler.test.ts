// @vitest-environment node
/**
 * L2-JOURNEY-COMPILER-1 (unit cmanifest, stage 1): RED-first pins for the
 * compile gate. (a) a clean two-step doc: step 1 READY, step 2 NOT_READY on
 * awaiting_producer_output, blocked by step 1's id; (b) a human-in-the-loop
 * step with no input ports is NOT_READY on awaiting_human_completion; (c) a
 * step both input-fed and human carries both reasons in the fixed order;
 * (d) a capability_ref outside the admitted catalogue is relayed VERBATIM
 * under the lint's own rule, with no manifest; (e) the product module names
 * exactly the closed literal and object-key vocabulary, with mutant proofs;
 * (f) an empty descriptor version string is refused under
 * journey_capability_version_missing; (g) RED probe for unit s2inval: a
 * compiled manifest must be able to carry a stage-2 envelope invalidation
 * via recordEnvelopeInvalidation — today the manifest has no way to carry
 * one and the probe fails.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { compileJourneyStructure, recordEnvelopeInvalidation } from './journeyCompiler.js';
import { lintJourneyDocument } from './journeyDocumentLint.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';

const CATALOGUE: CapabilityDescriptor[] = [
  { capability_id: 'transfer', implementation: { handler_kind: 'builtin', handler_ref: 'transfer' }, version: '1.0.0' },
  { capability_id: 'measure', implementation: { handler_kind: 'builtin', handler_ref: 'measure' }, version: '1.0.0' },
];
/** A structurally complete document the shipped journey-document schema accepts. */
function doc(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    journey_id: 'journey-compiler-fixture', revision: 1,
    authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
    request_anchor: { message_id: 'msg-1', verbatim_text: 'move and verify the samples' },
    objective: 'transfer the samples and verify the result',
    completion_contract: ['the transfer record is committed', 'the verification record is committed'],
    parameters: [],
    steps: [],
    alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
    return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
    assumptions: [], unresolved_questions: [], ...overrides,
  };
}
/** One closed vocabulary port, by its $def's required field names. */
function port(name: string): Record<string, unknown> {
  switch (name) {
    case 'StagedDraftReference': return { version: 'v1', draft_id: 'DRAFT-1' };
    default: throw new Error(`unknown port $def ${name}`);
  }
}
// TypeScript/JavaScript reserved words: never object keys in this module's source.
const KEYWORDS = new Set(['undefined', 'true', 'false', 'null', 'this', 'super', 'function', 'return', 'let', 'const', 'var', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'void', 'in', 'of', 'class', 'extends', 'implements', 'interface', 'type', 'import', 'export', 'from', 'default', 'public', 'private', 'readonly', 'static', 'abstract', 'enum', 'as', 'namespace', 'declare', 'keyof', 'infer', 'any', 'unknown', 'never', 'number', 'string', 'boolean', 'object', 'symbol', 'bigint']);
/** Every quoted literal (any quote style) and every unquoted object key (identifier before ':');
 * comments and literal contents are skipped, ternary ':' is excluded via the keyword filter. */
function stringTokens(source: string) {
  const literals: string[] = []; const keys: string[] = [];
  let i = 0; const n = source.length;
  while (i < n) {
    const ch = source.charAt(i); const next = i + 1 < n ? source.charAt(i + 1) : '';
    if (ch === '/' && (next === '/' || next === '*')) {
      const end = next === '/' ? source.indexOf('\n', i) : source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + (next === '/' ? 1 : 2); continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n) { const c = source.charAt(j); if (c === ch) break; j += c === '\\' ? 2 : 1; }
      literals.push(source.slice(i + 1, j)); i = j + 1; continue;
    }
    if (ch === ':') {
      const at = source.charAt(i - 1) === ' ' ? i - 1 : i;
      const token = source.slice(0, at).match(/[A-Za-z0-9_$]+$/)?.[0] ?? '';
      if (token !== '' && !KEYWORDS.has(token)) keys.push(token);
    }
    i += 1;
  }
  return { literals, keys };
}
/** Closed string-literal vocabulary of the product module (any id would be a defect). */
const CLOSED_LITERALS = [
  'READY', 'NOT_READY', 'awaiting_producer_output', 'awaiting_human_completion', 'stale_input',
  'journey_capability_version_missing', 'automatic', 'human_in_the_loop',
  // module wiring and defensive message text, verified by reading the source — not ids:
  './journeyDocumentLint.js', './capabilityCatalogue.js',
  'step ${step.id}: the admitted capability descriptor declares no version string', 'string',
];
/** Closed unquoted-object-key vocabulary of the product module. Unit s2inval adds
 * the declared manifest field invalidations, the function parameter invalidation,
 * and the JourneyEnvelopeInvalidation field message. (JourneyEnvelopeInvalidation
 * and recordEnvelopeInvalidation are type/function identifiers: the extractor scans
 * only string literals and unquoted object keys, and this pin is an exact-set match,
 * so they are declared in the source, not in these lists.) */
const CLOSED_KEYS = [
  'id', 'capability_ref', 'capability_version', 'interaction_mode', 'status', 'reasons',
  'blocked_by', 'journey_id', 'revision', 'steps', 'not_ready', 'ok', 'manifest',
  'diagnostics', 'input_ports', 'output_ports', 'document', 'catalogue', 'rule', 'step_id',
  'blockedBy', 'compiled', 'rawVersion',
  'invalidations', 'invalidation', 'message',
];
/** The same clean two-step fixture the first pin uses: step 1 READY,
 * step 2 NOT_READY awaiting its producer — the shape unit s2inval needs. */
function twoStepPlan() {
  return doc({ steps: [
    { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [port('StagedDraftReference')] },
    { id: 'measure', capability_ref: 'measure', input_ports: [port('StagedDraftReference')], interaction_mode: 'automatic', output_ports: [] },
  ] });
}
/** True when the source names a string literal or object key outside the closed sets. */
function outsideClosedSets(mutant: string): boolean {
  const { literals, keys } = stringTokens(mutant);
  return literals.some((l) => !CLOSED_LITERALS.includes(l)) || keys.some((k) => !CLOSED_KEYS.includes(k));
}

describe('compileJourneyStructure', () => {
  it('compiles a clean two-step doc: first step READY, second NOT_READY awaiting the producer', () => {
    const plan = doc({ steps: [
      { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [port('StagedDraftReference')] },
      { id: 'measure', capability_ref: 'measure', input_ports: [port('StagedDraftReference')], interaction_mode: 'automatic', output_ports: [] },
    ] });
    expect(lintJourneyDocument(plan, CATALOGUE).ok).toBe(true); // the fixture really is clean, not a vacuous pass
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('gate unexpectedly failed');
    expect(result.manifest.journey_id).toBe('journey-compiler-fixture');
    expect(result.manifest.revision).toBe(1);
    expect(result.manifest.steps[0]!.status).toBe('READY');
    expect(result.manifest.steps[0]!.reasons).toEqual([]);
    expect(result.manifest.steps[0]!.blocked_by).toEqual([]);
    expect(result.manifest.steps[1]!.status).toBe('NOT_READY');
    expect(result.manifest.steps[1]!.reasons).toEqual(['awaiting_producer_output']);
    expect(result.manifest.steps[1]!.blocked_by).toEqual(['transfer']);
    expect(result.manifest.not_ready).toEqual(['measure']);
    // Status and reasons never drift apart: READY has none, NOT_READY has some.
    for (const step of result.manifest.steps) {
      expect(step.status === 'READY' ? step.reasons.length === 0 : step.reasons.length > 0).toBe(true);
    }
  });
  it('marks a human-in-the-loop step with no input ports NOT_READY on awaiting_human_completion', () => {
    const plan = doc({ steps: [
      { id: 'review', capability_ref: 'transfer', input_ports: [], interaction_mode: 'human_in_the_loop', output_ports: [] },
    ] });
    expect(lintJourneyDocument(plan, CATALOGUE).ok).toBe(true);
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('gate unexpectedly failed');
    const step = result.manifest.steps[0]!;
    expect(step.status).toBe('NOT_READY');
    expect(step.reasons).toEqual(['awaiting_human_completion']);
    expect(step.blocked_by).toEqual([]);
    expect(result.manifest.not_ready).toEqual(['review']);
  });
  it('orders both reasons awaiting_producer_output then awaiting_human_completion for a fed human step', () => {
    const plan = doc({ steps: [
      { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [port('StagedDraftReference')] },
      { id: 'review', capability_ref: 'measure', input_ports: [port('StagedDraftReference')], interaction_mode: 'human_in_the_loop', output_ports: [] },
    ] });
    expect(lintJourneyDocument(plan, CATALOGUE).ok).toBe(true);
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('gate unexpectedly failed');
    const step = result.manifest.steps[1]!;
    expect(step.status).toBe('NOT_READY');
    expect(step.reasons).toEqual(['awaiting_producer_output', 'awaiting_human_completion']);
    expect(step.blocked_by).toEqual(['transfer']);
  });
  it('relays the lint journey_capability_not_in_catalogue diagnostic verbatim and returns no manifest', () => {
    const plan = doc({ steps: [
      { id: 'step-a', capability_ref: 'ghost-capability', input_ports: [], interaction_mode: 'automatic', output_ports: [] },
    ] });
    const gate = lintJourneyDocument(plan, CATALOGUE);
    expect(gate.ok).toBe(false); // the pin proves the fixture trips the lint, not the compiler
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the gate to refuse');
    expect(result.diagnostics).toEqual(gate.diagnostics); // relayed verbatim, never re-worded
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.rule).toBe('journey_capability_not_in_catalogue');
    expect(result.diagnostics[0]!.step_id).toBe('step-a');
    expect('manifest' in result).toBe(false);
  });
  it('refuses a catalogue descriptor with an empty version string under journey_capability_version_missing', () => {
    // The version gap is the compiler's defensive contract: the lint checks
    // membership, not version strings, so the fixture is clean at the gate.
    const emptyVersion = CATALOGUE.map((d) => (d.capability_id === 'transfer' ? { ...d, version: '' } : d));
    const plan = doc({ steps: [
      { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [] },
    ] });
    expect(lintJourneyDocument(plan, emptyVersion).ok).toBe(true); // gate.ok first: unreachable via the loader
    const result = compileJourneyStructure(plan, emptyVersion);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the gate to refuse');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.rule).toBe('journey_capability_version_missing');
    expect(result.diagnostics[0]!.step_id).toBe('transfer');
    expect('manifest' in result).toBe(false);
  });
  it('the product module holds no journey- literal and no step-id or surface-name table', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'journeyCompiler.ts'), 'utf8');
    expect(source).not.toMatch(/["']journey-/);
    expect(source).not.toMatch(/["'][a-z0-9_.-]+["']\s*:/);
    expect(source).not.toMatch(/\bswitch\s*\(/);
    // D-1: those three regexes miss unquoted keys, arrays and === 'id'
    // comparisons, so the pin is strengthened (never weakened): every string
    // literal and every unquoted object key must equal the closed set.
    const { literals, keys } = stringTokens(source);
    expect([...new Set(literals)].sort()).toEqual([...CLOSED_LITERALS].sort());
    expect([...new Set(keys)].sort()).toEqual([...CLOSED_KEYS].sort());
    // Negative controls, built by runtime concatenation so this test file
    // itself carries no banned literal; each mutant must be REJECTED by the
    // same extractor the pin above applies (the teeth: a mutant that passed
    // the extractor would fail this suite).
    const journeyId = 'jour' + 'ney-x'; // (i) a per-journey branch on an arbitrary id
    expect(outsideClosedSets(source + "\nif (plan.journey_id === '" + journeyId + "') { return { ok: true, manifest: plan }; }\n")).toBe(true);
    const stepIds = ['step' + 'Alpha', 'step' + 'Beta']; // (ii) an unquoted-key step-id table
    expect(outsideClosedSets(source + '\nconst stepIdTable = { ' + stepIds[0] + ': 1, ' + stepIds[1] + ': 2 };\n')).toBe(true);
    const capabilityId = 'ghost' + '-cap'; // (iii) a capability-id equality check
    expect(outsideClosedSets(source + "\nif (step.capability_ref === '" + capabilityId + "') { return { ok: false, diagnostics: [] }; }\n")).toBe(true);
  });
  // Unit s2inval: the manifest records a stage-2 envelope invalidation.
  it('AC1: a compiled manifest reads back with not_ready exactly the non-READY ids, and after recordEnvelopeInvalidation the step is NOT_READY with stale_input once and one invalidation entry verbatim', () => {
    const plan = twoStepPlan();
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('gate unexpectedly failed');
    const manifest = result.manifest;
    // Unchanged baseline: not_ready is exactly the ids whose status !== 'READY', document order.
    expect(manifest.not_ready).toEqual(manifest.steps.filter((s) => s.status !== 'READY').map((s) => s.id));
    expect(manifest.not_ready).toEqual(['measure']);
    const target = manifest.steps[1]!;
    const recorded = recordEnvelopeInvalidation(manifest, {
      step_id: target.id,
      rule: 'journey_envelope_stale_input',
      message: 'step measure: the source record was revised',
    });
    expect(recorded).not.toBe(manifest);
    expect(recorded.journey_id).toBe(manifest.journey_id);
    expect(recorded.revision).toBe(manifest.revision);
    expect(recorded.invalidations).toEqual([{
      step_id: 'measure',
      rule: 'journey_envelope_stale_input',
      message: 'step measure: the source record was revised',
    }]);
    expect(recorded.steps[1]!.status).toBe('NOT_READY');
    const reasonCount = recorded.steps[1]!.reasons.filter((r) => r === 'stale_input').length;
    expect(recorded.steps[1]!.reasons).toContain('stale_input');
    expect(reasonCount).toBe(1); // stale_input exactly once
    // The other step rides through unchanged.
    expect(recorded.steps[0]!.status).toBe('READY');
    expect(recorded.steps[0]!.reasons).toEqual([]);
    expect(recorded.not_ready).toEqual(['measure']);
    // READY = zero reasons, NOT_READY = at least one reason, for every step.
    for (const step of recorded.steps) {
      expect(step.status === 'READY' ? step.reasons.length === 0 : step.reasons.length > 0).toBe(true);
    }
  });
  // D1 (advc c1): the realistic stage-2 target is a READY step — the AC1 pin above
  // only invalidates 'measure', which is already NOT_READY, so it cannot witness the
  // status flip or the not_ready recompute. This leg invalidates the READY 'transfer'.
  it('AC1b: invalidating a READY step flips it to NOT_READY with stale_input and adds it to not_ready in document order', () => {
    const plan = twoStepPlan();
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('gate unexpectedly failed');
    const manifest = result.manifest;
    // Fixture precondition, asserted not assumed: 'transfer' really is READY.
    expect(manifest.steps[0]!.status).toBe('READY');
    expect(manifest.not_ready).toEqual(['measure']);
    const recorded = recordEnvelopeInvalidation(manifest, {
      step_id: 'transfer',
      rule: 'journey_envelope_stale_input',
      message: 'step transfer: the source record was revised',
    });
    expect(recorded.invalidations).toHaveLength(1);
    expect(recorded.invalidations).toEqual([{
      step_id: 'transfer',
      rule: 'journey_envelope_stale_input',
      message: 'step transfer: the source record was revised',
    }]);
    expect(recorded.steps[0]!.status).toBe('NOT_READY');
    expect(recorded.steps[0]!.reasons).toContain('stale_input');
    expect(recorded.steps[0]!.reasons.filter((r) => r === 'stale_input')).toHaveLength(1);
    // The recompute must re-derive, not reuse the old array: document order, both ids.
    expect(recorded.not_ready).toEqual(['transfer', 'measure']);
    // 'measure' rides through unchanged.
    expect(recorded.steps[1]!.status).toBe('NOT_READY');
    expect(recorded.steps[1]!.reasons).toEqual(['awaiting_producer_output']);
    // The input manifest is untouched.
    expect(manifest.steps[0]!.status).toBe('READY');
    expect(manifest.not_ready).toEqual(['measure']);
  });
  it('AC2: a second refusal for the same step and rule adds no duplicate stale_input reason and does not mutate the input manifest', () => {
    const plan = twoStepPlan();
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('gate unexpectedly failed');
    const manifest = result.manifest;
    const original = JSON.parse(JSON.stringify(manifest)); // snapshot taken BEFORE the calls
    const entry = {
      step_id: 'measure',
      rule: 'journey_envelope_stale_input',
      message: 'step measure: the source record was revised',
    };
    const once = recordEnvelopeInvalidation(manifest, entry);
    const onceSnapshot = JSON.parse(JSON.stringify(once)); // snapshot BEFORE the second call
    const twice = recordEnvelopeInvalidation(once, entry);
    expect(twice.steps[1]!.reasons.filter((r) => r === 'stale_input')).toHaveLength(1); // no duplicate reason
    expect(twice.steps[1]!.status).toBe('NOT_READY');
    expect(twice.invalidations).toHaveLength(2); // each refusal appends its own entry
    expect(twice.not_ready).toEqual(['measure']);
    // The input manifest is never mutated: deep-equality against the pre-call snapshot.
    expect(manifest).toEqual(original);
    expect('invalidations' in manifest).toBe(false); // the original still carries no invalidation
    expect(manifest.steps[1]!.reasons).toEqual(['awaiting_producer_output']);
    expect(manifest.steps[1]!.status).toBe('NOT_READY');
    // Neither intermediate result is mutated by a later call.
    expect(once).toEqual(onceSnapshot);
    expect(once.steps[1]!.reasons.filter((r) => r === 'stale_input')).toHaveLength(1);
  });
  it('AC3: a manifest compiled with no invalidation carries no invalidations key at all (absent, not undefined)', () => {
    const plan = twoStepPlan();
    const result = compileJourneyStructure(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('gate unexpectedly failed');
    expect('invalidations' in result.manifest).toBe(false);
    // And after recording, the invalidations key is present with the declared entry.
    const recorded = recordEnvelopeInvalidation(result.manifest, {
      step_id: 'measure', rule: 'journey_envelope_stale_input', message: 'step measure: revised',
    });
    expect('invalidations' in recorded).toBe(true);
    expect(recorded.invalidations).toHaveLength(1);
  });
});
