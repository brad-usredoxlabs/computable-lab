/**
 * Outbound lab-sync tests: event minting (CL side), ingest pusher, and the
 * report.released payload builder.
 *
 * Fakes: in-memory RecordStore + recording IngestTransport. No git, no YAML.
 */
import { describe, it, expect } from 'vitest'
import type {
  RecordStore,
  RecordFilter,
  CreateRecordOptions,
  UpdateRecordOptions,
  DeleteRecordOptions,
  StoreResult,
} from '../../store/types.js'
import type { RecordEnvelope } from '../../types/RecordEnvelope.js'
import type { IngestTransport, IngestResult, LabSyncWireEvent } from '../types.js'
import { SCHEMA_IDS } from '../types.js'
import { OutboundMinter } from './mint.js'
import { OutboundPusher } from './push.js'
import { buildReportReleasedPayload, MAX_ARTIFACT_BASE64_BYTES } from './reports.js'

// ---------- fake store ----------

interface FakeStore extends RecordStore {
  records: Map<string, RecordEnvelope>
}

function makeFakeStore(): FakeStore {
  const records = new Map<string, RecordEnvelope>()
  const ok = (envelope?: RecordEnvelope): StoreResult => ({ success: true, envelope })

  const store: FakeStore = {
    records,
    async get(recordId) {
      return records.get(recordId) ?? null
    },
    async getByPath() {
      return null
    },
    async getWithValidation() {
      return { success: false, error: 'not implemented' }
    },
    async list(filter?: RecordFilter) {
      let all = [...records.values()]
      if (filter?.kind) all = all.filter((r) => (r.payload as { kind?: string }).kind === filter.kind)
      if (filter?.schemaId) all = all.filter((r) => r.schemaId === filter.schemaId)
      if (filter?.idPrefix) all = all.filter((r) => r.recordId.startsWith(filter.idPrefix!))
      if (filter?.offset) all = all.slice(filter.offset)
      if (filter?.limit) all = all.slice(0, filter.limit)
      return all
    },
    async create(options: CreateRecordOptions) {
      const env = options.envelope
      if (records.has(env.recordId)) return { success: false, error: `dup ${env.recordId}` }
      records.set(env.recordId, structuredClone(env))
      return ok(env)
    },
    async update(options: UpdateRecordOptions) {
      const env = options.envelope
      if (!records.has(env.recordId)) return { success: false, error: `missing ${env.recordId}` }
      records.set(env.recordId, structuredClone(env))
      return ok(env)
    },
    async delete(options: DeleteRecordOptions) {
      records.delete(options.recordId)
      return ok()
    },
    async validate() {
      return { valid: true, errors: [] }
    },
    async lint() {
      return { valid: true, violations: [] }
    },
    async exists(recordId) {
      return records.has(recordId)
    },
  }
  return store
}

/** lab-sync-event payload shape used by the outbound modules. */
interface EventRecordPayload {
  kind: 'lab-sync-event'
  recordId: string
  eventId: string
  direction: 'inbound' | 'outbound'
  eventType: string
  occurredAt?: string
  payload: Record<string, unknown>
  processing?: { status: string; processedAt?: string; error?: string }
}

function eventRecords(store: FakeStore): RecordEnvelope<EventRecordPayload>[] {
  return [...store.records.values()].filter(
    (r) => (r.payload as { kind?: string }).kind === 'lab-sync-event',
  ) as RecordEnvelope<EventRecordPayload>[]
}

// ---------- fake transport ----------

interface FakeTransport extends IngestTransport {
  batches: LabSyncWireEvent[][]
  results: (IngestResult | Error)[]
  index: number
}

function makeFakeTransport(...results: (IngestResult | Error)[]): FakeTransport {
  return {
    batches: [],
    results,
    index: 0,
    async ingest(events) {
      this.batches.push(events)
      const next = this.results[this.index++] ?? {
        ok: true,
        applied: events.map((e) => e.event_id),
        duplicated: [],
        unknown: [],
      }
      if (next instanceof Error) throw next
      return next
    },
  }
}

const FIXED_NOW = new Date('2026-09-26T15:04:05-04:00')

// ---------- mint ----------

describe('OutboundMinter', () => {
  it('mints evt_CL_000001 and creates a pending outbound lab-sync-event record', async () => {
    const store = makeFakeStore()
    const minter = new OutboundMinter({ store, now: () => FIXED_NOW })

    const wire = await minter.mint('order.accepted', { order_remote_id: 'TYF-101' })

    expect(wire).toEqual({
      event_id: 'evt_CL_000001',
      type: 'order.accepted',
      occurred_at: FIXED_NOW.toISOString(),
      payload: { order_remote_id: 'TYF-101' },
    })

    const recs = eventRecords(store)
    expect(recs).toHaveLength(1)
    const p = recs[0]!.payload
    expect(recs[0]!.schemaId).toBe(SCHEMA_IDS.labSyncEvent)
    expect(recs[0]!.recordId).toMatch(/^LSYN-/)
    expect(p.recordId).toBe(recs[0]!.recordId)
    expect(p.eventId).toBe('evt_CL_000001')
    expect(p.direction).toBe('outbound')
    expect(p.eventType).toBe('order.accepted')
    expect(p.occurredAt).toBe(FIXED_NOW.toISOString())
    expect(p.payload).toEqual({ order_remote_id: 'TYF-101' })
    expect(p.processing?.status).toBe('pending')
  })

  it('second mint gets evt_CL_000002', async () => {
    const store = makeFakeStore()
    const minter = new OutboundMinter({ store, now: () => FIXED_NOW })
    await minter.mint('sample.received', { barcode: 'B1' })
    const second = await minter.mint('testing.started', { order_remote_id: 'TYF-101' })
    expect(second.event_id).toBe('evt_CL_000002')
  })

  it('sequence continues past pre-existing outbound event ids', async () => {
    const store = makeFakeStore()
    store.records.set('LSYN-000009', {
      recordId: 'LSYN-000009',
      schemaId: SCHEMA_IDS.labSyncEvent,
      payload: {
        kind: 'lab-sync-event',
        recordId: 'LSYN-000009',
        eventId: 'evt_CL_000041',
        direction: 'outbound',
        eventType: 'report.released',
        payload: {},
      },
    })
    const minter = new OutboundMinter({ store, now: () => FIXED_NOW })
    const wire = await minter.mint('report.approved', { order_remote_id: 'TYF-101', report_id: 'R1', revision: 1, approved_at: FIXED_NOW.toISOString() })
    expect(wire.event_id).toBe('evt_CL_000042')
  })

  it('ignores inbound (evt_TYF_*) ids when minting the CL sequence', async () => {
    const store = makeFakeStore()
    store.records.set('LSYN-000001', {
      recordId: 'LSYN-000001',
      schemaId: SCHEMA_IDS.labSyncEvent,
      payload: {
        kind: 'lab-sync-event',
        recordId: 'LSYN-000001',
        eventId: 'evt_TYF_000999',
        direction: 'inbound',
        eventType: 'order.created',
        payload: {},
      },
    })
    const minter = new OutboundMinter({ store, now: () => FIXED_NOW })
    const wire = await minter.mint('order.accepted', { order_remote_id: 'TYF-1' })
    expect(wire.event_id).toBe('evt_CL_000001')
  })

  it('rejects event types outside the controlled list', async () => {
    const store = makeFakeStore()
    const minter = new OutboundMinter({ store, now: () => FIXED_NOW })
    await expect(minter.mint('order.created', {})).rejects.toThrow(/order\.created/)
    expect(eventRecords(store)).toHaveLength(0)
  })
})

// ---------- push ----------

describe('OutboundPusher', () => {
  async function seedMints(store: FakeStore, n: number) {
    const minter = new OutboundMinter({ store, now: () => FIXED_NOW })
    for (let i = 0; i < n; i++) {
      await minter.mint('sample.received', { barcode: `B${i}` })
    }
  }

  it('pushes pending events in one batch and marks applied+duplicated as pushed', async () => {
    const store = makeFakeStore()
    await seedMints(store, 3)
    const transport = makeFakeTransport({
      ok: true,
      applied: ['evt_CL_000001', 'evt_CL_000003'],
      duplicated: ['evt_CL_000002'],
      unknown: [],
    })
    const pusher = new OutboundPusher({ store, transport })

    const result = await pusher.pushPending()

    expect(transport.batches).toHaveLength(1)
    expect(transport.batches[0]).toHaveLength(3)
    expect(transport.batches[0]![0]).toEqual({
      event_id: 'evt_CL_000001',
      type: 'sample.received',
      occurred_at: FIXED_NOW.toISOString(),
      payload: { barcode: 'B0' },
    })
    expect(result.pushed.sort()).toEqual(['evt_CL_000001', 'evt_CL_000002', 'evt_CL_000003'])
    expect(result.failed).toEqual([])
    for (const rec of eventRecords(store)) {
      expect(rec.payload.processing?.status).toBe('pushed')
      expect(rec.payload.processing?.processedAt).toBeDefined()
    }
  })

  it('honors maxBatch chunking', async () => {
    const store = makeFakeStore()
    await seedMints(store, 5)
    const transport = makeFakeTransport()
    const pusher = new OutboundPusher({ store, transport, maxBatch: 2 })

    await pusher.pushPending()

    expect(transport.batches.map((b) => b.length)).toEqual([2, 2, 1])
  })

  it('transport throw marks chunk push_failed; next pushPending retries the same events', async () => {
    const store = makeFakeStore()
    await seedMints(store, 2)
    const transport = makeFakeTransport(
      new Error('connection reset'),
      { ok: true, applied: ['evt_CL_000001', 'evt_CL_000002'], duplicated: [], unknown: [] },
    )
    const pusher = new OutboundPusher({ store, transport })

    const first = await pusher.pushPending()
    expect(first.failed.sort()).toEqual(['evt_CL_000001', 'evt_CL_000002'])
    for (const rec of eventRecords(store)) {
      expect(rec.payload.processing?.status).toBe('push_failed')
    }

    const second = await pusher.pushPending()
    expect(second.pushed.sort()).toEqual(['evt_CL_000001', 'evt_CL_000002'])
    // retry batch carries the same event ids
    expect(transport.batches[1]!.map((e) => e.event_id)).toEqual(['evt_CL_000001', 'evt_CL_000002'])
    for (const rec of eventRecords(store)) {
      expect(rec.payload.processing?.status).toBe('pushed')
    }
  })

  it('unknown ids from the website count as delivered (pushed)', async () => {
    const store = makeFakeStore()
    await seedMints(store, 2)
    const transport = makeFakeTransport({
      ok: true,
      applied: ['evt_CL_000001'],
      duplicated: [],
      unknown: ['evt_CL_000002'],
    })
    const pusher = new OutboundPusher({ store, transport })

    const result = await pusher.pushPending()

    expect(result.pushed.sort()).toEqual(['evt_CL_000001', 'evt_CL_000002'])
    expect(result.failed).toEqual([])
    const rec2 = eventRecords(store).find((r) => r.payload.eventId === 'evt_CL_000002')
    expect(rec2?.payload.processing?.status).toBe('pushed')
  })

  it('does not re-push already-pushed events; skips inbound records', async () => {
    const store = makeFakeStore()
    await seedMints(store, 1)
    store.records.set('LSYN-000500', {
      recordId: 'LSYN-000500',
      schemaId: SCHEMA_IDS.labSyncEvent,
      payload: {
        kind: 'lab-sync-event',
        recordId: 'LSYN-000500',
        eventId: 'evt_TYF_5',
        direction: 'inbound',
        eventType: 'order.created',
        payload: {},
        processing: { status: 'pending' },
      },
    })
    const transport = makeFakeTransport()
    const pusher = new OutboundPusher({ store, transport })

    await pusher.pushPending()
    const result = await pusher.pushPending()

    expect(transport.batches).toHaveLength(1)
    expect(transport.batches[0]!.map((e) => e.event_id)).toEqual(['evt_CL_000001'])
    expect(result.pushed).toEqual([])
  })
})

// ---------- reports ----------

describe('buildReportReleasedPayload', () => {
  const reportRecord = {
    payload: {
      kind: 'report',
      recordId: 'RPT-2026-00331',
      revision: 2,
      releasedAt: '2026-09-26T11:04:21-04:00',
    },
  }

  it('builds the payload with base64 artifact under the cap', async () => {
    const b64 = Buffer.from('%PDF-1.4 test').toString('base64')
    const p = buildReportReleasedPayload({
      orderId: 'ORD-2026-00042',
      reportRecord,
      artifactBase64: b64,
    })
    expect(p).toEqual({
      order_remote_id: 'ORD-2026-00042',
      report_id: 'RPT-2026-00331',
      revision: 2,
      released_at: '2026-09-26T11:04:21-04:00',
      artifact_base64: b64,
    })
  })

  it('omits oversize artifact_base64 rather than sending a truncated/fake artifact', async () => {
    const big = 'A'.repeat(2 * MAX_ARTIFACT_BASE64_BYTES) // 1.5x cap decoded
    expect(Buffer.byteLength(big, 'base64')).toBeGreaterThan(MAX_ARTIFACT_BASE64_BYTES)
    const p = buildReportReleasedPayload({
      orderId: 'ORD-2026-00042',
      reportRecord,
      artifactBase64: big,
    })
    expect('artifact_base64' in p).toBe(false)
    expect('artifact_url' in p).toBe(false)
  })

  it('supports artifact_url instead of inline bytes', async () => {
    const p = buildReportReleasedPayload({
      orderId: 'ORD-2026-00042',
      reportRecord,
      artifactUrl: 'https://lab.example/reports/r2.pdf',
    })
    expect(p.artifact_url).toBe('https://lab.example/reports/r2.pdf')
    expect('artifact_base64' in p).toBe(false)
  })

  it('rejects both artifact_base64 and artifact_url together', async () => {
    expect(() =>
      buildReportReleasedPayload({
        orderId: 'ORD-1',
        reportRecord,
        artifactBase64: 'AAAA',
        artifactUrl: 'https://x/y.pdf',
      }),
    ).toThrow()
  })
})
