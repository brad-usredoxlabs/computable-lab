/**
 * WIDGET-R1 fix-run 2 (D2 + D4, architect ruling ARCHD2L1T1335, DECISION:
 * OPT-A) — nested-object authoring in the taptab ObjectWidget.
 *
 * The defect (A7b browser-gate receipts 20261030T125317, D2): the REAL
 * assertion.ui.yaml `$.roles` item-hint declares `role_ref` / `context_ref`
 * as NESTED object sub-fields (`widget: object` with their own `fields`:
 * kind select / type / id). The widget layer flattened them to plain text
 * inputs (shots 36 / 43), so the author could only commit STRINGS into
 * ref-object positions → 422 `Expected type: object`.
 *
 * The fix is GENERIC and HINT-SHAPE-DRIVEN (ruling step 3): ObjectWidget
 * branches ONLY on a non-empty `fields` member of a property (never on
 * widget/field names, no new widget kind) and renders the nested property
 * through ANOTHER ObjectWidget. Recursion depth is data-driven. The seed
 * (seedItemFromHint) is UNCHANGED — it seeds top-level fields only; the
 * nested inner fields render blank for the author to fill.
 *
 * Legs:
 *   (a) roles-shaped hint (READ FROM THE REAL assertion.ui.yaml — no
 *       hand-invented fixture) authors {role_ref:{kind,type,id},
 *       context_ref:{kind,type,id}} — the commit is OBJECT-valued (the D2
 *       contract: never strings), and the full assertion record carrying
 *       it is Ajv-clean against the REAL assertion.schema.yaml payload
 *       (Ajv pattern mirrored from
 *       RecordCreatePanel.gc16-widget-commit.test.tsx).
 *   (b) behavior-preservation pin: a flat-props ObjectWidget (NO nested
 *       fields) renders and commits EXACTLY as pre-change (GREEN both
 *       before and after the fix — the branch is on non-empty `fields`).
 *   (c) D4: the item editor's Done button (`.taptab-object-done`) carries
 *       an explicit type="button" and does NOT submit the enclosing form
 *       (gate trail step 72 measured {"doneButtonExists":true,
 *       "doneButtonType":null}; a typeless button in the create <form>
 *       defaults to type="submit" — keyboard activation would fire a
 *       duplicate record create).
 *   (d) depth-2 leg (ruling: "verify rendering correctness at depth 2"):
 *       a hint whose nested field ITSELF has fields renders three levels
 *       (array editor → item ObjectWidget editor → nested ObjectWidget
 *       editor) and commits nested objects correctly.
 *
 * RED at base (bc8a4e10): the ArrayWidget item-hint map drops the nested
 * `fields`, so the item's ObjectWidget renders FLAT text inputs only —
 * leg (a) finds no nested object value spans (the gate's shot-36 shape),
 * leg (c) finds a typeless Done button, leg (d) has no second object
 * editor level. GREEN after the recursion + type="button" fix. Leg (b)
 * is GREEN at base (behavior-preservation pin, not a RED leg).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import yaml from 'yaml'
import Ajv2020Module from 'ajv/dist/2020.js'
import { ArrayWidget } from './ArrayWidget'
import { ObjectWidget } from './ObjectWidget'
import type { ObjectFieldConfig } from '../types'

const Ajv2020 = (Ajv2020Module as unknown as { default: typeof Ajv2020Module }).default

// W2 part 2 — the ref sub-field renders the EXISTING picker machinery
// (RefCombobox over the /resolve spine). Mock the two search hooks the same
// way RefCombobox.test.tsx does — one local result + one ontology candidate —
// so the picker is driven deterministically (the mocks are module-scoped; the
// other legs in this file use flat inputs / nested objects and never render a
// ref picker, so they are unaffected).
vi.mock('../../../shared/hooks/useTagSuggestions', () => ({
  useTagSuggestions: vi.fn((_opts: { query: string; field: string; enabled?: boolean }) => ({
    suggestions: [{ value: 'local-term-a', count: 1, source: 'local' as const }],
    loading: false,
    error: null,
  })),
}))
vi.mock('../../hooks/useResolveOntology', () => ({
  useResolveOntology: vi.fn((_opts: { query: string; enabled?: boolean }) => ({
    results: [
      {
        // OBO-shaped resolve result (the /resolve spine returns the
        // CURIE + the IRI whose obo: tail carries it) — the canonical
        // derivation the shared commitRefSelection applies is the IRI-tail
        // branch; a hyphenated CURIE string would fall through to the
        // label-slug branch (a different id) and is not what the spine
        // returns.
        curie: 'TESTNS:test_compound',
        label: 'Test compound',
        namespace: 'TESTNS',
        tier: 2 as const,
        level: 'concept' as const,
        score: 1,
        source: 'oak' as const,
        uri: 'http://purl.obolibrary.org/obo/TESTNS_test_compound',
      },
    ],
    loading: false,
    fromCache: false,
  })),
}))

const SCHEMA_ROOT = resolve(process.cwd(), '..', 'schema')

/** Walk schema/** for .schema.yaml and register every $id (mirrors the
 *  server's Ajv registration; cross-file $refs resolve by $id). Mirrored
 *  from RecordCreatePanel.gc16-widget-commit.test.tsx. */
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

/** The REAL assertion.ui.yaml `$.roles` slot's `items` member — the
 *  roles-shaped item-hint exactly as the projection serves it (the data
 *  leg IS the real ui.yaml, read first-hand; no hand-invented fixture). */
function realRolesItemHint() {
  const ui = yaml.parse(
    readFileSync(resolve(SCHEMA_ROOT, 'knowledge', 'assertion.ui.yaml'), 'utf-8'),
  ) as { form: { sections: Array<{ title: string; fields: Array<Record<string, unknown>> }> } }
  for (const section of ui.form.sections) {
    for (const field of section.fields) {
      if (field.path === '$.roles') {
        const items = field.items as Record<string, unknown>
        expect(items, 'assertion.ui.yaml $.roles must declare an items hint').toBeTruthy()
        expect(
          Array.isArray(items.fields) && (items.fields as unknown[]).length > 0,
          'the roles item hint must declare sub-fields',
        ).toBe(true)
        return items
      }
    }
  }
  throw new Error('assertion.ui.yaml declares no $.roles slot')
}

/** Open the array widget's edit mode (click the value span). */
function openArrayEditor(root: HTMLElement): void {
  const value = root.querySelector('.taptab-array-value')
  expect(value, 'the array widget must render its value span').toBeTruthy()
  act(() => {
    fireEvent.click(value as HTMLElement)
  })
  expect(
    root.querySelector('.taptab-array-editor'),
    'clicking the array value must open the edit mode',
  ).toBeTruthy()
}

/** Click the array widget's "+ Add item" affordance. */
function addArrayItem(root: HTMLElement): void {
  const add = root.querySelector('.taptab-array-add')
  expect(add, 'the array widget must expose the Add item affordance').toBeTruthy()
  act(() => {
    fireEvent.click(add as HTMLElement)
  })
}

/** Open an ObjectWidget's edit mode (click its value span). */
function openObjectEditor(root: HTMLElement): void {
  const value = root.querySelector('.taptab-object-value')
  expect(value, 'the object widget must render its value span').toBeTruthy()
  act(() => {
    fireEvent.click(value as HTMLElement)
  })
  expect(
    root.querySelector('.taptab-object-editor'),
    'clicking the object value must open the edit mode',
  ).toBeTruthy()
}

/** `.taptab-object-field-input` elements whose field label contains
 *  `label` (labels come from the hint data — never invented). */
function inputsByLabel(root: HTMLElement, label: string): HTMLInputElement[] {
  return Array.from(root.querySelectorAll('.taptab-object-field-input')).filter((el) =>
    (
      el.closest('.taptab-object-field')
        ?.querySelector('.taptab-object-field-label')
        ?.textContent ?? ''
    ).includes(label),
  ) as HTMLInputElement[]
}

/** `.taptab-object-field-select` elements whose field label contains
 *  `label` (GATE-FIX-1 D2: a sub-field whose hint declares `widget: select`
 *  + options renders a native <select>; labels come from the hint data). */
function selectsByLabel(root: HTMLElement, label: string): HTMLSelectElement[] {
  return Array.from(root.querySelectorAll('.taptab-object-field-select')).filter((el) =>
    (
      el.closest('.taptab-object-field')
        ?.querySelector('.taptab-object-field-label')
        ?.textContent ?? ''
    ).includes(label),
  ) as HTMLSelectElement[]
}

/** The last array-level commit (every sub-field commit funnels through
 *  the item's onCommit → the array's onCommit, so the last call IS the
 *  current committed array). */
function lastArrayCommit(onCommit: ReturnType<typeof vi.fn>): unknown {
  return onCommit.mock.calls[onCommit.mock.calls.length - 1][0]
}

describe('ObjectWidget nested-object authoring (WIDGET-R1 fix-run 2, D2 + D4)', () => {
  afterEach(cleanup)

  it('(a) the REAL roles-shaped hint authors OBJECT-valued ref objects — {role_ref:{kind,type,id}, context_ref:{...}} — and the full assertion record is Ajv-clean against the REAL schema', () => {
    const itemHint = realRolesItemHint()
    const onCommit = vi.fn()
    const view = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
    )
    openArrayEditor(view.container)
    addArrayItem(view.container)
    // THE SEED (pre-existing generic behavior, UNCHANGED by this fix):
    // top-level fields only — a field whose hint widget is `object`
    // (not a single-option select) seeds ''. The nested inner fields are
    // not seeded — they render blank for the author. (The pre-fix
    // flattening produced this SAME seed; the rendering + commit below
    // are what differ.)
    expect(lastArrayCommit(onCommit)).toEqual([
      { role_ref: '', context_ref: '' },
    ])
    // Re-render with the committed (seeded) item, as FieldRow would.
    view.rerender(
      <ArrayWidget value={lastArrayCommit(onCommit)} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
    )
    // Open the item's ObjectWidget edit mode.
    openObjectEditor(view.container)
    // THE D2 RENDERING CONTRACT: inside the item editor, role_ref and
    // context_ref each render a NESTED ObjectWidget (display mode — the
    // author clicks each to open its inner sub-fields). Pre-fix this is
    // TWO flat text inputs (gate shot 36) and there are ZERO nested
    // .taptab-object-value spans here.
    const nestedSpans = view.container.querySelectorAll('.taptab-object-value')
    expect(
      nestedSpans.length,
      'role_ref + context_ref must each render a nested ObjectWidget (display span) inside the item editor',
    ).toBe(2)
    // Helper: re-render with the latest committed value after each sub-
    // field edit — exactly what FieldRow does in the real flow (the
    // controlled inputs then reflect the live committed value).
    const sync = () => {
      view.rerender(
        <ArrayWidget value={lastArrayCommit(onCommit)} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
      )
    }
    // --- role_ref (the first nested editor) ---
    act(() => {
      fireEvent.click(nestedSpans[0] as HTMLElement)
    })
    let kindInputs = selectsByLabel(view.container, 'Kind (ref discriminator — schema-required)')
    expect(kindInputs, 'the open nested editor must expose its kind sub-field select (declared widget: select)').toHaveLength(1)
    act(() => {
      fireEvent.change(kindInputs[0], { target: { value: 'record' } })
    })
    sync()
    // The select re-renders with the LIVE committed value (a nested select
    // that never updates would pin an authoring path that writes dead
    // values).
    expect(selectsByLabel(view.container, 'Kind (ref discriminator — schema-required)')[0].value).toBe('record')
    let roleType = inputsByLabel(view.container, 'Record type (context-role)')
    expect(roleType).toHaveLength(1)
    act(() => {
      fireEvent.change(roleType[0], { target: { value: 'context-role' } })
    })
    sync()
    let roleIds = inputsByLabel(view.container, 'Record ID')
    expect(roleIds, 'only role_ref is open so far → one Record ID input').toHaveLength(1)
    act(() => {
      fireEvent.change(roleIds[0], { target: { value: 'CR-TEST-FIX2-1' } })
    })
    sync()
    // --- context_ref (the second nested editor) ---
    // After the sync, role_ref's widget is in EDIT mode (span replaced by
    // its editor) → exactly ONE .taptab-object-value remains: context_ref.
    const ctxSpan = view.container.querySelectorAll('.taptab-object-value')
    expect(ctxSpan.length, 'context_ref must still render its nested display span').toBe(1)
    act(() => {
      fireEvent.click(ctxSpan[0] as HTMLElement)
    })
    kindInputs = selectsByLabel(view.container, 'Kind (ref discriminator — schema-required)')
    expect(kindInputs, 'both nested editors now open → two kind selects').toHaveLength(2)
    act(() => {
      fireEvent.change(kindInputs[1], { target: { value: 'record' } })
    })
    sync()
    const ctxType = inputsByLabel(view.container, 'Record type (context)')
    expect(ctxType).toHaveLength(1)
    act(() => {
      fireEvent.change(ctxType[0], { target: { value: 'context' } })
    })
    sync()
    const allIds = inputsByLabel(view.container, 'Record ID')
    expect(allIds, 'both nested editors open → two Record ID inputs').toHaveLength(2)
    act(() => {
      fireEvent.change(allIds[1], { target: { value: 'CTX-TEST-FIX2-1' } })
    })
    sync()
    // THREE object-editor levels render at once (item + role_ref +
    // context_ref) — the nested rendering is coherent at every level.
    expect(
      view.container.querySelectorAll('.taptab-object-editor').length,
      'item editor + the two open nested editors must all be present',
    ).toBe(3)
    // THE D2 COMMIT CONTRACT: role_ref / context_ref are OBJECTS, not
    // strings (the gate's 422 was "Expected type: object" for the strings
    // the flat inputs could only produce).
    const lastCommit = lastArrayCommit(onCommit) as Array<Record<string, unknown>>
    expect(lastCommit).toHaveLength(1)
    const item = lastCommit[0]
    expect(item.role_ref).toEqual({ kind: 'record', type: 'context-role', id: 'CR-TEST-FIX2-1' })
    expect(item.context_ref).toEqual({ kind: 'record', type: 'context', id: 'CTX-TEST-FIX2-1' })
    expect(typeof item.role_ref).toBe('object')
    expect(typeof item.context_ref).toBe('object')
    expect(item).not.toEqual(expect.objectContaining({ role_ref: expect.any(String) }))
    // Ajv-clean against the REAL assertion.schema.yaml payload (pattern
    // mirrored from RecordCreatePanel.gc16-widget-commit.test.tsx). The
    // ref schema's kind:"record" then-requires BOTH type and id — the
    // widget-authored objects carry them; context_refs carries a matching
    // record ref (the roles binding's context_ref points INTO it).
    const record: Record<string, unknown> = {
      kind: 'assertion',
      id: 'ASN-R1-FIX2-PROBE',
      scope: 'single_context',
      context_refs: [{ kind: 'record', type: 'context', id: 'CTX-TEST-FIX2-1' }],
      roles: lastCommit,
    }
    const errors = ajvErrorsFor(loadKnowledgeAjv(), 'assertion', record)
    expect(
      errors,
      `the widget-authored record must be Ajv-clean: ${JSON.stringify(errors)}`,
    ).toEqual([])
  })

  it('(b) behavior-preservation pin: a flat-props ObjectWidget (NO nested fields) renders and commits EXACTLY as pre-change (GREEN before AND after the fix)', () => {
    const properties: ObjectFieldConfig[] = [
      { name: 'alpha', widget: 'text', label: 'Alpha', required: true },
      {
        name: 'beta',
        widget: 'select',
        label: 'Beta',
        options: [
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ],
      },
    ]
    const onCommit = vi.fn()
    // Display mode: label + value rows, EXACTLY the pre-change shape.
    const display = render(
      <ObjectWidget
        value={{ alpha: 'A1', beta: 'two' }}
        widget="object"
        properties={properties}
        readOnly={false}
        onCommit={onCommit}
      />,
    )
    expect(display.container.querySelector('.taptab-object-value')).toBeTruthy()
    const displayRows = display.container.querySelectorAll('.taptab-object-property')
    expect(displayRows).toHaveLength(2)
    expect(display.container.textContent).toContain('Alpha:')
    expect(display.container.textContent).toContain('A1')
    expect(display.container.textContent).toContain('Beta:')
    expect(display.container.textContent).toContain('two')
    // Edit mode: the declared-widget dispatch (GATE-FIX-1 D2): `alpha`
    // (text) renders a text input; `beta` (select with options) renders a
    // native <select> with exactly its declared options (NO nesting — the
    // branch is on non-empty `fields`, and these properties have none).
    act(() => {
      fireEvent.click(display.container.querySelector('.taptab-object-value') as HTMLElement)
    })
    const inputs = display.container.querySelectorAll('.taptab-object-field-input')
    expect(
      inputs,
      'the options-less text sub-field must render its flat input path',
    ).toHaveLength(1)
    const selects = Array.from(display.container.querySelectorAll('.taptab-object-field-select')) as HTMLSelectElement[]
    expect(
      selects,
      'the declared select sub-field must render a <select> with exactly its declared options',
    ).toHaveLength(1)
    expect(Array.from(selects[0]!.options).map((o) => o.value)).toEqual(['one', 'two'])
    expect(display.container.querySelectorAll('.taptab-object-editor')).toHaveLength(1)
    // A sub-field edit commits the WHOLE object with the changed value
    // (the pre-change handleFieldChange contract, untouched) — driven
    // through BOTH control kinds.
    act(() => {
      fireEvent.change(inputs[0] as HTMLInputElement, { target: { value: 'A2' } })
    })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toEqual({ alpha: 'A2', beta: 'two' })
    // Re-render with the committed value (the controlled prop — the other
    // legs' sync() convention) before the second commit.
    const alphaFirst = onCommit.mock.calls[0][0] as Record<string, unknown>
    display.rerender(
      <ObjectWidget
        value={alphaFirst}
        widget="object"
        properties={properties}
        readOnly={false}
        onCommit={onCommit}
      />,
    )
    act(() => {
      fireEvent.change((Array.from(display.container.querySelectorAll('.taptab-object-field-select')) as HTMLSelectElement[])[0]!, { target: { value: 'one' } })
    })
    expect(onCommit).toHaveBeenCalledTimes(2)
    expect(onCommit.mock.calls[1][0]).toEqual({ alpha: 'A2', beta: 'one' })
  })

  it('(c) the item editor Done button (.taptab-object-done) carries type="button" and does NOT submit the enclosing form (D4)', () => {
    const onCommit = vi.fn()
    const onFormSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const { container } = render(
      <form onSubmit={onFormSubmit} data-testid="wrap-form">
        <ObjectWidget
          value={{ a: '1' }}
          widget="object"
          properties={[{ name: 'a', widget: 'text', label: 'A' }]}
          readOnly={false}
          onCommit={onCommit}
        />
      </form>,
    )
    openObjectEditor(container)
    const done = container.querySelector('.taptab-object-done')
    expect(done, 'the object editor must render its Done button').toBeTruthy()
    // D4 (gate trail step 72 measured doneButtonType: null): a typeless
    // button inside the create <form> defaults to type="submit"; keyboard
    // activation (focus + Enter/Space) bypasses the taptab mousedown
    // suppression and would fire a duplicate record create.
    expect(done?.getAttribute('type')).toBe('button')
    // Clicking Done must NOT submit the enclosing form.
    act(() => {
      fireEvent.click(done as HTMLElement)
    })
    expect(
      onFormSubmit,
      'the Done button must NOT submit the enclosing form',
    ).not.toHaveBeenCalled()
  })

  it('(d) depth-2: a hint whose nested field ITSELF has fields renders three levels and commits nested objects correctly (ruling: "verify rendering correctness at depth 2")', () => {
    // Generic depth-2 shape — no field/kind names in the WIDGET; the
    // hint data drives the recursion.
    const itemHint = {
      path: '$.item',
      widget: 'object',
      label: 'Depth2 item',
      fields: [
        {
          path: 'nested',
          widget: 'object',
          label: 'Nested block',
          fields: [
            {
              path: 'kind',
              widget: 'select',
              label: 'Discriminator',
              options: [{ value: 'record', label: 'Record' }],
            },
            { path: 'inner', widget: 'text', label: 'Inner value' },
          ],
        },
      ],
    }
    const onCommit = vi.fn()
    const view = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
    )
    openArrayEditor(view.container)
    addArrayItem(view.container)
    // Seed (unchanged, top-level only): the depth-1 field with its own
    // `fields` seeds '' (its widget is `object`, not a single-option
    // select) — the inner fields render blank for the author.
    expect(lastArrayCommit(onCommit)).toEqual([{ nested: '' }])
    view.rerender(
      <ArrayWidget value={lastArrayCommit(onCommit)} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
    )
    // Open the item editor (level 1).
    openObjectEditor(view.container)
    // Level 2 renders inside level 1 (the nested display span).
    const nestedSpan = view.container.querySelectorAll('.taptab-object-value')
    expect(
      nestedSpan.length,
      'the nested field must render its own ObjectWidget display span inside the item editor',
    ).toBe(1)
    act(() => {
      fireEvent.click(nestedSpan[0] as HTMLElement)
    })
    // THREE levels render at once: array editor → item ObjectWidget
    // editor → nested ObjectWidget editor.
    expect(view.container.querySelectorAll('.taptab-array-editor')).toHaveLength(1)
    expect(
      view.container.querySelectorAll('.taptab-object-editor'),
      'level 1 (item) + level 2 (nested) editors',
    ).toHaveLength(2)
    const kindSelects = selectsByLabel(view.container, 'Discriminator')
    expect(kindSelects).toHaveLength(1)
    const sync = () => {
      view.rerender(
        <ArrayWidget value={lastArrayCommit(onCommit)} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
      )
    }
    act(() => {
      fireEvent.change(kindSelects[0], { target: { value: 'record' } })
    })
    sync()
    expect(
      selectsByLabel(view.container, 'Discriminator')[0].value,
      'the level-2 select must re-render with the live value',
    ).toBe('record')
    const inner = inputsByLabel(view.container, 'Inner value')
    expect(inner).toHaveLength(1)
    act(() => {
      fireEvent.change(inner[0], { target: { value: 'x' } })
    })
    sync()
    // Commit: the nested field is an OBJECT, composed across edits
    // (each edit re-reads the committed value — no lost updates).
    const lastCommit = lastArrayCommit(onCommit) as Array<Record<string, unknown>>
    expect(lastCommit[0]).toEqual({ nested: { kind: 'record', inner: 'x' } })
    const nested = lastCommit[0].nested
    expect(typeof nested).toBe('object')
    expect(Object.keys(nested as object).sort()).toEqual(['inner', 'kind'])
  })

  it('(e) W2 part 2: a `widget: ref` item sub-field renders the EXISTING ref picker (RefCombobox over the /resolve spine) — NEVER a free-text input — and commits the canonical ontology ref OBJECT', () => {
    // A minimal item hint carrying ONE ref sub-field (no field/kind names
    // from the domain — the branch under test is on the DECLARED widget
    // `ref`, not on any field name). The ref sub-field's declared props carry
    // the ontology-ref suggestion shape (the 'ols' source turns on the
    // /resolve spine; valueShape ontology-ref commits the canonical object).
    const itemHint = {
      path: '$.item',
      widget: 'object',
      label: 'Ref item',
      fields: [
        { path: 'name', widget: 'text', label: 'Name', required: true },
        {
          path: 'target_ref',
          widget: 'ref',
          label: 'Target reference',
          required: true,
          props: {
            sources: ['local', 'ols'],
            valueShape: 'ontology-ref',
            ontologyBinding: 'allow-ontology',
          },
        },
      ],
    }
    const onCommit = vi.fn()
    const view = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
    )
    openArrayEditor(view.container)
    addArrayItem(view.container)
    // THE SEED (part 2, C2): a ref sub-field is seeded ABSENT (its key is not
    // present), not '' — '' into a ref-object position is schema-invalid
    // (the QMS-6E "Expected type: object" 422). The flat text sub-field
    // seeds '' as before (behavior preserved for non-ref sub-fields).
    const seeded = lastArrayCommit(onCommit) as Array<Record<string, unknown>>
    expect(seeded).toHaveLength(1)
    expect(seeded[0].name).toBe('')
    expect(
      'target_ref' in seeded[0],
      'the ref sub-field must be ABSENT from the seed (never "")',
    ).toBe(false)
    // Re-render with the committed (seeded) item, as FieldRow would.
    view.rerender(
      <ArrayWidget value={lastArrayCommit(onCommit)} widget="array" readOnly={false} onCommit={onCommit} itemHint={itemHint} />,
    )
    openObjectEditor(view.container)
    // THE PART-2 RENDERING CONTRACT: the ref sub-field renders the EXISTING
    // RefCombobox picker (the ref-combobox container), NOT a flat
    // .taptab-object-field-input text input. The flat `name` sub-field STILL
    // renders its text input (the non-ref path is byte-identical).
    const flatInputs = view.container.querySelectorAll('.taptab-object-field-input')
    expect(
      flatInputs,
      'only the flat text sub-field renders a text input — the ref sub-field renders the picker',
    ).toHaveLength(1)
    expect(
      (flatInputs[0]?.closest('.taptab-object-field')?.querySelector('.taptab-object-field-label')?.textContent ?? ''),
      'the one text input is the flat sub-field (name)',
    ).toContain('Name')
    const refCombobox = view.container.querySelector('.ref-combobox')
    expect(
      refCombobox,
      'the ref sub-field must render the EXISTING RefCombobox picker (never free text)',
    ).toBeTruthy()
    // Navigate the picker: skip the single local result, commit the ontology
    // candidate (the /resolve spine hit the mocked useResolveOntology serves).
    const input = refCombobox!.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: 'compound' } })
    })
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // local result
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // ontology candidate
    fireEvent.keyDown(input, { key: 'Enter' })
    // THE PART-2 COMMIT CONTRACT: the picker commits the canonical ontology
    // ref OBJECT (the datatypes/ref ontology shape: kind:ontology +
    // namespace + id(CURIE) + label + uri) — never a free-text string, never
    // a bare CURIE string. The whole item object is spliced back (the name
    // sub-field's seeded '' survives the splice).
    const lastCommit = lastArrayCommit(onCommit) as Array<Record<string, unknown>>
    expect(lastCommit).toHaveLength(1)
    const committed = lastCommit[0]
    const refValue = committed.target_ref
    expect(typeof refValue, 'the committed ref is an OBJECT, not a string').toBe('object')
    expect(refValue).toEqual({
      kind: 'ontology',
      id: 'TESTNS:test_compound',
      namespace: 'TESTNS',
      label: 'Test compound',
      uri: 'http://purl.obolibrary.org/obo/TESTNS_test_compound',
    })
  })
})
