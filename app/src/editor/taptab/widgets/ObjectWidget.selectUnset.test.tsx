/**
 * FAME-3 GATE-FIX-2 N1 (adv-l1t1730, major) — the ObjectWidget's select
 * sub-field must render the value the record ACTUALLY holds: a stored value
 * that names no declared option (absent, '', or an unrecognized token)
 * renders the control in an explicit UNSET state — a selectable empty
 * placeholder option (value "") — and is NEVER coerced to options[0]
 * (the editor must not display a declared value the record does not carry;
 * absent = unknown, never a default).
 *
 * The defect: `matched ?? options[0]` coerced every absent/unrecognized
 * stored value to the first declared option — and the reachable authoring
 * flow seeds '' for a multi-option select, so every newly added item
 * displayed the first declared option.
 *
 * The MATCHING case is untouched: a stored value that names a declared
 * option renders exactly the declared options (the D2 contract) — the
 * placeholder exists ONLY in the unset case.
 *
 * Zero vocabulary literals (neutral option values, same discipline as the
 * D2 leg in ObjectWidget.selectField.test.tsx).
 *
 * RED at branch tip 32c563a6: stored '' / unrecognized token → select.value
 * = options[0] ('option-a'); no placeholder option exists.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { ObjectWidget } from './ObjectWidget'
import type { ObjectFieldConfig } from '../types'

const PROPERTIES: ObjectFieldConfig[] = [
  {
    name: 'state_field',
    widget: 'select',
    label: 'State field',
    options: [
      { value: 'option-a', label: 'Option A' },
      { value: 'option-b', label: 'Option B' },
    ],
  },
  { name: 'note_field', widget: 'text', label: 'Note field' },
]

type View = { container: HTMLElement }

function openEditor(view: View): void {
  const value = view.container.querySelector('.taptab-object-value')
  expect(value, 'the object widget must render its value span').toBeTruthy()
  act(() => {
    fireEvent.click(value as HTMLElement)
  })
  expect(
    view.container.querySelector('.taptab-object-editor'),
    'clicking the value must open the editor',
  ).toBeTruthy()
}

function stateSelect(view: View): HTMLSelectElement {
  const labels = Array.from(view.container.querySelectorAll('.taptab-object-field-label'))
  const stateField = labels
    .find((l) => l.textContent?.includes('State field'))
    ?.closest('.taptab-object-field')
  expect(stateField, 'the select sub-field row must exist').toBeTruthy()
  const select = stateField!.querySelector('select')
  expect(select, 'the select sub-field must render a <select>').toBeTruthy()
  return select as HTMLSelectElement
}

describe('ObjectWidget — a stored value that names no declared option renders UNSET, never options[0] (N1)', () => {
  afterEach(cleanup)

  it('stored "" (no qualification held): the select shows the explicit unset state, opening the editor fires ZERO commits, and the control stays authorable', () => {
    const onCommit = vi.fn()
    const view = render(
      <ObjectWidget
        value={{ state_field: '', note_field: 'x' }}
        widget="object"
        properties={PROPERTIES}
        readOnly={false}
        onCommit={onCommit}
      />,
    )
    openEditor(view)
    expect(
      onCommit,
      'opening the editor with an absent value must fire zero commits',
    ).not.toHaveBeenCalled()
    const select = stateSelect(view)
    expect(
      select.value,
      'an absent (empty) stored value must render the UNSET state, never options[0]',
    ).toBe('')
    // The unset state is an explicit selectable empty placeholder (value
    // "") FIRST, then exactly the declared options.
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      '',
      'option-a',
      'option-b',
    ])
    // The control is still authorable from the unset state: picking a
    // declared option commits the option VALUE (the record now genuinely
    // holds it) — the object otherwise byte-identical.
    act(() => {
      fireEvent.change(select, { target: { value: 'option-b' } })
    })
    expect(onCommit).toHaveBeenLastCalledWith({ state_field: 'option-b', note_field: 'x' })
  })

  it('stored unrecognized token: the select shows the UNSET state, never options[0]', () => {
    const onCommit = vi.fn()
    const view = render(
      <ObjectWidget
        value={{ state_field: 'legacy-token', note_field: 'x' }}
        widget="object"
        properties={PROPERTIES}
        readOnly={false}
        onCommit={onCommit}
      />,
    )
    openEditor(view)
    expect(onCommit, 'opening the editor must fire zero commits').not.toHaveBeenCalled()
    const select = stateSelect(view)
    expect(
      select.value,
      'an unrecognized stored token must render the UNSET state, never options[0]',
    ).toBe('')
    expect(
      Array.from(select.options).map((o) => o.value),
      'the placeholder precedes exactly the declared options',
    ).toEqual(['', 'option-a', 'option-b'])
  })
})
