/**
 * LabSyncWorker E2E — stub website in-process (control flow of
 * scripts/fake-lab.mjs inverted). The stub holds an append-only event table,
 * serves /events, records acks, and receives ingest pushes. The worker pulls,
 * translates to records (fake store), acks AFTER durable commit, persists the
 * cursor, and pushes CL-minted events back.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LabSyncWorker, isLabSyncConfigured } from './LabSyncWorker.js'
import { OutboundMinter } from './outbound/mint.js'
import type { LabSyncWireEvent } from './types.js'
import type { RecordEnvelope } from '../types/RecordEnvelope.js'
import type { RecordFilter, RecordStore } from '../store/types.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MAPPING_PATH = join(repoRoot, 'config', 'lab-sync', 'mapping.yaml')

// --- fake store (same shape as translate/inbound.test.ts) -------------------
class FakeStore {
  records = new Map<string, RecordEnvelope>()
  async get(recordId: string): Promise<RecordEnvelope | null> {
    const rec = this.records.get(recordId)
    return rec ? structuredClone(rec) : null
  }
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    let out = [...this.records.values()]
    if (filter?.kind) out = out.filter(r => (r.payload as Record<string, unknown>)?.kind === filter.kind)
    if (filter?.idPrefix) out = out.filter(r => r.recordId.startsWith(filter.idPrefix!))
    return structuredClone(out)
  }
  async create(opts: { envelope: RecordEnvelope }) {
    if (this.records.has(opts.envelope.recordId)) return { success: false, error: 'dup' }
    this.records.set(opts.envelope.recordId, structuredClone(opts.envelope))
    return { success: true, envelope: structuredClone(opts.envelope) }
  }
  async update(opts: { envelope: RecordEnvelope }) {
    if (!this.records.has(opts.envelope.recordId)) return { success: false, error: 'missing' }
    this.records.set(opts.envelope.recordId, structuredClone(opts.envelope))
    return { success: true, envelope: structuredClone(opts.envelope) }
  }
  async exists(recordId: string) { return this.records.has(recordId) }
  asStore(): RecordStore { return this as unknown as RecordStore }
  payload(id: string): Record<string, unknown> {
    return this.records.get(id)!.payload as Record<string, unknown>
  }
}

// --- stub website ------------------------------------------------------------
class StubWebsite {
  table: LabSyncWireEvent[] = []
  ackedCursor = 0
  ingestedBatches: LabSyncWireEvent[][] = []
  private ingestedIds = new Set<string>()
  private nextCursor = 1
  requests: Array<{ method: string; path: string; token: string | null }> = []

  publish(type: string, payload: Record<string, unknown>): void {
    this.table.push({
      event_id: `evt_TYF_${String(this.nextCursor).padStart(6, '0')}`,
      cursor: this.nextCursor++,
      type,
      occurred_at: '2026-09-26T17:42:31-04:00',
      payload,
    })
  }

  fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    const token = (init?.headers as Record<string, string> | undefined)?.['X-LAB-TOKEN'] ?? null
    this.requests.push({ method: init?.method ?? 'GET', path: url.pathname, token })
    if (url.pathname.endsWith('/lab-sync/events')) {
      const cursor = Number(url.searchParams.get('cursor') ?? '0')
      const page = this.table.filter(e => (e.cursor ?? 0) > cursor).slice(0, 200)
      const maxCursor = page.length > 0 ? Math.max(...page.map(e => e.cursor ?? 0)) : cursor
      return Response.json({ ok: true, events: page, cursor: maxCursor })
    }
    if (url.pathname.endsWith('/lab-sync/ack')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { cursor: number }
      this.ackedCursor = Math.max(this.ackedCursor, body.cursor)
      return Response.json({ ok: true, acked_cursor: this.ackedCursor })
    }
    if (url.pathname.endsWith('/lab-sync/ingest')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { events: LabSyncWireEvent[] }
      const applied: string[] = []
      const duplicated: string[] = []
      for (const ev of body.events) {
        if (this.ingestedIds.has(ev.event_id)) duplicated.push(ev.event_id)
        else { this.ingestedIds.add(ev.event_id); applied.push(ev.event_id) }
      }
      this.ingestedBatches.push(body.events)
      return Response.json({ ok: true, applied, duplicated, unknown: [] })
    }
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  }
}

describe('LabSyncWorker E2E (stub website)', () => {
  let dir: string
  let website: StubWebsite
  let store: FakeStore
  let worker: LabSyncWorker

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cl-labsync-e2e-'))
    website = new StubWebsite()
    store = new FakeStore()
    worker = new LabSyncWorker(
      { store: store.asStore(), dataDir: dir } as never,
      { enabled: true, baseUrl: 'http://stub.test/api', token: 'test-token-abc', longPollWaitSeconds: 0 },
      { mappingPath: MAPPING_PATH, fetchImpl: website.fetchImpl, cursorFile: join(dir, 'var/lab-sync/cursor.json') },
    )
  })

  afterEach(async () => {
    await worker.stop()
    await rm(dir, { recursive: true, force: true })
  })

  it('isLabSyncConfigured gate: enabled + non-empty token + baseUrl only', () => {
    expect(isLabSyncConfigured(undefined)).toBe(false)
    expect(isLabSyncConfigured({ enabled: true, baseUrl: 'x' })).toBe(false)
    expect(isLabSyncConfigured({ enabled: true, baseUrl: 'x', token: '  ' })).toBe(false)
    expect(isLabSyncConfigured({ enabled: false, baseUrl: 'x', token: 't' })).toBe(false)
    expect(isLabSyncConfigured({ enabled: true, baseUrl: 'x', token: 't' })).toBe(true)
  })

  it('pull -> translate -> durable commit -> ack -> cursor, full order flow', async () => {
    website.publish('customer.created', {
      customer: { email: 'jane@example.com', name: 'Jane Smith' },
      source: { system: 'test-your-food.com' },
    })
    website.publish('order.created', {
      order_remote_id: 'tyfored_9f3a21',
      remote_revision: 1,
      placed_at: '2026-09-26T17:42:31-04:00',
      customer: { email: 'jane@example.com', name: 'Jane Smith' },
      requested_services: [
        { line_id: 'tyforl_1a2b3c', service: 'fatty-acid-analysis', matrix: 'fat', sample_count: 2,
          requested_reporting: { basis: 'percent_total_fatty_acids' } },
      ],
      total_amount: 250.0, currency: 'USD', affiliate_code: 'AA-ANGELACRES',
    })

    const summary = await worker.pollOnce()
    expect(summary.fetched).toBe(2)
    expect(summary.errors).toHaveLength(0)
    expect(summary.ackedCursor).toBe(2)

    // Website saw the ack; local cursor persisted.
    expect(website.ackedCursor).toBe(2)
    const cursorFile = JSON.parse(await readFile(join(dir, 'var/lab-sync/cursor.json'), 'utf8'))
    expect(cursorFile.cursor).toBe(2)

    // Records exist: customer + order (+ requested-service + event mirrors).
    const customers = await store.list({ kind: 'customer' })
    const orders = await store.list({ kind: 'order' })
    expect(customers).toHaveLength(1)
    expect(orders).toHaveLength(1)
    const orderPayload = orders[0]!.payload as Record<string, unknown>
    expect((orderPayload.source as Record<string, unknown>).remoteId).toBe('tyfored_9f3a21')
    const events = await store.list({ kind: 'lab-sync-event' })
    expect(events.length).toBeGreaterThanOrEqual(2)

    // Every request carried the shared secret.
    expect(website.requests.every(r => r.token === 'test-token-abc')).toBe(true)
  })

  it('second poll is empty-cursor-stable and replays dedupe by event_id', async () => {
    website.publish('customer.created', {
      customer: { email: 'dup@example.com', name: 'Dup' },
      source: { system: 'test-your-food.com' },
    })
    await worker.pollOnce()
    const ordersAfter1 = (await store.list({ kind: 'customer' })).length

    // Empty page: cursor must not jump.
    const idle = await worker.pollOnce()
    expect(idle.fetched).toBe(0)
    expect((await worker.status()).cursor).toBe(1)

    // Force a replay by rewinding the local cursor file (simulates crash
    // after ack, before persist was skipped -> re-pull).
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, 'var/lab-sync/cursor.json'), JSON.stringify({ cursor: 0 }))
    const replay = await worker.pollOnce()
    expect(replay.duplicated).toBe(1)
    expect((await store.list({ kind: 'customer' })).length).toBe(ordersAfter1)
  })

  it('mid-page translation error stops before ack (no ack past uncommitted events)', async () => {
    website.publish('customer.created', {
      customer: { email: 'ok@example.com', name: 'Ok' }, source: { system: 'test-your-food.com' },
    })
    // Malformed event second: payload missing customer -> translator throws or
    // unknown_type; either way ack must not skip an unprocessed event if error.
    website.publish('customer.created', { notAValidPayload: true, source: {} })
    const summary = await worker.pollOnce()
    if (summary.errors.length > 0) {
      expect(website.ackedCursor).toBeLessThan(2)
    } else {
      // unknown_type is still "handled durably" -> ack is allowed.
      expect(summary.unknownType + summary.duplicated + summary.applied).toBe(2)
    }
  })

  it('outbound: minted report.released pushes via ingest and dedupes on retry', async () => {
    const minter = new OutboundMinter({ store: store.asStore(), now: () => new Date('2026-09-29T11:04:21-04:00') })
    await minter.mint('report.released', { order_remote_id: 'tyfored_9f3a21', report_id: 'RPT-000001', revision: 1 })

    const result = await worker.pushOutbound()
    expect(result.pushed).toHaveLength(1)
    expect(result.failed).toHaveLength(0)
    expect(website.ingestedBatches[0]![0]!.event_id).toMatch(/^evt_CL_/)

    // Re-push after transport failure simulation: flip the record back to pending
    // (as push_failed would) and confirm whole-batch retry dedupes cleanly.
    const events = await store.list({ kind: 'lab-sync-event' })
    const outbound = events.find(e => (e.payload as Record<string, unknown>).direction === 'outbound')!
    const payload = structuredClone(outbound.payload) as Record<string, unknown>
    ;(payload.processing as Record<string, unknown>).status = 'push_failed'
    await store.update({ envelope: { ...outbound, payload } })

    const retry = await worker.pushOutbound()
    expect(retry.pushed).toHaveLength(1) // duplicated counts as delivered
    expect(website.ingestedBatches).toHaveLength(2)
  })

  // --- identity / verification / registration lifecycle (wave 1..4) --------
  // Same harness; pins fetch -> translate -> ack -> cursor for
  // customer.identity_assigned + sample.registered (extended fields) and the
  // truthfulness of lab-sync-event mirror processing.status end to end.

  const WEBSITE_CUSTOMER_ID = 'tyfcus_' + 'ab'.repeat(16)

  /** Inbound mirrors currently in the fake store, in creation order. */
  async function inboundMirrors(): Promise<Array<Record<string, unknown>>> {
    const events = await store.list({ kind: 'lab-sync-event' })
    return events
      .map(e => e.payload as Record<string, unknown>)
      .filter(p => p.direction === 'inbound')
  }

  it('identity lifecycle end to end: order -> identity_assigned -> sample.registered', async () => {
    website.publish('order.created', {
      order_remote_id: 'tyfored_9f3a21',
      remote_revision: 1,
      placed_at: '2026-09-26T17:42:31-04:00',
      customer: { email: 'jane@example.com', name: 'Jane Smith' },
      requested_services: [
        { line_id: 'tyforl_01', service: 'fatty-acid-analysis', matrix: 'fat', sample_count: 1,
          requested_reporting: { basis: 'percent_total_fatty_acids' } },
      ],
      total_amount: 125.0, currency: 'USD',
    })
    website.publish('customer.identity_assigned', {
      customer_id: WEBSITE_CUSTOMER_ID,
      email: 'jane@example.com',
    })
    website.publish('sample.registered', {
      order_remote_id: 'tyfored_9f3a21',
      barcode: 'TYF-9F7A21',
      sample_id: 'tyfsmp_A1B2C3',
      line_id: 'tyforl_01',
      slot: 1,
      customer_sample_description: { type: 'fat', description: 'olive oil' },
    })

    const summary = await worker.pollOnce()
    expect(summary.fetched).toBe(3)
    expect(summary.errors).toHaveLength(0)
    expect(summary.ackedCursor).toBe(3)

    // Exactly one customer: email identity in source, tyfcus identity aliased.
    const customers = await store.list({ kind: 'customer' })
    expect(customers).toHaveLength(1)
    const cust = customers[0]!.payload as Record<string, unknown>
    expect((cust.source as Record<string, unknown>).remoteId).toBe('email:jane@example.com')
    const aliases = cust.aliases as Array<Record<string, unknown>>
    expect(aliases).toHaveLength(1)
    expect(aliases[0]!.system).toBe('test-your-food.com')
    expect(aliases[0]!.remoteId).toBe(WEBSITE_CUSTOMER_ID)

    // Minted sample carries BOTH identifiers: barcode + website sample id.
    const samples = await store.list({ kind: 'sample' })
    expect(samples).toHaveLength(1)
    const identifiers = (samples[0]!.payload as Record<string, unknown>).identifiers as Array<Record<string, unknown>>
    expect(identifiers).toHaveLength(2)
    expect(identifiers).toEqual(expect.arrayContaining([
      { system: 'tyf-barcode', value: 'TYF-9F7A21' },
      { system: 'tyf-sample-id', value: 'tyfsmp_A1B2C3' },
    ]))

    // Registration record mirrors the extended identity fields.
    const regs = await store.list({ kind: 'sample-registration' })
    expect(regs).toHaveLength(1)
    const reg = regs[0]!.payload as Record<string, unknown>
    expect(reg.sampleId).toBe('tyfsmp_A1B2C3')
    expect(reg.lineId).toBe('tyforl_01')
    expect(reg.slot).toBe(1)

    // All three inbound mirrors truthfully 'applied'.
    const mirrors = await inboundMirrors()
    expect(mirrors).toHaveLength(3)
    for (const m of mirrors) {
      expect((m.processing as Record<string, unknown>).status).toBe('applied')
    }

    // Ack advanced past all three; local cursor agrees.
    expect(website.ackedCursor).toBe(3)
    const cursorFile = JSON.parse(await readFile(join(dir, 'var/lab-sync/cursor.json'), 'utf8'))
    expect(cursorFile.cursor).toBe(3)
    expect((await worker.status()).cursor).toBe(3)
  })

  it('ambiguous identity is visible end to end: needs_review mirror, no mutation, worker still acks', async () => {
    website.publish('customer.created', {
      customer: { email: 'jane@example.com', name: 'Jane One' },
      source: { system: 'test-your-food.com' },
    })
    await worker.pollOnce() // mints CUST-00001 via source.remoteId email identity

    // Plant a SECOND email match directly in the store (contacts[] entry,
    // different case + trailing space — normalizes to the same address),
    // mirroring translate/inbound.test.ts's ambiguity technique.
    store.records.set('CUST-99999', {
      recordId: 'CUST-99999',
      schemaId: 'customer',
      payload: {
        kind: 'customer',
        recordId: 'CUST-99999',
        name: 'Jane Two',
        contacts: [{ channel: 'email', value: 'Jane@Example.com ' }],
      },
    })
    website.publish('customer.identity_assigned', {
      customer_id: WEBSITE_CUSTOMER_ID,
      email: 'jane@example.com',
    })
    const identityEventId = website.table[1]!.event_id

    const summary = await worker.pollOnce()
    expect(summary.errors).toHaveLength(0) // needs_review is NOT a failure

    const identityMirror = (await inboundMirrors()).find(m => m.eventId === identityEventId)
    expect(identityMirror).toBeDefined()
    const processing = identityMirror!.processing as Record<string, unknown>
    expect(processing.status).toBe('needs_review')
    expect(String(processing.error)).toContain('jane@example.com')

    // NEITHER candidate mutated.
    const customers = await store.list({ kind: 'customer' })
    expect(customers).toHaveLength(2)
    for (const c of customers) {
      expect((c.payload as Record<string, unknown>).aliases).toBeUndefined()
    }

    // needs_review is a TERMINAL processing status (like unknown_type), not a
    // transport failure: the page was durably handled, so the worker ACKS it
    // and the cursor advances. Mirrors the worker's unknown_type policy.
    expect(website.ackedCursor).toBe(2)
    const cursorFile = JSON.parse(await readFile(join(dir, 'var/lab-sync/cursor.json'), 'utf8'))
    expect(cursorFile.cursor).toBe(2)
  })

  it('needs_review does not block later events: subsequent order.updated still applies', async () => {
    website.publish('order.created', {
      order_remote_id: 'tyfored_9f3a21',
      remote_revision: 1,
      placed_at: '2026-09-26T17:42:31-04:00',
      customer: { email: 'jane@example.com', name: 'Jane One' },
      requested_services: [
        { line_id: 'tyforl_01', service: 'fatty-acid-analysis', matrix: 'fat', sample_count: 1 },
      ],
      total_amount: 125.0, currency: 'USD',
    })
    await worker.pollOnce() // mints CUST-00001 + the order

    // Recreate the ambiguous-identity situation from the previous test.
    store.records.set('CUST-99999', {
      recordId: 'CUST-99999',
      schemaId: 'customer',
      payload: {
        kind: 'customer',
        recordId: 'CUST-99999',
        name: 'Jane Two',
        contacts: [{ channel: 'email', value: 'Jane@Example.com ' }],
      },
    })
    website.publish('customer.identity_assigned', {
      customer_id: WEBSITE_CUSTOMER_ID,
      email: 'jane@example.com',
    })
    // A later, unrelated event on the SAME page must not be starved by the
    // needs_review sibling: status change applies, cursor advances past both.
    website.publish('order.updated', {
      order_remote_id: 'tyfored_9f3a21',
      remote_revision: 2,
      changes: { status: 'awaiting_sample', payment: { status: 'paid' } },
    })

    const summary = await worker.pollOnce()
    expect(summary.fetched).toBe(2)
    expect(summary.errors).toHaveLength(0)

    const mirrors = await inboundMirrors()
    expect(mirrors).toHaveLength(3)
    const byType = new Map(mirrors.map(m => [m.eventType as string, (m.processing as Record<string, unknown>).status]))
    expect(byType.get('customer.identity_assigned')).toBe('needs_review')
    expect(byType.get('order.updated')).toBe('applied')

    // The order actually moved.
    const orders = await store.list({ kind: 'order' })
    expect(orders).toHaveLength(1)
    const order = orders[0]!.payload as Record<string, unknown>
    expect(order.status).toBe('awaiting_sample')
    expect((order.payment as Record<string, unknown>).status).toBe('paid')
    expect((order.source as Record<string, unknown>).remoteRevision).toBe(2)

    // Ack covers the whole page INCLUDING the needs_review event.
    expect(website.ackedCursor).toBe(3)
    const cursorFile = JSON.parse(await readFile(join(dir, 'var/lab-sync/cursor.json'), 'utf8'))
    expect(cursorFile.cursor).toBe(3)
  })
})
