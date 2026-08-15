/**
 * StepLocalizationPane tests — localProtocolSetup context.
 *
 * The run's local-protocol plate-setting sections (if any) ride in the
 * assist context as `localProtocolSetup` so the model localizes steps
 * against an already-declared setup instead of inventing bindings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { defaultWorkspaceState } from '../../workspace/types'
import { StepLocalizationPane } from './StepLocalizationPane'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  useChatThread: vi.fn(),
}))

vi.mock('../../workspace/WorkspaceContext', () => ({
  useWorkspace: () => ({ state: defaultWorkspaceState('STU-000001') }),
}))

vi.mock('../../EventEditorContext', () => ({
  useOptionalEventEditor: () => ({
    state: {
      platforms: [],
      platformId: 'p1',
      variantId: 'v1',
      placements: [],
      focusPlacementId: null,
      runId: 'RUN-000001',
      labwares: {},
      events: [],
      vocabPackId: 'pack',
      selection: null,
      eventGraphId: 'EVG-000002',
      preview: {
        previewEvents: [{ eventId: 'N1', verb: 'transfer' }],
        previewPlacements: [],
        previewLabwares: {},
      },
    },
    actions: {
      commitPreview: vi.fn(),
      clearPreview: vi.fn(),
      setPreview: vi.fn(),
    },
  }),
}))

vi.mock('../ai/useChatThread', () => ({
  useChatThread: (config: { context?: unknown }) => {
    mocks.useChatThread(config)
    return {
      isStreaming: false,
      send: mocks.send,
      stop: vi.fn(),
    }
  },
}))

vi.mock('../ai/ChatInput', () => ({
  ChatInput: () => <button type="button" data-testid="chat-send-mock">send</button>,
}))

vi.mock('../../../shared/lib/platformRegistry', () => ({
  getPlatformManifest: () => ({ slots: [], surface: true, sideLawn: false }),
  getVariantManifest: () => ({ slots: [], surface: true, sideLawn: false }),
}))

vi.mock('../../../shared/vocab/registry', () => ({
  getVerbsForDisplay: () => [],
}))

vi.mock('../../../graph/lib/acceptedEventGraphProjection', () => ({
  buildAcceptedEventGraphProjection: () => ({}),
}))

function renderPane(props: {
  localProtocolSetup?: {
    labwares?: Array<Record<string, unknown>>
    equipment?: Array<Record<string, unknown>>
    materials?: Array<Record<string, unknown>>
  }
} = {}) {
  return render(
    <StepLocalizationPane
      runId="RUN-000001"
      step={{ stepId: 'S2', label: 'Incubate' }}
      stepText="Incubate at 37C"
      {...(props.localProtocolSetup ? { localProtocolSetup: props.localProtocolSetup } : {})}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.send.mockReset()
  mocks.useChatThread.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('StepLocalizationPane localProtocolSetup context', () => {
  const setup = {
    labwares: [{ role: 'Sample plate', ref: { kind: 'record', id: 'LBW-1', type: 'labware', label: '96-well plate' } }],
    materials: [{ role: 'Treatment', description: 'Rotenone 1uM' }],
    equipment: [],
  }

  it('passes the declared setup sections into the assist context (useChatThread)', () => {
    renderPane({ localProtocolSetup: setup })
    expect(mocks.useChatThread).toHaveBeenCalled()
    const config = mocks.useChatThread.mock.calls[0]![0] as { context?: { localProtocolSetup?: unknown } }
    expect(config.context?.localProtocolSetup).toEqual(setup)
  })

  it('omits localProtocolSetup from the context when the prop is absent', () => {
    renderPane()
    const config = mocks.useChatThread.mock.calls[0]![0] as { context?: { localProtocolSetup?: unknown } }
    expect(config.context).toBeDefined()
    expect('localProtocolSetup' in (config.context ?? {})).toBe(false)
  })
})
