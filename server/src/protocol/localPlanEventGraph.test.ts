// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { buildLocalPlanGraph } from './localPlanGraph.js';
import { toLocalPlanEventGraphDocument } from './localPlanEventGraph.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const EVENT_GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';

// The allowed set comes from the SCHEMA, not from the expander's verb union:
// allowedEventTypes = $defs.PlateEvent.properties.event_type.enum
// (schema/workflow/event-graph.schema.yaml:313-339 = 27 members at base 5635fc8e).
let allowedEventTypes: string[] = [];
let validate: (payload: unknown, schemaId: string) => { valid: boolean; errors?: unknown[] };

beforeAll(async () => {
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: `${process.cwd()}/../schema`, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const entry = registry.getById(EVENT_GRAPH_SCHEMA_ID);
  if (!entry) throw new Error(`schema not registered: ${EVENT_GRAPH_SCHEMA_ID}`);
  const schema = entry.schema as { $defs?: Record<string, any> };
  allowedEventTypes = schema.$defs?.PlateEvent?.properties?.event_type?.enum ?? [];
  expect(allowedEventTypes).toHaveLength(27);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const each = registry.getById(id);
    if (each) validator.addSchema(each.schema, each.id);
  }
  validate = (payload, schemaId) => validator.validate(payload, schemaId);
});

const labwareRef = { kind: 'record', id: 'LBW-1', type: 'labware-instance' };
const materialRef = { kind: 'record', id: 'MAT-1', type: 'material-instance' };
const instrumentRef = { kind: 'record', id: 'EQ-1', type: 'equipment' };

const roles = {
  labwareRoles: [{ roleId: 'plate' }],
  materialRoles: [{ roleId: 'reagent' }],
  instrumentRoles: [{ roleId: 'reader' }],
};

const addStep = {
  stepId: 'add-compound', label: 'Add compound', ordinal: 1, kind: 'add_material',
  target: { labwareRole: 'plate' }, wells: 'A1',
  material: { materialRole: 'reagent' }, volume_uL: 50,
};
const readStep = {
  stepId: 'read-plate', label: 'Read plate', ordinal: 2, kind: 'read',
  target: { labwareRole: 'plate' }, wells: 'A1', instrumentRole: 'reader',
};
// In the expander's primitive union (BiologyVerbExpander.ts:15) but NOT in the
// event-graph schema enum — the exact drift this unit exists to refuse.
const spinStep = {
  stepId: 'spin-plate', label: 'Spin plate', ordinal: 2, kind: 'centrifuge',
  target: { labwareRole: 'plate' }, instrumentRole: 'reader',
};

const bindings = {
  labware: [{ roleId: 'plate', labwareInstanceRef: labwareRef }],
  materials: [{ roleId: 'reagent', materialRef }],
  instruments: [{ roleId: 'reader', instrumentRef }],
};

function planOf(steps: unknown[]) {
  const plan = buildLocalPlanGraph({ protocolId: 'PRT-1', protocol: { roles, steps }, bindings });
  if (!plan.ok) throw new Error(`plan failed: ${JSON.stringify(plan)}`);
  return plan.events;
}

describe('toLocalPlanEventGraphDocument', () => {
  it('projects plan events 1:1 into the events of an event-graph document', () => {
    const events = planOf([addStep, readStep]);
    const result = toLocalPlanEventGraphDocument({ id: 'EVG-1', name: 'Seeding Method', events, allowedEventTypes });
    if (!result.ok) throw new Error(`projection failed: ${JSON.stringify(result)}`);
    const { document } = result;

    expect(document.kind).toBe('event-graph');
    expect(document.id).toBe('EVG-1');
    expect(document.name).toBe('Seeding Method');
    expect(document.labwares).toEqual([]);
    expect(document.events).toHaveLength(2);
    // Identity per event: same ids, same verb, same details payload (copied, not normalized).
    expect(document.events.map((e) => [e.eventId, e.stepId, e.event_type])).toEqual(
      events.map((e) => [e.eventId, e.stepId, e.event_type]),
    );
    document.events.forEach((event, index) => {
      expect(event.details).toBe(events[index].details);
      expect(event.details).toEqual(events[index].details);
    });
    // Only the schema-required members plus optional name: the attach path owns the rest.
    expect(Object.keys(document).sort()).toEqual(['events', 'id', 'kind', 'labwares', 'name']);
    for (const owned of ['status', 'links', 'methodContext', 'createdAt', 'createdBy']) {
      expect(document).not.toHaveProperty(owned);
    }
    expect(validate(document, EVENT_GRAPH_SCHEMA_ID).valid).toBe(true);
  });

  it('omits name entirely when the caller supplies none', () => {
    const result = toLocalPlanEventGraphDocument({ id: 'EVG-2', events: planOf([readStep]), allowedEventTypes });
    if (!result.ok) throw new Error(`projection failed: ${JSON.stringify(result)}`);
    expect(result.document).not.toHaveProperty('name');
    expect(validate(result.document, EVENT_GRAPH_SCHEMA_ID).valid).toBe(true);
  });

  it('refuses an event_type outside the schema enum, naming the event and step', () => {
    // Same allowedEventTypes value the passing legs use: it accepts add_material and rejects centrifuge.
    expect(allowedEventTypes).toContain('add_material');
    expect(allowedEventTypes).not.toContain('centrifuge');

    const result = toLocalPlanEventGraphDocument({
      id: 'EVG-3', events: planOf([addStep, spinStep]), allowedEventTypes,
    });
    expect(result).toEqual({ ok: false, code: 'UNSUPPORTED_EVENT_TYPE', eventType: 'centrifuge', stepId: 'spin-plate' });
    expect(result).not.toHaveProperty('document');

    // The guard must not refuse everything: the good plan still projects.
    expect(toLocalPlanEventGraphDocument({ id: 'EVG-4', events: planOf([addStep, readStep]), allowedEventTypes }).ok)
      .toBe(true);
  });
});
