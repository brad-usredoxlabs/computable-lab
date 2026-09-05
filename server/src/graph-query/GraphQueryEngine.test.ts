/**
 * GraphQueryEngine tests — one test per §5 primitive.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphEdgeIndex } from './GraphEdgeIndex.js';
import { GraphQueryEngine, type GraphQueryEngineDeps } from './GraphQueryEngine.js';
import type { GraphQuery } from './types.js';
import type { ProjectedGraph } from './GraphProjector.js';

interface RecordEnvelope {
  recordId: string;
  schemaId: string;
  payload: Record<string, unknown>;
}

/** A self-contained fixture graph used across primitives. */
function buildFixture(): {
  engine: GraphQueryEngine;
  well: string;
  treatment: string;
  measurement: string;
} {
  const index = GraphEdgeIndex.inMemory();
  const evgRecordId = 'EVG-ros-001';

  // event-graph projection: rotenone added to A1/A2, FITC read with value
  const projected: ProjectedGraph = {
    nodes: [
      { id: 'well:EVG-ros-001:plate1:A1', type: 'well', label: 'A1', properties: { labwareId: 'plate1' }, source: { recordId: evgRecordId } },
      { id: 'well:EVG-ros-001:plate1:A2', type: 'well', label: 'A2', properties: { labwareId: 'plate1' }, source: { recordId: evgRecordId } },
      { id: 'treatment:EVG-ros-001:plate1:MAT-rotenone', type: 'treatment', label: 'MAT-rotenone', properties: { materialRef: 'MAT-rotenone', name: 'rotenone' }, source: { recordId: evgRecordId } },
      { id: 'measurement:EVG-ros-001:plate1:FITC', type: 'measurement', label: 'FITC', properties: { channel: 'FITC', value: 1.2, name: 'FITC' }, source: { recordId: evgRecordId } },
    ],
    edges: [
      { source: 'well:EVG-ros-001:plate1:A1', verb: 'treated_with', target: 'treatment:EVG-ros-001:plate1:MAT-rotenone' },
      { source: 'well:EVG-ros-001:plate1:A2', verb: 'treated_with', target: 'treatment:EVG-ros-001:plate1:MAT-rotenone' },
      { source: 'well:EVG-ros-001:plate1:A1', verb: 'measured_at', target: 'measurement:EVG-ros-001:plate1:FITC' },
      { source: 'well:EVG-ros-001:plate1:A2', verb: 'measured_at', target: 'measurement:EVG-ros-001:plate1:FITC' },
    ],
  };

  index.build({
    records: [
      { recordId: 'MAT-rotenone', kind: 'material', label: 'Rotenone' },
      { recordId: 'RUN-421', kind: 'run', label: 'Run 421' },
      { recordId: evgRecordId, kind: 'event-graph', label: 'ROS graph' },
    ],
    refs: new Map([
      ['EVG-ros-001', [{ recordId: 'RUN-421', kind: 'run' }]],
    ]),
    relationshipEdges: [{ sourceId: 'RUN-421', targetId: 'MAT-rotenone', verb: 'uses' }],
    eventGraphProjections: [{ recordId: evgRecordId, projected }],
  });

  const stores: Record<string, RecordEnvelope> = {
    'MAT-rotenone': { recordId: 'MAT-rotenone', schemaId: 'mat', payload: { kind: 'material', name: 'Rotenone', domain: 'chemical' } },
    'RUN-421': { recordId: 'RUN-421', schemaId: 'run', payload: { kind: 'run', name: 'Run 421', status: 'completed' } },
    'EVG-ros-001': { recordId: 'EVG-ros-001', schemaId: 'evg', payload: { kind: 'event-graph', name: 'ROS graph', runId: 'RUN-421', links: { runId: 'RUN-421' } } },
  };

  const deps: GraphQueryEngineDeps = {
    index,
    store: {
      get: async (id) => stores[id] ?? null,
      list: async () => Object.values(stores),
      exists: async (id) => id in stores,
    },
  };

  const engine = new GraphQueryEngine(deps);
  return {
    engine,
    well: 'well:EVG-ros-001:plate1:A1',
    treatment: 'treatment:EVG-ros-001:plate1:MAT-rotenone',
    measurement: 'measurement:EVG-ros-001:plate1:FITC',
  };
}

async function run(engine: GraphQueryEngine, q: GraphQuery) {
  return engine.execute(q);
}

describe('GraphQueryEngine', () => {
  let f: ReturnType<typeof buildFixture>;

  beforeEach(() => {
    f = buildFixture();
  });

  it('get: returns a single object with its properties and provenance', async () => {
    const res = await run(f.engine, { op: 'get', objectId: f.well });
    expect(res.result_type).toBe('object');
    expect(res.objects).toHaveLength(1);
    expect(res.objects[0]?.id).toBe(f.well);
    expect(res.objects[0]?.source?.recordId).toBe('EVG-ros-001');
  });

  it('get: returns null-style empty for unknown object', async () => {
    const res = await run(f.engine, { op: 'get', objectId: 'nope' });
    expect(res.result_type).toBe('object');
    expect(res.objects).toHaveLength(0);
    expect(res.summary.count).toBe(0);
  });

  it('find: finds wells treated with rotenone (dotted relationship expansion)', async () => {
    const res = await run(f.engine, {
      op: 'find',
      type: 'well',
      where: [{ field: 'treatment.name', operator: '=', value: 'rotenone' }],
    });
    expect(res.result_type).toBe('collection');
    expect(res.summary.count).toBe(2);
    const ids = res.objects.map((o) => o.id);
    expect(ids).toContain('well:EVG-ros-001:plate1:A1');
    expect(ids).toContain('well:EVG-ros-001:plate1:A2');
  });

  it('find: filters wells by measurement channel across the measured_at edge', async () => {
    const res = await run(f.engine, {
      op: 'find',
      type: 'well',
      where: [{ field: 'measurement.channel', operator: '=', value: 'FITC' }],
    });
    expect(res.summary.count).toBe(2);
  });

  it('find: filters records by direct field (material domain)', async () => {
    const res = await run(f.engine, {
      op: 'find',
      type: 'material',
      where: [{ field: 'domain', operator: '=', value: 'chemical' }],
    });
    expect(res.summary.count).toBe(1);
    expect(res.objects[0]?.id).toBe('MAT-rotenone');
  });

  it('find: applies a run scope via refs', async () => {
    // scoped under RUN-421 (event-graph refs RUN-421), A1/A2 still found
    const res = await run(f.engine, {
      op: 'find',
      type: 'well',
      scope: { type: 'Run', id: 'RUN-421' },
    });
    expect(res.summary.count).toBe(2);
    // scope under an unknown run yields nothing
    const none = await run(f.engine, {
      op: 'find',
      type: 'well',
      scope: { type: 'Run', id: 'RUN-xxx' },
    });
    expect(none.summary.count).toBe(0);
  });

  it('traverse: follows outgoing edges from a node (with verb + targetType)', async () => {
    const res = await run(f.engine, {
      op: 'traverse',
      start: f.well,
      relationship: 'treated_with',
      direction: 'out',
    });
    expect(res.result_type).toBe('collection');
    expect(res.objects.map((o) => o.id)).toContain(f.treatment);
  });

  it('path: finds a path between two known objects', async () => {
    const res = await run(f.engine, {
      op: 'path',
      from: f.well,
      to: f.treatment,
    });
    expect(res.result_type).toBe('path');
    expect(res.relationships.length).toBeGreaterThan(0);
  });

  it('neighborhood: returns a bounded subgraph around an object', async () => {
    const res = await run(f.engine, {
      op: 'neighborhood',
      objects: [f.well],
      depth: 1,
    });
    expect(res.summary.count).toBeGreaterThanOrEqual(1);
  });

  it('lineage: returns upstream derivation (in-edges) for a treatment', async () => {
    const res = await run(f.engine, {
      op: 'lineage',
      object: f.treatment,
      direction: 'up',
    });
    expect(res.summary.count).toBe(2); // both wells treat it
  });

  it('aggregate: mean of measurement value grouped by compound', async () => {
    const res = await run(f.engine, {
      op: 'aggregate',
      query: { op: 'find', type: 'measurement' },
      groupBy: 'compound',
      measures: [{ name: 'mean_val', field: 'value', op: 'mean' }],
    });
    expect(res.result_type).toBe('aggregate');
    expect(res.summary.groups).toBeDefined();
    expect(res.summary.count).toBeGreaterThanOrEqual(1);
  });

  it('exists: returns a boolean scalar', async () => {
    const res = await run(f.engine, {
      op: 'exists',
      query: { op: 'find', type: 'well', where: [{ field: 'measurement.channel', operator: '=', value: 'FITC' }] },
    });
    expect(res.result_type).toBe('boolean');
    expect(res.summary.count).toBe(1);
    const no = await run(f.engine, {
      op: 'exists',
      query: { op: 'find', type: 'well', where: [{ field: 'measurement.channel', operator: '=', value: 'CY5' }] },
    });
    expect(no.summary.count).toBe(0);
  });

  it('find: honors limit', async () => {
    const res = await run(f.engine, {
      op: 'find',
      type: 'well',
      limit: 1,
    });
    expect(res.summary.count).toBe(1);
  });

  it('produces a query_id and explain when requested', async () => {
    const res = await run(f.engine, {
      op: 'find',
      type: 'well',
      where: [{ field: 'treatment.name', operator: '=', value: 'rotenone' }],
      explain: true,
    });
    expect(res.query_id).toMatch(/^qry_/);
    expect(typeof res.explain).toBe('string');
    expect(res.explain!.length).toBeGreaterThan(0);
  });
});