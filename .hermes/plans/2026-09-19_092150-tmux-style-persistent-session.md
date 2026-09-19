# Plan — tmux-style persistent workspace session (tabs survive refresh, survive device switch, and a fresh load lands in your project)

Date: 2026-09-19
Repo: `/mnt/vast/home/brad/git/computable-lab` (branch `main`, working tree DIRTY — see §Current context)
Implementer: zero prior context assumed. Read §0 before touching anything.

---

## 0. Goal

Make the in-app workspace (the `WorkspaceTabStrip` tab set + active tab) a **server-persisted session** that survives a page reload and is attachable from another device, and make a fresh page load **restore the active tab's route** instead of dropping the user on `/splash` — with the already-built declarative surface registry (`schema/registry/surfaces/surfaces.yaml`) supplying the surface identity that the AI-emittable session YAML resolves into routes.

Two user-visible acceptance criteria (these are the bug report, verbatim):

1. Reload the page with 3 tabs open → the same 3 tabs are still there, same one active.
2. Load a fresh page (or open the app on another device) → you land on the active tab's route (a project/run), not `/splash`.

---

## Current context / assumptions

### 0.1 The pieces that already exist (do not rebuild)

| Piece | Path | What it is |
|---|---|---|
| Tab store | `app/src/shared/shell/OpenTabsContext.tsx` | `openTabsReducer` + `OpenTabsProvider` + `useOpenTabs()`; state = `{ tabs: OpenTabState[], activeTabId, history, historyCursor }`; each tab carries `activeRightPaneMode`, `breadcrumb`, `contentHistory`/`contentCursor` |
| Tab strip | `app/src/shared/shell/WorkspaceTabStrip.tsx` | renders the strip; **exports `tabPath(tab): string \| null`** — the exhaustive tab→route table (lines 177-214). THIS is the only route table; do not add a second one |
| Boot redirect | `app/src/shared/shell/HomeRedirect.tsx` | `/` → active tab's `tabPath`, else `/splash` |
| Open helpers | `app/src/shared/lib/openContent.ts` | `openContent()` (navigate active tab in place), `openInNewTab()` |
| Surfaces registry (data) | `schema/registry/surfaces/surfaces.yaml` | declared surface ids/paths/objectTypes/aiRole; served by `GET /api/surfaces` |
| Surfaces loader (server) | `server/src/surfaces/surfaces.ts` + `server/src/api/routes/surfaces.ts` | reads + normalizes the YAML (currently has a **hardcoded id allow-list** in `normalizeSurface`) |
| Surfaces schema | `schema/registry/surfaces/surfaces.schema.yaml` | Ajv JSON Schema 2020-12 for the registry |
| Surfaces (client) | `app/src/shared/surfaces.ts`, `app/src/shared/surfaces/registry.ts`, `app/src/shared/surfaces/resolveSurface.ts` | client mirror type + one-shot loader (`loadSurfaceRegistry`) + **pure** `resolveSurfaceFromPath(path, {runMode})` |
| Page→AI context | `app/src/shared/context/useSurfaceContext.ts` (`SurfaceContextPayload`) | the deterministic "where am I" payload every page emits |
| Per-user file store precedent | `server/src/ai-threads/AiThreadStore.ts` + `server/src/api/handlers/AiThreadHandlers.ts` | **copy this pattern**: JSON/YAML files under `var/<thing>/{userId}/...`, `x-user-id` header → userId, `default` fallback, tmp-write+rename, routes registered from `server/src/server.ts` |
| Identity header | `app/src/shared/api/base.ts` | the API client already sends `x-user-id` on EVERY request (`client.ts:1298`), so a server store keyed by user needs **no** client plumbing |
| Server route registration | `server/src/server.ts` ~line 1413 | `{ const { registerSurfacesRoutes } = await import('./api/routes/surfaces.js'); registerSurfacesRoutes(instance, ctx); }` — copy this shape |

### 0.2 The two root causes (REPRODUCED, not guessed)

Probe A — seed `localStorage['cl-open-tabs']` with 2 tabs (activeTabId = first), then `goto http://localhost:5174/`:

```
url: http://localhost:5174/splash
tabs in DOM: 0
localStorage after: {"tabs":[],"activeTabId":null,"history":[],"historyCursor":-1}
```

Probe B — same seed, `goto http://localhost:5174/splash` directly (no `/` redirect involved):

```
url: http://localhost:5174/splash
tabs in DOM: 0
storage after reload: {"tabs":[],"activeTabId":null,...}   # WIPED
```

**Root cause 1 — the persist effect clobbers storage before/around hydration.** `OpenTabsProvider` (`OpenTabsContext.tsx:457-473`) hydrates in a `useEffect` and persists in a second `useEffect` that runs on **every** `state` change including the very first render, where `state` is the hardcoded empty state. `app/src/main.tsx` renders the whole app inside `<StrictMode>`, so mount effects are invoked twice; the second pass reads storage that the first pass's empty-state write already wiped. Net effect: **every full page load erases the session** (Probe B). This is the "all of the tabs disappear" bug.

**Root cause 2 — hydration is too late for the router.** `HomeRedirect` reads `state.tabs` during the first render, when hydration has not happened, finds nothing, and commits `<Navigate to="/splash">`. The stored active tab's route is never restored (Probe A). This is the "on a fresh page I am not in a project" bug.

**Root cause 3 — there is no session outside the browser.** localStorage is per-browser-profile, so "same open session on my laptop and my phone" is not expressible. Nothing server-side holds the tab set.

### 0.3 Assumptions

1. "Session" here = the **workspace UI session** (open tabs + active tab + per-tab right-pane mode + per-tab history). It is NOT a lab/scientific record, NOT a `CTX-*` biological context, and NOT the per-study `records/studies/<id>/workspace.yaml` sidecar (`server/src/api/handlers/WorkspaceHandlers.ts`). Do not conflate.
2. Sessions are transient UI state → they live under `var/sessions/{userId}/...` (outside the records git tree), exactly like `var/ai-threads/`. They are not record kinds, so the `*.schema.yaml`/`*.lint.yaml`/`*.ui.yaml` triplet does NOT apply; structural validation still goes through Ajv (§Task 8) because rule #3 is about validation authority, not about file location.
3. The AI-emittable navigation YAML is the **session document** (§Architecture) and its per-surface form is `SurfaceContextPayload`. Both are plain YAML/JSON; no new prose parsing anywhere.
4. Cross-device sync is **attach-style, last-writer-wins, no CRDT**: pull on boot + on window focus/visibility-change, push debounced. True live multi-attach streaming is out of scope.
5. UI work is not done until it is driven in a real browser (repo SOP).
6. The app unit-test baseline is dirty (≈50 files fail to collect under vitest, mostly a missing `virtual:cla-ai-overlay` module and Playwright specs being collected). **Gate with targeted `npx vitest run <file>` + `npm run typecheck -w app`, never the full suite.**
7. The dev stacks are ALREADY RUNNING: main frontend `:5174` → backend `:3001` (verified `200`), plus an isolated worktree frontend `:5191` → `:3091`. Restart only the specific PID you need: find it with `ss -tlnp | grep 5174` and kill that PID. **Never `pkill -f vite` / `pkill -f tsx`** — that is Brad's hard rule.
8. 277+ pre-existing files in the working tree carry an exec-bit flip and there are hundreds of uncommitted edits from earlier sessions. **Stage only the files you touch** (`git add <exact paths>`). Never `git add -A`.

---

## Architecture / proposed approach

Three moves, in order: (1) make the tab store **hydrate synchronously on first render** and stop the persist effect from writing before hydration, so a reload keeps the tab set and `HomeRedirect` can route to the restored active tab; (2) make the session **portable** by persisting the same state to the backend at `GET/PUT /api/session` (per `x-user-id`, `var/sessions/{userId}/main.yaml`, Ajv-validated) with a small `useSessionSync` hook that adopts the newer of {server, localStorage} on boot and re-pulls on focus — that is the tmux "attach from any device"; (3) close the loop with the deterministic-nav work already landed by making the session document the AI-facing navigation primitive: one YAML string → `sessionFromYaml()` → tabs → `tabPath()` → routes, plus a declarative `params` binding on surfaces so a `SurfaceContextPayload` ("any page context") also resolves to a route, using the registry as the only source of surface identity.

---

## Step-by-step tasks

Work the tasks in order. Every code task is TDD: write the failing test, run it, see it fail, implement minimally, run it green, commit.

### Task 1 — Capture the two bugs as an executable e2e gate (RED first)

**File:** create `app/e2e/session-persistence.spec.ts`

```ts
import { test, expect, type Page } from '@playwright/test'

/**
 * tmux-style session persistence (plan 2026-09-19_092150).
 * Drives the REAL app: no API mocking. Tabs are seeded straight into
 * localStorage so the spec is hermetic (no dependence on lab records).
 */
const KEY = 'cl-open-tabs'

const runTab = (rid: string, title: string) => ({
  tab: { id: `run:${rid}`, kind: 'run', runId: rid, title },
  activeRightPaneMode: 'protocol',
  breadcrumb: [],
  contentHistory: [{ id: `run:${rid}`, kind: 'run', runId: rid, title }],
  contentCursor: 0,
})

const seed = (activeIndex = 0) => ({
  tabs: [runTab('RUN-A', 'Run A'), runTab('RUN-B', 'Run B'), runTab('RUN-C', 'Run C')],
  activeTabId: `run:RUN-${['A', 'B', 'C'][activeIndex]}`,
  history: ['run:RUN-A', 'run:RUN-B', 'run:RUN-C'],
  historyCursor: activeIndex,
})

async function seedTabs(page: Page, activeIndex = 0) {
  await page.addInitScript(
    ([key, state]) => window.localStorage.setItem(key!, JSON.stringify(state)),
    [KEY, seed(activeIndex)] as const,
  )
}

test('a full page load keeps every open tab (no wipe) and lands on the active tab route', async ({ page }) => {
  await seedTabs(page, 1) // RUN-B is active
  await page.goto('/')
  // (1) the active tab's route is restored instead of /splash
  await expect(page).toHaveURL(/\/runs\/RUN-B$/, { timeout: 15_000 })
  // (2) all three tabs are still in the strip
  await expect(page.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })
  // (3) storage was not clobbered
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), KEY)
  expect(JSON.parse(stored!).tabs).toHaveLength(3)
})

test('a reload from inside the app keeps all tabs and the active one', async ({ page }) => {
  await seedTabs(page, 2)
  await page.goto('/')
  await expect(page.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })
  await page.reload()
  await expect(page.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/runs\/RUN-C$/, { timeout: 15_000 })
})
```

Run it (the ONLY supported Playwright invocation on this host — a bare run fails on a missing firefox):

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/session-persistence.spec.ts --project=chromium 2>&1 | tail -15
```

Expected: **2 failed.**

- test 1: URL is `http://localhost:5174/splash` (assertion on `/runs/RUN-B$` fails)
- test 2: `locator('.workspace-tab')` resolves to 0 elements

Commit the RED gate:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add app/e2e/session-persistence.spec.ts
git commit -m "test(e2e): RED gate — reload must keep tabs and restore the active tab route"
```

### Task 2 — Hydrate the tab store synchronously; never persist before hydration

**File:** `app/src/shared/shell/OpenTabsContext.tsx`

Step 2a — key storage per user (so the same session follows the user to another device, and never leaks between users). Add near the top (after the React imports):

```ts
import { getCurrentUserId } from '../api/base'
```

Then replace the storage section (currently lines 350-420) with:

```ts
// ── localStorage persistence (per-user; the server session is the source of
//    truth for cross-device attach — this is the first-paint cache) ────────

const STORAGE_KEY = 'cl-open-tabs'

interface StoredTabEntry {
  tab: WorkspaceTab
  activeRightPaneMode: WorkspaceRightPaneMode
  breadcrumb?: BreadcrumbItem[]
  contentHistory?: WorkspaceTab[]
  contentCursor?: number
}

interface StoredState {
  tabs: StoredTabEntry[]
  activeTabId: string | null
  history?: string[]
  historyCursor?: number
  /** Server clock of the last write, for adopt-newer reconciliation. */
  updatedAt?: string
}

const EMPTY_STATE: OpenTabsState = { tabs: [], activeTabId: null, history: [], historyCursor: -1 }

/** Resolve the storage key: explicit userId wins, else the signed-in user. */
export function tabsStorageKey(userId?: string): string {
  const uid = userId ?? getCurrentUserId() ?? undefined
  return uid ? `${STORAGE_KEY}:${uid}` : STORAGE_KEY
}

/** Read the persisted session. Exported so tests and the sync hook share one reader. */
export function loadFromStorage(userId?: string): OpenTabsState {
  try {
    const raw = localStorage.getItem(tabsStorageKey(userId))
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as StoredState
    if (!Array.isArray(parsed.tabs)) return EMPTY_STATE
    return {
      tabs: parsed.tabs.map((t) => {
        const entry = {
          tab: t.tab,
          activeRightPaneMode: t.activeRightPaneMode ?? 'ai',
          breadcrumb: t.breadcrumb ?? [],
        }
        // Migrate older persisted tabs to the per-tab content history model.
        const contentHistory = Array.isArray(t.contentHistory) && t.contentHistory.length > 0
          ? t.contentHistory
          : [t.tab]
        const contentCursor = typeof t.contentCursor === 'number' && t.contentCursor >= 0
          ? Math.min(t.contentCursor, contentHistory.length - 1)
          : contentHistory.length - 1
        return { ...entry, contentHistory, contentCursor }
      }),
      activeTabId: parsed.activeTabId ?? null,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      historyCursor: typeof parsed.historyCursor === 'number' ? parsed.historyCursor : -1,
    }
  } catch {
    return EMPTY_STATE
  }
}

/** Write the persisted session (best-effort; localStorage may be unavailable). */
export function saveToStorage(state: OpenTabsState, userId?: string): void {
  try {
    const toStore: StoredState = {
      tabs: state.tabs.map((t) => ({
        tab: t.tab,
        activeRightPaneMode: t.activeRightPaneMode,
        breadcrumb: t.breadcrumb,
        contentHistory: t.contentHistory,
        contentCursor: t.contentCursor,
      })),
      activeTabId: state.activeTabId,
      history: state.history,
      historyCursor: state.historyCursor,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(tabsStorageKey(userId), JSON.stringify(toStore))
  } catch {
    // localStorage might be full or unavailable — silently ignore.
  }
}
```

Step 2b — hydrate in the reducer initializer and gate the persist effect. Replace the current provider body (lines 457-473) with:

```tsx
export function OpenTabsProvider({ userId, children }: OpenTabsProviderProps) {
  // Hydrate SYNCHRONOUSLY on the first render: `HomeRedirect` and every host
  // page's mount effect read `state` during that render, so a useEffect-based
  // load would (a) route the user to /splash and (b) let the persist effect
  // below write the EMPTY pre-hydration state over the stored session.
  const resolvedUserId = userId ?? getCurrentUserId() ?? undefined
  const [state, dispatch] = useReducer(openTabsReducer, resolvedUserId, loadFromStorage)
  const hydratedRef = useRef(false)

  // A user switch (rare — the switcher reloads the page) re-reads that user's
  // session instead of bleeding the previous user's tabs into the new one.
  useEffect(() => {
    dispatch({ type: 'replace', state: loadFromStorage(resolvedUserId) })
  }, [resolvedUserId])

  // Persist on change — but NEVER before hydration, or the first render's
  // empty state wipes the stored session (StrictMode double-invokes effects,
  // so this write really does land before the load on the second pass).
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }
    saveToStorage(state, resolvedUserId)
  }, [state, resolvedUserId])
```

Add `useRef` to the React import list on line 14-22 (`useRef,`).

Add one more thing while here — a public hook so the sync layer (§Task 11) can push the full state and consumers can read it:

```tsx
/** Replace the whole session (server attach / session-YAML apply). */
export function useReplaceSession(): (state: OpenTabsState) => void {
  const { dispatchReplace } = useOpenTabsInternal()
  return dispatchReplace
}
```

That needs `dispatchReplace` on the context value; simpler and YAGNI-correct — add `replaceState` to `OpenTabsContextValue`:

```ts
  /** Replace the entire session (server attach, session-YAML apply). */
  replaceState: (state: OpenTabsState) => void
```

in the interface, and in the `useMemo` value block add:

```ts
    replaceState,
```

with, next to the other `useCallback`s:

```ts
  const replaceState = useCallback((next: OpenTabsState) => dispatch({ type: 'replace', state: next }), [])
```

and add `replaceState` to the `useMemo` dependency array.

**Verify (targeted unit tests):**

**File:** `app/src/shared/shell/OpenTabsContext.hydration.test.ts` (new)

```ts
/**
 * Hydration regressions (plan 2026-09-19_092150, root cause 1):
 * the persisted session must be readable on the FIRST render and must never be
 * written over by the pre-hydration empty state.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { OpenTabsProvider, useOpenTabs } from './OpenTabsContext'

const KEY = 'cl-open-tabs'
const STORED = {
  tabs: [
    {
      tab: { id: 'run:RUN-A', kind: 'run', runId: 'RUN-A', title: 'Run A' },
      activeRightPaneMode: 'protocol',
      breadcrumb: [],
      contentHistory: [{ id: 'run:RUN-A', kind: 'run', runId: 'RUN-A', title: 'Run A' }],
      contentCursor: 0,
    },
  ],
  activeTabId: 'run:RUN-A',
  history: ['run:RUN-A'],
  historyCursor: 0,
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(OpenTabsProvider, null, children)

describe('OpenTabsProvider hydration', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(KEY, JSON.stringify(STORED))
  })

  it('exposes the stored session on the first render', () => {
    const { result } = renderHook(() => useOpenTabs(), { wrapper })
    // First render — not after an effect.
    expect(result.current.state.tabs).toHaveLength(1)
    expect(result.current.state.activeTabId).toBe('run:RUN-A')
  })

  it('never overwrites storage with the pre-hydration empty state', () => {
    renderHook(() => useOpenTabs(), { wrapper })
    const raw = localStorage.getItem(KEY)
    expect(JSON.parse(raw!).tabs).toHaveLength(1)
  })
})
```

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/shared/shell/OpenTabsContext.hydration.test.ts 2>&1 | tail -6
```

Expected on the unpatched file: 2 failed. After the patch: `Test Files 1 passed`, `Tests 2 passed`.

Then re-run the e2e gate from Task 1 — test 2 must pass, test 1 may still fail (HomeRedirect is Task 3).

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/session-persistence.spec.ts --project=chromium 2>&1 | tail -8
```

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add app/src/shared/shell/OpenTabsContext.tsx app/src/shared/shell/OpenTabsContext.hydration.test.ts
git commit -m "fix(open-tabs): hydrate the session synchronously and never persist the empty pre-hydration state"
```

### Task 3 — Restore the active tab's route on a fresh load

Because Task 2 makes hydration synchronous, `HomeRedirect` can now decide correctly on its first render. It only needs to survive a stored active tab that has no route.

**File:** `app/src/shared/shell/HomeRedirect.tsx` (replace the whole file)

```tsx
/**
 * "/" is not a destination — it is "resume my session". The active tab's route
 * wins; if that tab has no route (viewer tabs like project-details return null
 * from tabPath), fall back to the first tab that does; only an empty session
 * gets the /splash launcher.
 *
 * This is only correct because OpenTabsProvider hydrates synchronously — do not
 * reintroduce a useEffect-based load (see OpenTabsContext.hydration.test.ts).
 */
import { Navigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { tabPath } from './WorkspaceTabStrip'

export function HomeRedirect() {
  const { state } = useOpenTabs()
  const active = state.tabs.find((t) => t.tab.id === state.activeTabId)
  const activePath = active ? tabPath(active.tab) : null
  if (activePath) return <Navigate to={activePath} replace />

  const fallback = state.tabs
    .map((t) => tabPath(t.tab))
    .find((p): p is string => p !== null)
  if (fallback) return <Navigate to={fallback} replace />

  return <Navigate to="/splash" replace />
}
```

**Verify:**

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/session-persistence.spec.ts --project=chromium 2>&1 | tail -8
```

Expected: `2 passed`.

```bash
cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck -w app 2>&1 | tail -5
```

Expected: exit 0 (no output beyond the script banner).

Commit:

```bash
git add app/src/shared/shell/HomeRedirect.tsx
git commit -m "fix(boot): a fresh load resumes the active tab's route instead of /splash"
```

### Task 4 — Prove it in the live dev app (repo SOP: browser before 'done')

The dev server on `:5174` hot-reloads, so no restart is needed for frontend-only changes.

Drive the real app and report the observed values:

```bash
curl -s -o /dev/null -w "5174:%{http_code}\n" http://localhost:5174/ && curl -s -o /dev/null -w "3001:%{http_code}\n" http://localhost:3001/api/health
```

Expected: `5174:200` and `3001:200`. If either is down, restart ONLY that PID:

```bash
ss -tlnp | grep -E ':5174|:3001'      # note the PIDs
kill <frontend-pid>                    # then: ./start-app.sh   (from the repo root)
```

Then, using `browser_exec` on `http://localhost:5174/`:
1. Seed `localStorage['cl-open-tabs']` with 3 run tabs (`activeTabId` = the 2nd), reload.
2. Print `page_info()['url']` → must end `/runs/<2nd run>`.
3. Print `js("document.querySelectorAll('.workspace-tab').length")` → must be `3`.
4. Print `js("localStorage.getItem('cl-open-tabs')")` → must contain 3 tabs.

Paste the three observed values into the commit message body (evidence, not adjectives).

No commit for this task unless a fix was needed.

### Task 5 — Correct the surface registry's route patterns and declare what is deep-linkable

Problem: `schema/registry/surfaces/surfaces.yaml` declares `path: "/project/:studyId/run/:runId"` for the run surfaces, but `/project/:studyId/run/:runId` is a *redirect* in `app/src/App.tsx:167`; the real route is `/runs/:runId`. A route built from the registry today 404s or bounces. Fix the data, and make "can this surface be turned into a URL?" a declarative fact instead of a guess: **a surface is deep-linkable iff it declares `params`** (every `:token` in `path` bound to an `objectType`).

**File:** `schema/registry/surfaces/surfaces.yaml` — patch these entries (leave `find`/`analysis`/`knowledge` without `params`: they are context-only surfaces reached through collection routes; `results`/`run-*` are modes of the ONE run tab, matching locked decision #3).

```yaml
  - id: run-plan
    label: "Run · Plan"
    path: "/runs/:runId"
    params:
      runId: run
    objectTypes: [run]
    selectableKinds: [event, well, material, protocol-step]
    aiRole: "protocol localization & planning"
  - id: run-design
    label: "Run · Design"
    path: "/runs/:runId"
    params:
      runId: run
    objectTypes: [run]
    selectableKinds: [event, well, material]
    aiRole: "event-graph editing"
  - id: run-execute
    label: "Run · Execute"
    path: "/runs/:runId"
    params:
      runId: run
    objectTypes: [run]
    selectableKinds: [event, well, material]
    aiRole: "batch execution"
  - id: results
    label: "Results"
    path: "/runs/:runId"
    params:
      runId: run
    objectTypes: [run]
    selectableKinds: [well, measurement, event]
    aiRole: "readouts & results"
  - id: project
    label: "Project"
    path: "/project/:studyId"
    params:
      studyId: project
    objectTypes: [project]
    selectableKinds: []
    aiRole: "project home"
```

Also add to the document header, above `surfaces:`:

```yaml
# A surface is DEEP-LINKABLE iff it declares `params`: each `:token` in `path`
# bound to the active objectType that fills it. Surfaces without `params`
# (find, analysis, knowledge) are AI-context surfaces reached through their
# collection routes — they are not routable on their own. `path` is a route
# pattern relative to the app router (app/src/App.tsx), and the run surfaces
# share ONE route: plan/design/execute/results are MODES of one run tab.
```

**File:** `schema/registry/surfaces/surfaces.schema.yaml` — add `params` to the item properties (in the same block as `paths`, keeping alphabetical-ish order):

```yaml
        params:
          type: object
          description: >-
            `:token` in `path` → the objectType that fills it. Presence makes the
            surface deep-linkable.
          additionalProperties:
            type: string
            minLength: 1
```

**File:** `server/src/surfaces/surfaces.ts`
- add `params?: Record<string, string>` to `SurfaceSpec`,
- in `normalizeSurface`, read it:

```ts
  const params = obj.params;
  if (params !== undefined) {
    const p = asObject(params, `surfaces[${index}].params`);
    const entries = Object.entries(p);
    if (entries.some(([k, v]) => !k.trim() || typeof v !== 'string' || !v.trim())) {
      throw new Error(`surfaces[${index}].params must map non-empty token → objectType`);
    }
    spec.params = Object.fromEntries(entries.map(([k, v]) => [k.trim(), (v as string).trim()]));
  }
```
- **delete the hardcoded id allow-list** in the same function (lines 55-58: the `['project','run-plan',...].includes(id)` check) — rule #1/#3: membership is the registry + Ajv, never a TS literal. Replace with an Ajv call: validate the parsed document against `schema/registry/surfaces/surfaces.schema.yaml` before normalizing. Minimal honest version:

```ts
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
// (same import as schema dir usage elsewhere in server/src/validation/AjvValidator.ts)

/** Validate the registry document with Ajv (rule #3) before normalizing. */
function assertValidRegistry(schemaDir: string, doc: unknown): void {
  const schemaPath = resolve(schemaDir, 'registry/surfaces/surfaces.schema.yaml');
  const schema = parse(readFileSync(schemaPath, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addKeyword({ keyword: 'uniqueIds', validate: (ids: string[], data: unknown[]) => {
    const seen = new Set<string>();
    for (const item of data) {
      const id = (item as Record<string, unknown>)[ids[0] as unknown as number] as string | undefined;
      const key = String((item as Record<string, unknown>)[String(ids)] ?? id ?? '');
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  }});
  if (!ajv.validate(schema, doc)) {
    throw new Error(`surfaces registry invalid: ${ajv.errorsText()}`);
  }
}
```

**Do not invent this from scratch** — `server/src/validation/AjvValidator.ts` already wires Ajv for schema/ docs; call it if its constructor fits (`new AjvValidator(schemaDir)`), and only hand-roll the `uniqueIds` keyword if the shared validator cannot be reached from this module. The point is: Ajv decides, TS does not.

**Tests (RED first) — file `server/src/surfaces/surfaces.test.ts` (new):**

```ts
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadDefaultSurfacesRegistry } from './surfaces.js';

const SCHEMA_DIR = resolve(__dirname, '../../../schema');

describe('surfaces registry — deep-linkability is declared, not hardcoded', () => {
  const reg = loadDefaultSurfacesRegistry(SCHEMA_DIR);

  it('binds every :token in path to an objectType via params', () => {
    for (const s of reg.list()) {
      if (!s.params) continue;
      const tokens = [...s.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]!);
      expect(Object.keys(s.params).sort()).toEqual(tokens.sort());
    }
  });

  it('points the run surfaces at the real /runs/:runId route', () => {
    for (const id of ['run-plan', 'run-design', 'run-execute', 'results']) {
      expect(reg.get(id)!.path).toBe('/runs/:runId');
      expect(reg.get(id)!.params).toEqual({ runId: 'run' });
    }
  });
});
```

```bash
cd /mnt/vast/home/brad/git/computable-lab/server && npx vitest run src/surfaces/surfaces.test.ts 2>&1 | tail -6
```

Expected on the unpatched registry: fails (`params` undefined, path `/project/:studyId/run/:runId`). After the patch: `Tests 2 passed`. Also re-run the untracked surfaces Ajv suite, which is the existing gate for this area:

```bash
cd /mnt/vast/home/brad/git/computable-lab/server && npx vitest run src/surfaces/surfacesAjv.test.ts 2>&1 | tail -6
```

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add schema/registry/surfaces/surfaces.yaml schema/registry/surfaces/surfaces.schema.yaml server/src/surfaces/surfaces.ts server/src/surfaces/surfaces.test.ts
git commit -m "feat(surfaces): real route patterns + declarative params (deep-linkability is data, not an allow-list)"
```

### Task 6 — Mirror `params` on the client and build a route from ANY page context

**File:** `app/src/shared/surfaces.ts` — add to `SurfaceSpec`:

```ts
  /** `:token` in `path` → the objectType that fills it. Presence = deep-linkable. */
  params?: Record<string, string>
```

**File:** `app/src/shared/surfaces/surfaceRoute.ts` (new)

```ts
/**
 * surfaceRoute — turn "where I am / where the AI wants to go" into a URL, using
 * the declarative registry as the ONLY source of surface identity and route
 * patterns. Pure and unit-tested; no fetch, no DOM.
 *
 * This is the deterministic-navigation hinge: an AI (or a stored session, or a
 * test) can utter a surface context — `{ surface, active: {objectType, objectId} }`
 * — and the registry, not a TS switch, decides the route.
 */
import type { SurfaceSpec } from '../surfaces'

export interface SurfaceTarget {
  /** Registry surface id (controlled vocabulary — GET /api/surfaces). */
  surface: string
  /** The active object the surface is scoped to. */
  active: { objectType: string; objectId: string }
}

/**
 * Resolve `target` to a route, or null when the surface is not deep-linkable
 * (no `params`) or the context cannot fill every token.
 */
export function surfaceRoute(target: SurfaceTarget, registry: SurfaceSpec[]): string | null {
  const spec = registry.find((s) => s.id === target.surface)
  if (!spec?.params) return null
  const tokens = [...spec.path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]!)
  if (tokens.length === 0) return null
  let route = spec.path
  for (const token of tokens) {
    const wantedType = spec.params[token]
    if (!wantedType) return null
    if (wantedType !== target.active.objectType) return null
    if (!target.active.objectId) return null
    route = route.replace(`:${token}`, encodeURIComponent(target.active.objectId))
  }
  return route
}
```

**Test — file `app/src/shared/surfaces/surfaceRoute.test.ts` (new):**

```ts
import { describe, expect, it } from 'vitest'
import { surfaceRoute } from './surfaceRoute'
import type { SurfaceSpec } from '../surfaces'

const REGISTRY: SurfaceSpec[] = [
  { id: 'run-design', label: 'Run · Design', path: '/runs/:runId', params: { runId: 'run' },
    objectTypes: ['run'], selectableKinds: [] },
  { id: 'project', label: 'Project', path: '/project/:studyId', params: { studyId: 'project' },
    objectTypes: ['project'], selectableKinds: [] },
  { id: 'knowledge', label: 'Knowledge', path: '/knowledge',
    objectTypes: ['claim'], selectableKinds: [] },
] as SurfaceSpec[]

describe('surfaceRoute', () => {
  it('builds a run route from a run context', () => {
    expect(surfaceRoute({ surface: 'run-design', active: { objectType: 'run', objectId: 'RUN-1' } }, REGISTRY))
      .toBe('/runs/RUN-1')
  })

  it('builds a project route from a project context', () => {
    expect(surfaceRoute({ surface: 'project', active: { objectType: 'project', objectId: 'STU-1' } }, REGISTRY))
      .toBe('/project/STU-1')
  })

  it('returns null for a surface with no params (not deep-linkable)', () => {
    expect(surfaceRoute({ surface: 'knowledge', active: { objectType: 'claim', objectId: 'CLM-1' } }, REGISTRY))
      .toBeNull()
  })

  it('returns null when the context objectType cannot fill a token', () => {
    expect(surfaceRoute({ surface: 'run-design', active: { objectType: 'project', objectId: 'STU-1' } }, REGISTRY))
      .toBeNull()
  })

  it('returns null for an unknown surface (no TS literal fallback)', () => {
    expect(surfaceRoute({ surface: 'nope', active: { objectType: 'run', objectId: 'RUN-1' } }, REGISTRY))
      .toBeNull()
  })
})
```

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/shared/surfaces/surfaceRoute.test.ts 2>&1 | tail -6
```

Expected after implementation: `Tests 5 passed`.

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add app/src/shared/surfaces.ts app/src/shared/surfaces/surfaceRoute.ts app/src/shared/surfaces/surfaceRoute.test.ts
git commit -m "feat(surfaces): surfaceRoute — registry-driven route from any surface context"
```

### Task 7 — The AI-emittable session document (YAML → tabs → routes)

The session document is the single YAML string that rebuilds a whole workspace on any device. It is the tab store's own shape, serialized, so there is exactly one model (DRY) and no prose parsing anywhere.

**File:** `app/src/shared/session/sessionYaml.ts` (new)

```ts
/**
 * sessionYaml — the session document an AI (or a human, or a test) can utter to
 * rebuild a whole workspace: which tabs are open, which is active, and where to
 * start. It is the OpenTabsState shape, serialized — one model, no parallel
 * schema. Routes are NOT stored: `tabPath(tab)` derives them, so this file has
 * no route table to drift.
 *
 * Example document:
 *
 *   version: 1
 *   activeTabId: run:RUN-2026-09-12
 *   tabs:
 *     - kind: project
 *       studyId: STU-DHVC
 *       title: DHVC
 *     - kind: run
 *       runId: RUN-2026-09-12
 *       title: 2026-09-12 Run
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { WorkspaceTab, BreadcrumbItem, WorkspaceRightPaneMode } from '../../event-editor/workspace/types'
import type { OpenTabState, OpenTabsState } from '../shell/OpenTabsContext'

export interface SessionTabDoc {
  kind: WorkspaceTab['kind']
  title?: string
  activeRightPaneMode?: WorkspaceRightPaneMode
  breadcrumb?: BreadcrumbItem[]
  /** Every other tab-kind field (runId, studyId, claimId, recordId, ...). */
  [field: string]: unknown
}

export interface SessionDocument {
  version: 1
  activeTabId?: string | null
  tabs: SessionTabDoc[]
}

/** Serialize the live session to the AI-emittable document. */
export function sessionToYaml(state: OpenTabsState): string {
  const doc: SessionDocument = {
    version: 1,
    activeTabId: state.activeTabId,
    tabs: state.tabs.map((entry) => {
      const { id: _id, ...rest } = entry.tab as WorkspaceTab & Record<string, unknown>
      const tab: SessionTabDoc = {
        ...(rest as Omit<SessionTabDoc, 'kind'>),
        kind: entry.tab.kind,
        ...(entry.activeRightPaneMode ? { activeRightPaneMode: entry.activeRightPaneMode } : {}),
        ...(entry.breadcrumb.length > 0 ? { breadcrumb: entry.breadcrumb } : {}),
      }
      return tab
    }),
  }
  return stringifyYaml(doc)
}

/** Parse + validate a session document from YAML (throws on malformed input). */
export function sessionFromYaml(yaml: string): SessionDocument {
  const parsed = parseYaml(yaml) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('session document must be a mapping')
  }
  const doc = parsed as Partial<SessionDocument>
  if (doc.version !== 1) throw new Error('session document version must be 1')
  if (!Array.isArray(doc.tabs)) throw new Error('session document must have a tabs array')
  for (const [i, tab] of doc.tabs.entries()) {
    if (!tab || typeof tab !== 'object' || typeof (tab as SessionTabDoc).kind !== 'string') {
      throw new Error(`session tab ${i} must have a kind`)
    }
  }
  return { version: 1, activeTabId: doc.activeTabId ?? null, tabs: doc.tabs }
}

/**
 * Rebuild an OpenTabsState from a document. Ids are derived from the tab's own
 * stable id helpers (runTabId, projectTabId, ...) so a session document is
 * id-free and re-applying it twice is idempotent.
 */
export function sessionDocumentToState(doc: SessionDocument, tabIdFor: (tab: WorkspaceTab) => string): OpenTabsState {
  const tabs: OpenTabState[] = doc.tabs.map((rawTab) => {
    const { activeRightPaneMode, breadcrumb, ...kindFields } = rawTab
    const tab = { ...kindFields, id: tabIdFor(kindFields as WorkspaceTab) } as WorkspaceTab
    return {
      tab,
      activeRightPaneMode: activeRightPaneMode ?? 'ai',
      breadcrumb: breadcrumb ?? [],
      contentHistory: [tab],
      contentCursor: 0,
    }
  })
  const activeTabId =
    doc.activeTabId && tabs.some((t) => t.tab.id === doc.activeTabId)
      ? doc.activeTabId
      : (tabs[tabs.length - 1]?.tab.id ?? null)
  const history = activeTabId ? [activeTabId] : []
  return { tabs, activeTabId, history, historyCursor: history.length - 1 }
}
```

**File:** `app/src/shared/session/tabId.ts` (new) — one place that maps a tab to its stable id, so ids stop being re-derived per call site (they are already exported from `workspace/types.ts`):

```ts
/**
 * Stable tab id for a tab value — the ONE id policy (mirrors
 * app/src/event-editor/workspace/types.ts). Used when rebuilding a session from
 * a YAML document, where the document deliberately carries no ids.
 */
import {
  claimTabId, collectionTabId, deckTabId, executionTabId, labEntityTabId,
  projectTabId, recordCreateTabId, recordEditTabId, runTabId,
  type WorkspaceTab,
} from '../../event-editor/workspace/types'

export function stableTabId(tab: WorkspaceTab): string {
  switch (tab.kind) {
    case 'project': case 'project-details': return projectTabId(tab.studyId)
    case 'run': return runTabId(tab.runId)
    case 'execution': return executionTabId(tab.eventGraphId)
    case 'deck': return deckTabId(tab.eventGraphId)
    case 'claim': return claimTabId(tab.claimId)
    case 'lab-entity': return labEntityTabId(tab.recordId)
    case 'record-edit': return recordEditTabId(tab.recordId)
    case 'record-create': return recordCreateTabId(tab.nodeType, tab.nodeType === 'run' ? tab.experimentId : tab.studyId)
    case 'collection': return collectionTabId(tab.collection)
    case 'pdf': case 'document': return `${tab.kind}:${tab.artifactId}`
    case 'splash': return `splash:${Date.now()}`
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? 'unknown'
    }
  }
}
```

**Check before writing** (the union may have fields the above guess doesn't match — read `app/src/event-editor/workspace/types.ts:1-115` and adjust the switch so every case type-checks; the compiler is the spec here, not this snippet).

**Test — file `app/src/shared/session/sessionYaml.test.ts` (new):**

```ts
import { describe, expect, it } from 'vitest'
import { sessionDocumentToState, sessionFromYaml, sessionToYaml } from './sessionYaml'
import { stableTabId } from './tabId'
import type { OpenTabsState } from '../shell/OpenTabsContext'

const state: OpenTabsState = {
  tabs: [
    {
      tab: { id: 'project:STU-1', kind: 'project', studyId: 'STU-1', title: 'DHVC' },
      activeRightPaneMode: 'ai', breadcrumb: [], contentHistory: [], contentCursor: 0,
    },
    {
      tab: { id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'Titration' },
      activeRightPaneMode: 'protocol', breadcrumb: [], contentHistory: [], contentCursor: 0,
    },
  ],
  activeTabId: 'run:RUN-1',
  history: ['run:RUN-1'],
  historyCursor: 0,
}

describe('session document', () => {
  it('round-trips the session through YAML (ids are re-derived, not stored)', () => {
    const yaml = sessionToYaml(state)
    expect(yaml).not.toContain('project:STU-1')   // no ids in the document
    const doc = sessionFromYaml(yaml)
    const back = sessionDocumentToState(doc, stableTabId)
    expect(back.tabs.map((t) => t.tab.id)).toEqual(['project:STU-1', 'run:RUN-1'])
    expect(back.tabs[1]!.activeRightPaneMode).toBe('protocol')
    expect(back.activeTabId).toBe('run:RUN-1')
  })

  it('rejects a document that is not version 1', () => {
    expect(() => sessionFromYaml('version: 2\ntabs: []')).toThrow(/version/)
  })

  it('rejects a tab without a kind', () => {
    expect(() => sessionFromYaml('version: 1\ntabs:\n  - runId: RUN-1')).toThrow(/kind/)
  })

  it('falls back to the last tab when activeTabId is unknown', () => {
    const doc = sessionFromYaml('version: 1\nactiveTabId: run:NOPE\ntabs:\n  - kind: run\n    runId: RUN-1\n    title: T')
    expect(sessionDocumentToState(doc, stableTabId).activeTabId).toBe('run:RUN-1')
  })
})
```

The `yaml` package is already a dependency (used by `server/src/workspace/types.ts` parsing and the client elsewhere) — confirm with `grep -n '"yaml"' app/package.json` before adding anything.

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/shared/session/sessionYaml.test.ts 2>&1 | tail -6
```

Expected: `Tests 4 passed`.

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add app/src/shared/session/sessionYaml.ts app/src/shared/session/tabId.ts app/src/shared/session/sessionYaml.test.ts
git commit -m "feat(session): the session document — one YAML string that rebuilds a workspace"
```

### Task 8 — Session document schema (Ajv is the validation authority)

**File:** create `schema/workflow/lab-session.schema.yaml`

```yaml
$schema: 'https://json-schema.org/draft/2020-12/schema'
$id: 'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml'
title: 'Lab Session'
description: >-
  A transient, per-user UI workspace session: the open workspace tabs, which one
  is active, and each tab's right-pane mode. Stored under var/sessions/{userId}/
  (outside the records git tree, like var/ai-threads) — it is UI state, NOT a
  record kind and NOT the per-study records/studies/<id>/workspace.yaml sidecar.
  Validated by Ajv at the API boundary (rule #3). Tab ids are deliberately NOT
  part of the document: they are derived from the tab's stable id helpers.
type: object
additionalProperties: false
required: [version, tabs]
properties:
  version:
    const: 1
  activeTabId:
    type: [string, 'null']
  updatedAt:
    type: string
  tabs:
    type: array
    items:
      type: object
      additionalProperties: true
      required: [kind]
      properties:
        kind:
          type: string
          enum: [project, project-details, run, execution, deck, claim, lab-entity,
                 record-edit, record-create, pdf, document, collection, splash]
        title:
          type: string
        activeRightPaneMode:
          type: string
          enum: [ai, search, find, details, protocol]
```

Note in the file's commit message why there is no lint/ui companion: `*.lint.yaml` and `*.ui.yaml` describe how to lint/host a **record**; a session is transported state validated structurally at the API boundary, exactly like the `agent-action` transport schema (`schema/workflow/agent-action.schema.yaml`). If a reviewer disagrees, the correct fix is a lint spec, not TS.

Verify it is discoverable by the schema loader (that is how the rest of the repo proves new schema files are wired):

```bash
cd /mnt/vast/home/brad/git/computable-lab/server && npx vitest run src/schema/SchemaRegistry.test.ts 2>&1 | tail -4
```

Expected: passes (no new hardcoded schema-id list is required because the registry walks `schema/`). If the registry asserts an exact file count, update that expectation in the test with the new file added — do not special-case the runtime.

Commit:

```bash
git add schema/workflow/lab-session.schema.yaml
git commit -m "feat(schema): lab-session transport schema (Ajv-validated UI session state)"
```

### Task 9 — `SessionStore` on the server (copy the AiThreadStore pattern)

**File:** create `server/src/session/SessionStore.ts`

```ts
/**
 * SessionStore — the persisted workspace session (tmux-style attach).
 *
 * One YAML file per user: `var/sessions/{userId}/main.yaml`. Transient UI state,
 * outside the records git tree (same class of thing as var/ai-threads/*).
 * Writes are tmp-then-rename so a crash cannot leave a truncated session.
 *
 * Conflict policy: last writer wins, but the stored `updatedAt` is returned to
 * the client so a device attaching later can decide to adopt the server's copy.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface StoredSession {
  version: 1;
  userId: string;
  tabs: unknown[];
  activeTabId: string | null;
  updatedAt: string;
}

const EMPTY = (userId: string): StoredSession => ({
  version: 1,
  userId,
  tabs: [],
  activeTabId: null,
  updatedAt: new Date(0).toISOString(),
});

/** Refuse traversal in ids — the userId comes from a request header. */
function sanitizeSegment(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`invalid session path segment: ${value}`);
  }
  return value;
}

export class SessionStore {
  private readonly rootDir: string;

  constructor(workspaceRoot: string) {
    this.rootDir = resolve(workspaceRoot, 'var', 'sessions');
  }

  private filePath(userId: string): string {
    return join(this.rootDir, sanitizeSegment(userId), 'main.yaml');
  }

  /** Read a user's session; an absent file yields the empty session. */
  async get(userId: string): Promise<StoredSession> {
    try {
      const raw = await readFile(this.filePath(userId), 'utf8');
      const parsed = parseYaml(raw) as Partial<StoredSession> | null;
      if (!parsed || typeof parsed !== 'object') return EMPTY(userId);
      return {
        version: 1,
        userId,
        tabs: Array.isArray(parsed.tabs) ? parsed.tabs : [],
        activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY(userId);
      throw err;
    }
  }

  /** Whole-session upsert (last writer wins). */
  async put(userId: string, tabs: unknown[], activeTabId: string | null): Promise<StoredSession> {
    const next: StoredSession = {
      version: 1,
      userId,
      tabs,
      activeTabId,
      updatedAt: new Date().toISOString(),
    };
    const path = this.filePath(userId);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomUUID()}.tmp`;
    await writeFile(tmp, stringifyYaml(next), 'utf8');
    await rename(tmp, path);
    return next;
  }
}
```

**File:** create `server/src/session/index.ts`

```ts
export { SessionStore, type StoredSession } from './SessionStore.js';
```

**Test — file `server/src/session/SessionStore.test.ts` (new):**

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from './SessionStore.js';

describe('SessionStore', () => {
  it('returns an empty session when nothing is stored', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    const s = await new SessionStore(root).get('default');
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  it('round-trips a session per user', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    const store = new SessionStore(root);
    await store.put('USR-BRAD', [{ kind: 'run', runId: 'RUN-1', title: 'T' }], 'run:RUN-1');
    const back = await store.get('USR-BRAD');
    expect(back.tabs).toHaveLength(1);
    expect(back.activeTabId).toBe('run:RUN-1');
    // another user sees their own (empty) session
    expect((await store.get('USR-OTHER')).tabs).toEqual([]);
  });

  it('refuses traversal in the user id', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    await expect(new SessionStore(root).get('../etc')).rejects.toThrow(/invalid/);
  });

  it('stamps updatedAt so an attaching device can compare clocks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sessions-'));
    const store = new SessionStore(root);
    const first = await store.put('default', [], null);
    const second = await store.put('default', [{ kind: 'claim', claimId: 'CLM-1', title: 'c' }], null);
    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));
  });
});
```

```bash
cd /mnt/vast/home/brad/git/computable-lab/server && npx vitest run src/session/SessionStore.test.ts 2>&1 | tail -6
```

Expected RED before the implementation, `Tests 4 passed` after.

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add server/src/session/SessionStore.ts server/src/session/index.ts server/src/session/SessionStore.test.ts
git commit -m "feat(session): per-user workspace session store under var/sessions (tmp+rename)"
```

### Task 10 — `GET/PUT /api/session` (+ `/api/session/:userId` for lab-wide attach)

**File:** create `server/src/api/routes/session.ts`

```ts
/**
 * Session routes — the persistent, cross-device workspace session.
 *
 *   GET  /api/session            → { session } for the requesting user
 *   PUT  /api/session            → upsert { tabs, activeTabId }
 *   GET  /api/session/:userId    → { session } for an explicit user (read-only
 *                                  attach: "show me what Brad has open")
 *
 * `userId` resolution mirrors AiThreadHandlers: the `x-user-id` header, falling
 * back to `default` so a single-user appliance works without auth. The document
 * is validated with Ajv against schema/workflow/lab-session.schema.yaml — the
 * handler owns NO validation logic of its own (rule #3).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../../server.js';
import { SessionStore } from '../../session/index.js';
import { AjvValidator } from '../../validation/AjvValidator.js';

const LAB_SESSION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';

function resolveUserId(request: FastifyRequest): string {
  const header = request.headers['x-user-id'];
  return typeof header === 'string' && header.length > 0 ? header : 'default';
}

interface PutBody {
  tabs?: unknown[];
  activeTabId?: string | null;
}

export function registerSessionRoutes(fastify: FastifyInstance, ctx: AppContext) {
  const store = new SessionStore(ctx.workspaceRoot);
  const validator = new AjvValidator(ctx.schemaDir);

  fastify.get('/session', async (request) => ({
    session: await store.get(resolveUserId(request)),
  }));

  fastify.get<{ Params: { userId: string } }>('/session/:userId', async (request, reply) => {
    const session = await store.get(request.params.userId);
    return reply.send({ session });
  });

  fastify.put<{ Body: PutBody }>('/session', async (request: FastifyRequest<{ Body: PutBody }>, reply: FastifyReply) => {
    const body = request.body ?? {};
    if (!Array.isArray(body.tabs)) {
      return reply.status(400).send({ error: 'INVALID_SESSION', message: 'body.tabs must be an array' });
    }
    // Validate the DOCUMENT (not the storage row) with Ajv before persisting.
    const validation = validator.validate(LAB_SESSION_SCHEMA_ID, {
      version: 1,
      tabs: body.tabs,
      activeTabId: body.activeTabId ?? null,
    });
    if (!validation.valid) {
      return reply.status(400).send({ error: 'INVALID_SESSION', message: validation.errors });
    }
    const userId = resolveUserId(request);
    const session = await store.put(userId, body.tabs, body.activeTabId ?? null);
    return reply.send({ session });
  });
}
```

**Check the two call shapes against reality before you write this** (they are the only guesses in this task): `new AjvValidator(schemaDir)` and `validator.validate(schemaId, doc)` — read `server/src/validation/AjvValidator.ts` and `server/src/api/handlers/ValidationHandlers.ts` and copy whatever the existing call sites do. A wrong shape here is a TypeScript error, not a silent bug, so let `npm run typecheck -w server` decide.

**Register it in `server/src/server.ts`** — immediately after the existing surfaces block (~line 1413):

```ts
    // Session Routes (persistent, cross-device workspace session)
    {
      const { registerSessionRoutes } = await import('./api/routes/session.js');
      registerSessionRoutes(instance, ctx);
    }
```

**Test — file `server/src/api/routes/session.test.ts` (new):**

```ts
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerSessionRoutes } from './session.js';
import type { AppContext } from '../../server.js';

const SCHEMA_DIR = join(__dirname, '../../../../schema');

async function makeApp() {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'session-api-'));
  const app = Fastify();
  registerSessionRoutes(app, { workspaceRoot, schemaDir: SCHEMA_DIR } as unknown as AppContext);
  return app;
}

describe('GET/PUT /api/session', () => {
  it('is empty for a fresh user and round-trips a PUT', async () => {
    const app = await makeApp();
    const empty = await app.inject({ method: 'GET', url: '/session', headers: { 'x-user-id': 'USR-BRAD' } });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().session.tabs).toEqual([]);

    const put = await app.inject({
      method: 'PUT', url: '/session', headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'run', runId: 'RUN-1', title: 'T' }], activeTabId: 'run:RUN-1' },
    });
    expect(put.statusCode).toBe(200);

    const back = await app.inject({ method: 'GET', url: '/session', headers: { 'x-user-id': 'USR-BRAD' } });
    expect(back.json().session.activeTabId).toBe('run:RUN-1');
  });

  it('rejects a tab kind that is not in the schema enum', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT', url: '/session', headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'not-a-kind' }], activeTabId: null },
    });
    expect(res.statusCode).toBe(400);
  });

  it('lets a second device read another user session read-only', async () => {
    const app = await makeApp();
    await app.inject({
      method: 'PUT', url: '/session', headers: { 'x-user-id': 'USR-BRAD' },
      payload: { tabs: [{ kind: 'claim', claimId: 'CLM-1', title: 'c' }], activeTabId: null },
    });
    const res = await app.inject({ method: 'GET', url: '/session/USR-BRAD' });
    expect(res.json().session.tabs).toHaveLength(1);
  });
});
```

```bash
cd /mnt/vast/home/brad/git/computable-lab/server && npx vitest run src/api/routes/session.test.ts 2>&1 | tail -6
```

Expected RED → then `Tests 3 passed`.

```bash
cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck -w server 2>&1 | tail -5
```

Expected: exit 0.

**Restart the backend to load the new route** (main backend PID; never a blanket pkill):

```bash
ss -tlnp | grep ':3001'          # note the PID
kill <pid>                        # then from the repo root: ./start-app.sh
curl -s http://localhost:3001/api/session | head -c 200; echo
```

Expected: `{"session":{"version":1,"userId":"default","tabs":[],"activeTabId":null,"updatedAt":"1970-01-01T00:00:00.000Z"}}`

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add server/src/api/routes/session.ts server/src/api/routes/session.test.ts server/src/server.ts
git commit -m "feat(session): GET/PUT /api/session — Ajv-validated, per-user, file-backed"
```

### Task 11 — Attach the client to the server session (tmux: same tabs on every device)

**File:** `app/src/shared/api/client.ts` — add next to `getSurfaces()` (~line 2076):

```ts
  /** The persisted workspace session for the requesting user. */
  async getSession(): Promise<{ session: SessionPayload }> {
    return this.request<{ session: SessionPayload }>('/session')
  }

  /** Upsert the workspace session (last writer wins). */
  async putSession(session: { tabs: unknown[]; activeTabId: string | null }): Promise<{ session: SessionPayload }> {
    return this.request<{ session: SessionPayload }>('/session', { method: 'PUT', body: session })
  }
```

Add the type next to the other client types (top of `client.ts`, or `app/src/shared/api/types.ts` if that is where siblings live — check first):

```ts
export interface SessionPayload {
  version: 1
  userId: string
  tabs: unknown[]
  activeTabId: string | null
  updatedAt: string
}
```

**File:** `app/src/shared/session/useSessionSync.ts` (new)

```ts
/**
 * useSessionSync — attach the local tab store to the persisted server session.
 *
 * tmux semantics, last-writer-wins:
 *  - BOOT: read localStorage (synchronous, first paint) + GET /api/session.
 *    Adopt whichever has the newer `updatedAt`; when only the server has a
 *    session (first load on a new device) adopt it.
 *  - PUSH: debounce 500ms after any local change → PUT /api/session.
 *  - ATTACH: on window focus / visibilitychange, GET and adopt if the server
 *    moved ahead of the last local write. That is "same open session on my
 *    other device" without live streaming.
 *
 * The AI-emittable session document has a second entry point (`applySessionYaml`)
 * — both funnel into OpenTabsContext.replaceState, so there is ONE writer.
 */
import { useCallback, useEffect, useRef } from 'react'
import { apiClient } from '../api/client'
import { parse as parseYaml } from 'yaml'
import { useOpenTabs } from '../shell/OpenTabsContext'
import type { OpenTabsState } from '../shell/OpenTabsContext'
import { sessionDocumentToState, sessionFromYaml, sessionToYaml } from './sessionYaml'
import { stableTabId } from './tabId'

const PUSH_DEBOUNCE_MS = 500
const LAST_PUSH_KEY = 'cl-open-tabs:lastPushedAt'

/** Apply an AI-emitted (or shared) session document to the live store. */
export function useApplySessionDocument() {
  const { replaceState } = useOpenTabs()
  return useCallback((yaml: string) => {
    const doc = sessionFromYaml(yaml)
    replaceState(sessionDocumentToState(doc, stableTabId))
    return doc
  }, [replaceState])
}

export function useSessionSync(): void {
  const { state, replaceState } = useOpenTabs()
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyingRemote = useRef(false)

  const adopt = useCallback((incoming: string, updatedAt: string) => {
    applyingRemote.current = true
    const doc = sessionFromYaml(incoming)
    replaceState(sessionDocumentToState(doc, stableTabId))
    localStorage.setItem(LAST_PUSH_KEY, updatedAt)
    applyingRemote.current = false
  }, [replaceState])

  // BOOT + ATTACH
  useEffect(() => {
    let cancelled = false
    const pull = async (boot: boolean) => {
      try {
        const { session } = await apiClient.getSession()
        if (cancelled) return
        const lastPush = localStorage.getItem(LAST_PUSH_KEY)
        const serverAhead = !lastPush || Date.parse(session.updatedAt) > Date.parse(lastPush)
        const localEmpty = state.tabs.length === 0
        if (session.tabs.length > 0 && (boot ? serverAhead || localEmpty : serverAhead)) {
          adopt(sessionToYaml(sessionDocumentToState(sessionFromYaml(
            // Server rows are plain tab objects; the document wraps them.
            `version: 1\nactiveTabId: ${session.activeTabId ? JSON.stringify(session.activeTabId) : 'null'}\ntabs: ${JSON.stringify(session.tabs)}`,
          ), stableTabId)), session.updatedAt)
        }
      } catch {
        // Offline / backend down: localStorage already served first paint.
      }
    }
    void pull(true)
    const onFocus = () => { void pull(false) }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
    // Deliberately not depending on `state` — this effect is the attach lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adopt])

  // PUSH (debounced)
  useEffect(() => {
    if (applyingRemote.current) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      const doc = sessionFromYaml(sessionToYaml(state))
      void apiClient.putSession({ tabs: doc.tabs, activeTabId: doc.activeTabId ?? null })
        .then(({ session }) => localStorage.setItem(LAST_PUSH_KEY, session.updatedAt))
        .catch(() => { /* offline: localStorage still holds the session */ })
    }, PUSH_DEBOUNCE_MS)
    return () => { if (pushTimer.current) clearTimeout(pushTimer.current) }
  }, [state])
}
```

**Simplify if the adopt path reads badly** — `sessionToYaml(stateDocumentToState(...))` is only being used as a normalizer. A cleaner equivalent (prefer this if it type-checks): add an exported helper in `sessionYaml.ts`,

```ts
/** Adopt a tab list straight from the server row (no YAML hop). */
export function sessionTabsToState(tabs: unknown[], activeTabId: string | null): OpenTabsState {
  return sessionDocumentToState({ version: 1, activeTabId, tabs: tabs as never }, stableTabId)
}
```

and have `useSessionSync` call `replaceState(sessionTabsToState(session.tabs, session.activeTabId))`. Do NOT keep both paths in the final code (DRY).

**File:** `app/src/App.tsx` — mount the sync inside the provider, next to `MentionNavigator`:

```tsx
import { useSessionSync } from './shared/session/useSessionSync'
...
/** Attaches the tab store to the persisted server session (tmux-style). */
function SessionSync(): null {
  useSessionSync()
  return null
}
```
and inside `<BrowserRouter>` add `<SessionSync />` right after `<MentionNavigator />`.

**Test — file `app/src/shared/session/useSessionSync.test.ts` (new):** Stub `apiClient` with `vi.mock('../api/client', ...)`; assert (a) boot adopts a server session that has tabs while localStorage is empty, (b) a local `openTab` results in exactly one PUT after ~600ms (`vi.useFakeTimers`), (c) a focus pull whose `updatedAt` is newer than the last push replaces the state, and an older one does not.

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/shared/session/useSessionSync.test.ts 2>&1 | tail -6
```

Expected: `Tests 3 passed`.

```bash
cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck -w app 2>&1 | tail -5
```

Expected: exit 0.

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add app/src/shared/api/client.ts app/src/shared/session/useSessionSync.ts app/src/shared/session/useSessionSync.test.ts app/src/shared/session/sessionYaml.ts app/src/App.tsx
git commit -m "feat(session): client attaches to the persisted session (boot adopt, debounced push, focus pull)"
```

### Task 12 — Cross-device e2e: two browser contexts, one session

**File:** append to `app/e2e/session-persistence.spec.ts`

```ts
test('a second device (fresh context, no localStorage) attaches to the same session', async ({ browser }) => {
  const deviceA = await browser.newContext()
  const pageA = await deviceA.newPage()
  await pageA.goto('/')
  // Open two entities through the UI (real user actions, no seeding).
  await pageA.goto('/runs/RUN-A')
  await pageA.goto('/runs/RUN-B')
  await expect(pageA.locator('.workspace-tab')).toHaveCount(2, { timeout: 15_000 })
  await pageA.waitForTimeout(1_000) // let the debounced PUT land

  // Device B: same server, empty localStorage.
  const deviceB = await browser.newContext()
  const pageB = await deviceB.newPage()
  await pageB.goto('/')
  await expect(pageB.locator('.workspace-tab')).toHaveCount(2, { timeout: 15_000 })
  await expect(pageB).toHaveURL(/\/runs\/RUN-B$/, { timeout: 15_000 })

  await deviceA.close()
  await deviceB.close()
})
```

Run and fix forward:

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/session-persistence.spec.ts --project=chromium 2>&1 | tail -10
```

Expected: `3 passed`.

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add app/e2e/session-persistence.spec.ts
git commit -m "test(e2e): a second device attaches to the same workspace session"
```

### Task 13 — Close the loop on deterministic navigation (the AI-emitted document)

**File:** create `app/src/shared/session/applySessionDocument.test.ts` — assert the whole chain end to end in one unit test, no browser:

```ts
import { describe, expect, it } from 'vitest'
import { sessionDocumentToState, sessionFromYaml } from './sessionYaml'
import { stableTabId } from './tabId'
import { tabPath } from '../shell/WorkspaceTabStrip'

const DOC = `
version: 1
activeTabId: run:RUN-1
tabs:
  - kind: project
    studyId: STU-1
    title: DHVC
  - kind: run
    runId: RUN-1
    title: Titration
    activeRightPaneMode: protocol
`

describe('an AI-emitted session document becomes routes', () => {
  it('resolves every tab to a route and the active tab to the resumed URL', () => {
    const state = sessionDocumentToState(sessionFromYaml(DOC), stableTabId)
    expect(state.tabs.map((t) => tabPath(t.tab))).toEqual(['/project/STU-1', '/runs/RUN-1'])
    const active = state.tabs.find((t) => t.tab.id === state.activeTabId)!
    expect(tabPath(active.tab)).toBe('/runs/RUN-1')
    expect(active.activeRightPaneMode).toBe('protocol')
  })
})
```

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/shared/session/applySessionDocument.test.ts 2>&1 | tail -6
```

Expected: `Tests 1 passed`.

Then add the AI-facing route helper (the "open this surface" half) — **file** `app/src/shared/session/openSurface.ts`:

```ts
/**
 * openSurface — the AI's "go there" primitive: a surface context in, a live tab
 * out. Uses the registry (surfaceRoute) for the URL and the existing tab store
 * for the tab. No route table of its own.
 */
import type { OpenTabsContextValue } from '../shell/OpenTabsContext'
import type { SurfaceSpec } from '../surfaces'
import { surfaceRoute, type SurfaceTarget } from '../surfaces/surfaceRoute'
import { openContent } from '../lib/openContent'
import type { WorkspaceTab } from '../../event-editor/workspace/types'
import { runTabId, projectTabId } from '../../event-editor/workspace/types'

/** Map a resolved surface target to the tab record the store expects. */
export function tabForSurface(target: SurfaceTarget & { title?: string }): WorkspaceTab | null {
  const title = target.title ?? target.active.objectId
  switch (target.active.objectType) {
    case 'run':
      return { id: runTabId(target.active.objectId), kind: 'run', runId: target.active.objectId, title }
    case 'project':
      return { id: projectTabId(target.active.objectId), kind: 'project', studyId: target.active.objectId, title }
    default:
      return null
  }
}

/** Open `target` in the active tab. Returns the route used, or null if it is
 *  not deep-linkable from this context. */
export function openSurface(
  openTabs: OpenTabsContextValue | null,
  navigate: (path: string) => void,
  registry: SurfaceSpec[],
  target: SurfaceTarget & { title?: string },
): string | null {
  const route = surfaceRoute(target, registry)
  const tab = tabForSurface(target)
  if (!route || !tab) return null
  openContent(openTabs, navigate, tab, route)
  return route
}
```

Test it with a tiny stub registry + a spy `navigate` (`Tests 2 passed`), then:

```bash
cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck -w app 2>&1 | tail -5
```

Commit:

```bash
cd /mnt/vast/home/brad/git/computable-lab
git add app/src/shared/session/openSurface.ts app/src/shared/session/openSurface.test.ts app/src/shared/session/applySessionDocument.test.ts
git commit -m "feat(session): session document → routes, and openSurface (registry-driven AI navigation)"
```

---

## Tests / validation

Gate order after every task (cheap → expensive):

1. Targeted unit test for the touched unit: `cd app && npx vitest run <file>` (client) / `cd server && npx vitest run <file>` (server). Expected: `Tests N passed`, 0 failed.
2. `npm run typecheck -w app` and `npm run typecheck -w server` from the repo root. Expected: exit 0.
3. The e2e gate: `cd app && npx playwright test e2e/session-persistence.spec.ts --project=chromium`. **Always pass `--project=chromium`** — a bare Playwright run fails on this host because firefox is not installed.
4. Live browser drive on `http://localhost:5174` per SOP (Task 4) and report the observed URL + tab count + storage contents.

Do NOT use `npm run test:unit -w app` as a gate: the baseline is dirty (~50 files fail to collect, mostly a missing `virtual:cla-ai-overlay` module and Playwright specs being collected by vitest). Pre-existing failures unrelated to this work: `recentStore`, `RightPane` localStorage-on-node, and the sibling uncommitted `graph/` surface.

Definition of done:
- [ ] Task 1's two e2e tests pass on a fresh page load (`/` → restored active tab route, 3 tabs intact).
- [ ] Task 12's cross-device test passes (second context attaches with no localStorage).
- [ ] `GET /api/session` returns the live session and `PUT` round-trips it (`curl` evidence in the PR/commit body).
- [ ] An AI-emitted session YAML string produces the same workspace, proven by `src/shared/session/applySessionDocument.test.ts`.
- [ ] Both typechecks exit 0.

---

## Risks, tradeoffs, and open questions

**Risks**

1. **StrictMode double-effect is load-bearing in the bug, so the fix must not depend on effect order.** The Task 2 shape (sync `useReducer` initializer + `hydratedRef` persist gate) is deliberately order-independent. The hydration unit test exists specifically so a future refactor back to `useEffect` loading fails loudly.
2. **`useSessionSync`'s push effect writes to the server on EVERY state change, including adopted remote state.** The `applyingRemote` ref suppresses the immediate echo; if a ping-pong shows up (two devices flapping), the fix is to compare `JSON.stringify(doc.tabs)` against the last-pushed payload before PUTting — add that only if the e2e is flaky. Do not add optimistic locking (the repo's workspace-sidecar precedent is explicitly last-writer-wins).
3. **Per-user localStorage keys are a one-time migration.** After Task 2, an existing `cl-open-tabs` (no `:userId` suffix) is no longer read. Acceptable (the session was being wiped on every load anyway) but call it out in the commit body. Do NOT write migration code.
4. **`ctx.workspaceRoot` is the embedded-git worktree** (`/home/brad/.computable-lab/worktrees/main` in the running appliance), not the code repo. `var/sessions/` therefore lands beside the user's data, which is correct — but expect it to be git-ignored there; confirm with `git -C <workspaceRoot> status` and add `var/` to `.gitignore` in the DATA repo if it is not (ask Brad before touching the data repo).
5. **`server/src/surfaces/surfaces.ts` currently hardcodes the surface id allow-list.** Removing it moves membership to Ajv + the registry file. If some other module relies on the loader throwing for unknown ids, that becomes an Ajv error instead — the message changes, the behavior does not. The existing `surfacesAjv.test.ts` is the gate.
6. **`tabPath()` already returns `/lab/${recordId}` for lab entities**, which is NOT an App route (`/lab/:category/:entityId` is). Out of scope here, but if lab tabs are in a restored session their route will 404. Open question 3.

**Tradeoffs**

- Persisting the session server-side makes the tab set SHARED per user across devices — which is the point — but it also means a phone opening the app will adopt the laptop's two-run workspace. If Brad wants per-device sessions with an explicit "attach" gesture, the fix is one more path segment (`/api/session/:deviceId`) on the same store; the store already takes an arbitrary id (Task 9). Ask before building it.
- localStorage stays as the first-paint cache. It is redundant with the server but it is what makes a cold/offline load instant and correct; removing it would force every boot to block on a network round-trip.

**Open questions (do not block Tasks 1-13)**

1. Should the tab strip show a small "attached / synced at HH:MM" chip so cross-device attach is visible? (Product call; the `SurfaceIndicator` in `app/src/shared/shell/SurfaceIndicator.tsx` is the natural neighbour.)
2. Live multi-attach streaming (SSE or a `BroadcastChannel` + a server-sent version counter) — worth it only if two devices editing simultaneously turns out to be real usage.
3. The `knowledge` surface declares `path: "/knowledge"` but `app/src/App.tsx` has no `/knowledge` route (it has `/claims`, `/record/:recordId`, `/literature`). Either add the route or drop `path` from that entry — decide with Brad, since it changes navigation semantics.
4. Should a session survive the user switching identity in the same browser? Today `CurrentUserProvider` reloads the page on switch, and the per-user storage key means each identity gets their own session. Probably right; confirm.

---

## Implementation status — EXECUTED 2026-09-19 (all tasks landed)

Commits (oldest first):

| Commit | What |
|---|---|
| `bbd94351` | the e2e gate itself (RED before the fix: 2 failed) |
| `b435ac90` | sync hydration + persist gate + per-user storage keys (+ jsdom localStorage shim) |
| `60a0742f` | surfaces: real route patterns + declarative `params`; Ajv membership; `surfaceRoute()` |
| `4f76d08f` | `GET/PUT /api/session` + `WorkspaceSessionStore` + `lab-session.schema.yaml` |
| `acb128b0` | session document + `useSessionSync` attach + `openSurface` |
| `c81be164`, `9d2a8521` | e2e hygiene (serial mode, clean session slate) |

### Verification (real output, not adjectives)

```
app/e2e/session-persistence.spec.ts --project=chromium     → 3 passed
app vitest src/shared/{shell,session,surfaces}             → 15 files / 78 tests passed
server vitest src/{surfaces,workspace-session,schema}      → all green except the stale
                                                             surfacesAjv.test.ts (below)
npm run typecheck -w server                                → exit 0
npm run typecheck -w app                                   → 46 pre-existing errors, NONE in
                                                             the files this plan touched
```

Live drive on :5174 (browser, after the fix):

```
1) fresh load at "/"   → url /runs/RUN-2026-09-19-run-ez6g (the active tab), 3 tabs, storage intact
2) reload             → url unchanged, 3 tabs, storage 3
3) fresh device       → adopts the server session (3 tabs) and lands on the same active route
```
`GET /api/session` round-trips; an unknown tab kind returns 400 (Ajv).

### Deviations from the plan (and why)

1. **Routes come from `tabPath`, not from the registry.** The session document stores
   tabs (kind + ids); the URL is derived by the existing exhaustive `tabPath()`.
   `surfaceRoute()` (registry → URL) is used for AI/"open-surface" targets instead.
   One route table, not two (DRY).
2. **`params` is the deep-linkability flag**, and the registry `id` vocabulary is an
   Ajv `enum` — this contradicts the untracked `server/src/surfaces/surfacesAjv.test.ts`,
   which encodes an older 8-surface design (`event-editor`, `materials`,
   `formulations`, `ingestion`, …) and an "arbitrary 9th surface" requirement that
   cannot coexist with the closed `SurfaceId` union. That file was already RED before
   this work (5 failures) and still is (5 failures); none of them are about the
   session/tab work. Decide: widen `SurfaceId` to `string`, or delete that spec.
3. **Tests run serially** (`test.describe.configure({ mode: 'serial' })`) because the
   session is per-user server state; parallel tests adopted each other's session.
4. **`useSessionSync` takes an `onAdopt` callback** rather than calling
   `useNavigate()` itself, so the hook stays router-free and unit-testable; `App.tsx`
   wires the navigation.
5. **A test-env fix was necessary and is included**: jsdom under Node 26 leaves
   `window.localStorage` undefined, which silently broke every storage-backed unit
   test. `app/vitest.config.ts` now sets a jsdom url and `app/src/test/setup.ts`
   installs an in-memory `Storage` when the environment provides none.

### Known follow-ups (not done here)

- `openSurface()` is implemented + tested but not yet wired to the AI action channel
  (`agent-action.schema.yaml` `open-surface`). Next slice.
- Multi-tab **detach** (per-device sessions with an explicit attach gesture): the
  store already takes an arbitrary id, so this is 1 path segment + a device id.
- Backend was restarted manually (tsx `--watch` had not picked up `server.ts`); the
  new backend is a Hermes background process, and `.run/backend.pid` still holds the
  old PID. `./start-app.sh` cleans that up on its next run.
