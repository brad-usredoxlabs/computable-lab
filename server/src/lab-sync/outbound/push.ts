/**
 * Outbound ingest pusher (CL -> website).
 *
 * Drains the outbox: lab-sync-event records with direction 'outbound' and
 * processing.status 'pending' or 'push_failed', chunked to maxBatch (website
 * accepts 1–100 per POST, specs/lab-sync-api.md §3), pushed through an
 * IngestTransport, and stamped with the outcome.
 *
 * Delivery semantics (spec §3): the website dedupes on event_id, so whole
 * batches are safe to retry. applied + duplicated + unknown ids are all
 * "the website has the event" -> mark 'pushed'. unknown additionally means
 * the website stored it verbatim without applying it (append-only
 * lab_events table); that is surfaced via console notes, never dropped.
 * A transport throw leaves the chunk 'push_failed' for the next run.
 */

import type { RecordStore } from '../../store/types.js'
import type { IngestTransport, LabSyncWireEvent } from '../types.js'
import type { RecordEnvelope } from '../../types/RecordEnvelope.js'
import { REPORT_RELEASED_EVENT_TYPE } from './reports.js'

/** Mirrors lab-sync-api.md §3: batch size 1–100. */
const DEFAULT_MAX_BATCH = 100

/** Mutable processing block on an outbound lab-sync-event record. */
interface ProcessingState {
  status?: string
  processedAt?: string
  error?: string
  [key: string]: unknown
}

interface OutboundRecordPayload {
  kind?: string
  eventId?: string
  direction?: string
  eventType?: string
  occurredAt?: string
  payload?: Record<string, unknown>
  processing?: ProcessingState
}

export interface PushResult {
  /** event ids marked pushed (applied, duplicated, or stored-verbatim unknown). */
  pushed: string[]
  /** event ids whose chunk failed at the transport; retried on next pushPending(). */
  failed: string[]
}

export class OutboundPusher {
  private readonly store: RecordStore
  private readonly transport: IngestTransport
  private readonly maxBatch: number

  constructor(deps: { store: RecordStore; transport: IngestTransport; maxBatch?: number }) {
    this.store = deps.store
    this.transport = deps.transport
    // explicit-undefined guard for exactOptionalPropertyTypes callers
    this.maxBatch = deps.maxBatch !== undefined && deps.maxBatch > 0 ? deps.maxBatch : DEFAULT_MAX_BATCH
  }

  /**
   * Push all pending/push_failed outbound events. Returns the event ids that
   * ended 'pushed' and those left 'push_failed'.
   */
  async pushPending(): Promise<PushResult> {
    const records = await this.store.list({ kind: 'lab-sync-event' })
    const pending = records.filter(isDeliverableOutbound)

    const pushed: string[] = []
    const failed: string[] = []

    for (let i = 0; i < pending.length; i += this.maxBatch) {
      const chunk = pending.slice(i, i + this.maxBatch)
      const events: LabSyncWireEvent[] = chunk.map(toWireEvent)

      let result
      try {
        result = await this.transport.ingest(events)
      } catch (err) {
        // Whole chunk failed at the wire level — website may or may not have
        // seen it, but dedupe makes a full retry safe (spec §3).
        const message = err instanceof Error ? err.message : String(err)
        for (const rec of chunk) {
          await this.markStatus(rec, 'push_failed', message)
          failed.push((rec.payload as OutboundRecordPayload).eventId as string)
        }
        continue
      }

      // applied: website acted; duplicated: already had it; unknown: stored
      // verbatim append-only but NOT applied — delivered either way, so the
      // outbox stops retrying. The unhandled-unknown case is called out.
      //
      // Exception (customer-handoff spec): a report.released answered
      // 'unknown' means the website stored it but its evidence is not yet
      // complete on their side — the event is invisible to the customer.
      // It must be RE-PUSHED with the identical payload until the website
      // returns applied/duplicated. The outbox mirror re-serializes the
      // stored payload verbatim, which is exactly why the byte-equivalent
      // retry the website's dedupe requires holds across re-pushes.
      const delivered = new Set([...result.applied, ...result.duplicated, ...result.unknown])
      const unknownIds = new Set(result.unknown)
      for (const rec of chunk) {
        const eventId = (rec.payload as OutboundRecordPayload).eventId as string
        const isRelease = (rec.payload as OutboundRecordPayload).eventType === REPORT_RELEASED_EVENT_TYPE
        if (isRelease && unknownIds.has(eventId)) {
          await this.markStatus(rec, 'push_failed', 'evidence pending website-side')
          failed.push(eventId)
        } else if (delivered.has(eventId)) {
          if (unknownIds.has(eventId)) {
            // eslint-disable-next-line no-console
            console.warn(
              `lab-sync outbound: website stored ${eventId} (${(rec.payload as OutboundRecordPayload).eventType}) verbatim as unknown type — not applied`,
            )
          }
          await this.markStatus(rec, 'pushed')
          pushed.push(eventId)
        } else {
          // Accepted the batch but listed neither bucket: assume non-delivery
          // so the safe-retry dedupe path covers it next run.
          await this.markStatus(rec, 'push_failed', 'event id absent from ingest result')
          failed.push(eventId)
        }
      }
    }

    return { pushed, failed }
  }

  private async markStatus(rec: RecordEnvelope, status: 'pushed' | 'push_failed', error?: string): Promise<void> {
    const payload = rec.payload as OutboundRecordPayload
    const processing: ProcessingState = { ...payload.processing, status }
    if (status === 'pushed') {
      processing.processedAt = new Date().toISOString()
      delete processing.error
    } else if (error !== undefined) {
      processing.error = error
    }
    await this.store.update({
      envelope: { ...rec, payload: { ...payload, processing } },
      message: `lab-sync: outbound ${payload.eventId} ${status}`,
    })
  }
}

function isDeliverableOutbound(rec: RecordEnvelope): boolean {
  const p = rec.payload as OutboundRecordPayload
  return (
    p.kind === 'lab-sync-event' &&
    p.direction === 'outbound' &&
    typeof p.eventId === 'string' &&
    (p.processing?.status === 'pending' || p.processing?.status === 'push_failed')
  )
}

function toWireEvent(rec: RecordEnvelope): LabSyncWireEvent {
  const p = rec.payload as OutboundRecordPayload
  const wire: LabSyncWireEvent = {
    event_id: p.eventId as string,
    type: p.eventType as string,
    payload: p.payload ?? {},
  }
  if (p.occurredAt !== undefined) wire.occurred_at = p.occurredAt
  return wire
}
