/**
 * VesselContextResolver tests — given a material, finds the tube/stock/aliquot
 * vessel contexts associated with it (spec all-possibilities: plates AND
 * tubes/master stocks are both searchable).
 */
import { describe, it, expect } from 'vitest';
import { GraphEdgeIndex } from './GraphEdgeIndex.js';
import { VesselContextResolver } from './VesselContextResolver.js';
import type { GraphNode } from './types.js';

function stockNode(id: string, name: string, overrides: Record<string, unknown> = {}): GraphNode {
  return {
    id,
    type: 'material-instance',
    label: name,
    properties: {
      name,
      storage: { location: 'Freezer -20C', temperature_C: -20 },
      status: 'available',
      ...overrides,
    },
  };
}

function aliquotNode(id: string, name: string): GraphNode {
  return { id, type: 'aliquot', label: name, properties: { name } };
}

function buildIndex(nodes: GraphNode[], edges: Array<{ source: string; verb: string; target: string }>): GraphEdgeIndex {
  const index = GraphEdgeIndex.inMemory();
  for (const n of nodes) index.addNode(n);
  for (const e of edges) index.addEdge(e);
  return index;
}

describe('VesselContextResolver', () => {
  it('finds material-instance (stock) and aliquot contexts that reference a material', () => {
    const index = buildIndex(
      [
        { id: 'MAT-clofibrate', type: 'material', label: 'Clofibrate' },
        stockNode('MINST-1', '100x Clofibrate stock', { storage: { location: 'Freezer -20C', temperature_C: -20 }, concentration: { value: 100, unit: 'mM' } }),
        aliquotNode('ALQ-1', 'Clofibrate aliquot 50 uL'),
      ],
      [
        { source: 'MINST-1', verb: 'refers_to', target: 'MAT-clofibrate' },
        { source: 'ALQ-1', verb: 'refers_to', target: 'MAT-clofibrate' },
      ],
    );
    const resolver = new VesselContextResolver(index);
    const result = resolver.resolveVesselContexts('MAT-clofibrate');
    expect(result.instances.length).toBe(1);
    expect(result.instances[0]!.id).toBe('MINST-1');
    expect(result.aliquots.length).toBe(1);
    expect(result.aliquots[0]!.id).toBe('ALQ-1');
    // the stock's storage surfaces for the "freezer" story
    expect(result.instances[0]!.properties?.storage).toMatchObject({ location: 'Freezer -20C' });
  });

  it('returns empty when no vessel contexts exist for the material', () => {
    const index = buildIndex(
      [{ id: 'MAT-alone', type: 'material', label: 'Alone' }],
      [],
    );
    const resolver = new VesselContextResolver(index);
    const result = resolver.resolveVesselContexts('MAT-alone');
    expect(result.instances).toHaveLength(0);
    expect(result.aliquots).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('counts only distinct instances/aliquots', () => {
    const index = buildIndex(
      [
        { id: 'MAT', type: 'material', label: 'M' },
        stockNode('MINST-1', 'stock'),
        stockNode('MINST-2', 'other stock'),
      ],
      [
        { source: 'MINST-1', verb: 'refers_to', target: 'MAT' },
        { source: 'MINST-2', verb: 'refers_to', target: 'MAT' },
      ],
    );
    const resolver = new VesselContextResolver(index);
    const result = resolver.resolveVesselContexts('MAT');
    expect(result.instances).toHaveLength(2);
    expect(result.count).toBe(2);
  });
});