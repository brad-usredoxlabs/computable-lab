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
  it('prints the resolved data dir FIRST and plans only ungoverned covered-kind records', async () => {
    const { engine, coverage } = loadCoverage()
    const store = new WallStore(seedRecords(), [], new Map())
    const lines: string[] = []

    const report = await migrateRecordLifecycles({
      store, coverage, engine, resolvedDir: FAKE_DIR, apply: false, log: (l) => lines.push(l),
    })

    expect(lines[0]).toBe(`Data dir: ${FAKE_DIR}`)
    expect(report.resolvedDir).toBe(FAKE_DIR)
    expect(store.updateCalls.length).toBe(0)

    const plannedIds = report.planned.map(p => p.recordId).sort()
    expect(plannedIds).toEqual(['CAL-APPENDONLY', 'EQC-PLAIN', 'EQP-LOCKED', 'EQP-PLAIN', 'PER-PLAIN'])
    // The status map is DATA: active-status lands active, unmapped/status-less
    // land the declared default — the runner never guesses per-kind (bait #5).
    const byId = new Map(report.planned.map(p => [p.recordId, p]))
    expect(byId.get('EQP-PLAIN')!.toState).toBe('active')
    expect(byId.get('EQC-PLAIN')!.toState).toBe('draft')
    expect(byId.get('PER-PLAIN')!.toState).toBe('draft')
    // Already-governed records skip with a printed line keyed on payload content.
    expect(report.skipped.map(s => s.recordId)).toEqual(['EQP-GOVERNED'])
    expect(lines.some(l => l.includes('SKIP EQP-GOVERNED: already governed (registry-ops/active)'))).toBe(true)
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
    expect(report.applied.map(a => a.recordId).sort()).toEqual(['EQC-PLAIN', 'EQP-PLAIN', 'PER-PLAIN'])
    expect(lines.some(l => l.startsWith('BLOCKED CAL-APPENDONLY:'))).toBe(true)
    expect(lines.some(l => l.startsWith('BLOCKED EQP-LOCKED:'))).toBe(true)

    // Blocked records keep their exact pre-run envelope (never forced).
    const locked = store.records.get('EQP-LOCKED')!.payload as Record<string, unknown>
    expect(locked.lifecycleId).toBeUndefined()
    expect(locked.state).toBeUndefined()
    const cal = store.records.get('CAL-APPENDONLY')!.payload as Record<string, unknown>
    expect(cal.lifecycleId).toBeUndefined()

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
    const payload = store.records.get('EQP-PLAIN')!.payload as Record<string, unknown>
    expect(payload.id).toBe('EQP-PLAIN')
    expect(payload.status).toBe('active')
    expect(payload.createdBy).toBe('USR-MIGRATOR')
    expect(payload.lifecycleId).toBe('registry-ops')
    expect(payload.state).toBe('active')
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

describe('migrateRecordLifecycles CLI posture (bait #4)', () => {
  it('CONFIG_PATH is required: the CLI refuses to run against a dir it did not name', () => {
    expect(() => requireConfigPath({})).toThrow(/CONFIG_PATH/)
    expect(() => requireConfigPath({ CONFIG_PATH: '' })).toThrow(/CONFIG_PATH/)
    expect(requireConfigPath({ CONFIG_PATH: '/home/brad/.hermes/cl/lanes/1/lane1-config.yaml' }))
      .toBe('/home/brad/.hermes/cl/lanes/1/lane1-config.yaml')
  })
})
