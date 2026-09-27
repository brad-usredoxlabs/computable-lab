/**
 * Lab-Sync shared types (test-your-food.com <-> Computable Lab).
 *
 * Wire-format types mirror specs/lab-sync-api.md exactly (snake_case on the
 * wire); record-layer types follow computable-lab conventions.
 */

import type { RecordEnvelope } from '../types/RecordEnvelope.js'

/** Event envelope as it crosses the HTTP boundary (both directions). */
export interface LabSyncWireEvent {
  /** Globally unique, publisher-minted: evt_TYF_* / evt_CL_*. */
  event_id: string
  /** Monotonic website event-table cursor (inbound only). */
  cursor?: number
  /** Domain event type, e.g. "order.created". */
  type: string
  /** Publisher timestamp (advisory; cursor is the ordering authority). */
  occurred_at?: string
  payload: Record<string, unknown>
}

/** Response of GET /api/lab-sync/events. */
export interface EventsPage {
  events: LabSyncWireEvent[]
  /** Max cursor returned, or the requested cursor when empty. */
  cursor: number
}

/** Response of POST /api/lab-sync/ack. */
export interface AckResult {
  ok: boolean
  acked_cursor: number
}

/** Response of POST /api/lab-sync/ingest. */
export interface IngestResult {
  ok: boolean
  applied: string[]
  duplicated: string[]
  unknown: string[]
}

/**
 * Inbound transport shape. Structurally satisfied by LabSyncClient —
 * outbound code depends on this interface, never on the client class.
 */
export interface IngestTransport {
  ingest(events: LabSyncWireEvent[]): Promise<IngestResult>
}

/** Outcome of processing one inbound event. */
export type ProcessedEventStatus =
  | 'applied'
  | 'duplicated'
  | 'unknown_type'
  | 'ignored_stale'

export interface ProcessedEvent {
  status: ProcessedEventStatus
  affectedRecordIds: string[]
  error?: string
}

/** lab-sync-event schema ids (schema/integration/, schema/services/, domains/). */
export const SCHEMA_IDS = {
  labSyncEvent: 'https://computable-lab.com/schema/computable-lab/lab-sync-event.schema.yaml',
  party: 'https://computable-lab.com/schema/computable-lab/party.schema.yaml',
  request: 'https://computable-lab.com/schema/computable-lab/request.schema.yaml',
  requestedService: 'https://computable-lab.com/schema/computable-lab/requested-service.schema.yaml',
  sample: 'https://computable-lab.com/schema/computable-lab/sample.schema.yaml',
  sampleReceipt: 'https://computable-lab.com/schema/computable-lab/sample-receipt.schema.yaml',
  report: 'https://computable-lab.com/schema/computable-lab/report.schema.yaml',
  customer: 'https://computable-lab.com/schema/computable-lab/domains/test-your-food/customer.schema.yaml',
  order: 'https://computable-lab.com/schema/computable-lab/domains/test-your-food/order.schema.yaml',
  sampleRegistration: 'https://computable-lab.com/schema/computable-lab/domains/test-your-food/sample-registration.schema.yaml',
} as const

export type { RecordEnvelope }
