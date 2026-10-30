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
    // Clicking the item opens the ObjectWidget's edit mode with one input per
    // hint sub-field (kind / type / id / label).
    act(() => {
      fireEvent.click(itemValue as HTMLElement)
    })
    const inputs = view.container.querySelectorAll('.taptab-object-field-input')
    expect(inputs, 'the ObjectWidget must render one sub-field input per hint field').toHaveLength(4)
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
    // `id` is the 3rd hint sub-field (kind, type, id, label).
    const idInput = inputs[2]
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
})
