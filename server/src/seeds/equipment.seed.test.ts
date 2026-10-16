/**
 * QMS7-4 V3 — the covered-kind seed corpus is schema-valid AND lifecycle-stamped.
 *
 * RED-first suite (spec 2026-10-16_QMS7-4-migration-archive-spec.md, §first
 * targeted check). There was NO equipment/equipment-class seed validation test
 * before this item — that is precisely how the eqc-quantstudio5 `model`
 * defect (AS-ORCH-L1-100) shipped unnoticed. This suite validates every seed
 * under records/seed/equipment/ and records/seed/equipment-class/ against the
 * REAL untouched schema (unevaluatedProperties:false bites for real) and pins
 * the lifecycle stamp: lifecycleId registry-ops + a declared state.
 *
 * The seed corpus is DATA; the schema is the structural authority. This file
 * fences reviewer bait #1: any relaxation of equipment-class.schema.yaml or
 * addition of a `model` property would show up here as a changed wall, and
 * the explicit pins below assert the wall is UNTOUCHED.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as yamlLoad } from 'js-yaml'
import { parse as parseYaml } from 'yaml'
import { loadAllSchemas } from '../schema/SchemaLoader.js'
import { createSchemaRegistry } from '../schema/SchemaRegistry.js'
import { createValidator } from '../validation/AjvValidator.js'
import { loadKindLifecycleRegistry } from '../registry/KindLifecycleRegistry.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import type { LifecycleSpec } from '../lifecycle/types.js'

const here = dirname(fileURLToPath(import.meta.url))
// server/src/seeds/ -> server/src -> server -> repoRoot
const repoRoot = resolve(here, '..', '..', '..')
const SCHEMA_DIR = join(repoRoot, 'schema')
const LIFECYCLES_DIR = join(SCHEMA_DIR, 'core', 'lifecycles')
const COVERAGE_FILE = join(SCHEMA_DIR, 'registry', 'registry-kinds.registry.yaml')
const EQUIPMENT_SEED_DIR = join(repoRoot, 'records', 'seed', 'equipment')
const EQUIPMENT_CLASS_SEED_DIR = join(repoRoot, 'records', 'seed', 'equipment-class')

const yamlFiles = (dir: string): string[] => readdirSync(dir).filter(f => f.endsWith('.yaml')).sort()

let validator: ReturnType<typeof createValidator>
let declaredStates: string[]
let coverageLifecycleId: string

beforeAll(async () => {
  const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true })
  const registry = createSchemaRegistry()
  registry.addSchemas(loaded.entries)
  validator = createValidator()
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id)
    if (entry) validator.addSchema(entry.schema as never, id)
  }

  // The lifecycle pins are read from the DECLARED data (registry-ops YAML +
  // the coverage file), never hardcoded here beyond naming the coverage file.
  const spec = parseYaml(readFileSync(join(LIFECYCLES_DIR, 'registry-ops.lifecycle.yaml'), 'utf-8')) as LifecycleSpec
  declaredStates = spec.states.map(s => s.id)

  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
  const knownKinds = new Set<string>()
  for (const entry of registry.getAll()) {
    const kindConst = (entry.schema as { properties?: { kind?: { const?: unknown } } }).properties?.kind?.const
    if (typeof kindConst === 'string') knownKinds.add(kindConst)
  }
  const coverage = loadKindLifecycleRegistry(COVERAGE_FILE, { lifecycle: engine, knownKinds })
  coverageLifecycleId = coverage.lifecycle
})

describe('covered-kind seed corpus: schema-valid + lifecycle-stamped (QMS7-4 V3)', () => {
  it('the corpus is exactly 25 equipment + 4 equipment-class seed files', () => {
    expect(yamlFiles(EQUIPMENT_SEED_DIR).length).toBe(25)
    expect(yamlFiles(EQUIPMENT_CLASS_SEED_DIR).length).toBe(4)
  })

  it('none of the 29 seeds carries a `model:` key (AS-ORCH-L1-100 stays fixed)', () => {
    for (const dir of [EQUIPMENT_SEED_DIR, EQUIPMENT_CLASS_SEED_DIR]) {
      for (const file of yamlFiles(dir)) {
        const doc = yamlLoad(readFileSync(join(dir, file), 'utf-8')) as Record<string, unknown>
        expect(doc, `${file} carries a forbidden 'model' key`).not.toHaveProperty('model')
      }
    }
  })

  it('eqc-quantstudio5.yaml resolves its model defect via the declared modelFamily property', () => {
    const doc = yamlLoad(readFileSync(join(EQUIPMENT_CLASS_SEED_DIR, 'eqc-quantstudio5.yaml'), 'utf-8')) as Record<string, unknown>
    expect(doc.modelFamily).toBe('QuantStudio 5')
    expect(doc.manufacturer).toBe('Thermo Fisher Scientific')
  })

  it('equipment-class.schema.yaml wall is UNTOUCHED: unevaluatedProperties:false and NO model property (bait #1 fence)', () => {
    const schema = parseYaml(readFileSync(join(SCHEMA_DIR, 'lab', 'equipment-class.schema.yaml'), 'utf-8')) as {
      unevaluatedProperties?: unknown
      properties?: { model?: unknown; modelFamily?: unknown }
    }
    expect(schema.unevaluatedProperties).toBe(false)
    expect(schema.properties?.model).toBeUndefined()
    expect(schema.properties?.modelFamily).toBeDefined()
  })

  for (const [dir, label] of [[EQUIPMENT_SEED_DIR, 'equipment'], [EQUIPMENT_CLASS_SEED_DIR, 'equipment-class']] as const) {
    for (const file of yamlFiles(dir)) {
      it(`${label}/${file} validates against its declared $schema and carries the declared lifecycle stamp`, () => {
        const doc = yamlLoad(readFileSync(join(dir, file), 'utf-8')) as Record<string, unknown>
        const schemaId = doc.$schema
        expect(typeof schemaId).toBe('string')

        // The store's own parse path (RecordParser.ts) strips $schema from the
        // payload before validation; mirror that so the seed file itself is
        // validated exactly the way the store would validate it.
        const { $schema: _stripped, ...payload } = doc
        const check = validator.validate(payload, String(schemaId))
        expect(
          check.errors.map(e => `${e.path} ${e.keyword} ${e.message} ${e.params?.unevaluatedProperty ?? e.params?.missingProperty ?? ''}`.trim()),
          `${file} is not schema-valid`,
        ).toEqual([])

        expect(doc.lifecycleId, `${file} missing lifecycleId`).toBe(coverageLifecycleId)
        expect(declaredStates, `${file} state ${String(doc.state)} is not a declared state`).toContain(doc.state)
      })
    }
  }
})
