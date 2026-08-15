# Splash Page (New-Tab Landing) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the broken "+"-popover with a fully in-window **Splash page** that fills the main window of a tab — a landing/home surface with breadcrumbs (global cross-type search, type quick-access chips, durable "recent" sections, and New Run / New Project) so the user can steer any tab to where they want it to go. GlobalNavbar and the tab strip remain pinned above it.

**Architecture:** Two things the code review proved:
1. The current "splash" is a popover anchored to the "+" button (`SplashPage.css: .splash-page { position:absolute; top:100%; left:0; }`). Its containing block escapes to `.cl-app` (`position:fixed; height:577px; overflow:hidden`) because `.workspace-tab__add-wrap` has no `position:relative`; `top:100%` lands at 577px (the bottom edge), and opening it scrolls the container down ~259px, shoving the navbar/tab strip off-screen. **Fix = stop rendering an overlay at all; make Splash a first-class route whose content is the main window.** No popover ⇒ no positioning bug.
2. The splash maps naturally onto the existing collection-view shell pattern: every collection view is `<AppShell layout="workspace" topbarTabs={<WorkspaceTabStrip/>} leftPane={<CollectionContent/>}/>`. A `/splash` route composes the exact same shell but with `<SplashPage/>` as `leftPane` — so GlobalNavbar + tab strip are inherited above it for free.

The splash becomes a **new tab**: clicking "+" pushes a `splash`-kind tab into `OpenTabsContext` and navigates to `/splash`. The splash tab appears in the strip (closable, like any other tab). Selecting a destination from the splash opens that entity as its own tab and navigates (consistent with how collection cards already open tabs via `openTabs.openTab(...)` + `navigate(...)`); the splash tab stays as a reusable launcher until closed.

**Tech Stack:** React 18, TypeScript (exactOptionalPropertyTypes), react-router-dom, Fastify, CSS custom properties (--cl-* tokens), vitest.

---

## Scope & Deferrals (confirmed with user)

- **In this plan:** Splash as new-tab landing page (Phase 1), durable recently-viewed store (Phase 2), cross-type splash search + lab routing fix (Phase 3).
- **Deferred to a follow-up phase (explicitly agreed):** relationship-aware search. For phase 2 of the deferred work, surface relationships as a **"Related items" panel** on entity/claim pages using the existing `GET /relationships` endpoint (a working backend already exists at `server/src/api/handlers/TreeHandlers.ts:1635`). Note: the scientific verb `contributes_to` in the user's example is NOT in `relationship.schema.yaml`'s `verb` enum — that schema vocabulary decision is tracked as an open question, not built here.

---

## Current State (verified by code + browser review)

- `app/src/shared/shell/WorkspaceTabStrip.tsx` — "+" toggles `splashOpen` and renders `<SplashPage onDismiss>` inside `.workspace-tab__add-wrap` (lines 89-102). This is the buggy popover.
- `app/src/shared/shell/SplashPage.tsx` / `.css` — the popover (166 lines). `Recent` is derived from `openTabs.state.tabs` only.
- `app/src/shared/shell/OpenTabsContext.tsx` — `OpenTabsState`/reducer; localStorage key `cl-open-tabs`; `useOptionalOpenTabs()` for shell-shared components.
- `app/src/event-editor/workspace/types.ts` — `WorkspaceTab` union + `entityTabType()` + stable-id helpers (`projectTabId`, `runTabId`, `collectionTabId`, …).
- `app/src/shared/shell/GlobalNavbar.tsx` — 4 destinations + `GlobalSearchBar` + `CreateMenu`.
- `app/src/shared/shell/GlobalSearchBar.tsx` — uses `searchRecords()` (GET `/tree/search`); **drops any kind `kindToEntityType()` can't map (~22 kinds)** and routes lab hits to `/lab/{recordId}` — the valid route is `/lab/:category/:entityId` (BUG).
- `app/src/shared/api/treeClient.ts` — `searchRecords(query, {kind?, limit?})`.
- `server/src/api/handlers/TreeHandlers.ts` — `/tree/search` (supports `kind`), `/relationships` (filters sourceId/sourceType/targetId/targetType/verb).
- `app/src/collections/{Project,Run,Lab,Claim}CollectionView.tsx` — `<AppShell layout="workspace" topbarTabs={<WorkspaceTabStrip/>} leftPane={content}/>` pattern; `embedded` mode returns content only.
- Lab categories (route slugs, `LabCollectionView.tsx:21-29`): `protocols`→protocol, `materials`→material, `labware`→labware, `equipment`→equipment, `people`→person, `documents`→document.
- `app/src/App.tsx:92` — `/` → `/projects`. No `/splash` route.
- `app/src/AppShell.tsx:109-126` — workspace layout renders `<header class="topbar topbar--workspace"><GlobalNavbar/><div class="topbar__tabs">{topbarTabs}</div></header>` then `WorkspaceMain` (PanelGroup left/right).

---

# Phase 1 — Splash as a New-Tab Landing Page (core deliverable)

Goal: clicking "+" opens a real Splash page in the main window (nav + tabs pinned), not a popover. `/` lands on the splash when no tabs are open.

### Task 1.1 — Add `splash` tab kind

**Files:**
- Modify: `app/src/event-editor/workspace/types.ts`

Add to the `WorkspaceTab` union (after the `collection` variant, line 110):

```typescript
  | {
      id: string
      kind: 'splash'
      title: string
    }
```

Add a stable-id helper (next to `collectionTabId`, line 163):

```typescript
/** Stable id for the splash (new-tab launcher) tab. One per open splash. */
export function splashTabId(): string {
  return `splash:${Date.now()}`
}
```

Update `entityTabType()` (line 170) so splash returns `null` (it's not a primary entity):

```typescript
    case 'collection':
    case 'splash':
      return null
```

**Step: Write/verify typecheck**
Run: `cd /home/brad/git/computable-lab && npm run typecheck -w app`
Expected: typecheck passes (there may be an existing `default:` exhaustive case that now needs the `_exhaustive` fallback to keep compiling — add it if reported).

**Step: Commit**
```bash
git add app/src/event-editor/workspace/types.ts
git commit -m "feat: add splash tab kind to WorkspaceTab union"
```

### Task 1.2 — Add `/splash` route + SplashPage landing component

**Files:**
- Create: `app/src/shared/shell/SplashPage.tsx` (full rewrite of the popover into a full-page landing)
- Create: `app/src/shared/shell/SplashPage.css` (rewrite — remove absolute popover positioning)
- Modify: `app/src/App.tsx`

The splash is a full-page landing that inherits nav + tabs from the AppShell workspace layout. It renders a big search bar, type quick-access chips, recent sections, and create actions. The search bar and recent sections are filled in Phases 2-3; Task 1.2 lands the shell + create actions + collection chips so the splash is functional end-to-end.

Add `SplashPage.tsx` — create + collection navigation now, search/recent placeholders wired in later phases:

```tsx
/**
 * SplashPage — new-tab landing surface. Fills the main window of a tab,
 * keeps GlobalNavbar + the tab strip above it (via AppShell workspace
 * layout), and provides breadcrumbs to steer the tab anywhere.
 * Phase 1: collection chips + create actions. Phases 2-3 add recent +
 * cross-type search.
 */
import { useNavigate } from 'react-router-dom'
import { useOptionalOpenTabs } from './OpenTabsContext'
import {
  projectTabId, runTabId, claimTabId, collectionTabId, splashTabId,
  type WorkspaceTab,
} from '../../event-editor/workspace/types'
import { quickCreateRun } from '../../event-editor/create/quickCreateRun'
import { SCRATCH_STUDY_ID } from '../../event-editor/legacyRouteResolution'
import './SplashPage.css'

const COLLECTIONS = [
  { id: 'projects', label: 'Projects' },
  { id: 'runs', label: 'Runs' },
  { id: 'lab', label: 'Lab' },
  { id: 'claims', label: 'Claims' },
] as const

export function SplashPage() {
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()

  const openEntity = (tab: WorkspaceTab, path: string) => {
    openTabs?.openTab(tab, true)
    navigate(path)
  }

  const handleNewRun = async () => {
    try {
      const { recordId } = await quickCreateRun({ studyId: SCRATCH_STUDY_ID })
      openTabs?.openTab({
        id: runTabId(recordId), kind: 'run', runId: recordId, title: 'New Run',
      }, true)
      navigate(`/runs/${recordId}`)
    } catch (err) {
      console.error('Failed to create run:', err)
    }
  }

  const handleNewProject = () => navigate('/create/study')

  return (
    <div className="splash-page" data-testid="splash-page">
      <div className="splash-page__hero">
        <h1 className="splash-page__title">What do you want to open?</h1>
        {/* Phase 3 replaces this with cross-type SplashSearch */}
        <input
          className="splash-page__search"
          data-testid="splash-search"
          placeholder="Search everything…"
          type="text"
          autoFocus
          onChange={() => {}}
        />
      </div>

      {/* Type quick-access chips — Phase 3 fills these from the search */}
      <section className="splash-page__section">
        <h2 className="splash-page__section-title">Browse a type</h2>
        <div className="splash-page__chips">
          {(['protocols','materials','labware','equipment','people','documents'] as const)
            .map((cat) => (
              <button key={cat} type="button" className="splash-page__chip"
                data-testid={`splash-type-${cat}`}
                onClick={() => navigate(`/lab/${cat}`)}>
                {cat}
              </button>
            ))}
        </div>
      </section>

      {/* Top-level collections */}
      <section className="splash-page__section">
        <h2 className="splash-page__section-title">Collections</h2>
        <div className="splash-page__chips">
          {COLLECTIONS.map((col) => (
            <button key={col.id} type="button" className="splash-page__chip"
              data-testid={`splash-nav-${col.id}`}
              onClick={() => {
                openTabs?.openTab({
                  id: collectionTabId(col.id), kind: 'collection',
                  collection: col.id, title: col.label,
                }, true)
                navigate(`/${col.id}`)
              }}>
              {col.label}
            </button>
          ))}
        </div>
      </section>

      {/* Recent — filled in Phase 2 with a durable store */}
      <section className="splash-page__section" data-testid="splash-recent">
        <h2 className="splash-page__section-title">Recent</h2>
        <p className="splash-page__hint">Recently viewed items will appear here.</p>
      </section>

      {/* Create */}
      <section className="splash-page__section">
        <h2 className="splash-page__section-title">Create</h2>
        <div className="splash-page__create-actions">
          <button type="button" className="splash-page__create-btn splash-page__create-btn--primary"
            data-testid="splash-new-run" onClick={handleNewRun}>
            + New Run
          </button>
          <button type="button" className="splash-page__create-btn"
            data-testid="splash-new-project" onClick={handleNewProject}>
            + New Project
          </button>
        </div>
      </section>
    </div>
  )
}
```

`SplashPage.css` — full rewrite; **no absolute positioning, no z-index, no fixed height** (the page sits in normal flow inside the left pane):

```css
.splash-page {
  height: 100%;
  overflow-y: auto;
  padding: 32px 40px 64px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-width: 960px;
}
.splash-page__hero { display: flex; flex-direction: column; gap: 12px; }
.splash-page__title { font-size: 28px; font-weight: 700; margin: 0; color: var(--cl-text, #1a1a1a); }
.splash-page__search {
  width: 100%; max-width: 640px; padding: 12px 16px;
  font-size: 16px; border: 1px solid var(--cl-border, #d0d0d0);
  border-radius: 8px; background: var(--cl-bg, #fff); color: var(--cl-text, #333);
}
.splash-page__search:focus { outline: none; border-color: var(--cl-accent, #2563eb); }
.splash-page__section { display: flex; flex-direction: column; gap: 10px; }
.splash-page__section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--cl-text-faint, #999); margin: 0;
}
.splash-page__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.splash-page__chip {
  padding: 8px 16px; border: 1px solid var(--cl-border, #e0e0e0);
  border-radius: 18px; background: var(--cl-bg-elev, #fff);
  color: var(--cl-text, #333); font-size: 13px; font-weight: 500; cursor: pointer;
}
.splash-page__chip:hover { border-color: var(--cl-accent, #2563eb); }
.splash-page__hint { color: var(--cl-text-faint, #999); font-size: 13px; margin: 0; }
.splash-page__create-actions { display: flex; gap: 12px; }
.splash-page__create-btn {
  padding: 10px 20px; border: 1px solid var(--cl-border, #e0e0e0);
  border-radius: 8px; background: var(--cl-bg, #fff); color: var(--cl-text, #333);
  font-size: 14px; cursor: pointer; font-weight: 500;
}
.splash-page__create-btn--primary {
  border-color: var(--cl-type-run, #2e7d32);
  background: var(--cl-type-run-soft, #e8f5e9);
  color: var(--cl-type-run, #2e7d32);
}
```

Add the route in `app/src/App.tsx` — lazy-load a `SplashRoute` that composes the shell (mirroring collection views). Create `app/src/shared/shell/SplashRoute.tsx`:

```tsx
/** SplashRoute — full-page `/splash` landing. Inherits GlobalNavbar + tab
 *  strip from the workspace AppShell layout; splash is the main window. */
import { AppShell } from './AppShell'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'
import { SplashPage } from './SplashPage'

export function SplashRoute() {
  return (
    <AppShell
      brand="New Tab"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={<SplashPage />}
    />
  )
}
```

In `App.tsx` add a lazy import and route:

```tsx
const SplashRoute = lazy(async () => import('./shared/shell/SplashRoute').then((m) => ({ default: m.SplashRoute })))
// ...
<Route path="/splash" element={<DeferredRoute><SplashRoute /></DeferredRoute>} />
```

**Step: Verify**
- Run `npm run typecheck -w app` → pass.
- Live: navigate to `http://localhost:5174/splash` → nav + tab strip pinned; splash fills main window; chips navigate; New Project → `/create/study`; New Run creates a run.
- Confirm the old popover no longer opens from any page.

**Step: Commit**
```bash
git add app/src/shared/shell/SplashPage.tsx app/src/shared/shell/SplashPage.css app/src/shared/shell/SplashRoute.tsx app/src/App.tsx
git commit -m "feat: splash page as real /splash route (new-tab landing)"
```

### Task 1.3 — "+" opens a splash tab (remove popover)

**Files:**
- Modify: `app/src/shared/shell/WorkspaceTabStrip.tsx`
- Modify: `app/src/shared/shell/WorkspaceTabStrip.css`

Replace the popover toggle with openTab + navigate. Remove the `splashOpen` state, the `SplashPage` popover import, and the inline `<SplashPage onDismiss>`:

```tsx
import { useNavigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { entityTabType, splashTabId, type WorkspaceTab } from '../../event-editor/workspace/types'
import './WorkspaceTabStrip.css'

export function WorkspaceTabStrip() {
  const { state, closeTab, activateTab, openTab } = useOpenTabs()
  const navigate = useNavigate()

  const handleAddTab = () => {
    const tab: WorkspaceTab = { id: splashTabId(), kind: 'splash', title: 'New Tab' }
    openTab(tab, true)
    navigate('/splash')
  }
  // ...existing tab rendering unchanged...
  <button
    className="workspace-tab__add"
    type="button"
    aria-label="Open new tab"
    data-testid="workspace-tab-add"
    onClick={handleAddTab}
  >
    +
  </button>
}
```

Render the splash tab in the strip. Add a `splash` entry to the tab map so it displays (e.g., a `◇` badge) and, in `tabPath`, handle the new kind:

```typescript
function tabPath(tab: WorkspaceTab): string | null {
  switch (tab.kind) {
    // ...existing cases...
    case 'splash':
      return '/splash'
    // ...
  }
}
```

The tab strip's current filter `.filter(({ tab }) => tab.kind !== 'collection')` keeps the splash tab visible (it is not `collection`). Add a `TYPE_LABELS` entry so `entityTabType` returns null gracefully (no badge) or add a dedicated splash badge:

```tsx
const isSplash = tab.kind === 'splash'
// render a distinctive glyph when isSplash, else the existing type badge
```

`WorkspaceTabStrip.css`: remove any styles tied to the deleted popover. If `.workspace-tab__add-wrap` is now just the "+" button, simplify it (keep it `display:flex; align-items:center;`). There is no overlay anymore, so no `position:relative` is required for correctness — the old bug is structurally gone.

**Step: Verify**
- Browser: click "+" on the tab strip → `/splash` loads as the active tab, nav + tabs remain visible, splash fills the main window, old lower-left popup is gone, no scroll jump.
- Close the splash tab → returns to previous tab.
- `npm run typecheck -w app` → pass.

**Step: Commit**
```bash
git add app/src/shared/shell/WorkspaceTabStrip.tsx app/src/shared/shell/WorkspaceTabStrip.css
git commit -m "feat: '+' opens a splash tab instead of a popover"
```

### Task 1.4 — Land on splash when nothing else is open

**Files:**
- Modify: `app/src/App.tsx` (or a small `HomeRedirect` component)

Change `/` so it lands on the splash when there are no open tabs, otherwise returns to the active tab's path. Create `app/src/shared/shell/HomeRedirect.tsx`:

```tsx
/** HomeRedirect — `/` landing. With open tabs, return to the active tab's
 *  route; with none, land on the splash page. */
import { Navigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { tabPath } from './WorkspaceTabStrip'

export function HomeRedirect() {
  const { state } = useOpenTabs()
  const active = state.tabs.find((t) => t.tab.id === state.activeTabId)
  if (active) {
    const path = tabPath(active.tab)
    if (path) return <Navigate to={path} replace />
  }
  return <Navigate to="/splash" replace />
}
```

Note: `tabPath` is currently module-private in `WorkspaceTabStrip.tsx` — export it (change `function tabPath` to `export function tabPath`). Wire in `App.tsx`:

```tsx
<Route path="/" element={<DeferredRoute><HomeRedirect /></DeferredRoute>} />
```

Remove the old `/` → `/projects` Navigate. `HomeRedirect` lives inside `BrowserRouter` and `OpenTabsProvider` (both already wrap `<Routes>` in `App.tsx`), so `useOpenTabs` is available.

**Step: Verify**
- With localStorage `cl-open-tabs` empty, load `/` → lands on `/splash`.
- With an active tab persisted, `/` → lands on that tab's route.
- `npm run typecheck -w app` → pass.

**Step: Commit**
```bash
git add app/src/shared/shell/HomeRedirect.tsx app/src/shared/shell/WorkspaceTabStrip.tsx app/src/App.tsx
git commit -m "feat: land on splash when no tabs are open"
```

---

# Phase 2 — Durable Recently-Viewed Store

Goal: populate the splash "Recent" sections from a durable, cross-session store split by type, not from open tabs.

### Task 2.1 — RecentItemsStore (localStorage) + hook

**Files:**
- Create: `app/src/shared/shell/recentStore.ts`
- Create: `app/src/shared/shell/useRecentItems.ts` (thin wrapper) — or fold into recentStore.ts

Design (declarative rule: the store is data, not behavior):

```typescript
export interface RecentItem {
  recordId: string
  kind: string            // 'study' | 'run' | 'claim' | 'material' | 'labware' | 'equipment' | 'person' | 'protocol' | 'document' | ...
  title: string
  entityType: 'project' | 'run' | 'claim' | 'lab'
  seenAt: number          // epoch ms
}

const KEY = 'cl-recent-items'
const LIMIT = 10 // per type bucket

export function loadRecentItems(): RecentItem[] { /* JSON.parse localStorage, safe-fail to [] */ }
export function saveRecentItems(items: RecentItem[]): void { /* JSON.stringify, safe-fail */ }

/** Push a viewed item (dedupe by recordId, bump to front, cap per type to LIMIT). */
export function recordView(item: Omit<RecentItem, 'seenAt'>): void {
  const items = loadRecentItems()
  const next = [{ ...item, seenAt: Date.now() },
    ...items.filter((i) => i.recordId !== item.recordId)]
  // cap: keep at most LIMIT entries PER entityType (stable ordering — newest first)
  const capped: RecentItem[] = []
  const counts: Record<string, number> = {}
  for (const it of next) {
    const c = counts[it.entityType] ?? 0
    if (c >= LIMIT) continue
    counts[it.entityType] = c + 1
    capped.push(it)
  }
  saveRecentItems(capped)
}

export function groupRecentByType(items: RecentItem[]): Record<string, RecentItem[]> {
  return items.reduce<Record<string, RecentItem[]>>((acc, it) => {
    ;(acc[it.entityType] ??= []).push(it)
    return acc
  }, {})
}
```

A `recordView` hook helper (`useRecordHistory`) that a global `MentionNavigator`-style listener calls on route change. Create `app/src/shared/shell/useRecordHistory.ts`:

```typescript
/** useRecordHistory — records entity views to the recent store on route
 *  match. Consumed once at the app root, next to MentionNavigator. */
import { useEffect, useRef } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { recordView } from './recentStore'

const ROUTE_TO_KIND: Array<{ pattern: string; kind: string; entityType: 'project'|'run'|'claim'|'lab'; titleKey?: string }> = [
  { pattern: '/project/:studyId', kind: 'study', entityType: 'project' },
  { pattern: '/runs/:runId', kind: 'run', entityType: 'run' },
  { pattern: '/claims/:claimId', kind: 'claim', entityType: 'claim' },
  { pattern: '/lab/:category/:entityId', kind: 'lab', entityType: 'lab' },
]

export function useRecordHistory() {
  const location = useLocation()
  const last = useRef<string>('')
  useEffect(() => {
    if (location.pathname === last.current) return
    last.current = location.pathname
    for (const r of ROUTE_TO_KIND) {
      const m = matchPath(r.pattern, location.pathname)
      if (!m) continue
      recordView({
        recordId: m.params.studyId ?? m.params.runId ?? m.params.claimId ?? m.params.entityId ?? '',
        kind: r.kind,
        title: '…', // Phase 3 enriches title from the actual record
        entityType: r.entityType,
      })
      break
    }
  }, [location.pathname])
}
```

**Step: Verify** — unit test `recentStore.test.ts`: push 3 items of same type + 1 different type; assert order (newest first), dedupe by recordId, per-type cap (`repeatView` beyond `LIMIT` drops oldest). `npm run test:unit -w app`.

**Step: Commit**
```bash
git add app/src/shared/shell/recentStore.ts app/src/shared/shell/useRecordHistory.ts app/src/shared/shell/recentStore.test.ts
git commit -m "feat: durable recently-viewed store + route history hook"
```

### Task 2.2 — Wire history + render Recent on the splash

**Files:**
- Modify: `app/src/App.tsx` — render `<RecordHistory />` (a component invoking `useRecordHistory`) inside `BrowserRouter`.
- Modify: `app/src/shared/shell/SplashPage.tsx` — show Recent sections from the store, split by entityType (Recent Projects / Recent Runs / Recent Lab items).
- Modify: `app/src/shared/shell/SplashRoute.tsx` — pass title enrichment if needed (Phase 3).

In `SplashPage`, replace the placeholder Recent section:

```tsx
import { loadRecentItems, groupRecentByType } from './recentStore'
// ...
const recent = groupRecentByType(loadRecentItems())
const RECENT_LABELS: Record<string, string> = {
  project: 'Recent Projects', run: 'Recent Runs', claim: 'Recent Claims', lab: 'Recent Lab Items',
}
// render each non-empty bucket as a chip group; clicking a chip navigates
// using the same openEntity(projectTabId/runTabId/claimTabId/labEntityTabId, path) helper
```

Clicking a recent item opens that entity as a tab (reuse the `openEntity` helper from Task 1.2; map `entityType`/`kind` to the right tab kind + path). Lab items route to `/lab/<category>/<recordId>` where category is derived from `kind` (see Phase 3 mapping).

**Step: Verify**
- Open a project, a run, a claim, a material; go to `/splash`; assert Recent sections list them; reopen `/` with tabs closed → splash shows the recent items; close a tab does NOT remove it from Recent (proves independence from open tabs).
- `npm run test:unit -w app` + typecheck.

**Step: Commit**
```bash
git add app/src/App.tsx app/src/shared/shell/SplashPage.tsx
git commit -m "feat: splash Recent sections fed by durable store"
```

---

# Phase 3 — Cross-Type Splash Search + Lab Routing Fix

Goal: the splash search returns one result set across all first-class types, grouped/filterable by type, and lab results route correctly.

### Task 3.1 — Fix GlobalSearchBar lab routing + broaden kind mapping

**Files:**
- Modify: `app/src/shared/shell/GlobalSearchBar.tsx`

Root cause: `resultPath` returns `/lab/${recordId}` (1 segment) but the route is `/lab/:category/:entityId`; and `kindToEntityType`/`kindToLabel` drop ~22 kinds.

Add a shared `kindToCategory` map (also reused by the splash). Create `app/src/shared/lib/kindMeta.ts` (shared — 2+ consumers, satisfies the `shared/` rule):

```typescript
/** Map a record kind to a Lab route category slug (matches LabCollectionView CATEGORIES). */
export const KIND_TO_LAB_CATEGORY: Record<string, string> = {
  protocol: 'protocols', 'local-protocol': 'protocols',
  material: 'materials', 'material-spec': 'materials', 'material-instance': 'materials', 'material-lot': 'materials',
  labware: 'labware', 'labware-instance': 'labware',
  equipment: 'equipment', instrument: 'equipment', 'calibration-record': 'equipment',
  person: 'people',
  document: 'documents',
}

/** Map a record kind to a human type label. */
export const KIND_LABEL: Record<string, string> = {
  study: 'Project', run: 'Run', claim: 'Claim',
  protocol: 'Protocol', material: 'Material', 'material-spec': 'Material Spec',
  'material-instance': 'Material Instance', 'material-lot': 'Material Lot',
  labware: 'Labware', 'labware-instance': 'Labware Instance',
  equipment: 'Equipment', instrument: 'Instrument', 'calibration-record': 'Calibration',
  person: 'Person', document: 'Document', relationship: 'Relationship',
}
```

Fix `resultPath` and `kindToEntityType` in `GlobalSearchBar.tsx` to use these:

```typescript
case 'lab': {
  const category = KIND_TO_LAB_CATEGORY[result.kind]
  return category ? `/lab/${category}/${result.recordId}` : `/lab/${result.recordId}`
}
```

**Step: Verify**
- Browser: GlobalSearchBar query for a material/instrument → clicking a result lands on `LabEntityWorkspace` (`/lab/<category>/<id>`), not the collection view.
- Typecheck + unit test for `kindMeta`.

**Step: Commit**
```bash
git add app/src/shared/lib/kindMeta.ts app/src/shared/lib/kindMeta.test.ts app/src/shared/shell/GlobalSearchBar.tsx
git commit -m "fix: lab search results route to /lab/:category/:entityId"
```

### Task 3.2 — Splash cross-type search component

**Files:**
- Create: `app/src/shared/shell/SplashSearch.tsx`
- Create: `app/src/shared/shell/SplashSearch.css`
- Modify: `app/src/shared/shell/SplashPage.tsx` (use `<SplashSearch/>` in place of the placeholder input)

`SplashSearch` hits `/tree/search` (via `searchRecords`), groups results by entity type, and shows a type-filter row. It routes/label matches the same conventions as `GlobalSearchBar` (reuse `kindMeta`). Sketch:

```tsx
export function SplashSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeType, setActiveType] = useState<string | null>(null)
  const navigate = useNavigate()
  // debounce 200ms; call searchRecords(query, { limit: 40 })
  // group by entityType; render type filter chips (All | Projects | Runs | Claims | Lab)
  // clicking a result -> openEntity tab + navigate (same helpers as SplashPage)
}
```

Normalize results with the same `kindToEntityType`/`SplashResult` mapping used elsewhere; keep results grouped so "All" shows counts per type section.

**Step: Verify**
- Browser: type on splash → grouped results appear; filter chips narrow by type; clicking a result opens that entity as a tab and navigates; lab/material/instrument/user results route correctly.
- Typecheck + unit test (debounce + grouping + filter).

**Step: Commit**
```bash
git add app/src/shared/shell/SplashSearch.tsx app/src/shared/shell/SplashSearch.css app/src/shared/shell/SplashPage.tsx app/src/shared/shell/SplashSearch.test.tsx
git commit -m "feat: cross-type grouped search on splash"
```

### Task 3.3 — Enrich recent titles (use actual record titles)

**Files:**
- Modify: `app/src/shared/shell/useRecordHistory.ts`

When recording an entity view, fetch/enrich `title` from the index/collection data so Recent chips show real names, not placeholders. Where a lightweight endpoint exists (e.g., the entity lists used by collection views), pass the title through the `recordView` call; otherwise fetch the single record title via `apiClient.getRecord(recordId)` (throttled/debounced) and update the store.

**Step: Verify** — console shows real titles in Recent after visiting records.

**Step: Commit**
```bash
git add app/src/shared/shell/useRecordHistory.ts
git commit -m "feat: recent items show real record titles"
```

---

# Phase 4 — Related Items via Relationships (DEFERRED, separate session)

Explicitly agreed to defer. When scheduled, scope:
- Frontend client for `GET /relationships` in `treeClient.ts` (`listRelationships({sourceId?, sourceType?, targetId?, targetType?, verb?})`).
- A `RelatedItems` panel on `LabEntityWorkspace`, `RunWorkspacePage`, and `ClaimWorkspace` that queries relationships where the current entity is `sourceId` or `targetId`, renders the counterpart + verb (color-coded), and clicking opens the counterpart as a tab.
- Optional later: relationship-aware splash search (matches verbs + related entities). **Flag**: `contributes_to` (and the broader scientific claim vocabulary from the user's example) is not in `relationship.schema.yaml`'s `verb` enum — decide whether to extend the enum + add `evidence`/`assertion` provenance routing before building relationship search.

---

## Files Changed (summary)

| File | Action | Phase |
|------|--------|-------|
| `app/src/event-editor/workspace/types.ts` | Modify — add `splash` kind, `splashTabId`, `entityTabType` case | 1 |
| `app/src/shared/shell/SplashPage.tsx` | Rewrite — popover → full page | 1 |
| `app/src/shared/shell/SplashPage.css` | Rewrite — no absolute positioning | 1 |
| `app/src/shared/shell/SplashRoute.tsx` | Create — compose AppShell workspace + SplashPage | 1 |
| `app/src/App.tsx` | Modify — `/splash` route, `/` → HomeRedirect | 1 |
| `app/src/shared/shell/HomeRedirect.tsx` | Create — land on splash when empty | 1 |
| `app/src/shared/shell/WorkspaceTabStrip.tsx` | Modify — "+" opens splash tab; export `tabPath` | 1 |
| `app/src/shared/shell/WorkspaceTabStrip.css` | Modify — drop popover styles | 1 |
| `app/src/shared/shell/recentStore.ts` (+ test) | Create — durable recent store | 2 |
| `app/src/shared/shell/useRecordHistory.ts` | Create — route → recordView | 2 |
| `app/src/shared/lib/kindMeta.ts` (+ test) | Create — kind → category/label | 3 |
| `app/src/shared/shell/SplashSearch.tsx` (+ css, test) | Create — cross-type grouped search | 3 |
| `app/src/shared/shell/GlobalSearchBar.tsx` | Modify — routing fix + broaden mapping | 3 |
| (Phase 4) `treeClient.ts`, `RelatedItems.tsx`, entity pages | Create/Modify | 4 |

## Verification

- `cd /home/brad/git/computable-lab && npm run typecheck -w app` (after each phase).
- `npm run test:unit -w app` (new unit tests for recentStore, kindMeta, SplashSearch).
- Live browser at `http://localhost:5174`:
  1. Click "+" → `/splash` opens as a tab; GlobalNavbar + tab strip stay visible; no lower-left popup, no page scroll jump.
  2. `/` (with no tabs) → lands on /splash; with tabs → returns to active tab.
  3. Splash Recent lists previously visited projects/runs/claims/materials; closing tabs does not clear Recent.
  4. Splash search returns grouped results across types; type filter narrows; lab/material/instrument results open the correct entity detail page.
  5. Create: New Run → creates a run and opens it as a tab; New Project → `/create/study`.

## Risks & Open Questions

1. **Splash tab lifecycle**: "+" opens a splash tab that navigates to `/splash`. Navigating the splash tab to another destination (e.g., clicking a collection chip navigates the *current* tab) can leave a "New Tab" label on a non-splash route. Mitigation: tab title is transient; the splash becomes a reusable launcher that stays until closed. Confirm with user during implementation whether collection-chip navigation should open a *new* tab rather than navigate the splash tab.
2. **Per-page content switching**: collection/workspace routes each compose their own shell + tab strip; there is no single global "render active tab content" driver. The `/splash` route follows the collection-view pattern, so the splash is correctly scoped; entity tabs continue to open via their own routes. Keep the two mechanisms consistent.
3. **exactOptionalPropertyTypes**: when building tabs/objects with optional fields (e.g., `eventGraphId?`, `studyId?`), use conditional spread or omit — never set `undefined` explicitly (see project convention).
4. **Recent title enrichment (Task 3.3)** adds N+1 fetch cost; keep debounced/throttled and per-route.
5. **Relationship verb vocabulary** (`contributes_to` etc.) is a schema decision pending before Phase 4's relationship-search variant; Related-items panel uses only existing enum verbs.
