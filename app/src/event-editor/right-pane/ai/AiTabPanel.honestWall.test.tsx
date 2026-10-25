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
  // FIX 2 (Ruling 1): the protocolEdit arm's jurisdiction is the ATTACHED
  // protocol identity, so the harness must be able to attach one (the
  // AiTabPanel.protocolEdit.test.tsx pattern). null = no protocol attached
  // (every other leg in this file behaves exactly as before).
  protocolIdentity: { current: null as null | { recordId: string; title?: string; sha?: string } },
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
  useProtocolSelection: () => (mocks.protocolIdentity.current
    ? {
        protocol: mocks.protocolIdentity.current,
        steps: [
          { stepId: 'step-seed', label: 'Seed cells', ordinal: 1, kind: 'add_material', description: 'Seed 10k cells per well' },
          { stepId: 'step-read', label: 'Read plate', ordinal: 2, kind: 'read', description: 'Read fluorescence' },
        ],
        resources: {
          labwares: [{ roleId: 'labware_plate', description: 'Culture plate', expectedLabwareKinds: ['lab-plate-96'] }],
          equipment: [],
        },
      }
    : null),
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
  mocks.protocolIdentity.current = null
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

  // FIX 2 (advc cycle-2 Defect 1, Ruling 1): protocolEdit is a CLIENT-SURFACE-
  // AWARE channel. The server emits ops without knowing whether a protocol
  // identity is attached; only the client's protocolEdit arm knows whether the
  // turn reached the protocol-edit review surface. Jurisdiction is ARM ORDER:
  // a mappable envelope (identity attached, diff non-null) dispatches its own
  // protocolDiff draft-ready and RETURNS (AiTabPanel.tsx:514) — it never
  // reaches the wall. The only protocolEdit turn that CAN reach the wall is
  // the fall-through remnant — an identity-less / unmappable envelope — and
  // that remnant delivered NOTHING and MUST wall. Both arms are asserted with
  // their DESTINATION, never wall-absence alone (bait 2).

  it('NEGATIVE (D-b, cycle-2 Defect 1): an identity-less protocolEdit-only success is a nothing-delivered success — the WALL fires; NO changes panel, NO live "Apply to run", no ghost set', async () => {
    // No protocol attached: the arm's identity guard fails, the envelope
    // falls through, and the 7-term predicate judges the turn empty.
    mocks.protocolIdentity.current = null
    mountDeckEditor()
    renderPanel()
    await emitDraft({
      success: true,
      events: [],
      protocolEdit: { ops: [{ op: 'step_insert', afterStepId: 'step-read', label: 'Wash' }] },
    }, 'add a wash step after the read step')

    // The exact flip of the cycle-2 gate's PROBE_STATE
    // {"wall":false,"changesPanel":true,"changesApply":true} →
    // {"wall":true,"changesPanel":false,"changesApply":false}.
    const wall = await screen.findByTestId('ai-tab-honest-wall')
    expect(wall.getAttribute('role')).toBe('alert')
    expect(wall.textContent).toContain('no events')
    // The defect shape is asserted IMPOSSIBLE: no sidebar review state over
    // an empty plate with a live Apply button (spec §1 mandate).
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(screen.queryByTestId('protocol-diff')).toBeNull()
    expect(mocks.editorActions.setPreview).not.toHaveBeenCalled()
    // The chat stays usable — a reported failure, not a silent plate.
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })

  it('POSITIVE (D-c, cycle-2 Defect 1): a protocolEdit success WITH an attached protocol identity reaches the protocol review surface — protocol-diff renders with Accept; wall absent; never an empty-changes Apply', async () => {
    mocks.protocolIdentity.current = { recordId: 'PROT-ATT', title: 'Attached assay', sha: 'sha-1' }
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await emitDraft({
      success: true,
      events: [],
      protocolEdit: { ops: [{ op: 'step_insert', afterStepId: 'step-read', label: 'Wash', kind: 'wash', description: 'Wash twice with PBS' }] },
    }, 'add a wash step after the read step')

    // DESTINATION asserted: the protocol-edit review surface renders — the
    // protocolDiff-bearing draft-ready with its rows and target.
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
    const diff = await screen.findByTestId('protocol-diff')
    expect(diff).toBeTruthy()
    expect(screen.getByTestId('protocol-diff-target').textContent).toContain('Attached assay')
    expect(screen.getAllByTestId('protocol-edit-row')).toHaveLength(1)
    // The Apply here is the protocol-mode 'Accept' over a NON-empty diff —
    // never the defect's empty-changes 'Apply to run'.
    const apply = screen.getByTestId('changes-apply')
    expect(apply.textContent).toBe('Accept')
    // The event-graph changes list the defect lands its live Apply over is
    // EMPTY here (the arm dispatched `changes: []` alongside the protocol
    // diff — the Apply is the protocol Accept, not an event-graph Apply),
    // and the protocol surface itself carries the visible rows.
    const panel = screen.getByTestId('changes-panel')
    const diffDivs = panel.querySelectorAll(':scope > .changes-panel__diff')
    expect(diffDivs).toHaveLength(1) // the event-graph diff div, empty
    expect(diffDivs[0]!.querySelectorAll('.changes-panel__change')).toHaveLength(0)
    expect(diff.querySelectorAll('.changes-panel__change')).toHaveLength(1)
    // The arm returned at :514 — the wall never saw this turn.
    expect(screen.queryByTestId('ai-tab-honest-wall')).toBeNull()
    expect(mocks.editorActions.setPreview).not.toHaveBeenCalled()
  })

  it('NEGATIVE (D-c complement): an attached-identity envelope whose ops are UNMAPPABLE falls through and walls — the fall-through remnant is a nothing-delivered success', async () => {
    mocks.protocolIdentity.current = { recordId: 'PROT-ATT', title: 'Attached assay', sha: 'sha-1' }
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')
    await emitDraft({
      success: true,
      events: [],
      // protocolEditDiffFrom skips an op with no recognised name → the diff
      // is null → the arm falls through (AiTabPanel.tsx:516-518) to the wall.
      protocolEdit: { ops: [{ op: 'not_a_real_op' }] },
    }, 'edit the protocol somehow')

    const wall = await screen.findByTestId('ai-tab-honest-wall')
    expect(wall.getAttribute('role')).toBe('alert')
    expect(screen.queryByTestId('changes-panel')).toBeNull()
    expect(screen.queryByTestId('changes-apply')).toBeNull()
    expect(screen.queryByTestId('protocol-diff')).toBeNull()
    expect(mocks.editorActions.setPreview).not.toHaveBeenCalled()
  })

  // Drift pin (Ruling 3, fix-run-2): the client predicate and the SERVER's
  // inline empty-draft guard must not drift. The relationship is pinned as
  // CLIENT ⊇ SERVER (never ==): the server arm asserts a PREDICATE-TERM
  // REGEX per canonical channel against the sliced `const emptyResult =`
  // guard block (a bare comment naming a channel must NOT satisfy it), and
  // the superset arm asserts functionally that every server channel is
  // counted by the client while the client's extra set is EXACTLY
  // {equipmentRequirements}. protocolEdit is NOT in either set — its
  // jurisdiction is the protocolEdit arm + fall-through-to-wall (Ruling 1).
  it('DRIFT PIN (Ruling 3): client predicate ⊇ server inline guard; per-channel regex terms; protocolEdit is arm-governed, not predicate-counted', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { draftProducedNothing } = await import('./draftEmptiness')

    // --- Server arm: slice the inline guard block from the orchestrator. ---
    const orchestratorSource = readFileSync(
      resolve(process.cwd(), '../server/src/ai/AgentOrchestrator.ts'),
      'utf8',
    )
    const guardStart = orchestratorSource.indexOf('const emptyResult =')
    expect(guardStart).toBeGreaterThanOrEqual(0)
    const guardBlock = orchestratorSource.slice(guardStart, orchestratorSource.indexOf('if (emptyResult)', guardStart))
    expect(guardBlock.length).toBeGreaterThan(0)

    const serverChannels = [
      'events', 'clarificationRequests', 'error', 'labwareAdditions',
      'labwareRequirements', 'recordCreations', 'deckLayout',
    ]
    for (const channel of serverChannels) {
      // A predicate-term regex: `result.<channel>?.length` or `!result.<channel>`
      // — prose in a comment naming the channel must NOT satisfy this.
      const term = new RegExp(`result\\.${channel}\\??\\.length|!result\\.${channel}\\b`)
      expect(guardBlock).toMatch(term)
    }
    // The server guard counts EXACTLY the 7 canonical channels: no client-
    // superset member leaked into the server text.
    expect(guardBlock).not.toMatch(/result\.equipmentRequirements\b/)
    expect(guardBlock).not.toMatch(/result\.protocolEdit\b/)

    // --- Superset arm: functional per-channel behaviour of the client. ---
    expect(draftProducedNothing({ success: true, events: [] })).toBe(true)
    expect(draftProducedNothing({ success: true, events: [], recordCreations: [{ kind: 'material', name: 'X' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], labwareRequirements: [{ classCurie: 'CL:24_well_plate' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], labwareAdditions: [{ recordId: 'LBW-x' }] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], deckLayout: { platformId: 'p', variantId: 'v' } })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], clarificationRequests: [CLARIFICATION] })).toBe(false)
    expect(draftProducedNothing({ success: true, events: [], error: 'boom' })).toBe(false)
    // The client's ONE sanctioned extra (Ruling 1: a client-surface deliverable
    // — buildPreviewFromDraft mounts ghosts from it; the D1 negative asserts
    // setPreview + previewPlacements > 0 as its destination).
    expect(draftProducedNothing({ success: true, events: [], equipmentRequirements: [{ classCurie: 'equipment:water_bath' }] })).toBe(false)
    // protocolEdit is NOT predicate-counted: an ops-only envelope IS empty
    // (the arm owns delivery; the fall-through remnant walls). This leg
    // INVERTS the cycle-1 pin (:446), which is deleted per Ruling 3.
    expect(draftProducedNothing({ success: true, events: [], protocolEdit: { ops: [{ op: 'x' }] } })).toBe(true)
  })
})
