/**
 * useWorkstateExecutor — hook-layer tests (PB-CH-3).
 *
 * Harness precedent: useSessionSync.test.ts (vi.mock('../api/client') +
 * `await import` after the mock + fake timers), extended with MemoryRouter
 * (the executor's navigate side) and a SHARED in-memory session store behind
 * the mocked getSession/putSession — the two-client harness that proves only
 * APPLIED state reaches the sync path.
 *
 * Note on push accounting: useSessionSync pushes the mount-time (empty) state
 * once by design. Tests that count executor pushes therefore settle the mount
 * baseline first (advance 600 ms + mockClear) so every counted push is
 * attributable to an executor apply.
 *
 * The registry fixture uses RENAMED surface ids (registry is data — no
 * surface-name literal in the executor works without it).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { OpenTabsProvider, useOpenTabs, type OpenTabState, type OpenTabsState } from '../shell/OpenTabsContext'
import type { SurfaceSpec } from '../surfaces'
import {
  ProtocolSelectionProvider,
  useProtocolSelection,
} from '../../event-editor/protocol/ProtocolSelectionContext'

// ── shared mock session store (useSessionSync.test.ts:13-21 precedent,
//    extended into a store so two clients can share it) ───────────────────
interface StoreRow {
  tabs: unknown[]
  activeTabId: string | null
  updatedAt: string
}
let store: StoreRow

const getSession = vi.fn(async () => ({
  session: { version: 1 as const, userId: 'default', tabs: store.tabs, activeTabId: store.activeTabId, updatedAt: store.updatedAt },
}))
const putSession = vi.fn(async (payload: { tabs: unknown[]; activeTabId: string | null }) => {
  const updatedAt = new Date(Date.parse(store.updatedAt) + 1000).toISOString()
  store = { tabs: payload.tabs, activeTabId: payload.activeTabId, updatedAt }
  return { session: { updatedAt } }
})
// Registry fixture with RENAMED ids. The registry seam is mocked at the
// module level: registry.ts is a lane-synced symlink whose own '../api/client'
// import resolves through its real path, outside this worktree's mock scope —
// mocking the seam keeps this a unit test of the EXECUTOR, not of the loader.
// `registryValue` starts null: the hook's first render sees the not-loaded
// state (the diagnostic path), then tests flip it to the fixture.
const REGISTRY = [
  { id: 'surface-run', label: 'Renamed run surface', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
  { id: 'surface-study', label: 'Renamed study surface', path: '/project/:studyId', params: { studyId: 'project' }, objectTypes: ['project'], selectableKinds: [] },
] as unknown as SurfaceSpec[]
let registryValue: SurfaceSpec[] | null = null

vi.mock('../api/client', () => ({
  apiClient: {
    getSession: (...args: unknown[]) => getSession(...(args as [])),
    putSession: (...args: unknown[]) => putSession(...(args as [{ tabs: unknown[]; activeTabId: string | null }])),
  },
}))
vi.mock('../surfaces/registry', () => ({
  useSurfaceRegistry: () => registryValue,
  loadSurfaceRegistry: () => Promise.resolve(registryValue ?? []),
}))

const { useSessionSync } = await import('./useSessionSync')
const { useWorkstateExecutor } = await import('./useWorkstateExecutor')

const makeWrapper = (opts: { userId?: string; protocolProvider?: boolean } = {}) =>
  function Wrapper({ children }: { children: ReactNode }) {
    let node: ReactNode = createElement(
      OpenTabsProvider,
      opts.userId ? { userId: opts.userId, children } : { children },
    )
    if (opts.protocolProvider) {
      node = createElement(ProtocolSelectionProvider, { children: node })
    }
    return createElement(MemoryRouter, { initialEntries: ['/'] }, node)
  }

/** Renders the executor (optionally alongside useSessionSync — the mount
 *  PB-CH-4 will have) plus the state/router/selection handles tests assert on. */
function mountExecutor(opts: { withSync?: boolean; userId?: string; protocolProvider?: boolean } = {}) {
  return renderHook(
    () => {
      if (opts.withSync) useSessionSync()
      const executor = useWorkstateExecutor()
      return {
        executor,
        tabs: useOpenTabs(),
        location: useLocation(),
        selection: useProtocolSelection(),
      }
    },
    { wrapper: makeWrapper(opts) },
  )
}

type Mounted = ReturnType<typeof mountExecutor>

const flush = async () => {
  // Drain the async chains (registry load, useSessionSync's getSession adopt)
  // inside act(): advanceTimersByTimeAsync(0) flushes microtasks; two rounds
  // cover the then-chains so no provider update lands outside act().
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
/** Let the mount-time baseline push (the empty session useSessionSync pushes
 *  by design) fire, then clear the spy so later counts are executor-only. */
const settleBaseline = async () => {
  await flush()
  await advance(600)
  putSession.mockClear()
}

// Executor calls run inside act(): they dispatch through providers.
const runTier1 = (r: Mounted, action: Parameters<Mounted['result']['current']['executor']['executeTier1']>[0]) => {
  let outcome: ReturnType<Mounted['result']['current']['executor']['executeTier1']> | undefined
  act(() => {
    outcome = r.result.current.executor.executeTier1(action)
  })
  return outcome!
}
const runAccept = (
  r: Mounted,
  body: unknown,
  attestation: Parameters<Mounted['result']['current']['executor']['applyAcceptedWorkstate']>[1],
  identity: Parameters<Mounted['result']['current']['executor']['applyAcceptedWorkstate']>[2],
) => {
  let outcome: ReturnType<Mounted['result']['current']['executor']['applyAcceptedWorkstate']> | undefined
  act(() => {
    outcome = r.result.current.executor.applyAcceptedWorkstate(body, attestation, identity)
  })
  return outcome!
}

const tabIds = (state: OpenTabsState) => state.tabs.map((t) => t.tab.id)

const IDENTITY_1 = { draftId: 'D-1', revision: 1, reviewHash: 'hash-aaa' }
const IDENTITY_2 = { draftId: 'D-1', revision: 2, reviewHash: 'hash-bbb' }
/** FLAT accept body (OQ1 resolution: no {result:{...}} wrapper). */
const ACCEPT_BODY = {
  sessionDocument: {
    version: 1,
    activeTabId: 'run:RUN-7',
    tabs: [
      { kind: 'project', studyId: 'STU-1', title: 'DHVC' },
      { kind: 'run', runId: 'RUN-7', title: 'Titration', activeRightPaneMode: 'protocol' },
    ],
  },
  summary: 'open the titration run',
  resolvedTerms: [],
}
/** A tempting-but-unaccepted doc: distinctive id RUN-HACK for the leak check. */
const UNACCEPTED_BODY = {
  sessionDocument: { version: 1, activeTabId: 'run:RUN-HACK', tabs: [{ kind: 'run', runId: 'RUN-HACK', title: 'never accepted' }] },
  summary: 'smuggle',
  resolvedTerms: [],
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  getSession.mockClear()
  putSession.mockClear()
  store = { tabs: [], activeTabId: null, updatedAt: '2026-10-06T00:00:00.000Z' }
  registryValue = REGISTRY
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useWorkstateExecutor — tier 1 through the live store', () => {
  it('registry not loaded yet yields diagnostics, never a throw (null registry)', () => {
    registryValue = null // the loader has not resolved yet
    const { result } = mountExecutor()
    // First render: the registry effect's promise has not resolved yet — null.
    const outcome = result.current.executor.executeTier1({
      action: 'open-surface',
      surface: 'surface-run',
      target: { kind: 'run', id: 'RUN-7' },
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.diagnostics[0]?.code).toBe('UNROUTABLE_SURFACE')
    expect(tabIds(result.current.tabs.state)).toEqual([])
    expect(result.current.location.pathname).toBe('/')
  })

  it('open-surface on a run target routes through the registry fixture and navigates the active tab', async () => {
    const r = mountExecutor()
    await flush()
    const outcome = runTier1(r, { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7', label: 'R7' } })
    expect(outcome.ok).toBe(true)
    expect(outcome.kind).toBe('navigated')
    expect(outcome.route).toBe('/runs/RUN-7')
    expect(tabIds(r.result.current.tabs.state)).toEqual(['run:RUN-7'])
    expect(r.result.current.location.pathname).toBe('/runs/RUN-7')
  })

  it('activates the existing tab instead of navigating when the target entity already has a slot', async () => {
    const r = mountExecutor()
    await flush()
    act(() => {
      r.result.current.tabs.openTab({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'R1' })
      r.result.current.tabs.openTab({ id: 'run:RUN-7', kind: 'run', runId: 'RUN-7', title: 'R7' })
    })
    // Make RUN-1 active again so activation is a real switch, not a no-op.
    act(() => {
      r.result.current.tabs.activateTab('run:RUN-1')
    })
    const outcome = runTier1(r, { action: 'focus', target: { kind: 'run', id: 'RUN-7' } })
    expect(outcome.ok).toBe(true)
    expect(outcome.kind).toBe('activated')
    expect(r.result.current.tabs.state.activeTabId).toBe('run:RUN-7')
    // Focus without movement: the router did NOT navigate.
    expect(r.result.current.location.pathname).toBe('/')
  })

  it('activateTab of the active tab re-registers idempotently (no second push — useSessionSync.ts:128 payload skip)', async () => {
    const r = mountExecutor({ withSync: true })
    await settleBaseline()
    act(() => {
      r.result.current.tabs.openTab({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'R1' })
    })
    await advance(600)
    const pushesAfterOpen = putSession.mock.calls.length
    expect(pushesAfterOpen).toBe(1)
    const outcome = runTier1(r, { action: 'focus', target: { kind: 'run', id: 'RUN-1' } })
    expect(outcome.kind).toBe('activated')
    await advance(600)
    // Re-activating the active tab changes no content → payload-equality skip.
    expect(putSession.mock.calls.length).toBe(pushesAfterOpen)
  })

  it('protocol-step focus calls focusProtocolStep with the step identity and performs NO navigation', async () => {
    const r = mountExecutor({ protocolProvider: true })
    await flush()
    const outcome = runTier1(r, {
      action: 'focus',
      target: { kind: 'protocol-step', protocolId: 'PROTO-1', stepId: 'STEP-3', label: 'Incubate' },
    })
    expect(outcome.ok).toBe(true)
    expect(outcome.kind).toBe('focused')
    expect(r.result.current.selection?.focusedStep).toMatchObject({ stepId: 'STEP-3', label: 'Incubate' })
    expect(r.result.current.location.pathname).toBe('/')
    expect(tabIds(r.result.current.tabs.state)).toEqual([])
  })

  it('protocol-step focus outside a provider yields NO_FOCUS_PROVIDER with zero movement (never a dialog)', async () => {
    const r = mountExecutor()
    await flush()
    const outcome = runTier1(r, { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PROTO-1', stepId: 'STEP-3' } })
    expect(outcome.ok).toBe(false)
    expect(outcome.diagnostics[0]?.code).toBe('NO_FOCUS_PROVIDER')
    expect(r.result.current.location.pathname).toBe('/')
    expect(tabIds(r.result.current.tabs.state)).toEqual([])
  })

  it('unknown surface id yields UNKNOWN_SURFACE with zero navigate/openTab/replaceState calls', async () => {
    const r = mountExecutor()
    await flush()
    const outcome = runTier1(r, { action: 'open-surface', surface: 'surface-nope', target: { kind: 'run', id: 'RUN-7' } })
    expect(outcome.ok).toBe(false)
    expect(outcome.diagnostics[0]?.code).toBe('UNKNOWN_SURFACE')
    expect(r.result.current.location.pathname).toBe('/')
    expect(tabIds(r.result.current.tabs.state)).toEqual([])
  })

  it('tier-1 apply touches no non-target tab entry (reference-identity of every other OpenTabState)', async () => {
    const r = mountExecutor()
    await flush()
    act(() => {
      r.result.current.tabs.openTab({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'dirty editor lives here' })
      r.result.current.tabs.openTab({ id: 'project:STU-9', kind: 'project', studyId: 'STU-9', title: 'untouched' }, false)
    })
    const before: OpenTabState[] = [...r.result.current.tabs.state.tabs]
    const untouched = before.find((e) => e.tab.id === 'project:STU-9')!
    const outcome = runTier1(r, { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7' } })
    expect(outcome.kind).toBe('navigated')
    const after = r.result.current.tabs.state.tabs
    // The dirty editor's non-target slot is the SAME object after the apply.
    expect(after.find((e) => e.tab.id === 'project:STU-9')).toBe(untouched)
  })

  it('no tier-1 outcome dispatches replace or close — reducer spy via state-entry identity: zero wholesale replacement, zero removals from any tier-1 path', async () => {
    const r = mountExecutor()
    await flush()
    act(() => {
      r.result.current.tabs.openTab({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'R1' })
      r.result.current.tabs.openTab({ id: 'project:STU-9', kind: 'project', studyId: 'STU-9', title: 'S9' }, false)
    })
    const snapshots: Array<{ count: number; entries: OpenTabState[] }> = []
    const snap = () => snapshots.push({ count: r.result.current.tabs.state.tabs.length, entries: [...r.result.current.tabs.state.tabs] })
    snap()
    runTier1(r, { action: 'focus', target: { kind: 'run', id: 'RUN-1' } }) // activate
    snap()
    runTier1(r, { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7' } }) // navigate-active (in-place)
    snap()
    runTier1(r, { action: 'focus', target: { kind: 'protocol-step', protocolId: 'P', stepId: 'S' } }) // NO_FOCUS_PROVIDER noop
    snap()
    for (const s of snapshots) {
      // 'close' would drop an entry; 'replace' (sessionDocumentToState) would
      // rebuild EVERY entry with fresh identities. Neither happened: the
      // project entry is the same object in every snapshot.
      expect(s.count).toBe(2)
      expect(s.entries.find((e) => e.tab.id === 'project:STU-9')).toBe(snapshots[0]!.entries.find((e) => e.tab.id === 'project:STU-9'))
    }
  })
})

describe('useWorkstateExecutor — tier 2 accept contract + exactly-once push', () => {
  it('applyAcceptedWorkstate without {accepted:true} yields ACCEPT_ATTESTATION_MISSING with zero state change and zero putSession after 600 ms', async () => {
    const r = mountExecutor({ withSync: true })
    await settleBaseline()
    const outcome = runAccept(r, ACCEPT_BODY, {} as never, IDENTITY_1) // the reject path: never attesting
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.diagnostics[0]?.code).toBe('ACCEPT_ATTESTATION_MISSING')
    expect(tabIds(r.result.current.tabs.state)).toEqual([])
    await advance(600)
    expect(putSession.mock.calls.length).toBe(0)
  })

  it('accept-body apply advances 600 ms and putSession is called exactly once with the document tabs', async () => {
    const r = mountExecutor({ withSync: true })
    await settleBaseline()
    const outcome = runAccept(r, ACCEPT_BODY, { accepted: true }, IDENTITY_1)
    expect(outcome.ok).toBe(true)
    expect(outcome.kind).toBe('replaced')
    expect(outcome.route).toBe('/runs/RUN-7')
    expect(r.result.current.location.pathname).toBe('/runs/RUN-7')
    await advance(600)
    expect(putSession).toHaveBeenCalledTimes(1)
    const payload = putSession.mock.calls[0]![0]
    expect(payload.activeTabId).toBe('run:RUN-7')
    expect(payload.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'project', studyId: 'STU-1', title: 'DHVC' }),
        expect.objectContaining({ kind: 'run', runId: 'RUN-7', title: 'Titration', activeRightPaneMode: 'protocol' }),
      ]),
    )
  })

  it('second apply of the same accept identity is duplicate-ignored: putSession STILL exactly once', async () => {
    const r = mountExecutor({ withSync: true })
    await settleBaseline()
    const first = runAccept(r, ACCEPT_BODY, { accepted: true }, IDENTITY_1)
    await advance(600)
    expect(first.kind).toBe('replaced')
    expect(putSession).toHaveBeenCalledTimes(1)
    const second = runAccept(r, ACCEPT_BODY, { accepted: true }, IDENTITY_1)
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.kind).toBe('duplicate-ignored')
    await advance(600)
    expect(putSession).toHaveBeenCalledTimes(1)
  })

  it('apply v/rev1 twice then accept rev2 (new reviewHash): the second revision applies and pushes', async () => {
    const r = mountExecutor({ withSync: true })
    await settleBaseline()
    expect(runAccept(r, ACCEPT_BODY, { accepted: true }, IDENTITY_1).kind).toBe('replaced')
    expect(runAccept(r, ACCEPT_BODY, { accepted: true }, IDENTITY_1).kind).toBe('duplicate-ignored')
    await advance(600)
    expect(putSession).toHaveBeenCalledTimes(1)
    const rev2Body = {
      ...ACCEPT_BODY,
      sessionDocument: { version: 1, activeTabId: null, tabs: [{ kind: 'run', runId: 'RUN-8', title: 'Revised' }] },
    }
    const rev2 = runAccept(r, rev2Body, { accepted: true }, IDENTITY_2)
    expect(rev2.ok).toBe(true)
    if (rev2.ok) expect(rev2.kind).toBe('replaced')
    await advance(600)
    expect(putSession).toHaveBeenCalledTimes(2)
    expect(tabIds(r.result.current.tabs.state)).toEqual(['run:RUN-8'])
    expect(store.tabs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'run', runId: 'RUN-8', title: 'Revised' })]))
  })

  it('sessionDocument with version 2 / missing tabs / tab without kind yields MALFORMED_ACCEPTED_DOCUMENT, no replaceState, no push', async () => {
    const r = mountExecutor({ withSync: true })
    await settleBaseline()
    for (const [i, bad] of [
      { sessionDocument: { version: 2, tabs: [] } },
      { sessionDocument: { version: 1 } },
      { sessionDocument: { version: 1, tabs: [{ title: 'no kind' }] } },
    ].entries()) {
      const outcome = runAccept(r, bad, { accepted: true }, { draftId: `D-bad-${i}`, revision: 1, reviewHash: `h-${i}` })
      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.diagnostics[0]?.code).toBe('MALFORMED_ACCEPTED_DOCUMENT')
    }
    expect(tabIds(r.result.current.tabs.state)).toEqual([])
    await advance(600)
    expect(putSession.mock.calls.length).toBe(0)
  })

  it('D1: a malformed first delivery does NOT consume the accept identity — a corrected re-delivery of the SAME identity applies, and only then does a genuine repeat become duplicate-ignored (exactly ONE putSession)', async () => {
    const r = mountExecutor({ withSync: true })
    await settleBaseline()
    // Delivery 1: SAME identity as the good body below, but malformed (no tabs).
    const malformed = runAccept(r, { sessionDocument: { version: 1 } }, { accepted: true }, IDENTITY_1)
    expect(malformed.ok).toBe(false)
    if (!malformed.ok) expect(malformed.diagnostics[0]?.code).toBe('MALFORMED_ACCEPTED_DOCUMENT')
    await advance(600)
    expect(putSession.mock.calls.length).toBe(0) // nothing applied, nothing pushed
    // Delivery 2: corrected body, SAME draftId:revision:reviewHash. The failed
    // delivery must not have consumed the key — this must APPLY, not be
    // duplicate-ignored (the D1 defect: it used to return ok:true/duplicate-ignored).
    const corrected = runAccept(r, ACCEPT_BODY, { accepted: true }, IDENTITY_1)
    expect(corrected.ok).toBe(true)
    if (corrected.ok) expect(corrected.kind).toBe('replaced')
    await advance(600)
    expect(putSession.mock.calls.length).toBe(1) // the corrected apply pushed exactly once
    expect(tabIds(r.result.current.tabs.state)).toEqual(['project:STU-1', 'run:RUN-7'])
    // Delivery 3: genuine repeat of the now SUCCESSFULLY applied identity →
    // duplicate-ignored, still exactly ONE putSession for the whole sequence.
    const repeat = runAccept(r, ACCEPT_BODY, { accepted: true }, IDENTITY_1)
    expect(repeat.ok).toBe(true)
    if (repeat.ok) expect(repeat.kind).toBe('duplicate-ignored')
    await advance(600)
    expect(putSession.mock.calls.length).toBe(1)
  })
})

describe('useWorkstateExecutor — two-client harness: only applied state reaches the sync path', () => {
  it('client A accept-applies and pushes; shared store bytes equal the ACCEPTED doc; client B adopts exactly the accepted tabs; an unaccepted doc never enters the store', async () => {
    // ── client A: the accepting client ──────────────────────────────────
    const a = mountExecutor({ withSync: true, userId: 'client-a' })
    await settleBaseline()
    const acceptOutcome = runAccept(a, ACCEPT_BODY, { accepted: true }, IDENTITY_1)
    expect(acceptOutcome.kind).toBe('replaced')
    await advance(600)
    expect(putSession).toHaveBeenCalledTimes(1) // A's accepted apply pushed EXACTLY once
    // Shared store now carries the accepted document's tabs.
    console.log('HARNESS store bytes after A push:', JSON.stringify(store))
    expect(store.activeTabId).toBe('run:RUN-7')
    expect(store.tabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'project', studyId: 'STU-1', title: 'DHVC' }),
        expect.objectContaining({ kind: 'run', runId: 'RUN-7', title: 'Titration' }),
      ]),
    )

    // ── client B: second device, fresh namespace, attaches via the store ─
    const b = mountExecutor({ withSync: true, userId: 'client-b' })
    await flush()
    expect(tabIds(b.result.current.tabs.state)).toEqual(['project:STU-1', 'run:RUN-7']) // adopted exactly the accepted tabs
    await advance(600)
    // B's window focus with the server ahead re-adopts exactly the accepted tabs.
    store = { ...store, updatedAt: new Date(Date.parse(store.updatedAt) + 60_000).toISOString() }
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })
    expect(tabIds(b.result.current.tabs.state)).toEqual(['project:STU-1', 'run:RUN-7'])
    // Settle B's adopt-echo push (same accepted payload — store bytes unchanged)
    // so the smuggle window below counts ONLY executor-attributable pushes.
    await advance(600)

    // ── the leak check: an UNACCEPTED doc handed to the executor ─────────
    const storeBytesBefore = JSON.stringify(store.tabs)
    const pushesBefore = putSession.mock.calls.length
    const smuggle = runAccept(a, UNACCEPTED_BODY, {} as never, { draftId: 'D-smuggle', revision: 1, reviewHash: 'hash-smuggle' })
    expect(smuggle.ok).toBe(false)
    if (!smuggle.ok) expect(smuggle.diagnostics[0]?.code).toBe('ACCEPT_ATTESTATION_MISSING')
    await advance(600)
    expect(putSession.mock.calls.length).toBe(pushesBefore) // zero new pushes
    expect(JSON.stringify(store.tabs)).toBe(storeBytesBefore) // store bytes UNCHANGED
    console.log('HARNESS store bytes after smuggle attempt:', JSON.stringify(store.tabs))
    expect(JSON.stringify(store.tabs)).not.toContain('RUN-HACK') // unaccepted doc never in the store
    expect(tabIds(b.result.current.tabs.state)).not.toContain('run:RUN-HACK')
    expect(tabIds(a.result.current.tabs.state)).not.toContain('run:RUN-HACK')
  })
})
