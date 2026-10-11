/**
 * SHORTHAND-CORPUS WS1 — the chat-Accept corpus leg.
 *
 * Accepting a shorthand proposal (stubbed flow) must fire-and-forget EXACTLY
 * ONE POST to the existing /intent/training-pair seam carrying:
 *   - userPrompt  = the prompt that produced the draft,
 *   - shorthandYaml = the accepted document VERBATIM (the client is render +
 *     POST only — it never parses; the server owns decode + lift + Ajv),
 *   - acceptedGraph = the committed preview events + labwares as PROVENANCE
 *     ONLY (never the target),
 *   - confirmedAt.
 * A draft WITHOUT shorthand captures nothing. A failed post never touches the
 * Accept (fire-and-forget, mirrors eventGraphPersistence's corpus leg).
 *
 * Harness: the option-capturing `useChatThread` seam + mocked editor stack
 * (AiTabPanel.runPageSurface.test.tsx pattern) + a mocked apiClient seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 0,
      fingerprints: [''],
      getPage: () => Promise.resolve(null),
      destroy: () => undefined,
    }),
    destroy: () => undefined,
  })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class {
    render() {
      return Promise.resolve()
    }
  },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  chatOptions: null as null | {
    onDraftResult?: (result: unknown, prompt: string) => void
  },
  editor: { current: null as unknown },
  editorActions: {
    setPreview: vi.fn(),
    clearPreview: vi.fn(),
    commitPreview: vi.fn(),
    consumeRetryPrompt: vi.fn(),
    setGraphLemurSource: vi.fn(),
  },
  api: {
    intentTrainingPair: vi.fn(async (_body: Record<string, unknown>) => ({ ok: false, error: 'corpus.disabled' })),
    warmAiContext: vi.fn(async () => null),
    getAiWarmStatus: vi.fn(async () => null),
    intentCompile: vi.fn(async () => ({})),
    getSurfaces: vi.fn(async () => ({ surfaces: [] })),
    listAiProfiles: vi.fn(async () => ({ profiles: [] })),
  },
}))

vi.mock('./useChatThread', () => ({
  useChatThread: (options: {
    onDraftResult?: (result: unknown, prompt: string) => void
  }) => {
    mocks.chatOptions = options
    return {
      state: { messages: [], pending: null, status: null, error: null },
      isStreaming: false,
      send: vi.fn(async () => undefined),
      stop: vi.fn(),
      reset: vi.fn(),
      clearProtocolCandidate: vi.fn(),
    }
  },
}))

// Mock ONLY the editor seam: the panel reads the deck stack through
// useOptionalEventEditor; everything else in the module stays real.
vi.mock('../../EventEditorContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../EventEditorContext')>()
  return { ...actual, useOptionalEventEditor: () => mocks.editor.current }
})

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => null,
}))

// The corpus leg rides apiClient.intentTrainingPair — mock the client seam
// (the only apiClient consumers in this render graph are the panel's warm/
// compile/capture legs + ModelSwitcher's lazy profile calls).
vi.mock('../../../shared/api/client', () => ({
  apiClient: mocks.api,
}))

import { AiTabPanel } from './AiTabPanel'

const SHORTHAND_YAML = [
  'intentId: chat-dmem-feed',
  'actions:',
  '  - action: add_material',
  '    material: DMEM',
  '    volumeUl: 100',
  '    targetWells: [A1]',
  '',
].join('\n')

const DRAFT_PROMPT = 'add 100uL of DMEM to A1'

function mountDeckEditor(stateOverrides: Record<string, unknown> = {}) {
  mocks.editor.current = {
    state: {
      platforms: [],
      platformId: 'opentrons-flex',
      variantId: 'flex-1',
      placements: [],
      labwares: {},
      events: [],
      selection: null,
      focusPlacementId: null,
      vocabPackId: 'default',
      runId: 'RUN-2026-10-11-run-corpus',
      eventGraphId: 'EVG-RUN-GRAPH',
      preview: null,
      ...stateOverrides,
    },
    actions: mocks.editorActions,
  }
}

function panelTree() {
  const base = defaultWorkspaceState('STU-000001')
  return (
    <MemoryRouter>
      <OpenTabsProvider>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: base as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>
  )
}

function renderPanel() {
  return render(panelTree())
}

async function emitDraft(result: unknown, prompt = DRAFT_PROMPT) {
  await act(async () => {
    mocks.chatOptions?.onDraftResult?.(result, prompt)
  })
}

/** Mount a ghost preview on the mocked editor (what the draft flow lands)
 *  and re-render so the panel sees previewActive. */
function mountPreview(rerender: (ui: ReturnType<typeof panelTree>) => void) {
  const mounted = mocks.editor.current as { state: Record<string, unknown> }
  mounted.state.preview = {
    previewLabwares: {},
    previewEquipments: {},
    previewPlacements: [],
    previewEvents: [
      { eventId: 'ev-dmem', event_type: 'deposit_wells', details: { targetWells: ['A1'] } },
    ],
  }
  rerender(panelTree())
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
  mocks.editor.current = null
  vi.clearAllMocks()
  mocks.api.intentTrainingPair.mockResolvedValue({ ok: false, error: 'corpus.disabled' })
})

describe('SHORTHAND-CORPUS WS1 — chat Accept captures the pair', () => {
  it('Accepting a shorthand proposal posts EXACTLY ONE training pair: verbatim shorthandYaml + provenance graph', async () => {
    mountDeckEditor()
    const { rerender } = renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft({
      success: true,
      events: [{ eventId: 'ev-dmem', event_type: 'deposit_wells', details: { targetWells: ['A1'] } }],
      shorthand: SHORTHAND_YAML,
    })
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    mountPreview(rerender)
    await screen.findByTestId('changes-panel')

    fireEvent.click(screen.getByTestId('changes-apply'))

    // ONE POST to the existing seam.
    expect(mocks.api.intentTrainingPair).toHaveBeenCalledTimes(1)
    const body = mocks.api.intentTrainingPair.mock.calls[0]![0] as Record<string, unknown>
    // The prompt that produced the draft.
    expect(body.userPrompt).toBe(DRAFT_PROMPT)
    // The accepted document VERBATIM — the client posted the string untouched
    // (no parse, no normalization: byte-identical to the panel content).
    expect(body.shorthandYaml).toBe(SHORTHAND_YAML)
    // The chat leg sends NO localMacro object — the YAML string IS the arm.
    expect('localMacro' in body).toBe(false)
    // Provenance-only graph: the committed preview events + labwares ride
    // acceptedGraph; nothing else claims the target role.
    expect(body.acceptedGraph).toMatchObject({
      events: [expect.objectContaining({ eventId: 'ev-dmem' })],
      labwares: {},
    })
    expect(typeof body.confirmedAt).toBe('string')
    // The Accept itself still behaves exactly as before.
    expect(mocks.editorActions.commitPreview).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('chat-input')).toBeTruthy()
  })

  it('a draft WITHOUT shorthand captures nothing (no pair, Accept unchanged)', async () => {
    mountDeckEditor()
    const { rerender } = renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft({
      success: true,
      events: [{ eventId: 'ev-plain', event_type: 'deposit_wells', details: { targetWells: ['B2'] } }],
    })
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    mountPreview(rerender)
    await screen.findByTestId('changes-panel')

    fireEvent.click(screen.getByTestId('changes-apply'))

    expect(mocks.api.intentTrainingPair).not.toHaveBeenCalled()
    expect(mocks.editorActions.commitPreview).toHaveBeenCalledTimes(1)
  })

  it('a failed capture POST never touches the Accept (fire-and-forget)', async () => {
    mountDeckEditor()
    const { rerender } = renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    mocks.api.intentTrainingPair.mockRejectedValueOnce(new Error('network down'))

    await emitDraft({
      success: true,
      events: [{ eventId: 'ev-dmem', event_type: 'deposit_wells', details: { targetWells: ['A1'] } }],
      shorthand: SHORTHAND_YAML,
    })
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    mountPreview(rerender)
    await screen.findByTestId('changes-panel')

    await act(async () => {
      fireEvent.click(screen.getByTestId('changes-apply'))
    })

    // The capture fired and failed…
    expect(mocks.api.intentTrainingPair).toHaveBeenCalledTimes(1)
    // …and the Accept completed exactly as it always has.
    expect(mocks.editorActions.commitPreview).toHaveBeenCalledTimes(1)
    expect(await screen.findByTestId('chat-input')).toBeTruthy()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).toBe('AI Assistant')
  })
})
