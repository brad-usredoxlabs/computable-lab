# Browser-Like Tabs: In-Place Navigation + Per-Tab History

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task (fresh subagent per task, two-stage review).

**Goal:** Make workspace tabs behave like a browser. `+` (and a context-menu "Open link in new tab") are the ONLY ways to create a new tab; clicking any link/entity from within a tab navigates THAT tab in place and never switches to a different tab; each tab keeps its own independent Back/Forward history. Fixes: "new tab → click protocol → reverts to previous tab."

**Architecture:** Today `openTab({ id: projectTabId(studyId), ... }, true)` is called on every entity pick. Because entity tab ids are **stable + deduped** (`project:STU-1` …), the reducer re-activates the *existing* tab for that entity when one is already open — yanking you back to the old tab. The fix separates **tab slot** from **content**: a tab is a stable slot whose content (entity/route) is replaced by in-tab navigation; a new slot is minted only on `+` or explicit "open in new tab". Back/Forward live on each slot (its own content stack), not a global across-tab stack.

**Tech Stack:** React 18, react-router 6, TypeScript, existing `OpenTabsContext` reducer + `WorkspaceTab` union.

---

## Current Context (verified 2026-08-05)

- **Root cause of the bug:** `OpenTabsContext.tsx` `openTabsReducer` `case 'open'` (lines 91–127): when `action.tab.id` already exists in `state.tabs`, it maps in place and `return { ...state, tabs: nextTabs, activeTabId: action.tab.id }` — **re-activating that existing tab** (lines 111–117). So `openTab({ id: projectTabId(studyId), ... }, true)` from a NEW splash tab re-activates the already-open project tab → "sends me back."
- **Entity ids are stable + deduped:** `workspace/types.ts:151-179` — `projectTabId(studyId) => 'project:STU-1'`, `runTabId => 'run:RUN-1'`, `claimTabId`, `labEntityTabId`, `collectionTabId`; `splashTabId()` is the only timestamped id.
- **Surfaces that call `openTab(entityId, true)` on click** (all should become in-place nav, with a new-tab escape hatch):
  - `app/src/shared/shell/SplashPage.tsx` — `openRecent` (40-48), `openEntity` (31-34), new-run (54-57), collections (93-98)
  - `app/src/shared/shell/SplashSearch.tsx` — `openResult` (92-114), incl. protocol→project routing (93-101)
  - `app/src/collections/LabCollectionView.tsx` — protocol card + lab card (348-368)
  - `app/src/collections/RunCollectionView.tsx` (118, 282)
  - `app/src/collections/ProjectCollectionView.tsx` (167)
  - `app/src/shared/shell/GlobalSearchBar.tsx` (93-96)
  - `app/src/shared/shell/CreateMenu.tsx` (57)
  - `app/src/shared/lib/protocolRouting.ts` — `resolveProtocolPick` returns a route; callers convert to `openTab(projectTabId(...))`
  - `app/src/event-editor/right-pane/find/FindTabPanel.tsx` — `openRecordTab` (194-197), run/deck/protocol opens (429, 557, 589, 655, 689)
  - `app/src/event-editor/right-pane/search/SearchTabPanel.tsx` (169)
- **Host pages re-open their tab on mount** (correct, but must target the CURRENT slot on in-place nav): `RunWorkspacePage.tsx:71`, `ProjectWorkspacePage.tsx:126`, `DeckHostPage.tsx:89`, `ArtifactHostPage.tsx:61`, `RecordHostPage.tsx:64,75`.
- **History is GLOBAL across tabs today:** `OpenTabsState.history/historyCursor` is one stack shared by all tabs (lines 39-40); `back`/`forward` (180-191) jump to a previously *active tab*. Browser-model wants a **per-tab** stack.
- **Existing `navigate` action already replaces tab content in place** keeping the same slot (test `navigate replaces tab content and appends a crumb`, OpenTabsContext.test.ts:186-201) — the primitive we'll lean on. It currently mutates `tab.id`, so slot persistence needs care (see Phase 1).
- **`tabPath(tab)`** in `WorkspaceTabStrip.tsx:152-189` derives a route from a tab's entity fields (not its id) — good, route follows content.

---

## Proposed Approach (browser model)

Two conceptual changes, in phases:

1. **Tab slot vs content.** Tab id stays stable as a *slot id*; its `tab` (entity + route + title) is the *content* that in-place navigation replaces. Introduce `navigateActiveTab(content: WorkspaceTab, crumb?)` = replace the ACTIVE slot's content and push the previous content onto that slot's own history. Never re-activate another slot on a content click.

2. **Per-tab history.** Move `history`/`historyCursor` from the global tab store into each `OpenTabState` entry (a stack of the slot's own visited contents). Back/Forward in the strip operate on the ACTIVE tab's stack.

Phase 0/1 are the bug fix and are independent of the full per-tab-history rewrite; Phase 2 is the history model; Phase 3 adds the context menu.

---

## Phase 1 — In-place navigation (the bug fix)

Make content clicks navigate the ACTIVE tab instead of `openTab`-ing a deduped entity tab. This is the minimum that stops "click in new tab → sent back to previous tab."

> **Design note (slot vs content):** For Phase 1 we keep `tab.id` as-is BUT stop *reactivating other tabs* on content clicks. A content click calls a new `navigateActiveTab` that replaces the active slot's `tab` (and id) and pushes history, never scanning for an existing entity tab. Host pages keep re-opening the current slot on mount. `+` / explicit new-tab keep minting fresh slots.

### Task 1.1: Add `navigateActiveTab` action + reducer case + context method

**Files:**
- Modify: `app/src/shared/shell/OpenTabsContext.tsx` (+ tests in `OpenTabsContext.test.ts`)
- Modify: `app/src/shared/shell/OpenTabsContext.tsx` action union + `OpenTabsContextValue`

**Step 1 — failing test** (RED):
```ts
it('navigateActiveTab replaces the ACTIVE tab content without touching other tabs', () => {
  const state: OpenTabsState = {
    tabs: [
      { tab: runTab, activeRightPaneMode: 'protocol', breadcrumb: [] },
      { tab: projectTab, activeRightPaneMode: 'ai', breadcrumb: [] },
    ],
    activeTabId: 'run:RUN-1',
    history: ['run:RUN-1'], historyCursor: 0,   // run is active
  }
  const next = openTabsReducer(state, {
    type: 'navigate-active',
    tab: claimTab,                       // click "protocol" while in the run tab
    crumb: { label: 'First Titration', entityType: 'run', id: 'RUN-1', route: '/runs/RUN-1' },
  })
  // The RUN tab (active slot) becomes the claim tab — NOT a new/re-activated clm tab.
  expect(next.activeTabId).toBe('run:RUN-1')           // slot unchanged
  expect(next.tabs.find(t => t.tab.id === 'run:RUN-1')?.tab.id).toBe('claim:CLM-1') // content replaced
  expect(next.tabs).toHaveLength(2)                     // NO new tab created
  // the OTHER (project) tab is untouched
  expect(next.tabs.some(t => t.tab.id === 'project:STU-1')).toBe(true)
})
```

**Step 2 — run test, expect FAIL** (`'navigate-active'` not handled → reducer hits `default`).

**Step 3 — implement** in `openTabsReducer`:
```ts
case 'navigate-active': {
  // Find the ACTIVE slot and replace its content with action.tab,
  // keeping the same slot position. If no active tab, fall back to 'open'.
  const idx = state.tabs.findIndex((t) => t.tab.id === state.activeTabId)
  if (idx < 0) {
    // No active tab — open as a new tab.
    const visit = recordVisit(state, action.tab.id)
    return {
      ...state,
      tabs: [...state.tabs, { tab: action.tab, activeRightPaneMode: defaultRightPaneMode(action.tab), breadcrumb: action.crumb ? [action.crumb] : [] }],
      activeTabId: action.tab.id,
      history: visit.history, historyCursor: visit.historyCursor,
    }
  }
  const { crumb, tab } = action
  const nextTabs = state.tabs.map((entry, i) =>
    i === idx
      ? { ...entry, tab, breadcrumb: crumb ? entry.breadcrumb.concat([crumb]) : entry.breadcrumb }
      : entry,
  )
  return { ...state, tabs: nextTabs }   // activeTabId unchanged — slot persists
}
```
Add `| { type: 'navigate-active'; tab: WorkspaceTab; crumb?: BreadcrumbItem }` to `OpenTabsAction`, and `navigateActiveTab(tab, crumb?)` to `OpenTabsContextValue` + provider (mirrors `navigateTab`, but resolves the active id internally):
```ts
navigateActiveTab: useCallback((tab: WorkspaceTab, crumb?: BreadcrumbItem) => {
  dispatch({ type: 'navigate-active', tab, ...(crumb ? { crumb } : {}) })
}, []),
```

**Step 4 — run test, expect PASS.** Also assert the already-open-tab re-activation is no longer triggered for content clicks (existing dedup `case 'open'` semantics preserved for `+` / explicit open).

**Verification:** `cd app && npx vitest run src/shared/shell/OpenTabsContext.test.ts`

### Task 1.2: Route from a content click needs a reliable "current tab stays put" navigation

**Objective:** Every entity-pick surface stops calling `openTab(entityId, true)` and instead calls `navigateActiveTab(...)` + `navigate(route)`.

**Files (each surface):** `SplashPage.tsx`, `SplashSearch.tsx`, `LabCollectionView.tsx`, `RunCollectionView.tsx`, `ProjectCollectionView.tsx`, `GlobalSearchBar.tsx`, `CreateMenu.tsx`, `FindTabPanel.tsx`, `SearchTabPanel.tsx`.

**Step 1 — failing tests** (per surface, RED or lock-in): e.g. for `SplashSearch.openResult`, assert that clicking a run result calls `navigateActiveTab` (not `openTab`) and keeps the active tab id. Where surfaces share a helper (protocol→project via `resolveProtocolPick`), centralize.

**Step 2 — implement (centralize first, DRY):**
Add a shared helper, e.g. in `app/src/shared/lib/openContent.ts`:
```ts
export function openContent(
  openTabs: OpenTabsContextValue | null,
  navigate: (path: string) => void,
  tab: WorkspaceTab,
  route: string,
  crumb?: BreadcrumbItem,
) {
  openTabs?.navigateActiveTab(tab, crumb)
  navigate(route)
}
```
Replace each surface's `openTabs?.openTab(tab, true, ...); navigate(route)` with `openContent(openTabs, navigate, tab, route, crumb)`. For protocol picks, keep `resolveProtocolPick` but feed its result into `openContent` with a `project` tab (content) — do NOT `openTab(projectTabId(...))`.

**Step 3 — verify:** `cd app && npx vitest run` for the touched test files; manual browser check (below).

**Verification (browser):** In a new tab (`+`) → splash → click a protocol that belongs to an already-open project. Expected: the new tab's content becomes the project (no new strip tab), and you are NOT taken to the older project tab.

---

## Phase 2 — Per-tab independent history

Move history out of the global store into each tab slot. Back/Forward then move within the active tab's own trail.

### Task 2.1: Add per-tab content stack to `OpenTabState`

**Files:** `app/src/shared/shell/OpenTabsContext.tsx`, `workspace/types.ts` (if `OpenTabState` moves / fields), tests.

**Design:** add to `OpenTabState`:
```ts
export interface OpenTabState {
  tab: WorkspaceTab
  activeRightPaneMode: WorkspaceRightPaneMode
  breadcrumb: BreadcrumbItem[]
  /** This tab's own visited-content trail, oldest → newest. */
  contentHistory: WorkspaceTab[]
  /** Index into contentHistory for the current position. */
  contentCursor: number
}
```
Keep the global `history` for tab-strip order (or replace later). `navigate-active` pushes the previous `tab` onto `contentHistory` and sets `contentCursor`.

**Step 1 — failing test (RED):** navigating the active tab three times yields `contentHistory.length === 3`, and going `back` does not affect the global stack or other tabs.

**Step 2 — implement `back`/`forward` per active tab:** new actions `'within-back'` / `'within-forward'` read the active slot's `contentHistory`/`contentCursor`, move cursor, set `tab` to the target content, and let the caller `navigate(tabPath(tab))`. `WorkspaceTabStrip.handleBack/handleForward` call these and `tabPath` on the restored content.

**Step 3 — verify:** reducer unit tests + browser check that Back/Forward in one tab don't jump to another tab.

---

## Phase 3 — "Open link in new tab" context menu

**Objective:** give links an explicit new-tab affordance (the user's request), bounded + non-invasive.

**Files:** shared link/chip components that render clickable entities — `SplashSearch` results, `LabCollectionView` cards, `GlobalSearchBar` results, `FindTabPanel` rows; a shared `useOpenInNewTab` helper.

**Step 1 — helper (DRY):** `app/src/shared/lib/openInNewTab.ts`:
```ts
export function openInNewTab(openTabs, navigate, tab, route) {
  openTabs?.openTab({ ...tab, id: uniqueTabId(tab) }, true)   // mint a fresh slot
  navigate(route)
}
export function uniqueTabId(tab: WorkspaceTab): string {
  // Keep entity semantics but ensure a fresh slot each open.
  return `${tab.id}:${Date.now()}`
}
```

**Step 2 — wire context menu:** on the clickable chip/result, replace left-click `onClick` with in-place nav (Phase 1) and add `onContextMenu` / a small "⌄" affordance that calls `openInNewTab`. Keep it minimal per project convention (no dropdown library; a simple secondary button or right-click handler).

**Step 3 — tests:** assert left-click = in-place nav, right-click / new-tab control = `openTab` with a fresh id + activation.

---

## Files Likely to Change

- `app/src/shared/shell/OpenTabsContext.tsx` (action union, reducer, context value, persistence of new fields)
- `app/src/shared/shell/OpenTabsContext.test.ts`
- `app/src/shared/shell/WorkspaceTabStrip.tsx` (`handleBack/handleForward` → per-tab history; new-tab control)
- `app/src/shared/lib/openContent.ts` (new), `app/src/shared/lib/openInNewTab.ts` (new)
- `app/src/shared/shell/SplashPage.tsx`, `SplashSearch.tsx`, `GlobalSearchBar.tsx`, `CreateMenu.tsx`
- `app/src/collections/LabCollectionView.tsx`, `RunCollectionView.tsx`, `ProjectCollectionView.tsx`
- `app/src/event-editor/right-pane/find/FindTabPanel.tsx`, `.../search/SearchTabPanel.tsx`
- Host pages (mount re-open) sanity check: `RunWorkspacePage.tsx`, `ProjectWorkspacePage.tsx`, `DeckHostPage.tsx`, `ArtifactHostPage.tsx`, `RecordHostPage.tsx`
- `app/src/event-editor/workspace/types.ts` (OpenTabState fields / tab helpers)

## Tests / Validation

- **Unit:** `OpenTabsContext.test.ts` — new `navigate-active`, per-tab history, `within-back/forward`; surface tests updated for `openContent`/`openInNewTab`.
- **App typecheck:** `cd app && npx tsc --noEmit`.
- **App unit tests:** `cd app && npx vitest run src/shared/shell src/collections src/event-editor/right-pane/find src/event-editor/right-pane/search`.
- **Browser (live) checkbox:**
  1. Open project P in tab 1. `+` → new splash tab 2. From tab 2, click a protocol owned by P → tab 2 content becomes P's project homepage; tab strip unchanged; active tab stays tab 2. **NEVER returns to tab 1.**
  2. In tab 2, navigate P → run → record → Back → lands on previous content within tab 2 (not tab 1).
  3. Right-click a lab card → "Open in new tab" → a third tab opens with that entity; `+` still opens a fresh splash tab.
- **Regression guard:** dashboard/value surfaces (`FindTabPanel` in-project opens, run/project collection opens) still work in-place.

## Risks / Tradeoffs / Open Questions

- **Slot id vs entity id in hosts.** Host pages re-open `projectTabId(studyId)` on mount; with in-place nav the active slot may already hold that project. Need the mount re-open to *recognize* the current slot holds the same entity and not mint/activate a duplicate. This is the trickiest part — the plan keeps `case 'open'` dedup for hosts but routes content clicks through `navigate-active`. Confirm behavior with a live test on refresh/deep-link.
- **Global `history` (strip order) vs per-tab `contentHistory`.** Phase 2 keeps the global stack for tab ordering/back-arrow between tabs OR fully replaces it. The user said "each tab its own independent history" — plan the strip's Back/Forward as per-tab; the global cross-tab stack may be removed or kept for tab activation. Decide in Phase 2 with a clear test.
- **`navigate-active` mutates `tab.id`** today (the `navigate` action does). Phase 1 relies on replacing the active slot's `tab` including id; confirm the strip re-keys by slot index, not by content id. If the strip keys by `tab.id`, a content id change would re-mount the tab — acceptable (content swap) but must not re-activate a *different* slot.
- **Scope:** Option picked = full browser model (in-place nav + explicit new tab + per-tab history), because the user stated it directly. If we only want the minimal bug fix, Phase 1 alone suffices; Phases 2–3 are additive.

## Execution Handoff

Plan complete and saved. Ready to execute using subagent-driven-development — dispatch a fresh subagent per task with two-stage review. Recommend starting at Phase 1 (the reported bug), verify in browser, then Phase 2 (per-tab history), then Phase 3 (context menu). Shall I proceed?
