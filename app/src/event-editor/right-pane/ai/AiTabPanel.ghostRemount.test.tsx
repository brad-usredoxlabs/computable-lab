/**
 * REVISE-GHOST-1 — client leg (spec §4B.3, verified-by (2) client half):
 * a draft result WITH events, dispatched through the REAL onDraftResult seam,
 * mounts ghosts: the editor's setPreview carries previewPlacements > 0
 * (the deck ghost machinery itself — buildPreviewFromDraft/LawnSurface — ships
 * correct and is OUT of scope; this test pins the SEAM that feeds it).
 *
 * Second leg (§4B.5): the revision trail is UNCHANGED in shape — a follow-up
 * draft while a preview is mounted appends {prompt, createdAt} to
 * revisionHistory, and the trail rides back on the mounted preview (the
 * draftRevision context the revise turn carries).
 *
 * Harness: the option-capturing `useChatThread` seam + mocked editor stack
 * (AiTabPanel.chatCorpus.test.tsx pattern). The panel's onDraftResult, the
 * sidebar reducer, and buildPreviewFromDraft all run REAL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OpenTabsProvider } from '../../../shared/shell/OpenTabsContext'
import { WorkspaceProvider } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'
import type { PlatformManifest } from '../../../types/platformRegistry'

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

vi.mock('../../../shared/api/client', () => ({
  apiClient: mocks.api,
}))

import { AiTabPanel } from './AiTabPanel'

// A freeform bench variant (the draftPreview.test.ts lawn pattern): lawn
// placements validate without a physical deck, so the REAL buildPreviewFromDraft
// produces previewPlacements > 0 through the seam.
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

const SHORTHAND_YAML = [
  'intentId: revise-ghost-remount',
  'actions:',
  '  - action: add_material',
  '    labware: Plate',
  '    material: Test Reagent',
  '    volumeUl: 50',
  '    targetWells: [A1:A4]',
  '',
].join('\n')

const GHOST_EVENT = {
  eventId: 'ev-rg1-1',
  event_type: 'add_material',
  labwareId: 'def:opentrons/corning_24_wellplate_3.4ml_flat@v1',
  details: { labwareId: 'def:opentrons/corning_24_wellplate_3.4ml_flat@v1', wells: ['A1', 'A2'] },
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
      eventGraphId: 'EVG-rg1-ghost',
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
              tabs: [{ id: 't1', kind: 'deck' as const, eventGraphId: 'EVG-rg1-ghost', title: 'Deck' }],
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

/** Mirror what the real editor does with setPreview: the preview lands on
 *  editor state so the next turn sees previewActive (the revise leg). */
function landPreviewOnEditor() {
  const calls = mocks.editorActions.setPreview.mock.calls
  const last = calls[calls.length - 1]?.[0] as Record<string, unknown>
  const mounted = mocks.editor.current as { state: Record<string, unknown> }
  mounted.state.preview = last
}

beforeEach(() => {
  cleanup()
  mocks.chatOptions = null
  mocks.editor.current = null
  vi.clearAllMocks()
})

describe('REVISE-GHOST-1 — the draft result with events REMOUNTS ghosts through the real onDraftResult seam', () => {
  it('a success:true draft result with events calls setPreview carrying previewPlacements > 0 (ghosts mount; never a silent no-op)', async () => {
    mountDeckEditor()
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    await emitDraft({
      success: true,
      events: [GHOST_EVENT],
      labwareAdditions: [{ recordId: 'def:opentrons/corning_24_wellplate_3.4ml_flat@v1' }],
      shorthand: SHORTHAND_YAML,
    }, 'add 50 uL of Test Reagent to A1:A4')

    // The seam fired exactly once with a mountable preview.
    expect(mocks.editorActions.setPreview).toHaveBeenCalledTimes(1)
    const preview = mocks.editorActions.setPreview.mock.calls[0]![0] as {
      previewPlacements: unknown[]
      previewEvents: unknown[]
    }
    expect(preview.previewPlacements.length).toBeGreaterThan(0)
    expect(preview.previewEvents.length).toBeGreaterThan(0)
    // The review surface opened beside the ghosts (draft-ready).
    expect(await screen.findByTestId('changes-panel')).toBeTruthy()
  })

  it('revisionHistory shape UNCHANGED (§4B.5): a follow-up draft while a preview is mounted APPENDS {prompt, createdAt} and the trail rides back', async () => {
    mountDeckEditor()
    renderPanel()
    await screen.findByTestId('ai-tab-system-prompt')

    // Draft 1: no previous preview → no revisionHistory key (byte-identical
    // to the pre-fix behavior).
    await emitDraft({
      success: true,
      events: [GHOST_EVENT],
      labwareAdditions: [{ recordId: 'def:opentrons/corning_24_wellplate_3.4ml_flat@v1' }],
      shorthand: SHORTHAND_YAML,
    }, 'add 50 uL of Test Reagent to A1:A4')
    const firstPreview = mocks.editorActions.setPreview.mock.calls[0]![0] as Record<string, unknown>
    expect('revisionHistory' in firstPreview).toBe(false)

    // The preview lands on the deck (what the real editor does).
    landPreviewOnEditor()

    // Draft 2 (the REVISE leg): the trail appends one entry, shape {prompt,
    // createdAt} — the exact shape the draftRevision context rides back with.
    await emitDraft({
      success: true,
      events: [{ ...GHOST_EVENT, eventId: 'ev-rg1-2' }],
      labwareAdditions: [{ recordId: 'def:opentrons/corning_24_wellplate_3.4ml_flat@v1' }],
      shorthand: SHORTHAND_YAML,
    }, 'Actually make it four wells instead, keep the rest the same.')
    const secondPreview = mocks.editorActions.setPreview.mock.calls[1]![0] as {
      revisionHistory?: Array<Record<string, unknown>>
    }
    expect(secondPreview.revisionHistory?.length).toBe(1)
    const entry = secondPreview.revisionHistory![0]!
    expect(Object.keys(entry).sort()).toEqual(['createdAt', 'prompt'])
    expect(entry.prompt).toBe('Actually make it four wells instead, keep the rest the same.')
    expect(typeof entry.createdAt).toBe('string')

    // Draft 3: the trail KEEPS appending (never replaced, never dropped).
    landPreviewOnEditor()
    await emitDraft({
      success: true,
      events: [{ ...GHOST_EVENT, eventId: 'ev-rg1-3' }],
      labwareAdditions: [{ recordId: 'def:opentrons/corning_24_wellplate_3.4ml_flat@v1' }],
      shorthand: SHORTHAND_YAML,
    }, 'Move them to B1:B4.')
    const thirdPreview = mocks.editorActions.setPreview.mock.calls[2]![0] as {
      revisionHistory?: Array<{ prompt: string }>
    }
    expect(thirdPreview.revisionHistory?.map((e) => e.prompt)).toEqual([
      'Actually make it four wells instead, keep the rest the same.',
      'Move them to B1:B4.',
    ])
  })
})

function renderPanel() {
  return render(panelTree())
}
