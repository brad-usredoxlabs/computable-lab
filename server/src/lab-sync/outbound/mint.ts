/**
 * Outbound event minting (CL -> website).
 *
 * Mints a wire event (specs/lab-sync-api.md §3) and durably mirrors it as an
 * outbound lab-sync-event record with processing.status 'pending' until the
 * pusher delivers it. The record IS the outbox.
 */

import type { RecordStore } from '../../store/types.js'
import type { LabSyncWireEvent } from '../types.js'
import { SCHEMA_IDS } from '../types.js'
import { nextSequentialEventId, nextSequentialRecordId } from '../ids.js'

/**
 * Controlled list of event types CL may publish. This mirrors the
 * "Inbound event types" table in specs/lab-sync-api.md §3 verbatim.
 * This is wire-protocol vocabulary (the website's ingest endpoint defines
 * this enum), not business logic — hardcoding it here is allowed and
 * required: minting an unlisted type would silently land in the website's
 * `unknown` bucket instead of being applied.
 */
export const OUTBOUND_EVENT_TYPES: ReadonlySet<string> = new Set([
  'order.accepted',
  'order.rejected',
  'sample.received',
  'sample.accessioned',
  'testing.started',
  'testing.completed',
  'report.approved',
  'report.released',
])

/** CL-minted event id prefix (evt_CL_NNNNNN, per lab-sync-api.md §3). */
const EVENT_ID_PREFIX = 'evt_CL_'

export interface MintDeps {
  store: RecordStore
  /** Injectable clock: occurredAt is advisory, but tests pin it. */
  now: () => Date
}

/** Outbound lab-sync-event record payload (subset the minter owns). */
interface OutboundEventPayload {
  kind: 'lab-sync-event'
  recordId: string
  eventId: string
  direction: 'outbound'
  eventType: string
  occurredAt: string
  payload: Record<string, unknown>
  processing: { status: 'pending' }
}

export class OutboundMinter {
  constructor(private readonly deps: MintDeps) {}

  /**
   * Mint one outbound event: allocate evt_CL_NNNNNN over the existing
   * lab-sync-event records, persist the pending outbox record, and return
   * the wire envelope ready for the pusher/transport.
   *
   * Throws on event types outside OUTBOUND_EVENT_TYPES (nothing is written).
   */
  async mint(eventType: string, payload: Record<string, unknown>): Promise<LabSyncWireEvent> {
    if (!OUTBOUND_EVENT_TYPES.has(eventType)) {
      throw new Error(
        `Unknown outbound event type "${eventType}". Allowed: ${[...OUTBOUND_EVENT_TYPES].join(', ')} ` +
          `(see specs/lab-sync-api.md §3).`,
      )
    }

    const { store, now } = this.deps

    // Full outbox scan per mint is fine at lab scale (same stance as ids.ts).
    const existing = await store.list({ kind: 'lab-sync-event' })
    const existingEventIds = existing
      .map((r) => (r.payload as { eventId?: unknown }).eventId)
      .filter((id): id is string => typeof id === 'string')
    const eventId = nextSequentialEventId(existingEventIds, EVENT_ID_PREFIX)

    const recordId = await nextSequentialRecordId(store, 'LSYN-')
    const occurredAt = now().toISOString()

    const eventPayload: OutboundEventPayload = {
      kind: 'lab-sync-event',
      recordId,
      eventId,
      direction: 'outbound',
      eventType,
      occurredAt,
      payload,
      processing: { status: 'pending' },
    }

    const result = await store.create({
      envelope: { recordId, schemaId: SCHEMA_IDS.labSyncEvent, payload: eventPayload },
      message: `lab-sync: mint outbound ${eventType} (${eventId})`,
    })
    if (!result.success) {
      throw new Error(`Failed to create outbound lab-sync-event record: ${result.error ?? 'unknown error'}`)
    }

    return { event_id: eventId, type: eventType, occurred_at: occurredAt, payload }
  }
}
