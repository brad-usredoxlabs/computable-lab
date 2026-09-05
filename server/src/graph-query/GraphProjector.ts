/**
 * GraphProjector — flatten an event-graph record into canonical graph nodes
 * and edges.
 *
 * Wells and measurements are NOT first-class records in computable-lab: they
 * nest inside event-graph records (schema/workflow/event-graph.schema.yaml) and
 * plate-snapshot records. This projector derives queryable well / treatment /
 * measurement nodes from an event-graph's `events[]`, giving each a stable
 * synthetic id rooted at the owning record plus provenance back to the source
 * record + event (spec §1.3).
 *
 * Defensive by design: `details` is `additionalProperties: true` in the schema
 * and real graphs vary (singular `well`, plural `wells`, nested
 * `material.materialId`, top-level `material_ref`, `labwareId` /
 * `labwareInstanceId`, ...). Absent/empty target data yields no node for that
 * event rather than throwing — missing data must never kill the whole graph.
 */

import type { GraphEdge, GraphNode } from './types.js';

/** Minimal shape of a persisted event-graph record payload (loose on purpose). */
export interface ProjectableEventGraph {
  recordId: string;
  id?: string;
  events: ProjectableEvent[];
  labwares?: Array<{ labwareId: string; name?: string; labwareType?: string }>;
}

export interface ProjectableEvent {
  eventId?: string;
  event_type: string;
  details?: Record<string, unknown>;
}

export interface ProjectedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface NodeCursor {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  source: { recordId: string; path?: string; eventId?: string };
}

export class GraphProjector {
  project(evg: ProjectableEventGraph): ProjectedGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const wellNodeIds = new Set<string>();

    const addNode = (cursor: NodeCursor): string => {
      const node: GraphNode = {
        id: cursor.id,
        type: cursor.type,
        label: cursor.label,
        properties: cursor.properties,
        source: cursor.source,
      };
      if (!nodes.some((n) => n.id === cursor.id)) nodes.push(node);
      return cursor.id;
    };

    const addEdge = (source: string, verb: string, target: string): void => {
      edges.push({ source, verb, target, direction: 'out' });
    };

    for (const event of evg.events) {
      const details = event.details ?? {};
      // Resolve the target well set + labware from the event (multiple real shapes).
      const { wells, labwareId } = this.resolveTarget(details, event);

      // A well node is created once per (record, labware, label).
      const wellIds = wells.map((well) => {
        const id = this.wellId(evg.recordId, labwareId, well);
        addNode({
          id,
          type: 'well',
          label: well,
          properties: { labwareId },
          source: this.source(evg.recordId, event),
        });
        wellNodeIds.add(id);
        return id;
      });

      if (event.event_type === 'add_material' && wellIds.length > 0) {
        const materialRef = this.resolveMaterial(details);
        if (materialRef) {
          const treatmentId = this.treatmentId(evg.recordId, labwareId, materialRef);
          addNode({
            id: treatmentId,
            type: 'treatment',
            label: materialRef,
            properties: { materialRef },
            source: this.source(evg.recordId, event),
          });
          for (const wid of wellIds) addEdge(wid, 'treated_with', treatmentId);
        }
      } else if (event.event_type === 'read' && wellIds.length > 0) {
        const channel = this.resolveChannel(details);
        const value = details.value;
        const readout = typeof details.readout === 'string' ? details.readout : undefined;
        const measurementId = this.measurementId(evg.recordId, labwareId, channel ?? readout ?? 'value');
        const props: Record<string, unknown> = {};
        if (channel !== undefined) props.channel = channel;
        if (readout !== undefined) props.readout = readout;
        if (value !== undefined) props.value = value;
        if (typeof details.modality === 'string') props.modality = details.modality;
        addNode({
          id: measurementId,
          type: 'measurement',
          label: channel ?? readout ?? 'measurement',
          properties: props,
          source: this.source(evg.recordId, event),
        });
        for (const wid of wellIds) addEdge(wid, 'measured_at', measurementId);
      }
    }

    return { nodes, edges };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private source(recordId: string, event: ProjectableEvent): { recordId: string; eventId?: string } {
    return event.eventId ? { recordId, eventId: event.eventId } : { recordId };
  }

  /** Resolve target wells + labware id from varied real detail shapes. */
  private resolveTarget(
    details: Record<string, unknown>,
    event: ProjectableEvent,
  ): { wells: string[]; labwareId: string } {
    const wells = this.readWells(details);
    const labwareId =
      (typeof details.labwareId === 'string' && details.labwareId) ||
      (typeof details.labwareInstanceId === 'string' && details.labwareInstanceId) ||
      (typeof event.details?.labwareId === 'string' && (event.details.labwareId as string)) ||
      'plate';
    return { wells, labwareId };
  }

  /** Read wells from either `wells[]`, `well` (singular), or nested source/target. */
  private readWells(details: Record<string, unknown>): string[] {
    if (Array.isArray(details.wells)) {
      return (details.wells as unknown[]).filter((w): w is string => typeof w === 'string');
    }
    if (typeof details.well === 'string') return [details.well as string];
    return [];
  }

  /** Resolve the material ref from varied shapes. */
  private resolveMaterial(details: Record<string, unknown>): string | null {
    const scalar = (v: unknown): string | null =>
      typeof v === 'string' && v.length > 0 ? v : null;
    if (scalar(details.material_ref)) return details.material_ref as string;
    if (typeof details.material_ref === 'object') {
      const r = details.material_ref as { id?: unknown; label?: unknown };
      if (typeof r.id === 'string') return r.id;
    }
    if (scalar(details.materialId)) return details.materialId as string;
    if (typeof details.material === 'object' && details.material !== null) {
      const m = details.material as { materialId?: unknown; id?: unknown; label?: unknown };
      if (typeof m.materialId === 'string') return m.materialId;
      if (typeof m.id === 'string') return m.id;
    }
    if (scalar(details.material_spec_ref)) return details.material_spec_ref as string;
    if (typeof details.material_spec_ref === 'object') {
      const r = details.material_spec_ref as { id?: unknown };
      if (typeof r.id === 'string') return r.id;
    }
    return null;
  }

  /** Read channel: singular `channel` or first of `channels[]`. */
  private resolveChannel(details: Record<string, unknown>): string | undefined {
    if (typeof details.channel === 'string' && details.channel) return details.channel as string;
    if (Array.isArray(details.channels)) {
      const first = details.channels[0];
      if (typeof first === 'string') return first;
    }
    return undefined;
  }

  private wellId(recordId: string, labwareId: string, well: string): string {
    return `well:${recordId}:${labwareId}:${well}`;
  }

  private treatmentId(recordId: string, labwareId: string, materialRef: string): string {
    return `treatment:${recordId}:${labwareId}:${materialRef}`;
  }

  private measurementId(recordId: string, labwareId: string, label: string): string {
    return `measurement:${recordId}:${labwareId}:${label}`;
  }
}