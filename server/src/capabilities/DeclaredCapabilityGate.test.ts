/**
 * INSTR-COLLAPSE-1 C2 — RED: the capability gate is DECLARED DATA on the ref
 * slot (OQ-1 decision (a)) and INTERPRETED policy-free.
 *
 * Two halves:
 *  (A) the shipped YAML declares the contract: every retargeted ref pins
 *      type: equipment (H3, "any ref" is not an accepted end state), the
 *      gated slots carry `x-capability-gate` with a resolver NAME (data-names-
 *      function precedent: verb-definition derivedFrom.fn), and the retired
 *      equipment.instrumentRef reciprocal-ref is gone.
 *  (B) the gate is CAPABILITY-resolved, not kind-resolved (reviewer bait 5):
 *      a kind-correct equipment WITHOUT the verb binding is REJECTED; the same
 *      equipment WITH the binding is accepted; the verb comes from payload
 *      data only (no TS verb literal, no device name, no id-prefix sniff —
 *      H1/H2); removing the annotation from the schema makes the gate vanish
 *      (the gate exists ONLY because the YAML declares it); a missing verb
 *      chain FAILS CLOSED.
 *
 * RED posture: the annotations/retargets are absent today and the interpreter
 * module does not exist yet.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator, AjvValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore, RecordStoreImpl } from '../store/RecordStoreImpl.js';
import { EquipmentCapabilityService } from './EquipmentCapabilityService.js';
import type { SchemaEntry } from '../schema/SchemaLoader.js';
import type { RecordEnvelope } from '../store/types.js';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..');
const SCHEMA_DIR = join(REPO_ROOT, 'schema');

const MEASUREMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const PLANNED_RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml';
const GRAPH_COMPONENT_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/graph-component-instance.schema.yaml';
const GEMINI_REQUEST_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/sidecar/gemini-active-read-request.schema.yaml';
const EQUIPMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml';
const EQUIPMENT_UI_ID = 'https://computable-lab.com/schema/computable-lab/equipment.ui.yaml';
const EQUIPMENT_LINT_ID = 'https://computable-lab.com/schema/computable-lab/equipment.lint.yaml';
const INSTRUMENT_LOG_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/instrument-log.schema.yaml';
const LABWARE_INSTANCE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml';
const EXPERIMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/experiment.schema.yaml';
const RUN_TIMELINE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/run-timeline.schema.yaml';

let validator: AjvValidator;
let store: RecordStoreImpl;
let testDir: string;
let schemas: Map<string, SchemaEntry>;

beforeAll(async () => {
  const loadResult = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
  const registry = createSchemaRegistry();
  registry.addSchemas(loadResult.entries);
  schemas = new Map(loadResult.entries.map((entry) => [entry.id, entry]));

  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }

  const lintEngine = createLintEngine();
  const lintLoadResult = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
  for (const { name, spec } of lintLoadResult.specs) {
    if (spec.rules.length > 0) lintEngine.addSpec(name, spec);
  }

  testDir = await mkdtemp(join(tmpdir(), `ic1-gate-${randomUUID()}`));
  await mkdir(join(testDir, 'records', 'inbox'), { recursive: true });
  const repo = createLocalRepoAdapter({ basePath: testDir });
  store = createRecordStore(repo, validator, lintEngine);
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function schema(id: string): Record<string, unknown> {
  const entry = schemas.get(id);
  expect(entry, `schema ${id} loaded`).toBeDefined();
  return entry!.schema as unknown as Record<string, unknown>;
}

function props(schemaObj: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return (schemaObj.properties ?? {}) as Record<string, Record<string, unknown>>;
}

function defs(schemaObj: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return (schemaObj.$defs ?? {}) as Record<string, Record<string, unknown>>;
}

/** The allOf pin block that names the ref's allowed `type` (H3 floor). */
function pinnedType(prop: Record<string, unknown>): string | undefined {
  const allOf = prop.allOf;
  if (!Array.isArray(allOf)) return undefined;
  for (const block of allOf) {
    const type = (block as Record<string, unknown>)?.properties?.type;
    if (type && typeof (type as Record<string, unknown>).const === 'string') {
      return (type as Record<string, unknown>).const as string;
    }
  }
  return undefined;
}

function gateAnnotation(prop: Record<string, unknown>): Record<string, unknown> | undefined {
  const gate = prop['x-capability-gate'];
  return gate && typeof gate === 'object' ? (gate as Record<string, unknown>) : undefined;
}

/**
 * Find a property definition ANYWHERE in the schema tree. The contract names
 * the property; the test must not hardcode a brittle path that shifts with
 * schema nesting ($defs maps are keyed by def name, not a structural key, so
 * the walk descends every object value generically).
 */
function findProperty(schemaObj: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const seen = new Set<unknown>();
  const walk = (node: unknown): Record<string, unknown> | undefined => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || seen.has(node)) return undefined;
    seen.add(node);
    const record = node as Record<string, unknown>;
    const properties = record.properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
      const direct = (properties as Record<string, unknown>)[name];
      if (direct && typeof direct === 'object' && !Array.isArray(direct)) return direct as Record<string, unknown>;
    }
    for (const value of Object.values(record)) {
      const found = walk(value);
      if (found) return found;
    }
    return undefined;
  };
  return walk(schemaObj);
}

// ---------------------------------------------------------------------------
// (A) the contract is DECLARED in the shipped YAML
// ---------------------------------------------------------------------------

describe('C2 declared contract: refs are pinned to equipment and gated slots declare the gate', () => {
  it('measurement.equipmentRef declares x-capability-gate with a resolver NAME (read-event-verb)', () => {
    const gate = gateAnnotation(props(schema(MEASUREMENT_SCHEMA_ID)).equipmentRef ?? {});
    expect(gate, 'measurement.equipmentRef must carry x-capability-gate').toBeDefined();
    const verbFrom = gate!.verbFrom as Record<string, unknown>;
    expect(verbFrom?.resolver).toBe('read-event-verb');
    expect(verbFrom?.path).toBe('readEventRef');
  });

  it('planned-run CompiledProtocolStep.equipmentRef declares x-capability-gate (sibling-verb-ref)', () => {
    const step = defs(schema(PLANNED_RUN_SCHEMA_ID)).CompiledProtocolStep;
    const gate = gateAnnotation(props(step).equipmentRef ?? {});
    expect(gate, 'CompiledProtocolStep.equipmentRef must carry x-capability-gate').toBeDefined();
    const verbFrom = gate!.verbFrom as Record<string, unknown>;
    expect(verbFrom?.resolver).toBe('sibling-verb-ref');
    expect(verbFrom?.path).toBe('verbRef');
  });

  it('planned-run InstrumentBinding.instrumentRef is pinned to type equipment (H3)', () => {
    const binding = defs(schema(PLANNED_RUN_SCHEMA_ID)).InstrumentBinding;
    expect(pinnedType(props(binding).instrumentRef ?? {})).toBe('equipment');
  });

  it('graph-component-instance instruments[].instrumentRef is pinned to type equipment (H3)', () => {
    expect(pinnedType(findProperty(schema(GRAPH_COMPONENT_INSTANCE_SCHEMA_ID), 'instrumentRef') ?? {})).toBe('equipment');
  });

  it('gemini-active-read-request instrumentRef is pinned to type equipment (H3)', () => {
    expect(pinnedType(props(schema(GEMINI_REQUEST_SCHEMA_ID)).instrumentRef ?? {})).toBe('equipment');
  });

  it('instrument-log.instrumentRef is pinned to equipment (audit-retained NAME, retargeted TARGET)', () => {
    expect(pinnedType(props(schema(INSTRUMENT_LOG_SCHEMA_ID)).instrumentRef ?? {})).toBe('equipment');
  });

  it('equipment.schema.yaml RETIRES its reciprocal instrumentRef (memo §5 defect)', () => {
    expect(findProperty(schema(EQUIPMENT_SCHEMA_ID), 'instrumentRef')).toBeUndefined();
  });

  it('equipment.ui.yaml RETIRES the Linked Instrument field (refKind: instrument)', async () => {
    const text = await readFile(join(REPO_ROOT, 'schema', 'lab', 'equipment.ui.yaml'), 'utf8');
    expect(text).not.toMatch(/refKind:\s*"instrument"/);
    expect(text).not.toMatch(/\$\.instrumentRef/);
  });

  it('equipment.lint.yaml drops the instrumentRef guard entry', async () => {
    const text = await readFile(join(REPO_ROOT, 'schema', 'lab', 'equipment.lint.yaml'), 'utf8');
    expect(text).not.toMatch(/-\s+instrumentRef/);
  });

  it('labware-instance location names equipment as the resolution target (word survives)', () => {
    const ref = findProperty(schema(LABWARE_INSTANCE_SCHEMA_ID), 'ref') as Record<string, unknown> | undefined;
    expect(String(ref?.description ?? '')).toContain('equipment');
  });

  it('experiment.instruments convenience list retargets its description to equipment', () => {
    const instruments = findProperty(schema(EXPERIMENT_SCHEMA_ID), 'instruments') as Record<string, unknown> | undefined;
    expect(String(instruments?.description ?? '')).toContain('equipment');
  });

  it('run-timeline.instrument display field names equipment as its resolution target', () => {
    const instrument = findProperty(schema(RUN_TIMELINE_SCHEMA_ID), 'instrument') as Record<string, unknown> | undefined;
    expect(String(instrument?.description ?? '')).toContain('equipment');
  });
});

// ---------------------------------------------------------------------------
// (B) the gate is capability-resolved, not kind-resolved
// ---------------------------------------------------------------------------

async function gateModule() {
  // Dynamic import so the (A) text assertions still run RED before the module exists.
  return import('./DeclaredCapabilityGate.js');
}

async function createFixture(input: {
  equipmentId: string;
  classRef: Record<string, unknown>;
  capabilityId: string;
  capabilityClassRef: Record<string, unknown>;
  verbId: string;
  verbCanonical: string;
}): Promise<void> {
  const verbs: RecordEnvelope[] = await store.list({ kind: 'verb-definition' });
  if (!verbs.some((e) => (e.payload as { id?: string }).id === input.verbId)) {
    await store.create({
      envelope: {
        recordId: input.verbId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml',
        payload: {
          kind: 'verb-definition',
          id: input.verbId,
          canonical: input.verbCanonical,
          label: input.verbCanonical.toUpperCase(),
        },
      },
      message: 'seed verb for gate test',
    });
  }

  if (input.classRef.kind === 'record') {
    const classes = await store.list({ kind: 'equipment-class' });
    const classId = String((input.classRef as Record<string, unknown>).id);
    if (!classes.some((e) => (e.payload as { id?: string }).id === classId)) {
      await store.create({
        envelope: {
          recordId: classId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/equipment-class.schema.yaml',
          payload: { kind: 'equipment-class', id: classId, name: classId },
        },
        message: 'seed class for gate test',
      });
    }
  }

  await store.create({
    envelope: {
      recordId: input.equipmentId,
      schemaId: EQUIPMENT_SCHEMA_ID,
      payload: { kind: 'equipment', id: input.equipmentId, name: input.equipmentId, equipmentClassRef: input.classRef },
    },
    message: 'seed equipment for gate test',
  });

  await store.create({
    envelope: {
      recordId: input.capabilityId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml',
      payload: {
        kind: 'equipment-capability',
        id: input.capabilityId,
        status: 'active',
        equipmentClassRef: input.capabilityClassRef,
        capabilities: [{ verbRef: { kind: 'record', type: 'verb-definition', id: input.verbId } }],
      },
    },
    message: 'seed capability for gate test',
  });
}

async function seedReadEventGraph(recordId: string): Promise<void> {
  await store.create({
    envelope: {
      recordId,
      schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
      payload: {
        kind: 'event-graph',
        recordId,
        id: recordId,
        events: [
          {
            eventId: 'EVT-read-1',
            event_type: 'read',
            details: { wells: ['A1'] },
            semanticKeyComponents: { verb: 'read', identity: { plate: 'LW-IC1' }, phaseId: 'p1', ordinal: 1 },
          },
        ],
        labwares: [{ labwareId: 'LW-IC1', labwareType: 'plate_96' }],
      },
    },
    message: 'seed event-graph for gate test',
  });
}

const CL_ORBITAL = { kind: 'ontology', id: 'CL:orbital_shaker', namespace: 'CL', label: 'Orbital shaker' };
const CL_PLATE_READER = { kind: 'ontology', id: 'CL:plate_reader', namespace: 'CL', label: 'Plate reader' };
const QS5_CLASS_REF = { kind: 'record', type: 'equipment-class', id: 'EQC-QUANTSTUDIO5' };

describe('C2 capability gate: rejects a kind-correct equipment WITHOUT the verb binding (verified-by 3)', () => {
  beforeAll(async () => {
    // EQP-IC1-SHAKER: kind-correct equipment bound ONLY to VERB-SHAKE.
    await createFixture({
      equipmentId: 'EQP-IC1-SHAKER',
      classRef: CL_ORBITAL,
      capabilityId: 'ECP-IC1-SHAKER',
      capabilityClassRef: CL_ORBITAL,
      verbId: 'VERB-SHAKE',
      verbCanonical: 'shake',
    });
    // EQP-IC1-READER: kind-correct equipment bound ONLY to VERB-READ (ECP-QUANTSTUDIO5 shape).
    await createFixture({
      equipmentId: 'EQP-IC1-READER',
      classRef: QS5_CLASS_REF,
      capabilityId: 'ECP-IC1-READER',
      capabilityClassRef: QS5_CLASS_REF,
      verbId: 'VERB-READ',
      verbCanonical: 'read',
    });
    await seedReadEventGraph('EVG-IC1-GATE');
  });

  function measurementPayload(equipmentId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      kind: 'measurement',
      recordId: 'MSR-IC1-GATE',
      title: 'gate probe',
      assayType: 'plate_reader',
      data: [{ well: 'A1', metric: 'RFU', value: 1 }],
      equipmentRef: { kind: 'record', type: 'equipment', id: equipmentId },
      eventGraphRef: { kind: 'record', type: 'event-graph', id: 'EVG-IC1-GATE' },
      readEventRef: 'EVT-read-1',
      ...overrides,
    };
  }

  it('REJECTS a kind-correct equipment whose capability inventory lacks the read verb', async () => {
    const { evaluateDeclaredCapabilityGate } = await gateModule();
    const result = await evaluateDeclaredCapabilityGate({
      payload: measurementPayload('EQP-IC1-SHAKER'),
      schemaId: MEASUREMENT_SCHEMA_ID,
      validator,
      store,
    });
    expect(result).not.toBeNull();
    expect(result!.code).toBe('capability_gate_unsupported');
    expect(result!.equipmentId).toBe('EQP-IC1-SHAKER');
    expect(result!.verbId).toBe('VERB-READ');
  });

  it('ACCEPTS the same shape when the equipment declares the read verb (ECP-QUANTSTUDIO5 precedent)', async () => {
    const { evaluateDeclaredCapabilityGate } = await gateModule();
    const result = await evaluateDeclaredCapabilityGate({
      payload: measurementPayload('EQP-IC1-READER'),
      schemaId: MEASUREMENT_SCHEMA_ID,
      validator,
      store,
    });
    expect(result).toBeNull();
  });

  it('FAILS CLOSED when the verb chain is absent (no silent pass)', async () => {
    const { evaluateDeclaredCapabilityGate } = await gateModule();
    const payload = measurementPayload('EQP-IC1-READER');
    delete payload.eventGraphRef;
    delete payload.readEventRef;
    const result = await evaluateDeclaredCapabilityGate({
      payload,
      schemaId: MEASUREMENT_SCHEMA_ID,
      validator,
      store,
    });
    expect(result).not.toBeNull();
    expect(result!.code).toBe('capability_gate_verb_unresolvable');
  });

  it('the gate exists ONLY because the YAML declares it (rip-out proof)', async () => {
    const { evaluateDeclaredCapabilityGate } = await gateModule();
    const stripped = structuredClone(schema(MEASUREMENT_SCHEMA_ID));
    delete (props(stripped).equipmentRef as Record<string, unknown>)['x-capability-gate'];
    const strippedId = `${MEASUREMENT_SCHEMA_ID}-unannotated`;
    stripped.$id = strippedId;
    validator.addSchema(stripped as never, strippedId);
    const result = await evaluateDeclaredCapabilityGate({
      payload: measurementPayload('EQP-IC1-SHAKER'),
      schemaId: strippedId,
      validator,
      store,
    });
    expect(result).toBeNull();
  });

  it('planned-run compiled step: sibling verbRef drives the gate (reject mismatched, accept matched)', async () => {
    const { evaluateDeclaredCapabilityGate } = await gateModule();
    const plannedRun = (equipmentId: string, verbId: string): Record<string, unknown> => ({
      kind: 'planned-run',
      recordId: 'PLR-IC1-GATE',
      title: 'gate probe',
      sourceType: 'protocol',
      sourceRef: { kind: 'record', type: 'protocol', id: 'PROTO-IC1' },
      state: 'draft',
      protocolCompilation: {
        status: 'ready',
        sourceLayer: 'universal',
        targetLayer: 'lab',
        steps: [
          {
            stepId: 's1',
            kind: 'read',
            canonicalVerb: 'read',
            executionMode: 'instrument',
            disposition: 'allowed',
            requiresConfirmation: false,
            verbRef: { kind: 'record', type: 'verb-definition', id: verbId },
            equipmentRef: { kind: 'record', type: 'equipment', id: equipmentId },
          },
        ],
      },
    });

    const rejected = await evaluateDeclaredCapabilityGate({
      payload: plannedRun('EQP-IC1-SHAKER', 'VERB-READ'),
      schemaId: PLANNED_RUN_SCHEMA_ID,
      validator,
      store,
    });
    expect(rejected).not.toBeNull();
    expect(rejected!.code).toBe('capability_gate_unsupported');

    const accepted = await evaluateDeclaredCapabilityGate({
      payload: plannedRun('EQP-IC1-READER', 'VERB-READ'),
      schemaId: PLANNED_RUN_SCHEMA_ID,
      validator,
      store,
    });
    expect(accepted).toBeNull();
  });

  it('the verb is resolved from DATA: resolveEquipmentSupport is the only capability authority (no name-literal path)', async () => {
    // The same equipment the gate rejected for VERB-READ IS supported for VERB-SHAKE —
    // proof the rejection came from the resolved capability data, not from a device name.
    const capabilityService = new EquipmentCapabilityService(store);
    const shake = await capabilityService.resolveEquipmentSupport({ equipmentId: 'EQP-IC1-SHAKER', verbId: 'VERB-SHAKE' });
    const read = await capabilityService.resolveEquipmentSupport({ equipmentId: 'EQP-IC1-SHAKER', verbId: 'VERB-READ' });
    expect(shake.supported).toBe(true);
    expect(read.supported).toBe(false);
  });
});
