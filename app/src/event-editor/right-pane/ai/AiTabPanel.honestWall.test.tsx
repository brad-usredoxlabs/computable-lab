/**
 * REVISE-GHOST-1 — the honest wall (spec §4B.3, verified-by (3)):
 * a `{success:true, events:[]}` done result with NO clarificationRequests and
 * NO error is a REPORTED failure — never an actionable review.
 *
 * The defect shape (spec §5 replay): the swallowed-events leg returned
 * success:true + events:[] + cards; once the reuse fix removes the spurious
 * cards (or any future leg succeeds with nothing mountable and nothing to
 * ask), the panel must NOT park the sidebar in 'reviewing' over an empty
 * change list with an actionable 'Apply to run'. Per OQ-2 + PB-CH-4 D1:
 * sidebar reset + a visible failure line naming what the turn delivered
 * (shorthand-only? notes? nothing?) + the chat stays usable.
 *
 * Negative pins: the LEGITIMATE hold (events:[] WITH cards) still renders
 * the questions view — the wall does NOT fire on a hold; and a result
 * WITHOUT the success key (the hand-authored empty draft, the R-Defect-2
 * pin in runPageSurface) keeps its existing behavior.
 *
 * Harness: the option-capturing `useChatThread` seam (the
 * AiTabPanel.shorthandClarification.test.tsx pattern) — the test emits a
 * draft result exactly like the SSE `done` event does and drives the REAL
 * onDraftResult.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import type { PlatformManifest } from '../../../types/platformRegistry'
import type { AiClarificationRequest } from '../../../types/ai'

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
  chatOptions: null as null | { onDraftResult?: (result: unknown, prompt: string) => void },
  editorActions: {
    setPreview: vi.fn(),
    clearPreview: vi.fn(),
    commitPreview: vi.fn(),
    consumeRetryPrompt: vi.fn(),
    setGraphLemurSource: vi.fn(),
  },
  editor: { current: null as unknown },
  api: {
    intentCompile: vi.fn(async () => ({})),
    warmAiContext: vi.fn(async () => null),
    getAiWarmStatus: vi.fn(async () => null),
    getSurfaces: vi.fn(async () => ({ surfaces: [] })),
    listAiProfiles: vi.fn(async () => ({ profiles: [] })),
  },
}))

vi.mock('./useChatThread', () => ({
  useChatThread: (options: { onDraftResult?: (result: unknown, prompt: string) => void }) => {
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

vi.mock('../../EventEditorContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../EventEditorContext')>()
  return { ...actual, useOptionalEventEditor: () => mocks.editor.current }
})

vi.mock('../../protocol/ProtocolSelectionContext', () => ({
  NO_PROTOCOL_RESOURCES: { labwares: [], equipment: [] },
  NO_LABWARE_BINDINGS: {},
  useProtocolSelection: () => null,
}))

// The OQ-3 pin test drives the recompile leg — mock the apiClient seam
// (the only apiClient consumers in this render graph).
vi.mock('../../../shared/api/client', () => ({ apiClient: mocks.api }))

import { AiTabPanel } from './AiTabPanel'

const SHORTHAND_YAML = [
  'intentId: seed-hepg2-trypsin-dmem-fbs-32wells',
  'actions:',
  '  - action: add_material',
  '    labware: Seeding plate',
  '    material: Test Reagent',
  '    volumeUl: 50',
  '    targetWells: [A1:D8]',
  '',
].join('\n')

const CLARIFICATION: AiClarificationRequest = {
  id: 'unresolved-c-0123456789',
  kind: 'material',
  prompt: 'The draft names "Test Reagent" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.',
  menuProvider: '/m',
  query: 'Test Reagent',
  options: [],
  allowCreateLocal: true,
}

function renderPanel() {
  const base = defaultWorkspaceState('STU-000001')
  return render(
    <MemoryRouter>
      <OpenTabsProvider>
        <WorkspaceProvider
          studyId="STU-000001"
          saveDebounceMs={0}
          loadFn={async () => ({
            state: {
              ...base,
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-rg1-wall', title: 'Deck' }],
              activeTabId: 't1',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>,
  )
}

// FIX 1 (advc cycle-1 D1): the proposal-bearing negatives need a deck editor
// mounted so the REAL buildPreviewFromDraft runs through the seam (the
// ghostRemount freeform-bench pattern: lawn placements validate without a
// physical deck).
const freeformPlatform: PlatformManifest = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_freeform',
  toolTypeIds: [],
  modules: [],
  variants: [{
    id: 'manual_freeform',
    title: 'Manual Bench (freeform)',
    slots: [],
    surface: { kind: 'lawn', widthMm: 1200, heightMm: 800 },
  }],
}

function mountDeckEditor() {
  mocks.editor.current = {
    state: {
      platforms: [freeformPlatform],
      platformId: 'manual',
      variantId: 'manual_freeform',
      placements: [],
      labwares: {},
      events: [],
      selection: null,
      focusPlacementId: null,
      vocabPackId: 'liquid-handling/v1',
      eventGraphId: 'EVG-rg1-wall',
      preview: null,
    },
    actions: mocks.editorActions,
  }
}

async function emitDraft(result: Record<string, unknown>, prompt = 'Actually make it 32 wells instead, keep the rest the same.') {
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

describe('REVISE-GHOST-1 — the honest wall: success + zero events + zero cards is a REPORTED failure', () => {
  it('a shorthand-only zero-event zero-card success renders a reported failure naming the shortfall; NO changes panel, NO actionable Apply, no ghost set', async () => {
    renderPanel()
    await emitDraft({
      success: true,
      events: [],
      shorthand: SHORTHAND_YAML,
    })

    // The failure line is in the DOM, naming what the turn delivered.
    const wall = await screen.findByTestId('ai-tab-honest-wall')
    expect(wall.getAttribute('role')).toBe('alert')
    expect(wall.textContent).toContain('no events')
    expect(wall.textContent).toContain('shorthand')
    // PB-CH-4 D1: NO actionable review over an empty change list.
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    // Nothing ghosts onto the deck from a turn that mounted nothing.
    expect(mocks.editorActions.setPreview).not.toHaveBeenCalled()
    // The chat stays usable — the biologist can simply retry.
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('a notes-only zero-event zero-card success names the notes as the only delivery', async () => {
    renderPanel()
    await emitDraft({
      success: true,
      events: [],
      notes: ['Draft compiled deterministically from the scientist-intent shorthand.'],
    })
    const wall = await screen.findByTestId('ai-tab-honest-wall')
    expect(wall.textContent).toContain('notes')
    expect(screen.queryByTestId('changes-panel')).toBeNull()
  })

  it('NEGATIVE (bait 6): the legitimate hold — events:[] WITH clarificationRequests — still renders the questions view; the wall does NOT fire', async () => {
    renderPanel()
    await emitDraft({
      success: true,
      events: [],
      clarificationRequests: [CLARIFICATION],
      shorthand: SHORTHAND_YAML,
    })
    // Cards render exactly as before (the clarifications arm is untouched).
    expect(await screen.findByTestId('questions-panel')).toBeTruthy()
    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
    expect(screen.queryByTestId('changes-panel')).toBeNull()
  })

  it('NEGATIVE (R-Defect-2 pin): a result WITHOUT the success key keeps its existing empty-review behavior (the wall is success-keyed)', async () => {
    renderPanel()
    await emitDraft({ events: [] })
    // The pre-existing arm still opens the review panel for a hand-authored
    // empty draft; the honest wall never touches it.
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
  })

  it('the wall belongs to its turn: a later successful draft with events clears it and mounts normally', async () => {
    renderPanel()
    await emitDraft({ success: true, events: [], shorthand: SHORTHAND_YAML })
    expect(await screen.findByTestId('ai-tab-honest-wall')).toBeTruthy()

    await emitDraft({
      success: true,
      events: [{ eventId: 'ev-rg1-ok', event_type: 'deposit_wells', details: { targetWells: ['A1'] } }],
    })
    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
  })

  // OQ-3 PIN (spec §0: OUT of scope — record-only + a pin that today's
  // recompile-path behavior is NOT made worse). Today the zero-LLM recompile
  // REPLACES the preview without re-attaching revisionHistory (the trail drop
  // the spec names at AiTabPanel.tsx:696-705). This test pins that exact
  // today-behavior: the honest wall never touches the recompile leg, and the
  // trail drop is unchanged (a follow-up item may fix it; this item does not).
  it('OQ-3 pin: the recompile path still replaces the preview WITHOUT re-attaching revisionHistory (today-behavior unchanged, wall not applied there)', async () => {
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
        eventGraphId: 'EVG-rg1-wall',
        preview: {
          previewLabwares: {},
          previewEquipments: {},
          previewPlacements: [],
          previewEvents: [{ eventId: 'ev-prev', event_type: 'deposit_wells', details: { targetWells: ['A1'] } }],
          revisionHistory: [{ prompt: 'the first draft', createdAt: '2026-10-22T00:00:00.000Z' }],
        },
      },
      actions: mocks.editorActions,
    }
    renderPanel()
    // Drive the reviewing state with a shorthand draft so the edit affordance
    // mounts (the shorthandRecompile harness recipe).
    await emitDraft({
      success: true,
      events: [{ eventId: 'ev-rg1-recompile', event_type: 'deposit_wells', details: { targetWells: ['A1'] } }],
      shorthand: SHORTHAND_YAML,
    }, 'add 50 uL of Test Reagent to A1')
    await screen.findByTestId('changes-panel')
    const beforeRecompile = mocks.editorActions.setPreview.mock.calls.length

    mocks.api.intentCompile.mockResolvedValueOnce({
      outcome: 'complete',
      terminalArtifacts: {
        events: [{ eventId: 'ev-rg1-recompiled', event_type: 'deposit_wells', details: { targetWells: ['A1', 'B1'] } }],
        gaps: [],
      },
      clarifications: [],
    })
    fireEvent.click(screen.getByTestId('shorthand-edit'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('shorthand-recompile'))
    })

    expect(mocks.editorActions.setPreview.mock.calls.length).toBe(beforeRecompile + 1)
    const recompiled = mocks.editorActions.setPreview.mock.calls[beforeRecompile]![0] as Record<string, unknown>
    // TODAY's behavior, pinned: the recompile carries NO revisionHistory key
    // (the drop). The honest wall did not add one and did not fire here.
    expect('revisionHistory' in recompiled).toBe(false)
    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
  })
})

/**
 * FIX 1 (advc cycle-1 D1, MAJOR): the wall's emptiness predicate must account
 * for ALL non-event deliverable channels a done result can carry. A turn that
 * DID deliver a proposal — recordCreations, labwareAdditions,
 * labwareRequirements, equipmentRequirements, deckLayout, protocolEdit — is NOT
 * empty: the wall must not fire, the sidebar must not reset, and the proposal
 * must still reach its existing draft-ready/preview handling.
 */
describe('REVISE-GHOST-1 fix 1 — the wall does NOT fire on a proposal-bearing success (non-event channels count)', () => {
  it('NEGATIVE (D1): a create_record success (recordCreations non-empty, zero events) does NOT render the wall and still reaches its draft/preview handling', async () => {
    mountDeckEditor()
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft({
      success: true,
      events: [],
      recordCreations: [
        { kind: 'labware', name: 'New 24-well plate', labwareType: 'plate', format: { rows: 6, cols: 4, wellCount: 24 } },
      ],
      alsoPlace: { surface: 'lawn' },
      shorthand: SHORTHAND_YAML,
    }, 'add a new 24-well plate to the bench')

    // The wall never fires: the turn DID deliver a proposal.
    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
    // The proposal reaches its existing handling: draft-ready review opens…
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    // …and the record ghost is built through the real preview seam.
    expect(mocks.editorActions.setPreview).toHaveBeenCalledTimes(1)
    const preview = mocks.editorActions.setPreview.mock.calls[0]![0] as {
      previewPlacements: unknown[]
      recordCreations?: unknown[]
    }
    expect(preview.recordCreations?.length).toBe(1)
    expect(preview.previewPlacements.length).toBeGreaterThan(0)
  })

  it('NEGATIVE (D1): a labwareRequirements-only success (zero events, zero cards) does NOT render the wall and still mounts its ghost', async () => {
    mountDeckEditor()
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft({
      success: true,
      events: [],
      labwareRequirements: [{ classCurie: 'CL:24_well_plate', reason: 'needs a second vessel' }],
    }, 'we also need a 24-well plate')

    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    expect(mocks.editorActions.setPreview).toHaveBeenCalledTimes(1)
    const preview = mocks.editorActions.setPreview.mock.calls[0]![0] as { previewPlacements: unknown[] }
    expect(preview.previewPlacements.length).toBeGreaterThan(0)
  })

  it('NEGATIVE (D1): an equipmentRequirements-only success does NOT render the wall (the channel the server counts)', async () => {
    mountDeckEditor()
    renderPanel()
    await emitDraft({
      success: true,
      events: [],
      equipmentRequirements: [{ classCurie: 'equipment:water_bath', handle: 'bath 55', settings: { temperature_c: 55 } }],
    }, 'add a 55 degree water bath to the bench')

    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    expect(mocks.editorActions.setPreview).toHaveBeenCalledTimes(1)
    const preview = mocks.editorActions.setPreview.mock.calls[0]![0] as { previewPlacements: unknown[] }
    expect(preview.previewPlacements.length).toBeGreaterThan(0)
  })

  it('NEGATIVE (D1): a protocolEdit success with mappable ops does NOT render the wall (the review card is its surface)', async () => {
    renderPanel()
    await emitDraft({
      success: true,
      events: [],
      protocolEdit: { ops: [{ op: 'insert_step', afterStepId: 's1', step: { label: 'wash' } }] },
    }, 'add a wash step after step 1')

    // The protocol-edit arm owns this turn; the wall must not swallow it.
    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
  })

  // Drift pin (the reviewer's "one shared rule so client and server cannot
  // drift"): the client predicate and the server's canonical predicate must
  // count the SAME deliverable channels. The app cannot import server modules
  // across the workspace boundary, so the channel set is pinned mechanically
  // against the server source text — a divergence fails the app suite, not a
  // live dogfood.
  it('DRIFT PIN: the client wall predicate counts exactly the server canonical channel set', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { draftProducedNothing } = await import('./draftEmptiness')
    // vitest runs with cwd = the app workspace (the shorthandCancel suite's
    // resolve(process.cwd(), …) idiom); the server source sits one level up.
    const serverSource = readFileSync(resolve(process.cwd(), '../server/src/ai/draftArgDiagnostics.ts'), 'utf8')
    const serverBody = serverSource.slice(
      serverSource.indexOf('export function agentDraftProducedNothing'),
    )
    const channels = [
      'events', 'clarificationRequests', 'error', 'labwareAdditions',
      'labwareRequirements', 'equipmentRequirements', 'recordCreations',
      'deckLayout', 'protocolEdit',
    ]
    for (const channel of channels) {
      expect(serverBody).toContain(channel)
    }
    // The client predicate behaves as the shared rule on each channel.
    expect(draftProducedNothing({ success: true, events: [] })).toBe(true)
    expect(draftProducedNothing({ success: true, events: [], recordCreations: [{ kind: 'material', name: 'X' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], labwareRequirements: [{ classCurie: 'CL:24_well_plate' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], labwareAdditions: [{ recordId: 'LBW-x' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], equipmentRequirements: [{ classCurie: 'equipment:water_bath' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], deckLayout: { platformId: 'p', variantId: 'v' } })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], protocolEdit: { ops: [{ op: 'x' }] } })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], clarificationRequests: [CLARIFICATION] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], error: 'boom' })).toBe(false)
  })
})
