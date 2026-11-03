import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewRenderer, type RenderableArtifact, type RenderableView, toRenderableArtifact } from './ViewRenderer'

/**
 * L1-CELLRENDER-1 — object-valued table cells render honest JSON / a declared
 * field, never `[object Object]` (architect ruling
 * 2026-11-03_l1-object-cell-render-decision.md, spec
 * 2026-11-03_l1-cellrender-1-object-cell-render-spec.md).
 *
 * Root cause: `cellContent` (`ViewRenderer.tsx:84-95`) formats every cell with
 * `String(value ?? '')` (:93) and the same to array ELEMENTS (:89), so the
 * object-valued `params` column of `effective_parameters` (ANR-000056 /
 * ANR-000071) renders the literal text `[object Object]`.
 *
 * The six arms mirror ruling acceptance criterion 1 (a)-(f). The fixture
 * mirrors the LIVE payload shape (266TH re-read at trunk 3363a3fa):
 * `columns[0] = {name: 'params', type: 'string'}` while `rows[0].params` is a
 * DICT — the declared-type-vs-stored-value mismatch the renderer must absorb.
 * RED FIRST: every arm below is proven failing against the pre-fix formatter.
 */

const PARAMS = {
  assignments: [
    { compound_ref: { label: 'Caffeine' }, target_conc: 10.5 },
    { compound_ref: { label: 'Aspirin-d4' }, target_conc: 22 },
  ],
  solvent: 'MeOH/H2O',
}

function tableArtifact(rows: unknown[], columnNames?: string[]): RenderableArtifact {
  const cols = columnNames ?? ['params', 'params_digest']
  return toRenderableArtifact('effective_parameters', 'table', {
    columns: cols.map((name) => ({ name, type: 'string' })),
    rows,
  })
}

function renderTable(rows: unknown[], bindings?: Record<string, unknown>, columnNames?: string[]): void {
  const view: RenderableView = {
    id: 'v',
    title: 'Effective parameters',
    artifact: 'effective_parameters',
    renderer: 'table',
    ...(bindings ? { bindings } : {}),
  }
  render(<ViewRenderer view={view} artifact={tableArtifact(rows, columnNames)} />)
}

describe('L1-CELLRENDER-1 (a) — object cell, no binding: honest compact JSON', () => {
  it('renders parseable JSON containing the payload keys, never [object Object], with the full text on title', () => {
    renderTable([{ params: PARAMS, params_digest: 'sha256:abc' }])
    const cell = screen.getAllByRole('cell')[0]
    expect(cell.textContent).not.toContain('[object Object]')
    expect(cell.textContent!.length).toBeGreaterThan(0)
    const parsed = JSON.parse(cell.textContent!) as typeof PARAMS
    expect(Object.keys(parsed)).toContain('assignments')
    expect(parsed.assignments).toHaveLength(2)
    // the full JSON string is available on a title attribute
    const titled = cell.querySelector('[title]')
    expect(titled).not.toBeNull()
    expect(titled!.getAttribute('title')).toBe(cell.textContent)
  })
})

describe('L1-CELLRENDER-1 (b) — declared arm: bindings.columnFields reduces the cell', () => {
  it('table renderer + columnFields.params = "assignments[*].compound_ref.label" renders the labels one per line', () => {
    renderTable([{ params: PARAMS, params_digest: 'sha256:abc' }], {
      columnFields: { params: 'assignments[*].compound_ref.label' },
    })
    const cell = screen.getAllByRole('cell')[0]
    const items = Array.from(cell.querySelectorAll('.view-spec__cell-item'))
    expect(items.map((el) => el.textContent)).toEqual(['Caffeine', 'Aspirin-d4'])
    expect(cell.textContent).not.toContain('[object Object]')
  })

  it('artifact-table renderer applies columnFields too (shared formatter)', () => {
    render(
      <ViewRenderer
        view={{
          id: 'v',
          title: 'Effective parameters',
          artifact: 'effective_parameters',
          renderer: 'artifact-table',
          bindings: { columnFields: { params: 'assignments[*].compound_ref.label' } },
        }}
        artifact={tableArtifact([{ params: PARAMS, params_digest: 'sha256:abc' }])}
      />,
    )
    const cell = screen.getAllByRole('cell')[0]
    const items = Array.from(cell.querySelectorAll('.view-spec__cell-item'))
    expect(items.map((el) => el.textContent)).toEqual(['Caffeine', 'Aspirin-d4'])
  })

  it('a [<n>] index segment resolves a single scalar verbatim (no wrapper)', () => {
    renderTable([{ params: PARAMS, params_digest: 'sha256:abc' }], {
      columnFields: { params: 'assignments[1].compound_ref.label' },
    })
    const cell = screen.getAllByRole('cell')[0]
    expect(cell.textContent).toBe('Aspirin-d4')
    expect(cell.querySelectorAll('.view-spec__cell-item')).toHaveLength(0)
  })
})

describe('L1-CELLRENDER-1 (c) — unresolvable path falls through to JSON, never blank', () => {
  it('a missing mid-way path renders the full cell JSON, not an empty cell', () => {
    renderTable([{ params: PARAMS, params_digest: 'sha256:abc' }], {
      columnFields: { params: 'assignments[*].compound_ref.dose_volume_ul' },
    })
    const cell = screen.getAllByRole('cell')[0]
    expect(cell.textContent!.trim().length).toBeGreaterThan(0)
    expect(cell.textContent).not.toContain('[object Object]')
    expect(JSON.parse(cell.textContent!)).toEqual(PARAMS)
  })

  it('a declared field whose RESOLVED value is non-scalar also falls through', () => {
    renderTable([{ params: PARAMS, params_digest: 'sha256:abc' }], {
      columnFields: { params: 'assignments[0].compound_ref' },
    })
    const cell = screen.getAllByRole('cell')[0]
    expect(cell.textContent).toBe(JSON.stringify({ label: 'Caffeine' }))
    expect(cell.textContent).not.toContain('[object Object]')
  })
})

describe('L1-CELLRENDER-1 (d) — scalar cells stay byte-identical', () => {
  it('numeric/string/boolean/null/undefined scalars render exactly as before (direct td text)', () => {
    renderTable([{ rt_min: 4.946334540681159, area_percent: 100 }], undefined, ['rt_min', 'area_percent'])
    const cells = screen.getAllByRole('cell')
    expect(cells[0].textContent).toBe('4.946334540681159')
    expect(cells[1].textContent).toBe('100')
    // direct Text child, no wrapper node (the GATEFIX5 one-line-box contract)
    expect(cells[0].childNodes).toHaveLength(1)
    expect(cells[0].childNodes[0]).toBeInstanceOf(Text)
    expect(cells[0].querySelectorAll('[title]')).toHaveLength(0)
  })
})

describe('L1-CELLRENDER-1 (e) — empty-array and No-rows arms unchanged', () => {
  it('an empty-array cell renders the empty string with no wrapper nodes', () => {
    renderTable([{ params: [], params_digest: 'x' }])
    const cell = screen.getAllByRole('cell')[0]
    expect(cell.textContent).toBe('')
    expect(cell.childNodes).toHaveLength(0)
    expect(cell.querySelectorAll('[title]')).toHaveLength(0)
  })

  it('a zero-row declared payload still renders the named No rows arm', () => {
    renderTable([])
    expect(screen.getByText('No rows')).toBeDefined()
    expect(screen.queryAllByRole('cell')).toHaveLength(0)
  })
})

describe('L1-CELLRENDER-1 (f) — object element inside an array column: JSON per element', () => {
  it('each object element renders its own parseable JSON with title; string elements stay verbatim', () => {
    renderTable([
      {
        params: [
          { flag: 'SPLIT_PEAK', confidence: 0.8 },
          'MANUAL_INTEGRATION',
          [1, 2],
        ],
        params_digest: 'sha256:def',
      },
    ])
    const cell = screen.getAllByRole('cell')[0]
    expect(cell.textContent).not.toContain('[object Object]')
    const items = Array.from(cell.querySelectorAll('.view-spec__cell-item'))
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toBe('{"flag":"SPLIT_PEAK","confidence":0.8}')
    expect(JSON.parse(items[0].textContent!)).toEqual({ flag: 'SPLIT_PEAK', confidence: 0.8 })
    const t0 = items[0].querySelector('[title]') ?? items[0]
    expect(t0.getAttribute('title')).toBe(items[0].textContent)
    expect(items[1].textContent).toBe('MANUAL_INTEGRATION')
    expect(items[2].textContent).toBe('[1,2]')
  })
})
