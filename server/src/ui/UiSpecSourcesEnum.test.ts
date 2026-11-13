// @vitest-environment node
/**
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 (o3uispec-fix2) — pin that the DECLARATIVE
 * ui-v1 schema admits every source the tree ships. The shipped
 * schema/workflow/labware-definition.ui.yaml:43 declares
 * `sources: ["ols", "local-obo"]`, but ui-v1's props.sources.items enum
 * carried only the 4-member vocabulary, so real Ajv 2020-12 marked the
 * shipped spec INVALID (adversarial review D1) and nothing in the tree
 * could see it — the server loader never validates *.ui.yaml against
 * ui-v1. This pin runs REAL Ajv over the REAL ui.yaml so the two files
 * can never drift, and pairs the registry loader enum against the
 * ui-v1 sources enum so future sources stay paired.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import Ajv2020 from 'ajv/dist/2020.js'
import type { AnySchemaObject } from 'ajv'

const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema')
const uiSchema = load(readFileSync(join(SCHEMA_DIR, 'ui', 'ui-v1.schema.yaml'), 'utf-8')) as AnySchemaObject
const uiSpec = load(readFileSync(join(SCHEMA_DIR, 'workflow', 'labware-definition.ui.yaml'), 'utf-8')) as unknown
const registrySchema = load(readFileSync(join(SCHEMA_DIR, 'registry', 'ontology-sources.schema.yaml'), 'utf-8')) as any

// Canonical sources vocabulary the tree ships (adversarial D1 pairing).
const SOURCES_VOCABULARY = ['local', 'ols', 'vendor-search', 'local-records', 'local-obo']
// Registry loader names map onto ui-v1 source members (ols4 -> "ols").
const LOADER_TO_SOURCE: Record<string, string> = { 'local-obo': 'local-obo', ols4: 'ols' }

describe('ui-v1 sources enum — real Ajv over the real ui.yaml (o3uispec-fix2)', () => {
  const validate = new Ajv2020({ strict: false }).compile(uiSchema)
  const sourcesEnum: string[] = (
    uiSchema.definitions?.field?.properties?.props?.properties?.sources
      ?.items as any
  )?.enum

  it('the shipped labware-definition.ui.yaml is valid against ui-v1 (real Ajv)', () => {
    validate(uiSpec)
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull()
  })

  it('the ui-v1 sources enum contains local-obo (adversarial D1)', () => {
    expect(sourcesEnum).toContain('local-obo')
  })

  it('the ui-v1 sources enum agrees in membership with the canonical vocabulary', () => {
    expect([...(sourcesEnum ?? [])].sort()).toEqual([...SOURCES_VOCABULARY].sort())
  })

  it('every registry loader maps onto a ui-v1 sources enum member (registry↔ui pairing)', () => {
    const loaders: string[] = registrySchema.$defs?.source?.properties?.loader?.enum ?? []
    expect(loaders).toContain('local-obo')
    for (const loader of loaders) {
      const source = LOADER_TO_SOURCE[loader]
      expect(source, `registry loader ${loader} must map to a ui-v1 source member`).toBeDefined()
      expect(sourcesEnum, `ui-v1 enum must cover registry loader ${loader} as "${source}"`).toContain(source)
    }
  })
})
