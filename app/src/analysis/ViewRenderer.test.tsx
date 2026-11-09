import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewRenderer, renderViews, toRenderableArtifact, type RenderableView } from './ViewRenderer'

describe('ViewRenderer', () => {
  it('renders a table artifact', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'Results', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', [{ start: 0.1, end: 0.5, area: 3.2 }])}
      />,
    )
    expect(screen.getByText('start')).toBeDefined()
    expect(screen.getByText('3.2')).toBeDefined()
  })

  it('renders an empty signal as an svg', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'Trace', artifact: 'a', renderer: 'signal' }}
        artifact={toRenderableArtifact('a', 'signal', { axis: [1, 2], values: [3, 4] })}
      />,
    )
    expect(screen.getByTestId('view-spec-signal')).toBeDefined()
  })

  it('renders a metric with units', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'Area', artifact: 'a', renderer: 'metric' }}
        artifact={toRenderableArtifact('a', 'metric', 3.2, { value: 'a.u.' })}
      />,
    )
    expect(screen.getByTestId('view-spec-metric')).toHaveTextContent('3.2')
    expect(screen.getByTestId('view-spec-metric')).toHaveTextContent('a.u.')
  })

  it('shows a compatibility error for an unknown renderer', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'x', artifact: 'a', renderer: 'quantum' as never }}
        artifact={toRenderableArtifact('a', 'binary', 'z')}
      />,
    )
    expect(screen.getByTestId('view-spec-error')).toHaveTextContent('quantum')
  })

  it('renders a model artifact card with format + data-reference', () => {
    const artifact = { id: 'AOUT-1', name: 'model', dataKind: 'model', format: 'pkl', dataReferenceRef: { id: 'DREF-000001' } }
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'model', artifact: 'model', renderer: 'model' }}
        artifact={artifact}
      />,
    )
    const card = screen.getByTestId('view-spec-model')
    expect(card).toHaveTextContent('model')
    expect(card).toHaveTextContent('pkl')
    expect(card).toHaveTextContent('DREF-000001')
  })
})

describe('renderViews', () => {
  it('renders a list of views against their artifacts', () => {
    const views: RenderableView[] = [
      { id: 'v1', title: 'Table view', artifact: 'a', renderer: 'table' },
      { id: 'v2', title: 'Metric', artifact: 'b', renderer: 'metric' },
    ]
    const artifacts = [
      toRenderableArtifact('a', 'table', [{ x: 1 }]),
      toRenderableArtifact('b', 'metric', 42),
    ]
    const nodes = renderViews(views, artifacts)
    const { getByText } = render(<div>{nodes}</div>)
    expect(getByText('Table view')).toBeDefined()
    expect(getByText('Metric')).toBeDefined()
    expect(getByText('42')).toBeDefined()
  })

  it('reports a missing artifact as an error', () => {
    const views: RenderableView[] = [{ id: 'v', title: 'x', artifact: 'missing', renderer: 'table' }]
    const nodes = renderViews(views, [])
    const { getByText } = render(<div>{nodes}</div>)
    expect(getByText(/Missing artifact/)).toBeDefined()
  })
})

describe('TableView declared-object shape (C1)', () => {
  // The shipped table artifact shape is an OBJECT { columns, rows }, not a
  // bare array. TableView must teach this shape declaratively (shape-only
  // detection; the plain-array behavior stays verbatim above).
  const declaredShape = {
    columns: [
      { name: 'col_a', units: 'u' },
      { name: 'col_b' },
    ],
    rows: [
      { col_b: 'x', col_a: 1.5 },
      { col_a: 2.5, col_b: 'y' },
    ],
  }

  it('renders declared rows with header labels in declared column order', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', declaredShape)}
      />,
    )
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['col_a', 'col_b'])
    const cells = screen.getAllByRole('cell').map((c) => c.textContent)
    expect(cells).toEqual(['1.5', 'x', '2.5', 'y'])
    expect(screen.queryByText('No rows')).toBeNull()
  })

  it('honours string[] column labels', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', { columns: ['col_a', 'col_b'], rows: [{ col_a: 1, col_b: 2 }] })}
      />,
    )
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['col_a', 'col_b'])
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '2'])
  })

  it('keeps the named No rows arm for an empty declared rows array', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', { columns: [{ name: 'col_a' }], rows: [] })}
      />,
    )
    expect(screen.getByText('No rows')).toBeDefined()
  })

  it('keeps today fallback when the rows member is not an array', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', { rows: 'not-an-array' })}
      />,
    )
    expect(screen.getByText('No rows')).toBeDefined()
  })

  it('infers headers from row keys when the columns member is absent', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', { rows: [{ a: 1 }] })}
      />,
    )
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['a'])
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['1'])
  })

  it('keeps today fallback when the columns member is not an array', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', { columns: null, rows: [{ a: 1 }] })}
      />,
    )
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['a'])
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['1'])
  })
})

describe('TableView array-valued cells (FAME-8 GATEFIX4 reachability)', () => {
  // A long array-valued cell (e.g. the `flags` column) must not render as one
  // unbreakable comma-joined run (String(array) => 'a,b,c' with no space).
  // Rendering one element per line makes each flag readable within a narrow
  // report pane (D1: the peak-1 flags cell was 730 px and fully outside the
  // 574 px pane). This is a GENERIC array branch — no artifact/column/flag
  // special-casing.
  it('renders an array cell as one element per line (not a comma-joined run)', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', {
          columns: ['k', 'flags'],
          rows: [{ k: 1, flags: ['ALPHA_FLAG', 'BETA_FLAG'] }],
        })}
      />,
    )
    // The cell must contain both flag elements as their own nodes, one per
    // line — NOT the comma-joined 'ALPHA_FLAG,BETA_FLAG' run.
    const cell = screen.getAllByRole('cell')[1]
    expect(cell.textContent).toBe('ALPHA_FLAGBETA_FLAG')
    expect(cell.querySelectorAll('.view-spec__cell-item').length).toBe(2)
    // Each element is its own stacked block.
    expect(screen.getByText('ALPHA_FLAG')).toBeDefined()
    expect(screen.getByText('BETA_FLAG')).toBeDefined()
    // No comma-joined run remains.
    expect(cell.textContent).not.toContain('ALPHA_FLAG,BETA_FLAG')
  })

  it('leaves a scalar cell unchanged (no array wrapper)', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', {
          columns: ['k', 'flags'],
          rows: [{ k: 1, flags: 'SINGLE' }],
        })}
      />,
    )
    const cell = screen.getAllByRole('cell')[1]
    // A scalar renders verbatim with no array wrapper.
    expect(cell.textContent).toBe('SINGLE')
    expect(cell.querySelectorAll('.view-spec__cell-item').length).toBe(0)
  })
})
