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
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import yaml from 'yaml'
import Ajv2020Module from 'ajv/dist/2020.js'
import { RecordCreatePanel } from './RecordCreatePanel'

const Ajv2020 = (Ajv2020Module as unknown as { default: typeof Ajv2020Module }).default

// jsdom has no scrollIntoView — EnumCombobox (the REAL select widget the
// D13 leg drives) calls it in a mount effect. Same test-side stub the
// VendorPdfReviewPage test suites use.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

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
 * fallback the knowledge ui.yaml takes). WITNESS: the real projection builder
 * `projectRecord` (server/src/ui/EditorProjectionService.ts) — it emits slot
 * ids `slot-<path>` and forwards the `items` hints it carries (:96). The
 * live :3092 stack was NOT a witness for this lane's YAML: it serves the
 * TRUNK yaml (tsx --watch does not reload YAML), so no lane ui.yaml was ever
 * loaded by a running stack (review cycle 2, D14).
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
  // GC-16 FIX RUN 3 (D12): optional delay (ms) for the GET /schemas/:id mock —
  // the spine race legs hold the schema document unresolved while the form is
  // already rendered and submit is clicked.
  schemaDocDelay: 0 as number,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    // The served registry metadata (GET /schemas) — the knowledge triplet
    // PLUS the spine kinds (GC-16 FIX RUN 3, D12: the race leg resolves
    // experiment through the served registry — the D5 primary path).
    getSchemas: vi.fn(() =>
      Promise.resolve(
        (
          [
            ['assertion', 'knowledge'],
            ['claim', 'knowledge'],
            ['evidence', 'knowledge'],
            ['study', 'studies'],
            ['experiment', 'studies'],
            ['run', 'studies'],
          ] as Array<[string, string]>
        ).map(([kind, dir]) => ({
          id: sid(kind),
          path: `${dir}/${kind}.schema.yaml`,
          title: kind,
        })),
      ),
    ),
    // GC-16 FIX RUN 2 (defect 1/4/9): the served schema DOCUMENT (GET
    // /schemas/:id) — the REAL schema/<dir>/<kind>.schema.yaml (knowledge
    // triplet from schema/knowledge/, spine from schema/studies/ — the D12
    // leg), so the panel's schema-driven gates (shortSlug? title-required?)
    // see the real shapes. Respects mocked.schemaDocDelay (D12 race legs
    // hold the document unresolved while the form is already rendered).
    getSchema: vi.fn((schemaId: string) => {
      const base = String(schemaId).split('/').pop() ?? ''
      const kind = base.replace(/\.schema\.yaml$/, '')
      const dir = kind === 'study' || kind === 'experiment' || kind === 'run' ? 'studies' : 'knowledge'
      const doc = yaml.parse(readFileSync(join(SCHEMA_ROOT, dir, `${kind}.schema.yaml`), 'utf-8'))
      const result = { id: schemaId, path: `${dir}/${kind}.schema.yaml`, title: kind, schema: doc }
      return mocked.schemaDocDelay > 0
        ? new Promise((res) => setTimeout(() => res(result), mocked.schemaDocDelay))
        : Promise.resolve(result)
    }),
    // The REAL editor-draft shape, built from the REAL ui.yaml — the
    // projection the REAL editor renders IS the real binding.
    // The panel calls getEditorDraftProjection(SCHEMA_IDS[kind]) — the FULL
    // registry id — so derive the kind from the basename. Spine kinds get a
    // MINIMAL projection (GC-16 FIX RUN 3, D12): the race under test is the
    // panel's schemaDoc-driven shortSlug decision — not the spine's slot
    // authoring (the real spine ui.yaml's chips/ref slots need suggestion
    // services the create panel does not use in this leg).
    getEditorDraftProjection: vi.fn((schemaId: string) => {
      const base = String(schemaId).split('/').pop() ?? ''
      const kind = base.replace(/\.schema\.yaml$/, '')
      const spine = kind === 'study' || kind === 'experiment' || kind === 'run'
      const projection = spine
        ? {
            schemaId: sid(kind),
            recordId: '__draft__',
            title: 'New record',
            blocks: [{ id: 'b1', kind: 'section', label: 'Body', slotIds: ['slot-recordId', 'slot-title'] }],
            slots: [
              { id: 'slot-recordId', path: '$.recordId', label: 'Record ID', widget: 'text', readOnly: true },
              { id: 'slot-title', path: '$.title', label: 'Title', widget: 'text' },
            ],
            diagnostics: [],
          }
        : projectionForUi(kind)
      return Promise.resolve(projection)
    }),
    createRecord: vi.fn((schemaId: string, payload: Record<string, unknown>) => {
      mocked.createCalls.push([schemaId, payload])
      return Promise.resolve({ recordId: payload.recordId ?? payload.id })
    }),
  },
  // The real client barrel also exports describeApiError (used by the panel).
  describeApiError: (e: unknown) => String(e),
}))

beforeEach(() => {
  mocked.schemaDocDelay = 0
})

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

// =====================================================================
// GC-16 FIX RUN 3 D10 + D13 — the $.id slot is authorable through the
// REAL form (RED at c924b93a: assertion.ui.yaml / claim.ui.yaml declare
// `readonly: true` on $.id, so the real form renders the row
// data-read-only=true, NO input can open, and the captured payload
// carries no id — while the client no longer mints knowledge ids (D4
// provisional D-A). That is exactly the dead door the review's
// real-render probe proved.
//
// D13: the D6 leg in RecordCreatePanel.gc16.test.tsx injects the
// author's id through a MOCKED editor (mocked.authorUpdate) — that leg
// now states the injection explicitly, and THIS real-form leg pins the
// same acceptance criterion ("the form exposes the schema-declared id
// field to the author") on the REAL projection path (real taptab
// editor, real ui.yaml projection, real serializer).
// =====================================================================

/** Drive the REAL text slot's click-to-edit → commit (the FieldRow
 *  contract: clicking the value span opens the inline input; Enter
 *  commits. A readonly slot renders NO input — that is the RED). */
function commitTextSlot(row: HTMLElement, value: string): void {
  const valueEl = row.querySelector('.taptab-widget-value')
  expect(valueEl, 'the slot must render the taptab value span').toBeTruthy()
  act(() => {
    fireEvent.click(valueEl!)
  })
  const input = row.querySelector('input.taptab-inline-input')
  expect(
    input,
    'clicking an EDITABLE slot must open the inline input (a readonly slot renders none — the D10 RED)',
  ).toBeTruthy()
  act(() => {
    fireEvent.change(input!, { target: { value } })
    fireEvent.keyDown(input!, { key: 'Enter' })
  })
}

/** Drive the REAL select slot's click → option commit (EnumCombobox:
 *  click the value span, click the option row). */
function commitSelectSlot(row: HTMLElement, optionLabel: string): void {
  const valueEl = row.querySelector('.taptab-widget-value')
  expect(valueEl, 'the slot must render the taptab value span').toBeTruthy()
  act(() => {
    fireEvent.click(valueEl!)
  })
  const option = screen.getByText(optionLabel)
  act(() => {
    fireEvent.click(option)
  })
}

/** The create form's submit (no array-widget commits in these legs, so
 *  the captured create IS the submit — no settle-and-requery needed). */
function submitCreate(): void {
  const form = screen.getByTestId('record-create-panel').querySelector('form')
  expect(form, 'the create panel renders a form').toBeTruthy()
  act(() => {
    fireEvent.submit(form!)
  })
}

describe('GC-16 FIX RUN 3 D10 + D13 — the $.id slot is authorable through the REAL form', () => {
  it.each(['assertion', 'claim'] as const)(
    '%s: the $.id slot projects EDITABLE (data-read-only=false), the author commits the id through the real input, and the captured payload carries it (RED at c924b93a: readonly: true → no input, no id in the payload)',
    async (kind) => {
      render(<RecordCreatePanel nodeType={kind} draftTitle="fix3 leg" onCreated={() => {}} />)
      const row = await waitFor(() => findRow('ID'), { timeout: 8000 })
      expect(
        row.getAttribute('data-read-only'),
        `${kind}.ui.yaml must NOT declare readonly on $.id — the schema requires the author to supply it and the client no longer mints knowledge ids (D4 provisional D-A)`,
      ).toBe('false')
      // Drive the REAL input: the author commits the stable identifier.
      commitTextSlot(row, kind === 'assertion' ? 'ASN-FIX3' : 'CLM-FIX3')
      submitCreate()
      await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
      const [, payload] = mocked.createCalls[0]
      expect(
        payload.id,
        'the captured payload must carry the AUTHOR-committed id (no client mint)',
      ).toBe(kind === 'assertion' ? 'ASN-FIX3' : 'CLM-FIX3')
    },
    20000,
  )

  it('D13: the REAL-form assertion payload (id + scope authored through the real inputs, real serializer) is VALID against the REAL assertion.schema.yaml — the acceptance criterion on the real projection path, not the mocked editor', async () => {
    render(
      <RecordCreatePanel nodeType="assertion" draftTitle="real form assertion" onCreated={() => {}} />,
    )
    const idRow = await waitFor(() => findRow('ID'), { timeout: 8000 })
    commitTextSlot(idRow, 'ASN-FIX3-1')
    // Fresh row query (the commit re-rendered the editor): author the
    // schema-required scope through the real select.
    const scopeRow = findRow('Scope (canonical assertion shape)')
    commitSelectSlot(scopeRow, 'Global')
    // Author nothing else — a minimal global assertion is exactly
    // { kind, id, scope } (+ the title seed); the serializer writes the
    // rest as empties and the panel strips them.
    submitCreate()
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
    const [, payload] = mocked.createCalls[0]
    const ajv = loadKnowledgeAjv()
    const errors = ajvErrorsFor(ajv, 'assertion', payload)
    console.log(
      'D13 RAW AJV (real-form assertion payload):',
      JSON.stringify(payload),
      JSON.stringify(errors),
    )
    expect(
      errors,
      'the REAL-form assertion payload (author-supplied id + scope via the real inputs) must be VALID against the REAL assertion.schema.yaml',
    ).toEqual([])
  }, 20000)
})

// =====================================================================
// GC-16 FIX RUN 3 D12 — the spine submit is gated on the schema document
// (the shortSlug race, RED at c924b93a): the D1 schema-driven shortSlug
// decision is gated on the ASYNC GET /schemas/:id, but submit was not
// gated on it — submitting while the document is in flight posts a spine
// payload WITHOUT the schema-required shortSlug (the review's RACE
// PAYLOAD, rejected by the REAL experiment.schema.yaml).
// =====================================================================

describe('GC-16 FIX RUN 3 D12 — spine submit waits for the schema document (shortSlug race)', () => {
  it('spine (experiment): an early submit (schema doc still in flight) is REFUSED — no create; after the doc resolves the retry posts a shortSlug-carrying payload VALID against the REAL experiment.schema.yaml (RED at c924b93a: the early submit posts the payload WITHOUT the required shortSlug)', async () => {
    mocked.schemaDocDelay = 300
    render(
      <RecordCreatePanel nodeType="experiment" studyId="STU-1" draftTitle="my experiment" onCreated={() => {}} />,
    )
    // The form renders (the projection does not depend on the schema doc)
    // while GET /schemas/:id is still in flight.
    await waitFor(() => findRow('Title'), { timeout: 8000 })
    submitCreate()
    await new Promise((r) => setTimeout(r, 100))
    expect(
      mocked.createCalls,
      'a submit while the schema document is unresolved must NOT post — the spine identity field shortSlug is client-decided from the doc, and "unknown" must not be treated as "not declared" (the schema requires it)',
    ).toEqual([])
    expect(
      screen.getByTestId('record-create-panel').textContent,
      'the refusal must name the in-flight schema document',
    ).toMatch(/schema document/i)
    // The document resolves (300ms delay) — retry and capture the payload.
    await new Promise((r) => setTimeout(r, 900))
    submitCreate()
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1), { timeout: 8000 })
    const [, payload] = mocked.createCalls[0]
    expect(
      typeof payload.shortSlug,
      'the schema-required shortSlug must be stamped once the doc has resolved',
    ).toBe('string')
    const ajv = loadKnowledgeAjv()
    const errors = ajvErrorsFor(ajv, 'experiment', payload)
    console.log(
      'D12 RAW AJV (spine payload after doc resolve):',
      JSON.stringify(payload),
      JSON.stringify(errors),
    )
    expect(
      errors,
      'the captured spine payload must be VALID against the REAL experiment.schema.yaml',
    ).toEqual([])
  }, 20000)
})
