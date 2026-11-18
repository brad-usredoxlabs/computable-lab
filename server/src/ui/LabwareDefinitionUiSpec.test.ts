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
 * because schema/workflow/ had no *.ui.yaml sibling — UISpecLoader cached
 * nothing for the registry id and UIHandlers answered 404, so
 * /record/new/labware-definition fell back to the minimal form.
 *
 * The schema half is delivered and MUST NOT change (ontology_ref optional
 * at schema/workflow/labware-definition.schema.yaml:43). This pin proves
 * the UI half: the spec loads, carries the EXACT registry schemaId (a
 * variant string leaves UI_SPEC_NOT_FOUND in place even when the loader
 * succeeds), and declares exactly one $.ontology_ref field with the
 * ontology-ref commit contract whose sources declare BOTH 'ols' and
 * 'local-obo' — the local-obo source is the per-field opt-in that lets
 * the ref combobox keep the resolve spine's in-house tier-2 candidates
 * (provider name, not a vocabulary term).
 *
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 (ldefsave-u1, DEFECT A+B) — the SAVE pins:
 * the create door POSTs the form's projected payload (empty-string keys
 * deleted — RecordCreatePanel.tsx:553-562) and the server Ajv rejects it
 * (g4/g6 422: Missing required recordId/type/topology/capacity; Unknown
 * property ontology_ref/namespace|label|uri). Fixed DECLARATIVELY (schema +
 * ui data; NO kind-branch in the panel): the schema's required list is
 * [kind, id, display_name] (kind is stamped by the client; recordId is spine
 * identity derived server-side from the author's id — GC-16 D-A) and
 * ontology_ref declares the optional canonical ref-object keys. The pins
 * below run the REAL projected payload through the REAL AjvValidator and
 * lock the schema data that makes the door 2xx.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAllDocuments } from 'yaml'
import { createUISpecLoader } from './UISpecLoader.js'
import { loadSchemasFromContent } from '../schema/SchemaLoader.js'
import { createValidator } from '../validation/AjvValidator.js'

const SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml'

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
)
const UI_PATH = join(SCHEMA_DIR, 'workflow', 'labware-definition.ui.yaml')
const SCHEMA_PATH = join(SCHEMA_DIR, 'workflow', 'labware-definition.schema.yaml')

// The REAL server validation spine (same construction as
// server/src/schema/LabwareDefinitionAnchor.test.ts): schema YAML loaded via
// SchemaLoader and validated by the AjvValidator the create door uses — a real
// Ajv run, not a hand-rolled check.
async function buildValidator() {
  const files = [
    'core/common.schema.yaml',
    'core/datatypes/ref.schema.yaml',
    'workflow/labware-definition.schema.yaml',
  ]
  const contents = new Map<string, string>(
    await Promise.all(
      files.map(async (f): Promise<[string, string]> => [f, await readFile(join(SCHEMA_DIR, f), 'utf-8')]),
    ),
  )
  const loaded = await loadSchemasFromContent(contents)
  const validator = createValidator({ strict: false })
  for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id)
  return validator
}

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

  it('the $.id Identifier field is authorable (not readonly) and required', async () => {
    const content = await readFile(UI_PATH, 'utf-8')
    const result = createUISpecLoader().load(content, UI_PATH)
    const field = result.spec?.form?.sections
      .flatMap((s) => s.fields)
      .find((f) => f.path === '$.id')
    expect(field).toBeDefined()
    expect(field?.readonly).not.toBe(true)
    expect(field?.required).toBe(true)
  })
})

describe('labware-definition create door — projected payload validates (ldefsave-u1 DEFECT A+B)', () => {
  // The canonical ref OBJECT the ref widget commits (refSelectionValue.ts):
  // {kind:'ontology', id, namespace, label, uri?} — uri only when an IRI.
  const microplateRef = {
    kind: 'ontology',
    id: 'LWO:0000120',
    namespace: 'LWO',
    label: 'microplate',
    uri: 'https://purl.obolibrary.org/obo/LWO_0000120',
  }

  it('the projected door payload (name + author id + anchor microplate) validates server-side', async () => {
    const validator = await buildValidator()
    // Projected as the create door POSTs it: form collects display_name + id
    // (+ vendor/ontology_ref), empty keys deleted, kind stamped by the client.
    // NO recordId/type/topology/capacity (GC-16 D-A — the client fabricates none).
    const payload = {
      kind: 'labware-definition',
      display_name: 'Microplate',
      id: 'lbw-def-microplate@v1',
      ontology_ref: microplateRef,
    }
    const result = validator.validate(payload, SCHEMA_ID)
    expect(result.errors).toEqual([])
    // AC2 — the anchor's CURIE id survives validation intact.
    expect(payload.ontology_ref.id).toBe('LWO:0000120')
  })

  it('the canonical ref keys namespace/label/uri are no longer Unknown properties', async () => {
    const validator = await buildValidator()
    const result = validator.validate(
      { kind: 'labware-definition', display_name: 'd', id: 'i@v1', ontology_ref: microplateRef },
      SCHEMA_ID,
    )
    expect(result.errors).toEqual([])
    // AC2 — the anchor's CURIE id is the committed value and survives intact.
    expect(microplateRef.id).toBe('LWO:0000120')
  })

  it('an unanchored definition still validates (ontology_ref optionality preserved)', async () => {
    const validator = await buildValidator()
    const result = validator.validate(
      { kind: 'labware-definition', display_name: 'Plain plate', id: 'lbw-def-plain@v1' },
      SCHEMA_ID,
    )
    expect(result.errors).toEqual([])
  })

  it('a malformed CURIE in the anchor is still refused (CURIE pattern kept)', async () => {
    const validator = await buildValidator()
    const result = validator.validate(
      {
        kind: 'labware-definition',
        display_name: 'd',
        id: 'i@v1',
        ontology_ref: { kind: 'ontology', id: 'lwo 100', namespace: 'LWO', label: 'x' },
      },
      SCHEMA_ID,
    )
    expect(result.errors).not.toEqual([])
  })

  it('the schema required list is [kind, id, display_name] (recordId/type/topology/capacity optional)', async () => {
    const content = await readFile(SCHEMA_PATH, 'utf-8')
    const doc = parseAllDocuments(content)[0].toJSON() as { required?: string[] }
    expect([...(doc.required ?? [])].sort()).toEqual(['display_name', 'id', 'kind'])
  })
})
