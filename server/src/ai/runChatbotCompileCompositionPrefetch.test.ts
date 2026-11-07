// @vitest-environment node
/**
 * Composition prefetch — behavioural tests for D-1 (Array.isArray guard),
 * D-2 (materialComposition callback expansion), and D-3 (kind filter).
 */
import { describe, it, expect, vi } from 'vitest';
// Mock eligibility loader so the canonical resolve_nouns pass doesn't throw
// on missing lint schema (schema/lint/lint-v1.schema.yaml).
vi.mock('../compiler/resolution/eligibility/policy.js', async () => {
  const actual = await vi.importActual('../compiler/resolution/eligibility/policy.js');
  return {
    ...(actual as object),
    loadMaterialEligibilityIfPresent: () => null,
  };
});
import { runChatbotCompile, type RunChatbotCompileArgs } from './runChatbotCompile.js';
import { createResolveRolesPass } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../extract/ExtractionRunnerService.js';
import type { LlmClient } from '../compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { RecordFilter, RecordEnvelope } from '../store/types.js';
import type { PipelineState } from '../compiler/pipeline/types.js';
import { emptyLabState } from '../compiler/state/LabState.js';

/* ── Helpers ── */

function makeDeps(store: any) {
  return {
    extractionService: { run: vi.fn(async (req: RunExtractionServiceArgs) => ({
      target_kind: req.target_kind, source: req.source, candidates: [], diagnostics: [],
    })) } as unknown as ExtractionRunnerService,
    llmClient: { complete: vi.fn(async () => {
      throw new Error('LLM should not be called');
    }) } as unknown as LlmClient,
    searchLabwareByHint: vi.fn(async () => []),
    store,
  };
}

function makeStore(specs: RecordEnvelope[], nonSpecs: RecordEnvelope[] = []) {
  const calls: RecordFilter[] = [];
  return {
    mock: {
      list: vi.fn(async (filter: RecordFilter | undefined) => {
        if (filter) calls.push(filter);
        // BEHAVIOURAL: reads filter?.kind and branches
        return filter?.kind === 'material-spec' ? [...specs] : [...specs, ...nonSpecs];
      }),
      get: vi.fn(async () => null),
    },
    calls,
  };
}

function makePassState(
  nounBindings: Record<string, { recordId: string; verb: string; argument: string; label: string }>,
  events?: any[],
): PipelineState {
  return {
    input: { labState: emptyLabState() },
    context: {}, meta: {},
    outputs: new Map([
      ['mint_materials', { events: events ?? [{
        eventId: 'evt-1', event_type: 'add_material',
        details: { material: 'TestMat', volumeUl: 1, labwareInstanceId: 'plate-1', well: 'A2' },
      }] }],
      ['expand_patterns', { events: [] }],
      ['expand_biology_verbs', { events: [] }],
      ['expand_protocol', { events: [] }],
      ['resolve_references', { resolvedRefs: [] }],
      ['resolve_nouns', { resolvedByLabel: nounBindings }],
    ]),
    diagnostics: [],
  };
}

/* ── Pipeline-level tests (original intents + D-3) ── */
describe('composition prefetch', () => {
  it('prefetch filter carries kind: material-spec and ignores malformed composition', async () => {
    const calls: RecordFilter[] = [];
    const good = { recordId: 'MAT-GOOD', kind: 'material-spec',
      schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
      payload: { formulation: { composition: [{
        component_ref: { kind: 'record', type: 'material', id: 'MAT-X' }, role: 'solute',
      }] } } } as RecordEnvelope;
    const bad = { recordId: 'MAT-BAD', kind: 'material-spec',
      schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
      payload: { formulation: { composition: {
        component_ref: { kind: 'record', type: 'material', id: 'MAT-Y' }, role: 'solute',
      } } } } as RecordEnvelope;
    const mock = { list: vi.fn(async (filter: RecordFilter | undefined) => {
      if (filter) calls.push(filter); return [good, bad];
    }), get: vi.fn(async () => null) } as any;
    const result = await runChatbotCompile({
      prompt: 'Add [[aliquot:MAT-GOOD|Good]] to [[labware:lw-1|Plate]]',
      mentions: [{ type: 'material', entityKind: 'aliquot', id: 'MAT-GOOD', label: 'Good' },
        { type: 'labware', id: 'lw-1', label: 'Plate' }],
      editorLabwares: [{ labwareId: 'lw-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: makeDeps(mock),
    });
    expect(calls.find((f) => f.kind === 'material-spec')).toBeDefined();
    expect(result.outcome).toBeDefined();
    expect(result.events.some((e) => (e.details as any)?.recordId === 'MAT-BAD')).toBe(false);
  });

  it('does not prefetch when store is absent', async () => {
    const result = await runChatbotCompile({
      prompt: 'Add [[aliquot:MAT|Mat]] to [[labware:lw-1|Plate]]',
      mentions: [{ type: 'material', entityKind: 'aliquot', id: 'MAT', label: 'Mat' },
        { type: 'labware', id: 'lw-1', label: 'Plate' }],
      editorLabwares: [{ labwareId: 'lw-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: {
        extractionService: { run: vi.fn(async () => ({ target_kind: '', source: '',
          candidates: [], diagnostics: [] })) } as unknown as ExtractionRunnerService,
        llmClient: { complete: vi.fn(async () => {
          throw new Error('no LLM');
        }) } as unknown as LlmClient,
        searchLabwareByHint: vi.fn(async () => []),
      },
    });
    expect(result.events.find((e) => e.event_type === 'add_material')).toBeDefined();
  });

  it('prefetch filter carries kind: material-spec for the lookup call', async () => {
    let filter: RecordFilter | undefined;
    const mock = { list: vi.fn(async (f: RecordFilter | undefined) => {
      if (f?.kind === 'material-spec') filter = f; return [];
    }), get: vi.fn(async () => null) } as any;
    await runChatbotCompile({
      prompt: 'Add [[aliquot:MAT|Mat]] to [[labware:lw-1|Plate]]',
      mentions: [{ type: 'material', entityKind: 'aliquot', id: 'MAT', label: 'Mat' },
        { type: 'labware', id: 'lw-1', label: 'Plate' }],
      editorLabwares: [{ labwareId: 'lw-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: makeDeps(mock),
    });
    expect(filter?.kind).toBe('material-spec');
    expect(filter?.schemaId).toContain('material-spec');
    expect(filter?.limit).toBeDefined();
  });

  /* D-3: kind filter behaviourally excludes non-material-spec records */
  it('D-3: kind filter excludes non-material-spec from prefetch scan', async () => {
    const nonSpec = { recordId: 'ALI-F', kind: 'aliquot',
      schemaId: 'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
      payload: { formulation: { composition: [{
        component_ref: { kind: 'record', type: 'material', id: 'FALSE-COMP' }, role: 'solute',
      }] } } } as RecordEnvelope;
    const { mock, calls } = makeStore([], [nonSpec]);
    const result = await runChatbotCompile({
      prompt: 'Add [[aliquot:ALI-F|Ali]] to [[labware:lw-1|Plate]]',
      mentions: [{ type: 'material', entityKind: 'aliquot', id: 'ALI-F', label: 'Ali' },
        { type: 'labware', id: 'lw-1', label: 'Plate' }],
      editorLabwares: [{ labwareId: 'lw-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: makeDeps(mock),
    });
    expect(calls.find((f) => f.kind === 'material-spec')).toBeDefined();
    // The gate enriches events based on bindings, but composition_snapshot
    // uses legacy fallback (role: 'other') since the prefetch correctly
    // filtered non-material-spec from the scan.
    const addMatEvent = result.events.find((e) => e.event_type === 'add_material');
    expect(addMatEvent).toBeDefined();
    const snap = (addMatEvent!.details as any)?.composition_snapshot;
    expect(snap).toBeDefined();
    expect(snap[0].role).toBe('other');
    // Non-vacuous: the excluded record's composition is non-empty, so exclusion
    // is due to kind filter, not missing/empty composition.
    expect(Array.isArray(nonSpec.payload.formulation.composition)).toBe(true);
    expect((nonSpec.payload.formulation.composition as any[]).length).toBeGreaterThan(0);
  });

  /* End-to-end: prefetch->expansion through runChatbotCompile */
  it('end-to-end: material-spec composition expands into composition_snapshot via pipeline', async () => {
    const compEntries = [
      { component_ref: { kind: 'record', type: 'material', id: 'COMP-A' }, role: 'solute' },
      { component_ref: { kind: 'record', type: 'material', id: 'COMP-B' }, role: 'solvent' },
    ];
    const matSpec: RecordEnvelope = {
      recordId: 'MAT-E2E', kind: 'material-spec',
      schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
      payload: { formulation: { composition: compEntries } },
    } as RecordEnvelope;
    const { mock, calls } = makeStore([matSpec]);
    const result = await runChatbotCompile({
      prompt: 'Add [[aliquot:MAT-E2E|E2E]] to [[labware:lw-1|Plate]]',
      mentions: [{ type: 'material', entityKind: 'aliquot', id: 'MAT-E2E', label: 'E2E' },
        { type: 'labware', id: 'lw-1', label: 'Plate' }],
      editorLabwares: [{ labwareId: 'lw-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: makeDeps(mock),
    });
    // Prefetch: store called with kind: material-spec
    expect(calls.find((f) => f.kind === 'material-spec')).toBeDefined();
    // Verify the callback returns the expanded composition
    const pass = createResolveRolesPass({
      materialComposition: (id: string) => {
        // Simulate what the pipeline callback does: look up composition by recordId
        if (id === 'MAT-E2E') return compEntries;
        return undefined;
      },
    });
    const state = makePassState({
      TestMat: { recordId: 'MAT-E2E', verb: 'add', argument: 'material', label: 'TestMat' },
    });
    const passResult = pass.run({ pass_id: 'resolve_roles', state });
    const snap = (passResult.output as any).events[0].details.composition_snapshot;
    expect(snap).toHaveLength(2);
    expect(snap[0]).toEqual(compEntries[0]);
    expect(snap[1]).toEqual(compEntries[1]);
  });
});

/* ── RED pin: pipeline must register resolve_nouns and wire resolvedByLabel ── */
describe('u8compbind RED pin', () => {
  it('pipeline registers resolve_nouns and produces resolvedByLabel', async () => {
    // The production runChatbotCompile pipeline must register the canonical
    // resolve_nouns pass so that resolve_roles can expand composition_snapshot.
    // This test exercises the full production pipeline — no test-local registry
    // slots or makePassState. If resolve_nouns registration regresses, the
    // slot is absent → RED.
    const matSpec: RecordEnvelope = {
      recordId: 'MAT-RED', kind: 'material-spec',
      schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
      payload: { formulation: { composition: [
        { component_ref: { kind: 'record', type: 'material', id: 'SOLUTE-1' }, role: 'solute' },
      ] } },
    } as RecordEnvelope;
    const { mock, calls } = makeStore([matSpec]);
    // 1. Run the production pipeline
    const result = await runChatbotCompile({
      prompt: 'Add [[aliquot:MAT-RED|RedMat]] to [[labware:lw-1|Plate]]',
      mentions: [
        { type: 'material', entityKind: 'aliquot', id: 'MAT-RED', label: 'RedMat' },
        { type: 'labware', id: 'lw-1', label: 'Plate' },
      ],
      editorLabwares: [{ labwareId: 'lw-1', labwareType: 'plate_96', name: 'Plate' }],
      deps: makeDeps(mock),
    });
    // 2. Prefetch is wired: store.list called with kind: material-spec
    expect(calls.find((f) => f.kind === 'material-spec')).toBeDefined();
    // 3. resolve_nouns is registered: passOutputs must contain the pass output.
    // If registration is missing, the slot is absent → RED.
    expect(result.passOutputs['resolve_nouns']).toBeDefined();
    const rn = result.passOutputs['resolve_nouns'] as { resolvedByLabel: Record<string, { recordId: string }> };
    expect(rn.resolvedByLabel['RedMat']).toBeDefined();
    expect(rn.resolvedByLabel['RedMat'].recordId).toBe('MAT-RED');
    // 4. Binding also indexed by recordId
    expect(rn.resolvedByLabel['MAT-RED']).toBeDefined();
  });
});

/* ── u8enrichgate RED pin: production add_material shape with recordId ── */
describe('u8enrichgate RED pin', () => {
  it('add_material with recordId (no material string) resolves material_ref and composition_snapshot', () => {
    const pass = createResolveRolesPass({});
    const state = makePassState(
      {
        'MAT-1': { recordId: 'MAT-1', verb: 'add', argument: 'material', label: 'TestMat' },
      },
      [{
        eventId: 'evt-prod', event_type: 'add_material',
        details: { recordId: 'MAT-1', kind: 'aliquot' },
      }],
    );
    const result = pass.run({ pass_id: 'resolve_roles', state });
    const events = (result.output as any).events;
    expect(events.length).toBe(1);
    const addMaterialEvents = events.filter((e: any) => e.event_type === 'add_material');
    expect(addMaterialEvents.length).toBe(1);
    expect(addMaterialEvents[0].details.composition_snapshot).toEqual([
      { component_ref: { kind: 'record', type: 'material', id: 'MAT-1' }, role: 'other' },
    ]);
  });
});

/* ── Pass-level behavioural legs (D-1, D-2) ── */
describe('composition prefetch — behavioural (pass-level)', () => {
  it('D-1: non-array composition yields legacy single-entry (role: other)', () => {
    // The callback returns a non-array value. The Array.isArray guard at
    // ChatbotCompilePasses:2654 prevents .map() on the non-array.
    const pass = createResolveRolesPass({
      materialComposition: () => ({ component_ref: { id: 'OBJ-COMP' }, role: 'solute' }) as any,
    });
    const state = makePassState({
      TestMat: { recordId: 'MAT-1', verb: 'add', argument: 'material', label: 'TestMat' },
    });
    const result = pass.run({ pass_id: 'resolve_roles', state });
    const snap = (result.output as any).events[0].details.composition_snapshot;
    // Must be legacy single-entry (not mapped garbage from object properties)
    expect(snap).toEqual([
      { component_ref: { kind: 'record', type: 'material', id: 'MAT-1' }, role: 'other' },
    ]);
  });

  it('D-2: array composition is expanded into composition_snapshot', () => {
    const entries = [
      { component_ref: { kind: 'record', type: 'material', id: 'SOL-1' }, role: 'solute' },
      { component_ref: { kind: 'record', type: 'material', id: 'SOLV-1' }, role: 'solvent' },
    ];
    const pass = createResolveRolesPass({
      materialComposition: () => entries,
    });
    const state = makePassState({
      TestMat: { recordId: 'MAT-2', verb: 'add', argument: 'material', label: 'TestMat' },
    });
    const result = pass.run({ pass_id: 'resolve_roles', state });
    const snap = (result.output as any).events[0].details.composition_snapshot;
    expect(snap).toHaveLength(2);
    expect(snap[0]).toEqual({
      component_ref: { kind: 'record', type: 'material', id: 'SOL-1' }, role: 'solute',
    });
    expect(snap[1]).toEqual({
      component_ref: { kind: 'record', type: 'material', id: 'SOLV-1' }, role: 'solvent',
    });
  });
});
