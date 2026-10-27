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