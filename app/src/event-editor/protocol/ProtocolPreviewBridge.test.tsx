/**
 * ProtocolPreviewBridge ghosting test.
 *
 * Proves the fetch → ghost path end-to-end at the component level:
 *   - given ProtocolSelectionContext.stepGraphs populated with a step's
 *     realization events + labwares,
 *   - and a currentStepId + focusStepId,
 * the bridge calls EventEditor actions.setPreview with those events, each
 * carrying `_protocolStepId` / `_protocolStepStatus` so the deck's
 * buildPreviewWellIndex / WellGrid can highlight the step's wells.
 *
 * This is independent of the deck pixel render — it verifies the preview
 * STATE the deck consumes.
 */

import { useEffect, useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Capture what the bridge pushes into the EventEditor.
const setPreview = vi.fn()
const clearPreview = vi.fn()

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: { preview: null },
    actions: { setPreview: setPreview, clearPreview: clearPreview },
  }),
}))

import { ProtocolSelectionProvider, useProtocolSelection } from './ProtocolSelectionContext'
import { ProtocolPreviewBridge } from './ProtocolPreviewBridge'

afterEach(() => {
  vi.clearAllMocks()
})

/** Seed the shared context once on mount (in an effect, NOT every render —
 *  seeding every render would re-render loop + OOM). */
function Setup({ graph, focusStep, currentStep }: {
  graph: { events: unknown[]; labwares: unknown[] }
  focusStep: { stepId: string; label: string; ordinal?: number } | null
  currentStep: string | null
}) {
  const ctx = useProtocolSelection()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!ctx || done) return
    ctx.setStepGraph('step-1', graph as never)
    ctx.setFocusedStep(focusStep)
    ctx.setCurrentStepId(currentStep)
    setDone(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, done])
  return <ProtocolPreviewBridge />
}

describe('ProtocolPreviewBridge — step realization ghosting', () => {
  it('ghosts a focused step realization with _protocolStepStatus="current"', async () => {
    const graph = {
      id: 'EVG-x',
      events: [
        { eventId: 'e1', event_type: 'wash', details: { labwareId: 'plate-A1', wells: ['A1'] } },
        { eventId: 'e2', event_type: 'wash', details: { labwareId: 'plate-A1', wells: ['A1'] } },
      ],
      labwares: [{ labwareId: 'plate-A1', labwareType: 'plate_96' }],
    }
    render(
      <ProtocolSelectionProvider>
        <Setup graph={graph} focusStep={{ stepId: 'step-1', label: 'Wash the cells' }} currentStep="step-1" />
      </ProtocolSelectionProvider>,
    )
    await waitFor(() => expect(setPreview).toHaveBeenCalled())
    const lastCall = setPreview.mock.calls[setPreview.mock.calls.length - 1][0]
    expect(lastCall.sourcePrompt).toBe('Protocol step preview')
    const evs = lastCall.previewEvents as Array<Record<string, unknown>>
    expect(evs.length).toBe(2)
    for (const ev of evs) {
      expect(ev._protocolStepId).toBe('step-1')
      expect(ev._protocolStepStatus).toBe('current')
    }
    expect(lastCall.previewLabwares['plate-A1']).toBeDefined()
  })

  it('does NOT ghost when the focused step has no events (pre-fetch / empty)', async () => {
    render(
      <ProtocolSelectionProvider>
        <Setup graph={{ events: [], labwares: [] }} focusStep={{ stepId: 'step-1', label: 'Wash the cells' }} currentStep="step-1" />
      </ProtocolSelectionProvider>,
    )
    await new Promise((r) => setTimeout(r, 200))
    expect(setPreview).not.toHaveBeenCalled()
  })

  it('REGRESSION: a consumer writing to the provider the bridge is UNDER ghosts (no extra nested provider between them)', async () => {
    // This recreates the bug: ProtocolTabPanel used to mount its OWN
    // <ProtocolSelectionProvider> around the pane, so the pane wrote to that
    // inner provider while the bridge read the (empty) outer one. With only
    // ONE provider shared by writer + bridge, the bridge must ghost.
    // The writer (`PaneWriter`) and the bridge sit under THE SAME provider.
    const graph = {
      id: 'EVG-y',
      events: [
        { eventId: 'e1', event_type: 'wash', details: { labwareId: 'plate-A1', wells: ['A1'] } },
      ],
      labwares: [{ labwareId: 'plate-A1', labwareType: 'plate_96' }],
    }
    function PaneWriter() {
      const ctx = useProtocolSelection()
      const [done, setDone] = useState(false)
      useEffect(() => {
        if (!ctx || done) return
        ctx.setStepGraph('step-1', graph as never)
        ctx.setFocusedStep({ stepId: 'step-1', label: 'Wash' })
        ctx.setCurrentStepId('step-1')
        setDone(true)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [ctx, done])
      return null
    }
    render(
      <ProtocolSelectionProvider>
        <PaneWriter />
        <ProtocolPreviewBridge />
      </ProtocolSelectionProvider>,
    )
    await waitFor(() => expect(setPreview).toHaveBeenCalled())
    const lastCall = setPreview.mock.calls[setPreview.mock.calls.length - 1][0]
    const evs = lastCall.previewEvents as Array<Record<string, unknown>>
    expect(evs.length).toBe(1)
    expect(evs[0]._protocolStepStatus).toBe('current')
  })
})