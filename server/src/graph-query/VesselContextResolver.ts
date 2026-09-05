/**
 * VesselContextResolver — given a material, find the tube / stock / aliquot
 * vessel contexts that reference it.
 *
 * Plates are one way a material appears (well nodes from event-graphs). A
 * material may ALSO exist as a `material-instance` (a stock, e.g. "100x
 * clofibrate in the freezer") or an `aliquot`. This resolver walks the graph
 * index's incoming edges to a material node and buckets the source nodes by
 * kind, so a search can answer "all the vessels that hold clofibrate" — plates
 * AND stocks/tubes together (spec § all-possibilities).
 */

import type { GraphEdgeIndex } from './GraphEdgeIndex.js';
import type { GraphNode } from './types.js';

export interface VesselContextResult {
  /** `material-instance` nodes (stocks / bottles / tubes) referencing the material. */
  instances: GraphNode[];
  /** `aliquot` nodes referencing the material. */
  aliquots: GraphNode[];
  /** Total vessel contexts found. */
  count: number;
}

export class VesselContextResolver {
  constructor(private readonly index: GraphEdgeIndex) {}

  /**
   * Resolve vessel contexts for a material id by finding all source nodes whose
   * outgoing edge points at the material. Edge verbs considered are `refers_to`
   * (record refs) and any typed relationship targeting the material.
   */
  resolveVesselContexts(materialId: string): VesselContextResult {
    const instances: GraphNode[] = [];
    const aliquots: GraphNode[] = [];

    for (const edge of this.index.in(materialId)) {
      const source = this.index.node(edge.source);
      if (!source) continue;
      if (source.type === 'material-instance') instances.push(source);
      else if (source.type === 'aliquot') aliquots.push(source);
    }

    return {
      instances,
      aliquots,
      count: instances.length + aliquots.length,
    };
  }
}