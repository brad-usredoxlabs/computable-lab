/**
 * QMS7-3 — KindLifecycleRegistry loader unit tests.
 *
 * Proves the load-time validation discipline (PredicateRegistry's throw
 * pattern): unknown lifecycleId, bad defaultState, unknown kind, duplicate
 * kind — each fails the load. Plus the happy path over the REAL coverage
 * file and the data-derived collectKnownKinds helper.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import {
  loadKindLifecycleRegistry,
  collectKnownKinds,
  type KindLifecycleRegistryDeps,
} from './KindLifecycleRegistry.js'
import type { LifecycleSpec } from '../lifecycle/types.js'
import type { SchemaEntry } from '../schema/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const LIFECYCLES_DIR = join(here, '../../../schema/core/lifecycles')
const COVERAGE_FILE = join(here, '../../../schema/registry/registry-kinds.registry.yaml')
const TMP_DIR = join(here, '../../tmp/qms73-registry-fixtures')

function realEngine(): LifecycleEngine {
  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
  expect(engine.isLoaded('registry-ops')).toBe(true)
  return engine
}

function fixture(name: string, content: string): string {
  mkdirSync(TMP_DIR, { recursive: true })
  const path = join(TMP_DIR, name)
  writeFileSync(path, content, 'utf-8')
  return path
}

const KINDS = ['person', 'equipment', 'equipment-class', 'training-record', 'competency-authorization', 'instrument', 'calibration-record']

function deps(engine = realEngine(), knownKinds: Set<string> = new Set(KINDS)): KindLifecycleRegistryDeps {
  return { lifecycle: engine, knownKinds }
}

describe('KindLifecycleRegistry (QMS7-3 loader)', () => {
  it('loads the REAL coverage file: exactly the 7 approved kinds, registry-ops/draft', () => {
    const registry = loadKindLifecycleRegistry(COVERAGE_FILE, deps())
    expect(registry.size).toBe(7)
    expect([...registry.kinds()].sort()).toEqual([...KINDS].sort())
    expect(registry.lifecycle).toBe('registry-ops')
    const entry = registry.entryFor('equipment-class')
    expect(entry).toEqual({ kind: 'equipment-class', lifecycleId: 'registry-ops', defaultState: 'draft' })
    // Undeclared kinds get nothing.
    expect(registry.entryFor('training-material')).toBeUndefined()
    expect(registry.entryFor('protocol')).toBeUndefined()
  })

  it('throws when the lifecycleId is not loaded', () => {
    const path = fixture('unknown-lifecycle.yaml', [
      'registryVersion: 1',
      'lifecycleId: not-on-disk-lifecycle',
      'defaultState: draft',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps())).toThrow(/not loaded/)
  })

  it('throws when defaultState is not a declared state of the lifecycle', () => {
    const path = fixture('bad-default-state.yaml', [
      'registryVersion: 1',
      'lifecycleId: registry-ops',
      'defaultState: published',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps())).toThrow(/defaultState/)
  })

  it('throws when defaultState is a declared state but NOT the initial state', () => {
    const path = fixture('non-initial-state.yaml', [
      'registryVersion: 1',
      'lifecycleId: registry-ops',
      'defaultState: active',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps())).toThrow(/initial state/)
  })

  it('throws on an unknown kind', () => {
    const path = fixture('unknown-kind.yaml', [
      'registryVersion: 1',
      'lifecycleId: registry-ops',
      'defaultState: draft',
      'kinds:',
      '  - kind: not-a-real-kind',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps())).toThrow(/Unknown kind/)
  })

  it('throws on a duplicate kind entry', () => {
    const path = fixture('duplicate-kind.yaml', [
      'registryVersion: 1',
      'lifecycleId: registry-ops',
      'defaultState: draft',
      'kinds:',
      '  - kind: person',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps())).toThrow(/Duplicate kind/)
  })

  it('throws on a malformed file (no lifecycleId / no kinds)', () => {
    const path = fixture('malformed.yaml', 'registryVersion: 1\n')
    expect(() => loadKindLifecycleRegistry(path, deps())).toThrow(/Invalid registry-kind coverage/)
  })

  it('collectKnownKinds derives kind names from schema properties.kind consts (data, not TS)', () => {
    const entries = [
      { id: 'a', path: 'a', schema: { properties: { kind: { const: 'person' } } }, dependencies: [] },
      { id: 'b', path: 'b', schema: { properties: { kind: { enum: ['x'] } } }, dependencies: [] },
      { id: 'c', path: 'c', schema: { properties: {} }, dependencies: [] },
    ] as SchemaEntry[]
    expect([...collectKnownKinds(entries)]).toEqual(['person'])
  })

  it('constructor rejects a spec whose states lack the defaultState even when isLoaded is true (synthetic lifecycle)', () => {
    const engine = new LifecycleEngine()
    const synthetic: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'synthetic-ops',
      states: [{ id: 'open' }, { id: 'closed' }],
      transitions: [{ from: 'open', to: 'closed', role: 'author' }],
    }
    engine.loadLifecycle(synthetic)
    const path = fixture('synthetic-bad-default.yaml', [
      'registryVersion: 1',
      'lifecycleId: synthetic-ops',
      'defaultState: draft',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps(engine))).toThrow(/defaultState/)
  })

  // QMS7-3 FIX 1 / DEFECT 1 (adversarial review): the initial-state arm must not be
  // conditional on an initial state existing. A coverage-target lifecycle with NO
  // declared `initial: true` state is malformed data — the load must fail, not
  // silently stamp records with a defaultState nothing declares as initial.
  it('FIX1: throws when the coverage lifecycle declares NO initial state at all (defaultState is a declared non-initial state)', () => {
    const engine = new LifecycleEngine()
    const synthetic: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'synthetic-no-initial',
      states: [{ id: 'open' }, { id: 'closed' }],
      transitions: [{ from: 'open', to: 'closed', role: 'author' }],
    }
    engine.loadLifecycle(synthetic)
    const path = fixture('synthetic-no-initial.yaml', [
      'registryVersion: 1',
      'lifecycleId: synthetic-no-initial',
      'defaultState: closed',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps(engine))).toThrow(/initial state/)
  })

  // DEFECT 1 second arm: defaultState is a declared state of a lifecycle that DOES
  // declare an initial state, but defaultState is a different (non-initial) state.
  it('FIX1: throws when defaultState is a declared non-initial state of a synthetic lifecycle that declares an initial state', () => {
    const engine = new LifecycleEngine()
    const synthetic: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'synthetic-with-initial',
      states: [{ id: 'open', initial: true }, { id: 'closed' }],
      transitions: [{ from: 'open', to: 'closed', role: 'author' }],
    }
    engine.loadLifecycle(synthetic)
    const path = fixture('synthetic-non-initial-default.yaml', [
      'registryVersion: 1',
      'lifecycleId: synthetic-with-initial',
      'defaultState: closed',
      'kinds:',
      '  - kind: person',
      '',
    ].join('\n'))
    expect(() => loadKindLifecycleRegistry(path, deps(engine))).toThrow(/initial state/)
  })

  // QMS7-3 FIX 1 / DEFECT 2: the malformed-file message must name only the fields
  // actually enforced (lifecycleId/kinds). registryVersion is not inspected — the
  // message may not claim a guarantee the loader does not provide.
  it('FIX1: malformed-file message names only the enforced fields (no registryVersion claim)', () => {
    const path = fixture('malformed-msg.yaml', 'registryVersion: 1\n')
    try {
      loadKindLifecycleRegistry(path, deps())
      throw new Error('expected load to throw')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toMatch(/Invalid registry-kind coverage/)
      expect(message).not.toMatch(/registryVersion/)
    }
  })
})
