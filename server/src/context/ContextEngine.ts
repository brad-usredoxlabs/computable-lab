/**
 * ContextEngine — replays an event graph to produce a Context.
 * See compiler-specs/30-context.md §3.
 */

import { generateContextId } from '../types/context.js';
import type { Context } from '../types/context.js';
import type { Ref } from '../types/ref.js';
import type {
  EventGraph,
  EventGraphEvent,
  ContextDraft,
  ContextContent,
} from './types.js';
import { DerivationModelEngine, type DerivationModel } from './DerivationModelEngine.js';

const DM_IDEAL_MIXING: DerivationModel = {
  id: 'DM-ideal-mixing',
  version: 1,
  inputs: [
    { name: 'destination', type: 'context' },
    { name: 'inbound', type: 'context' },
  ],
  output: { name: 'mixed', type: 'context' },
  steps: [
    { op: 'sum', lhs: 'destination.total_volume.value', rhs: 'inbound.total_volume.value', into: 'mixed.total_volume.value' },
    { op: 'assign', from: 'destination.total_volume.unit', into: 'mixed.total_volume.unit' },
    { op: 'union_components', lhs: 'destination.contents', rhs: 'inbound.contents', into: 'mixed.contents' },
  ],
};

export type EventHandler = (draft: ContextDraft, event: EventGraphEvent) => void;

export class ContextEngine {
  private handlers: Record<string, EventHandler> = {};

  constructor() {
    this.handlers['create_container'] = this.handleCreateContainer.bind(this);
    this.handlers['add_material'] = this.handleAddMaterial.bind(this);
    this.handlers['transfer'] = this.handleTransfer.bind(this);
    this.handlers['incubate'] = this.handleIncubate.bind(this);
    this.handlers['mix'] = this.handleMix.bind(this);
    this.handlers['read'] = this.handleRead.bind(this);
    this.handlers['centrifuge'] = this.handleCentrifuge.bind(this);
  }

  /**
   * Replay an event graph and return the final Context.
   */
  computeContext(subjectRef: Ref, graph: EventGraph): Context {
    const draft: ContextDraft = {
      id: generateContextId(),
      subject_ref: subjectRef,
      contents: [],
      properties: {},
      observed: {},
      layer_provenance: { event_derived: [], model_derived: [], observed: [] },
      completeness: 'complete',
      missing: [],
      lineage: [],
      derivation_versions: {},
    };

    for (const event of graph.events) {
      const handler = this.handlers[event.event_type];
      if (!handler) {
        throw new Error(
          `ContextEngine: no handler registered for event_type '${event.event_type}'`
        );
      }
      handler(draft, event);
      draft.lineage.push({
        event_type: event.event_type,
        ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      });
    }

    return this.finalize(draft, graph);
  }

  /**
   * Register a handler for a new verb. Used by later specs to extend the engine.
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers[eventType] = handler;
  }

  private handleCreateContainer(draft: ContextDraft, _event: EventGraphEvent): void {
    // Container starts empty; mark layer provenance.
    if (!draft.layer_provenance.event_derived.includes('contents')) {
      draft.layer_provenance.event_derived.push('contents');
    }
    if (!draft.layer_provenance.event_derived.includes('total_volume')) {
      draft.layer_provenance.event_derived.push('total_volume');
    }
  }

  private handleAddMaterial(draft: ContextDraft, event: EventGraphEvent): void {
    const d = event.details as {
      material_ref?: unknown;
      volume?: { value: number; unit: string };
      concentration?: { value: number; unit: string };
      mass?: { value: number; unit: string };
      count?: number;
    };

    if (!d.volume || typeof d.volume.value !== 'number' || !d.volume.unit) {
      throw new Error(
        `ContextEngine.add_material: details.volume {value, unit} is required (event_type=add_material)`
      );
    }

    const material_ref = d.material_ref as ContextContent['material_ref'];

    const content: ContextContent = { volume: d.volume };
    if (material_ref) content.material_ref = material_ref;
    if (d.concentration) content.concentration = d.concentration;
    if (d.mass) content.mass = d.mass;
    if (typeof d.count === 'number') content.count = d.count;
    draft.contents.push(content);

    if (!draft.total_volume) {
      draft.total_volume = { value: d.volume.value, unit: d.volume.unit };
    } else {
      if (draft.total_volume.unit !== d.volume.unit) {
        throw new Error(
          `ContextEngine.add_material: unit mismatch ('${draft.total_volume.unit}' vs '${d.volume.unit}'). v1 does not convert units.`
        );
      }
      draft.total_volume.value += d.volume.value;
    }

    // Layer provenance: add_material populates event_derived fields.
    for (const field of ['contents', 'total_volume']) {
      if (!draft.layer_provenance.event_derived.includes(field)) {
        draft.layer_provenance.event_derived.push(field);
      }
    }
  }

  private handleTransfer(draft: ContextDraft, event: EventGraphEvent): void {
    const d = event.details as {
      source?: { contents?: ContextContent[]; total_volume?: { value: number; unit: string } };
      volume?: { value: number; unit: string };
    };
    if (!d.source || !d.source.contents || !d.source.total_volume) {
      throw new Error(`ContextEngine.transfer: details.source with {contents, total_volume} is required`);
    }
    if (!d.volume || typeof d.volume.value !== 'number' || !d.volume.unit) {
      throw new Error(`ContextEngine.transfer: details.volume {value, unit} is required`);
    }
    if (d.source.total_volume.unit !== d.volume.unit) {
      throw new Error(`ContextEngine.transfer: source.total_volume unit '${d.source.total_volume.unit}' != transfer volume unit '${d.volume.unit}'`);
    }
    if (d.volume.value > d.source.total_volume.value) {
      throw new Error(`ContextEngine.transfer: cannot transfer ${d.volume.value}${d.volume.unit} from a source containing ${d.source.total_volume.value}${d.source.total_volume.unit}`);
    }

    const fraction = d.volume.value / d.source.total_volume.value;
    const inboundContents = (d.source.contents ?? []).map(c => {
      const outC: ContextContent = {};
      if (c.material_ref) outC.material_ref = c.material_ref;
      if (c.volume) outC.volume = { value: c.volume.value * fraction, unit: c.volume.unit };
      if (c.concentration) outC.concentration = c.concentration;
      if (typeof c.count === 'number') outC.count = c.count * fraction;
      return outC;
    });
    const inbound = {
      total_volume: { value: d.volume.value, unit: d.volume.unit },
      contents: inboundContents,
    };
    const destination = {
      total_volume: draft.total_volume ?? { value: 0, unit: d.volume.unit },
      contents: draft.contents,
    };

    const dme = new DerivationModelEngine();
    const result = dme.run(DM_IDEAL_MIXING, { destination, inbound });
    const mixed = result.mixed as {
      total_volume: { value: number; unit: string };
      contents: ContextContent[];
    };
    draft.total_volume = mixed.total_volume;
    draft.contents = mixed.contents;
    draft.derivation_versions[DM_IDEAL_MIXING.id] = DM_IDEAL_MIXING.version;

    // Layer provenance: remove from event_derived, add to model_derived.
    for (const field of ['contents', 'total_volume']) {
      draft.layer_provenance.event_derived =
        draft.layer_provenance.event_derived.filter(x => x !== field);
      if (!draft.layer_provenance.model_derived.includes(field)) {
        draft.layer_provenance.model_derived.push(field);
      }
    }
  }

  private handleIncubate(draft: ContextDraft, event: EventGraphEvent): void {
    const d = event.details as Record<string, unknown>;
    const entry = {
      ...(d.duration !== undefined ? { duration: d.duration } : {}),
      ...(d.temperature !== undefined ? { temperature: d.temperature } : {}),
      ...(d.atmosphere !== undefined ? { atmosphere: d.atmosphere } : {}),
    };
    const existing = (draft.properties.incubations as unknown[] | undefined) ?? [];
    draft.properties.incubations = [...existing, entry];
    draft.properties.last_incubation = entry;
    if (!draft.layer_provenance.event_derived.includes('properties')) {
      draft.layer_provenance.event_derived.push('properties');
    }
  }

  private handleMix(draft: ContextDraft, event: EventGraphEvent): void {
    const d = event.details as Record<string, unknown>;
    const entry = {
      ...(d.method !== undefined ? { method: d.method } : {}),
      ...(d.speed !== undefined ? { speed: d.speed } : {}),
      ...(d.duration !== undefined ? { duration: d.duration } : {}),
    };
    const existing = (draft.properties.mixes as unknown[] | undefined) ?? [];
    draft.properties.mixes = [...existing, entry];
    if (!draft.layer_provenance.event_derived.includes('properties')) {
      draft.layer_provenance.event_derived.push('properties');
    }
  }

  private handleRead(draft: ContextDraft, event: EventGraphEvent): void {
    const d = event.details as {
      readout?: string;
      value?: number;
      unit?: string;
      readout_def_ref?: unknown;
      assertion_ref?: unknown;
    };

    if (!d.readout || typeof d.readout !== 'string') {
      throw new Error(`ContextEngine.read: details.readout (string) is required`);
    }
    if (typeof d.value !== 'number') {
      throw new Error(`ContextEngine.read: details.value (number) is required`);
    }

    const hasEnvelope = d.unit !== undefined || d.assertion_ref !== undefined || d.readout_def_ref !== undefined;

    if (hasEnvelope) {
      const envelope: Record<string, unknown> = { value: d.value };
      if (d.unit !== undefined) envelope.unit = d.unit;
      if (d.assertion_ref !== undefined) envelope.assertion_ref = d.assertion_ref;
      if (d.readout_def_ref !== undefined) envelope.readout_def_ref = d.readout_def_ref;
      draft.observed[d.readout] = envelope;
    } else {
      draft.observed[d.readout] = d.value;
    }

    if (!draft.layer_provenance.observed.includes(d.readout)) {
      draft.layer_provenance.observed.push(d.readout);
    }
  }

  private handleCentrifuge(draft: ContextDraft, event: EventGraphEvent): void {
    const d = event.details as {
      rpm?: number;
      rcf?: number;
      duration?: string;
      temperature?: number;
    };
    const entry = {
      ...(typeof d.rpm === 'number' ? { rpm: d.rpm } : {}),
      ...(typeof d.rcf === 'number' ? { rcf: d.rcf } : {}),
      ...(typeof d.duration === 'string' ? { duration: d.duration } : {}),
      ...(typeof d.temperature === 'number' ? { temperature: d.temperature } : {}),
    };
    if (!Array.isArray(draft.properties.centrifugations)) {
      draft.properties.centrifugations = [];
    }
    (draft.properties.centrifugations as unknown[]).push(entry);
    draft.properties.last_centrifugation = entry;
    if (!draft.layer_provenance.event_derived.includes('properties')) {
      draft.layer_provenance.event_derived.push('properties');
    }
  }

  private finalize(draft: ContextDraft, graph: EventGraph): Context {
    const ctx: Context = {
      id: draft.id,
      subject_ref: draft.subject_ref,
      contents: draft.contents,
    };
    if (graph.id) {
      ctx.event_graph_ref = { kind: 'record', id: graph.id, type: 'event_graph' };
    }
    if (draft.total_volume) {
      ctx.total_volume = draft.total_volume;
    }
    if (Object.keys(draft.properties).length > 0) {
      ctx.properties = draft.properties;
    }
    // Cast-through for the new fields that Context doesn't yet declare.
    (ctx as unknown as Record<string, unknown>).observed = draft.observed;
    (ctx as unknown as Record<string, unknown>).layer_provenance = draft.layer_provenance;
    (ctx as unknown as Record<string, unknown>).completeness = draft.completeness;
    (ctx as unknown as Record<string, unknown>).missing = draft.missing;
    (ctx as unknown as Record<string, unknown>).lineage = draft.lineage;
    (ctx as unknown as Record<string, unknown>).derivation_versions = draft.derivation_versions;
    return ctx;
  }
}
