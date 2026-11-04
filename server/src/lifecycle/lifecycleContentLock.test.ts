// L1-RECORD-LOCK-GUARD-1 LEG 1 — AM-9 (d)(e)(f) pins: the declared content-lock
// policy is lifecycle DATA; these pins prove (d) each of the four edited YAMLs
// validates against lifecycle.meta.schema.yaml via the real Ajv validator
// (LifecycleLoader.ts:13-39 does NOT validate — a typo'd state id or field
// would otherwise fail SILENTLY), (e) engine.contentLockedStates(id) returns
// EXACTLY the AM-1 declared set per id, and (f) a loaded lifecycle that
// declares no contentLocked state returns an EMPTY set (distinguishable from
// undefined = not loaded).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { createValidator } from '../validation/AjvValidator.js'
import { LifecycleEngine } from './LifecycleEngine.js'
import { loadLifecyclesFromDir } from './LifecycleLoader.js'

const here = dirname(fileURLToPath(import.meta.url))
// Worktree-root schema dir (same '../../../schema' depth convention as
// governance/registryOpsLifecycle.test.ts and LifecycleHandlers.test.ts).
// NOTE: server/schema is a symlink to the TRUNK worktree — '../../../schema'
// (three levels up from src/lifecycle) is required to reach this worktree's
// own schema/, where the contentLocked declarations live.
const SCHEMA_DIR = join(here, '../../../schema')
const LIFECYCLES_DIR = join(SCHEMA_DIR, 'core/lifecycles')

// AM-1 declared sets — the single source of truth is the YAML; this array is
// the pin's expected value, checked against the YAML both through Ajv (d) and
// through the engine (e).
const DECLARED_LOCKED: Record<string, string[]> = {
  'document-control': ['approved', 'effective', 'superseded', 'archived'],
  'document-controlled-signing': ['approved', 'effective', 'superseded', 'archived'],
  'lab-sample': ['archived'],
  'registry-ops': ['archived'],
}

// The three untouched lifecycles must resolve to EMPTY sets (loaded, declared
// but empty) — never undefined, never a hardcoded fallback.
const UNTOUCHED_LOADED = ['lab-vocabulary-control', 'service-request', 'tyf-order']

describe('L1-RECORD-LOCK-GUARD-1 AM-9 content-lock declaration pins', () => {
  it('(d) each of the four edited lifecycle YAMLs validates against lifecycle.meta.schema.yaml via a fresh Ajv validator', () => {
    const meta = parse(
      readFileSync(join(SCHEMA_DIR, 'core/lifecycle.meta.schema.yaml'), 'utf-8'),
    )
    for (const id of Object.keys(DECLARED_LOCKED)) {
      const lifecycle = parse(
        readFileSync(join(LIFECYCLES_DIR, `${id}.lifecycle.yaml`), 'utf-8'),
      )
      // Fresh validator per file (same pattern as
      // registryOpsLifecycle.test.ts:666-676: the meta-schema is already
      // registered in shared pipeline validators under its $id, so a shared
      // instance would collide).
      const metaValidator = createValidator()
      const result = metaValidator.validateWithSchema(lifecycle, meta)
      expect(result.errors.map((e) => `${e.path} ${e.message}`), `${id} meta-schema errors`).toEqual([])
      expect(result.valid, `${id} must validate`).toBe(true)
      // D5 (fix cycle 1): Ajv alone CANNOT catch a typo'd contentLocked key —
      // the field is optional in the meta-schema, so a misspelled name
      // (e.g. contentLcked) parses as "absent" and passes silently. Assert the
      // PARSED structure directly: at least one state carries contentLocked:
      // true, i.e. the exact key is present and true in the YAML that is the
      // AM-1 declared set's single source of truth.
      const states = (lifecycle as { states?: Array<Record<string, unknown>> }).states
      expect(states, `${id} must declare states`).toBeInstanceOf(Array)
      expect(
        (states ?? []).some((s) => s.contentLocked === true),
        `${id} must declare at least one contentLocked: true state`,
      ).toBe(true)
    }
    // D5 (fix cycle 1): the field must be ABSENT where not declared. The three
    // untouched lifecycles declare no contentLocked state, so NO state may
    // carry the field — a stray contentLocked: true here would silently make
    // the engine lock them (AM-9d presence + absence both pinned).
    for (const id of UNTOUCHED_LOADED) {
      const lifecycle = parse(
        readFileSync(join(LIFECYCLES_DIR, `${id}.lifecycle.yaml`), 'utf-8'),
      )
      const states = (lifecycle as { states?: Array<Record<string, unknown>> }).states ?? []
      expect(
        states.some((s) => 'contentLocked' in s),
        `${id} must declare NO contentLocked state (field absent where not declared)`,
      ).toBe(false)
    }
  })

  it('(e) engine.contentLockedStates(id) equals EXACTLY the declared set per id (real YAMLs, real loader)', () => {
    const engine = new LifecycleEngine()
    const loaded = loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
    expect(loaded).toBeGreaterThanOrEqual(7)
    for (const [id, expected] of Object.entries(DECLARED_LOCKED)) {
      const actual = engine.contentLockedStates(id)
      expect(actual, `${id} must be loaded`).toBeInstanceOf(Set)
      expect([...actual!].sort(), `${id} exact locked set`).toEqual([...expected].sort())
    }
  })

  it('(f) contentLockedStates of a loaded lifecycle with no contentLocked state is an EMPTY set, not undefined; not-loaded stays undefined', () => {
    const engine = new LifecycleEngine()
    loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
    for (const id of UNTOUCHED_LOADED) {
      const actual = engine.contentLockedStates(id)
      // "declared but empty" is a Set of size 0 — distinguishable from
      // "not loaded" (undefined) at every consumer (AM-9f / AM-10c / bait 14).
      expect(actual, `${id} must be loaded`).toBeInstanceOf(Set)
      expect(actual!.size, `${id} must be empty`).toBe(0)
    }
    expect(engine.contentLockedStates('no-such-lifecycle')).toBeUndefined()
  })
})
