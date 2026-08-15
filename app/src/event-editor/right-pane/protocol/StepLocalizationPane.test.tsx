/**
 * StepLocalizationPane tests.
 *
 * - the Save-to-corpus button is NOT rendered until the user has Accepted a
 *   committed graph AND sent at least one localization instruction
 * - after Accept it appears and clicking it calls apiClient.saveCorpusEntry
 *   with source:'protocol-loop' + confirmedBy:'user' + the step context
 * - an erroring corpus shows an inline "Not saved:" message and does not throw
 * - editable surfaces (sl-title, sl-text) feed into the composed prompt
 * - redraft popup (what-differently-input + redraft-btn) appears when previewActive
 *   and sends a Correction: prompt on re-draft
 * - Discard clears preview and hides popup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { defaultWorkspaceState } from '../../workspace/types'
import { StepLocalizationPane } from './StepLocalizationPane'

// --- Static mocks for the heavy machinery the pane composes. ----------------

const mocks = vi.hoisted(() => ({
  commitPreview: vi.fn(),
  clearPreview: vi.fn(),
  send: vi.fn(),
  saveCorpusEntry: vi.fn(),
  setPreview: vi.fn(),
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
      commitPreview: mocks.commitPreview,
      clearPreview: mocks.clearPreview,
      setPreview: mocks.setPreview,
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

// Replace the real TipTap ChatInput with a thin mock that surfaces onSend so we
// can drive a localization instruction deterministically in jsdom.
vi.mock('../ai/ChatInput', () => ({
  ChatInput: (props: { onSend: (text: string) => void }) => {
    return (
      <button type="button" data-testid="chat-send-mock" onClick={() => props.onSend('use the QuantStudio 5')}>
        send
      </button>
    )
  },
}))

// Mock EditableProtocolText — renders a testid and a button that fires onChange('edited').
vi.mock('../../../run/protocol-planning/EditableProtocolText', () => ({
  EditableProtocolText: (props: { testId?: string; initial: string; onChange: (t: string) => void }) => {
    return (
      <div data-testid={props.testId ?? 'editable-protocol-text'}>
        <input
          type="text"
          defaultValue={props.initial}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <button type="button" data-testid={`${props.testId}-edit`} onClick={() => props.onChange('edited')}>
          edit
        </button>
      </div>
    )
  },
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

vi.mock('../../../shared/api/client', () => ({
  apiClient: { saveCorpusEntry: mocks.saveCorpusEntry },
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
  mocks.commitPreview.mockReset()
  mocks.clearPreview.mockReset()
  mocks.saveCorpusEntry.mockReset()
  mocks.setPreview.mockReset()
  mocks.useChatThread.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('StepLocalizationPane corpus save', () => {
  it('does not render Save-to-corpus initially', () => {
    renderPane()
    expect(screen.queryByTestId('step-localization-save')).toBeNull()
    expect(screen.getByTestId('step-localization-accept')).not.toBeNull()
  })

  it('still hides Save after only an instruction (no accept yet)', () => {
    renderPane()
    fireEvent.click(screen.getByTestId('chat-send-mock'))
    expect(mocks.send).toHaveBeenCalled()
    expect(screen.queryByTestId('step-localization-save')).toBeNull()
  })

  it('shows Save after instruction + accept and posts a protocol-loop entry', async () => {
    mocks.saveCorpusEntry.mockResolvedValue({ ok: true, entryId: 'ENT-1', deduped: false })
    renderPane()

    // 1. user sends a localization instruction
    fireEvent.click(screen.getByTestId('chat-send-mock'))
    // 2. user Accepts the ghost (commitPreview snapshots the committed graph)
    fireEvent.click(screen.getByTestId('step-localization-accept'))
    expect(mocks.commitPreview).toHaveBeenCalled()

    // 3. Save button appears; click it
    const saveBtn = screen.getByTestId('step-localization-save')
    expect(saveBtn).not.toBeNull()
    fireEvent.click(saveBtn)

    expect(mocks.saveCorpusEntry).toHaveBeenCalledTimes(1)
    const entry = mocks.saveCorpusEntry.mock.calls[0]![0]
    expect(entry.source).toBe('protocol-loop')
    expect(entry.sourceType).toBe('app')
    expect(entry.confirmedBy).toBe('user')
    expect(entry.prompt.step_context.stepId).toBe('S2')
    expect(entry.prompt.step_context.stepLabel).toBe('Incubate')
    expect(entry.prompt.step_context.stepText).toBe('Incubate at 37C')
    expect(entry.acceptedGraph.events).toBeDefined()

    // inline success message
    expect(await screen.findByTestId('step-localization-save-msg')).not.toBeNull()
    expect(screen.getByTestId('step-localization-save-msg').textContent).toContain('Saved to corpus')
  })

  it('reports a corpus error inline without throwing', async () => {
    mocks.saveCorpusEntry.mockResolvedValue({ ok: false, error: 'http_503' })
    renderPane()
    fireEvent.click(screen.getByTestId('chat-send-mock'))
    fireEvent.click(screen.getByTestId('step-localization-accept'))
    fireEvent.click(screen.getByTestId('step-localization-save'))

    const msg = await screen.findByTestId('step-localization-save-msg')
    expect(msg.textContent).toContain('Not saved')
    expect(msg.textContent).toContain('http_503')
  })

  it('reports a thrown save error inline without breaking the pane', async () => {
    mocks.saveCorpusEntry.mockRejectedValue(new Error('ECONNREFUSED'))
    renderPane()
    fireEvent.click(screen.getByTestId('chat-send-mock'))
    fireEvent.click(screen.getByTestId('step-localization-accept'))
    fireEvent.click(screen.getByTestId('step-localization-save'))

    const msg = await screen.findByTestId('step-localization-save-msg')
    expect(msg.textContent).toContain('Not saved')
    expect(msg.textContent).toContain('ECONNREFUSED')
  })
})

describe('StepLocalizationPane editable surfaces', () => {
  it('renders sl-title and sl-text EditableProtocolText mocks', () => {
    renderPane()
    expect(screen.getByTestId('sl-title')).not.toBeNull()
    expect(screen.getByTestId('sl-text')).not.toBeNull()
  })

  it('sends edited title + full text + instruction in the composed prompt', () => {
    renderPane()

    // Trigger the mock EditableProtocolText onChange('edited') buttons
    fireEvent.click(screen.getByTestId('sl-title-edit'))
    fireEvent.click(screen.getByTestId('sl-text-edit'))

    // Send instruction via the mock ChatInput
    fireEvent.click(screen.getByTestId('chat-send-mock'))

    expect(mocks.send).toHaveBeenCalledTimes(1)
    const sentPrompt = mocks.send.mock.calls[0]![0]

    // The composed prompt should contain the edited title (since titleText='edited' overrides step.label)
    expect(sentPrompt).toContain('edited')

    // It should also contain 'Full step text:' with the edited full text
    expect(sentPrompt).toContain('Full step text: "edited"')

    // And the instruction from the mock ChatInput
    expect(sentPrompt).toContain('use the QuantStudio 5')
  })
})

describe('StepLocalizationPane redraft popup', () => {
  it('shows what-differently-input and redraft-btn when previewActive', () => {
    renderPane()
    // The mock editor state has previewEvents, so previewActive is true
    expect(screen.getByTestId('sl-popup')).not.toBeNull()
    expect(screen.getByTestId('what-differently-input')).not.toBeNull()
    expect(screen.getByTestId('redraft-btn')).not.toBeNull()
  })

  it('typing into what-differently-input then clicking redraft-btn sends a Correction: prompt and clears input', () => {
    renderPane()

    // First send a localization instruction so lastInstruction is set
    fireEvent.click(screen.getByTestId('chat-send-mock'))

    // Type into the what-differently textarea
    const input = screen.getByTestId('what-differently-input')
    fireEvent.change(input, { target: { value: 'use a 96-well plate instead' } })

    // Click the redraft button
    const redraftBtn = screen.getByTestId('redraft-btn')
    fireEvent.click(redraftBtn)

    // Verify the second call to mockSend contains 'Correction:' and the entered text
    expect(mocks.send).toHaveBeenCalledTimes(2)
    const redraftCall = mocks.send.mock.calls[1]![0]
    expect(redraftCall).toContain('Correction:')
    expect(redraftCall).toContain('use a 96-well plate instead')

    // Verify the input was cleared
    expect((input as HTMLTextAreaElement).value).toBe('')
  })

  it('redraft-btn is disabled when what-differently-input is empty', () => {
    renderPane()
    const redraftBtn = screen.getByTestId('redraft-btn')
    expect(redraftBtn).toBeDisabled()
  })
})

describe('StepLocalizationPane discard', () => {
  it('Discard calls clearPreview', () => {
    renderPane()
    fireEvent.click(screen.getByTestId('step-localization-discard'))
    expect(mocks.clearPreview).toHaveBeenCalled()
  })
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
