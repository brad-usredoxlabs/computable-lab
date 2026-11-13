// @vitest-environment node
/**
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 (o3uispec) — server pin for the
 * labware-definition UI spec, against the REAL file and the REAL
 * UISpecLoader (same shape as
 * server/src/validation/TrainingRecordDateTimeAcceptance.test.ts).
 *
 * LEG 2 of the ONTOLOGY browser gate (bundle1-20261112T1523) saw
 * UI_SPEC_NOT_FOUND for
 * https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml
 * because schema/workflow/ has no *.ui.yaml sibling for that schema —
 * UISpecLoader has nothing to cache for the registry id and UIHandlers
 * answers 404, so /record/new/labware-definition and the record editor
 * fall back to the minimal form.
 *
 * The schema half is delivered and MUST NOT change: ontology_ref is
 * optional at schema/workflow/labware-definition.schema.yaml:43. This pin
 * proves the UI half: the sibling spec loads, carries the EXACT registry
 * schemaId (a variant string leaves UI_SPEC_NOT_FOUND in place even when
 * the loader succeeds), and declares exactly one $.ontology_ref field
 * with the ontology-ref commit contract (widget ref + refKind ontology +
 * valueShape ontology-ref + ontologyBinding allow-ontology) whose
 * sources declare BOTH 'ols' and 'local-obo' — the local-obo source is
 * the opt-in that lets the ref combobox keep the resolve spine's
 * in-house tier-2 candidates (provider name, not a vocabulary term).
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUISpecLoader } from './UISpecLoader.js'

const SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml'

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
)
const UI_PATH = join(SCHEMA_DIR, 'workflow', 'labware-definition.ui.yaml')

describe('labware-definition ui spec — ontology anchor field (LEG 2)', () => {
  it('loads the real sibling spec through the real UISpecLoader with the exact registry schemaId', async () => {
    const content = await readFile(UI_PATH, 'utf-8')
    const result = createUISpecLoader().load(content, UI_PATH)
    expect(result.success).toBe(true)
    expect(result.spec?.schemaId).toBe(SCHEMA_ID)
  })

  it('declares exactly one $.ontology_ref field in a form section', async () => {
    const content = await readFile(UI_PATH, 'utf-8')
    const result = createUISpecLoader().load(content, UI_PATH)
    const fields = result.spec?.form?.sections.flatMap((s) => s.fields) ?? []
    expect(fields.filter((f) => f.path === '$.ontology_ref')).toHaveLength(1)
  })

  it('the $.ontology_ref field is the ref widget with refKind ontology', async () => {
    const content = await readFile(UI_PATH, 'utf-8')
    const result = createUISpecLoader().load(content, UI_PATH)
    const field =
      result.spec?.form?.sections.flatMap((s) => s.fields).find(
        (f) => f.path === '$.ontology_ref',
      )
    expect(field?.widget).toBe('ref')
    expect(field?.refKind).toBe('ontology')
  })

  it('commits the ontology-ref shape and declares BOTH ols and local-obo sources', async () => {
    const content = await readFile(UI_PATH, 'utf-8')
    const result = createUISpecLoader().load(content, UI_PATH)
    const props = result.spec?.form?.sections
      .flatMap((s) => s.fields)
      .find((f) => f.path === '$.ontology_ref')
      ?.props ?? {}
    expect(props.valueShape).toBe('ontology-ref')
    expect(props.ontologyBinding).toBe('allow-ontology')
    const sources = Array.isArray(props.sources) ? props.sources : []
    expect(sources).toContain('ols')
    expect(sources).toContain('local-obo')
  })
})
