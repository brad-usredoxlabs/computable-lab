/**
 * The deterministic-navigation loop, closed: an AI-emitted session document
 * becomes tabs, tabs become routes.
 */
import { describe, expect, it, vi } from 'vitest'
import { sessionDocumentToState, sessionFromYaml } from './sessionYaml'
import { stableTabId } from './tabId'
import { tabPath } from '../shell/WorkspaceTabStrip'
import { openSurface, tabForSurface } from './openSurface'
import type { SurfaceSpec } from '../surfaces'

const DOC = `
version: 1
activeTabId: run:RUN-1
tabs:
  - kind: project
    studyId: STU-1
    title: DHVC
  - kind: run
    runId: RUN-1
    title: Titration
    activeRightPaneMode: protocol
`

const REGISTRY: SurfaceSpec[] = [
  {
    id: 'run-design',
    label: 'Run · Design',
    path: '/runs/:runId',
    params: { runId: 'run' },
    objectTypes: ['run'],
    selectableKinds: [],
  },
  { id: 'find', label: 'Find', path: '/find', objectTypes: ['run'], selectableKinds: [] },
]

describe('an AI-emitted session document becomes routes', () => {
  it('resolves every tab to a route and the active tab to the resumed URL', () => {
    const state = sessionDocumentToState(sessionFromYaml(DOC), stableTabId)
    expect(state.tabs.map((t) => tabPath(t.tab))).toEqual(['/project/STU-1', '/runs/RUN-1'])
    const active = state.tabs.find((t) => t.tab.id === state.activeTabId)!
    expect(tabPath(active.tab)).toBe('/runs/RUN-1')
    expect(active.activeRightPaneMode).toBe('protocol')
  })

  it('opens a surface context through the registry', () => {
    const navigate = vi.fn()
    const openTab = vi.fn()
    const route = openSurface(
      { navigateActiveTab: openTab } as never,
      navigate,
      REGISTRY,
      { surface: 'run-design', active: { objectType: 'run', objectId: 'RUN-7' }, title: 'R7' },
    )
    expect(route).toBe('/runs/RUN-7')
    expect(navigate).toHaveBeenCalledWith('/runs/RUN-7')
    expect(openTab).toHaveBeenCalledOnce()
  })

  it('refuses a surface that is not deep-linkable', () => {
    const navigate = vi.fn()
    expect(
      openSurface({ navigateActiveTab: vi.fn() } as never, navigate, REGISTRY, {
        surface: 'find',
        active: { objectType: 'run', objectId: 'RUN-7' },
      }),
    ).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('maps only object types that have a tab kind', () => {
    expect(tabForSurface({ surface: 'run-design', active: { objectType: 'run', objectId: 'RUN-7' } })).toMatchObject({
      kind: 'run',
      runId: 'RUN-7',
    })
    expect(tabForSurface({ surface: 'run-design', active: { objectType: 'well', objectId: 'W1' } })).toBeNull()
  })
})
