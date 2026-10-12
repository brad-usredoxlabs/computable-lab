/**
 * PROTO-AI-9 surface fix + R-Defect-1 / R-Defect-2 regression suite.
 *
 * The run page (`RunWorkspacePage`) wraps the chat pane in the FULL deck
 * stack (`EventEditorProvider` + protocol loader) regardless of the
 * workspace's ACTIVE tab, which `defaultWorkspaceState` seeds as
 * `project-details`. Architect ruling (option d, 2026-10-05): while the deck
 * editor is mounted, the chat must send on the DECK surface — the pane the
 * campaign built protocol editing for — and the deck template's graph fields
 * must fill via the `activeEventGraphId` fallback. Every other tab
 * (pdf/document/other, no deck editor mounted) stays byte-identical.
 *
 * R-Defect-1: a failed/error draft result must return the pane to chat
 * (ready) with the error visible in the log — never open an empty actionable
 * "Review changes" panel.
 * R-Defect-2: an Apply with no protocol proposal AND no mounted preview must
 * not enter `committing` (which kills the chat input with no UI exit); a real
 * preview still commits exactly once and the input comes back.
 *
 * `useChatThread` is mocked with an option-capturing seam (same pattern as
 * AiTabPanel.protocolEdit.test.tsx); the event-editor seam is mocked to a
 * minimal mounted deck stack so the test can pin surface + context without a
 * live editor.
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
    surface?: string
    context?: Record<string, unknown>
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
}))

vi.mock('./useChatThread', () => ({
  useChatThread: (options: {
    surface?: string
    context?: Record<string, unknown>
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

// No attached protocol here — these tests pin surface routing + review
// robustness; the protocol_edit branch is pinned in
// AiTabPanel.protocolEdit.test.tsx.
vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => null,
}))

import { AiTabPanel } from './AiTabPanel'

/** A minimal mounted deck stack — what EventEditorProvider publishes on the
 *  run page. platformId resolves to no manifest (variant lookup returns
 *  null), which keeps the projection cheap and the test focused. */
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
      runId: 'RUN-2026-09-19-run-vwr8',
      eventGraphId: 'EVG-RUN-GRAPH',
      preview: null,
      ...stateOverrides,
    },
    actions: mocks.editorActions,
  }
}

function renderPanel(
  initialState?: Partial<ReturnType<typeof defaultWorkspaceState>>,
) {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      {/* PB-CH-4: the panel consumes useWorkstateExecutor (needs
          OpenTabsProvider — production mounts it app-wide). */}
      <OpenTabsProvider>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: { ...base, ...(initialState as Record<string, unknown>) } as ReturnType<
              typeof defaultWorkspaceState
            >,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

async function emitDraft(result: unknown, prompt = 'edit the protocol') {
  await act(async () => {
    mocks.chatOptions?.onDraftResult?.(result, prompt)
  })
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
  mocks.editor.current = null
  vi.clearAllMocks()
})

describe('run-page surface routing (PROTO-AI-9 ruling)', () => {
  it('deck editor mounted + non-deck active tab sends workspace.deck (NOT project-details)', async () => {
    // The run-page shape: default workspace state (active tab
    // details:<studyId>) with the deck stack mounted underneath.
    mountDeckEditor()
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    expect(mocks.chatOptions?.surface).toBe('workspace.deck')
    // The sent context follows the same corrected prompt identity…
    expect(mocks.chatOptions?.context?.systemPromptId).toBe('workspace.deck')
    // …and the deck template's graph field fills from the mounted editor.
    expect(mocks.chatOptions?.context?.activeEventGraphId).toBe('EVG-RUN-GRAPH')
  })

  it('details tab WITHOUT a deck editor keeps project-details (byte-identical)', async () => {
    mocks.editor.current = null
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    expect(mocks.chatOptions?.surface).toBe('workspace.project-details')
    expect(mocks.chatOptions?.context?.activeEventGraphId).toBeNull()
  })

  it('pdf tab without a deck editor keeps protocol-builder (byte-identical)', async () => {
    mocks.editor.current = null
    renderPanel({
      tabs: [{ id: 't-pdf', kind: 'pdf', artifactId: 'ART-1', title: 'Kit manual' }],
      activeTabId: 't-pdf',
    })
    await screen.findByTestId('ai-tab-system-prompt')

    expect(mocks.chatOptions?.surface).toBe('protocol-builder')
    expect(mocks.chatOptions?.context?.activeEventGraphId).toBeNull()
  })

  it('deck active tab unchanged: deck surface + the TAB eventGraphId wins over editor state', async () => {
    mountDeckEditor()
    renderPanel({
      tabs: [{ id: 't1', kind: 'deck', eventGraphId: 'EVG-TAB', title: 'Deck' }],
      activeTabId: 't1',
    })
    await screen.findByTestId('ai-tab-system-prompt')

    expect(mocks.chatOptions?.surface).toBe('workspace.deck')
    expect(mocks.chatOptions?.context?.activeEventGraphId).toBe('EVG-TAB')
  })
})

describe('R-Defect-1 — a failed draft returns to chat, never an empty review', () => {
  it('an error-bearing draft result leaves the sidebar ready with no changes panel', async () => {
    mountDeckEditor()
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    // The schema-rejection shape: a `done` result carrying `error` and
    // nothing actionable (assistStream renders "Draft failed: …" in the log).
    await emitDraft({ error: 'schema rejection — No ops were applied', events: [] })

    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).toBe('AI Assistant')
    // The biologist can keep talking — the input is enabled.
    expect(screen.getByTestId('chat-input')).toBeTruthy()
    // Nothing ghosts onto the deck from a failed turn.
    expect(mocks.editorActions.setPreview).not.toHaveBeenCalled()
  })
})

describe('R-Defect-2 — Apply can never strand the pane in committing', () => {
  it('Apply with no proposal and no mounted preview stays usable (never committing)', async () => {
    mountDeckEditor()
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    // A legitimate empty draft (no events, no clarification) still opens the
    // review panel — but its Apply must be a harmless no-op, not a one-way
    // door into `committing` (which hides the chat input with no exit).
    await emitDraft({ events: [] })
    const apply = await screen.findByTestId('changes-apply')
    fireEvent.click(apply)

    expect(screen.getByTestId('ai-tab-system-prompt').textContent).toBe('AI Assistant')
    expect(screen.getByTestId('chat-input')).toBeTruthy()
    expect(screen.queryByText('Applying…')).toBeNull()
    expect(mocks.editorActions.commitPreview).not.toHaveBeenCalled()
  })

  it('Apply with a mounted preview still commits exactly once and the input returns', async () => {
    mountDeckEditor()
    const { rerender } = renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft({
      events: [{ eventId: 'ev1', event_type: 'deposit_wells', details: { targetWells: ['A1'] } }],
    })
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()

    // The real flow promotes a ghost preview (editorState.preview); mirror
    // that landing, then re-render so the panel sees the mounted preview.
    const mounted = mocks.editor.current as { state: Record<string, unknown> }
    mounted.state.preview = {
      previewLabwares: {},
      previewEquipments: {},
      previewPlacements: [
        {
          placementId: 'pl-preview-1',
          labwareId: 'lw-1',
          location: { kind: 'lawn', xMm: 0, yMm: 0 },
          orientation: 'landscape',
        },
      ],
      previewEvents: [],
    }
    rerender(
      <MemoryRouter>
        <OpenTabsProvider>
          <WorkspaceProvider
            studyId="STU-000001"
            saveDebounceMs={0}
            loadFn={async () => ({
              state: defaultWorkspaceState('STU-000001'),
            })}
            saveFn={async (_id, s) => ({ state: s })}
          >
            <AiTabPanel />
          </WorkspaceProvider>
        </OpenTabsProvider>
      </MemoryRouter>,
    )
    await screen.findByTestId('changes-panel')

    fireEvent.click(screen.getByTestId('changes-apply'))

    expect(mocks.editorActions.commitPreview).toHaveBeenCalledTimes(1)
    // The bounded reset: the pane comes back to chat after the commit.
    expect(await screen.findByTestId('chat-input')).toBeTruthy()
    expect(screen.getByTestId('ai-tab-system-prompt').textContent).toBe('AI Assistant')
  })
})
