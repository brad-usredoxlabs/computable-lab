/**
 * Local plan -> event-graph document — the pure projection of a built local
 * plan's events into `events` of ONE event-graph record (D8.1).
 * The event_type set belongs to the event-graph SCHEMA, not to the biology
 * expander's union, and is INJECTED: this module holds no verb list, so a
 * schema edit is a data change, not a TS edit. An unknown event_type returns a
 * NAMED error (eventType + stepId) and NO document; status/links/methodContext/
 * createdAt stay with the attach path (ProtocolContextService).
 */

import type { LocalPlanEvent } from './localPlanGraph.js';

export interface ToLocalPlanEventGraphDocumentInput {
  id: string;
  name?: string;
  events: readonly LocalPlanEvent[];
  /** The event-graph schema's enum for `PlateEvent.event_type`, supplied by the caller. */
  allowedEventTypes: readonly string[];
}

export interface LocalPlanEventGraphDocument {
  kind: 'event-graph';
  id: string;
  name?: string;
  events: LocalPlanEvent[];
  labwares: unknown[];
}

export type LocalPlanEventGraphDocumentResult =
  | { ok: true; document: LocalPlanEventGraphDocument }
  | { ok: false; code: 'UNSUPPORTED_EVENT_TYPE'; eventType: string; stepId: string };

export function toLocalPlanEventGraphDocument(
  input: ToLocalPlanEventGraphDocumentInput,
): LocalPlanEventGraphDocumentResult {
  const allowed = new Set(input.allowedEventTypes);
  // Fail fast, before any output element exists: the error names the verb and step.
  for (const event of input.events) {
    if (!allowed.has(event.event_type)) {
      return { ok: false, code: 'UNSUPPORTED_EVENT_TYPE', eventType: event.event_type, stepId: event.stepId };
    }
  }
  const events: LocalPlanEvent[] = input.events.map((event) => ({
    eventId: event.eventId,
    stepId: event.stepId,
    event_type: event.event_type,
    details: event.details,
  }));

  return {
    ok: true,
    document: {
      kind: 'event-graph',
      id: input.id,
      ...(input.name ? { name: input.name } : {}),
      events,
      labwares: [],
    },
  };
}
