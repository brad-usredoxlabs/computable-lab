/**
 * L2-CHAT-1 (universal chat revision loop) — MOUNT lock for the run workspace:
 * the /runs/:runId page must register its universal chat WITH the accept +
 * ghost seams wired (the spec §1 defect: the page's old top-level
 * `useSurfaceChat` call sat ABOVE the EventEditorProvider and passed NO
 * onAcceptEvent and NO ghost seam — ChatPreviewCard Apply was a silent
 * no-op and event-bearing proposals mounted nothing).
 *
 * The lock mirrors the legacy AiTabPanel.runPageSurface.test.tsx posture
 * (render the real page with the providers/APIs stubbed, assert the chat the
 * app-level AiPanelContext sees) at HOOK level:
 *   - the chat is registered (not "no chat registered")
 *   - the ghost seam fired on a proposal draft (mountable events → setPreview)
 *   - the accept path is the editor's appendEvent (not a silent no-op)
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Stub the app's api client (workspace/runs fetches) — the page is mounted
// with a stubbed WorkspaceContext, so the api layer never needs to resolve.
vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(async () => ({
      payload: { studyId: 'STU-1', methodEventGraphId: 'EG-1', title: 'Run' },
    })),
    workspace: { get: vi.fn(async () => null) },
    ai: { health: vi.fn(async () => ({ ok: false })) },
    getSurfaces: vi.fn(async () => []),
    getProtocolContext: vi.fn(async () => null),
  },
  api: {
    workspace: { get: vi.fn(async () => null) },
    ai: { health: vi.fn(async () => ({ ok: false })) },
  },
  ApiError: class extends Error {},
}))
// The adoption core's durable persist seam: the run-page lock asserts the
// COMMIT + state adoption (one adopter with the deck bar, L2-CHAT-1 FIX3 D1)
// — stub the save so Apply never writes through the live apiClient.
vi.mock('../event-editor/eventGraphPersistence', () => ({
  persistAcceptedEventGraph: vi.fn(async (input: { eventGraphId?: string | null }) => ({
    eventGraphId: input.eventGraphId ?? 'EG-1',
    commit: { sha: 'sha-surface', message: 'surface test commit', timestamp: '2026-10-26T00:00:00Z' },
  })),
}))
vi.mock('../shared/api/aiThreadClient', () => ({
  listThreads: vi.fn(async () => []),
  createThread: vi.fn(async () => ({ id: 't1' })),
  // REJECT (not resolve(null)): a resolved null makes useAiChat's hydrate
  // effect fail the turn ("Failed to hydrate AI thread"). The passing ghost
  // lock (DeckSurfaceChat.ghost) uses the same rejection posture.
  getThread: vi.fn().mockRejectedValue(new Error('no thread')),
  listMessages: vi.fn(async () => []),
  streamMessage: vi.fn(async function* () {}),
  cancelMessage: vi.fn(async () => {}),
  appendThreadMessage: vi.fn(async () => {}),
  deleteThread: vi.fn(async () => {}),
  renameThread: vi.fn(async () => {}),
  setThreadPinned: vi.fn(async () => {}),
}))
vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () {
    yield { type: 'status', message: 'working' }
    yield {
      type: 'done',
      result: {
        success: true,
        events: [
          {
            eventId: 'EVT-9',
            event_type: 'add_material',
            details: {},
          },
        ],
        notes: [],
      },
    }
  }),
  getAiHealth: vi.fn(async () => ({ available: true })),
}))
vi.mock('../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: vi.fn(),
    acceptWorkstate: vi.fn(),
    rejectWorkstate: vi.fn(),
    handleAgentAction: vi.fn(),
  }),
}))
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))

// The workspace provider: a stub run with ONE locked SBS plate + a platform
// manifest, so the ghost seam's buildPreviewFromDraft resolves a placement
// (the same LOCKED single-SBS-plate shape the legacy resolved-ghosts lock
// uses).
vi.mock('../event-editor/workspace/WorkspaceContext', () => {
  // Real WorkspaceContextValue shape: consumers read `value.state.studyId`
  // (RunBreadcrumb), `value.ready`, … — not the fields at the top level.
  const value = {
    state: { studyId: 'STU-1' },
    ready: true,
    error: null,
    openTab: vi.fn(),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
    renameTab: vi.fn(),
    bindDeckTab: vi.fn(),
    setRightPaneMode: vi.fn(),
    setRightPaneCollapsed: vi.fn(),
    setPaneWidths: vi.fn(),
    reload: vi.fn(async () => {}),
  }
  return {
    WorkspaceProvider: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useWorkspace: () => value,
    useOptionalWorkspace: () => value,
  }
})

// The event editor: a stateless stub with the actions the bridge + ghost seam
// consume; `setPreview` records the mounted ghost payload, `commitPreview`
// MIRRORS the real commit_preview reducer (EventEditorContext.tsx) — labwares
// merged, placements appended, events appended, preview nulled (one adopter
// stays one). L2-CHAT-1 FIX3 D1: the run-page chat Apply adopts the FULL
// staged preview through this commit (the legacy appendEvent arm is gone
// from the deck-owning bridge).
let previewCalls: Array<Record<string, unknown>> = []
let commitEventCalls: Array<{ eventId: string }> = []
const eventEditorContextValue = {
  state: {
    eventGraphId: 'EG-1',
    title: 'EG-1',
    runId: 'RUN-1',
    platformId: 'PF-1',
    variantId: 'VAR-1',
    vocabPackId: 'VP-1',
    // The ghost seam (useDeckGhostMount) calls getVariantManifest on this
    // state — a locked single-slot variant, the same shape the ghost lock
    // uses, so the deck scope resolves and a preview can mount.
    platforms: [
      {
        id: 'PF-1',
        label: 'SBS 384',
        allowedVocabIds: ['liquid-handling/v1'],
        defaultVariant: 'VAR-1',
        toolTypeIds: [],
        modules: [],
        variants: [
          {
            id: 'VAR-1',
            title: 'v1',
            slots: [{ id: 'PLATE', kind: 'standard' as const, orientationMode: 'locked_landscape' as const, reachable: true }],
          },
        ],
      },
    ],
    selections: [],
    selection: null,
    runDeck: null,
    history: { past: [], future: [] },
    tipState: { kind: 'empty' as const },
    labwares: {},
    equipments: {},
    focusPlacementId: null,
    placements: [
      {
        placementId: 'PL-1',
        slotId: 'SLOT-1',
        surfaceId: 'SBS-384',
        plateInstanceId: 'P-1',
        state: 'idle',
        labwareId: 'LW-1',
        location: { kind: 'slot' as const, slotId: 'PLATE' },
        orientation: 'landscape' as const,
      },
    ] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    preview: null,
    previewEvents: [] as Array<Record<string, unknown>>,
    previewPlacements: [] as Array<Record<string, unknown>>,
    previewLabwares: [],
    previewRevision: null,
    reviewState: null,
  },
  actions: {
    setPreview: (payload: Record<string, unknown>) => {
      previewCalls.push(payload)
    },
    // Mirror the real commit_preview reducer (EventEditorContext.tsx:884-899):
    // merge labwares, append placements + events, adopt the persisted commit,
    // NULL the preview (the one-adopter guard).
    commitPreview: (
      previewEvents: Array<{ eventId: string }>,
      eventGraphId: string,
      _commit: unknown,
    ) => {
      commitEventCalls.push(...previewEvents.map((e) => ({ eventId: e.eventId })))
      eventEditorContextValue.state.events = [
        ...eventEditorContextValue.state.events,
        ...previewEvents,
      ]
      const preview = eventEditorContextValue.state.preview as
        | { previewLabwares?: Record<string, unknown>; previewPlacements?: Record<string, unknown>[] }
        | null
      if (preview) {
        eventEditorContextValue.state.labwares = {
          ...(eventEditorContextValue.state.labwares as Record<string, unknown>),
          ...(preview.previewLabwares ?? {}),
        }
        eventEditorContextValue.state.placements = [
          ...eventEditorContextValue.state.placements,
          ...(preview.previewPlacements ?? []),
        ]
      }
      eventEditorContextValue.state.eventGraphId = eventGraphId
      eventEditorContextValue.state.preview = null
    },
    clearPreview: () => {
      previewCalls = []
    },
    applyPreviewLabware: vi.fn(),
    applyPreviewPlacement: vi.fn(),
    dropPreviewEvent: vi.fn(),
    discardPreviewLabware: vi.fn(),
    discardPreviewPlacement: vi.fn(),
    setReviewState: vi.fn(),
    setReviewEventIds: vi.fn(),
    setDraftRevision: vi.fn(),
  },
  draftEvents: [],
  draftPlacements: [],
}
vi.mock('../event-editor/EventEditorContext', () => ({
  EventEditorProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useEventEditor: () => eventEditorContextValue,
  isDeckSetupLocked: (state: { placements?: unknown[]; events?: unknown[]; runDeck?: unknown }) =>
    state.runDeck !== null || (state.placements?.length ?? 0) > 0 || (state.events?.length ?? 0) > 0,
}))

// Focus modal + protocol preview bridges are not under test.
vi.mock('../event-editor/protocol/ProtocolPreviewBridge', () => ({
  ProtocolPreviewBridge: () => null,
}))
vi.mock('../event-editor/focus/FocusModalsProvider', () => ({
  FocusModalsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { AiPanelProvider, useOptionalAiPanel } from '../shared/context/AiPanelContext'
import { ThemeProvider } from '../shared/shell/useTheme'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import { streamAssist } from '../shared/api/aiClient'
import { RunWorkspacePage } from './RunWorkspacePage'

const seen: Array<Awaited<ReturnType<typeof useOptionalAiPanel>>> = []
function ChatProbe() {
  const panel = useOptionalAiPanel()
  seen.push(panel)
  return null
}

afterEach(() => {
  cleanup()
  seen.length = 0
  previewCalls = []
  commitEventCalls = []
})

describe('RunWorkspacePage — universal chat mount (L2-CHAT-1)', () => {
  it('registers the universal chat INSIDE the editor provider, with the ghost seam + accept wired (Apply applies, proposals mount)', async () => {
    // Wait for the page's async run-load (getRecord → setResolvedStudyId) to
    // re-render the page past its "Loading run…" bail so the bridge mounts and
    // registers the chat. The probe re-renders on registration (chatVersion),
    // so the LAST observation carries the registered chat.
    const tree = (
      <MemoryRouter initialEntries={['/runs/RUN-1']}>
        <OpenTabsProvider>
          <Routes>
            <Route
              path="/runs/:runId"
              element={
                <ThemeProvider>
                  <AiPanelProvider>
                    <ChatProbe />
                    <RunWorkspacePage />
                  </AiPanelProvider>
                </ThemeProvider>
              }
            />
          </Routes>
        </OpenTabsProvider>
      </MemoryRouter>
    )
    const { unmount, rerender } = render(tree)

    let registered: UseAiChatReturn | null | undefined
    await vi.waitFor(() => {
      registered = [...seen].reverse().find((p) => p?.chat)?.chat
      expect(registered).toBeTruthy()
    }, { timeout: 3000 }).catch(() => {
      console.log('DEBUG seen=', seen.length, seen.map((x) => (x ? (x.chat ? 'chat' : 'nochat') : 'noprov')).join(','))
      console.log('DEBUG body=', document.body.innerHTML.slice(0, 600))
    })
    expect(registered).toBeTruthy()

    // Drive one turn through the registered chat's real send path (the
    // stubbed streamAssist delivers an event-bearing done).
    const chat = registered!
    chat.sendPrompt('draft a read for A1')
    await vi.waitFor(() => {
      expect(previewCalls.length).toBe(1)
    })

    // The GHOST SEAM fired: the event-bearing proposal mounted the editor's
    // preview (setPreview) — the universal chat's deck ghosts on the run page.
    expect(
      (previewCalls[0].previewEvents as Array<{ eventId: string }>).map((e) => e.eventId),
    ).toEqual(['EVT-9'])

    // THE §1 DEFECT, CLOSED (L2-CHAT-1 FIX3 D1: the adopter was COMPLETED):
    // Apply adopts — the run-page bridge registers the COMPLETE-adopter seam
    // (onPreviewAccept), so the accept path is the editor's commitPreview
    // (the shared deck adoption core — one adopter with the deck bar), not
    // the raw per-event append (before this leg the page passed NO accept
    // handler and a done with mountable events was a silent no-op).
    // acceptPreview is a useCallback closure over previewEvents — the
    // PRE-TURN object (captured from `registered`) is stale. Re-render the
    // same tree (the same re-read the host page causes in production) so
    // useRegisterAiChat re-writes the bridge's FRESH chat to the panel ref,
    // then read the ref directly.
    rerender(
      <MemoryRouter initialEntries={['/runs/RUN-1']}>
        <OpenTabsProvider>
          <Routes>
            <Route
              path="/runs/:runId"
              element={
                <ThemeProvider>
                  <AiPanelProvider>
                    <ChatProbe />
                    <RunWorkspacePage />
                  </AiPanelProvider>
                </ThemeProvider>
              }
            />
          </Routes>
        </OpenTabsProvider>
      </MemoryRouter>,
    )
    const freshChat = [...seen].reverse().find((p) => p?.chat)?.chat
    expect(freshChat).toBeTruthy()
    freshChat!.acceptPreview()
    await vi.waitFor(() => {
      expect(commitEventCalls.map((c) => c.eventId)).toEqual(['EVT-9'])
    })
    // One adopter: the commit nulled the ghost (commit_preview's own clear)
    // — a subsequent deck-bar commit on this run is a no-op.
    expect(eventEditorContextValue.state.preview).toBeNull()

    unmount()
    // The stream went through the stub (no real network): exactly one turn.
    expect(vi.mocked(streamAssist)).toHaveBeenCalledTimes(1)
  })
})
