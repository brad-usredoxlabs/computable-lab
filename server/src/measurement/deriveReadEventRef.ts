/**
 * deriveReadEventRef — the ONE derivation of a measurement's read-event
 * provenance pointer (u2pubgate). The pointer is READ OUT of the stored
 * event-graph's data, never absent-and-assumed. Both publish seams use it:
 * MeasurementService.ingest and the RunSheetHandlers event-graph-scoped
 * mint. This helper reads events by `event_type` ONLY —
 * DeclaredCapabilityGate.ts stays the ONLY reader of
 * `semanticKeyComponents.verb`. Purely additive: a missing graph or a graph
 * with no read event yields undefined — the caller publishes exactly as
 * before (the gate keeps its existing named fail-closed error).
 */
import type { RecordEnvelope, RecordStore } from '../store/types.js';

/** The read-only store surface this derivation needs. */
export type ReadEventStore = Pick<RecordStore, 'get'>;

function refIdOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** The eventId of the LAST event in the stored event-graph with event_type
 *  'read', or undefined when the graph is missing or carries none. */
export async function deriveReadEventRef(store: ReadEventStore, eventGraphRef: unknown): Promise<string | undefined> {
  const graphId = refIdOf(eventGraphRef);
  if (!graphId) return undefined;

  const envelope: RecordEnvelope | null = await store.get(graphId);
  const events = (envelope?.payload as { events?: Array<Record<string, unknown>> } | undefined)?.events;
  if (!Array.isArray(events)) return undefined;

  let lastRead: string | undefined;
  for (const event of events) {
    if (!event || event.event_type !== 'read') continue;
    const eventId = event.eventId;
    if (typeof eventId === 'string' && eventId.length > 0) lastRead = eventId;
  }
  return lastRead;
}
