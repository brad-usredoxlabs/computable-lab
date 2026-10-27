/**
 * GC-9 deliverable A — ParameterForm: generic closed-set renderer over a
 * JSON-Schema subset (spec 2026-10-28_GC-9-parameter-forms.md §A).
 *
 * RED-first: this suite exists BEFORE the component. Every fixture schema is
 * TEST-LOCAL and deliberately NON-GC (neutral domain names) — the component
 * must be domain-agnostic; all labels/choices are data from the schema.
 * The hardcode-boundary grep (spec §A) is owned by CI here, not just the
 * runbook: ParameterForm.tsx must contain ZERO occurrences of the banned
 * domain tokens.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen, fireEvent } from '@testing-library/react'
import { ParameterForm } from './ParameterForm'

const P = 'pf' // testIdPrefix for unit tests

function renderForm(schema: Record<string, unknown>, value: Record<string, unknown>, onChange?: (next: Record<string, unknown>) => void) {
  const spy = onChange ?? vi.fn()
  render(<ParameterForm schema={schema} value={value} onChange={spy} testIdPrefix={P} />)
  return spy
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

describe('ParameterForm — constructs matrix (GC-9 spec §Test plan rows 1-10)', () => {
  it('1. number + title/description/min/max (+ x-unit when present): labeled input, verbatim label, min/max attrs', () => {
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
    render(
      <ParameterForm
        schema={{ type: 'object', properties: { rate: { type: 'number', 'x-unit': 'mL/min' } }}
        value={{}}
        onChange={() => {}}
        testIdPrefix={P}
      />,
    )
    expect(screen.getByText('mL/min')).toBeDefined()
  })

  it('2. enum w/ 4 values: select with exactly those option texts, verbatim', () => {
    renderForm(enumSchema, {})
    const sel = screen.getByTestId(`${P}-mode`) as HTMLSelectElement
    expect(sel.tagName).toBe('SELECT')
    const options = Array.from(sel.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toEqual(['fast', 'slow', 'auto', 'off'])
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
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ events: [{ at: 1, kind: 'on' }, { at: 9, kind: 'off' }] })
    // Remove row 0 → exactly that row goes, row 1 becomes index 0.
    fireEvent.click(screen.getByTestId(`${P}-events-remove-0`))
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ events: [{ at: 9, kind: 'off' }] })
    // Add-row seeds {} (row block appears with empty controls).
    fireEvent.click(screen.getByTestId(`${P}-events-add`))
    const next = onChange.mock.calls.at(-1)?.[0] as { events: unknown[] }
    expect(next.events.length).toBe(2)
    expect(next.events[1]).toEqual({})
  })

  it('5. array of strings: add/remove/list works', () => {
    const onChange = renderForm(stringArraySchema, { tags: ['a'] })
    fireEvent.change(screen.getByTestId(`${P}-tags-0`), { target: { value: 'zz' } })
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ tags: ['zz'] })
    fireEvent.click(screen.getByTestId(`${P}-tags-add`))
    expect((onChange.mock.calls.at(-1)?.[0] as { tags: unknown[] }).tags).toHaveLength(2)
    fireEvent.click(screen.getByTestId(`${P}-tags-remove-0`))
    expect((onChange.mock.calls.at(-1)?.[0] as { tags: unknown[] }).tags).toHaveLength(1)
  })

  it('6. boolean: checkbox toggles', () => {
    const onChange = renderForm(boolStringSchema, { verbose: false })
    const box = screen.getByTestId(`${P}-verbose`) as HTMLInputElement
    expect(box.type).toBe('checkbox')
    fireEvent.click(box)
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ verbose: true })
  })

  it('7. string free text: input round-trips', () => {
    const onChange = renderForm(boolStringSchema, { label: '' })
    fireEvent.change(screen.getByTestId(`${P}-label`), { target: { value: 'my sample' } })
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ label: 'my sample' })
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
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ gain: 4.5 })
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
