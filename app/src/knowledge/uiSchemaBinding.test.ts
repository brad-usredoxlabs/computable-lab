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

  // W1b — the evidence stance arrays bind an ARRAY widget, not a single
  // record-ref. evidence.schema.yaml declares supports/refutes/assesses as
  // `type: array, minItems: 1, items: $ref datatypes/ref` under
  // unevaluatedProperties: false. A `record-ref` binding commits ONE object
  // and would 422 with "Expected type: array" — the same defect class as the
  // W1a $.claimId/$.content assertion drift. (FIX1 D2/D3/D8: the item-SHAPE
  // guard lives in the D8 block below — the widget must actually commit a
  // datatypes/ref OBJECT, which a single record-ref cannot.)
  it.each(['supports', 'refutes', 'assesses'] as const)(
    'evidence: $.%s is a schema ref-array (type: array, items: ref) — not a single record-ref',
    async (arm) => {
      const [ui, schema] = await Promise.all([loadUi('evidence'), loadSchema('evidence')])
      const def = (schema.properties ?? {})[arm] as PropDef | undefined
      expect(def, `${arm} is declared`).toBeDefined()
      expect(def!.type, `${arm} is a ref array in the schema`).toBe('array')
      expect(def!.items, `${arm} items are the ref datatype`).toBeTruthy()
      const field = formFields(ui).find((f) => f.path === `$.${arm}`)
      expect(field, `evidence.ui.yaml must bind $.${arm}`).toBeDefined()
      // A single record-ref commits ONE object and would 422 with
      // "Expected type: array" under the schema's minItems: 1.
      expect(
        field!.widget,
        `$.${arm} is an ARRAY of refs — a single record-ref commits one object (was ${field!.widget})`,
      ).not.toBe('record-ref')
    },
  )
})

// =====================================================================
// GC-16 FIX1 D8 — SHAPE guard (RED at HEAD).
//
// The name guard above only checks that each bound PATH names a declared
// property. It truncates every path to its first segment (topSegment) and
// never compares the WIDGET KIND against the SCHEMA SHAPE, so a `reflist`
// binding over an array-of-ref / array-of-objects property sails through —
// which is exactly how defects 2 and 3 (reflist cannot emit a datatype ref
// or a {role_ref,context_ref} object) passed a "green" guard.
//
// These legs resolve the FULL dotted path and pin, per array field, that the
// widget actually commits the schema's ITEM shape:
//   - context_refs / supports / refutes / assesses (schema: array, items
//     $ref datatypes/ref) must bind an array widget whose committed item is
//     a datatypes/ref OBJECT — NOT `reflist` (which emits {value,source})
//     and NOT `record-ref` (which commits ONE object, not an array).
//   - roles (schema: array, items object {role_ref, context_ref}) must bind
//     an array widget whose committed item is an OBJECT with role_ref +
//     context_ref — NOT `reflist`.
// At HEAD these fields bind `reflist`, so the legs FAIL (RED). They GREEN
// when the fields are rebound to the array + typed item-hint idiom.
// =====================================================================

describe('GC-16 FIX1 D8 — knowledge ui.yaml widget shape matches the schema item shape', () => {
  /** A widget that commits an ARRAY (vs a single object / a string). */
  const ARRAY_COMMITTING_WIDGETS = new Set(['array', 'reflist'])

  /**
   * Resolve the FULL dotted property path (`$.a.b` -> ['a','b']) so a
   * sub-property binding is checked against the right schema node, not just
   * its top segment.
   */
  function resolveSegments(path: string): string[] {
    return path.replace(/^\$./, '').split('.').filter(Boolean)
  }

  /** Walk a schema doc to the sub-schema at a dotted property path. */
  function schemaAt(schema: SchemaDoc, segs: string[]): PropDef | undefined {
    let node: PropDef | undefined = (schema.properties ?? {})[segs[0]]
    for (let i = 1; i < segs.length && node; i++) {
      node = node.properties?.[segs[i]]
    }
    return node
  }

  /** Does a schema item sub-schema denote the datatypes/ref OBJECT? */
  function isRefItem(item: PropDef | undefined): boolean {
    if (!item) return false
    if (item.$ref) return /ref\.schema\.yaml/.test(item.$ref)
    if (item.type === 'object') return true
    return false
  }

  /** Does a schema item sub-schema denote an object with the given keys? */
  function isObjectItemWith(item: PropDef | undefined, keys: string[]): boolean {
    if (!item) return false
    if (item.$ref) return false // a $ref item is a ref object, not a plain object
    if (item.type !== 'object') return false
    const props = item.properties ?? {}
    return keys.every((k) => k in props)
  }

  it('assertion: $.context_refs (schema array of datatypes/ref) binds an array widget committing a ref OBJECT — not reflist (RED at HEAD: bound to reflist)', async () => {
    const [ui, schema] = await Promise.all([loadUi('assertion'), loadSchema('assertion')])
    const item = schemaAt(schema, resolveSegments('$.context_refs'))?.items
    expect(item, 'assertion.schema.yaml declares context_refs items').toBeTruthy()
    expect(
      isRefItem(item),
      'assertion.schema.yaml declares context_refs items as the datatypes/ref object',
    ).toBe(true)
    const fieldDef = formFields(ui).find((f) => f.path === '$.context_refs')
    expect(fieldDef, 'assertion.ui.yaml must bind $.context_refs').toBeDefined()
    const widget = fieldDef!.widget
    // reflist commits {value,source} — NOT a datatypes/ref object.
    expect(
      widget === 'reflist',
      `$.context_refs items are datatypes/ref OBJECTS — reflist emits {value,source} and cannot commit them (widget=${widget})`,
    ).toBe(false)
    // record-ref commits ONE object — not an array.
    expect(
      widget === 'record-ref',
      `$.context_refs is an ARRAY of refs — a single record-ref commits one object (widget=${widget})`,
    ).toBe(false)
    // The fix: an array-committing widget with a ref-object item shape.
    expect(
      ARRAY_COMMITTING_WIDGETS.has(widget!),
      `$.context_refs must bind an array-committing widget (was ${widget})`,
    ).toBe(true)
  })

  it('assertion: $.roles (schema array of {role_ref, context_ref} objects) binds an array widget committing that OBJECT shape — not reflist (RED at HEAD)', async () => {
    const [ui, schema] = await Promise.all([loadUi('assertion'), loadSchema('assertion')])
    const rolesDef = schemaAt(schema, resolveSegments('$.roles'))
    const item = rolesDef?.items
    expect(item, 'assertion.schema.yaml declares roles items').toBeTruthy()
    expect(
      isObjectItemWith(item, ['role_ref', 'context_ref']),
      'assertion.schema.yaml declares roles items as {role_ref, context_ref} objects',
    ).toBe(true)
    const fieldDef = formFields(ui).find((f) => f.path === '$.roles')
    expect(fieldDef, 'assertion.ui.yaml must bind $.roles').toBeDefined()
    const widget = fieldDef!.widget
    expect(
      widget === 'reflist',
      `$.roles items are {role_ref,context_ref} OBJECTS — reflist emits {value,source} and cannot commit them (widget=${widget})`,
    ).toBe(false)
    expect(
      widget === 'record-ref',
      `$.roles is an ARRAY of role-binding objects — a single record-ref commits one object (widget=${widget})`,
    ).toBe(false)
    expect(
      ARRAY_COMMITTING_WIDGETS.has(widget!),
      `$.roles must bind an array-committing widget (was ${widget})`,
    ).toBe(true)
  })

  it.each(['supports', 'refutes', 'assesses'] as const)(
    'evidence: $.%s (schema array of datatypes/ref) binds an array widget committing a ref OBJECT — not reflist (RED at HEAD)',
    async (arm) => {
      const [ui, schema] = await Promise.all([loadUi('evidence'), loadSchema('evidence')])
      const item = schemaAt(schema, resolveSegments(`$.${arm}`))?.items
      expect(item, `evidence.schema.yaml declares ${arm} items`).toBeTruthy()
      expect(
        isRefItem(item),
        `evidence.schema.yaml declares ${arm} items as the datatypes/ref object`,
      ).toBe(true)
      const fieldDef = formFields(ui).find((f) => f.path === `$.${arm}`)
      expect(fieldDef, `evidence.ui.yaml must bind $.${arm}`).toBeDefined()
      const widget = fieldDef!.widget
      expect(
        widget === 'reflist',
        `$.${arm} items are datatypes/ref OBJECTS — reflist emits {value,source} and cannot commit them (widget=${widget})`,
      ).toBe(false)
      expect(
        ARRAY_COMMITTING_WIDGETS.has(widget!),
        `$.${arm} must bind an array-committing widget (was ${widget})`,
      ).toBe(true)
    },
  )
})

// =====================================================================
// GC-16 FIX RUN 3 D11 — item-hint schema faithfulness (RED at c924b93a).
//
// Review cycle 2 (D11): the D8 block pins the TOP-LEVEL widget + the schema
// item shape, but is blind to the item-HINT's declared fields. The schemas
// require more than the hints declared:
//   - schema/core/datatypes/ref.schema.yaml: required: [kind]; kind:record
//     then requires id + type. Every ref-shaped item hint (assertion
//     context_refs; evidence supports/refutes/assesses) declared only
//     type/id/label — the binding could never yield a schema-valid item.
//   - assertion.roles items are {role_ref, context_ref} where EACH is a
//     datatypes/ref OBJECT (assertion.schema.yaml) — but the hint bound
//     them to `widget: text` (a string is not a ref object).
//
// These legs pin the DATA: every ref-shaped item hint must declare the
// `kind` sub-field (the discriminator the schema requires), and
// role_ref/context_ref must bind a ref-shaped OBJECT item hint
// (kind/type/id sub-fields) — not `text`.
// =====================================================================

interface HintDef {
  path?: string
  widget?: string
  readonly?: boolean
  options?: Array<{ value: unknown; label?: string }>
  fields?: HintDef[]
}

/** Every form field across all sections (hidden excluded — same set the
 *  editor renders; items/nested fields are walked from the field). */
function formFieldsAll(ui: UiDoc): FieldDef[] {
  return (ui.form?.sections ?? []).flatMap((s) => s.fields ?? []).filter(
    (f) => f && typeof f.path === 'string' && f.hidden !== true,
  )
}

/** The item-hint of an array field: field.items (the loader-honored key). */
function itemHintOf(fieldDef: FieldDef): HintDef | undefined {
  return fieldDef.items as HintDef | undefined
}

/** Walk to the schema node at a dotted path, descending through array
 *  item shapes (a.b where a is an array lives at a.items.properties.b). */
function schemaNodeAt(schema: SchemaDoc, segs: string[]): PropDef | undefined {
  let node: PropDef | undefined = (schema.properties ?? {})[segs[0]]
  for (let i = 1; i < segs.length; i++) {
    if (!node) return undefined
    const itemNode: PropDef | undefined = node.type === 'array' ? node.items : node
    node = itemNode?.properties?.[segs[i]]
  }
  return node
}

/** Does the schema property at the path (or its array item) $ref
 *  datatypes/ref? */
function schemaDeclaresRef(schema: SchemaDoc, segs: string[]): boolean {
  const node = schemaNodeAt(schema, segs)
  if (!node) return false
  const refNode = node.type === 'array' ? node.items : node
  return Boolean(refNode?.$ref && /ref\.schema\.yaml/.test(refNode.$ref))
}

/** The required list of the ITEM sub-schema at a dotted path. */
function schemaItemRequired(schema: SchemaDoc, segs: string[]): string[] {
  let node: PropDef | undefined = (schema.properties ?? {})[segs[0]]
  for (let i = 1; i < segs.length && node; i++) node = node.properties?.[segs[i]]
  return ((node as { items?: { required?: string[] } })?.items?.required ?? []) as string[]
}

/** Does a hint (or its sub-fields) declare the given sub-field? */
function hintDeclares(hint: HintDef | undefined, name: string): boolean {
  if (!hint) return false
  return (hint.fields ?? []).some((f) => f.path === name)
}

describe('GC-16 FIX RUN 3 D11 — ref-shaped item hints are schema-faithful (data)', () => {
  const REF_ITEM_FIELDS: Array<{ kind: 'assertion' | 'evidence'; path: string }> = [
    { kind: 'assertion', path: '$.context_refs' },
    { kind: 'evidence', path: '$.supports' },
    { kind: 'evidence', path: '$.refutes' },
    { kind: 'evidence', path: '$.assesses' },
  ]

  it.each(REF_ITEM_FIELDS.map((f) => `${f.kind} ${f.path}`))(
    '%s: schema requires ref items (kind required) — the item hint declares kind alongside type/id (RED at c924b93a: no kind)',
    async (name) => {
      const { kind, path } = REF_ITEM_FIELDS.find((f) => `${f.kind} ${f.path}` === name)!
      const [ui, schema] = await Promise.all([loadUi(kind), loadSchema(kind)])
      const segs = path.replace(/^\$./, '').split('.')
      expect(
        schemaDeclaresRef(schema, segs),
        `${kind}.schema.yaml declares ${path} items as the datatypes/ref object`,
      ).toBe(true)
      expect((schema.properties ?? {})[segs[0]]!.items, `${kind}.schema.yaml declares ${path} items`).toBeTruthy()
      const ref = yaml.parse(
        await readFile(resolve(process.cwd(), '..', 'schema', 'core', 'datatypes', 'ref.schema.yaml'), 'utf-8'),
      ) as { required?: string[] }
      expect(ref.required, 'datatypes/ref requires the kind discriminator').toContain('kind')
      const fieldDef = formFieldsAll(ui).find((f) => f.path === path)
      expect(fieldDef, `${kind}.ui.yaml must bind ${path}`).toBeDefined()
      expect(fieldDef!.widget, `${path} must keep the array widget`).toBe('array')
      const hint = itemHintOf(fieldDef!)
      expect(hint, `${path} must carry an item hint`).toBeTruthy()
      expect(hint!.widget, 'the item hint must be an object over the item sub-fields').toBe('object')
      // D11: the schema-required discriminator must be declared by the hint.
      expect(
        hintDeclares(hint, 'kind'),
        `${path} items require 'kind' (datatypes/ref required) — the item hint must declare a kind sub-field (declares: ${JSON.stringify(
          (hint!.fields ?? []).map((f) => f.path),
        )})`,
      ).toBe(true)
      // kind:record then-requires id + type: both stay declared.
      expect(hintDeclares(hint, 'id'), `${path} record refs require id`).toBe(true)
      expect(hintDeclares(hint, 'type'), `${path} record refs require type (kind:record then-requires it)`).toBe(true)
    },
  )

  it('assertion $.roles: role_ref AND context_ref are datatypes/ref OBJECTS — each binds a ref-shaped object item hint (kind/type/id), not text (RED at c924b93a: bound to text)', async () => {
    const [ui, schema] = await Promise.all([loadUi('assertion'), loadSchema('assertion')])
    // The schema speaks: both sub-fields $ref datatypes/ref; the item
    // requires both.
    expect(schemaDeclaresRef(schema, ['roles', 'role_ref']), 'assertion.schema.yaml roles.role_ref is a ref object').toBe(true)
    expect(schemaDeclaresRef(schema, ['roles', 'context_ref']), 'assertion.schema.yaml roles.context_ref is a ref object').toBe(true)
    expect(schemaItemRequired(schema, ['roles']), 'assertion.schema.yaml roles items require both refs').toEqual(
      expect.arrayContaining(['role_ref', 'context_ref']),
    )
    const fieldDef = formFieldsAll(ui).find((f) => f.path === '$.roles')
    expect(fieldDef, 'assertion.ui.yaml must bind $.roles').toBeDefined()
    expect(fieldDef!.widget, '$.roles must keep the array widget').toBe('array')
    const hint = itemHintOf(fieldDef!)
    expect(hint, '$.roles must carry an item hint').toBeTruthy()
    expect(hint!.widget, 'the roles item hint must be an object').toBe('object')
    for (const sub of ['role_ref', 'context_ref']) {
      const subHint = (hint!.fields ?? []).find((f) => f.path === sub)
      expect(subHint, `the roles item hint must declare the ${sub} sub-field`).toBeTruthy()
      expect(
        subHint!.widget,
        `${sub} is a datatypes/ref OBJECT (schema) — a text widget commits a string (widget=${subHint!.widget})`,
      ).toBe('object')
      // The ref shape: the object hint spans the discriminator + the
      // record-ref identity the schema then-requires.
      expect(hintDeclares(subHint, 'kind'), `${sub} (a ref object) must declare kind`).toBe(true)
      expect(hintDeclares(subHint, 'type'), `${sub} (a ref object) must declare type`).toBe(true)
      expect(hintDeclares(subHint, 'id'), `${sub} (a ref object) must declare id`).toBe(true)
    }
  })

  // =====================================================================
  // GC-16 FIX RUN 4 D18 (review cycle 3, MINOR): the D11 kind hints were
  // single-option selects marked `readonly: true` with NO seed — so no
  // author action could ever produce `kind: record` (with readonly
  // honoured nothing is selectable; with no default/seed — correctly ruled
  // inexpressible by the D11 rescope — nothing populates it). The remedy
  // (reviewer's first option, data-only): DROP readonly from the kind
  // hints — the kind select is no longer marked readonly, and it becomes
  // authorable only once R1 renders item sub-slots; at HEAD no author
  // action yet produces kind:record (the repo's own green D2/D3 leg
  // proves the array widget commits [{}] with no item sub-slots rendered)
  // — dropping readonly removes a contradictory declaration only. These
  // legs pin that pinning: the kind sub-field must be declared AND its
  // select must NOT be readonly (RED at 82044fa4: readonly: true with no
  // seed).
  // =====================================================================
  const KIND_HINT_FIELDS: Array<{ kind: 'assertion' | 'evidence'; path: string; itemSeeds: string[] }> = [
    { kind: 'assertion', path: '$.context_refs', itemSeeds: [] },
    { kind: 'evidence', path: '$.supports', itemSeeds: [] },
    { kind: 'evidence', path: '$.refutes', itemSeeds: [] },
    { kind: 'evidence', path: '$.assesses', itemSeeds: [] },
  ]

  it.each(KIND_HINT_FIELDS.map((f) => `${f.kind} ${f.path}`))(
    'D18: %s — the item hint\'s kind sub-field is a single-option select that is NOT readonly (no longer marked readonly; authorable only once R1 renders item sub-slots — at HEAD no author action yet produces kind:record; RED at 82044fa4: readonly: true with no seed)',
    async (name) => {
      const entry = KIND_HINT_FIELDS.find((f) => `${f.kind} ${f.path}` === name)!
      const ui = await loadUi(entry.kind)
      const fieldDef = formFieldsAll(ui).find((f) => f.path === entry.path)
      expect(fieldDef, `${entry.kind}.ui.yaml must bind ${entry.path}`).toBeDefined()
      const hint = itemHintOf(fieldDef!)
      const kindField = (hint!.fields ?? []).find((f) => f.path === 'kind')
      expect(kindField, `the ${entry.path} item hint must declare the kind sub-field`).toBeTruthy()
      expect(kindField!.widget, 'the kind discriminator is a select over the schema enum').toBe('select')
      const options = kindField!.options as Array<{ value: unknown }> | undefined
      expect(
        (options ?? []).map((o) => o.value),
        'the single option is the schema enum value "record"',
      ).toEqual(['record'])
      expect(
        kindField!.readonly,
        'D18: a readonly single-option select with no seed makes kind:record unauthorable (the D11 rescope already ruled a seed inexpressible on the ui-v1 surface) — readonly is a contradictory declaration; dropping it removes that contradiction only, it does not make the value authorable until R1 renders item sub-slots',
      ).toBeFalsy()
    },
  )

  it('D18: assertion $.roles — the role_ref AND context_ref kind sub-fields are single-option selects that are NOT readonly (RED at 82044fa4: readonly: true)', async () => {
    const ui = await loadUi('assertion')
    const fieldDef = formFieldsAll(ui).find((f) => f.path === '$.roles')
    expect(fieldDef, 'assertion.ui.yaml must bind $.roles').toBeDefined()
    const hint = itemHintOf(fieldDef!)
    for (const sub of ['role_ref', 'context_ref']) {
      const subHint = (hint!.fields ?? []).find((f) => f.path === sub)
      expect(subHint, `the roles item hint must declare the ${sub} sub-field`).toBeTruthy()
      const kindField = (subHint!.fields ?? []).find((f) => f.path === 'kind')
      expect(kindField, `${sub} must declare the kind sub-field`).toBeTruthy()
      expect(kindField!.widget, `${sub}.kind is a select over the schema enum`).toBe('select')
      expect(
        ((kindField!.options as Array<{ value: unknown }> | undefined) ?? []).map((o) => o.value),
        `${sub}.kind single option is "record"`,
      ).toEqual(['record'])
      expect(
        kindField!.readonly,
        `D18: ${sub}.kind must NOT be readonly (readonly + no seed → unauthorable)`,
      ).toBeFalsy()
    }
  })
})
