import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventGraphChip } from './EventGraphChip'

const mocks = vi.hoisted(() => ({
  state: {
    eventGraphId: null as string | null,
    runId: null as string | null,
    eventGraphSave: null as null | { sha: string; message: string; timestamp: string },
  },
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({ state: mocks.state }),
}))

function renderChip() {
  return render(
    <MemoryRouter>
      <EventGraphChip />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  mocks.state = { eventGraphId: null, runId: null, eventGraphSave: null }
})

describe('EventGraphChip', () => {
  it('shows an unsaved state before the graph has an id', () => {
    renderChip()
    expect(screen.getByText('Unsaved graph').getAttribute('data-state')).toBe('unsaved')
  })

  it('links to the resumable graph URL and shows the commit sha when saved', () => {
    mocks.state = {
      eventGraphId: 'EVG-1234567890ABC',
      runId: null,
      eventGraphSave: { sha: 'abcdef123456', message: 'Create EVG-1234567890ABC', timestamp: '2026-05-31T12:00:00Z' },
    }

    renderChip()

    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/event-editor/EVG-1234567890ABC')
    expect(link.textContent).toContain('Graph EVG-123456...')
    expect(link.textContent).toContain('Saved abcdef1')
    expect(link.getAttribute('title')).toContain('SHA: abcdef123456')
  })

  it('uses the run-scoped graph URL and no-changes label when applicable', () => {
    mocks.state = {
      eventGraphId: 'EVG-1',
      runId: 'RUN-1',
      eventGraphSave: { sha: 'no-changes', message: 'Update EVG-1', timestamp: '2026-05-31T12:00:00Z' },
    }

    renderChip()

    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/runs/RUN-1/event-editor?id=EVG-1')
    expect(link.textContent).toContain('No changes')
  })
})
