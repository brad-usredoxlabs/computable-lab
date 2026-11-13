// @vitest-environment node
/**
 * L2-JOURNEY-COMPILER-1 (unit s2envelope, stage 2): RED-first pins for the
 * ready execution envelope. AC1: a READY automatic step compiles and carries
 * the capability ref and version from the manifest, with no bindings when it
 * has no inputs. AC2: a human step is refused under journey_envelope_human_step
 * and never yields an envelope. AC3: an input-fed step compiles with matching
 * versions, and checkEnvelopeFreshness goes stale with a named diagnostic when
 * the resolved version moves. AC4: a missing resolved version is refused under
 * journey_envelope_input_unbound and an unknown step id under
 * journey_envelope_step_unknown. AC5: the product module holds no journey-
 * literal, no quoted id-to-value table, no switch, and no re-validation import.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { compileJourneyStructure } from './journeyCompiler.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import {
  compileJourneyEnvelope, checkEnvelopeFreshness,
  RULE_ENVELOPE_HUMAN_STEP, RULE_ENVELOPE_INPUT_UNBOUND,
  RULE_ENVELOPE_STALE_INPUT, RULE_ENVELOPE_STEP_UNKNOWN,
} from './journeyEnvelope.js';

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
/** One input port pinning a version, by its $def required field names. */
const DRAFT_PORT = { version: 'v1', draft_id: 'DRAFT-1' };
function twoStepDocument(): Record<string, unknown> {
  return doc({ steps: [
    { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [DRAFT_PORT] },
    { id: 'measure', capability_ref: 'measure', input_ports: [DRAFT_PORT], interaction_mode: 'automatic', output_ports: [] },
  ] });
}
/** A single automatic step with no input ports: READY at stage 1. */
function readyStepDocument(): Record<string, unknown> {
  return doc({ steps: [
    { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic', output_ports: [] },
  ] });
}
function compileManifest(document: Record<string, unknown>) {
  const result = compileJourneyStructure(document, CATALOGUE);
  if (!result.ok) throw new Error('fixture unexpectedly refused at stage 1');
  return result.manifest;
}

describe('compileJourneyEnvelope', () => {
  it('AC1: a READY automatic step compiles with the manifest capability and no bindings', () => {
    const document = readyStepDocument();
    const manifest = compileManifest(document);
    const result = compileJourneyEnvelope(manifest, document, 'transfer', []);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the envelope to compile');
    expect(result.envelope.journey_id).toBe('journey-compiler-fixture');
    expect(result.envelope.revision).toBe(1);
    expect(result.envelope.step_id).toBe('transfer');
    expect(result.envelope.capability_ref).toBe('transfer');
    expect(result.envelope.capability_version).toBe(manifest.steps[0]!.capability_version);
    expect(result.envelope.bindings).toEqual([]);
  });
  it('AC2: a human step is refused under journey_envelope_human_step and never yields an envelope', () => {
    const document = doc({ steps: [
      { id: 'review', capability_ref: 'transfer', input_ports: [], interaction_mode: 'human_in_the_loop', output_ports: [] },
    ] });
    const manifest = compileManifest(document);
    const result = compileJourneyEnvelope(manifest, document, 'review', []);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('a human step never yields an envelope');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_HUMAN_STEP);
    expect(result.diagnostics[0]!.step_id).toBe('review');
    expect(result.diagnostics[0]!.message).toContain('review');
    expect('envelope' in result).toBe(false);
  });
  it('AC3: an input-fed step compiles with matching versions and freshness catches a moved version', () => {
    const document = twoStepDocument();
    const manifest = compileManifest(document);
    const result = compileJourneyEnvelope(manifest, document, 'measure', [{ port_index: 0, version: 'v1' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the envelope to compile');
    expect(result.envelope.capability_ref).toBe('measure');
    expect(result.envelope.capability_version).toBe(manifest.steps[1]!.capability_version);
    expect(result.envelope.bindings).toEqual([{ port_index: 0, declared_version: 'v1', resolved_version: 'v1' }]);
    const envelope = result.envelope;
    expect(checkEnvelopeFreshness(envelope, [{ port_index: 0, version: 'v1' }])).toEqual({ valid: true });
    const stale = checkEnvelopeFreshness(envelope, [{ port_index: 0, version: 'v2' }]);
    expect(stale.valid).toBe(false);
    if (stale.valid) throw new Error('expected the envelope to go stale');
    expect(stale.diagnostics).toHaveLength(1);
    expect(stale.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_STALE_INPUT);
    expect(stale.diagnostics[0]!.message).toContain('0');
    expect(stale.diagnostics[0]!.message).toContain('v1');
    expect(stale.diagnostics[0]!.message).toContain('v2');
  });
  it('AC4: a missing resolved version is refused under journey_envelope_input_unbound naming the index', () => {
    const document = twoStepDocument();
    const manifest = compileManifest(document);
    const result = compileJourneyEnvelope(manifest, document, 'measure', []);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the unbound input to be refused');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_INPUT_UNBOUND);
    expect(result.diagnostics[0]!.step_id).toBe('measure');
    expect(result.diagnostics[0]!.message).toContain('0');
  });
  it('AC4: a step id in neither the manifest nor the document is refused under journey_envelope_step_unknown', () => {
    const document = twoStepDocument();
    const manifest = compileManifest(document);
    const result = compileJourneyEnvelope(manifest, document, 'ghost-step', []);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the unknown step to be refused');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.rule).toBe(RULE_ENVELOPE_STEP_UNKNOWN);
    expect(result.diagnostics[0]!.step_id).toBe('ghost-step');
    expect(result.diagnostics[0]!.message).toContain('ghost-step');
  });
  it('AC5: the product module holds no journey- literal, no quoted id-to-value table, no switch, and no re-validation import', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'journeyEnvelope.ts'), 'utf8');
    expect(source).not.toMatch(/["']journey-/);
    expect(source).not.toMatch(/["'][a-z0-9_.-]+["']\s*:/);
    expect(source).not.toMatch(/\bswitch\s*\(/);
    expect(source).not.toContain('lintJourneyDocument');
    expect(source).not.toContain('validatePortBinding');
  });
});
