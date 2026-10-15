/**
 * SH-QB-1 — the client leg of "Save & Re-compile": NO silent empty, and the
 * request carries the editor's exact YAML + deck plates.
 *
 * THE BUG (tally F2, pastes #4/#8): a zero-event recompile (the server bars
 * the deck plate as unknown-noun, drops the clarifications, 200s
 * {outcome:'needs-clarification', terminalArtifacts:{events:[],gaps:[]}})
 * fell through to `draft-ready` with changes:[] and warnings:[] — an EMPTY
 * preview with zero errors. The server alone cannot make the failure VISIBLE;
 * the client invariant is: ZERO events ⇒ the existing verbatim-error arm
 * (setShorthandApply({error})) with a NAMED reason, and the prior proposal
 * stays (OQ2 ruling: the error arm, NOT clarification cards).
 *
 * Pinned here:
 *  T8  no silent empty: zero-event + clarifications ⇒ NO draft-ready with
 *      empty changes; the shorthandApply error surface names the reason; the
 *      prior preview stays untouched.
 *  T9  the request carries the editor's YAML VERBATIM + the deck plate
 *      summaries (structural map of editor.state.labwares — labwareId/name/
 *      labwareType, zero name literals); with NO plates the deckLabwares key
 *      is ABSENT (exactOptionalPropertyTypes: never `undefined`).
 *  T10 non-empty recompile keeps today's draft-ready + gaps-as-warnings.
 *
 * Harness: the AiTabPanel.chatCorpus.test.tsx idiom (option-capturing
 * useChatThread seam + mocked editor stack + mocked apiClient seam).
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
    intentCompile: vi.fn(async (_yaml: string, _deck?: unknown) => ({})),
    warmAiContext: vi.fn(async () => null),
    getAiWarmStatus: vi.fn(async () => null),
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

// Mock ONLY the editor seam: the panel reads the deck through
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

vi.mock('../../../shared/api/client', () => ({
  apiClient: mocks.api,
}))

import { AiTabPanel } from './AiTabPanel'

const SHORTHAND_YAML = [
  'intentId: shqb1-client-leg',
  'actions:',
  '  - action: add_material',
  '    labware: plate1',
  '    volumeUl: 100',
  '    targetWells: [A1]',
  '',
].join('\n')

const DRAFT_PROMPT = 'add 100ul of the mixture to plate1'

/** A compiled event shaped like the route's terminalArtifacts.events entry
 *  (deck-bound details.labwareId — the ghost bucket key). */
const GHOST_EVENT = {
  eventId: 'evt-add_material-abc12345',
  event_type: 'add_material',
  labwareId: 'lw-deck-plate-1',
  details: { labwareId: 'lw-deck-plate-1', wells: ['A1'], volumeUl: 100 },
}

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
      runId: 'RUN-SHQB1',
      eventGraphId: 'EVG-SHQB1',
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
          loadFn={async () => ({ state: base as ReturnType<typeof defaultWorkspaceState> })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>
  )
}

async function emitDraft(result: unknown, prompt = DRAFT_PROMPT) {
  await act(async () => {
    mocks.chatOptions?.onDraftResult?.(result, prompt)
  })
}

/** Drive the panel into the reviewing state with a shorthand draft (what the
 *  chat draft flow lands), so the ChangesPanel edit affordance is mounted. */
async function mountReviewingDraft() {
  await emitDraft({
    success: true,
    events: [GHOST_EVENT],
    shorthand: SHORTHAND_YAML,
  })
  await screen.findByTestId('changes-panel')
}

/** Drive the REAL affordance: Edit shorthand -> Save & recompile with NO
 *  text change (the F2 recipe). The POSTed text is the textarea's content —
 *  byte-identical to SHORTHAND_YAML because the edit is a no-op. */
async function saveAndRecompileUnedited() {
  fireEvent.click(screen.getByTestId('shorthand-edit'))
  const editorEl = screen.getByTestId('shorthand-editor') as HTMLTextAreaElement
  expect(editorEl.value).toBe(SHORTHAND_YAML)
  await act(async () => {
    fireEvent.click(screen.getByTestId('shorthand-recompile'))
  })
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
  mocks.editor.current = null
  vi.clearAllMocks()
  mocks.api.intentCompile.mockResolvedValue({})
})

describe('SH-QB-1 T8 — a zero-event recompile fails LOUDLY, never a silent empty preview', () => {
  it('zero events + clarifications: NO draft-ready over an empty change list; the error surface names the reason; the prior proposal stays', async () => {
    mountDeckEditor()
    render(panelTree())
    await mountReviewingDraft()
    const changesBefore = screen.getByTestId('changes-panel')
    expect(changesBefore.textContent).toContain('add_material')
    const setPreviewCallsBefore = mocks.editorActions.setPreview.mock.calls.length

    // The exact F2 wire shape (post-fix server): 200, zero events, zero gaps,
    // the structured bar forwarded.
    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'needs-clarification',
      terminalArtifacts: { events: [], gaps: [] },
      clarifications: [
        {
          label: 'plate1',
          reason: 'unknown-noun',
          actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' },
        },
      ],
    })

    await saveAndRecompileUnedited()

    // The visible error names the reason (label + reason verbatim) — never a
    // generic default when a structured reason exists. OQ2: this rides the
    // EXISTING shorthandApply error arm (data-testid shorthand-error) — zero
    // new surface, no clarification cards.
    const error = await screen.findByTestId('shorthand-error')
    expect(error.textContent).toContain('plate1')
    expect(error.textContent).toContain('unknown-noun')

    // NO silent empty: the prior proposal stays actionable — the changes panel
    // still shows the original event and the preview was NOT overwritten with
    // an empty one.
    expect(screen.getByTestId('changes-panel').textContent).toContain('add_material')
    expect(screen.getByText('Apply to run')).toBeTruthy()
    expect(mocks.editorActions.setPreview.mock.calls.length).toBe(setPreviewCallsBefore)
  })

  it("zero events with NO structured reason either: still errors with the outcome named ('no events' IS the zero-ghost condition)", async () => {
    mountDeckEditor()
    render(panelTree())
    await mountReviewingDraft()

    // The pre-fix wire shape (clarifications dropped): the client guard must
    // still fail loudly from the outcome alone.
    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'needs-clarification',
      terminalArtifacts: { events: [], gaps: [] },
    })

    await saveAndRecompileUnedited()

    const error = await screen.findByTestId('shorthand-error')
    expect(error.textContent).toContain('no events')
    expect(error.textContent).toContain('needs-clarification')
    expect(screen.getByText('Apply to run')).toBeTruthy()
  })

  it("outcome 'complete' with zero events STILL errors (a zero-ghost is a zero-ghost)", async () => {
    mountDeckEditor()
    render(panelTree())
    await mountReviewingDraft()

    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'complete',
      terminalArtifacts: { events: [], gaps: [] },
    })

    await saveAndRecompileUnedited()

    const error = await screen.findByTestId('shorthand-error')
    expect(error.textContent).toContain('no events')
    expect(screen.getByText('Apply to run')).toBeTruthy()
  })

  it('a gap-shaped zero-event compile surfaces the gap message as the named reason (no fine-print-only warnings)', async () => {
    mountDeckEditor()
    render(panelTree())
    await mountReviewingDraft()

    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'gap',
      terminalArtifacts: {
        events: [],
        gaps: [{ message: 'No lowering consumer for the declared volume' }],
      },
    })

    await saveAndRecompileUnedited()

    const error = await screen.findByTestId('shorthand-error')
    expect(error.textContent).toContain('No lowering consumer for the declared volume')
    expect(screen.getByText('Apply to run')).toBeTruthy()
  })
})

describe('SH-QB-1 T9 — the recompile request carries the editor YAML verbatim + the deck plates', () => {
  it('intentCompile receives the UNTOUCHED editor YAML and the structural deck summaries (labwareId/name/labwareType)', async () => {
    mountDeckEditor({
      labwares: {
        'lw-deck-plate-1': {
          labwareId: 'lw-deck-plate-1',
          labwareType: 'plate_96',
          name: 'plate1',
          addressing: { kind: 'grid', rows: 8, columns: 12 },
          geometry: { totalWells: 96 },
        },
      },
    })
    render(panelTree())
    await mountReviewingDraft()

    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'complete',
      terminalArtifacts: { events: [GHOST_EVENT], gaps: [] },
    })

    await saveAndRecompileUnedited()

    expect(mocks.api.intentCompile).toHaveBeenCalledTimes(1)
    const [yamlArg, deckArg] = mocks.api.intentCompile.mock.calls[0]!
    // The YAML is byte-identical to what the panel holds — the client never
    // parses, edits, or re-grounds it.
    expect(yamlArg).toBe(SHORTHAND_YAML)
    // The deck plates ride as the frozen DeckLabwareSummary mirror — a
    // structural pick of the editor's labwares, zero name literals.
    expect(deckArg).toEqual([
      { labwareId: 'lw-deck-plate-1', labwareType: 'plate_96', name: 'plate1' },
    ])
  })

  it('an editor with NO plates sends NO deck argument (key absent, never undefined)', async () => {
    mountDeckEditor({ labwares: {} })
    render(panelTree())
    await mountReviewingDraft()

    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'complete',
      terminalArtifacts: { events: [GHOST_EVENT], gaps: [] },
    })

    await saveAndRecompileUnedited()

    const call = mocks.api.intentCompile.mock.calls[0]!
    // exactOptionalPropertyTypes arm: the second argument is not passed at
    // all — a `undefined` second arg would materialize the body key.
    expect(call.length).toBe(1)
  })
})

describe('SH-QB-1 T10 — a non-empty recompile keeps today\'s draft-ready flow (no regression)', () => {
  it('non-empty events: draft-ready fires with the compiled changes, gaps ride as warnings, carried clarifications ride as warnings too', async () => {
    mountDeckEditor()
    render(panelTree())
    await mountReviewingDraft()

    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'gap',
      terminalArtifacts: {
        events: [GHOST_EVENT],
        gaps: [{ message: 'A non-blocking residue' }],
      },
      clarifications: [{ label: 'somewhere', reason: 'ambiguous-noun' }],
    })

    await saveAndRecompileUnedited()

    // The review surface refreshed with the NEW proposal (draft-ready), the
    // gap + the carried clarification both visible as warnings.
    const panel = await screen.findByTestId('changes-panel')
    expect(panel.textContent).toContain('A non-blocking residue')
    expect(panel.textContent).toContain('somewhere')
    expect(panel.textContent).toContain('ambiguous-noun')
    // No error surface on a non-empty compile.
    expect(screen.queryByTestId('shorthand-error')).toBeNull()
    // The preview was rewritten with the new events.
    expect(mocks.editorActions.setPreview).toHaveBeenCalledTimes(1)
  })
})
