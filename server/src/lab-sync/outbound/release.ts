/**
 * ReportReleaser — release orchestration for one sample + one report.
 *
 * Ordering contract (the heart of the release act, customer-handoff spec):
 *
 *   evidence build -> upload ALL artifact files -> report status flip
 *   (+ advisory order ladder advance) -> mint report.released -> push
 *
 * Upload-before-release: the website must be able to fetch every artifact
 * referenced by the evidence document the moment report.released lands.
 * Mint-after-persist: the minted payload carries the releasedAt that is
 * already durably on the report record. If anything throws before the mint,
 * nothing is released — partial uploads are harmless (re-init of identical
 * bytes is safe; the report stays 'approved' and a retry rebuilds).
 */
import type { RecordEnvelope, RecordStore } from '../../store/types.js'
import type { EvidenceBuilder } from '../evidence/build.js'
import type { ArtifactClient } from '../ArtifactClient.js'
import type { OutboundMinter } from './mint.js'
import type { OutboundPusher } from './push.js'
import { REPORT_RELEASED_EVENT_TYPE, buildReportReleasedPayload } from './reports.js'

export interface ReleaseDeps {
  store: RecordStore
  minter: OutboundMinter
  pusher: OutboundPusher
  evidence: EvidenceBuilder
  artifacts: ArtifactClient
  now: () => Date
}

/** tyf-order lifecycle: `reported` is reachable ONLY from `testing_complete`. */
const ORDER_STATE_BEFORE_REPORTED = 'testing_complete'

type Payload = Record<string, unknown>

function asPayload(value: unknown): Payload {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Payload)
    : {}
}

export class ReportReleaser {
  private readonly deps: ReleaseDeps

  constructor(deps: ReleaseDeps) {
    this.deps = deps
  }

  /**
   * Release the report for a sample. Returns the minted event id and the
   * store record ids this call touched (report only — artifact ids are
   * website-side reservations, not CL records).
   */
  async releaseSample(
    sampleRecordId: string,
    reportRecordId: string,
  ): Promise<{ eventId: string; recordIds: string[] }> {
    const { store, now } = this.deps

    // --- 1. The report must be approved, with a revision ---
    const report = await store.get(reportRecordId)
    if (!report) throw new Error(`release: report record ${reportRecordId} not found`)
    const reportPayload = asPayload(report.payload)
    const status = reportPayload.status
    if (status === 'released') {
      throw new Error(`release: report ${reportRecordId} is already released`)
    }
    if (status !== 'approved') {
      throw new Error(
        `release: report ${reportRecordId} must be approved before release (status: ${String(status)})`,
      )
    }
    const revision = typeof reportPayload.revision === 'number' ? reportPayload.revision : undefined
    if (revision === undefined) {
      throw new Error(`release: report ${reportRecordId} has no revision to release`)
    }

    // --- 1b. Resolve the website order id BEFORE any side effect ---
    // Fail fast: never upload/mint against a fabricated order id (§9).
    const requestRef = asPayload(reportPayload.requestRef)
    const orderRecordId = typeof requestRef.id === 'string' ? requestRef.id : undefined
    if (orderRecordId === undefined) {
      throw new Error(`release: report ${reportRecordId} has no requestRef pointing at an order record`)
    }
    const order = await store.get(orderRecordId)
    if (!order) throw new Error(`release: order record ${orderRecordId} not found`)
    const orderPayload = asPayload(order.payload)
    const source = asPayload(orderPayload.source)
    const websiteOrderId = typeof source.remoteId === 'string' ? source.remoteId : undefined
    if (websiteOrderId === undefined) {
      throw new Error(
        `release: order ${orderRecordId} has no source.remoteId — cannot address the website order`,
      )
    }

    // --- 2. Build the evidence bundle (throws on incomplete evidence) ---
    // Propagates with NOTHING uploaded and NOTHING minted.
    const bundle = await this.deps.evidence.build(sampleRecordId, reportRecordId, revision)

    // --- 3. Upload EVERY file first (stable ids: report's evidenceFiles ids) ---
    for (const file of bundle.files) {
      await this.deps.artifacts.uploadFile(file.id, file.bytes, bundle.document.sample_id)
    }

    // --- 4a. Advisory order ladder: testing_complete -> reported ONLY.
    // Report release is sample-scoped; if the order sits anywhere else on
    // the tyf-order ladder, leave it untouched and release anyway.
    if (orderPayload.status === ORDER_STATE_BEFORE_REPORTED) {
      const orderResult = await store.update({
        envelope: { ...order, payload: { ...orderPayload, status: 'reported' } },
        message: `lab-sync order reported ${orderRecordId} (report ${reportRecordId} released)`,
      })
      if (!orderResult.success) {
        throw new Error(`release: failed to advance order ${orderRecordId} to reported: ${orderResult.error ?? 'unknown error'}`)
      }
    }

    // --- 4b. Flip the report record to released ---
    const releasedPayload: Payload = { ...reportPayload, status: 'released', releasedAt: now().toISOString() }
    const updatedReport: RecordEnvelope = { ...report, payload: releasedPayload }
    const updateResult = await store.update({
      envelope: updatedReport,
      message: `lab-sync report released ${reportRecordId}`,
    })
    if (!updateResult.success) {
      throw new Error(`release: failed to persist released report: ${updateResult.error ?? 'unknown error'}`)
    }

    // --- 5. Mint report.released carrying the persisted releasedAt + evidence ---
    const payload = buildReportReleasedPayload({
      orderId: websiteOrderId,
      reportRecord: updatedReport,
      sampleId: bundle.document.sample_id,
      barcode: bundle.document.barcode,
      evidence: bundle.document as unknown as Record<string, unknown>,
    })
    const wire = await this.deps.minter.mint(
      REPORT_RELEASED_EVENT_TYPE,
      payload as unknown as Record<string, unknown>,
    )

    // --- 6. Push immediately; a failed push leaves the mirror pending ---
    // (outbox + the report.released unknown-retry rule handle redelivery).
    await this.deps.pusher.pushPending()

    return { eventId: wire.event_id, recordIds: [reportRecordId] }
  }
}
