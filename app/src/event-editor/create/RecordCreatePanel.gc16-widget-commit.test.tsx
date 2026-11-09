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
 * FLIP (WIDGET-R1 — the D2/D3 gap is now CLOSED for the flat ref arrays):
 *   The taptab `array` widget is now AUTHORABLE for a typed item-hint:
 *   "+ Add item" seeds an item from the hint's field set (never bare `{}`),
 *   and each item renders authorable sub-fields by REUSING the existing
 *   ObjectWidget. The datatypes/ref `kind` discriminator is seeded from the
 *   hint's single-option select (value "record" — read FROM THE HINT, never
 *   hardcoded), and type/id/label are authored through the
 *   `.taptab-object-field-input` sub-fields. These authoring legs FILL the
 *   hint sub-fields, submit through the REAL serializer (serializeDocument),
 *   and assert the CAPTURED payload validates under the REAL schema
 *   (`ajvErrorsFor(...) === []`) — no `[{}]` pin, no taptab mock.
 *
 *   SCOPE (honest boundary): the FLAT datatypes/ref arrays (evidence
 *   supports/refutes/assesses; assertion context_refs) are authorable
 *   in-boundary. The NESTED ref structures (evidence `sources[].ref` — a
 *   record-ref; assertion `roles[].role_ref` / `roles[].context_ref` — ref
 *   objects) are NOT authorable by the flat ObjectWidget in-boundary (it
 *   renders one text input per TOP-LEVEL property, no recursion into nested
 *   objects) — they are supplied per the fix2 control pattern (a hand-carried
 *   schema-valid ref object) and are the A7b nested-authoring residual (an
 *   ObjectWidget change — OUT of WIDGET-R1's file boundary). The evidence
 *   leg's required `sources` is supplied that way; the assertion leg's
 *   optional `roles` is omitted from the widget-authored payload and pinned
 *   in a KEPT hand-carried control.
 *
 *   The projection's UNSUPPORTED_WIDGET for `array` is now CONDITIONAL on a
 *   valid typed item-hint (server/src/ui/EditorProjectionService.ts) — so a
 *   ref array committed through the REAL widget no longer trips the
 *   projection's diagnostic, and validates under the server's own Ajv.
 *
 *   NOTE (bait #5 — TipTap content-memo re-seed): the array sub-field fills
 *   SETTLE (act+flush) between each edit and before submit, so a second
 *   sub-field edit operates on the FRESH committed doc, not a stale re-seed.
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
  // GC-16 FIX RUN 4 (D16): when true the GET /schemas/:id mock REJECTS — the
  // FAILED-fetch arm of the D12 race. A failed fetch must NOT settle as
  // "unavailable → not declared" for the spine: shortSlug is schema-required
  // and client-decided from the document, so a missing document must not
  // justify deleting it (or an author-typed value) before an invalid POST.
  schemaDocFail: false as boolean,
  // GC-16 FIX RUN 5 (D20): when true the GET /schemas/:id mock RESOLVES a
  // 200 whose `schema` field is ABSENT (the client contract
  // SchemaInfo.schema is optional — app/src/types/kernel.ts). A
  // document-less 200 must settle as FAILED, not as "resolved, declares
  // nothing": otherwise the spine's schema-required shortSlug is silently
  // deleted and a shortSlug-less spine POST goes out (the review's PROBE4C).
  schemaDocMissing: false as boolean,
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
      // GC-16 FIX RUN 5 (D20): the document-less 200 arm — RESOLVE a
      // SchemaInfo whose `schema` field is absent (the client contract
      // SchemaInfo.schema is optional; the review's PROBE4C shape).
      if (mocked.schemaDocMissing) {
        const base = String(schemaId).split('/').pop() ?? ''
        const kind = base.replace(/\.schema\.yaml$/, '')
        return Promise.resolve({ id: schemaId, path: `${kind}.schema.yaml`, title: kind })
      }
      // GC-16 FIX RUN 4 (D16): the FAILED-fetch arm — reject the document
      // fetch (the review's PROBE3 shape) instead of resolving it.
      if (mocked.schemaDocFail) {
        return Promise.reject(new Error('schema document fetch failed (D16 leg)'))
      }
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
            blocks: [{ id: 'b1', kind: 'section', label: 'Body', slotIds: ['slot-recordId', 'slot-title', 'slot-shortSlug'] }],
            slots: [
              { id: 'slot-recordId', path: '$.recordId', label: 'Record ID', widget: 'text', readOnly: true },
              { id: 'slot-title', path: '$.title', label: 'Title', widget: 'text' },
              // GC-16 FIX RUN 5 (D21, test fidelity): the REAL server
              // experiment projection exposes an EDITABLE shortSlug slot
              // (schema/studies/experiment.ui.yaml $.shortSlug widget=text,
              // no readonly → readOnly=false; the review's exp-projection.json
              // cites `$.shortSlug: widget=text readOnly=false`). The D16
              // PROBE3B leg is titled for an author-typed shortSlug, so the
              // mock spine projection must expose the same slot — otherwise
              // the leg cannot author the value it claims to pin.
              { id: 'slot-shortSlug', path: '$.shortSlug', label: 'Short Slug', widget: 'text' },
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
  mocked.schemaDocFail = false
  mocked.schemaDocMissing = false
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

/**
 * WIDGET-R1 authoring drive — fill the hint sub-fields of the FIRST item the
 * array widget just seeded (the item renders as an ObjectWidget; clicking its
 * `.taptab-object-value` opens its edit mode with one `.taptab-object-field-input`
 * per hint sub-field). Fills by LABEL (not index — the sub-field set is the
 * hint's field set: kind / type / id / label for a datatypes/ref item).
 *
 * Each fill SETTLES (act + flush) before the next one (bait #5 — the TipTap
 * content-memo re-seed artifact: a rapid second edit re-seeds the doc from
 * stale formData and drops the first). The seed rule (WIDGET-R1 A3) means
 * `kind` is ALREADY "record" (the hint's single-option select value) — the
 * author only fills `type` / `id` / `label`.
 *
 * `row` must be a FRESH query (the add-item commit re-rendered the editor).
 */
async function authorArrayItemSubFields(
  row: HTMLElement,
  fill: Record<string, string>,
): Promise<void> {
  // The add-item commit (called before this) re-rendered the editor; settle
  // so the seeded item's ObjectWidget has rendered before we query it.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120))
  })
  const itemValue = row.querySelector('.taptab-object-value')
  expect(
    itemValue,
    'the seeded array item must render through the ObjectWidget (authorable sub-fields, never bare {})',
  ).toBeTruthy()
  act(() => {
    fireEvent.click(itemValue!)
  })
  const editor = row.querySelector('.taptab-object-editor')
  expect(editor, 'clicking the seeded item must open the ObjectWidget edit mode').toBeTruthy()
  const fields = new Map<string, HTMLInputElement>()
  for (const input of Array.from(row.querySelectorAll('.taptab-object-field-input'))) {
    const label = input
      .closest('.taptab-object-field')
      ?.querySelector('.taptab-object-field-label')
      ?.textContent
    if (label !== undefined) fields.set(label, input as HTMLInputElement)
  }
  for (const [label, value] of Object.entries(fill)) {
    const input = fields.get(label)
    expect(input, `the hint must declare a "${label}" sub-field (authorable through the widget)`).toBeTruthy()
    act(() => {
      fireEvent.change(input!, { target: { value } })
    })
    // SETTLE between sub-field edits (bait #5): a rapid second edit re-seeds
    // the doc from stale formData and drops the first.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120))
    })
  }
}

describe('GC-16 FIX1 D2/D3 + WIDGET-R1 — knowledge array-of-ref fields through the REAL widget path (authoring legs — the D2/D3 gap is closed)', () => {
  it('evidence: the REAL array widget AUTHORS $.supports through the hint sub-fields (kind seeded "record", type/id filled) — the committed ref array validates, and the full record (with the required nested `sources`) is Ajv-clean (FLIP: was [{}]/rejected)', async () => {
    render(
      <RecordCreatePanel nodeType="evidence" draftTitle="bundle supports claim" onCreated={() => {}} />,
    )
    // The REAL taptab editor mounts once registry + projection settle.
    // Author the schema-required knowledge id through the REAL input (the
    // D4 provisional D-A authoring path: the client no longer mints ids).
    const idRow = await waitFor(() => findRow('ID'), { timeout: 8000 })
    commitTextSlot(idRow, 'EVD-1')

    // AUTHOR the flat datatypes/ref array ($.supports) THROUGH the REAL
    // widget: open the array row, "+ Add item" (seeds {kind:'record',type:'',
    // id:'',label:''} from the hint field set — NEVER bare {}), then fill the
    // hint sub-field inputs (type / id — kind is already "record", the
    // hint's single-option select value). This is the WIDGET-R1 deliverable.
    let supportsRow = findRow('Supports (assertion/claim refs)')
    addArrayItem(supportsRow)
    // FRESH row query: the add-item commit re-rendered the editor (and the
    // content-memo re-seed artifact, bait #5, needs a settle first so the
    // committed doc is what the fresh row queries).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })
    supportsRow = findRow('Supports (assertion/claim refs)')
    await authorArrayItemSubFields(supportsRow, {
      'Record type (assertion / claim)': 'claim',
      'Record ID': 'CLM-1',
    })

    // Submit through the REAL serializer (serializeDocument).
    submitCreate()
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
    const [, payload] = mocked.createCalls[0]

    // THE FLIP: the committed supports value is the array widget's OWN
    // commit — a POPULATED datatypes/ref object seeded from the hint field
    // set (kind "record" — read from the hint's single-option select, never
    // hardcoded — with the author's type/id), NOT bare {}.
    expect(payload.supports, 'the widget authored a supports array (never bare {})').toEqual([
      { kind: 'record', type: 'claim', id: 'CLM-1', label: '' },
    ])
    expect(payload.supports).not.toEqual([{}])
    expect(payload.id, 'the author supplies the knowledge id (no client mint)').toBe('EVD-1')

    const ajv = loadKnowledgeAjv()
    // RAW Ajv on the widget-authored record (bait #7 — the review's probe
    // pattern demands the captured payload + its real Ajv result). The
    // widget-authored supports ref VALIDATES; the only residual is the
    // required nested `sources` array (a record-ref the FLAT ObjectWidget
    // cannot author — it renders one text input per TOP-LEVEL property, no
    // recursion; the A7b / ObjectWidget residual, OUT of WIDGET-R1's
    // boundary).
    const rawErrors = ajvErrorsFor(ajv, 'evidence', payload)
    console.log(
      'RAW AJV (evidence supports widget-authored + RAW record):',
      JSON.stringify(payload),
      '=>',
      JSON.stringify(rawErrors),
    )
    // The widget's contribution (the supports ref) is schema-valid: there is
    // NO /supports error (the D2/D3 gap — required kind at /supports/0 — is
    // CLOSED). The only residual is the required nested sources.
    expect(
      rawErrors.some((e) => e.instancePath === '/supports/0'),
      'the widget-authored supports ref must VALIDATE (no /supports/0 error — the D2/D3 gap is closed)',
    ).toBe(false)
    expect(
      rawErrors.some((e) => e.keyword === 'required' && (e.params as { missingProperty?: string })?.missingProperty === 'sources'),
      'the only residual is the required nested `sources` (the flat ObjectWidget cannot author a record-ref — the A7b residual)',
    ).toBe(true)

    // THE GREEN FLIP: the full record — the widget-authored supports PLUS the
    // required nested sources (supplied per the fix2 control pattern; the
    // nested record-ref is the A7b residual) — validates under the REAL
    // schema. ajvErrorsFor === [] on the real captured record.
    const record: Record<string, unknown> = {
      ...payload,
      sources: [{ type: 'result', ref: { kind: 'record', type: 'result', id: 'RES-1' } }],
    }
    delete record.shortSlug
    expect(
      ajvErrorsFor(ajv, 'evidence', record),
      'the widget-authored record (supports via the REAL widget + required nested sources) must be Ajv-clean',
    ).toEqual([])

    // CONTROL (kept — no weakening): a hand-carried schema-valid ref array
    // PASSES the SAME schema. Proves the schema is authorable end-to-end.
    const valid: Record<string, unknown> = {
      ...payload,
      supports: [{ kind: 'record', type: 'claim', id: 'CLM-1' }],
      sources: [{ type: 'result', ref: { kind: 'record', type: 'result', id: 'RES-1' } }],
    }
    delete valid.shortSlug
    expect(
      ajvErrorsFor(ajv, 'evidence', valid),
      'a hand-carried datatypes/ref array must PASS the REAL schema',
    ).toEqual([])
  }, 20000)

  it('assertion: the REAL array widget AUTHORS $.context_refs through the hint sub-fields (kind seeded "record", type/id filled) — the captured payload (id+scope+context_refs) is Ajv-clean; the nested `roles` residual is kept in a hand-carried control (FLIP: was [{}]/rejected)', async () => {
    // FLIP (WIDGET-R1): the flat datatypes/ref array ($.context_refs) is now
    // AUTHORABLE through the REAL widget — "+ Add item" seeds a ref item from
    // the hint field set (never bare {}), and the hint sub-fields (type / id)
    // are filled through the .taptab-object-field-input inputs. The captured
    // payload (id + scope + context_refs, the schema's required set) is
    // Ajv-clean. The NESTED $.roles array ({role_ref, context_ref} — ref
    // objects) is the A7b residual: the flat ObjectWidget renders one text
    // input per TOP-LEVEL property (no recursion into nested objects) and
    // cannot author a ref object, so roles stays optional-and-omitted in the
    // widget-authored payload and is pinned in the KEPT hand-carried control
    // (an ObjectWidget change is OUT of WIDGET-R1's boundary).
    render(
      <RecordCreatePanel nodeType="assertion" draftTitle="scoped assertion" onCreated={() => {}} />
    )
    // Author the schema-required id + scope through the REAL inputs (the D4
    // provisional D-A authoring path: the client no longer mints ids).
    const idRow = await waitFor(() => findRow('ID'), { timeout: 8000 })
    commitTextSlot(idRow, 'ASN-1')
    // FRESH row query (the commit re-rendered the editor): author the
    // schema-required scope through the real select.
    const scopeRow = findRow('Scope (canonical assertion shape)')
    commitSelectSlot(scopeRow, 'Global')

    // AUTHOR the flat datatypes/ref array ($.context_refs) THROUGH the REAL
    // widget: "+ Add item" (seeds {kind:'record',type:'',id:'',label:''}) +
    // fill the hint sub-fields (type / id — kind is already "record").
    const contextLabel = 'Context refs (the contexts this ranges over)'
    let contextRow = findRow(contextLabel)
    addArrayItem(contextRow)
    contextRow = findRow(contextLabel)
    await authorArrayItemSubFields(contextRow, {
      'Record type (context)': 'context',
      'Record ID': 'CTX-1',
    })

    // Submit through the REAL serializer (serializeDocument). ONE submit —
    // the array-commit buttons are type="button" (the fix-run-2
    // duplicate-POST defect is closed), so no spurious per-commit submits.
    submitCreate()
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1))
    const [, payload] = mocked.createCalls[0]

    // THE FLIP: the committed context_refs value is the array widget's OWN
    // commit — a POPULATED datatypes/ref object seeded from the hint field
    // set (kind "record" — read from the hint's single-option select, never
    // hardcoded — with the author's type/id), NOT bare {}.
    expect(
      payload.context_refs,
      'the widget authored a context_refs array (never bare {})',
    ).toEqual([{ kind: 'record', type: 'context', id: 'CTX-1', label: '' }])
    expect(payload.context_refs).not.toEqual([{}])
    expect(payload.id, 'the author supplies the knowledge id (no client mint)').toBe('ASN-1')
    expect(payload.scope, 'the author supplies the scope (real select)').toBe('global')
    // The nested roles array is NOT widget-authored (the flat ObjectWidget
    // cannot author a nested ref object) — it stays omitted.
    expect(
      'roles' in payload,
      'the flat ObjectWidget does not author the nested roles ref objects (A7b residual — omitted, not [{}])',
    ).toBe(false)

    const ajv = loadKnowledgeAjv()
    // THE GREEN FLIP: the widget-authored record (id + scope + context_refs,
    // the schema's required set) is Ajv-clean under the REAL schema.
    // (The nested roles is optional — a global assertion ranges over no
    // context by definition; the A7b nested-authoring residual is pinned in
    // the KEPT hand-carried control below.)
    const errors = ajvErrorsFor(ajv, 'assertion', payload)
    console.log(
      'RAW AJV (assertion context_refs widget-authored):',
      JSON.stringify(payload),
      '=>',
      JSON.stringify(errors),
    )
    expect(
      errors,
      'the widget-authored assertion record (id+scope+context_refs via the REAL widget) must be Ajv-clean',
    ).toEqual([])
    // And specifically: the D2/D3 gap — required kind at /context_refs/0 —
    // is CLOSED (no /context_refs error).
    expect(
      errors.some((e) => e.instancePath === '/context_refs/0'),
      'the widget-authored context_refs ref must VALIDATE (no /context_refs/0 error — the D2/D3 gap is closed)',
    ).toBe(false)

    // CONTROL (kept — no weakening): a hand-carried schema-valid record with
    // BOTH context_refs AND the nested roles (the A7b residual the flat
    // ObjectWidget cannot author) PASSES the SAME schema. Proves the schema
    // is authorable end-to-end. (The author-supplied id/scope are the D4
    // provisional D-A authoring path.)
    const valid: Record<string, unknown> = {
      ...payload,
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
      'schema-valid context_refs + the nested roles (the A7b residual) must PASS the REAL schema',
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
    // Author the title THROUGH the real input (the review's RACE
    // reproduction types it; the doc node then carries it so the
    // serializer preserves it). draftTitle seeds formData but the doc
    // node starts empty — an untouched field is deleted on serialize.
    const titleRow = findRow('Title')
    commitTextSlot(titleRow, 'my experiment')
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

// =====================================================================
// GC-16 FIX RUN 4 D16 — the FAILED-fetch arm of the D12 race (MAJOR,
// review cycle 3): a REJECTED GET /schemas/:id must not settle as
// "unavailable → not declared" for the spine. At 82044fa4 the .catch
// sets schemaDocFor = schemaId (failure == settled), the
// schemaDeclaresShortSlug flag goes false, the gate passes, and the
// submit path DELETES shortSlug — posting a payload the REAL
// experiment.schema.yaml rejects (required: shortSlug,
// unevaluatedProperties: false), silently, with the author's typed
// value stripped (review probes PROBE3/PROBE3B).
//
// Decision routing: the architect ruling file
// 2026-10-30_lane1-gc16-d16-failed-fetch-shortSlug-decision.md RATIFIED
// Option A (VERDICT: Option A; the A+B hybrid and Option B rejected —
// the ruling's "Why not B" closes the title-required gate B would leave
// open). The provisional Option A shipped at 9bc37179 matches the
// ratified surface (ruling items 1–3: two-flag state, gate order,
// refusal text — verify, do not rework). The ruling's bounded deltas are
// folded into this closing run: delta 4 rewords the refusal
// parenthetical (it overclaimed for `run` — run.schema.yaml requires
// [kind, recordId, status], shortSlug is declared but NOT required —
// while keeping the pinned regexes /schema document
// (could not be loaded|unavailable)/i and /identity fields/i); delta 5
// pins the knowledge-on-failed half (below — the refusal is SPINE-ONLY,
// knowledge payloads stay clean on failure); delta 6 cites this ruling
// instead of "PROVISIONAL / ruling file ABSENT".
// GC-16 FIX RUN 5 (D20): the tri-state's residual hole — a 200 whose
// `schema` field is ABSENT (SchemaInfo.schema is optional) also settles
// as FAILED (document-less success ≠ "resolved, declares nothing"), so
// the document-less-200 leg pins the same named refusal + zero creates.
//
// This leg mirrors the review's independent probe (getSchema rejects;
// spine experiment; title authored THROUGH the real input): submit
// must produce ZERO create calls and a NAMED refusal — the schema
// document could not be loaded, so the identity fields cannot be
// decided (retry affordance named).
// =====================================================================

describe('GC-16 FIX RUN 4 D16 — a FAILED schema-document fetch refuses spine submits (Option A ratified)', () => {
  it('spine (experiment): getSchema REJECTS → submit produces ZERO creates + a named refusal (no silent invalid POST, no stripped author value)', async () => {
    mocked.schemaDocFail = true
    render(
      <RecordCreatePanel
        nodeType="experiment"
        studyId="STU-1"
        draftTitle="my experiment"
        onCreated={() => {}}
      />,
    )
    // The form renders even though the document fetch is failing (the
    // projection does not depend on the document) — the review's probe
    // rendered the real form before submitting.
    await waitFor(() => findRow('Title'), { timeout: 8000 })
    // Author the title THROUGH the real input (the review's probe
    // typed it; the doc node then carries it so the serializer
    // preserves it — exactly the PROBE3 reproduction).
    const titleRow = findRow('Title')
    commitTextSlot(titleRow, 'my experiment')
    // Let the failed fetch settle (the .catch path), then submit.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    submitCreate()
    await new Promise((r) => setTimeout(r, 200))
    // THE DEFECT at 82044fa4: the failed fetch settled as "unavailable",
    // schemaDeclaresShortSlug went false, and the submit executed
    // `delete payload.shortSlug` — posting
    // {"kind","recordId","state","studyId","title"} with NO
    // shortSlug (the review's PROBE3 payload) and no client error.
    expect(
      mocked.createCalls,
      'a FAILED schema-document fetch must NOT post a spine payload — shortSlug is schema-required (experiment.schema.yaml) and client-decided from the document; "unknown" is not "not declared"',
    ).toEqual([])
    const panelText = screen.getByTestId('record-create-panel').textContent
    console.log('D16 RAW (panel text after failed-fetch submit):', panelText)
    expect(
      panelText,
      'the refusal must be NAMED — the schema document could not be loaded, so the identity fields cannot be decided (retry affordance)',
    ).toMatch(/schema document for "[a-z]+" could not be loaded/i)
    expect(panelText).toMatch(/identity fields cannot be decided/i)
    expect(panelText, 'the refusal must name the retry affordance').toMatch(/retry/i)
    // The D12 in-flight refusal (a DIFFERENT named message) must NOT be
    // what fired — the failed arm has its own.
    expect(panelText).not.toMatch(/Loading the schema document/i)
  }, 20000)

  it('spine (experiment): an author-typed shortSlug is NOT stripped before a refused submit (the PROBE3B shape — the author has a remedy only if the refusal is loud)', async () => {
    // The D16 defect's sharpest form (review PROBE3B): even a HAND-TYPED
    // shortSlug was deleted before POST at 82044fa4. With the Option A
    // refusal there is no POST at all — the author's value survives in
    // the form and the named refusal names the retry.
    //
    // GC-16 FIX RUN 5 (D21, cycle-4 test fidelity): the leg is NAMED for an
    // author-typed shortSlug, so it must AUTHOR one — through the REAL
    // editable "Short Slug" slot the experiment projection exposes
    // ($.shortSlug widget=text readOnly=false), not just the title. At
    // HEAD (f3555f8b) the leg passed while typing only the TITLE, so it
    // would have passed even if the panel discarded an author-typed slug.
    mocked.schemaDocFail = true
    render(
      <RecordCreatePanel
        nodeType="experiment"
        studyId="STU-1"
        draftTitle="my experiment"
        onCreated={() => {}}
      />,
    )
    await waitFor(() => findRow('Title'), { timeout: 8000 })
    commitTextSlot(findRow('Title'), 'my experiment')
    // Author the shortSlug THROUGH the real editable slot (the review's
    // PROBE3B acceptance shape — the hand-typed value the 82044fa4 defect
    // deleted before the silent POST).
    commitTextSlot(findRow('Short Slug'), 'my-experiment')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    submitCreate()
    await new Promise((r) => setTimeout(r, 200))
    expect(mocked.createCalls, 'no create on a failed document fetch (spine)').toEqual([])
    const panelText = screen.getByTestId('record-create-panel').textContent
    expect(
      panelText,
      'the refusal must be NAMED (the PROBE3B remedy is the loud refusal itself)',
    ).toMatch(/could not be loaded/i)
    expect(panelText).toMatch(/identity fields/i)
    // The form is still usable: the author's typed values are not
    // destroyed — the title slot still carries what was authored AND the
    // hand-typed shortSlug survives the refusal (no discard of in-flight
    // author edits; no strip of the slug either).
    expect(
      findRow('Title').textContent,
      'the author-typed value must survive the refusal (no discard of in-flight author edits)',
    ).toContain('my experiment')
    expect(
      findRow('Short Slug').textContent,
      'the author-typed shortSlug must survive in the form after the refused submit (the PROBE3B value is the author\'s remedy — stripping it would leave the refusal unrecoverable)',
    ).toContain('my-experiment')
  }, 20000)

  it('spine (experiment): a 200 whose `schema` field is ABSENT (document-less success) settles as FAILED → ZERO creates + named refusal, not a silent shortSlug-less POST (D20 — the review\'s PROBE4C shape)', async () => {
    // GC-16 FIX RUN 5 (D20, cycle-4 MINOR): the tri-state hole. At HEAD
    // (f3555f8b) the fetch .then arm runs `setSchemaDoc(info.schema ??
    // null); setSchemaDocFor(schemaId)` WITHOUT setSchemaDocFailed(true) —
    // SchemaInfo.schema is OPTIONAL (app/src/types/kernel.ts), so a 200
    // whose `schema` field is absent settles as "resolved, declares
    // nothing": schemaDeclaresShortSlug goes false, the gate passes, and
    // the submit path DELETES the spine's schema-required shortSlug — a
    // shortSlug-less spine POST with no client error (the review's
    // PROBE4C: createCalls = [{kind,recordId,state,studyId,title}], no
    // error shown). "Resolved" must always mean "a document arrived".
    mocked.schemaDocMissing = true
    render(
      <RecordCreatePanel
        nodeType="experiment"
        studyId="STU-1"
        draftTitle="my experiment"
        onCreated={() => {}}
      />,
    )
    await waitFor(() => findRow('Title'), { timeout: 8000 })
    commitTextSlot(findRow('Title'), 'my experiment')
    // Let the document-less 200 settle (the .then path), then submit.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    submitCreate()
    await new Promise((r) => setTimeout(r, 200))
    // THE DEFECT at f3555f8b: the document-less 200 settled as
    // "resolved, declares nothing", schemaDeclaresShortSlug went false,
    // and the submit executed `delete payload.shortSlug` — posting
    // {"kind","recordId","state","studyId","title"} with NO shortSlug and
    // no client error (the review's PROBE4C payload).
    expect(
      mocked.createCalls,
      'a document-less 200 must NOT post a spine payload — "resolved" means a document arrived; with no document the identity fields cannot be decided (unknown is not "not declared")',
    ).toEqual([])
    const panelText = screen.getByTestId('record-create-panel').textContent
    console.log('D20 RAW (panel text after document-less-200 submit):', panelText)
    expect(
      panelText,
      'the refusal must be NAMED — the schema document could not be loaded (no document arrived), so the identity fields cannot be decided',
    ).toMatch(/schema document for "[a-z]+" could not be loaded/i)
    expect(panelText).toMatch(/identity fields cannot be decided/i)
    // The D12 in-flight refusal (a DIFFERENT named message) must NOT be
    // what fired — the document DID settle (the 200 arrived); it settled
    // as failed because it carried no schema document.
    expect(panelText).not.toMatch(/Loading the schema document/i)
  }, 20000)

  it('knowledge (assertion): a FAILED schema-document fetch does NOT refuse — submit PROCEEDS (one create), NO "could not be loaded" refusal, and the payload carries NO shortSlug (ruling delta 5 — the refusal is SPINE-ONLY; the delete arm is the D9 outcome; the server\'s required-check speaks)', async () => {
    // RULING DELTA 5 (architect ruling
    // 2026-10-30_lane1-gc16-d16-failed-fetch-shortSlug-decision.md, item 5):
    // every schemaDocFail leg was spine-only — no leg rendered a KNOWLEDGE
    // kind with schemaDocFail: true. The ruling demands the other half be
    // pinned: on a failed fetch a knowledge submit must PROCEED (the D16
    // refusal is SPINE-ONLY, not a global door-shut), show NO "could not
    // be loaded" refusal, and the payload must carry NO shortSlug (the
    // delete arm — the assertion schema is unevaluatedProperties: false and
    // declares no shortSlug, so the delete is the D9-correct outcome; the
    // server's required-check is the visible authority via
    // describeApiError). This leg PASSES at HEAD (f3555f8b) — the D16 gate
    // already keys on isSpine, so the behavior it pins was already correct;
    // it was simply UNPINNED. It is a pin of a ruled surface (the
    // constraint space the ruling names), not a defect reproduction — the
    // RED-first proof in this run is the D20 leg above (which reproduces
    // the review's PROBE4C defect at HEAD and turns green on the D20
    // guard).
    mocked.schemaDocFail = true
    render(
      <RecordCreatePanel nodeType="assertion" draftTitle="fix5 knowledge" onCreated={() => {}} />,
    )
    // The REAL assertion form renders even though the document fetch
    // failed (the projection does not depend on the document) — the author
    // supplies the schema-required id + scope through the real inputs.
    const idRow = await waitFor(() => findRow('ID'), { timeout: 8000 })
    commitTextSlot(idRow, 'ASN-FIX5-KF')
    const scopeRow = findRow('Scope (canonical assertion shape)')
    commitSelectSlot(scopeRow, 'Global')
    // Let the failed fetch settle (the .catch path), then submit.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    submitCreate()
    await waitFor(() => expect(mocked.createCalls).toHaveLength(1), { timeout: 8000 })
    const [, payload] = mocked.createCalls[0]
    // The knowledge submit PROCEEDED (one create) — the D16 refusal is
    // SPINE-ONLY; a failed document is not a global door-shut.
    expect(
      payload.id,
      'the knowledge payload carries the AUTHOR-supplied id (no client mint)',
    ).toBe('ASN-FIX5-KF')
    const panelText = screen.getByTestId('record-create-panel').textContent
    console.log(
      'D16 DELTA5 RAW (knowledge-on-failed payload + panel text):',
      JSON.stringify(payload),
      '|||',
      panelText,
    )
    expect(
      panelText,
      'a knowledge kind on a failed fetch must NOT see the spine refusal (the refusal is SPINE-ONLY)',
    ).not.toMatch(/could not be loaded/i)
    expect(
      'shortSlug' in payload,
      'the knowledge payload must carry NO shortSlug (unevaluatedProperties:false — the delete arm is the D9-correct outcome; the server\'s required-check speaks)',
    ).toBe(false)
  }, 20000)
})
