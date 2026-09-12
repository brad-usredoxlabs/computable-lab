import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { RunNavPane } from './RunNavPane'

vi.mock('../event-editor/right-pane/search/SearchTabPanel', () => ({
  SearchTabPanel: () => <div data-testid="search-panel">search</div>,
}))
vi.mock('../event-editor/right-pane/details/DetailsTabPanel', () => ({
  DetailsTabPanel: () => <div data-testid="details-panel">details</div>,
}))
vi.mock('../event-editor/right-pane/protocol/ProtocolNavPanel', () => ({
  ProtocolNavPanel: ({ title }: { title?: string }) => <div data-testid="protocol-nav">{title}</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RunNavPane', () => {
  it('defaults to the Protocol tab showing the step rail', () => {
    render(<RunNavPane />)
    expect(screen.getByTestId('protocol-nav')).toBeInTheDocument()
    expect(screen.queryByTestId('search-panel')).toBeNull()
  })
  it('switches to Search on tab click', () => {
    render(<RunNavPane />)
    fireEvent.click(screen.getByRole('tab', { name: /search/i }))
    expect(screen.getByTestId('search-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('protocol-nav')).toBeNull()
  })
  it('switches to Details on tab click', () => {
    render(<RunNavPane />)
    fireEvent.click(screen.getByRole('tab', { name: /details/i }))
    expect(screen.getByTestId('details-panel')).toBeInTheDocument()
  })
})
