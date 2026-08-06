import { describe, it, expect, vi } from 'vitest'
import { openContent, openInNewTab, uniqueTabSlotId } from './openContent'
import type { OpenTabsContextValue } from '../shell/OpenTabsContext'
import type { WorkspaceTab } from '../../event-editor/workspace/types'

const runTab: WorkspaceTab = { id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'Titration' }

describe('openContent', () => {
  it('navigates the active tab (in place) and never opens a new tab', () => {
    const navigateActiveTab = vi.fn()
    const openTab = vi.fn()
    const navigate = vi.fn()
    const openTabs = { navigateActiveTab, openTab } as unknown as OpenTabsContextValue

    openContent(openTabs, navigate, runTab, '/runs/RUN-1', { label: 'P', entityType: 'project', id: 'STU-1', route: '/project/STU-1' })

    expect(navigateActiveTab).toHaveBeenCalledWith(runTab, expect.objectContaining({ label: 'P' }))
    expect(openTab).not.toHaveBeenCalled() // never opens a separate tab
    expect(navigate).toHaveBeenCalledWith('/runs/RUN-1')
  })

  it('is a no-op-safe with null openTabs (still navigates route)', () => {
    const navigate = vi.fn()
    openContent(null, navigate, runTab, '/runs/RUN-1')
    expect(navigate).toHaveBeenCalledWith('/runs/RUN-1')
  })
})

describe('openInNewTab', () => {
  it('opens a fresh tab with a unique slot id and navigates', () => {
    const openTab = vi.fn()
    const navigate = vi.fn()
    const openTabs = { openTab } as unknown as OpenTabsContextValue

    openInNewTab(openTabs, navigate, runTab, '/runs/RUN-1', [{ label: 'P', entityType: 'project', id: 'STU-1', route: '/project/STU-1' }])

    expect(openTab).toHaveBeenCalledTimes(1)
    const [tab, activate, seed] = openTab.mock.calls[0]
    expect(activate).toBe(true)
    expect(tab.kind).toBe('run')
    expect(tab.runId).toBe('RUN-1')
    expect(tab.id).not.toBe('run:RUN-1') // fresh id
    expect(seed).toEqual([{ label: 'P', entityType: 'project', id: 'STU-1', route: '/project/STU-1' }])
    expect(navigate).toHaveBeenCalledWith('/runs/RUN-1')
  })
})

describe('uniqueTabSlotId', () => {
  it('returns a unique id each call', () => {
    expect(uniqueTabSlotId(runTab)).not.toBe(uniqueTabSlotId(runTab))
    expect(uniqueTabSlotId(runTab)).toContain('run:RUN-1')
  })
})
