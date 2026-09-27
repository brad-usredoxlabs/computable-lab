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
})
