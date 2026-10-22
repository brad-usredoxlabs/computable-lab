/**
 * QMS7-4 V1/V2 — the lifecycle migration runner (dry-run-by-default,
 * idempotent, refusal-reporting) pinned on MemoryRecordStore.
 *
 * RED-first suite (spec 2026-10-16_QMS7-4-migration-archive-spec.md §2).
 * Built on the OWN-13 applyOwnershipDefaults precedent: the core is a plain
 * function over injected (store, coverage, engine, resolvedDir, apply, log);
 * unit tests inject MemoryRecordStore + a fake dir string and NEVER read
 * config. The worker never runs the runner against a real data dir (bait #4).
 *
 * Pinned properties:
 * - resolved data dir printed FIRST;
 * - coverage-driven: only the covered kinds are listed, zero kind names in TS;
 * - state mapping is DATA (migration block), never a per-kind guess (bait #5);
 * - already-governed records SKIP with a printed line (idempotency key is
 *   payload content, not mtimes);
 * - writes carry expectedSha + viaLifecycleApi + actor and NEVER
 *   skipValidation/skipLint (bait #8: no lifecycle_state_bypass audit spam);
 * - store refusals are REPORTED blocked and the record is left untouched
 *   (bait #2: never forced, never retried with skips);
 * - second run after --apply plans ZERO changes and writes nothing.
 */
import { describe, it, expect } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRecordStore } from '../test-support/MemoryRecordStore.js'
import type { RecordEnvelope, StoreResult, UpdateRecordOptions } from '../store/types.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import { loadKindLifecycleRegistry, type KindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'
import { migrateRecordLifecycles, requireConfigPath } from './migrateRecordLifecycles.js'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = join(here, '../../../schema')
const LIFECYCLES_DIR = join(SCHEMA_DIR, 'core/lifecycles')
const COVERAGE_FILE = join(SCHEMA_DIR, 'registry', 'registry-kinds.registry.yaml')
const FAKE_DIR = '/fake/qms74-migration-data-dir'

const SID = (name: string) => `https://computable-lab.com/schema/computable-lab/${name}`

function envelope(recordId: string, schemaName: string, payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId,
    schemaId: SID(schemaName),
    payload: { recordId, createdBy: 'USR-MIGRATOR', ...payload },
    meta: {
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'USR-MIGRATOR',
      contentSha: `sha-${recordId}`,
    },
  }
}

/**
 * MemoryRecordStore + the store walls the runner must respect: an injected
 * append-only kind (config-injection pattern, mirroring the QMS7-2 R4b
 * harness) and a content-locked refusal. Refusals mirror RecordStoreImpl's
 * error strings; the store itself is NOT edited (bait #9).
 */
class WallStore extends MemoryRecordStore {
  updateCalls: UpdateRecordOptions[] = []
  private readonly appendOnlyKinds: string[]
  private readonly refusals: Map<string, string>

  constructor(
    records: RecordEnvelope[],
    appendOnlyKinds: string[],
    refusals: Map<string, string>,
  ) {
    super(records)
    this.appendOnlyKinds = appendOnlyKinds
    this.refusals = refusals
  }

  override async update(options: UpdateRecordOptions): Promise<StoreResult> {
    this.updateCalls.push(options)
    const payload = options.envelope.payload as Record<string, unknown>
    if (this.appendOnlyKinds.includes(String(payload.kind))) {
      return { success: false, error: 'APPEND_ONLY: immutable records cannot be updated' }
    }
    const refusal = this.refusals.get(options.envelope.recordId)
    if (refusal) return { success: false, error: refusal }
    return super.update(options)
  }
}

function loadCoverage(): { engine: LifecycleEngine; coverage: KindLifecycleRegistry } {
  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
  // knownKinds: the runner's coverage is loaded the way server.ts loads it.
  // For the unit harness the covered-kind set is what the coverage file
  // declares; the loader's knownKinds gate is exercised by the real pipeline
  // in equipment.seed.test.ts, so here a permissive set keeps the focus on
  // the runner.
  const coverage = loadKindLifecycleRegistry(COVERAGE_FILE, {
    lifecycle: engine,
    knownKinds: new Set([
      'person', 'equipment', 'equipment-class', 'training-record',
      'competency-authorization', 'instrument', 'calibration-record',
    ]),
  })
  return { engine, coverage }
}

function seedRecords(): RecordEnvelope[] {
  return [
    // Governed-skipped: already carries the lifecycle (idempotency key).
    envelope('EQP-GOVERNED', 'equipment.schema.yaml', {
      kind: 'equipment', id: 'EQP-GOVERNED', name: 'Governed pump', status: 'active',
      lifecycleId: 'registry-ops', state: 'active',
    }),
    // Planned via the DATA status map: status active -> state active.
    envelope('EQP-PLAIN', 'equipment.schema.yaml', {
      kind: 'equipment', id: 'EQP-PLAIN', name: 'Plain pump', status: 'active',
    }),
    // Planned via the DATA default: no domain status at all.
    envelope('EQC-PLAIN', 'equipment-class.schema.yaml', {
      kind: 'equipment-class', id: 'EQC-PLAIN', name: 'Plain class',
    }),
    // Planned via the DATA default: status not in the map (never guessed).
    envelope('PER-PLAIN', 'person.schema.yaml', {
      kind: 'person', id: 'PER-PLAIN', displayName: 'Plain person', status: 'inactive',
    }),
    // Blocked: append-only via the injected kind list (covered kind).
    envelope('CAL-APPENDONLY', 'calibration-record.schema.yaml', {
      kind: 'calibration-record', id: 'CAL-APPENDONLY', status: 'valid',
    }),
    // Blocked: content-locked store refusal (reported, never forced).
    envelope('EQP-LOCKED', 'equipment.schema.yaml', {
      kind: 'equipment', id: 'EQP-LOCKED', name: 'Locked pump', status: 'active',
    }),
    // Never touched: an uncovered kind must not even be listed.
    envelope('EVT-1', 'audit-event.schema.yaml', {
      kind: 'audit-event', recordId: 'EVT-1', actor: 'USR-MIGRATOR', action: 'record_revised',
      subjectType: 'equipment', subjectId: 'EQP-PLAIN', occurredAt: '2026-01-01T00:00:00.000Z',
    }),
  ]
}

function snapshot(store: MemoryRecordStore): string {
  return JSON.stringify(
    [...store.records.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  )
}

describe('migrateRecordLifecycles: dry-run-by-default, coverage-driven (V1)', () => {
  it('prints the resolved data dir FIRST and plans only covered-kind records the DATA says need a change', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(seedRecords(), [], new Map())
    const lines: string[] = []

    const report = await migrateRecordLifecycles({
      store, coverage, engine, resolvedDir: FAKE_DIR, apply: false, log: (l) => lines.push(l),
    })

    expect(lines[0]).toBe(`Data dir: ${FAKE_DIR}`)
    expect(report.resolvedDir).toBe(FAKE_DIR)
    expect(store.updateCalls.length).toBe(0)

    // QMS8-C (D4): the idempotency key changed. EQP-GOVERNED was a SKIP under
    // the old "any lifecycleId" key; the coverage DATA now declares equipment's
    // domain status retired, so a GOVERNED record still carrying it is a
    // planned strip. The ungoverned records keep planning as before.
    const plannedIds = report.planned.map(p => p.recordId).sort()
    expect(plannedIds).toEqual(['CAL-APPENDONLY', 'EQC-PLAIN', 'EQP-GOVERNED', 'EQP-LOCKED', 'EQP-PLAIN', 'PER-PLAIN'])
    const byId = new Map(report.planned.map(p => [p.recordId, p]))
    expect(byId.get('EQP-GOVERNED')!.basis).toBe('status-strip')
    expect(byId.get('EQP-GOVERNED')!.toState).toBe('active')
    expect(lines.some(l => l.startsWith('STRIP EQP-GOVERNED: domain status retired (state active)'))).toBe(true)
    // The status map is DATA: active-status lands active, unmapped/status-less
    // land the declared default — the runner never guesses per-kind (bait #5).
    expect(byId.get('EQP-PLAIN')!.toState).toBe('active')
    expect(byId.get('EQC-PLAIN')!.toState).toBe('draft')
    expect(byId.get('PER-PLAIN')!.toState).toBe('draft')
    // Nothing skips any more: the one previously-skipped record is now a strip
    // target, which is exactly the set the strip leg exists to process.
    expect(report.skipped).toEqual([])
    // Uncovered kinds are never listed, never touched.
    expect(report.planned.some(p => p.kind === 'audit-event')).toBe(false)
    expect(lines.some(l => l.includes('DRY RUN'))).toBe(true)
  })

  it('apply reports store refusals as blocked WITH reason and leaves those records untouched (bait #2)', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(
      seedRecords(),
      ['calibration-record'],
      new Map([['EQP-LOCKED', 'CONTROLLED_RECORD_LOCKED: create a new draft before editing controlled content']]),
    )
    const lines: string[] = []
    const before = snapshot(store)

    const report = await migrateRecordLifecycles({
      store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: (l) => lines.push(l), actor: 'USR-MIGRATOR',
    })

    expect(report.blocked.map(b => b.recordId).sort()).toEqual(['CAL-APPENDONLY', 'EQP-LOCKED'])
    expect(report.blocked.every(b => typeof b.reason === 'string' && b.reason.length > 0)).toBe(true)
    // EQP-GOVERNED now applies too: its strip is a sanctioned write (QMS8-C D4).
    expect(report.applied.map(a => a.recordId).sort()).toEqual(['EQC-PLAIN', 'EQP-GOVERNED', 'EQP-PLAIN', 'PER-PLAIN'])
    expect(lines.some(l => l.startsWith('BLOCKED CAL-APPENDONLY:'))).toBe(true)
    expect(lines.some(l => l.startsWith('BLOCKED EQP-LOCKED:'))).toBe(true)

    // Blocked records keep their exact pre-run envelope (never forced).
    const locked = store.records.get('EQP-LOCKED')!.payload as Record<string, unknown>
    expect(locked.lifecycleId).toBeUndefined()
    expect(locked.state).toBeUndefined()
    const cal = store.records.get('CAL-APPENDONLY')!.payload as Record<string, unknown>
    expect(cal.lifecycleId).toBeUndefined()
    // A BLOCKED strip keeps its domain status verbatim (bait #2).
    expect(locked.status).toBe('active')

    // The audit-event record was never listed nor rewritten.
    expect(JSON.stringify(store.records.get('EVT-1')!.payload)).toContain('record_revised')
    void before
  })

  it('writes go through the normal envelope path with expectedSha + viaLifecycleApi + actor and NEVER skipValidation/skipLint (bait #8)', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(seedRecords(), [], new Map())
    await migrateRecordLifecycles({
      store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: () => {}, actor: 'USR-MIGRATOR',
    })

    const write = store.updateCalls.find(c => c.envelope.recordId === 'EQP-PLAIN')!
    expect(write).toBeDefined()
    expect(write.expectedSha).toBe('sha-EQP-PLAIN')
    expect(write.viaLifecycleApi).toBe(true)
    expect(write.actor).toBe('USR-MIGRATOR')
    expect(write.message).toBe('Govern EQP-PLAIN under registry-ops (QMS7-4 migration)')
    expect(write.skipValidation).toBeUndefined()
    expect(write.skipLint).toBeUndefined()

    // ids/refs/domain statuses/authorship preserved: only lifecycleId+state added.
    // QMS8-C (D4): for a kind the DATA declares retired, the retired field is
    // omitted on the governed write too (a record must not land carrying a field
    // the item is retiring). A NON-retired kind keeps its status verbatim.
    const payload = store.records.get('EQP-PLAIN')!.payload as Record<string, unknown>
    expect(payload.id).toBe('EQP-PLAIN')
    expect('status' in payload).toBe(false)
    expect(payload.createdBy).toBe('USR-MIGRATOR')
    expect(payload.lifecycleId).toBe('registry-ops')
    expect(payload.state).toBe('active')

    const person = store.records.get('PER-PLAIN')!.payload as Record<string, unknown>
    expect(person.status).toBe('inactive')
    expect(person.state).toBe('draft')
  })
})

describe('migrateRecordLifecycles: idempotent (V2)', () => {
  it('after apply, a re-run dry plans ZERO changes and a second apply writes nothing', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(seedRecords(), [], new Map())

    await migrateRecordLifecycles({ store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: () => {} })
    const afterFirstApply = snapshot(store)

    const rerun = await migrateRecordLifecycles({ store, coverage, engine, resolvedDir: FAKE_DIR, apply: false, log: () => {} })
    expect(rerun.planned).toEqual([])
    expect(rerun.applied).toEqual([])

    const secondApply = await migrateRecordLifecycles({ store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: () => {} })
    expect(secondApply.planned).toEqual([])
    expect(secondApply.applied).toEqual([])
    expect(snapshot(store)).toBe(afterFirstApply)
  })
})

// ===========================================================================
// QMS8-C (D4) — the strip leg. A covered record that is ALREADY governed but
// still carries the retired domain `status` is stripped: the planned write
// DELETES the key (never assigns undefined — bait #1). The leg is DATA-driven:
// only kinds whose coverage entry declares `stripDomainStatus: true` are
// stripped, so kinds whose status is an orthogonal domain vocabulary (person /
// training-record / calibration-record — live admissibility consumers, spec §g
// and stop boundary 2) are left exactly as they are.
// ===========================================================================

describe('migrateRecordLifecycles: strip leg retires domain status (QMS8-C D4)', () => {
  function stripSeedRecords(): RecordEnvelope[] {
    return [
      // Governed AND carries status -> STRIP target.
      envelope('EQP-STRIP-ACTIVE', 'equipment.schema.yaml', {
        kind: 'equipment', id: 'EQP-STRIP-ACTIVE', name: 'Strip me', status: 'active',
        lifecycleId: 'registry-ops', state: 'active',
      }),
      envelope('EQP-STRIP-DRAFT', 'equipment.schema.yaml', {
        kind: 'equipment', id: 'EQP-STRIP-DRAFT', name: 'Strip me too', status: 'active',
        lifecycleId: 'registry-ops', state: 'draft',
      }),
      // Governed AND status-less -> the new idempotency key: SKIP.
      envelope('EQP-CLEAN', 'equipment.schema.yaml', {
        kind: 'equipment', id: 'EQP-CLEAN', name: 'Already clean',
        lifecycleId: 'registry-ops', state: 'active',
      }),
      // Governed, carries status, but carries NO state: stripping status would
      // leave the gate with nothing to read. The runner never synthesizes a
      // state (A1), so this record is reported and left alone.
      envelope('EQP-STATELESS', 'equipment.schema.yaml', {
        kind: 'equipment', id: 'EQP-STATELESS', name: 'No state', status: 'active',
        lifecycleId: 'registry-ops',
      }),
      // Covered but its status is an ORTHOGONAL domain vocabulary the coverage
      // data does NOT declare retired -> untouched (spec §g / stop boundary 2).
      envelope('PER-KEEP', 'person.schema.yaml', {
        kind: 'person', id: 'PER-KEEP', displayName: 'Keep my status', status: 'contractor',
        lifecycleId: 'registry-ops', state: 'active',
      }),
      envelope('TRR-KEEP', 'training-record.schema.yaml', {
        kind: 'training-record', id: 'TRR-KEEP', status: 'completed',
        personRef: { kind: 'record', type: 'person', id: 'PER-KEEP' },
        trainingMaterialRef: { kind: 'record', type: 'training-material', id: 'TRM-1' },
        completedAt: '2026-01-01T00:00:00.000Z',
        lifecycleId: 'registry-ops', state: 'active',
      }),
    ]
  }

  it('plans a status-deleting write for exactly the governed records of kinds the DATA declares retired', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(stripSeedRecords(), [], new Map())
    const lines: string[] = []

    const report = await migrateRecordLifecycles({
      store, coverage, engine, resolvedDir: FAKE_DIR, apply: false, log: (l) => lines.push(l),
    })

    const stripped = report.planned.filter(p => p.basis === 'status-strip').map(p => p.recordId).sort()
    expect(stripped).toEqual(['EQP-STRIP-ACTIVE', 'EQP-STRIP-DRAFT'])
    // The strip carries the record's EXISTING declared state — it never invents
    // one and never synthesizes a state (A1: "never synthesize a state").
    const byId = new Map(report.planned.map(p => [p.recordId, p]))
    expect(byId.get('EQP-STRIP-ACTIVE')!.toState).toBe('active')
    expect(byId.get('EQP-STRIP-DRAFT')!.toState).toBe('draft')
    expect(lines.some(l => l.startsWith('STRIP EQP-STRIP-ACTIVE: domain status retired (state active)'))).toBe(true)
    expect(lines.some(l => l.startsWith('STRIP EQP-STRIP-DRAFT: domain status retired (state draft)'))).toBe(true)
    expect(store.updateCalls.length).toBe(0)

    // Orthogonal-vocabulary kinds are never listed for stripping.
    expect(report.planned.some(p => p.kind === 'person')).toBe(false)
    expect(report.planned.some(p => p.kind === 'training-record')).toBe(false)
    expect(lines.some(l => l.includes('STRIP PER-KEEP'))).toBe(false)
    expect(lines.some(l => l.includes('STRIP TRR-KEEP'))).toBe(false)

    // The already-clean record is skipped under the NEW idempotency key
    // (governed AND status-less), not the old "any lifecycleId" key.
    expect(report.skipped.some(s => s.recordId === 'EQP-CLEAN')).toBe(true)
    expect(lines.some(l => l.startsWith('SKIP EQP-CLEAN:'))).toBe(true)
  })

  it('applies by DELETING the status key on a clone — never assigning undefined, never touching state (bait #1)', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(stripSeedRecords(), [], new Map())
    const lines: string[] = []

    const report = await migrateRecordLifecycles({
      store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: (l) => lines.push(l), actor: 'USR-MIGRATOR',
    })

    expect(report.blocked).toEqual([])
    const payload = store.records.get('EQP-STRIP-DRAFT')!.payload as Record<string, unknown>
    // The key is GONE, not set to undefined: `'status' in payload` is the proof.
    expect('status' in payload).toBe(false)
    expect(payload.status).toBeUndefined()
    expect(payload.state).toBe('draft')
    expect(payload.lifecycleId).toBe('registry-ops')
    expect(payload.name).toBe('Strip me too')
    expect(payload.id).toBe('EQP-STRIP-DRAFT')

    // The write carries the sanctioned markers and no skip flags.
    const write = store.updateCalls.find(c => c.envelope.recordId === 'EQP-STRIP-DRAFT')!
    expect(write.viaLifecycleApi).toBe(true)
    expect(write.actor).toBe('USR-MIGRATOR')
    expect(write.expectedSha).toBe('sha-EQP-STRIP-DRAFT')
    expect(write.skipValidation).toBeUndefined()
    expect(write.skipLint).toBeUndefined()

    // Untouched kinds keep their status verbatim.
    expect((store.records.get('PER-KEEP')!.payload as Record<string, unknown>).status).toBe('contractor')
    expect((store.records.get('TRR-KEEP')!.payload as Record<string, unknown>).status).toBe('completed')
  })

  it('the strip leg is idempotent: after apply, a re-run plans ZERO strips and a second apply writes nothing', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(stripSeedRecords(), [], new Map())

    await migrateRecordLifecycles({ store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: () => {} })
    const afterFirstApply = snapshot(store)

    const rerun = await migrateRecordLifecycles({ store, coverage, engine, resolvedDir: FAKE_DIR, apply: false, log: () => {} })
    expect(rerun.planned.filter(p => p.basis === 'status-strip')).toEqual([])

    const secondApply = await migrateRecordLifecycles({ store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: () => {} })
    expect(secondApply.planned.filter(p => p.basis === 'status-strip')).toEqual([])
    expect(secondApply.applied.filter(p => p.basis === 'status-strip')).toEqual([])
    expect(snapshot(store)).toBe(afterFirstApply)
  })

  it('a strip the store REFUSES is reported blocked and the record keeps its status (bait #2, never forced)', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(
      stripSeedRecords(),
      [],
      new Map([['EQP-STRIP-ACTIVE', 'CONTROLLED_RECORD_LOCKED: create a new draft before editing controlled content']]),
    )

    const report = await migrateRecordLifecycles({
      store, coverage, engine, resolvedDir: FAKE_DIR, apply: true, log: () => {}, actor: 'USR-MIGRATOR',
    })

    expect(report.blocked.map(b => b.recordId)).toEqual(['EQP-STRIP-ACTIVE'])
    expect(report.blocked[0]!.reason).toContain('CONTROLLED_RECORD_LOCKED')
    const kept = store.records.get('EQP-STRIP-ACTIVE')!.payload as Record<string, unknown>
    expect(kept.status).toBe('active')
    // The other target still strips — a refusal never aborts the leg.
    expect('status' in (store.records.get('EQP-STRIP-DRAFT')!.payload as Record<string, unknown>)).toBe(false)
  })
})

describe('migrateRecordLifecycles CLI posture (bait #4)', () => {
  it('CONFIG_PATH is required: the CLI refuses to run against a dir it did not name', () => {
    expect(() => requireConfigPath({})).toThrow(/CONFIG_PATH/)
    expect(() => requireConfigPath({ CONFIG_PATH: '' })).toThrow(/CONFIG_PATH/)
    expect(requireConfigPath({ CONFIG_PATH: '/home/brad/.hermes/cl/lanes/1/lane1-config.yaml' }))
      .toBe('/home/brad/.hermes/cl/lanes/1/lane1-config.yaml')
  })
})
