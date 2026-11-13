// @vitest-environment node
/**
 * L2-JOURNEY-HUMANTASK-1 (unit htcschema): the human-task contract gate,
 * RED-first. The gate runs inside lintJourneyDocument when the caller passes
 * the surfaces registry (the lint's third parameter): (a) a
 * human_in_the_loop step that carries no human_task is refused under
 * journey_human_task_missing; (b) an automatic step that carries one is
 * refused under journey_human_task_unexpected; (c) a contract whose surface
 * the registry does not declare is refused under journey_human_task_surface_unknown;
 * (d) a selectable_kinds entry the declared surface does not permit is refused
 * under journey_human_task_kind_not_selectable. The registry is the authority:
 * the fixture uses the REAL loadDefaultSurfacesRegistry, and the run-plan
 * fixture matters — run-plan declares protocol-step, which any hardcoded
 * ['well','cell','event','material'] table lacks, so a hardcoded kind table
 * goes RED on arm (d) (mutation probe B). The human_task shape itself is
 * proven by the schema gate (Ajv) before any of these rules read it.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintJourneyDocument } from './journeyDocumentLint.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import { loadDefaultSurfacesRegistry } from '../../surfaces/surfaces.js';

const SCHEMA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../schema');
const surfaces = loadDefaultSurfacesRegistry(SCHEMA_DIR);
const CATALOGUE: CapabilityDescriptor[] = [
  { capability_id: 'transfer', implementation: { handler_kind: 'builtin', handler_ref: 'transfer' } },
];
/** A structurally complete document; the caller supplies the steps under test. */
function doc(steps: Record<string, unknown>[]): Record<string, unknown> {
  return {
    journey_id: 'journey-humantask-fixture', revision: 1,
    authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
    request_anchor: { message_id: 'msg-1', verbatim_text: 'pick the protocol step to run' },
    objective: 'choose the protocol step to execute first',
    completion_contract: ['the selection record is committed'],
    parameters: [],
    steps,
    alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
    return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
    assumptions: [], unresolved_questions: [],
  };
}
/** A contract the shipped human-task schema accepts: a known registry surface
 * (run-plan) whose selectable_kinds the registry permits, a closed vocabulary
 * output port, and the two closed lifecycle enums. */
function humanTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    decision: 'choose which protocol step to execute first',
    surface: 'run-plan',
    controls: ['select-step', 'approve-plan'],
    selectable_kinds: ['protocol-step', 'event'],
    completion: { kind: 'versioned_selection', receipt_required: true },
    output_port: { version: 'v1', draft_id: 'DRAFT-1' },
    on_cancel: 'keep_journey_active',
    on_defer: 'end_journey',
    ...overrides,
  };
}

describe('lintJourneyDocument human-task contract gate', () => {
  it('(a) a human_in_the_loop step with no human_task is refused under journey_human_task_missing', () => {
    const result = lintJourneyDocument(doc([
      { id: 'review', capability_ref: 'transfer', input_ports: [], output_ports: [], interaction_mode: 'human_in_the_loop' },
    ]), CATALOGUE, surfaces);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.rule).toBe('journey_human_task_missing');
    expect(d.step_id).toBe('review');
    expect(d.message).toContain('review');
  });
  it('(b) an automatic step carrying a human_task is refused under journey_human_task_unexpected', () => {
    const result = lintJourneyDocument(doc([
      { id: 'review', capability_ref: 'transfer', input_ports: [], output_ports: [], interaction_mode: 'automatic', human_task: humanTask() },
    ]), CATALOGUE, surfaces);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.rule).toBe('journey_human_task_unexpected');
    expect(d.step_id).toBe('review');
    expect(d.message).toContain('review');
  });
  it('(c) a human_task whose surface the registry does not declare is refused under journey_human_task_surface_unknown', () => {
    const result = lintJourneyDocument(doc([
      { id: 'review', capability_ref: 'transfer', input_ports: [], output_ports: [], interaction_mode: 'human_in_the_loop',
        human_task: humanTask({ surface: 'not_a_surface' }) },
    ]), CATALOGUE, surfaces);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.rule).toBe('journey_human_task_surface_unknown');
    expect(d.step_id).toBe('review');
    expect(d.message).toContain('review');
    expect(d.message).toContain('not_a_surface');
  });
  it('(d) a selectable_kinds entry the run-plan surface does not permit is refused under journey_human_task_kind_not_selectable', () => {
    const result = lintJourneyDocument(doc([
      { id: 'review', capability_ref: 'transfer', input_ports: [], output_ports: [], interaction_mode: 'human_in_the_loop',
        human_task: humanTask({ selectable_kinds: ['not_a_registry_kind'] }) },
    ]), CATALOGUE, surfaces);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.rule).toBe('journey_human_task_kind_not_selectable');
    expect(d.step_id).toBe('review');
    expect(d.message).toContain('review');
    expect(d.message).toContain('run-plan');
    expect(d.message).toContain('not_a_registry_kind');
  });
  it('a human_in_the_loop step whose contract agrees with the registry passes with no diagnostics', () => {
    const result = lintJourneyDocument(doc([
      { id: 'review', capability_ref: 'transfer', input_ports: [], output_ports: [], interaction_mode: 'human_in_the_loop', human_task: humanTask() },
    ]), CATALOGUE, surfaces);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
  it('an automatic step without a human_task passes with no diagnostics', () => {
    const result = lintJourneyDocument(doc([
      { id: 'transfer', capability_ref: 'transfer', input_ports: [], output_ports: [], interaction_mode: 'automatic' },
    ]), CATALOGUE, surfaces);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
