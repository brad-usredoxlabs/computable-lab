/**
 * u2pubgate (RED -> GREEN). RED: an ingest with an eventGraphRef but NO
 * readEventRef must derive its read-event provenance pointer from the graph's
 * OWN stored data (last event with event_type 'read') — today the payload
 * keeps it absent (passthrough), so the declared capability gate fails closed
 * with capability_gate_verb_unresolvable. "A reported use is not independent
 * verification" — the pointer comes from the graph's data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import type { AjvValidator } from '../validation/AjvValidator.js';
import type { RecordStoreImpl } from '../store/RecordStoreImpl.js';
import type { AppContext } from '../server.js';
import { MeasurementService } from './MeasurementService.js';

const SCHEMA_DIR = join(new URL('.', import.meta.url).pathname, '..', '..', '..', 'schema');
const MEASUREMENT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const VERB_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/verb-definition.schema.yaml';
const CLASS_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment-class.schema.yaml';
const EQUIP_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment.schema.yaml';
const CAP_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/equipment-capability.schema.yaml';
const GRAPH_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml';
const UNRESOLVABLE = 'capability gate: no verb-definition could be resolved from the payload data for equipment EQP-U2-READER (fail closed)';

let store: RecordStoreImpl;
let validator: AjvValidator;
let repo: ReturnType<typeof createLocalRepoAdapter>;
let testDir: string;
let rawPath: string;

beforeAll(async () => {
  const entries = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true }).then((r) => r.entries);
  const registry = createSchemaRegistry();
  registry.addSchemas(entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
  const lintEngine = createLintEngine();
  for (const { name, spec } of await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true }).then((r) => r.specs)) {
    if (spec.rules.length > 0) lintEngine.addSpec(name, spec);
  }
  testDir = await mkdtemp(join(tmpdir(), `u2pubgate-${randomUUID()}`));
  await mkdir(join(testDir, 'records', 'inbox'), { recursive: true });
  repo = createLocalRepoAdapter({ basePath: testDir });
  store = createRecordStore(repo, validator, lintEngine);
  rawPath = 'raw/plate-read-u2.csv';
  await mkdir(join(testDir, 'raw'), { recursive: true });
  await writeFile(join(testDir, rawPath), 'well,metric,value\nA1,OD,0.5\nA2,OD,0.75\n');
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

const ctx = (): AppContext => ({ store, validator, repoAdapter: repo } as unknown as AppContext);

async function seed(recordId: string, schemaId: string, payload: Record<string, unknown>): Promise<void> {
  const res = await store.create({ envelope: { recordId, schemaId, payload }, message: `seed ${recordId} (u2pubgate)` });
  if (!res.success) throw new Error(`seed ${recordId} failed: ${res.error ?? ''}`);
}

const classRef = { kind: 'record', type: 'equipment-class', id: 'EQC-U2-READER' };
const verbRef = { kind: 'record', type: 'verb-definition', id: 'VERB-READ-U2' };

async function seedFixtures(): Promise<void> {
  // Fixture shape mirrors the passing DeclaredCapabilityGate.test.ts.
  await seed('VERB-READ-U2', VERB_SCHEMA_ID, { kind: 'verb-definition', id: 'VERB-READ-U2', canonical: 'read', label: 'READ' });
  await seed('EQC-U2-READER', CLASS_SCHEMA_ID, { kind: 'equipment-class', id: 'EQC-U2-READER', name: 'EQC-U2-READER' });
  await seed('EQP-U2-READER', EQUIP_SCHEMA_ID, { kind: 'equipment', id: 'EQP-U2-READER', name: 'EQP-U2-READER', equipmentClassRef: classRef });
  await seed('ECP-U2-READER', CAP_SCHEMA_ID, {
    kind: 'equipment-capability', id: 'ECP-U2-READER', status: 'active', equipmentClassRef: classRef,
    capabilities: [{ verbRef }],
  });
  // Graph WITH a read event (the gate's resolver reads its semanticKeyComponents.verb;
  // this is fixture DATA, not a verb reader — the helper reads event_type only).
  await seed('EVG-U2-READ', GRAPH_SCHEMA_ID, {
    kind: 'event-graph', recordId: 'EVG-U2-READ', id: 'EVG-U2-READ', labwares: [],
    events: [
      { eventId: 'EVT-U2-shake', event_type: 'mix', details: { wells: ['A1'] } },
      { eventId: 'EVT-U2-read', event_type: 'read', details: { wells: ['A1'] },
        semanticKeyComponents: { verb: 'read', identity: { plate: 'LW-U2' }, phaseId: 'p1', ordinal: 1 } },
    ],
  });
  // Graph with NO read event (the fail-closed arm stays as today).
  await seed('EVG-U2-NOREAD', GRAPH_SCHEMA_ID, {
    kind: 'event-graph', recordId: 'EVG-U2-NOREAD', id: 'EVG-U2-NOREAD', labwares: [],
    events: [{ eventId: 'EVT-U2-mix', event_type: 'mix', details: { wells: ['A1'] } }],
  });
}

const ingest = (graphId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  eventGraphRef: { kind: 'record', type: 'event-graph', id: graphId },
  equipmentRef: { kind: 'record', type: 'equipment', id: 'EQP-U2-READER' },
  rawData: { path: rawPath },
  ...overrides,
});

describe('u2pubgate: read-event provenance derived from the stored event-graph', () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  it('eventGraphRef + NO readEventRef stores readEventRef = the graph read event id', async () => {
    const { recordId } = await new MeasurementService(ctx()).ingest(ingest('EVG-U2-READ') as never);
    const payload = (await store.get(recordId))?.payload as { readEventRef?: string; eventGraphRef?: { id: string } };
    expect(payload.eventGraphRef?.id).toBe('EVG-U2-READ');
    // RED today: the payload lacks readEventRef (passthrough-only) despite the graph read event.
    expect(payload.readEventRef).toBe('EVT-U2-read');
  });

  it('the derived pointer lets the REAL gate resolve the verb (no verb_unresolvable)', async () => {
    let ingested = false;
    try {
      await new MeasurementService(ctx()).ingest(ingest('EVG-U2-READ') as never);
      ingested = true;
    } catch (err) {
      const e = err as { code?: string; message?: string };
      expect(e.code, `unexpected gate refusal: ${e.message}`).not.toBe('capability_gate_verb_unresolvable');
      throw err;
    }
    expect(ingested).toBe(true);
  });

  it('a graph with NO read event: gate fails closed with the unchanged named error, no record', async () => {
    await expect(new MeasurementService(ctx()).ingest(ingest('EVG-U2-NOREAD') as never)).rejects.toMatchObject({
      code: 'capability_gate_verb_unresolvable',
      message: UNRESOLVABLE,
    });
    const stored = await store.list({ kind: 'measurement' });
    expect(stored.some((envelope) => (envelope.payload as { eventGraphRef?: { id: string } }).eventGraphRef?.id === 'EVG-U2-NOREAD')).toBe(false);
  });

  it('an explicit readEventRef on the request is preserved (never overridden)', async () => {
    const { recordId } = await new MeasurementService(ctx()).ingest(ingest('EVG-U2-READ', { readEventRef: 'EVT-U2-read' }) as never);
    expect(((await store.get(recordId))?.payload as { readEventRef?: string }).readEventRef).toBe('EVT-U2-read');
  });
});
