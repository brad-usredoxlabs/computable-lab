// @vitest-environment node
/**
 * L2-JOURNEY-COMPILER-1 (unit cmanifest, stage 1): RED-first pins for the
 * compile gate. (a) a clean two-step doc: step 1 READY, step 2 NOT_READY on
 * awaiting_producer_output, blocked by step 1's id; (b) a human-in-the-loop
 * step with no input ports is NOT_READY on awaiting_human_completion; (c) a
 * step both input-fed and human carries both reasons in the fixed order;
 * (d) a capability_ref outside the admitted catalogue is relayed VERBATIM
 * under the lint's own rule, with no manifest; (e) the product module holds
 * no journey- literal and no step-id or surface-name table.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { compileJourneyStructure } from './journeyCompiler.js';
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
  it('the product module holds no journey- literal and no step-id or surface-name table', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'journeyCompiler.ts'), 'utf8');
    expect(source).not.toMatch(/["']journey-/);
    expect(source).not.toMatch(/["'][a-z0-9_.-]+["']\s*:/);
    expect(source).not.toMatch(/\bswitch\s*\(/);
  });
});
