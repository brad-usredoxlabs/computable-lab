# Unified Browser-Like Tabs + Per-Tab Breadcrumb Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Convert the tab system from a two-level model (top-level `OpenTabs` strip + per-study `WorkspaceContext` hidden sub-tabs, "one tab per project") into a single browser-like model where **each tab is an arbitrary content surface** (project homepage, a run, an artifact, a material, a claim) with its **own right-pane state and its own "how I got here" breadcrumb trail**. Drop the "one tab per project" grouping so a project homepage and a run can coexist as two separate tabs.

**Architecture:** One tab store (`OpenTabsContext`) is the single source of truth. Each tab holds `{ id, kind, content, title, right-pane state, breadcrumb trail }`. A single content router renders whichever surface the active tab points at, replacing the current per-route composition and the per-study `WorkspaceContext` nesting. Navigation records an origin trail per tab (e.g. `Runs → <project> → <run>`), and the breadcrumb (shown in the viewer-toolbar slot above the left pane — no third pane) reflects that trail even when a run belongs to multiple projects.

**Tech Stack:** React 18, TypeScript (exactOptionalPropertyTypes), React Router, vitest, Fastify.

---

## Current State & Root Cause (verified)

There are **two stacked tab systems**:

| Layer | Store | Contents | Persistence | Strip shown? |
|-------|-------|----------|-------------|--------------|
| **Top-level tabs** | `OpenTabsContext` (`shared/shell/OpenTabsContext.tsx`) | session tabs keyed by stable entity id: `project:STU`, `run:RUN`, `claim`, `lab-entity`, `collection`, `splash` | localStorage `cl-open-tabs` | ✅ `WorkspaceTabStrip` |
| **Per-study sub-tabs** | `WorkspaceContext` (`event-editor/workspace/WorkspaceContext.tsx`) | internal viewer tabs of a study: `project-details`, `deck`, `pdf`, `document`, `record-create`, `record-edit`, `execution` | server `records/studies/<id>/workspace.yaml` | ❌ hidden inside a project tab |

The left pane of `/project/:studyId` is driven by `WorkspaceContext` (`ProjectWorkspacePage.tsx` `LeftPane` switches on the active *internal* tab), while the visible strip shows the top-level `OpenTabs` tab. **So "Brad's Project" is one top-level tab, and navigating to "Friday Morning Run" only changes the hidden internal deck tab** — you cannot pop the run out into its own top-level tab, and returning to the project re-activates the same top-level tab whose internal state is still the run's deck.

This is why: `FindTabPanel.RunRow.openMethodDeck` calls `ws.openTab({kind:'deck',...})` (the hidden per-study store, no strip entry), and `ProjectWorkspacePage` treats the OpenTabs tab + the internal deck as one.

### Key files
- `app/src/shared/shell/OpenTabsContext.tsx` — top-level tab store/reducer/localStorage.
- `app/src/shared/shell/WorkspaceTabStrip.tsx` — visible strip; `tabPath()` maps top-level tab kinds → routes.
- `app/src/event-editor/workspace/{types,WorkspaceContext,reducer}.ts` — per-study store + `WorkspaceTab` union + `WorkspaceState`.
- `app/src/event-editor/projects/ProjectWorkspacePage.tsx` — composes `WorkspaceProvider` + `LeftPane` (switches on internal tab kind) + `RightPane`.
- `app/src/run/RunWorkspacePage.tsx` — standalone run workspace (already a top-level `run` tab + `DeckToolbar`).
- `app/src/event-editor/viewer/{Viewer,ViewerToolbar}.tsx`, `right-pane/deck/{DeckToolbar,RunBreadcrumb}.tsx` — viewer + toolbar slot; breadcrumb currently global (route-derived), not per-tab.
- `app/src/event-editor/right-pane/find/FindTabPanel.tsx` — `ws.openTab` run/artifact creators (the culprit for hidden sub-tabs).
- `app/src/collections/{Project,Run,Lab,Claim}CollectionView.tsx`, `shared/shell/{SplashPage,SplashSearch,GlobalSearchBar}.tsx` — the open-tab entry points.

**Project conventions to honor:** two-pane layout (never a third pane — the breadcrumb goes in the existing viewer-toolbar slot); `exactOptionalPropertyTypes` (conditional-spread / omit, never `{ field: undefined }`).

---

## Target Data Model (unified single-tab store)

Replace the two stores with one. In `app/src/shared/shell/OpenTabsContext.tsx` (or a new `app/src/shared/shell/tabs/` module):

```typescript
/** One crumb in a tab's origin trail. */
export interface BreadcrumbItem {
  label: string
  entityType: 'project' | 'run' | 'claim' | 'lab' | 'collection' | null
  id?: string            // entity recordId when known
  route?: string         // route to restore that crumb
}

/** A first-class content surface. The `kind` + `content` tell the content
 *  router what to render; the rest is per-tab UI + navigation state. */
export interface AppTab {
  id: string            // unique — NOT deduped "one per entity" by default
  kind: WorkspaceViewerKind          // 'project-details' | 'deck' | 'pdf' | 'document' | 'run' | 'project' | 'claim' | 'lab-entity' | 'collection' | 'splash' | 'record-create' | 'record-edit' | 'execution'
  content: TabContent                // the specific content ref (see below)
  title: string
  rightPaneMode: WorkspaceRightPaneMode
  rightPaneCollapsed: boolean
  paneWidths: { left: number; right: number }
  breadcrumb: BreadcrumbItem[]       // how we got here, oldest → current
}

/** Discriminated content ref — what the tab renders. */
export type TabContent =
  | { studyId: string }                          // project homepage
  | { runId: string; eventGraphId?: string }     // run / its method deck
  | { eventGraphId: string }                     // bare deck/execution
  | { artifactId: string }                       // pdf / document
  | { recordId: string; kind?: string }          // record-edit / lab-entity
  | { nodeType: string; parentId?: string }      // record-create
  | { collection: string; labCategory?: string } // collection
  | { origin?: BreadcrumbItem[] }                // splash
```

Reducer actions (extend the current `OpenTabsAction`):
```
open      { tab, activate?, seedBreadcrumb? }   // open a NEW tab (or focus an existing tab for the same content if {focusExisting:true})
navigate  { tabId, tab }                         // change the CONTENT of an existing tab and push a breadcrumb crumb (browser-tab-navigate)
activate  { tabId }
close     { tabId }
rename    { tabId, title }
set-right-pane-mode / set-right-pane-collapsed / set-pane-widths  (per tab)
replace   { state }                              // localStorage restore
```

Breadcrumb seeding rule: when `openTab` is called with a context (e.g. opened from a project), the opener passes `seedBreadcrumb` = the trail of that context *up to the new tab's own crumb*. When an existing tab navigates (`navigate`), the current tab's `title`/layout is replaced by the new content and its crumb is appended.

---

## Logical flow (browser-like)

1. **Click a project card** → `openTab` a `project-details` tab (content `{studyId}`), breadcrumb `[Projects, <Project>]`, navigate to `/project/<id>`.
2. **Click a run inside that project** → `openTab` a NEW `run` tab (content `{runId, eventGraphId}`), breadcrumb seeded `[<Project>, <Run>]` (so the breadcrumb shows the run's *origin project* even if the run links to multiple projects), navigate to `/runs/<id>`.
3. **Both tabs coexist in the strip** — project homepage tab + run tab. Activating one shows its content + its breadcrumb.
4. **Opening an entity from another surface** (splash under project X, search) seeds the same origin trail.
5. **GlobalNavbar** switches which *collection* the current tab shows (browser "type a URL"), without spawning a tab — same-tab navigate, crumb recorded.

---

# PHASES

> Each phase is independently verifiable and committed separately. Phases 0–2 deliver the user's immediate ask (runs/artifacts as their own tabs + per-tab breadcrumb); Phases 3–4 complete the flatten for the remaining content types. The repo has a known set of ~46 **pre-existing** unit-test failures (pdfjs/env + stale legacy) — never "fix" those; only fix regressions your phase introduces.

---

## Phase 0 — Per-tab breadcrumb + unified tab shape (foundation)

**Goal:** Introduce the `AppTab` shape (content + breadcrumb + per-tab right-pane state) into `OpenTabsContext` without yet changing which routes render. The breadcrumb becomes per-tab and renders in the viewer-toolbar slot.

### Task 0.1 — Extend the tab shape + reducer
**Files:**
- Modify: `app/src/shared/shell/OpenTabsContext.tsx` (types + `openTabsReducer` + persistence)
- Modify: `app/src/event-editor/workspace/types.ts` (keep `WorkspaceTab` for the `kind`/`content` vocabulary, or introduce `TabContent` here; add `BreadcrumbItem`)

Add `breadcrumb: BreadcrumbItem[]` (and the per-tab right-pane fields if not already present) to `OpenTabState`; add `seedBreadcrumb ` support to `open`; add a `navigate` action (replace one tab's content + append a crumb). Keep the existing per-entity stable IDs for now (dedup unchanged this phase) so nothing about which routes render changes. Migrate persisted `cl-open-tabs` entries (default `breadcrumb: []` when absent).

```typescript
// OpenTabsContext reducer — new action (exactOptionalPropertyTypes-safe):
case 'navigate': {
  if (action.tabId === undefined) return state   // exactOptional: avoid undefined values
  return {
    ...state,
    tabs: state.tabs.map((entry) =>
      entry.tab.id === action.tabId
        ? { ...entry, tab: action.tab, breadcrumb: entry.breadcrumb.concat(action.crumb ? [action.crumb] : []) }
        : entry,
    ),
  }
}
```

**Verify:** typecheck; unit tests in `OpenTabsContext.test.ts` for `navigate` + seed-breadcrumb + persistence round-trip.

### Task 0.2 — Per-tab breadcrumb UI in the viewer-toolbar slot
**Files:**
- Modify: `app/src/event-editor/viewer/deck/DeckToolbar.tsx` (+ `RunBreadcrumb.tsx`) so the breadcrumb renders from the **active tab's `breadcrumb`** rather than re-deriving globally from `ws.state.studyId`.
- Modify: `app/src/event-editor/projects/ProjectWorkspacePage.tsx` + `app/src/run/RunWorkspacePage.tsx` to pass the active OpenTabs tab's breadcrumb into the toolbar / a shared `TabBreadcrumb` component (create `app/src/shared/shell/TabBreadcrumb.tsx`).

Create `TabBreadcrumb.tsx` (renders `breadcrumb: BreadcrumbItem[]` as `Crumb › Crumb › Current`, current = the run/entity title, clickable crumbs navigate back):

```tsx
export function TabBreadcrumb({ crumbs, current }: {
  crumbs: BreadcrumbItem[]
  current: string
}) {
  return (
    <span className="tab-breadcrumb" data-testid="tab-breadcrumb">
      {crumbs.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="tab-breadcrumb__sep" aria-hidden>›</span>}
          {c.route ? (
            <button type="button" className="tab-breadcrumb__link" onClick={() => navigate(c.route!)}>
              {c.label}
            </button>
          ) : (
            <span className="tab-breadcrumb__static">{c.label}</span>
          )}
        </span>
      ))}
      <span className="tab-breadcrumb__sep" aria-hidden>›</span>
      <span className="tab-breadcrumb__current">{current}</span>
    </span>
  )
}
```
Add a `.tab-breadcrumb` style (light, in the toolbar row — not a new pane). Keep `RunBreadcrumb` (direct-access 1:n project list) as the fallback for the standalone `/runs/:id` when the tab has no seeded trail.

**Verify:** typecheck; browser — with a run opened from a project, the toolbar shows `[Project] › [Run]` and the crumb navigates back to the project; standalone `/runs/:id` still shows its 1:n project list.

---

## Phase 1 — Runs & artifacts open as their own top-level tabs

**Goal:** Fix the immediate complaint — a run (and artifact) opened from a project homepage opens as its **own top-level tab** that coexists with the project homepage tab, instead of a hidden workspace sub-tab. The run tab carries the project-origin breadcrumb.

### Task 1.1 — Redirect run/artifact opens from `ws.openTab` (workspace) to `openTabs.openTab` (top-level)
**Files (call sites):**
- `app/src/event-editor/right-pane/find/FindTabPanel.tsx` — `RunRow.openMethodDeck` / `attachProtocolMethod` and `ArtifactRow` / `InventoryRow`.
- `app/src/event-editor/right-pane/search/SearchTabPanel.tsx`, `right-pane/ai/AiTabPanel.tsx`, `right-pane/ai/RunInEventEditorButton.tsx`, `viewer/pdf/ConvertToProtocolModal.tsx`, `topbar/DeckModeSwitcher.tsx`.

For run opens: replace `ws.openTab({kind:'deck', runId, ...})` with `openTabs.openTab({ id:`run:${runId}`, kind:'run', content:{runId,eventGraphId}, title }, true)` seeded with the project-origin crumb `[{label: studyTitle, entityType:'project', id: studyId, route:'/project/${studyId}'}]`, then `navigate('/runs/' + runId)`. For artifacts (pdf/document/record-edit): open a top-level tab with the artifact content + same project crumb.

**Reuse a helper:** create `app/src/shared/shell/openTabFromContext.ts` exposing `openEntityTab(openTabs, navigate, seed, tab)` that seeds the origin crumb and activates, so all call sites are consistent.

**Keep** the right-pane `protocol` auto-switch (now driven by the run tab's own `rightPaneMode`), and ensure `tabPath()` handles `kind:'run'` (it does) and `kind:'lab-entity'`.

**Verify:** typecheck; browser — open "Brad's Project", click a run: the strip now shows **two** tabs (Project + Run), each restorable; breadcrumb on the run tab reads `[Brad's Project] › [Friday Morning Run]`.

### Task 1.2 — Make ProjectWorkspacePage not fight the new top-level tabs
**Files:** `app/src/event-editor/projects/ProjectWorkspacePage.tsx`
When the active OpenTabs tab is a top-level `run` (or artifact) tab, `ProjectWorkspacePage` must render that surface (deck/pdfs/etc.) via the Viewer rather than a `project-details` homepage, and must NOT force the "land on homepage" effect onto run tabs. Adjust the Phase-R landing effect to only seed the homepage for a `project-details`/`project` tab; run/artifact tabs render their own content.

**Verify:** typecheck; browser — after clicking a run, the run tab shows the deck (with breadcrumb + Protocol right pane) and returning to the project tab shows the homepage.

---

## Phase 2 — Flatten remaining workspace sub-tabs into the unified model

**Goal:** Promote the remaining hidden per-study sub-tabs (`deck`, `pdf`, `document`, `record-create`, `record-edit`, `execution`) to first-class top-level tabs; make `OpenTabsContext` the single tab store; reduce `WorkspaceContext` to only "active study context" (right-pane + breadcrumb source) rather than a second tab list.

### Task 2.1 — Single content router
**Files:**
- Create/modify: `app/src/shared/shell/TabContentView.tsx` — a router that, given the active `AppTab`, renders the correct surface: `project-details` → (homepage Find content) ; `deck`/`run` → `DeckViewer`/`ExecutionView`; `pdf` → `PdfViewer`; `document` → `DocumentEditor`; `record-edit` → `RecordEditPanel`; `record-create` → `RecordCreatePanel`; `execution` → `ExecutionTabShell`; `collection` → the embedded collection view; `splash` → `SplashPage`; `claim`/`lab-entity` → their workspaces.
- Refactor `ProjectWorkspacePage`/`RunWorkspacePage` to delegate to `TabContentView` instead of their bespoke `LeftPane` switches.

### Task 2.2 — Convert workspace `openTab` call-sites to the unified store
**Files:** all `ws.openTab` sites found in `FindTabPanel`, `DeckModeSwitcher`, `AiTabPanel`, `SearchTabPanel`, `RunInEventEditorButton`, `ConvertToProtocolModal`, `ProjectWorkspacePage`. Convert each to `openTabs.openTab(…AppTab…)` with the right `kind`/`content`/breadcrumb seed.

### Task 2.3 — Persist tabs at the top level; migrate workspace.yaml
**Files:** `OpenTabsContext.tsx` (persistence now includes `deck`/`pdf`/`document`/`execution`/`record-*` tabs), `WorkspaceContext.tsx`.
Adopt/migrate the per-study `records/studies/<id>/workspace.yaml` content into the unified `cl-open-tabs` model (or keep `WorkspaceContext` as the persistence layer for study-scoped deck/artifact state but read/write through the unified reducer). Provide a migration that reads existing `workspace.yaml` tabs and re-hydrates them as top-level tabs tagged with the study id + an origin crumb. Document the migration; do not lose deck `eventGraphId`/`runId` bindings.

**Verify:** typecheck; browser — open a project, open a deck, a PDF artifact, and a record: all appear as their own strip tabs; the right pane + breadcrumb follow the active tab; reload restores them.

---

## Phase 3 — Arbitrary content in any tab + per-tab back-stack (browser polish)

**Goal:** Full "open anything in any tab": allow opening content into the *current* tab (browser URL-nav semantics) with a per-tab **back stack**, so a project tab can navigate into a run and back, retaining state.

### Task 3.1 — Per-tab back stack
**Files:** `OpenTabsContext.tsx` (+ types)
Add `history: AppTab[]` per tab (most-recent-first, capped ~30). `navigate` pushes to `history`; add `back(tabId)` and `forward(tabId)`. Extend `TabBreadcrumb`/toolbar with Back/Forward affordances (browser-style).

### Task 3.2 — "Open in SAME tab" vs "Open in NEW tab"
**Files:** entry points (`ProjectCollectionView`, `RunCollectionView`, `SplashSearch`, `GlobalSearchBar`, `FindTabPanel`).
Introduce a deliberate rule: navigation *from within a surface* (surface → child) opens in a **new tab** (browser "open in new tab"), while clicking the **GlobalNavbar destinations** navigates the *current* tab (browser "type URL") via `navigate`, pushing a crumb and a back-stack entry. Default: most entity clicks open new tabs; the navbar and in-pane breadcrumbs navigate the current tab.

### Task 3.3 — Deep-link restoration
**Files:** `OpenTabsContext.tsx` hydration + `App.tsx` routes.
On app load with a URL that maps to a tab (e.g. `/runs/:id`), restore or create the matching tab and its breadcrumb from the URL/query context, so refreshing a run tab keeps its origin trail.

**Verify:** typecheck; browser — open project → run (new tab); click Back in the run tab → project homepage in that same tab; navbar destination navigates the current tab; refresh a deep-linked run keeps its breadcrumb.

---

## Migration & risk notes
1. **workspace.yaml → unified tabs** is the riskiest piece: preserve deck `eventGraphId`/`runId`, artifact ids, per-tab right-pane mode. Add a one-way migration + a fallback that re-reads workspace.yaml for study-scoped state if the unified store is empty.
2. **Lots of `ws.openTab` call-sites**: enumerate them (the grep in Phase 2 lists them) and convert one-by-one; each is small. Do not half-convert — the two stores must not drift.
3. **exactOptionalPropertyTypes**: when building `AppTab`/`TabContent`/`BreadcrumbItem` with optional fields, use conditional spread or omit; never `{ field: undefined }`.
4. **Two-pane constraint**: the breadcrumb + back/forward live in the existing viewer-toolbar slot; do NOT add a third pane or left sidebar.
5. **Right-pane per-tab state** currently lives in two places (`OpenTabsContext.activeRightPaneMode` and `WorkspaceContext.rightPaneMode`) — the unified model should own it once (on `AppTab`).
6. **`tabPath()`** must cover every top-level kind (project/run/claim/lab-entity/collection/splash/deck/pdf/document/execution/record-edit/record-create) so clicking a strip tab restores its route.

## Files likely to change (summary)
| Area | Files |
|------|-------|
| Tab store | `shared/shell/OpenTabsContext.tsx`, `event-editor/workspace/types.ts`, `event-editor/workspace/WorkspaceContext.tsx`, `event-editor/workspace/reducer.ts` |
| Tab strip / router | `shared/shell/WorkspaceTabStrip.tsx`, `shared/shell/TabContentView.tsx` (new) |
| Breadcrumb | `shared/shell/TabBreadcrumb.tsx` (new), `viewer/deck/{DeckToolbar,RunBreadcrumb}.tsx` |
| Content pages | `event-editor/projects/ProjectWorkspacePage.tsx`, `run/RunWorkspacePage.tsx` |
| Open-tab call-sites | `right-pane/find/FindTabPanel.tsx`, `right-pane/search/SearchTabPanel.tsx`, `right-pane/ai/{AiTabPanel,RunInEventEditorButton}.tsx`, `viewer/pdf/ConvertToProtocolModal.tsx`, `topbar/DeckModeSwitcher.tsx`, `collections/{Project,Run,Lab,Claim}CollectionView.tsx`, `shared/shell/{SplashPage,SplashSearch,GlobalSearchBar}.tsx` |

## Verification (run after each phase)
- `cd /home/brad/git/computable-lab && npm run typecheck -w app` (and `npm run typecheck` for server too at Phase 2 migration).
- `cd app && npx vitest run src/shared/shell/OpenTabsContext.test.ts src/shared/shell/TabBreadcrumb.test.tsx src/event-editor/projects src/event-editor/right-pane/find` — plus the targeted suites touched.
- Browser: confirm the "two views within one project" scenario (project homepage tab + run tab coexist; run tab breadcrumb shows origin project), tab restoration, and deep-link refresh preserves breadcrumb.

## Open decisions to confirm before/then execution begins
1. **Open-in-new-tab default for every entity click** (Phase 3.2) — confirm you want entity clicks to always open a new tab (browser "link opens in new tab") vs. a middle-click/context behavior. Default proposed: new tab.
2. **Same-entity dedup**: even in the full model, should opening the same run a second time focus the existing run tab (dedup per entity) or open a duplicate? Proposed: dedup for `run`/`claim`/`lab-entity` via their stable id, but allow multiple *project-homepage/deck* views of the same study. Confirm.
