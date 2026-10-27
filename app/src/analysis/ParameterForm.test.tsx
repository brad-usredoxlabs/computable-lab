/**
 * ParameterForm — constructs matrix (lane spec: GC-9 deliverable A).
 *
 * RED-first suite (written before the component existed). Every fixture schema
 * is TEST-LOCAL and deliberately NON-GC (neutral domain names) — the component
 * must be domain-agnostic; all labels/choices are data from the schema.
 * The hardcode-boundary grep (spec §A) is owned by CI here, not just the
 * runbook: ParameterForm.tsx must contain ZERO occurrences of the banned
 * domain tokens.
 *
 * ParameterForm is a CONTROLLED component: multi-step interaction tests drive
 * it through a stateful Harness so each edit re-renders with the latest value
 * (exactly how the page wires it).
 */
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, fireEvent } from '@testing-library/react'
import { ParameterForm } from './ParameterForm'

const P = 'pf' // testIdPrefix for unit tests

/** Last value pushed into the Harness onChange recorder (app tsconfig lib is
 *  ES2020: no Array.prototype.at; the recorder stores values, not call tuples). */
function lastChange(spy: { mock: { calls: Array<Record<string, unknown>> } }): Record<string, unknown> | undefined {
  const calls = spy.mock.calls
  return calls.length > 0 ? calls[calls.length - 1] : undefined
}

function Harness({ schema, initial, onChange, testIdPrefix = P }: {
  schema: Record<string, unknown>
  initial: Record<string, unknown>
  onChange?: (next: Record<string, unknown>) => void
  testIdPrefix?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <ParameterForm
      schema={schema}
      value={value}
      onChange={(next: Record<string, unknown>) => { setValue(next); onChange?.(next) }}
      testIdPrefix={testIdPrefix}
    />
  )
}

function renderForm(schema: Record<string, unknown>, value: Record<string, unknown>, testIdPrefix = P) {
  const calls: Array<Record<string, unknown>> = []
  render(<Harness schema={schema} initial={value} onChange={(next) => { calls.push(next) }} testIdPrefix={testIdPrefix} />)
  return { mock: { calls } }
}

// --- Test-local NEUTRAL schemas (no GC domain names anywhere in fixtures) ---

const numberSchema = {
  type: 'object',
  properties: {
    cutoff: { type: 'number', title: 'Cutoff threshold', description: 'dwell above which a point counts', minimum: 0, maximum: 100 },
    count: { type: 'integer', minimum: 1 },
  },
  required: ['cutoff'],
}

const enumSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['fast', 'slow', 'auto', 'off'] },
  },
}

const groupSchema = {
  type: 'object',
  properties: {
    window: { type: 'object', title: 'Integration window', properties: { start: { type: 'number' }, end: { type: 'number' } } },
  },
}

const objectArraySchema = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at: { type: 'number', minimum: 0 }, kind: { type: 'string', enum: ['on', 'off'] } },
        required: ['at', 'kind'],
      },
    },
  },
}

const stringArraySchema = {
  type: 'object',
  properties: { tags: { type: 'array', items: { type: 'string' } } },
}

const boolStringSchema = {
  type: 'object',
  properties: {
    verbose: { type: 'boolean' },
    label: { type: 'string', title: 'Sample label' },
  },
}

const unsupportedSchema = {
  type: 'object',
  properties: {
    good: { type: 'number' },
    badOneOf: { oneOf: [{ type: 'number' }, { type: 'string' }] },
    badPattern: { patternProperties: { '^a_': { type: 'number' } } },
    badTuple: { type: 'array', items: [{ type: 'number' }, { type: 'string' }] },
    noType: { description: 'has no type keyword' },
    nestedArr: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
  },
}

const defaultSchema = {
  type: 'object',
  properties: {
    gain: { type: 'number', default: 4.5 },
    name: { type: 'string', default: 'batch-1' },
    group: { type: 'object', properties: { seed: { type: 'number', default: 7 } } },
  },
}

describe('ParameterForm — constructs matrix (spec test plan rows 1-10)', () => {
  it('1. number + title/description/min/max: labeled input, verbatim label, min/max attrs', () => {
    renderForm(numberSchema, {})
    const input = screen.getByTestId(`${P}-cutoff`) as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.min).toBe('0')
    expect(input.max).toBe('100')
    // Label text = title VERBATIM (data, never TS-derived).
    expect(screen.getByText('Cutoff threshold')).toBeDefined()
    // integer node with minimum renders its min attr too.
    expect((screen.getByTestId(`${P}-count`) as HTMLInputElement).min).toBe('1')
  })

  it('1b. x-unit suffix renders only when the schema carries it', () => {
    const xunitSchema = { type: 'object', properties: { rate: { type: 'number', 'x-unit': 'mL/min' } } }
    renderForm(xunitSchema, {})
    expect(screen.getByText('mL/min')).toBeDefined()
  })

  it('2. enum w/ 4 values: select with exactly those option texts, verbatim', () => {
    renderForm(enumSchema, {})
    const sel = screen.getByTestId(`${P}-mode`) as HTMLSelectElement
    expect(sel.tagName).toBe('SELECT')
    const options = Array.from(sel.querySelectorAll('option:not([disabled])')).map((o) => o.textContent)
    expect(options).toEqual(['fast', 'slow', 'auto', 'off'])
  })

  it('2b. (D5 probe) numeric and boolean enums emit the ORIGINAL JSON type, not a stringified DOM value', () => {
    // Reviewer probe P5: an enum of numbers must write the number back — the
    // DOM select value is a string by nature, so the control must map the
    // selected value to the matching enum member (index/serialized identity).
    const numericSchema = { type: 'object', properties: { level: { type: 'number', enum: [1, 2] } } }
    const onChange = renderForm(numericSchema, {})
    fireEvent.change(screen.getByTestId(`${P}-level`), { target: { value: '2' } })
    const emitted = lastChange(onChange)?.level
    expect(emitted).toBe(2)
    expect(typeof emitted).toBe('number')

    const boolSchema = { type: 'object', properties: { flag: { type: 'boolean', enum: [true, false] } } }
    const onBool = renderForm(boolSchema, {})
    fireEvent.change(screen.getByTestId(`${P}-flag`), { target: { value: 'true' } })
    const boolEmitted = lastChange(onBool)?.flag
    expect(boolEmitted).toBe(true)
    expect(typeof boolEmitted).toBe('boolean')
    // Option texts remain the verbatim values (spec table: verbatim options).
    const boolSel = screen.getByTestId(`${P}-flag`) as HTMLSelectElement
    expect(Array.from(boolSel.querySelectorAll('option:not([disabled])')).map((o) => o.textContent))
      .toEqual(['true', 'false'])
    // Pre-selected numeric value round-trips (select shows the original member).
    const onChange2 = renderForm(numericSchema, { level: 2 })
    expect(onChange2).toBeDefined()
    const preSels = screen.getAllByTestId(`${P}-level`)
    expect((preSels[preSels.length - 1] as HTMLSelectElement).value).toBe('2')
  })

  it('3. nested object group: fieldset legend = group title; children recurse', () => {
    renderForm(groupSchema, {})
    expect(screen.getByText('Integration window').tagName).toBe('LEGEND')
    expect(screen.getByTestId(`${P}-window-start`).tagName).toBe('INPUT')
    expect(screen.getByTestId(`${P}-window-end`).tagName).toBe('INPUT')
  })

  it('4. array of objects: add-row appends; edits write to the right index; remove removes exactly that row; order preserved', () => {
    const onChange = renderForm(objectArraySchema, { events: [{ at: 1, kind: 'on' }, { at: 2, kind: 'off' }] })
    // Two rows rendered, in stored order.
    expect(screen.getByTestId(`${P}-events-row-0`)).toBeDefined()
    expect(screen.getByTestId(`${P}-events-row-1`)).toBeDefined()
    // Edit row 1's `at` → writes to index 1 only.
    fireEvent.change(screen.getByTestId(`${P}-events-1-at`), { target: { value: '9' } })
    expect(lastChange(onChange)).toMatchObject({ events: [{ at: 1, kind: 'on' }, { at: 9, kind: 'off' }] })
    // Remove row 0 → exactly that row goes, row 1 becomes index 0.
    fireEvent.click(screen.getByTestId(`${P}-events-remove-0`))
    expect(lastChange(onChange)).toMatchObject({ events: [{ at: 9, kind: 'off' }] })
    // Add-row seeds {} (row block appears with empty controls).
    fireEvent.click(screen.getByTestId(`${P}-events-add`))
    const next = lastChange(onChange) as { events: unknown[] }
    expect(next.events.length).toBe(2)
    expect(next.events[1]).toEqual({})
  })

  it('5. array of strings: add/remove/list works', () => {
    const onChange = renderForm(stringArraySchema, { tags: ['a'] })
    fireEvent.change(screen.getByTestId(`${P}-tags-0`), { target: { value: 'zz' } })
    expect(lastChange(onChange)).toMatchObject({ tags: ['zz'] })
    fireEvent.click(screen.getByTestId(`${P}-tags-add`))
    expect((lastChange(onChange) as { tags: unknown[] }).tags).toHaveLength(2)
    fireEvent.click(screen.getByTestId(`${P}-tags-remove-0`))
    expect((lastChange(onChange) as { tags: unknown[] }).tags).toHaveLength(1)
  })

  it('6. boolean: checkbox toggles', () => {
    const onChange = renderForm(boolStringSchema, { verbose: false })
    const box = screen.getByTestId(`${P}-verbose`) as HTMLInputElement
    expect(box.type).toBe('checkbox')
    fireEvent.click(box)
    expect(lastChange(onChange)).toMatchObject({ verbose: true })
  })

  it('7. string free text: input round-trips', () => {
    const onChange = renderForm(boolStringSchema, { label: '' })
    fireEvent.change(screen.getByTestId(`${P}-label`), { target: { value: 'my sample' } })
    expect(lastChange(onChange)).toMatchObject({ label: 'my sample' })
  })

  it('8. unsupported nodes: -unsupported block names JSON path + construct; siblings still render (no blank form)', () => {
    renderForm(unsupportedSchema, { good: 1 })
    const blocks = screen.getAllByTestId(`${P}-unsupported`)
    expect(blocks.length).toBeGreaterThanOrEqual(5)
    const all = blocks.map((b) => b.textContent ?? '').join('\n')
    expect(all).toContain('badOneOf')
    expect(all).toContain('oneOf')
    expect(all).toContain('patternProperties')
    expect(all).toContain('badTuple')
    expect(all).toContain('nestedArr')
    // Sibling supported control STILL renders — one bad node never blanks the form.
    expect(screen.getByTestId(`${P}-good`).tagName).toBe('INPUT')
  })

  it('9. required + empty: -missing marker on the control', () => {
    renderForm(numberSchema, {})
    expect(screen.getByTestId(`${P}-cutoff-missing`)).toBeDefined()
    const input = screen.getByTestId(`${P}-cutoff`) as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('10. default deep pre-fill source + overridden badge + reset restores default', () => {
    // Pre-filled value differs from default on `gain`, matches on `name`.
    const onChange = renderForm(defaultSchema, { gain: 9.9, name: 'batch-1', group: { seed: 7 } })
    // Edited leaf shows the override badge; untouched-default leaves do not.
    expect(screen.getByTestId(`${P}-gain-overridden`)).toBeDefined()
    expect(screen.queryByTestId(`${P}-name-overridden`)).toBeNull()
    expect(screen.queryByTestId(`${P}-group-seed-overridden`)).toBeNull()
    // Reset affordance reverts to the default.
    fireEvent.click(screen.getByTestId(`${P}-gain-reset`))
    expect(lastChange(onChange)).toMatchObject({ gain: 4.5 })
  })

  it('10b. (D1 probe) a nested-group leaf OFF its default shows the override badge + reset, and reset restores the group default', () => {
    // Reviewer probe P1: group.seed default 7, value {group:{seed:99}}. The
    // group also carries an at-default context (top-level leaves at default),
    // so the nested badge assertion cannot be vacuous.
    const onChange = renderForm(defaultSchema, { gain: 4.5, name: 'batch-1', group: { seed: 99 } })
    const badge = screen.queryByTestId(`${P}-group-seed-overridden`)
    expect(badge, 'nested off-default leaf must show the override badge').not.toBeNull()
    const reset = screen.queryByTestId(`${P}-group-seed-reset`)
    expect(reset, 'nested off-default leaf must offer a reset affordance').not.toBeNull()
    // Reset reverts the nested leaf to its default (group object rebuilt).
    fireEvent.click(reset as HTMLElement)
    expect(lastChange(onChange)).toEqual({ gain: 4.5, name: 'batch-1', group: { seed: 7 } })
  })

  it('hardcode boundary (spec §A pin, CI-owned): ParameterForm.tsx contains ZERO banned domain tokens', () => {
    const source = readFileSync('src/analysis/ParameterForm.tsx', 'utf8')
    for (const banned of [
      'baseline_correction', 'timed_events', 'at_min', 'peak_width', 'slope_sensitivity',
      'reject', 'FAME', 'GC', 'ChemStation', 'scipy', 'tangent',
    ]) {
      expect(source, `ParameterForm.tsx must not contain "${banned}"`).not.toContain(banned)
    }
  })
})
