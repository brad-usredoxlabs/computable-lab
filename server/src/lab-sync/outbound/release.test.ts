/**
 * ReportReleaser tests — release orchestration with ordering contracts:
 * upload-before-release, mint-after-report-update, push-after-mint.
 *
 * Fakes: in-memory store (writes recorded into a shared `seq`), recording
 * minter/pusher/artifact stubs. REAL EvidenceBuilder against temp files so
 * the incomplete-evidence propagation path is exercised for real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RecordEnvelope, RecordFilter, RecordStore, StoreResult } from '../../store/types.js'
import type { LabSyncWireEvent } from '../types.js'
import { EvidenceBuilder, loadEvidencePolicy, type EvidencePolicy } from '../evidence/build.js'
import type { OutboundMinter } from './mint.js'
import type { OutboundPusher } from './push.js'
import type { ArtifactClient } from '../ArtifactClient.js'
import { ReportReleaser } from './release.js'
import { REPORT_RELEASED_EVENT_TYPE, type ReportReleasedPayload } from './reports.js'

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/local.test'
const POLICY_PATH = new URL('../../../../config/lab-sync/evidence.yaml', import.meta.url)
const NOW = new Date('2026-09-27T10:00:00-04:00')

const SAMPLE_ID = 'TYF-SAMPLE-4821'
const BARCODE = 'TYF-9F7A21'
const ORDER_REMOTE_ID = 'tyfored_9f3a21'

let policy: EvidencePolicy
let artifactDir: string

beforeAll(() => {
  policy = loadEvidencePolicy(POLICY_PATH.pathname)
  artifactDir = mkdtempSync(join(tmpdir(), 'release-test-'))
})

afterAll(() => {
  rmSync(artifactDir, { recursive: true, force: true })
})

// ---------- fakes ----------

interface Harness {
  store: RecordStore
  seq: string[]
  uploads: Array<{ id: string; size: number; sampleId?: string }>
  mints: Array<{ type: string; payload: ReportReleasedPayload }>
  pushes: number
  records: Map<string, RecordEnvelope>
  releaser: ReportReleaser
}

function seedRecords(opts: {
  reportStatus?: string
  reportRevision?: number | null
  orderStatus?: string
  orderRemoteId?: string | null
  artifactKinds?: string[]
}): RecordEnvelope[] {
  const kinds = opts.artifactKinds ?? ['graph', 'trace', 'script', 'inputs', 'zip']
  const evidenceFiles = kinds.map((kind) => {
    const path = join(artifactDir, `rel-${kind}-${Math.random().toString(36).slice(2)}.bin`)
    writeFileSync(path, `${kind}-contents`)
    return { id: `ART-${kind.toUpperCase()}`, kind, name: `result.${kind}`, path }
  })
  const reportPayload: Record<string, unknown> = {
    kind: 'report',
    recordId: 'RPT-2026-00331',
    requestRef: { kind: 'record', id: 'ORD-2026-0001', type: 'order' },
    sampleRefs: [{ kind: 'record', id: 'SMP-2026-01231', type: 'sample' }],
    status: opts.reportStatus ?? 'approved',
    evidenceFiles,
  }
  if (opts.reportRevision !== null) reportPayload.revision = opts.reportRevision ?? 1
  return [
    {
      recordId: 'SMP-2026-01231',
      schemaId: SCHEMA_ID,
      payload: {
        kind: 'sample',
        recordId: 'SMP-2026-01231',
        requestRef: { kind: 'record', id: 'ORD-2026-0001', type: 'order' },
        status: 'accessioned',
        identifiers: [
          { system: 'tyf-sample-id', value: SAMPLE_ID },
          { system: 'tyf-barcode', value: BARCODE },
        ],
      },
    },
    { recordId: 'RPT-2026-00331', schemaId: SCHEMA_ID, payload: reportPayload },
    {
      recordId: 'ORD-2026-0001',
      schemaId: SCHEMA_ID,
      payload: {
        kind: 'order',
        recordId: 'ORD-2026-0001',
        status: opts.orderStatus ?? 'testing_complete',
        source: {
          system: 'test-your-food.com',
          ...(opts.orderRemoteId !== null
            ? { remoteId: opts.orderRemoteId ?? ORDER_REMOTE_ID }
            : {}),
        },
      },
    },
  ]
}

function makeHarness(opts: Parameters<typeof seedRecords>[0] = {}): Harness {
  const records = new Map<string, RecordEnvelope>()
  for (const env of seedRecords(opts)) records.set(env.recordId, env)
  const seq: string[] = []
  const uploads: Harness['uploads'] = []
  const mints: Harness['mints'] = []
  let pushes = 0

  const store = {
    async get(recordId: string) {
      const rec = records.get(recordId)
      return rec ? structuredClone(rec) : null
    },
    async list(filter?: RecordFilter) {
      let out = [...records.values()]
      if (filter?.kind) {
        out = out.filter((r) => (r.payload as Record<string, unknown>)?.kind === filter.kind)
      }
      return structuredClone(out)
    },
    async exists(recordId: string) {
      return records.has(recordId)
    },
    async update(options: { envelope: RecordEnvelope; message?: string }): Promise<StoreResult> {
      if (!records.has(options.envelope.recordId)) {
        return { success: false, error: `missing ${options.envelope.recordId}` }
      }
      seq.push(`update:${options.envelope.recordId}`)
      records.set(options.envelope.recordId, structuredClone(options.envelope))
      return { success: true, envelope: options.envelope }
    },
  } as unknown as RecordStore

  const minter = {
    async mint(eventType: string, payload: Record<string, unknown>): Promise<LabSyncWireEvent> {
      seq.push('mint')
      mints.push({ type: eventType, payload: payload as unknown as ReportReleasedPayload })
      return { event_id: 'evt_CL_000001', type: eventType, occurred_at: NOW.toISOString(), payload }
    },
  }

  const pusher = {
    async pushPending() {
      seq.push('push')
      pushes += 1
      return { pushed: ['evt_CL_000001'], failed: [] }
    },
  }

  const artifacts = {
    async uploadFile(id: string, bytes: Buffer, sampleId?: string): Promise<void> {
      seq.push(`upload:${id}`)
      uploads.push({ id, size: bytes.length, sampleId })
    },
  }

  const evidence = new EvidenceBuilder({
    store,
    policy,
    gitLog: async () => [],
    now: () => NOW,
  })

  const releaser = new ReportReleaser({
    store,
    minter: minter as unknown as OutboundMinter,
    pusher: pusher as unknown as OutboundPusher,
    evidence,
    artifacts: artifacts as unknown as ArtifactClient,
    now: () => NOW,
  })

  return { store, seq, uploads, mints, pushes, records, releaser }
}

// ---------- tests ----------

describe('ReportReleaser.releaseSample', () => {
  it('happy path: all uploads precede the report update, which precedes mint, which precedes push', async () => {
    const h = makeHarness()
    const result = await h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')

    expect(result).toEqual({ eventId: 'evt_CL_000001', recordIds: ['RPT-2026-00331'] })

    // Every upload happened before any release-side update.
    const lastUpload = h.seq.map((s, i) => [s, i] as const).filter(([s]) => s.startsWith('upload:')).map(([, i]) => i)
    const reportUpdate = h.seq.indexOf('update:RPT-2026-00331')
    const mint = h.seq.indexOf('mint')
    const push = h.seq.indexOf('push')
    expect(lastUpload.length).toBe(5)
    expect(Math.max(...lastUpload)).toBeLessThan(reportUpdate)
    expect(reportUpdate).toBeLessThan(mint)
    expect(mint).toBeLessThan(push)

    // All five evidence files were uploaded, bound to the website sample id.
    expect(h.uploads.map((u) => u.id).sort()).toEqual(
      ['ART-GRAPH', 'ART-INPUTS', 'ART-SCRIPT', 'ART-TRACE', 'ART-ZIP'],
    )
    for (const u of h.uploads) expect(u.sampleId).toBe(SAMPLE_ID)

    // Report record flipped to released with the pinned timestamp.
    const report = h.records.get('RPT-2026-00331')!.payload as Record<string, unknown>
    expect(report.status).toBe('released')
    expect(report.releasedAt).toBe(NOW.toISOString())
  })

  it('mints report.released with the extended payload (order id, sample context, evidence doc)', async () => {
    const h = makeHarness()
    await h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')

    expect(h.mints).toHaveLength(1)
    const { type, payload } = h.mints[0]!
    expect(type).toBe(REPORT_RELEASED_EVENT_TYPE)
    expect(payload.order_remote_id).toBe(ORDER_REMOTE_ID)
    expect(payload.report_id).toBe('RPT-2026-00331')
    expect(payload.revision).toBe(1)
    expect(payload.released_at).toBe(NOW.toISOString())
    expect(payload.sample_id).toBe(SAMPLE_ID)
    expect(payload.barcode).toBe(BARCODE)
    expect((payload.evidence as { schema_version?: string }).schema_version).toBe('tyf.evidence/1')
  })

  it('advances the order testing_complete -> reported (tyf-order lifecycle) before minting', async () => {
    const h = makeHarness({ orderStatus: 'testing_complete' })
    await h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')

    const order = h.records.get('ORD-2026-0001')!.payload as Record<string, unknown>
    expect(order.status).toBe('reported')
    expect(h.seq.indexOf('update:ORD-2026-0001')).toBeLessThan(h.seq.indexOf('mint'))
  })

  it('leaves an order in any other lifecycle status untouched; release still proceeds', async () => {
    const h = makeHarness({ orderStatus: 'in_testing' })
    const result = await h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')

    expect(result.eventId).toBe('evt_CL_000001')
    const order = h.records.get('ORD-2026-0001')!.payload as Record<string, unknown>
    expect(order.status).toBe('in_testing')
    expect(h.seq).not.toContain('update:ORD-2026-0001')
  })

  it('throws on a non-approved report and touches nothing', async () => {
    const h = makeHarness({ reportStatus: 'draft' })
    await expect(h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')).rejects.toThrow(/draft/)
    expect(h.seq).toEqual([])
    expect(h.uploads).toHaveLength(0)
    expect(h.mints).toHaveLength(0)
  })

  it('throws "already released" for a released report', async () => {
    const h = makeHarness({ reportStatus: 'released' })
    await expect(h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')).rejects.toThrow(
      /already released/,
    )
    expect(h.seq).toEqual([])
  })

  it('throws when the report has no revision', async () => {
    const h = makeHarness({ reportRevision: null })
    await expect(h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')).rejects.toThrow(/revision/)
    expect(h.seq).toEqual([])
  })

  it('incomplete evidence (missing required artifact kinds): builder error propagates, nothing uploaded or minted', async () => {
    const h = makeHarness({ artifactKinds: ['graph', 'trace', 'script', 'inputs'] })
    await expect(h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')).rejects.toThrow(
      /missing required artifact kinds/,
    )
    expect(h.seq).toEqual([])
    expect(h.uploads).toHaveLength(0)
    expect(h.mints).toHaveLength(0)
  })

  it('an order without source.remoteId fails fast before any upload (never fabricate the website id)', async () => {
    const h = makeHarness({ orderRemoteId: null })
    await expect(h.releaser.releaseSample('SMP-2026-01231', 'RPT-2026-00331')).rejects.toThrow(/remoteId/)
    expect(h.seq).toEqual([])
    expect(h.uploads).toHaveLength(0)
  })
})
