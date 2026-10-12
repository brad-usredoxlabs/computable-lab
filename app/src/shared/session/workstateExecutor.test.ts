/**
 * PB-CH-3 red-first tests for the pure executor core (FIRST TARGETED CHECK:
 * navigation + unknown-surface + duplicate-guard cases ONLY).
 *
 * Registry-backed navigation, unknown/unroutable/unmappable surfaces => no-op +
 * diagnostic, and the accept duplicate-guard keyed on the accept IDENTITY
 * (draftId:revision:reviewHash), never on document bytes.
 *
 * Fixtures hand-build the registry with RENAMED ids: nothing in the executor
 * may hardcode a surface name (repo rule: registry is data). No apiClient, no
 * React, no DOM: this is the pure planning/applying pair the hook layer
 * composes.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { SurfaceSpec } from '../surfaces'
import type { OpenTabState, OpenTabsContextValue, OpenTabsState } from '../shell/OpenTabsContext'
import { openTabsReducer } from '../shell/OpenTabsContext'
import { sessionToYaml } from './sessionYaml'
import type { WorkspaceTab } from '../../event-editor/workspace/types'
import {
  peekAcceptGuard,
  recordAcceptedApply,
  applyTier1Action,
  planTier1Action,
  validateAcceptedWorkstate,
  type AcceptGuardKey,
  type AcceptedWorkstateIdentity,
} from './workstateExecutor'

// Registry fixture deliberately uses RENAMED ids: 'surface-run' stands in for
// the real run surface, 'surface-browse' for a non-deep-linkable one.
const REGISTRY: SurfaceSpec[] = [
  {
    id: 'surface-run',
    label: 'Renamed run surface',
    path: '/runs/:runId',
    params: { runId: 'run' },
    objectTypes: ['run'],
    selectableKinds: [],
  },
  {
    id: 'surface-study',
    label: 'Renamed study surface',
    path: '/project/:studyId',
    params: { studyId: 'project' },
    objectTypes: ['project'],
    selectableKinds: [],
  },
  {
    id: 'surface-browse',
    label: 'Renamed non-deep-linkable surface',
    path: '/browse',
    objectTypes: ['run'],
    selectableKinds: [],
  },
  {
    // Routable (binds :recordId as objectType 'document') but the store has no
    // tab kind for 'document' → the UNMAPPABLE_TARGET stage.
    id: 'surface-doc',
    label: 'Renamed document surface',
    path: '/artifact/document/:recordId',
    params: { recordId: 'document' },
    objectTypes: ['document'],
    selectableKinds: [],
  },
] as unknown as SurfaceSpec[]

const openTabsMock = (): OpenTabsContextValue => ({
  state: { tabs: [], activeTabId: null, history: [], historyCursor: -1 },
  openTab: vi.fn(),
  navigateActiveTab: vi.fn(),
  navigateTab: vi.fn(),
  closeTab: vi.fn(),
  activateTab: vi.fn(),
  renameTab: vi.fn(),
  setRightPaneMode: vi.fn(),
  canGoBack: false,
  canGoForward: false,
  back: vi.fn(),
  forward: vi.fn(),
  canGoBackWithin: false,
  canGoForwardWithin: false,
  withinBack: vi.fn(),
  withinForward: vi.fn(),
  replaceState: vi.fn(),
})

const tabEntry = (tab: WorkspaceTab): OpenTabState => ({
  tab,
  activeRightPaneMode: 'protocol',
  breadcrumb: [],
  contentHistory: [tab],
  contentCursor: 0,
})

describe('planTier1Action — registry membership and routing (registry is data)', () => {
  it('open-surface on a run target routes through the registry fixture', () => {
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7', label: 'R7' } },
      REGISTRY,
    )
    expect(plan.diagnostic).toBeUndefined()
    expect(plan.route).toBe('/runs/RUN-7')
    expect(plan.tab).toMatchObject({ kind: 'run', runId: 'RUN-7', id: 'run:RUN-7' })
    expect(plan.target).toMatchObject({ surface: 'surface-run', active: { objectType: 'run', objectId: 'RUN-7' } })
  })

  it('renamed surface ids in the fixture still route (registry-driven — no surface-name literal works without it)', () => {
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-study', target: { kind: 'project', id: 'STU-1' } },
      REGISTRY,
    )
    expect(plan.diagnostic).toBeUndefined()
    expect(plan.route).toBe('/project/STU-1')
    expect(plan.tab).toMatchObject({ kind: 'project', studyId: 'STU-1', id: 'project:STU-1' })
  })

  it('unknown surface id yields UNKNOWN_SURFACE', () => {
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-nope', target: { kind: 'run', id: 'RUN-7' } },
      REGISTRY,
    )
    expect(plan.diagnostic?.code).toBe('UNKNOWN_SURFACE')
    expect(plan.tab).toBeUndefined()
    expect(plan.route).toBeUndefined()
  })

  it('surface without params yields UNROUTABLE_SURFACE', () => {
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-browse', target: { kind: 'run', id: 'RUN-7' } },
      REGISTRY,
    )
    expect(plan.diagnostic?.code).toBe('UNROUTABLE_SURFACE')
  })

  it('objectType mismatch yields UNROUTABLE_SURFACE', () => {
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-run', target: { kind: 'material', id: 'MAT-1' } },
      REGISTRY,
    )
    expect(plan.diagnostic?.code).toBe('UNROUTABLE_SURFACE')
  })

  it('non-tabbable objectType yields UNMAPPABLE_TARGET', () => {
    // surface-doc IS deep-linkable (binds :recordId) but the store has no tab
    // kind for 'document' — the tabForSurface stage names itself.
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-doc', target: { kind: 'document', id: 'DOC-1' } },
      REGISTRY,
    )
    expect(plan.diagnostic?.code).toBe('UNMAPPABLE_TARGET')
  })

  it('null registry yields diagnostics, never a throw', () => {
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7' } },
      null,
    )
    expect(plan.diagnostic?.code).toBe('UNROUTABLE_SURFACE')
  })

  it('bare focus (no surface) plans an existing-tab candidate without a route (conservative OQ2)', () => {
    const plan = planTier1Action({ action: 'focus', target: { kind: 'run', id: 'RUN-7' } }, REGISTRY)
    expect(plan.diagnostic).toBeUndefined()
    expect(plan.route).toBeUndefined()
    expect(plan.tab).toMatchObject({ kind: 'run', runId: 'RUN-7' })
  })

  it('bare focus on an unmappable ref yields UNMAPPABLE_TARGET', () => {
    const plan = planTier1Action({ action: 'focus', target: { kind: 'well', id: 'W-1' } }, REGISTRY)
    expect(plan.diagnostic?.code).toBe('UNMAPPABLE_TARGET')
  })

  it('protocol-step focus plans the step identity with zero navigation', () => {
    const plan = planTier1Action(
      { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PROTO-1', stepId: 'STEP-3', label: 'Incubate' } },
      REGISTRY,
    )
    expect(plan.diagnostic).toBeUndefined()
    expect(plan.protocolStep).toMatchObject({ stepId: 'STEP-3', label: 'Incubate' })
    expect(plan.tab).toBeUndefined()
    expect(plan.route).toBeUndefined()
  })
})

describe('applyTier1Action — activate-or-navigate only, never replace/close', () => {
  it('open-surface on a run target navigates the active tab with the registry route', () => {
    const openTabs = openTabsMock()
    const navigate = vi.fn()
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7', label: 'R7' } },
      REGISTRY,
    )
    const outcome = applyTier1Action(plan, { openTabs, navigate })
    expect(outcome.ok).toBe(true)
    expect(outcome.kind).toBe('navigated')
    expect(outcome.route).toBe('/runs/RUN-7')
    expect(openTabs.navigateActiveTab).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'run', runId: 'RUN-7', id: 'run:RUN-7' }),
      undefined,
    )
    expect(navigate).toHaveBeenCalledWith('/runs/RUN-7')
    expect(openTabs.replaceState).not.toHaveBeenCalled()
    expect(openTabs.closeTab).not.toHaveBeenCalled()
    expect(openTabs.openTab).not.toHaveBeenCalled()
    expect(openTabs.activateTab).not.toHaveBeenCalled()
  })

  it('activates the existing tab instead of navigating when the target entity already has a slot', () => {
    const openTabs = openTabsMock()
    openTabs.state = {
      tabs: [
        tabEntry({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'R1' }),
        tabEntry({ id: 'run:RUN-7', kind: 'run', runId: 'RUN-7', title: 'R7' }),
      ],
      activeTabId: 'run:RUN-1',
      history: ['run:RUN-1'],
      historyCursor: 0,
    }
    const navigate = vi.fn()
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7' } },
      REGISTRY,
    )
    const outcome = applyTier1Action(plan, { openTabs, navigate })
    expect(outcome.ok).toBe(true)
    expect(outcome.kind).toBe('activated')
    expect(openTabs.activateTab).toHaveBeenCalledWith('run:RUN-7')
    expect(openTabs.navigateActiveTab).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(openTabs.replaceState).not.toHaveBeenCalled()
  })

  it('unknown surface yields UNKNOWN_SURFACE with zero navigate/openTab/replaceState calls', () => {
    const openTabs = openTabsMock()
    const navigate = vi.fn()
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-nope', target: { kind: 'run', id: 'RUN-7' } },
      REGISTRY,
    )
    const outcome = applyTier1Action(plan, { openTabs, navigate })
    expect(outcome.ok).toBe(false)
    expect(outcome.kind).toBe('noop')
    expect(outcome.diagnostics[0]?.code).toBe('UNKNOWN_SURFACE')
    expect(navigate).not.toHaveBeenCalled()
    expect(openTabs.openTab).not.toHaveBeenCalled()
    expect(openTabs.navigateActiveTab).not.toHaveBeenCalled()
    expect(openTabs.activateTab).not.toHaveBeenCalled()
    expect(openTabs.replaceState).not.toHaveBeenCalled()
    expect(openTabs.closeTab).not.toHaveBeenCalled()
  })

  it('protocol-step focus calls focusProtocolStep with the step identity and performs NO navigation', () => {
    const openTabs = openTabsMock()
    const navigate = vi.fn()
    const focusProtocolStep = vi.fn()
    const plan = planTier1Action(
      { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PROTO-1', stepId: 'STEP-3', label: 'Incubate' } },
      REGISTRY,
    )
    const outcome = applyTier1Action(plan, { openTabs, navigate, focusProtocolStep })
    expect(outcome.ok).toBe(true)
    expect(outcome.kind).toBe('focused')
    expect(focusProtocolStep).toHaveBeenCalledWith({ stepId: 'STEP-3', label: 'Incubate' })
    expect(navigate).not.toHaveBeenCalled()
    expect(openTabs.navigateActiveTab).not.toHaveBeenCalled()
    expect(openTabs.activateTab).not.toHaveBeenCalled()
    expect(openTabs.openTab).not.toHaveBeenCalled()
    expect(openTabs.replaceState).not.toHaveBeenCalled()
  })

  it('focus requested with no provider yields NO_FOCUS_PROVIDER with zero movement', () => {
    const openTabs = openTabsMock()
    const navigate = vi.fn()
    const plan = planTier1Action(
      { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PROTO-1', stepId: 'STEP-3' } },
      REGISTRY,
    )
    const outcome = applyTier1Action(plan, { openTabs, navigate })
    expect(outcome.ok).toBe(false)
    expect(outcome.diagnostics[0]?.code).toBe('NO_FOCUS_PROVIDER')
    expect(navigate).not.toHaveBeenCalled()
    expect(openTabs.activateTab).not.toHaveBeenCalled()
    expect(openTabs.navigateActiveTab).not.toHaveBeenCalled()
  })

  it('bare focus with no existing slot and no routable surface yields UNROUTABLE_SURFACE + zero movement', () => {
    const openTabs = openTabsMock()
    const navigate = vi.fn()
    const plan = planTier1Action({ action: 'focus', target: { kind: 'run', id: 'RUN-42' } }, REGISTRY)
    const outcome = applyTier1Action(plan, { openTabs, navigate })
    expect(outcome.ok).toBe(false)
    expect(outcome.diagnostics[0]?.code).toBe('UNROUTABLE_SURFACE')
    expect(navigate).not.toHaveBeenCalled()
    expect(openTabs.activateTab).not.toHaveBeenCalled()
    expect(openTabs.navigateActiveTab).not.toHaveBeenCalled()
  })

  it('null tab store yields NO_TAB_STORE with zero movement', () => {
    const navigate = vi.fn()
    const plan = planTier1Action({ action: 'focus', target: { kind: 'run', id: 'RUN-42' } }, REGISTRY)
    const outcome = applyTier1Action(plan, { openTabs: null, navigate })
    expect(outcome.ok).toBe(false)
    expect(outcome.diagnostics[0]?.code).toBe('NO_TAB_STORE')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('no tier-1 path dispatches replace or close — reducer spy: every tier-1 action is activate/navigate-active only', () => {
    const dispatched: Array<{ type: string }> = []
    const seed: OpenTabsState = {
      tabs: [
        tabEntry({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'R1' }),
        tabEntry({ id: 'run:RUN-7', kind: 'run', runId: 'RUN-7', title: 'R7' }),
      ],
      activeTabId: 'run:RUN-1',
      history: ['run:RUN-1'],
      historyCursor: 0,
    }
    let state = seed
    const openTabs: OpenTabsContextValue = {
      ...openTabsMock(),
      get state() {
        return state
      },
      activateTab: (tabId: string) => {
        const action = { type: 'activate', tabId } as const
        dispatched.push(action)
        state = openTabsReducer(state, action)
      },
      navigateActiveTab: (tab: WorkspaceTab) => {
        const action = { type: 'navigate-active', tab } as const
        dispatched.push(action)
        state = openTabsReducer(state, action)
      },
    }
    const navigate = vi.fn()

    const activatePlan = planTier1Action({ action: 'focus', target: { kind: 'run', id: 'RUN-7' } }, REGISTRY)
    expect(applyTier1Action(activatePlan, { openTabs, navigate }).kind).toBe('activated')

    const navPlan = planTier1Action(
      { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-9' } },
      REGISTRY,
    )
    expect(applyTier1Action(navPlan, { openTabs, navigate }).kind).toBe('navigated')

    expect(dispatched.map((a) => a.type).sort()).toEqual(['activate', 'navigate-active'])
    expect(dispatched.some((a) => a.type === 'replace' || a.type === 'close')).toBe(false)
  })

  it('tier-1 apply touches no non-target tab entry (reference-identity of every other OpenTabState)', () => {
    const dirtyEntry = tabEntry({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'dirty editor lives here' })
    const otherEntry = tabEntry({ id: 'project:STU-9', kind: 'project', studyId: 'STU-9', title: 'untouched' })
    let state: OpenTabsState = { tabs: [dirtyEntry, otherEntry], activeTabId: 'run:RUN-1', history: ['run:RUN-1'], historyCursor: 0 }
    const openTabs: OpenTabsContextValue = {
      ...openTabsMock(),
      get state() {
        return state
      },
      navigateActiveTab: (tab: WorkspaceTab) => {
        state = openTabsReducer(state, { type: 'navigate-active', tab })
      },
      activateTab: (tabId: string) => {
        state = openTabsReducer(state, { type: 'activate', tabId })
      },
    }
    const plan = planTier1Action(
      { action: 'open-surface', surface: 'surface-run', target: { kind: 'run', id: 'RUN-7' } },
      REGISTRY,
    )
    const outcome = applyTier1Action(plan, { openTabs, navigate: vi.fn() })
    expect(outcome.ok).toBe(true)
    // The non-target entry (the dirty editor's slot) is the SAME object after the apply.
    expect(state.tabs[1]).toBe(otherEntry)
    // The active slot itself changed content (that is the navigation); its entry
    // identity is the only one that moved.
    expect(state.tabs[0]).not.toBe(dirtyEntry)
  })

  it('re-registration of the active tab is idempotent: navigate-active same payload keeps state identity (:203 guard); activate of the active tab keeps the push payload identical', () => {
    const entry = tabEntry({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'R1' })
    const state: OpenTabsState = { tabs: [entry], activeTabId: 'run:RUN-1', history: ['run:RUN-1'], historyCursor: 0 }
    // The navigate-active NO-OP GUARD (OpenTabsContext.tsx:203-205): same payload
    // ⇒ the SAME state object ⇒ no push, no history.
    expect(openTabsReducer(state, { type: 'navigate-active', tab: entry.tab })).toBe(state)
    // activateTab of the already-active tab changes no content: the session
    // payload the push effect compares (useSessionSync.ts:128) is byte-identical,
    // so the debounced push skips.
    const activated = openTabsReducer(state, { type: 'activate', tabId: 'run:RUN-1' })
    expect(sessionToYaml(activated)).toBe(sessionToYaml(state))
  })
})

describe('accept guard — dedup on accept identity, key recorded ONLY on the successful-apply path (D1 fix)', () => {
  const identity: AcceptedWorkstateIdentity = { draftId: 'D-1', revision: 1, reviewHash: 'hash-aaa' }

  it('peek does NOT consume: peeking fresh repeatedly stays fresh until a record happens', () => {
    const seen = new Set<AcceptGuardKey>()
    expect(peekAcceptGuard(identity, seen)).toBe('fresh')
    expect(peekAcceptGuard(identity, seen)).toBe('fresh') // peek alone never records
    expect(seen.size).toBe(0)
    recordAcceptedApply(identity, seen)
    expect(peekAcceptGuard(identity, seen)).toBe('duplicate')
  })

  it('a failed apply (validation would reject) that records NOTHING leaves the identity fresh — a corrected re-delivery of the SAME identity is NOT duplicate-ignored', () => {
    const seen = new Set<AcceptGuardKey>()
    // Delivery 1: identity is fresh, but the body is malformed → the caller
    // never reaches recordAcceptedApply (the executor only records after a
    // successful validate+apply).
    expect(peekAcceptGuard(identity, seen)).toBe('fresh')
    expect(seen.size).toBe(0) // the failed path consumed nothing
    // Delivery 2: same identity, corrected body → still fresh, applies.
    expect(peekAcceptGuard(identity, seen)).toBe('fresh')
    recordAcceptedApply(identity, seen)
    // Delivery 3: genuine repeat of the SUCCESSFULLY applied identity → duplicate.
    expect(peekAcceptGuard(identity, seen)).toBe('duplicate')
  })

  it('a later revision (new reviewHash) is NEVER blocked, even with identical tabs', () => {
    const seen = new Set<AcceptGuardKey>()
    recordAcceptedApply(identity, seen)
    expect(peekAcceptGuard({ draftId: 'D-1', revision: 2, reviewHash: 'hash-bbb' }, seen)).toBe('fresh')
  })

  it('the key is identity, not JSON: same identity recorded on success then re-delivered is duplicate regardless of body bytes', () => {
    const seen = new Set<AcceptGuardKey>()
    recordAcceptedApply(identity, seen)
    // Same draftId:revision:reviewHash — a re-delivery of the same accepted
    // revision whose body bytes differ in irrelevant ways — must be duplicate.
    expect(peekAcceptGuard({ ...identity }, seen)).toBe('duplicate')
  })

  it('key format stays draftId:revision:reviewHash (never document bytes)', () => {
    const seen = new Set<AcceptGuardKey>()
    recordAcceptedApply(identity, seen)
    expect([...seen]).toEqual(['D-1:1:hash-aaa'])
  })
})

describe('validateAcceptedWorkstate — pure-layer coverage of the shared accept-body rules (D2)', () => {
  const flatBody = (sessionDocument: unknown): Record<string, unknown> => ({
    sessionDocument,
    summary: 'open the titration run',
    resolvedTerms: [],
  })

  it('accepts the FLAT accept body (no {result:{...}} wrapper — OQ1) and returns the validated doc', () => {
    const result = validateAcceptedWorkstate(
      flatBody({
        version: 1,
        activeTabId: 'run:RUN-7',
        tabs: [
          { kind: 'project', studyId: 'STU-1', title: 'DHVC' },
          { kind: 'run', runId: 'RUN-7', title: 'Titration' },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.doc.version).toBe(1)
      expect(result.doc.activeTabId).toBe('run:RUN-7')
      expect(result.doc.tabs.map((t) => t.kind)).toEqual(['project', 'run'])
    }
  })

  it('non-object body (null / array / string) yields MALFORMED_ACCEPTED_DOCUMENT', () => {
    for (const bad of [null, undefined, [1, 2], 'version: 1', 42]) {
      const result = validateAcceptedWorkstate(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.diagnostic.code).toBe('MALFORMED_ACCEPTED_DOCUMENT')
        expect(result.diagnostic.path).toBe('body')
      }
    }
  })

  it('body without sessionDocument yields MALFORMED_ACCEPTED_DOCUMENT at body.sessionDocument', () => {
    const result = validateAcceptedWorkstate({ summary: 'no doc here' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('MALFORMED_ACCEPTED_DOCUMENT')
      expect(result.diagnostic.path).toBe('body.sessionDocument')
    }
  })

  it('version !== 1 yields MALFORMED_ACCEPTED_DOCUMENT', () => {
    const result = validateAcceptedWorkstate(flatBody({ version: 2, tabs: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('MALFORMED_ACCEPTED_DOCUMENT')
      expect(result.diagnostic.path).toBe('body.sessionDocument')
      expect(result.diagnostic.message).toContain('version')
    }
  })

  it('missing tabs array yields MALFORMED_ACCEPTED_DOCUMENT', () => {
    const result = validateAcceptedWorkstate(flatBody({ version: 1 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('MALFORMED_ACCEPTED_DOCUMENT')
      expect(result.diagnostic.message).toContain('tabs')
    }
  })

  it('tab without a string kind yields MALFORMED_ACCEPTED_DOCUMENT naming the tab index', () => {
    const result = validateAcceptedWorkstate(flatBody({ version: 1, tabs: [{ title: 'no kind' }] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostic.code).toBe('MALFORMED_ACCEPTED_DOCUMENT')
      expect(result.diagnostic.message).toContain('tab 0')
    }
  })

  it('activeTabId null-vs-absent: absent normalizes to null, explicit null stays null, a string is preserved (no invented active tab)', () => {
    const absent = validateAcceptedWorkstate(flatBody({ version: 1, tabs: [{ kind: 'run', runId: 'RUN-7' }] }))
    expect(absent.ok).toBe(true)
    if (absent.ok) {
      expect(absent.doc.activeTabId).toBe(null)
      expect('activeTabId' in absent.doc).toBe(true) // normalized to explicit null, not dropped
    }
    const explicitNull = validateAcceptedWorkstate(
      flatBody({ version: 1, activeTabId: null, tabs: [{ kind: 'run', runId: 'RUN-7' }] }),
    )
    expect(explicitNull.ok).toBe(true)
    if (explicitNull.ok) expect(explicitNull.doc.activeTabId).toBe(null)
    const present = validateAcceptedWorkstate(
      flatBody({ version: 1, activeTabId: 'run:RUN-7', tabs: [{ kind: 'run', runId: 'RUN-7' }] }),
    )
    expect(present.ok).toBe(true)
    if (present.ok) expect(present.doc.activeTabId).toBe('run:RUN-7')
  })

  it('validate ≠ rebuild: no slot-id minting, and the returned tabs array never aliases the caller-held body array', () => {
    const tabs = [{ kind: 'run', runId: 'RUN-7' }]
    const result = validateAcceptedWorkstate(flatBody({ version: 1, tabs }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.doc.tabs[0]).not.toHaveProperty('id') // ids stay in sessionDocumentToState
      expect(result.doc.tabs).not.toBe(tabs) // shallow copy: no aliasing into the caller's value
    }
  })
})

describe('hardcode boundary — executor source contains no second push path and no surface-name literals', () => {
  // vitest cwd is the app root; jsdom's import.meta.url is an http URL, so
  // resolve the module's own source path from cwd.
  const source = readFileSync('src/shared/session/workstateExecutor.ts', 'utf8')

  it('executor module source contains no putSession / import of apiClient session calls (source-text grep test)', () => {
    expect(source).not.toContain('putSession')
    expect(source).not.toContain("from '../api/client'")
    expect(source).not.toContain('replaceState(')
  })

  it('executor source contains no hardcoded surface names (registry membership is registry.find only)', () => {
    for (const name of ['run-design', 'run-plan', 'run-execute', 'protocol-review', 'ingestion', 'analysis']) {
      expect(source).not.toContain(`'${name}'`)
    }
  })
})
