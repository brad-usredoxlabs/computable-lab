/**
 * EvidenceBuilder tests (fake in-memory RecordStore, temp-dir artifact files).
 *
 * Mirrors the FakeStore pattern from translate/inbound.test.ts: list({kind})
 * filters on payload.kind; tests never touch real git (gitLog is stubbed).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RecordEnvelope, RecordFilter, RecordStore } from '../../store/types.js'
import {
  EvidenceBuilder,
  applyRedaction,
  loadEvidencePolicy,
  type EvidencePolicy,
} from './build.js'

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
  async exists(recordId: string): Promise<boolean> {
    return this.records.has(recordId)
  }
  asStore(): RecordStore {
    return this as unknown as RecordStore
  }
  put(recordId: string, schemaId: string, payload: Record<string, unknown>): void {
    this.records.set(recordId, { recordId, schemaId, payload })
  }
}

const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/local.test'
const POLICY_PATH = new URL('../../../../config/lab-sync/evidence.yaml', import.meta.url)

const NOW = new Date('2026-09-26T18:00:00-04:00')

const SAMPLE_ID = 'TYF-SAMPLE-4821'
const BARCODE = 'TYF-9F7A21'
const OTHER_BARCODE = 'TYF-999XYZ'

let policy: EvidencePolicy
let artifactDir: string

beforeAll(() => {
  policy = loadEvidencePolicy(POLICY_PATH.pathname)
  artifactDir = mkdtempSync(join(tmpdir(), 'evidence-test-'))
})

afterAll(() => {
  rmSync(artifactDir, { recursive: true, force: true })
})

function seedSample(store: FakeStore): void {
  store.put('SMP-2026-01231', SCHEMA_ID, {
    kind: 'sample',
    recordId: 'SMP-2026-01231',
    requestRef: { kind: 'record', id: 'ORD-2026-0001', type: 'order' },
    status: 'accessioned',
    identifiers: [
      { system: 'tyf-sample-id', value: SAMPLE_ID },
      { system: 'tyf-barcode', value: BARCODE },
    ],
  })
}

function seedReport(
  store: FakeStore,
  overrides: Record<string, unknown> = {},
): void {
  store.put('RPT-2026-00331', SCHEMA_ID, {
    kind: 'report',
    recordId: 'RPT-2026-00331',
    requestRef: { kind: 'record', id: 'ORD-2026-0001', type: 'order' },
    sampleRefs: [{ kind: 'record', id: 'SMP-2026-01231', type: 'sample' }],
    runRefs: [{ kind: 'record', id: 'RUN-2026-0007', type: 'run' }],
    status: 'released',
    revision: 1,
    releasedAt: '2026-09-25T12:00:00-04:00',
    ...overrides,
  })
}

function seedRun(store: FakeStore): void {
  store.put('RUN-2026-0007', SCHEMA_ID, {
    kind: 'run',
    recordId: 'RUN-2026-0007',
    requesterRef: { kind: 'record', id: 'PRT-OTHER', type: 'party' },
    sampleRefs: [{ kind: 'record', id: 'SMP-2026-01231', type: 'sample' }],
    status: 'completed',
    results: { fatty_acids: 'ok' },
  })
}

function seedOrderAndCustomers(store: FakeStore): void {
  store.put('ORD-2026-0001', SCHEMA_ID, {
    kind: 'order',
    recordId: 'ORD-2026-0001',
    customerRef: { kind: 'record', id: 'CUST-SELF', type: 'customer' },
    total_amount: 250.0,
  })
  store.put('CUST-SELF', SCHEMA_ID, {
    kind: 'customer',
    recordId: 'CUST-SELF',
    email: 'jane@example.com',
  })
  store.put('CUST-OTHER', SCHEMA_ID, {
    kind: 'customer',
    recordId: 'CUST-OTHER',
    email: 'mallory@example.com',
    secret_note: 'SECRET-TOKEN-9182',
  })
}

function seedMirror(
  store: FakeStore,
  eventId: string,
  eventType: string,
  body: Record<string, unknown>,
  affectedRecordIds?: string[],
): void {
  const mirrorPayload: Record<string, unknown> = {
    kind: 'lab-sync-event',
    recordId: `LSYN-${eventId}`,
    eventId,
    direction: 'inbound',
    eventType,
    ...body,
  }
  if (affectedRecordIds !== undefined) {
    mirrorPayload.processing = { status: 'applied', affectedRecordIds }
  }
  store.put(`LSYN-${eventId}`, SCHEMA_ID, mirrorPayload)
}

function writeArtifact(name: string, contents: string): string {
  const path = join(artifactDir, name)
  writeFileSync(path, contents)
  return path
}

function completeEvidenceFiles(): Array<Record<string, unknown>> {
  return ['graph', 'trace', 'script', 'inputs', 'zip'].map((kind) => ({
    id: `ART-${kind.toUpperCase()}`,
    kind,
    name: `result.${kind === 'zip' ? 'zip' : kind}`,
    path: writeArtifact(`${kind}.bin`, `${kind}-contents`),
  }))
}

function makeBuilder(store: FakeStore, gitShas?: Record<string, string[]>): EvidenceBuilder {
  return new EvidenceBuilder({
    store: store.asStore(),
    policy,
    gitLog: async (recordId: string) => gitShas?.[recordId] ?? [`sha-of-${recordId}`],
    now: () => NOW,
  })
}

function seedHappyStore(): FakeStore {
  const store = new FakeStore()
  seedSample(store)
  seedOrderAndCustomers(store)
  seedRun(store)
  seedReport(store, { evidenceFiles: completeEvidenceFiles() })
  seedMirror(store, 'evt_TYF_000001', 'order.created', { occurredAt: '2026-09-20T10:00:00-04:00', payload: { barcode: BARCODE } }, ['SMP-2026-01231'])
  seedMirror(store, 'evt_TYF_000002', 'sample.shipped', { payload: { sample_id: SAMPLE_ID } }, [])
  seedMirror(store, 'evt_TYF_000003', 'sample.shipped', { payload: { barcode: OTHER_BARCODE } }, ['SMP-OTHER'])
  return store
}

describe('loadEvidencePolicy', () => {
  it('parses config/lab-sync/evidence.yaml into the declarative policy shape', () => {
    expect(policy.version).toBe(1)
    expect(policy.shared_kinds).toEqual(['run', 'analysis-run'])
    expect(policy.redact_paths).toEqual(['customerRef', 'requesterRef', 'partyRef', 'sampleRefs'])
    expect(policy.drop_kinds).toEqual(['order', 'customer', 'request', 'sample-registration'])
  })
})

describe('applyRedaction', () => {
  it('strips listed top-level paths from a deep copy without mutating the source', () => {
    const source: Record<string, unknown> = {
      kind: 'run',
      requesterRef: { id: 'PRT-1' },
      sampleRefs: ['SMP-1'],
      customerRef: 'CUST-1',
      results: { deep: { partyRef: 'nested' } },
    }
    const out = applyRedaction(source, ['customerRef', 'requesterRef', 'sampleRefs'])
    expect(out).not.toHaveProperty('customerRef')
    expect(out).not.toHaveProperty('requesterRef')
    expect(out).not.toHaveProperty('sampleRefs')
    expect(out).toHaveProperty('results')
    // source untouched (deep copy semantics)
    expect(source).toHaveProperty('requesterRef')
  })
})

describe('EvidenceBuilder.build — sample identifiers', () => {
  it('throws naming tyf-sample-id when the identifier is missing', async () => {
    const store = new FakeStore()
    store.put('SMP-1', SCHEMA_ID, {
      kind: 'sample',
      recordId: 'SMP-1',
      status: 'registered',
      identifiers: [{ system: 'tyf-barcode', value: BARCODE }],
    })
    await expect(makeBuilder(store).build('SMP-1', 'RPT-1', 1)).rejects.toThrow(/tyf-sample-id/)
  })

  it('throws naming tyf-barcode when the identifier is missing', async () => {
    const store = new FakeStore()
    store.put('SMP-1', SCHEMA_ID, {
      kind: 'sample',
      recordId: 'SMP-1',
      status: 'registered',
      identifiers: [{ system: 'tyf-sample-id', value: SAMPLE_ID }],
    })
    await expect(makeBuilder(store).build('SMP-1', 'RPT-1', 1)).rejects.toThrow(/tyf-barcode/)
  })
})

describe('EvidenceBuilder.build — events', () => {
  it('includes only mirrors naming this sample, maps fields, excludes other barcodes', async () => {
    const store = seedHappyStore()
    const bundle = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    const ids = bundle.document.events.map((e) => e.id)
    expect(ids).toEqual(['evt_TYF_000001', 'evt_TYF_000002'])
    expect(bundle.document.events[0]).toMatchObject({
      type: 'order.created',
      occurred_at: '2026-09-20T10:00:00-04:00',
      sample_id: SAMPLE_ID,
      record_ids: ['SMP-2026-01231'],
    })
    // evt_TYF_000002 has no occurredAt -> falls back to now()
    expect(bundle.document.events[1]?.occurred_at).toBe(NOW.toISOString())
    // The other sample's barcode appears nowhere in the serialized document.
    expect(JSON.stringify(bundle.document)).not.toContain(OTHER_BARCODE)
  })
})

describe('EvidenceBuilder.build — record include scope & redaction', () => {
  it('includes sample + report + redacted run; drops order/customer; no foreign identity', async () => {
    const store = seedHappyStore()
    const bundle = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    const serialized = JSON.stringify(bundle.document)

    const records = bundle.document.records
    expect(records.map((r) => r.id)).toEqual(['RPT-2026-00331', 'RUN-2026-0007', 'SMP-2026-01231'])
    const run = records.find((r) => r.id === 'RUN-2026-0007')
    expect(run).toBeDefined()
    // Redacted copy: neither requesterRef nor sampleRefs present; scientific payload kept.
    expect(run!.data).not.toHaveProperty('requesterRef')
    expect(run!.data).not.toHaveProperty('sampleRefs')
    expect(run!.data).toHaveProperty('results')
    // The stored run record itself is untouched (redaction on a copy).
    const storedRun = await store.get('RUN-2026-0007')
    expect(storedRun!.payload).toHaveProperty('requesterRef')

    // Drop-kind records referenced by the report are absent, by recordId AND identity.
    expect(serialized).not.toContain('ORD-2026-0001')
    expect(serialized).not.toContain('mallory@example.com')
    expect(serialized).not.toContain('CUST-OTHER')
  })

  it('never includes a drop-kind record even when referenced via runRefs', async () => {
    const store = seedHappyStore()
    store.put('RUN-2026-0009', SCHEMA_ID, { kind: 'sample-registration', recordId: 'RUN-2026-0009', requesterRef: 'X' })
    seedReport(store, {
      evidenceFiles: completeEvidenceFiles(),
      runRefs: [
        { kind: 'record', id: 'RUN-2026-0007', type: 'run' },
        { kind: 'record', id: 'RUN-2026-0009', type: 'sample-registration' },
      ],
    })
    const bundle = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    expect(JSON.stringify(bundle.document)).not.toContain('RUN-2026-0009')
  })
})

describe('EvidenceBuilder.build — source_revisions', () => {
  it('maps each gitLog sha to one {record_id, commit} entry per included record', async () => {
    const store = seedHappyStore()
    const gitShas = {
      'SMP-2026-01231': ['aaa1', 'aaa2'],
      'RPT-2026-00331': ['bbb1'],
      'RUN-2026-0007': ['ccc1', 'ccc2', 'ccc3'],
    }
    const bundle = await makeBuilder(store, gitShas).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    expect(bundle.document.source_revisions).toEqual([
      { record_id: 'RPT-2026-00331', commit: 'bbb1' },
      { record_id: 'RUN-2026-0007', commit: 'ccc1' },
      { record_id: 'RUN-2026-0007', commit: 'ccc2' },
      { record_id: 'RUN-2026-0007', commit: 'ccc3' },
      { record_id: 'SMP-2026-01231', commit: 'aaa1' },
      { record_id: 'SMP-2026-01231', commit: 'aaa2' },
    ])
  })
})

describe('EvidenceBuilder.build — artifacts', () => {
  it('complete kind set passes; manifest carries sha256 + size and files carry bytes', async () => {
    const store = seedHappyStore()
    const bundle = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    expect(bundle.document.artifacts.map((a) => a.kind)).toEqual(
      ['graph', 'inputs', 'script', 'trace', 'zip'],
    )
    const graph = bundle.document.artifacts.find((a) => a.kind === 'graph')!
    expect(graph.sha256).toBe(createHash('sha256').update('graph-contents').digest('hex'))
    expect(graph.size).toBe(Buffer.byteLength('graph-contents'))
    const file = bundle.files.find((f) => f.id === graph.id)!
    expect(file.bytes.equals(Buffer.from('graph-contents'))).toBe(true)
  })

  it('missing a required kind throws naming exactly the missing kind', async () => {
    const store = new FakeStore()
    seedSample(store)
    seedRun(store)
    const files = completeEvidenceFiles().filter((f) => f.kind !== 'trace')
    seedReport(store, { evidenceFiles: files })
    await expect(
      makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1),
    ).rejects.toThrow(/trace/)
  })

  it('missing evidenceFiles field throws listing all required kinds', async () => {
    const store = new FakeStore()
    seedSample(store)
    seedReport(store)
    const promise = makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    await expect(promise).rejects.toThrow(/graph.*|trace.*|script.*|inputs.*|zip.*/s)
    await expect(
      makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1),
    ).rejects.toThrow(/missing.*kind|kind.*missing/i)
  })
})

describe('EvidenceBuilder.build — determinism & secret containment', () => {
  it('two builds with the same inputs serialize identically', async () => {
    const store = seedHappyStore()
    const a = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    const b = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    expect(JSON.stringify(a.document)).toBe(JSON.stringify(b.document))
    expect(a.files.map((f) => f.id)).toEqual(b.files.map((f) => f.id))
  })

  it('secret material in an out-of-scope record never reaches the document', async () => {
    const store = seedHappyStore()
    // CUST-OTHER carries secret_note SECRET-TOKEN-9182 (seeded in seedOrderAndCustomers)
    // and ORD-2026-0001 is a drop-kind referenced by the report.requestRef.
    const bundle = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    expect(JSON.stringify(bundle.document)).not.toContain('SECRET-TOKEN-9182')
  })

  it('document carries the pinned tyf.evidence/1 envelope fields', async () => {
    const store = seedHappyStore()
    const bundle = await makeBuilder(store).build('SMP-2026-01231', 'RPT-2026-00331', 1)
    expect(bundle.document.schema_version).toBe('tyf.evidence/1')
    expect(bundle.document.viewer_version).toBe(1)
    expect(bundle.document.sample_id).toBe(SAMPLE_ID)
    expect(bundle.document.barcode).toBe(BARCODE)
    expect(readFileSync(join(artifactDir, 'graph.bin'), 'utf8')).toBe('graph-contents')
  })
})
