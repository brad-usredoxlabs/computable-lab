// @vitest-environment node
/**
 * L2-JOURNEY-DOC-1 (unit u2lint): the journey-document lint pass, RED-first.
 * Pins: (1) a capability_ref outside the ADMITTED catalogue is refused by step
 * and capability id; (2) a consecutive-step port pair that validatePortBinding
 * refuses is surfaced VERBATIM, naming both step ids and the index; (3) a
 * journey_port_missing_producer diagnostic; (4) a clean plan passes; (5) the
 * schema gate runs first. Fixtures use literals; the product module may not.
 */
import { describe, it, expect } from 'vitest';
import { lintJourneyDocument, RULE_ALTERNATIVE_CAPABILITY_NOT_IN_CATALOGUE, RULE_ALTERNATIVE_SURFACE_UNKNOWN } from './journeyDocumentLint.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import { SurfacesRegistry } from '../../surfaces/surfaces.js';

const CATALOGUE: CapabilityDescriptor[] = [
  { capability_id: 'transfer', implementation: { handler_kind: 'builtin', handler_ref: 'transfer' } },
  { capability_id: 'measure', implementation: { handler_kind: 'builtin', handler_ref: 'measure' } },
];
/** A structurally complete document the shipped journey-document schema accepts. */
function doc(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    journey_id: 'journey-lint-fixture', revision: 1,
    authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
    request_anchor: { message_id: 'msg-1', verbatim_text: 'move and verify the samples' },
    objective: 'transfer the samples and verify the result',
    completion_contract: ['the transfer record is committed', 'the verification record is committed'],
    parameters: [],
    steps: [
      { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic',
        output_ports: [{ version: 'v1', draft_id: 'DRAFT-1' }] },
      { id: 'measure', capability_ref: 'measure', input_ports: [{ version: 'v1', draft_id: 'DRAFT-1' }], interaction_mode: 'automatic',
        output_ports: [{ version: 'v1', record_id: 'REC-1', record_type: 'assay-result', receipt_id: 'RCPT-1' }] },
    ],
    alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
    return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
    assumptions: [], unresolved_questions: [], ...overrides,
  };
}
/** One closed vocabulary port, by its $def's required field names. */
function port(name: string): Record<string, unknown> {
  switch (name) {
    case 'SequenceSetReference': return { version: 'v1', sequence_set_id: 'SS-1' };
    case 'AlignmentReference': return { version: 'v1', alignment_id: 'ALN-1' };
    case 'MaterialReference': return { version: 'v1', material_id: 'MAT-1', provenance_layer: 'aliquot' };
    case 'LabwareDefinitionReference': return { version: 'v1', labware_definition_id: 'LBD-1' };
    case 'CommittedRecordReference': return { version: 'v1', record_id: 'REC-1', record_type: 'assay-result', receipt_id: 'RCPT-1' };
    case 'StagedDraftReference': return { version: 'v1', draft_id: 'DRAFT-1' };
    default: throw new Error(`unknown port $def ${name}`);
  }
}
/** A surfaces document mirroring the SHIPPED registry's record-create surface
 * (data, not the live file — the registry, never the test, is the authority). */
const SURFACES_DOC = {
  version: 1,
  surfaces: [
    { id: 'find', label: 'Find', path: '/find', objectTypes: ['run'], selectableKinds: [] },
    { id: 'record-create', label: 'Record create', path: '/record/new/:nodeType', params: { nodeType: 'record' }, objectTypes: ['record'], selectableKinds: [] },
  ],
};
function surfacesRegistry(): SurfacesRegistry {
  return new SurfacesRegistry(SURFACES_DOC as never);
}
/** Step 1 emits StagedDraftReference; step 2's input at the same index requires CommittedRecordReference. */
function unchained(): Record<string, unknown> {
  return doc({ steps: [
    { id: 'transfer', capability_ref: 'transfer', input_ports: [], interaction_mode: 'automatic',
      output_ports: [port('StagedDraftReference')] },
    { id: 'measure', capability_ref: 'measure', input_ports: [port('CommittedRecordReference')], interaction_mode: 'automatic',
      output_ports: [] },
  ] });
}
/** Fully admitted, and every declared input is fed by the same index of the previous step. */
function clean(): Record<string, unknown> {
  return doc({ steps: [
    { id: 'transfer', capability_ref: 'transfer', input_ports: [port('MaterialReference')], interaction_mode: 'automatic',
      output_ports: [port('MaterialReference'), port('StagedDraftReference')] },
    { id: 'measure', capability_ref: 'measure', input_ports: [port('MaterialReference'), port('StagedDraftReference')], interaction_mode: 'automatic',
      output_ports: [port('CommittedRecordReference')] },
  ] });
}

describe('lintJourneyDocument', () => {
  it('refuses a capability_ref absent from the admitted catalogue, naming step and capability', () => {
    const result = lintJourneyDocument(doc({ steps: [
      { id: 'step-a', capability_ref: 'ghost-capability', input_ports: [], interaction_mode: 'automatic',
        output_ports: [port('StagedDraftReference')] },
      { id: 'step-b', capability_ref: 'ghost-capability', input_ports: [port('StagedDraftReference')], interaction_mode: 'automatic',
        output_ports: [] },
    ] }), CATALOGUE);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]!.rule).toBe('journey_capability_not_in_catalogue');
    expect(result.diagnostics[0]!.step_id).toBe('step-a');
    expect(result.diagnostics[0]!.message).toContain('ghost-capability');
    expect(result.diagnostics[1]!.step_id).toBe('step-b');
  });
  it('surfaces validatePortBinding staged_bound_to_committed verbatim, naming both steps and the index', () => {
    const result = lintJourneyDocument(unchained(), CATALOGUE);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.rule).toBe('staged_bound_to_committed'); // the shipped code, not a re-derivation
    expect(d.message).toBe( // the shipped message, byte-for-byte (ports.ts owns the wording)
      'consumer port CommittedRecordReference cannot be bound to producer port StagedDraftReference: a staged draft is not a committed record');
    expect(d.step_id).toBe('transfer');
    expect(d.next_step_id).toBe('measure');
    expect(d.index).toBe(0);
  });
  it('emits journey_port_missing_producer when a producer port is absent, naming both steps and the index', () => {
    const plan = unchained();
    (plan.steps as any[])[0]!.output_ports = [];
    const result = lintJourneyDocument(plan, CATALOGUE);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const d = result.diagnostics[0]!;
    expect(d.rule).toBe('journey_port_missing_producer');
    expect(d.step_id).toBe('transfer');
    expect(d.next_step_id).toBe('measure');
    expect(d.index).toBe(0);
  });
  it('accepts a plan whose capabilities are admitted and whose ports chain', () => {
    const result = lintJourneyDocument(clean(), CATALOGUE);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
  it('the schema gate runs first and returns the structural errors', () => {
    const result = lintJourneyDocument(doc({ steps: 'not-an-array' }), CATALOGUE);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]!.rule).toBe('journey_document_schema');
  });
  it('refuses an alternative option whose capability_ref is absent from the admitted catalogue, naming the alternative and the capability', () => {
    const result = lintJourneyDocument(doc({
      alternatives: { options: [{ alternative_id: 'alt-a', summary: 'declare the record', capability_ref: 'not-in-catalogue', surface: 'record-create' }], selection_authority: 'user' },
    }), CATALOGUE);
    expect(result.ok).toBe(false);
    const d = result.diagnostics.find((x) => x.rule === RULE_ALTERNATIVE_CAPABILITY_NOT_IN_CATALOGUE);
    expect(d).toBeDefined();
    expect(d!.message).toContain('alt-a');
    expect(d!.message).toContain('not-in-catalogue');
  });
  it('refuses an alternative option whose surface the registry does not declare, naming the alternative and the surface', () => {
    const result = lintJourneyDocument(doc({
      alternatives: { options: [{ alternative_id: 'alt-a', summary: 'declare the record', capability_ref: 'transfer', surface: 'not-in-registry' }], selection_authority: 'user' },
    }), CATALOGUE, surfacesRegistry());
    expect(result.ok).toBe(false);
    const d = result.diagnostics.find((x) => x.rule === RULE_ALTERNATIVE_SURFACE_UNKNOWN);
    expect(d).toBeDefined();
    expect(d!.message).toContain('alt-a');
    expect(d!.message).toContain('not-in-registry');
    expect(d!.message).not.toContain('record-create'); // the offending id, not the fixture's known id
  });
  it('a surface-bearing alternative produces no surface diagnostic when the registry argument is omitted (registry-gated)', () => {
    const plan = doc({
      alternatives: { options: [{ alternative_id: 'alt-a', summary: 'declare the record', capability_ref: 'transfer', surface: 'record-create' }], selection_authority: 'user' },
    });
    const result = lintJourneyDocument(plan, CATALOGUE);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
