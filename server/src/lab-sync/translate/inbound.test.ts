/**
 * Inbound translator tests (fake in-memory RecordStore, real mapping.yaml).
 *
 * Record kinds live store-side flat: the fake list({kind}) filters on
 * payload.kind, list({idPrefix}) filters on recordId prefix — same semantics
 * the real RecordStoreImpl applies.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { RecordEnvelope, RecordFilter, RecordStore } from '../../store/types.js'
import type { LabSyncWireEvent } from '../types.js'
import { loadMapping } from './mapping.js'
import { InboundTranslator } from './inbound.js'

/** In-memory fake: Map keyed by recordId; envelopes are stored by clone. */
class FakeStore {
  records = new Map<string, RecordEnvelope>()

  async get(recordId: string): Promise<RecordEnvelope | null> {
    const rec = this.records.get(recordId)
    return rec ? structuredClone(rec) : null
  }
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    let out = [...this.records.values()]
    if (filter?.kind) {
      out = out.filter((r) => (r.payload as Record<string, unknown>)?.kind === filter.kind)
    }
    if (filter?.idPrefix) {
      const p = filter.idPrefix
      out = out.filter((r) => r.recordId.startsWith(p))
    }
    return structuredClone(out)
  }
  async create(opts: { envelope: RecordEnvelope }): Promise<{ success: boolean; envelope?: RecordEnvelope; error?: string }> {
    if (this.records.has(opts.envelope.recordId)) {
      return { success: false, error: `duplicate recordId ${opts.envelope.recordId}` }
    }
    this.records.set(opts.envelope.recordId, structuredClone(opts.envelope))
    return { success: true, envelope: structuredClone(opts.envelope) }
  }
  async update(opts: { envelope: RecordEnvelope }): Promise<{ success: boolean; envelope?: RecordEnvelope; error?: string }> {
    if (!this.records.has(opts.envelope.recordId)) {
      return { success: false, error: `missing recordId ${opts.envelope.recordId}` }
    }
    this.records.set(opts.envelope.recordId, structuredClone(opts.envelope))
    return { success: true, envelope: structuredClone(opts.envelope) }
  }
  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId)
  }
  asStore(): RecordStore {
    return this as unknown as RecordStore
  }
  payload(id: string): Record<string, unknown> {
    return this.records.get(id)!.payload as Record<string, unknown>
  }
  idsOfKind(kind: string): string[] {
    return [...this.records.values()]
      .filter((r) => (r.payload as Record<string, unknown>)?.kind === kind)
      .map((r) => r.recordId)
      .sort()
  }
}

const MAPPING_PATH = new URL('../../../../config/lab-sync/mapping.yaml', import.meta.url)

const NOW = new Date('2026-09-26T18:00:00-04:00')

function orderCreated(overrides: Partial<LabSyncWireEvent> = {}): LabSyncWireEvent {
  return {
    event_id: 'evt_TYF_000123',
    cursor: 123,
    type: 'order.created',
    occurred_at: '2026-09-26T17:42:31-04:00',
    payload: {
      order_remote_id: 'tyfored_9f3a21',
      remote_revision: 1,
      placed_at: '2026-09-26T17:42:31-04:00',
      customer: {
        email: 'jane@example.com',
        name: 'Jane Smith',
        address: { street: '1 Main St', city: 'Ithaca', region: 'NY', postal: '14850', country: 'US' },
      },
      requested_services: [
        {
          line_id: 'tyforl_1a2b3c',
          service: 'fatty-acid-analysis',
          matrix: 'fat',
          sample_count: 2,
          requested_reporting: { basis: 'percent_total_fatty_acids' },
        },
        { line_id: 'tyforl_4d5e6f', service: 'pesticide-screening', matrix: 'dairy', sample_count: 1 },
      ],
      total_amount: 250.0,
      currency: 'USD',
      affiliate_code: 'AA-ANGELACRES',
    },
    ...overrides,
  }
}

describe('InboundTranslator', () => {
  let store: FakeStore
  let translator: InboundTranslator

  beforeEach(async () => {
    store = new FakeStore()
    const mapping = await loadMapping(MAPPING_PATH.pathname)
    translator = new InboundTranslator({ store: store.asStore(), mapping, now: () => NOW })
  })

  it('order.created mints CUST + ORD + 2 RSVC and a lab-sync mirror (applied)', async () => {
    const result = await translator.process(orderCreated())
    expect(result.status).toBe('applied')

    expect(store.idsOfKind('customer')).toEqual(['CUST-00001'])
    expect(store.idsOfKind('order')).toEqual(['ORD-2026-00001'])
    expect(store.idsOfKind('requested-service')).toEqual(['RSVC-2026-00001-01', 'RSVC-2026-00002-02'].map((_, i) => `RSVC-2026-00001-0${i + 1}`))

    const cust = store.payload('CUST-00001')
    expect(cust.kind).toBe('customer')
    expect(cust.extends).toBe('party')
    expect(cust.name).toBe('Jane Smith')
    expect(cust.partyType).toBe('person')
    expect(cust.status).toBe('active')
    expect(cust.contacts).toEqual([{ channel: 'email', value: 'jane@example.com' }])
    expect(cust.addresses).toEqual([
      { street: '1 Main St', city: 'Ithaca', region: 'NY', postal: '14850', country: 'US' },
    ])
    // Deviation: the website has no customer remote id — email IS the identity.
    expect(cust.source).toEqual({
      system: 'test-your-food.com',
      remoteId: 'email:jane@example.com',
    })

    const order = store.payload('ORD-2026-00001')
    expect(order.kind).toBe('order')
    expect(order.extends).toBe('request')
    expect(order.lifecycleId).toBe('tyf-order')
    expect(order.status).toBe('pending_payment') // minted at row commit, pre-capture
    expect(order.payment).toEqual({ status: 'pending' })
    expect(order.requesterRef).toEqual({ kind: 'record', id: 'CUST-00001', type: 'customer' })
    expect(order.customerRef).toEqual({ kind: 'record', id: 'CUST-00001', type: 'customer' })
    expect(order.source).toEqual({
      system: 'test-your-food.com',
      remoteId: 'tyfored_9f3a21',
      remoteRevision: 1,
    })
    expect(order.requestedAt).toBe('2026-09-26T17:42:31-04:00')
    expect(order.requestedServices).toEqual([
      {
        lineId: 'tyforl_1a2b3c',
        service: 'fatty_acid_profile',
        matrix: 'cf:fat-matrix',
        sampleCount: 2,
        requestedReporting: { basis: 'percent_total_fatty_acids' },
      },
      { lineId: 'tyforl_4d5e6f', service: 'pesticide_panel', matrix: 'cf:dairy-matrix', sampleCount: 1 },
    ])
    expect(order.totalAmount).toBe(250)
    expect(order.currency).toBe('USD')
    expect(order.affiliateCode).toBe('AA-ANGELACRES')

    const rsvc = store.payload('RSVC-2026-00001-01')
    expect(rsvc.kind).toBe('requested-service')
    expect(rsvc.requestRef).toEqual({ kind: 'record', id: 'ORD-2026-00001', type: 'order' })
    expect(rsvc.lineId).toBe('tyforl_1a2b3c')
    expect(rsvc.service).toBe('fatty_acid_profile')
    expect(rsvc.matrix).toBe('cf:fat-matrix')
    expect(rsvc.sampleCount).toBe(2)
    expect(rsvc.requestedReporting).toEqual({ basis: 'percent_total_fatty_acids' })
    expect(rsvc.status).toBe('requested')

    // Mirror: exactly one lab-sync-event, status finalized as applied.
    expect(store.idsOfKind('lab-sync-event')).toEqual(['LSYN-00001'])
    const mirror = store.payload('LSYN-00001')
    expect(mirror.eventId).toBe('evt_TYF_000123')
    expect(mirror.direction).toBe('inbound')
    expect(mirror.cursor).toBe(123)
    expect(mirror.eventType).toBe('order.created')
    expect(mirror.occurredAt).toBe('2026-09-26T17:42:31-04:00')
    expect((mirror.payload as Record<string, unknown>).order_remote_id).toBe('tyfored_9f3a21')
    const processing = mirror.processing as Record<string, unknown>
    expect(processing.status).toBe('applied')
    expect(processing.affectedRecordIds).toEqual(['CUST-00001', 'ORD-2026-00001', 'RSVC-2026-00001-01', 'RSVC-2026-00001-02'])
    expect(processing.processedAt).toBe(NOW.toISOString())
    expect(result.affectedRecordIds).toEqual(processing.affectedRecordIds as string[])
  })

  it('unknown service slug is a hard stop: unknown_type, error names the slug, nothing minted', async () => {
    const ev = orderCreated({
      event_id: 'evt_TYF_000124',
      cursor: 124,
      payload: {
        ...(orderCreated().payload as Record<string, unknown>),
        requested_services: [
          { line_id: 'tyforl_x', service: 'mystery-test', matrix: 'fat', sample_count: 1 },
        ],
      },
    })
    const result = await translator.process(ev)
    expect(result.status).toBe('unknown_type')
    expect(result.error).toContain('mystery-test')
    expect(result.affectedRecordIds).toEqual([])
    // Hard stop: no customer/order/rsvc invented.
    expect(store.idsOfKind('order')).toEqual([])
    expect(store.idsOfKind('customer')).toEqual([])
    // Only the durable mirror remains, storing the event verbatim.
    expect(store.idsOfKind('lab-sync-event')).toEqual(['LSYN-00001'])
    expect((store.payload('LSYN-00001').processing as Record<string, unknown>).status).toBe('unknown_type')
  })

  it('a second process() with the same event_id returns duplicated with the original affected ids', async () => {
    const first = await translator.process(orderCreated())
    const second = await translator.process(orderCreated())
    expect(second.status).toBe('duplicated')
    expect(second.affectedRecordIds).toEqual(first.affectedRecordIds)
    // Still exactly one mirror, still applied, still exactly one order.
    expect(store.idsOfKind('lab-sync-event')).toEqual(['LSYN-00001'])
    expect((store.payload('LSYN-00001').processing as Record<string, unknown>).status).toBe('applied')
    expect(store.idsOfKind('order')).toEqual(['ORD-2026-00001'])
  })

  it('order.updated: stale revision -> ignored_stale; newer revision patches known fields', async () => {
    await translator.process(orderCreated())

    const stale = await translator.process({
      event_id: 'evt_TYF_000200',
      cursor: 200,
      type: 'order.updated',
      payload: { order_remote_id: 'tyfored_9f3a21', remote_revision: 1, changes: { status: 'paid' } },
    })
    expect(stale.status).toBe('ignored_stale')
    expect(store.payload('ORD-2026-00001').status).toBe('pending_payment')

    const fresh = await translator.process({
      event_id: 'evt_TYF_000201',
      cursor: 201,
      type: 'order.updated',
      payload: {
        order_remote_id: 'tyfored_9f3a21',
        remote_revision: 2,
        changes: { status: 'awaiting_sample', payment: { status: 'paid' }, kit: { status: 'shipped' }, junk_key: 'ignored' },
      },
    })
    expect(fresh.status).toBe('applied')
    const order = store.payload('ORD-2026-00001')
    expect(order.status).toBe('awaiting_sample')
    expect(order.payment).toEqual({ status: 'paid' })
    expect(order.sampleKit).toEqual({ status: 'shipped' })
    expect(order.junk_key).toBeUndefined()
    expect((order.source as Record<string, unknown>).remoteRevision).toBe(2)
  })

  it('sample.registered mints REG + SMP, links the order, and advances awaiting_sample -> sample_registered', async () => {
    await translator.process(orderCreated())
    await translator.process({
      event_id: 'evt_TYF_000201',
      cursor: 201,
      type: 'order.updated',
      payload: { order_remote_id: 'tyfored_9f3a21', remote_revision: 2, changes: { status: 'awaiting_sample' } },
    })

    const result = await translator.process({
      event_id: 'evt_TYF_000300',
      cursor: 300,
      type: 'sample.registered',
      payload: {
        order_remote_id: 'tyfored_9f3a21',
        barcode: 'TYF-9F7A21',
        customer_sample_description: { type: 'fat', description: 'beef tallow', customer_label: 'jar A' },
        registered_at: '2026-09-28T10:00:00-04:00',
      },
    })
    expect(result.status).toBe('applied')

    expect(store.idsOfKind('sample-registration')).toEqual(['REG-00001'])
    const reg = store.payload('REG-00001')
    expect(reg.kind).toBe('sample-registration')
    expect(reg.orderRef).toEqual({ kind: 'record', id: 'ORD-2026-00001', type: 'order' })
    expect(reg.identifier).toEqual({ system: 'tyf-barcode', value: 'TYF-9F7A21' })
    expect(reg.customerDescription).toEqual({
      matrix: 'cf:fat-matrix',
      description: 'beef tallow',
      customerLabel: 'jar A',
    })
    expect(reg.registeredAt).toBe('2026-09-28T10:00:00-04:00')

    const smpIds = store.idsOfKind('sample')
    expect(smpIds.length).toBe(1)
    const smp = store.payload(smpIds[0])
    expect(smp.kind).toBe('sample')
    expect(smp.requestRef).toEqual({ kind: 'record', id: 'ORD-2026-00001', type: 'order' })
    expect(smp.identifiers).toEqual([{ system: 'tyf-barcode', value: 'TYF-9F7A21' }])
    expect(smp.submittedDescription).toEqual({
      matrix: 'cf:fat-matrix',
      description: 'beef tallow',
      customerLabel: 'jar A',
    })
    expect(smp.lifecycleId).toBe('lab-sample')
    expect(smp.status).toBe('registered')

    const order = store.payload('ORD-2026-00001')
    expect(order.sampleRefs).toEqual([{ kind: 'record', id: smpIds[0], type: 'sample' }])
    expect(order.status).toBe('sample_registered')
  })

  it('sample.registered with a malformed barcode is unknown_type', async () => {
    await translator.process(orderCreated())
    const result = await translator.process({
      event_id: 'evt_TYF_000301',
      cursor: 301,
      type: 'sample.registered',
      payload: {
        order_remote_id: 'tyfored_9f3a21',
        barcode: 'BAD-123',
        customer_sample_description: { type: 'fat', description: 'x' },
        registered_at: '2026-09-28T10:00:00-04:00',
      },
    })
    expect(result.status).toBe('unknown_type')
    expect(result.error).toContain('BAD-123')
    expect(store.idsOfKind('sample-registration')).toEqual([])
    expect(store.idsOfKind('sample')).toEqual([])
  })

  it('unknown event types are mirrored, never dropped', async () => {
    const result = await translator.process({
      event_id: 'evt_TYF_000999',
      cursor: 999,
      type: 'alien.landed',
      payload: { hi: true },
    })
    expect(result.status).toBe('unknown_type')
    expect(result.affectedRecordIds).toEqual([])
    expect(store.idsOfKind('lab-sync-event')).toEqual(['LSYN-00001'])
    expect(store.payload('LSYN-00001').eventType).toBe('alien.landed')
  })
})
