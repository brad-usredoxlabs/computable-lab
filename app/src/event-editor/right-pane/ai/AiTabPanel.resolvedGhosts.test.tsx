/**
 * REVISE-GHOST-1 fix 3 (browser-gate Defect 1 client half, attempt-9 receipts
 * 2026-10-24-attempt9: f2mjyr 'shorthand answer folded deterministically …
 * events=3', ChangesPanel '3 events' + Accept ENABLED, yet the plate measured
 * {slotPreview:0, wellPreview:0, ghostTiles:0, ghostRects:0}).
 *
 * The live shape: a folded shorthand whose labware noun resolved to an EXISTING
 * registry record (the labware-requirement card picked LAB-w211-sample-plate)
 * makes the compile emit terminalArtifacts.resolvedLabwares. The server mapper
 * dropped that channel (fix 3 D1 server leg) AND the panel never threaded the
 * channel into buildPreviewFromDraft — so previewPlacements stayed [] and
 * DeckSlot (ghost LabwareTile only when previewPlacement && previewLabware are
 * both truthy) rendered an empty plate under a '3 events' preview bar.
 *
 * This file pins the CLIENT seam on the REAL preview-state shape: a locked
 * single-plate run deck (the run page's shape), a done result carrying the
 * resolved offers + events bound to the resolved record id. The seam must
 * mount a ghost PLACEMENT of the existing record (slot PLATE, keyed by the
 * record id, no proposedRecord) AND the ghost-well index must bucket the
 * events' wells under that same id (DeckSlot's buildPreviewWellIndex reads
 * details.labwareId — a placement keyed by one id with events bucketed under
 * another renders a tile with NO dashed wells).
 *
 * Harness: the option-capturing `useChatThread` seam + mocked editor stack
 * (AiTabPanel.ghostRemount.test.tsx pattern). The panel's onDraftResult, the
 * sidebar reducer, and buildPreviewFromDraft all run REAL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import type { PlatformManifest } from '../../../types/platformRegistry'
import { buildPreviewWellIndex } from '../../lib/previewProjection'

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

vi.mock('../../../shared/api/client', () => ({ apiClient: mocks.api }))

import { AiTabPanel } from './AiTabPanel'

// The run page's deck: a LOCKED single-SBS-plate variant (manual platform,
// variant manual_single_plate, runId present → activeDeckScope.locked with
// allowedSlots ['PLATE']). This is the exact shape the attempt-9 gate measured.
const singlePlateVariant = {
  id: 'manual_single_plate',
  title: 'Single SBS Plate',
  slots: [{ id: 'PLATE', kind: 'standard' as const, orientationMode: 'locked_landscape' as const, reachable: true }],
}
const singlePlatePlatform: PlatformManifest = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_single_plate',
  toolTypeIds: [],
  modules: [],
  variants: [singlePlateVariant],
}

const RESOLVED_RECORD_ID = 'LAB-w211-sample-plate'

const SHORTHAND_YAML = [
  'intentId: rg1-fix3-resolved-ghosts',
  'actions:',
  '  - action: add_material',
  '    labware: Sample Plate',
  '    material: Test Reagent',
  '    volumeUl: 50',
  '    targetWells: [A1, A2, A3]',
  '',
].join('\n')

/** The done-result shape the FIXED server mapper ships (fix3 D1 server leg):
 *  events bound to the resolved record id (top-level AND details.labwareId)
 *  plus the resolvedLabwares offer channel. */
function resolvedFoldResult(eventIds: string[]) {
  return {
    success: true,
    events: eventIds.map((eventId) => ({
      eventId,
      event_type: 'add_material',
      verb: 'add_material',
      vocabPackId: 'general',
      labwareId: RESOLVED_RECORD_ID,
      details: { labwareId: RESOLVED_RECORD_ID, wells: ['A1', 'A2', 'A3'], material: 'Test Reagent', volumeUl: 50 },
      provenance: { actor: 'ai-agent', method: 'compiler', actionGroupId: 'compiler-draft' },
    })),
    resolvedLabwares: [{ recordId: RESOLVED_RECORD_ID, title: 'Sample Plate' }],
    shorthand: SHORTHAND_YAML,
    notes: ['Clarification answer folded into the held shorthand; re-compiled deterministically (no model call).'],
  }
}

function mountRunDeck() {
  mocks.editor.current = {
    state: {
      platforms: [singlePlatePlatform],
      platformId: 'manual',
      variantId: 'manual_single_plate',
      runId: 'EXR-LANE2-AI10',
      placements: [],
      labwares: {},
      events: [],
      selection: null,
      focusPlacementId: null,
      vocabPackId: 'liquid-handling/v1',
      eventGraphId: 'EVG-rg1-fix3',
      preview: null,
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
            state: {
              ...base,
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-rg1-fix3', title: 'Deck' }],
              activeTabId: 't1',
            } as ReturnType<typeof defaultWorkspaceState>,
          })}
          saveFn={async (_id, s) => ({ state: s })}
        >
          <AiTabPanel />
        </WorkspaceProvider>
      </OpenTabsProvider>
    </MemoryRouter>
  )
}

async function emitDraft(result: unknown, prompt: string) {
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

describe('REVISE-GHOST-1 fix3 — a folded draft whose labware resolved to an EXISTING record mounts ghost placements (spec 4C, verified-by (2))', () => {
  it('the seam threads the resolved offers into buildPreviewFromDraft: previewPlacements > 0 keyed by the EXISTING record id on the locked single-plate deck', async () => {
    mountRunDeck()
    render(panelTree())
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft(resolvedFoldResult(['ev-rg1-f3-1', 'ev-rg1-f3-2', 'ev-rg1-f3-3']), 'add 50 uL of Test Reagent to A1:A3')

    expect(mocks.editorActions.setPreview).toHaveBeenCalledTimes(1)
    const preview = mocks.editorActions.setPreview.mock.calls[0]![0] as {
      previewPlacements: Array<{ labwareId: string; location: { kind: string; slotId?: string } }>
      previewLabwares: Record<string, { labwareId: string; proposedRecord?: boolean }>
      previewEvents: unknown[]
    }
    // The ghost PLACEMENT mounts (DeckSlot renders the ghost LabwareTile only
    // when previewPlacementForSlot finds a placement for the slot).
    expect(preview.previewPlacements.length, 'resolved offers never reached buildPreviewFromDraft — the plate stays empty').toBeGreaterThan(0)
    const placement = preview.previewPlacements[0]!
    expect(placement.location).toEqual({ kind: 'slot', slotId: 'PLATE' })
    // Placement of the EXISTING record: keyed BY the record id, never a re-creation.
    expect(placement.labwareId).toBe(RESOLVED_RECORD_ID)
    const ghosted = preview.previewLabwares[RESOLVED_RECORD_ID]
    expect(ghosted, 'previewLabwares must carry the placement labware under the same id (DeckSlot needs both truthy)').toBeDefined()
    expect(ghosted.proposedRecord).toBeUndefined()
    expect(preview.previewEvents.length).toBe(3)
  })

  it('the ghost-well index buckets the events under the SAME id the placement carries — the mounted ghost has dashed wells, not an empty tile', async () => {
    mountRunDeck()
    render(panelTree())
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft(resolvedFoldResult(['ev-rg1-f3-1', 'ev-rg1-f3-2', 'ev-rg1-f3-3']), 'add 50 uL of Test Reagent to A1:A3')

    const preview = mocks.editorActions.setPreview.mock.calls[0]![0] as Parameters<typeof buildPreviewWellIndex>[0]
    const index = buildPreviewWellIndex(preview)
    // DeckSlot/WellGrid read buildPreviewWellIndex(state.preview): the wells
    // must be bucketed under the placement's labwareId or the ghost tile shows
    // zero preview wells (the gate measured wellPreview:0).
    expect(index.byLabware.has(RESOLVED_RECORD_ID), 'events bucketed under a different id than the placement — no dashed wells').toBe(true)
    expect([...index.byLabware.get(RESOLVED_RECORD_ID)!].sort()).toEqual(['A1', 'A2', 'A3'])
    expect(index.eventsByLabware.get(RESOLVED_RECORD_ID)?.length).toBe(3)
  })
})
