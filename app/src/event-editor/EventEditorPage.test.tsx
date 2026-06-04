/**
 * EventEditorPage redirect smoke. Phase 10 cutover — the legacy route is
 * now a thin resolver that hands off to /project/:studyId.
 *
 *  - /event-editor (no params)     → /project/STU-scratch
 *  - /event-editor/:eventGraphId   → /project/<resolved>/event-graph/<id>
 *  - /runs/:runId/event-editor     → /project/<resolved-from-run>
 *  - resolution failures           → /project/STU-scratch
 *
 * Resolution is mocked so the test doesn't hit the network; the actual
 * resolver has its own focused test file alongside it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'

const resolveEventGraphMock = vi.fn()
const resolveRunMock = vi.fn()
const resolveNoParamsMock = vi.fn()
vi.mock('./legacyRouteResolution', () => ({
  SCRATCH_STUDY_ID: 'STU-scratch',
  resolveLegacyEventGraphRoute: (...args: unknown[]) =>
    resolveEventGraphMock(...args),
  resolveLegacyRunRoute: (...args: unknown[]) => resolveRunMock(...args),
  resolveLegacyNoParamsRoute: () => resolveNoParamsMock(),
}))

import { EventEditorPage } from './EventEditorPage'

function LocationProbe() {
  const location = useLocation()
  const params = useParams()
  return (
    <div>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="study">{params.studyId ?? ''}</div>
      <div data-testid="graph">{params.eventGraphId ?? ''}</div>
    </div>
  )
}

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/event-editor" element={<EventEditorPage />} />
        <Route path="/event-editor/:eventGraphId" element={<EventEditorPage />} />
        <Route path="/runs/:runId/event-editor" element={<EventEditorPage />} />
        <Route path="/project/:studyId" element={<LocationProbe />} />
        <Route
          path="/project/:studyId/event-graph/:eventGraphId"
          element={<LocationProbe />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resolveEventGraphMock.mockReset()
  resolveRunMock.mockReset()
  resolveNoParamsMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('EventEditorPage redirect', () => {
  it('/event-editor → /project/STU-scratch (no params)', async () => {
    resolveNoParamsMock.mockReturnValue({
      studyId: 'STU-scratch',
      openTab: {
        kind: 'deck',
        id: 'tab-deck-fresh',
        eventGraphId: '',
        title: 'New deck',
      },
    })
    renderAt('/event-editor')
    await waitFor(() =>
      expect(screen.getByTestId('study').textContent).toBe('STU-scratch'),
    )
    expect(screen.getByTestId('graph').textContent).toBe('')
  })

  it('/event-editor/EVG-1 → /project/<study>/event-graph/EVG-1', async () => {
    resolveEventGraphMock.mockResolvedValue({
      studyId: 'STU-000001',
      openTab: {
        kind: 'deck',
        id: 'tab-deck-EVG-1',
        eventGraphId: 'EVG-1',
        title: 'EVG-1',
      },
    })
    renderAt('/event-editor/EVG-1')
    await waitFor(() =>
      expect(screen.getByTestId('study').textContent).toBe('STU-000001'),
    )
    expect(screen.getByTestId('graph').textContent).toBe('EVG-1')
    expect(resolveEventGraphMock).toHaveBeenCalledWith('EVG-1')
  })

  it('/runs/RUN-1/event-editor → /project/<study>', async () => {
    resolveRunMock.mockResolvedValue({
      studyId: 'STU-000007',
      openTab: null,
    })
    renderAt('/runs/RUN-1/event-editor')
    await waitFor(() =>
      expect(screen.getByTestId('study').textContent).toBe('STU-000007'),
    )
    expect(screen.getByTestId('graph').textContent).toBe('')
    expect(resolveRunMock).toHaveBeenCalledWith('RUN-1')
  })

  it('?id=EVG-2 query param is honored like the path-param form', async () => {
    resolveEventGraphMock.mockResolvedValue({
      studyId: 'STU-000002',
      openTab: {
        kind: 'deck',
        id: 'tab-deck-EVG-2',
        eventGraphId: 'EVG-2',
        title: 'EVG-2',
      },
    })
    renderAt('/event-editor?id=EVG-2')
    await waitFor(() =>
      expect(screen.getByTestId('study').textContent).toBe('STU-000002'),
    )
    expect(screen.getByTestId('graph').textContent).toBe('EVG-2')
  })

  it('falls back to STU-scratch when the event-graph resolution lands there', async () => {
    resolveEventGraphMock.mockResolvedValue({
      studyId: 'STU-scratch',
      openTab: {
        kind: 'deck',
        id: 'tab-deck-EVG-X',
        eventGraphId: 'EVG-X',
        title: 'EVG-X',
      },
    })
    renderAt('/event-editor/EVG-X')
    await waitFor(() =>
      expect(screen.getByTestId('study').textContent).toBe('STU-scratch'),
    )
    expect(screen.getByTestId('graph').textContent).toBe('EVG-X')
  })
})
