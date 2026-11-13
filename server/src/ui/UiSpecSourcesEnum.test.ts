// @vitest-environment node
/**
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 (o3uispec-fix2) — pin that the DECLARATIVE
 * ui-v1 schema admits every source the tree ships.
 *
 * The shipped spec schema/workflow/labware-definition.ui.yaml:43 declares
 * `sources: ["ols", "local-obo"]`, but ui-v1.schema.yaml's
 * props.sources.items enum still carried only the 4-member vocabulary
 * (local, ols, vendor-search, local-records). Real Ajv 2020-12 therefore
 * marks the shipped spec INVALID — and nothing in the tree could see it,
 * because the server loader hand-rolls its own checks and never validates
 * *.ui.yaml against ui-v1. This pin runs REAL Ajv over the REAL ui.yaml
 * so the two files can never drift again (adversarial review D1).
 *
 * The registry (schema/registry/ontology-sources.schema.yaml) already
 * declares local-obo as a first-class loader; this test keeps the
 * registry↔ui-v1 pairing intact: every registry loader must appear in
 * the ui-v1 sources enum.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import Ajv2020 from 'ajv/dist/2020.js'
import type { AnySchemaObject } from 'ajv'

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
)
const UIV1_PATH = join(SCHEMA_DIR, 'ui', 'ui-v1.schema.yaml')
const LABWARE_UI_PATH = join(SCHEMA_DIR, 'workflow', 'labware-definition.ui.yaml')
const REGISTRY_PATH = join(SCHEMA_DIR, 'registry', 'ontology-sources.schema.yaml')

const uiSchema = load(readFileSync(UIV1_PATH, 'utf-8')) as AnySchemaObject
const uiSpec = load(readFileSync(LABWARE_UI_PATH, 'utf-8')) as unknown
const registrySchema = load(readFileSync(REGISTRY_PATH, 'utf-8')) as any

// The canonical sources vocabulary the tree ships: the historical 4-member
// vocabulary plus local-obo, which the registry and the shipped ui.yaml
// both already treat as first-class.
const SOURCES_VOCABULARY = [
  'local',
  'ols',
  'vendor-search',
  'local-records',
  'local-obo',
]

describe('ui-v1 sources enum — real Ajv over the real ui.yaml (o3uispec-fix2)', () => {
  const ajv = new Ajv2020({ strict: false })
  const validate = ajv.compile(uiSchema)

  const sourcesEnum: string[] = (
    uiSchema.definitions?.field?.properties?.props?.properties?.sources
      ?.items as any
  )?.enum

  it('the shipped labware-definition.ui.yaml is valid against ui-v1 (real Ajv)', () => {
    validate(uiSpec)
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull()
  })

  it('the ui-v1 sources enum contains local-obo (adversarial D1)', () => {
    expect(
      sourcesEnum,
      'ui-v1 props.sources enum must contain "local-obo"',
    ).toContain('local-obo')
  })

  it('the ui-v1 sources enum agrees in membership with the canonical vocabulary', () => {
    expect([...(sourcesEnum ?? [])].sort()).toEqual(
      [...SOURCES_VOCABULARY].sort(),
    )
  })

  it('every registry loader appears in the ui-v1 sources enum (registry↔ui pairing)', () => {
    const loaders: string[] =
      registrySchema.$defs?.source?.properties?.loader?.enum ?? []
    expect(loaders, 'registry must declare its loader enum').toContain(
      'local-obo',
    )
    for (const loader of loaders) {
      expect(sourcesEnum, `ui-v1 enum must cover registry loader ${loader}`).toContain(
        loader,
      )
    }
  })
})
