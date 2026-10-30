/**
 * GC-16 FIX1 D2/D3 — the knowledge array-of-ref / array-of-object fields
 * (evidence supports/refutes/assesses; assertion context_refs/roles) must be
 * AUTHORABLE through the widget path: a value committed through the REAL
 * widget must satisfy the REAL schema (datatypes/ref items) under the server's
 * own Ajv config.
 *
 * What this test does (the proof the review demands): renders the REAL
 * RecordCreatePanel with the REAL taptab editor (NO taptab mock) over a
 * projection built from the REAL schema/knowledge/evidence.ui.yaml +
 * assertion.ui.yaml (the `widget: array` + typed item-hint binding this fix
 * sets), drives the REAL array widget's commit path (open the field,
 * "+ Add item"), submits through the REAL serializer (serializeDocument),
 * and validates the CAPTURED payload against the REAL
 * schema/knowledge/<kind>.schema.yaml with Ajv2020 (the same config as the
 * server: strict:false, allErrors:true).
 *
 * FINDING (proven — this is the requires-rescope evidence):
 *   The taptab `array` widget commits `[{}]`. Its "+ Add item" appends an
 *   EMPTY object and renders NO authorable item sub-slots (the typed
 *   item-hint is accepted by the projection but inert for authoring — the
 *   projection even emits UNSUPPORTED_WIDGET for `array`; ArrayWidget.tsx
 *   :85-93 is the entire item authoring). The REAL schema therefore rejects
 *   the committed payload at /supports/0 (missing kind/id/type),
 *   /context_refs/0 (missing kind), /roles/0 (missing role_ref+context_ref).
 *   A hand-carried schema-valid ref array PASSES the SAME schema — so the
 *   gap is the WIDGET, not the schema or the binding. Fixing it requires a
 *   widget-component change (ArrayWidget item authoring, or a working
 *   array-of-ref widget) — OUTSIDE this lane's file boundary (NO
 *   widget-component edits). The declarative ui.yaml binding (widget: array
 *   + typed item-hint) is the schema-faithful spec the fixed widget should
 *   carry; until then the D2/D3 authoring leg reports requires-rescope.
 *
 * NOTE: the evidence leg also incidentally surfaces D1 — the captured
 * payload carries a client-stamped `shortSlug` that the evidence schema
 * (unevaluatedProperties: false) rejects; the schema-driven D1 fix removes
 * it for knowledge kinds.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import yaml from 'yaml'
import Ajv2020Module from 'ajv/dist/2020.js'
import { RecordCreatePanel } from './RecordCreatePanel'

const Ajv2020 = (Ajv2020Module as unknown as { default: typeof Ajv2020Module }).default

const SCHEMA_ROOT = resolve(process.cwd(), '..', 'schema')

/** Walk schema/** for .schema.yaml and register every $id (mirrors the
 *  server's Ajv registration; cross-file $refs resolve by $id). */
function loadKnowledgeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (p.endsWith('.schema.yaml')) out.push(p)
    }
    return out
  }
  for (const f of walk(SCHEMA_ROOT)) {
    const doc = yaml.parse(readFileSync(f, 'utf-8')) as { $id?: string }
    if (doc && doc.$id) {
      try {
        ajv.addSchema(doc)
      } catch {
        // A duplicate $id (mirrored copy) is not load-bearing here.
      }
    }
  }
  return ajv
}

type Ajv = ReturnType<typeof loadKnowledgeAjv>

const sid = (kind: string) =>
  `https://computable-lab.com/schema/computable-lab/${kind}.schema.yaml`

function ajvErrorsFor(
  ajv: Ajv,
  kind: string,
  payload: Record<string, unknown>,
) {
  const validate = ajv.getSchema(sid(kind))!
  return validate(payload) ? [] : (validate.errors ?? [])
}

/**
 * Build the editor-draft projection the server would serve for a knowledge
 * kind, from the REAL *.ui.yaml (mirrors
 * EditorProjectionService.projectSlotsFromFormSections — the form.sections
 * fallback the knowledge ui.yaml takes; verified against the live :3092
 * response shape: slot ids slot_<name>, items hints preserved).
 */
function projectionForUi(kind: string): Record<string, unknown> {
  const ui = yaml.parse(
    readFileSync(resolve(SCHEMA_ROOT, 'knowledge', `${kind}.ui.yaml`), 'utf-8'),
  ) as { form: { sections: Array<{ title: string; fields: Array<Record<string, unknown>> }> } }
  const allSlots: Array<Record<string, unknown>> = []
  for (const section of ui.form.sections) {
    for (const field of section.fields) {
      if (field.hidden) continue
      if (typeof field.path !== 'string' || !field.path) continue
      const slot: Record<string, unknown> = {
        id: `slot-${field.path.replace(/\$/g, '').replace(/\./g, '_')}`,
        path: field.path,
        label: (field.label as string) ?? field.path,
        widget: (field.widget as string) ?? 'text',
        required: (field.required as boolean) ?? false,
        readOnly: Boolean(field.readOnly ?? field.readonly ?? false),
      }
      if (field.items !== undefined) slot.items = field.items
      if (field.options !== undefined) slot.options = field.options
      if (field.refKind !== undefined) slot.refKind = field.refKind
      if (field.props !== undefined) slot.props = field.props
      allSlots.push(slot)
    }
  }
  const blocks = ui.form.sections.map((s, i) => ({
    id: `section-${i}`,
    kind: 'section',
    label: s.title,
    slotIds: allSlots
      .filter((s) => ui.form.sections[i].fields.some((f) => f.path === s.path))
      .map((s) => s.id),
  }))
  return {
    schemaId: sid(kind),
    recordId: '__draft__',
    title: 'New record',
    blocks,
    slots: allSlots,
    diagnostics: [],
  }
}

const mocked = vi.hoisted(() => ({
  createCalls: [] as Array<[string | undefined, Record<string, unknown>]>,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    // The served registry metadata (GET /schemas) — the knowledge triplet.
    getSchemas: vi.fn(() =>
      Promise.resolve(
        ['assertion', 'claim', 'evidence'].map((kind) => ({
          id: sid(kind),
          path: `knowledge/${kind}.schema.yaml`,
          title: kind,
        })),
      ),
    ),
    // GC-16 FIX RUN 2 (defect 1/4/9): the served schema DOCUMENT (GET
    // /schemas/:id) — the REAL schema/knowledge/<kind>.schema.yaml, so the
    // panel's schema-driven gates (shortSlug? title-required?) see the real
    // shapes. Absent from the mock at 1f7a92fe (the panel did not fetch it).
    getSchema: vi.fn((schemaId: string) => {
      const base = String(schemaId).split('/').pop() ?? ''
      const kind = base.replace(/\.schema\.yaml$/, '')
      const doc = yaml.parse(readFileSync(join(SCHEMA_ROOT, 'knowledge', `${kind}.schema.yaml`), 'utf-8'))
      return Promise.resolve({ id: schemaId, path: `knowledge/${kind}.schema.yaml`, title: kind, schema: doc })
    }),
    // The REAL editor-draft shape, built from the REAL ui.yaml — the
    // projection the REAL editor renders IS the real binding.
    // The panel calls getEditorDraftProjection(SCHEMA_IDS[kind]) — the FULL
    // registry id — so derive the kind from the basename.
    getEditorDraftProjection: vi.fn((schemaId: string) => {
      const base = String(schemaId).split('/').pop() ?? ''
      const kind = base.replace(/\.schema\.yaml$/, '')
      return Promise.resolve(projectionForUi(kind))
    }),
    createRecord: vi.fn((schemaId: string, payload: Record<string, unknown>) => {
      mocked.createCalls.push([schemaId, payload])
      return Promise.resolve({ recordId: payload.recordId ?? payload.id })
    }),
  },
  // The real client barrel also exports describeApiError (used by the panel).
  describeApiError: (e: unknown) => String(e),
}))

afterEach(() => {
  mocked.createCalls = []
  cleanup()
})

/** Find a REAL taptab field row by its label and return it (fresh query —
 *  the editor re-renders after every commit, detaching stale elements). */
function findRow(label: string): HTMLElement {
  const el = screen.getByText(label)
  const row = el.closest('.taptab-field-row')
  expect(row, `the "${label}" field row must render in the REAL editor`).toBeTruthy()
  return row as HTMLElement
}

/** Drive the REAL array widget on a field row: open edit mode, add one
 *  item. Every click is act()-flushed so the TipTap transaction (and the
 *  panel's handleEditorUpdate) lands before the next step.
 *
 * In EMPTY state the value span carries .taptab-array-value; after the
 * first commit the value is a populated UL (.taptab-array-value
 * .taptab-array-items) — the EDIT button is a sibling <button> in the
 * .taptab-array-widget wrapper. So: if the row has a .taptab-array-editor
 * button, click it; otherwise click the array value (empty or populated). */
function addArrayItem(row: HTMLElement): void {
  let editor: HTMLElement | null = row.querySelector('.taptab-array-editor')
  if (!editor) {
    const arrayValue = row.querySelector('.taptab-array-value')
    expect(arrayValue, 'the slot must render the array widget').toBeTruthy()
    act(() => {
      fireEvent.click(arrayValue!)
    })
    editor = row.querySelector('.taptab-array-editor')
    expect(editor, 'clicking the array value must open the edit mode').toBeTruthy()
  }
  const addBtn = row.querySelector('.taptab-array-add')
  expect(addBtn, 'the array widget must expose the Add item affordance').toBeTruthy()
  act(() => {
    fireEvent.click(addBtn!)
  })
}

describe('GC-16 FIX1 D2/D3 — knowledge array-of-ref fields through the REAL widget path (requires-rescope proof)', () => {
  it('evidence: the REAL array widget commits $.supports=[{}]; the REAL schema REJECTS it (required kind) while a hand-carried ref array PASSES', async () => {
    render(
      <RecordCreatePanel nodeType="evidence" draftTitle="bundle supports claim" onCreated={() => {}} />,
    )
    // The REAL taptab editor mounts once registry + projection settle.
    const row = await waitFor(() => findRow('Supports (assertion/claim refs)'), { timeout: 8000 })
    addArrayItem(row)
    // Submit through the REAL serializer.
    act(() => {
      fireEvent.click(screen.getByTestId('record-create-submit'))
    })
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
    const [, payload] = mocked.createCalls[0]
    // The committed value is the array widget's OWN commit: an EMPTY object
    // entry (no authorable item sub-slots). This is the platform gap.
    expect(payload.supports, 'the widget committed a supports array').toEqual([{}])

    const ajv = loadKnowledgeAjv()
    const errors = ajvErrorsFor(ajv, 'evidence', payload)
    // RAW Ajv evidence (the failing payload the review's probe pattern
    // requires): the REAL schema rejects the widget-committed value.
    console.log('RAW AJV (evidence supports widget commit):', JSON.stringify(errors, null, 2))
    expect(
      errors.some((e) => e.instancePath === '/supports/0' && e.keyword === 'required'),
      'the REAL evidence.schema.yaml must reject the committed supports item (required kind)',
    ).toBe(true)

    // CONTROL: the SAME payload, with `supports` replaced by the
    // datatypes/ref OBJECT the schema declares (and the client-buggy
    // shortSlug removed) — PASSES. Proves the schema is authorable; the
    // widget is the gap. (id is the AUTHOR's — the D4 provisional D-A
    // authoring path: the client no longer mints knowledge ids.)
    const valid: Record<string, unknown> = {
      ...payload,
      id: 'EVD-1',
      supports: [{ kind: 'record', type: 'claim', id: 'CLM-1' }],
      sources: [{ type: 'result', ref: { kind: 'record', type: 'result', id: 'RES-1' } }],
    }
    delete valid.shortSlug
    expect(
      ajvErrorsFor(ajv, 'evidence', valid),
      'a hand-carried datatypes/ref array must PASS the REAL schema',
    ).toEqual([])
  }, 20000)

  it('assertion: the REAL array widgets commit $.context_refs=[{}] AND $.roles=[{}]; the REAL schema REJECTS both (required kind / role_ref+context_ref) — requires-rescope record', async () => {
    // REQUIRES-RESCOPE PROOF (fix-run-1 D2/D3): the array-of-ref fields commit
    // the widget's OWN value — an empty object entry, no item sub-slots. The
    // REAL schema rejects it; a hand-carried schema-valid array passes. The
    // gap is the widget (item authoring), ruled OUTSIDE this lane's file
    // boundary — this file records the symptom faithfully.
    render(
      <RecordCreatePanel nodeType="assertion" draftTitle="scoped assertion" onCreated={() => {}} />
    )
    const contextLabel = 'Context refs (the contexts this ranges over)'
    const firstRow = await waitFor(() => findRow(contextLabel), { timeout: 8000 })
    addArrayItem(firstRow)
    // RE-QUERY fresh: the commit above re-rendered the editor, detaching the
    // previous row element.
    const contextRow = findRow(contextLabel)
    addArrayItem(contextRow)
    const rolesRow = findRow('Roles (context-role bindings)')
    addArrayItem(rolesRow)

    // ROOT CAUSE of the "roles=undefined" symptom (fix-run-2 diagnosis, proven
    // by four independent probes + a per-commit createRecord counter): the
    // array-of-ref widgets DO render and DO commit — BOTH context_refs and
    // roles commit the widget's OWN value, an EMPTY OBJECT entry `[{}]` (the
    // array-of-ref item-authoring platform gap: the item has no kind/role_ref/
    // context_ref because the widget authorizes no item sub-slots). The
    // original capture saw `roles: undefined` for a DIFFERENT reason: the
    // widget's "Add item" / "Remove" / "Done" buttons (ArrayWidget.tsx,
    // READ-ONLY in this lane) have NO `type` attribute, so they default to
    // `type="submit"`, and their onClick only calls `e.stopPropagation()`
    // (which stops bubbling, NOT form submission). Because the array editor
    // renders INSIDE the create `<form>`, EVERY array-item commit ALSO submits
    // the form → a `createRecord` call (observed: 1 per add). The first such
    // (spurious) submit — the context_refs commit — serializes the document
    // BEFORE the later roles commit lands, so capturing `createRecord` from
    // that EARLY spurious submit yields `context_refs=[{}]` but
    // `roles: undefined`. This is a capture-timing artifact of the spurious
    // submits, NOT a roles-specific binding/projection/serializer defect.
    //
    // FIX (test-only, per the task ruling — NO widget-component edits):
    // settle the editor after the last commit, then capture the SETTLED
    // payload (the final submit's serialization of the fully-settled doc),
    // which carries BOTH committed `[{}]` values. This pins the TRUE symptom
    // — both array-of-ref widgets commit `[{}]`, and the real schema rejects
    // both — not a mid-flight snapshot. (Fixing the root cause — giving the
    // array commit buttons an explicit `type="button"` so they don't submit
    // the enclosing create form — is the widget fix that requires the
    // rescope this file documents.)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })

    // The REAL (final) submit — one record; it serializes the SETTLED
    // document (both arrays committed), so the LAST captured create carries
    // both. (The earlier spurious submits — one per array commit — captured
    // mid-flight snapshots and are the artifact that misread `roles` as
    // undefined; the final one is the true settled payload.)
    const form = screen.getByTestId('record-create-panel').querySelector('form')
    expect(form, 'the create panel renders a form').toBeTruthy()
    act(() => {
      fireEvent.submit(form!)
    })
    // Wait until the SETTLED final submit carries both committed arrays.
    await waitFor(() => {
      const len = mocked.createCalls.length
      expect(len).toBeGreaterThanOrEqual(1)
      expect(mocked.createCalls[len - 1][1].roles).toEqual([{}])
    })

    // EACH widget's OWN (spurious per-commit) submit proves that field
    // committed its value: the context_refs commit's submit carries
    // context_refs=[{}] (roles not yet committed); the roles commit's submit
    // (and the final settled submit) carries BOTH. This is the requires-
    // rescope proof — every array-of-ref field commits an EMPTY OBJECT
    // entry, no ref shape.
    expect(
      mocked.createCalls.some(([, p]) => p.context_refs && JSON.stringify(p.context_refs) === '[{}]'),
      'the context_refs widget committed its [{}] value (its own submit)',
    ).toBe(true)
    expect(
      mocked.createCalls.some(([, p]) => p.roles && JSON.stringify(p.roles) === '[{}]'),
      'the roles widget committed its [{}] value (its own submit)',
    ).toBe(true)

    // The SETTLED payload (final submit) carries both committed values.
    const [, payload] = mocked.createCalls[mocked.createCalls.length - 1]
    expect(payload.context_refs, 'the settled payload carries context_refs').toEqual([{}])
    expect(payload.roles, 'the settled payload carries roles').toEqual([{}])

    const ajv = loadKnowledgeAjv()
    const errors = ajvErrorsFor(ajv, 'assertion', payload)
    // RAW Ajv evidence (the failing payload the review's probe pattern
    // requires): the REAL schema rejects the widget-committed values.
    console.log('RAW AJV (assertion context_refs+roles widget commit):', JSON.stringify(errors, null, 2))
    expect(
      errors.some((e) => e.instancePath === '/context_refs/0' && e.keyword === 'required'),
      'the REAL assertion.schema.yaml must reject the committed context_refs item (required kind)',
    ).toBe(true)
    expect(
      errors.some(
        (e) =>
          e.instancePath === '/roles/0' &&
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string })?.missingProperty === 'role_ref',
      ),
      'the REAL assertion.schema.yaml must reject the committed roles item (required role_ref)',
    ).toBe(true)
    expect(
      errors.some(
        (e) =>
          e.instancePath === '/roles/0' &&
          e.keyword === 'required' &&
          (e.params as { missingProperty?: string })?.missingProperty === 'context_ref',
      ),
      'the REAL assertion.schema.yaml must reject the committed roles item (required context_ref)',
    ).toBe(true)

    // CONTROL: the schema-valid shapes PASS — the widget is the gap. (The
    // author-supplied id/scope are the D4 provisional D-A authoring path.)
    const valid: Record<string, unknown> = {
      ...payload,
      id: 'ASN-1',
      scope: 'global',
      context_refs: [{ kind: 'record', type: 'context', id: 'CTX-1' }],
      roles: [
        {
          role_ref: { kind: 'record', type: 'context-role', id: 'CR-1' },
          context_ref: { kind: 'record', type: 'context', id: 'CTX-1' },
        },
      ],
    }
    delete valid.shortSlug
    expect(
      ajvErrorsFor(ajv, 'assertion', valid),
      'schema-valid context_refs/roles must PASS the REAL schema',
    ).toEqual([])
  }, 20000)
})
