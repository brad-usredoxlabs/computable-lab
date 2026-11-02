/**
 * FAME-3 GATE-FIX-1 D2 (gate-l1t1520, major) — the ObjectWidget's EDIT mode
 * must HONOR a flat sub-field's DECLARED widget+options data: a sub-field
 * whose config declares `widget: 'select'` with `options` renders a native
 * <select> offering EXACTLY those options — not a free-text input.
 *
 * The defect: every flat non-ref sub-field rendered <input type="text">
 * (the options/select branch did not exist in the object editor), so an
 * enum-declared sub-field accepted ANY token (the server 422s on save).
 *
 * The fix is a GENERIC widget dispatch from the property's declared
 * `widget` + `options` data (the same data-driven branch discipline as the
 * existing isRefWidget / non-empty-fields branches) — zero vocabulary
 * literals in TS (this test uses neutral option values on purpose).
 *
 * RED at base: the select sub-field renders a text input (no <select> in
 * the DOM), so the select assertion fails. GREEN after the dispatch.
 * Behavior pin: the flat TEXT sub-field in the same render still renders
 * and commits exactly as before (no options → text path unchanged).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { ObjectWidget } from './ObjectWidget'
import type { ObjectFieldConfig } from '../types'

const SELECT_OPTIONS = [
  { value: 'option-a', label: 'Option A' },
  { value: 'option-b', label: 'Option B' },
] as const

const PROPERTIES: ObjectFieldConfig[] = [
  { name: 'state_field', widget: 'select', label: 'State field', options: [...SELECT_OPTIONS] },
  { name: 'note_field', widget: 'text', label: 'Note field' },
]

describe('ObjectWidget — a declared select sub-field renders a <select> with exactly its declared options', () => {
  afterEach(cleanup)

  it('widget select + options: a native <select> with exactly the declared options; committing picks the option VALUE (never free text)', () => {
    const onCommit = vi.fn()
    const view = render(
      <ObjectWidget
        value={{ state_field: 'option-a', note_field: 'x' }}
        widget="object"
        properties={PROPERTIES}
        readOnly={false}
        onCommit={onCommit}
      />,
    )
    const value = view.container.querySelector('.taptab-object-value')
    expect(value, 'the object widget must render its value span').toBeTruthy()
    act(() => {
      fireEvent.click(value as HTMLElement)
    })
    expect(view.container.querySelector('.taptab-object-editor'), 'the editor must be open').toBeTruthy()

    // The select sub-field (locate it by its declared label) renders a
    // native <select> — exactly the declared options, in order.
    const labels = Array.from(view.container.querySelectorAll('.taptab-object-field-label'))
    const stateField = labels.find((l) => l.textContent?.includes('State field'))?.closest('.taptab-object-field')
    expect(stateField, 'the select sub-field row must exist').toBeTruthy()
    const select = stateField!.querySelector('select') as HTMLSelectElement | null
    expect(select, 'the declared select sub-field must render a <select>').toBeTruthy()
    expect(
      Array.from(select!.options).map((o) => o.value),
      'the <select> must offer EXACTLY the declared options, in order',
    ).toEqual(['option-a', 'option-b'])
    expect(
      Array.from(select!.options).map((o) => o.textContent),
    ).toEqual(['Option A', 'Option B'])

    // The current value is reflected (the stored value is a declared option).
    expect(select!.value).toBe('option-a')

    // Committing a different option commits the option VALUE at the sub-field's
    // path — the object otherwise byte-identical (note_field untouched).
    act(() => {
      fireEvent.change(select!, { target: { value: 'option-b' } })
    })
    expect(onCommit).toHaveBeenLastCalledWith({ state_field: 'option-b', note_field: 'x' })
  })

  it('behavior pin: a flat sub-field WITHOUT options still renders a text input and commits its typed text (unchanged path)', () => {
    const onCommit = vi.fn()
    const view = render(
      <ObjectWidget value={{ note_field: 'x' }} widget="object" properties={PROPERTIES} readOnly={false} onCommit={onCommit} />,
    )
    act(() => {
      fireEvent.click(view.container.querySelector('.taptab-object-value') as HTMLElement)
    })
    const labels = Array.from(view.container.querySelectorAll('.taptab-object-field-label'))
    const noteField = labels.find((l) => l.textContent?.includes('Note field'))?.closest('.taptab-object-field')
    expect(noteField).toBeTruthy()
    const input = noteField!.querySelector('.taptab-object-field-input') as HTMLInputElement | null
    expect(input, 'the options-less sub-field must still render its text input').toBeTruthy()
    act(() => {
      fireEvent.change(input!, { target: { value: 'typed' } })
    })
    expect(onCommit).toHaveBeenLastCalledWith({ note_field: 'typed' })
  })
})
