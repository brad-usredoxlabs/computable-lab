/**
 * WIDGET-R1 (D11/D18 + A3 data legs) — the taptab `array` widget must make
 * `widget: array` + a typed item-hint AUTHORABLE:
 *
 *   1. "+ Add item" seeds an item from the hint's field set — NEVER bare `{}`.
 *      The seed is HINT-DRIVEN and GENERIC (no kind table, no field-name
 *      branch, WIDGET-R1 A3): a `select`/`radio` sub-field whose hint declares
 *      EXACTLY ONE option seeds that option's `value`; every other sub-field
 *      seeds `''`. The merged knowledge ui.yaml item-hints declare the
 *      datatypes/ref `kind` discriminator as a single-option select
 *      (value "record"), so a seeded ref item GENUINELY carries
 *      `kind: "record"` before the author touches it (the value is read FROM
 *      THE HINT — delete the option and the seed degrades; the widget never
 *      hardcodes "record").
 *   2. Each item renders authorable sub-fields by REUSING the existing
 *      ObjectWidget path (the item is an ObjectWidget; clicking it opens its
 *      `.taptab-object-field-input` inputs — one per hint sub-field). Editing
 *      a sub-field splices the whole-object commit back at the item's index.
 *   3. The array-commit buttons (taptab-array-remove / -add / -done) carry an
 *      explicit `type="button"` so that inside the create `<form>` they do NOT
 *      submit the enclosing form (the fix-run-2 duplicate-POST defect): one
 *      submit per authored payload.
 *
 *   4. HINT-LESS arrays keep today's behavior: "+ Add item" still commits `{}`
 *      and the projection keeps its loud UNSUPPORTED_WIDGET diagnostic (a
 *      hint-less array is a spec defect marker — never silenced).
 *
 * RED at base (7f97d8ef): ArrayWidget ignores any item-hint and commits `{}`;
 * it renders no authorable item sub-fields. The unit test below expects the
 * hint-seeded shape and the ObjectWidget sub-field inputs, so it is RED before
 * the widget seed + the props plumbing and GREEN after.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { ArrayWidget } from './ArrayWidget'

// W2 part 2 (OPT-B C2) — the ref sub-field leg renders the EXISTING
// RefCombobox picker; mock the two search hooks the same way
// ObjectWidget.nested.test.tsx does (one local result + one ontology
// candidate) so the picker is driven deterministically. The pre-existing
// legs in this file use a select/text hint (no ref picker renders) and are
// unaffected.
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
        curie: 'TESTNS:hint_compound',
        label: 'Hint compound',
        namespace: 'TESTNS',
        tier: 2 as const,
        level: 'concept' as const,
        score: 1,
        source: 'oak' as const,
        uri: 'http://purl.obolibrary.org/obo/TESTNS_hint_compound',
      },
    ],
    loading: false,
    fromCache: false,
  })),
}))

/** Mirror of the REAL evidence.ui.yaml `$.supports` item-hint (the
 *  datatypes/ref object the schema declares): kind (single-option select,
 *  value "record"), type, id, label. Same shape as assertion.ui.yaml
 *  `$.context_refs`. */
const REF_HINT = {
  path: '$.item',
  widget: 'object',
  label: 'Target ref',
  fields: [
    {
      path: 'kind',
      widget: 'select',
      label: 'Kind (ref discriminator)',
      options: [{ value: 'record', label: 'Record' }],
    },
    { path: 'type', widget: 'text', label: 'Record type' },
    { path: 'id', widget: 'text', label: 'Record ID' },
    { path: 'label', widget: 'text', label: 'Label' },
  ],
}

/** Open the array widget's edit mode (click the value span). */
function openEditor(root: HTMLElement): HTMLElement {
  const value = root.querySelector('.taptab-array-value')
  expect(value, 'the array widget must render its value span').toBeTruthy()
  act(() => {
    fireEvent.click(value as HTMLElement)
  })
  const editor = root.querySelector('.taptab-array-editor')
  expect(editor, 'clicking the array value must open the edit mode').toBeTruthy()
  return editor as HTMLElement
}

/** Click the array widget's "+ Add item" affordance. */
function addArrayItem(root: HTMLElement): void {
  const add = root.querySelector('.taptab-array-add')
  expect(add, 'the array widget must expose the Add item affordance').toBeTruthy()
  act(() => {
    fireEvent.click(add as HTMLElement)
  })
}

describe('ArrayWidget item-hint authoring (WIDGET-R1)', () => {
  afterEach(cleanup)

  it('"+ Add item" WITH a hint seeds an item from the hint field set — {kind:"record",type:"",id:"",label:""}, NEVER bare {}', () => {
    const onCommit = vi.fn()
    const { container } = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_HINT} />,
    )
    openEditor(container)
    addArrayItem(container)
    expect(onCommit).toHaveBeenCalledTimes(1)
    const committed = onCommit.mock.calls[0][0]
    expect(Array.isArray(committed)).toBe(true)
    expect(committed).toHaveLength(1)
    const item = committed[0]
    // The seed is the hint's field set — NOT bare {}. kind is seeded from the
    // single-option select's value (read from the hint, not hardcoded).
    expect(item).toEqual({ kind: 'record', type: '', id: '', label: '' })
    expect(item).not.toEqual({})
  })

  it('each hinted item renders authorable sub-fields via the existing ObjectWidget (.taptab-object-field-input per hint field)', () => {
    const onCommit = vi.fn()
    const view = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_HINT} />,
    )
    openEditor(view.container)
    addArrayItem(view.container)
    // The widget committed the seeded item; in the REAL flow FieldRow re-renders
    // with the committed value. Re-render here to exercise the per-item
    // ObjectWidget (the isolated unit test otherwise holds value=[]).
    const committedValue = onCommit.mock.calls[0][0]
    view.rerender(
      <ArrayWidget value={committedValue} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_HINT} />,
    )
    // The seeded item renders as an ObjectWidget in display mode.
    const itemValue = view.container.querySelector('.taptab-object-value')
    expect(itemValue, 'the seeded item must render through the ObjectWidget').toBeTruthy()
    // Clicking the item opens the ObjectWidget's edit mode with one control
    // per hint sub-field (kind / type / id / label). GATE-FIX-1 D2: `kind`
    // declares `widget: select` + options → it renders a native <select>;
    // the other three remain text inputs.
    act(() => {
      fireEvent.click(itemValue as HTMLElement)
    })
    const inputs = view.container.querySelectorAll('.taptab-object-field-input')
    expect(
      inputs,
      'the ObjectWidget must render one text input per options-less hint field',
    ).toHaveLength(3)
    const selects = Array.from(view.container.querySelectorAll('.taptab-object-field-select')) as HTMLSelectElement[]
    expect(
      selects,
      'the declared select hint field (kind) must render a <select>',
    ).toHaveLength(1)
    expect(Array.from(selects[0]!.options).map((o) => o.value)).toEqual(['record'])
  })

  it('editing a hinted item sub-field splices the whole-object commit back at the item index (reuse of ObjectWidget onCommit)', () => {
    const onCommit = vi.fn()
    const view = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_HINT} />,
    )
    openEditor(view.container)
    addArrayItem(view.container)
    // Re-render with the committed (seeded) item, as FieldRow would.
    const seeded = onCommit.mock.calls[0][0]
    view.rerender(
      <ArrayWidget value={seeded} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_HINT} />,
    )
    // Open the item's ObjectWidget edit mode and fill the `id` sub-field.
    const itemValue = view.container.querySelector('.taptab-object-value') as HTMLElement
    act(() => {
      fireEvent.click(itemValue)
    })
    const inputs = Array.from(view.container.querySelectorAll('.taptab-object-field-input')) as HTMLInputElement[]
    // `id` is the 2nd TEXT input (GATE-FIX-1 D2: `kind` — the first hint
    // sub-field, a declared select — renders a <select>, so the text inputs
    // are type, id, label).
    const idInput = inputs[1]
    expect(idInput).toBeTruthy()
    act(() => {
      fireEvent.change(idInput, { target: { value: 'CLM-1' } })
    })
    // The ObjectWidget commits the WHOLE item object; ArrayWidget splices it
    // back at index 0.
    const lastCommit = onCommit.mock.calls[onCommit.mock.calls.length - 1][0]
    expect(lastCommit).toEqual([{ kind: 'record', type: '', id: 'CLM-1', label: '' }])
  })

  it('hint-less arrays keep today\'s behavior: "+ Add item" commits {} (loud fallback unchanged)', () => {
    const onCommit = vi.fn()
    const { container } = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} />,
    )
    openEditor(container)
    addArrayItem(container)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toEqual([{}])
  })

  /**
   * WIDGET-R1 fix-run 1 (D3, A7b browser-gate defect): FieldRow's TipTap
   * extension declares `itemHint: { default: null }` — so a hint-less array
   * slot reaches ArrayWidget with `itemHint === null`, NOT `undefined`.
   * The pre-fix guard `itemHint !== undefined` let the null through and
   * `itemHint.fields` threw `TypeError: Cannot read properties of null
   * (reading 'fields')`, blowing up the ENTIRE editor via the error
   * boundary (gate receipts: /record/ILOG-000001, /record/MSR-000001).
   *
   * This leg renders the EXACT shape FieldRow passes (`itemHint={null}`)
   * and pins the contract: null and undefined are IDENTICAL — the hint-less
   * inert path renders, nothing throws, and "+ Add item" still commits {}
   * (the loud fallback stays unchanged; the projection's
   * UNSUPPORTED_WIDGET diagnostic is the defect marker).
   *
   * RED at base (a7fbb8da): rendering with `itemHint={null}` throws the
   * TypeError above. GREEN after the widget-boundary null-safety fix.
   */
  it('itemHint={null} (the EXACT shape FieldRow\'s `default: null` attr passes for hint-less arrays) does NOT throw and renders the hint-less inert path (D3)', () => {
    const onCommit = vi.fn()
    // RED before the fix: render itself throws
    // "Cannot read properties of null (reading 'fields')" — the whole-editor
    // crash the A7b gate reproduced on /record/ILOG-000001 and /record/MSR-000001.
    const view = render(
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={null} />,
    )
    // The value span renders (no error boundary, no crash).
    const value = view.container.querySelector('.taptab-array-value')
    expect(value, 'itemHint=null must render the inert value span, not throw').toBeTruthy()

    // Editing mode opens and the hint-less inert path renders (no
    // ObjectWidget sub-fields — the array is inert, NOT authorable).
    openEditor(view.container)
    expect(
      view.container.querySelector('.taptab-object-value'),
      'a null hint must NOT activate the hinted ObjectWidget path',
    ).toBeNull()

    // The loud fallback is unchanged: "+ Add item" commits {}.
    addArrayItem(view.container)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toEqual([{}])
  })

  it('itemHint={fields: []} (a hint that names a widget but lists NO fields) is treated as hint-less — inert path, no throw, {} fallback', () => {
    const onCommit = vi.fn()
    const view = render(
      <ArrayWidget
        value={[]}
        widget="array"
        readOnly={false}
        onCommit={onCommit}
        itemHint={{ path: '$.item', widget: 'object', label: 'No fields' }}
      />,
    )
    expect(view.container.querySelector('.taptab-array-value')).toBeTruthy()
    openEditor(view.container)
    addArrayItem(view.container)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toEqual([{}])
  })

  it('array-commit buttons are type="button" — clicking "+ Add item" inside a <form> does NOT submit the form (one submit per authored payload)', () => {
    const onCommit = vi.fn()
    const onFormSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    // jsdom: a button without an explicit type defaults to "submit" and fires
    // the form's submit handler. With type="button" it must NOT.
    const { container } = render(
      <form onSubmit={onFormSubmit} data-testid="wrap-form">
        <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_HINT} />
      </form>,
    )
    const form = container.querySelector('form') as HTMLElement
    const editor = openEditor(form)
    // ALL three commit buttons must declare type="button".
    const add = editor.querySelector('.taptab-array-add')
    const done = editor.querySelector('.taptab-array-done')
    expect(add?.getAttribute('type')).toBe('button')
    expect(done?.getAttribute('type')).toBe('button')
    // Clicking "+ Add item" commits the array (onCommit) but must NOT submit
    // the enclosing form.
    addArrayItem(form)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onFormSubmit, '"+ Add item" must NOT submit the enclosing form').not.toHaveBeenCalled()
  })

  it('W2 part 2 (OPT-B C2): a `widget: ref` sub-field in the hint seeds ABSENT (schema-valid seed) and renders the EXISTING ref picker in the item editor — never a flat text input', () => {
    // A hint carrying ONE flat text sub-field + ONE ref sub-field whose
    // declared props carry the ontology-ref suggestion shape (the 'ols'
    // source turns on the /resolve spine; valueShape ontology-ref commits
    // the canonical ref OBJECT). The branch under test is on the DECLARED
    // widget `ref` — no field/kind names from the domain.
    const REF_ITEM_HINT = {
      path: '$.item',
      widget: 'object',
      label: 'Hint item',
      fields: [
        { path: 'note', widget: 'text', label: 'Note', required: true },
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
      <ArrayWidget value={[]} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_ITEM_HINT} />
    )
    openEditor(view.container)
    addArrayItem(view.container)
    // THE SEED CONTRACT: the ref sub-field is ABSENT from the seed (its key
    // is not present) — a ref position holds a structured ref OBJECT or
    // nothing; '' into a ref-object position is schema-invalid. The flat
    // text sub-field seeds '' exactly as before (existing pins stay GREEN).
    const committed = onCommit.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(committed).toHaveLength(1)
    expect(committed[0].note).toBe('')
    expect(
      'target_ref' in committed[0],
      'the ref sub-field must be ABSENT from the seed (never "")',
    ).toBe(false)
    // THE RENDER CONTRACT: re-render with the committed item (as FieldRow
    // would), open the item's object editor — the ref sub-field renders the
    // EXISTING RefCombobox picker, the flat sub-field keeps its text input.
    view.rerender(
      <ArrayWidget value={onCommit.mock.calls[0][0]} widget="array" readOnly={false} onCommit={onCommit} itemHint={REF_ITEM_HINT} />
    )
    act(() => {
      fireEvent.click(view.container.querySelector('.taptab-object-value') as HTMLElement)
    })
    expect(view.container.querySelector('.taptab-object-editor')).toBeTruthy()
    const flatInputs = view.container.querySelectorAll('.taptab-object-field-input')
    expect(flatInputs, 'only the flat text sub-field renders a text input').toHaveLength(1)
    expect(view.container.querySelector('.ref-combobox'), 'the ref sub-field renders the EXISTING RefCombobox picker').toBeTruthy()
  })
})
