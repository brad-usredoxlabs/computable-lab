/**
 * GC-16 (W1) — the knowledge UI triplets must bind ONLY properties their
 * record schemas declare (data-level ui<->schema drift guard).
 *
 * Root defect (architect GAP-1, orch-verified): `assertion.ui.yaml` bound
 * `$.claimId` and `$.content` — properties `assertion.schema.yaml` does NOT
 * declare (`unevaluatedProperties: false` declares claim_ref / statement /
 * scope / context_refs / roles / outcome / confidence). A draft built from
 * that spec could never pass the server Ajv, so even a wired authoring door
 * would 422 on submit.
 *
 * This test is the data-level leg the spec calls for (no ui<->schema drift
 * test existed in the repo — the nearest precedent is gcEvidenceSources.test.ts
 * pinning a data table against the real YAML): for each knowledge triplet it
 * loads the REAL `*.ui.yaml` and `*.schema.yaml` and pins, per form field:
 *   (a) the field path names a declared schema property (leaf `properties`
 *       UNION the FAIRCommon mixin, which the schema pulls in via
 *       `allOf: $ref: ./common.schema.yaml` — id/title live in the mixin, not
 *       the leaf);
 *   (b) a `select` field's options are a subset of the schema's declared
 *       `enum` (when the schema declares one) — the scope enum is the A7
 *       refusal's shape;
 *   (c) a `number` field binds a schema `number`/`integer` property;
 *   (d) a `ref`/`record-ref`/`reflist` field binds an `object`/`array`
 *       property (a ref is a structured object, never a string — refValue.ts
 *       value-emission contract).
 *
 * It reads the shipped YAML (the single source of truth), never a mirror.
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import yaml from 'yaml'

const SCHEMA = (name: string) => resolve(process.cwd(), '..', 'schema', 'knowledge', name)
const FAIR_COMMON = resolve(process.cwd(), '..', 'schema', 'core', 'common.schema.yaml')

interface FieldDef {
  path: string
  widget?: string
  readonly?: boolean
  hidden?: boolean
  options?: Array<{ value: unknown; label: string }>
  [k: string]: unknown
}
interface UiDoc {
  uiVersion: number
  schemaId: string
  display?: { titleField?: string }
  form?: {
    layout?: string
    sections: Array<{ title: string; fields: FieldDef[] }>
  }
  list?: { columns: Array<{ path: string; label: string }> }
}
interface PropDef {
  type?: string
  enum?: unknown[]
  $ref?: string
  properties?: Record<string, PropDef>
  allOf?: Array<{ $ref?: string }>
  $defs?: Record<string, { properties?: Record<string, PropDef> }>
  items?: PropDef
}
interface SchemaDoc {
  $id: string
  properties?: Record<string, PropDef>
}

async function loadUi(kind: string): Promise<UiDoc> {
  return yaml.parse(await readFile(SCHEMA(`${kind}.ui.yaml`), 'utf-8')) as UiDoc
}
async function loadSchema(kind: string): Promise<SchemaDoc> {
  return yaml.parse(await readFile(SCHEMA(`${kind}.schema.yaml`), 'utf-8')) as SchemaDoc
}
/** FAIRCommon mixin property names — the fields the schema pulls in via
 *  allOf: $ref ./common.schema.yaml (id, title, …). These are NOT in the
 *  leaf `properties`, so the declared-set is leaf ∪ mixin. */
async function loadFairCommonProps(): Promise<Set<string>> {
  const doc = yaml.parse(await readFile(FAIR_COMMON, 'utf-8')) as {
    $defs: { FAIRCommon: { properties: Record<string, unknown> } }
  }
  return new Set(Object.keys(doc.$defs.FAIRCommon.properties))
}

/** Every non-hidden form field across all sections (the create/edit form). */
function formFields(ui: UiDoc): FieldDef[] {
  return (ui.form?.sections ?? []).flatMap((s) => s.fields ?? []).filter(
    (f) => f && typeof f.path === 'string' && f.hidden !== true,
  )
}

/** Top-level property name for a `$.a.b.c` field path (first segment). */
function topSegment(path: string): string {
  const clean = path.replace(/^\$\./, '')
  return clean.split('.')[0] ?? clean
}

const KINDS = ['assertion', 'claim', 'evidence'] as const

describe('GC-16 W1 — knowledge ui.yaml binds only declared schema properties (no drift)', () => {
  it.each(KINDS)(
    '%s: every ui.yaml form field path exists in its schema (leaf ∪ FAIRCommon mixin)',
    async (kind) => {
      const [ui, schema, fair] = await Promise.all([
        loadUi(kind),
        loadSchema(kind),
        loadFairCommonProps(),
      ])
      const declared = new Set<string>([
        ...Object.keys(schema.properties ?? {}),
        ...fair,
      ])
      const missing = formFields(ui)
        .map((f) => topSegment(f.path))
        .filter((seg) => !declared.has(seg))
      expect(
        missing,
        `${kind}.ui.yaml binds field(s) ${JSON.stringify(
          missing,
        )} that ${kind}.schema.yaml (unevaluatedProperties:false) rejects`,
      ).toEqual([])
    },
  )

  it.each(KINDS)('%s: ui.yaml schemaId === schema $id (the served projection key)', async (kind) => {
    const [ui, schema] = await Promise.all([loadUi(kind), loadSchema(kind)])
    expect(ui.schemaId).toBe(schema.$id)
  })

  it('assertion: the drifted $.claimId / $.content bindings are gone and the real fields are bound', async () => {
    const ui = await loadUi('assertion')
    const paths = formFields(ui).map((f) => f.path)
    // The orch-verified drift (the whole point of this work item) is gone.
    expect(paths).not.toContain('$.claimId')
    expect(paths).not.toContain('$.content')
    // The real schema fields the spec names are present and bound.
    for (const required of [
      '$.claim_ref',
      '$.statement',
      '$.scope',
      '$.context_refs',
    ]) {
      expect(paths, `assertion.ui.yaml must bind ${required}`).toContain(required)
    }
    // The identity field is $.id (the assertion schema declares `id`, not
    // `recordId` — recordId is the envelope's canonical identity).
    expect(paths).toContain('$.id')
  })

  it('assertion: scope select options mirror the schema enum exactly (the A7 refusal shape)', async () => {
    const [ui, schema] = await Promise.all([loadUi('assertion'), loadSchema('assertion')])
    const scopeField = formFields(ui).find((f) => f.path === '$.scope')
    expect(scopeField, 'the scope field must be bound').toBeDefined()
    expect(scopeField!.widget).toBe('select')
    const declaredEnum = (schema.properties?.scope as PropDef | undefined)?.enum as string[]
    expect(declaredEnum, 'assertion.schema.yaml declares a scope enum').toBeTruthy()
    const uiOptions = (scopeField!.options ?? []).map((o) => String(o.value))
    expect(uiOptions).toEqual(declaredEnum)
  })

  it('assertion: ref/record-ref/reflist/number bindings match the schema field types', async () => {
    const [ui, schema] = await Promise.all([loadUi('assertion'), loadSchema('assertion')])
    const props = schema.properties ?? {}
    // claim_ref is a structured ref ($ref to the ref datatype — an object
    // schema) → ref/record-ref widget.
    expect(props.claim_ref, 'claim_ref is declared').toBeDefined()
    expect(
      props.claim_ref.$ref ?? (props.claim_ref.type === 'object' ? 'object' : undefined),
      'claim_ref must be a ref-typed (object) property',
    ).toBeTruthy()
    // context_refs is a ref array (array) → reflist widget.
    expect(props.context_refs?.type).toBe('array')
    // confidence is an integer (1-5) → number widget.
    expect(props.confidence?.type).toBe('integer')
    const scope = formFields(ui).find((f) => f.path === '$.scope')!
    expect(scope.widget).toBe('select')
    const conf = formFields(ui).find((f) => f.path === '$.confidence')!
    expect(conf.widget).toBe('number')
  })

  it('claim: subject/predicate/object are ref-typed (object) and bound as ref widgets, not text', async () => {
    const [ui, schema] = await Promise.all([loadUi('claim'), loadSchema('claim')])
    const props = schema.properties ?? {}
    for (const arm of ['subject', 'predicate', 'object']) {
      const def = props[arm]
      expect(def, `${arm} is declared`).toBeTruthy()
      expect(
        def!.$ref ?? (def!.type === 'object' ? 'object' : undefined),
        `${arm} is a structured ref (object schema)`,
      ).toBeTruthy()
      const field = formFields(ui).find((f) => f.path === `$.${arm}`)
      expect(field, `claim.ui.yaml must bind $.${arm}`).toBeDefined()
      expect(
        field!.widget,
        `$.${arm} must be a ref-family widget (was ${field!.widget} — a text value is not a ref object)`,
      ).toMatch(/^ref$/)
    }
  })

  it('evidence: the form exposes supports[], sources[] (typed) and quality{} — the audit finds it clean', async () => {
    const ui = await loadUi('evidence')
    const paths = formFields(ui).map((f) => f.path)
    // The spec's evidence form floor: stance arrays, typed sources, quality.
    expect(paths).toContain('$.supports')
    expect(paths).toContain('$.sources')
    expect(paths).toContain('$.quality')
    // sources are typed { type, ref } objects → an array widget (the GC-13
    // items-hint idiom, pinned in gcEvidenceSources.test.ts).
    const sources = formFields(ui).find((f) => f.path === '$.sources')!
    expect(sources.widget).toBe('array')
  })
})
