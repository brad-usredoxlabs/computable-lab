/**
 * Payload builders for outbound CL -> website events
 * (specs/lab-sync-api.md §3). Pure functions — no store access; the caller
 * supplies the order's remote id (payload.source.remoteId) since order
 * lookup belongs to the caller's context.
 */
import type { RecordEnvelope } from '../../types/RecordEnvelope.js'

/** Website cap for inline report artifacts (lab-sync-api.md §3, report artifacts). */
export const MAX_ARTIFACT_BASE64_BYTES = 5 * 1024 * 1024

/** Subset of a report record this builder reads. */
export interface ReportRecordLike {
  payload: {
    recordId?: string
    revision?: number
    releasedAt?: string
    [key: string]: unknown
  }
}

export interface ReportReleasedPayloadInput {
  /** Website-side order id (order record payload.source.remoteId). */
  orderId: string
  reportRecord: ReportRecordLike | RecordEnvelope<unknown>
  /** Base64-encoded PDF bytes; omitted from the payload if decoding > MAX. */
  artifactBase64?: string
  /** Alternative link; website never fetches it. Mutually exclusive with base64. */
  artifactUrl?: string
}

/** Payload shape for report.released on the wire (spec §3 table). */
export interface ReportReleasedPayload {
  order_remote_id: string
  report_id: string
  revision: number
  released_at: string
  artifact_base64?: string
  artifact_url?: string
}

/**
 * Build the report.released wire payload from a report record.
 *
 * Choices (simplest defensible):
 * - artifact size is measured on the DECODED bytes (Buffer.byteLength(b64,
 *   'base64')), matching what the website actually stores.
 * - Oversize base64 is DROPPED, not truncated: never send something fake.
 *   The caller can fall back to artifact_url on the next release push.
 * - base64 and url together is a caller bug -> throw (the spec treats them
 *   as alternatives).
 */
export function buildReportReleasedPayload(input: ReportReleasedPayloadInput): ReportReleasedPayload {
  if (input.artifactBase64 !== undefined && input.artifactUrl !== undefined) {
    throw new Error('report.released: provide exactly one of artifactBase64 / artifactUrl, not both')
  }

  const p = input.reportRecord.payload as { recordId?: string; revision?: number; releasedAt?: string }
  if (!p.recordId || p.revision === undefined || !p.releasedAt) {
    throw new Error('report.released: report record needs recordId, revision, and releasedAt before release')
  }

  const payload: ReportReleasedPayload = {
    order_remote_id: input.orderId,
    report_id: p.recordId,
    revision: p.revision,
    released_at: p.releasedAt,
  }

  if (input.artifactBase64 !== undefined) {
    const decodedBytes = Buffer.byteLength(input.artifactBase64, 'base64')
    if (decodedBytes <= MAX_ARTIFACT_BASE64_BYTES) {
      payload.artifact_base64 = input.artifactBase64
    }
    // Oversize: omit silently at this layer; nothing fake is substituted.
  } else if (input.artifactUrl !== undefined) {
    payload.artifact_url = input.artifactUrl
  }

  return payload
}
