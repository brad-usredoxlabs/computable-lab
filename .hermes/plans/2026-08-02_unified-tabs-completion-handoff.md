# Handoff — Unified Browser-Like Tabs + Per-Tab Breadcrumb (completion guide)

> **Purpose:** This is a session handoff. A fresh session should read this file, verify the current state, and complete the remaining phases. Treat this as the source of truth for context; do not re-derive the architecture from scratch.

**Branch:** `feat/ai-extension-api`
**Repo:** `/home/brad/git/computable-lab` (frontend in `app/`)
**Model/notes for the next session:**
- App runs on http://localhost:5174 (vite --watch) + backend :3001. Edits hot-reload; do not restart.
- TypeScript enables **exactOptionalPropertyTypes**: never set optional fields to `undefined`; use conditional spread `...(cond ? { k: v } : {})` or omit. This bit us repeatedly.
- There is a known pre-existing unit-test failure set (~46, after this work ~48) — pdfjs `DOMMatrix`/env errors, stale legacy route tests, and `getProtocolContext` mock gaps in `FindTabPanel` tests. **These are NOT caused by this feature; don't burn time "fixing" them.** Only fix regressions your own changes introduce.
- Settings live in `~/.hermes/profiles/architect-ds4/config.yaml`. `delegation.max_iterations` was raised 50 → 60 so 27B sub-agents finish their reports (the earlier workers died on the 50 cap mid-report).

---

## 1. What this feature is

The app is moving from a two-level tab system to a single **browser-like tab model**:
- **Old:** a visible top-level `OpenTabs` strip keyed by stable entity IDs ("one tab per project"), PLUS a hidden per-study `WorkspaceContext` holding run/artifact/deck sub-tabs *inside* each project tab. That's why a run felt glued to its project and you couldn't get two views of the same project.
- **New (target):** one tab store; each tab is an arbitrary content surface (project homepage, a run, an artifact, a record) with its own right-pane state and its own **"how I got here" breadcrumb**. Runs/artifacts/records open as their **own top-level tabs** and coexist in the strip. The breadcrumb reflects the navigation path even when a run belongs to multiple projects.

---

## 2. What is DONE and committed (verified)

| Commit | Phase | What |
|--------|-------|------|
| `7506d19` | P0 | Per-tab `breadcrumb` in `OpenTabsContext` (`openTab(tab, activate?, seedBreadcrumb?)`, `navigateTab`), `BreadcrumbItem` type, `TabBreadcrumb` component, persistence + migration. |
| `d6527f0` | P1 | A run clicked on a project homepage opens as its **own top-level tab** (`/runs/:id`) with the project-origin breadcrumb. `FindTabPanel.RunRow.openRun` + `RunWorkspacePage` renders the run tab's breadcrumb. Live-verified: project homepage + run coexist as two tabs. |
| `c666bb8` | P2a | **PDF/document artifacts** open as own top-level tabs via `/artifact/:kind/:artifactId` → `ArtifactHostPage` (a workspace shell host). `tabPath` maps pdf/document; `FindTabPanel.ArtifactRow`, `SearchTabPanel`, `AiTabPanel` converted. |
| `99c849f` | P2b | **Record editors** (edit + create) open as own top-level tabs via `/record/:recordId` and `/record/new/:nodeType/:parentId?` → `RecordHostPage`. `tabPath` maps record-edit/create; `FindTabPanel` record paths (study/experiment/protocol edit, experiment/run create, inventory record-edit) converted. |
| `a40e05b` | P2b residual | `ConvertToProtocolModal` opens the new protocol record as its own top-level tab. |

Full `npm run typecheck` (app **and** server) passes. No new test regressions from this feature.

**Earlier related work (also on this branch, all committed + verified):** run-centric nav — real run title in the run breadcrumb (`79a9856`), Find tab eliminated from the right pane + `find`→`ai` default (`73f5d71`), find content promoted to the project homepage + `ProjectDetailsView` retired (`3f01c36`), picking a project-linked protocol lands on its project homepage (`8568bd9`), and two fixes (homepage landing once-per-mount `6baccb2`, run decks bound with `runId` `0a6b631`). **Don't undo any of these.**

---

## 3. Architecture you now have (reuse this)

**Tab store = `App/src/shared/shell/OpenTabsContext.tsx`** (`OpenTabState { tab: WorkspaceTab, activeRightPaneMode, breadcrumb }`). `WorkspaceTab` (in `event-editor/workspace/types.ts`) includes kinds: project, run, claim, lab-entity, collection, splash, project-details, deck, pdf, document, record-create, record-edit, execution. `WorkspaceTabStrip` renders it; `tabPath(tab)` maps kind → route.

**The host-page pattern (COPY THIS for decks/executions):** each standalone surface = a route component that wraps its content in the workspace shell so the two-pane layout + tab strip + right pane + per-tab breadcrumb are preserved:
- `app/src/shared/shell/ArtifactHostPage.tsx` (pdf/document) — fetches the artifact to resolve `studyId`, wraps in `WorkspaceProvider` + `AppShell(layout=workspace, topbarTabs={<WorkspaceTabStrip/>}, viewerToolbar, leftPane=<viewer+provider>, rightPane={<RightPane/>})`.
- `app/src/shared/shell/RecordHostPage.tsx` (record-edit / record-create) — same shell wrapping `RecordEditPanel` / `RecordCreatePanel`.

**Breadcrumb:** seeded via the 3rd `openTab` arg (`seedBreadcrumb`), e.g. `{ label: projectTitle, entityType:'project', id: studyId, route:'/project/'+studyId }`. `DeckToolbar` renders `<TabBreadcrumb crumbs={tab.breadcrumb}/>` when present, else falls back to the 1:n `RunBreadcrumb`; the run/record title remains an editable `EditableTitle`.

---

## 4. What REMAINS (the next session's work)

### 4.1 Deck & Execution flatten (the missing piece) — highest priority
Decks and **executions** are STILL hidden per-study workspace sub-tabs (opened via `ws.openTab` and persisted in `workspace.yaml`). To complete "arbitrary content in any tab" and unblock the migration, they must become top-level tabs:
- Create a `DeckHostPage` (and/or `ExecutionHostPage`) mirroring `ArtifactHostPage`/`RecordHostPage`, wrapping the deck/execution viewer in the shell. NOTE: the deck viewer requires the **`EventEditorProvider`** wrapping (look at how `ProjectWorkspacePage` wraps `leftPane` for `kind:'deck'`/`'execution'` — `EventEditorProvider` + `FocusModalsProvider` + `ProtocolPreviewBridge`). This is the part the deferred worker kept stumbling on; get the provider skeleton right by copying `ProjectWorkspacePage`'s deck/execution branches.
- Add routes (`/deck/:eventGraphId` etc.) + `tabPath` cases.
- Convert the remaining `ws.openTab` deck/execution call-sites to open top-level tabs: `event-editor/topbar/DeckModeSwitcher.tsx` (its Plan/Execute buttons — NOTE: a previous broken worker edit was reverted; re-verify the file is the clean version), `right-pane/ai/RunInEventEditorButton.tsx` (scratch deck — no run context, fine), and `FindTabPanel.RunRow.attachProtocolMethod` (deck tab — leave until decks are flattened).
- Keep the `runId` binding on deck tabs (that's what shows the breadcrumb + Protocol right-pane).

### 4.2 Non-destructive `workspace.yaml` migration (Phase 2c)
`WorkspaceContext` (`event-editor/workspace/WorkspaceContext.tsx`) persists per-study `records/studies/<id>/workspace.yaml` with deck/pdf/document/execution sub-tabs.
- Goal: **additively rehydrate** those sub-tabs into top-level `OpenTabs` tabs when the workspace loads (so they appear in the strip), **without deleting/rewriting `workspace.yaml`** (data-loss risk). Preserve deck `eventGraphId`, `runId`, artifact ids, record ids, per-tab right-pane mode.
- Prefer a client-side rehydration on load over a destructive rewrite. Keep `WorkspaceContext` as the per-study persistence layer but read through the unified reducer.
- This is the risky piece — do it carefully with a fallback (empty unified store → re-read workspace.yaml).

### 4.3 Phase 3 — Browser polish
- **Per-tab back-stack:** add `history: AppTab[]` per tab + `back(tabId)`/`forward(tabId)` to `OpenTabsContext`; Back/Forward affordances in the toolbar (browser-style). Live in the existing viewer-toolbar slot — **no third pane**.
- **Open-in-same-tab vs new-tab:** agreed default = entity clicks open a **new tab**; **GlobalNavbar** destinations navigate the *current* tab (browser "type URL"). Implement via `navigateTab`.
- **Deep-link restore:** on app load with a URL that maps to a tab (e.g. `/runs/:id`), restore/create the tab + its breadcrumb so a refresh keeps the origin trail.
- **Same-entity dedup:** agreed — dedup `run`/`claim`/`lab-entity` by stable id (opening the same run focuses its existing tab), but allow multiple project-homepage/deck views of the same study.

### 4.4 Residual checks
- `SearchTabPanel`, `AiTabPanel` — verify their artifact/pdf opens now go to top-level tabs (they were converted in P2a; spot-check).
- `DeckModeSwitcher.tsx` — confirm it's the clean version (a broken worker reverted mid-session; `git status` should show it clean unless the concurrent agent touched it).
- Grep for any remaining `ws.openTab({ kind: 'record-create' | 'record-edit' })` and `kind: 'deck'`/`'execution'` that should be top-level.

---

## 5. Key files to know

| File | Role |
|------|------|
| `shared/shell/OpenTabsContext.tsx` | Top-level tab store (breadcrumb, navigateTab). |
| `shared/shell/WorkspaceTabStrip.tsx` | Strip + `tabPath()` route map. |
| `shared/shell/TabBreadcrumb.tsx` | Per-tab breadcrumb (current optional). |
| `shared/shell/ArtifactHostPage.tsx` | Artifact top-level host (pattern). |
| `shared/shell/RecordHostPage.tsx` | Record top-level host (pattern). |
| `event-editor/workspace/{types,WorkspaceContext,reducer}.ts` | Per-study workspace (decks/executions persist here; migration target). |
| `event-editor/viewer/deck/{DeckToolbar,RunBreadcrumb}.tsx` | Toolbar + breadcrumb. |
| `event-editor/projects/ProjectWorkspacePage.tsx` | Deck/execution provider-wrapping reference. |
| `event-editor/right-pane/find/FindTabPanel.tsx` | Main open-tab call-sites (mostly converted). |
| `App.tsx` | Routes (host pages + collection/workspace routes). |

## 6. Recommended order for the new session
1. `git status` + `git log --oneline -8` + `npm run typecheck` — confirm clean starting state (watch for the concurrent agent's `/ingestion` files).
2. Verify the current UI still behaves (open a project → click a run → two tabs + breadcrumb).
3. Implement **4.1** (deck/execution hosts + routes + tabPath + convert deck call-sites) — biggest piece.
4. Implement **4.2** (non-destructive migration) — carefully, after 4.1.
5. Implement **4.3** (back-stack + open-in-tab + deep-link).
6. Full `npm run typecheck` (app+server), targeted tests, and a live browser pass of the whole flow.

---

## Session status — completed by architect (2026-08-02, after a40e05b)

**Commits this session (both verified + committed on feat/ai-extension-api):**
- `650867f` — **Phase 4.1 deck flatten.** New `app/src/shared/shell/DeckHostPage.tsx`
  (`/deck/:eventGraphId/:runId?`) with the full ProjectWorkspacePage deck provider stack
  (EventEditorProvider keyed on `deckTabId(eventGraphId)` + FocusModalsProvider +
  ProtocolSelectionProvider + ProtocolPreviewBridge). Added `deckTabId()` to
  `workspace/types.ts`; `tabPath()` maps `deck` → `/deck/...`; lazy route in App.tsx;
  `FindTabPanel.RunRow.attachProtocolMethod` now opens the run's method deck as a
  TOP-LEVEL tab (seeded projectCrumb) + navigates instead of a hidden `ws.openTab` deck.
  CSS import pitfall fixed: from `shared/shell/` use `../../event-editor/viewer/viewer.css`
  + `../../event-editor/styles/eventEditor.css` (not `../viewer/...`).
- `55c1936` — **Phase 4.3 deep-link-restore slice.** ArtifactHostPage + RecordHostPage now
  register their top-level tab in OpenTabsContext ON MOUNT (mirroring DeckHostPage &
  RunWorkspacePage), so a refresh/deep link keeps the strip tab with the real title.

**Verified:** full `npm run typecheck` (app+server) clean; OpenTabsContext (14) + workspace
types (15) tests pass; live browser: deck opens as own top-level tab with breadcrumb, and
artifact deep-link shows a selected top-level tab with the real title. FindTabPanel's 11
failures are the PRE-EXISTING `getProtocolContext` mock gap (reproduced with change stashed).

**Remaining (deferred for a dedicated session with a clean/uncontested tree):**
- **4.2 workspace.yaml migration** — risky, touches records/studies/<id>/workspace.yaml that
  the concurrent /ingestion agent may be writing. Do additively with an empty-unified-store
  fallback. Prefer client-side rehydration on load over a destructive rewrite.
- **4.3 remainder** — per-tab back-stack (`history: AppTab[]` + back/forward in toolbar),
  GlobalNavbar navigate-current-tab via `navigateTab`, and confirming same-entity dedup
  (mostly already handled by stable tab ids: `run:${id}`, `claim:${id}`, `lab:${id}`).
  Needs the user's confirmation of the interaction model before building.
- **ExecutionHostPage** — NOT started; no call-site opens an `execution` tab (the handoff's
  "Plan/Execute buttons" don't exist in the clean DeckModeSwitcher). Build only once a
  call-site actually creates execution tabs.
