/**
 * GraphEdgeIndex tests — sqlite adjacency over record refs, relationship
 * records, and event-graph projections.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphEdgeIndex } from './GraphEdgeIndex.js';
import type { ProjectedGraph } from './GraphProjector.js';

describe('GraphEdgeIndex', () => {
  let idx: GraphEdgeIndex;

  beforeEach(() => {
    idx = GraphEdgeIndex.inMemory();
  });

  it('adds nodes and retrieves by type', () => {
    idx.addNode({ id: 'MAT-rotenone', type: 'material', label: 'Rotenone' });
    idx.addNode({ id: 'well:EVG-1:plate1:A1', type: 'well', label: 'A1' });
    const materials = idx.nodesByType('material');
    expect(materials.map((m) => m.id)).toEqual(['MAT-rotenone']);
    expect(idx.node('well:EVG-1:plate1:A1')?.label).toBe('A1');
    expect(idx.node('missing')).toBeNull();
  });

  it('out: follows outgoing edges with verb filter', () => {
    const well = 'well:EVG-1:plate1:A1';
    const treatment = 'treatment:EVG-1:plate1:MAT-rotenone';
    idx.addEdge({ source: well, verb: 'treated_with', target: treatment });
    expect(idx.out(well)).toEqual([
      { source: well, verb: 'treated_with', target: treatment },
    ]);
    expect(idx.out(well, { verb: 'measured_at' })).toEqual([]);
    expect(idx.out(well, { verb: 'treated_with' }).length).toBe(1);
    expect(idx.out(treatment)).toEqual([]);
  });

  it('in: finds incoming edges', () => {
    const well = 'well:EVG-1:plate1:A1';
    const treatment = 'treatment:EVG-1:plate1:MAT-rotenone';
    idx.addEdge({ source: well, verb: 'treated_with', target: treatment });
    expect(idx.in(treatment)).toEqual([
      { source: well, verb: 'treated_with', target: treatment },
    ]);
    expect(idx.in(well)).toEqual([]);
  });

  it('path: finds a shortest directed path between two nodes', () => {
    const well = 'well:EVG-1:plate1:A1';
    const meas = 'measurement:EVG-1:plate1:FITC';
    const result = 'RES-1';
    idx.addEdge({ source: well, verb: 'measured_at', target: meas });
    idx.addEdge({ source: meas, verb: 'generated_by', target: result });
    expect(idx.path(well, result, 5)).toEqual([
      { source: well, verb: 'measured_at', target: meas },
      { source: meas, verb: 'generated_by', target: result },
    ]);
  });

  it('path: returns null when no path exists', () => {
    const a = 'A';
    const b = 'B';
    idx.addEdge({ source: a, verb: 'refers_to', target: b });
    expect(idx.path(a, 'ZZZ', 3)).toBeNull();
  });

  it('build: indexes records + relationship edges + refs + event-graph projections', () => {
    const evgRecordId = 'EVG-1';
    const projected: ProjectedGraph = {
      nodes: [
        { id: 'well:EVG-1:plate1:A1', type: 'well', label: 'A1', source: { recordId: evgRecordId } },
        { id: 'treatment:EVG-1:plate1:MAT-rotenone', type: 'treatment', label: 'MAT-rotenone', source: { recordId: evgRecordId } },
      ],
      edges: [
        { source: 'well:EVG-1:plate1:A1', verb: 'treated_with', target: 'treatment:EVG-1:plate1:MAT-rotenone' },
      ],
    };

    idx.build({
      records: [
        { recordId: 'RUN-1', kind: 'run', label: 'Run 1' },
        { recordId: 'MAT-rotenone', kind: 'material', label: 'Rotenone' },
        { recordId: evgRecordId, kind: 'event-graph', label: 'ROS graph' },
      ],
      refs: new Map([['RUN-1', [{ recordId: 'MAT-rotenone', kind: 'material' }]]]),
      relationshipEdges: [
        { sourceId: 'RUN-1', targetId: 'MAT-rotenone', verb: 'performed_by' },
      ],
      eventGraphProjections: [{ recordId: evgRecordId, projected }],
    });

    // record nodes
    expect(idx.node('RUN-1')?.type).toBe('run');
    expect(idx.node('MAT-rotenone')?.type).toBe('material');
    // projected nodes
    expect(idx.node('well:EVG-1:plate1:A1')).not.toBeNull();
    expect(idx.node('treatment:EVG-1:plate1:MAT-rotenone')).not.toBeNull();
    // typed relationship edge RUN-1 --performed_by--> MAT-rotenone
    expect(idx.in('MAT-rotenone', { verb: 'performed_by' }).length).toBe(1);
    // record ref edge RUN-1 -> MAT-rotenone (refers_to)
    expect(idx.out('RUN-1', { verb: 'refers_to' }).length).toBe(1);
    // projected treated_with edge
    expect(idx.out('well:EVG-1:plate1:A1', { verb: 'treated_with' }).length).toBe(1);
  });
});