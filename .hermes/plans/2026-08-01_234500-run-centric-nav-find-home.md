# Run-Centric Nav: Find-Moved-to-Project-Home + Breadcrumb Restore

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Three coupled changes to make navigation run-centric instead of project-centric-when-in-a-run:
1. Make the contents of the right-pane **Find** tab become the **project homepage** (replacing the record-oriented `ProjectDetailsView` landing).
2. **Eliminate the Find tab** from the right pane (it's project-scoped and wrong to show while viewing a run).
3. **Restore the two-part run breadcrumb** — `[Project Name] › [Run Name (editable)]` — in the run workspace, showing the run's *real* title, editable and persisted.

**Architecture:** Verified live and in code:
- `app/src/event-editor/right-pane/RightPane.tsx` renders tabs `AI · Find · Search · Details · Protocol`; `find` → `<FindTabPanel/>` (project-scoped: Experiments→runs tree + Labwares/Materials inventory + Artifacts).
- `app/src/event-editor/right-pane/find/FindTabPanel.tsx` is the Find content (rewrites on the `useProjectInventory`/`useStudyArtifacts`/`getStudyTree` hooks).
- `app/src/event-editor/projects/ProjectWorkspacePage.tsx` `LeftPane` renders `project-details` → `<ProjectDetailsView/>` (the current homepage, record-oriented). We replace this with the Find content so the project homepage = Find contents.
- `app/src/run/RunWorkspacePage.tsx` builds `deckTab` with a **hardcoded title `` `Run ${runId}` ``** and does **not** auto-switch the right pane — so a run shows the project-scoped Find tab selected and an id-based run name. The two-part breadcrumb already exists via `DeckToolbar` (`RunBreadcrumb` project link + `EditableTitle` run name) but shows the wrong run title.
- Right-pane default mode is `'find'` (`event-editor/workspace/types.ts` `defaultWorkspaceState` rightPaneMode, and `shared/shell/OpenTabsContext.tsx` `defaultRightPaneMode` for project/lab-entity). `ProjectWorkspacePage` auto-switches to `'protocol'` for a deck+run tab; `RunWorkspacePage` does not.
- `WorkspaceRightPaneMode = 'ai' | 'search' | 'find' | 'details' | 'protocol'`. `'find'` may be persisted (`workspace.yaml`) and is referenced in tests.

**Non-negotiable project conventions:** TS `exactOptionalPropertyTypes` (never set optional fields to `undefined`; conditional-spread or omit). Do not restart the running app/server (they hot-reload). Commit only the phase's own files.

---

## Phase A — Run breadcrumb restore + run-centric right-pane default (Parts 3 + run-side of 2)

Goal: `/runs/:runId` shows `[Project Name] › [Real Run Name (editable)]` and the right pane defaults to something run-appropriate (not project Find).

### Task A.1 — Load the run's real title for the deck tab (fixes the breadcrumb name)
**Files:** `app/src/run/RunWorkspacePage.tsx`

The `useEffect` that resolves the run (around line 42) already calls `apiClient.getRecord(runId)` and reads `payload.studyId` + `payload.methodEventGraphId`. Add a `title` state and read `payload.title`. Use it for:
- the `openTabs.openTab(...)` on mount (currently `title: \`Run ${runId}\``),
- the `deckTab` object (currently `title: \`Run ${runId}\``),
- fallback to `` `Run ${runId}` `` when the record has no title.

```tsx
const [runTitle, setRunTitle] = useState<string | null>(null)
// inside the getRecord().then: setRunTitle(typeof payload.title === 'string' && payload.title ? payload.title : null)
const title = runTitle ?? `Run ${runId}`
```
Use `title` wherever the deck tab title and the open-tab title are built (both currently `` `Run ${runId}` ``). The `EditableTitle` in `DeckToolbar` then shows the real run name and commits renames via `apiClient.updateRecord` (already implemented there).

### Task A.2 — Auto-switch right pane to Protocol on a run deck (mirror ProjectWorkspacePage)
**Files:** `app/src/run/RunWorkspacePage.tsx`

`ProjectWorkspacePage` (lines ~139-158) auto-switches the right pane to `protocol` when the active tab is a `deck` with `runId`. Add the equivalent in `RunWorkspacePage`: since the whole page is a single run deck, on mount (when `ws.ready`) set `ws.setRightPaneMode('protocol')` once (guard with a ref so the user's manual choice is respected). Import `useWorkspace` if not already available (the shell already wraps in `WorkspaceProvider`).

### Task A.3 — Update affected tests
**Files:** `app/src/event-editor/workspace/reducer.test.ts` , `app/src/event-editor/workspace/WorkspaceContext.test.tsx`, `app/src/shared/shell/OpenTabsContext.test.ts`, `app/src/event-editor/right-pane/RightPane.test.tsx` (only where they hard-assert the `find` default or the Find tab — see Phase B for the tab-removal test updates; here only fix regressions caused by A where clearly attributable).

**Verify (run these yourself):**
1. `cd /home/brad/git/computable-lab && npm run typecheck -w app`
2. Browser `http://localhost:5174/runs/RUN-friday-morning-run-npmq` → toolbar reads `Brad's Project › Friday Morning Run` (real title), the right-pane Protocol tab is selected, and renaming (click title, type, Enter) persists to the run record.
3. `cd app && npx vitest run src/run src/event-editor/right-pane/RightPane.test.tsx` (targeted).

**Acceptance:** real run title in the breadcrumb + tab; right pane defaults to Protocol on a run deck; name edit persists.

---

## Phase B — Eliminate the Find tab from the right pane (Part 2)

Goal: the right pane no longer offers the project-scoped Find tab; stale persisted `find` migrates to a sensible default.

### Task B.1 — Remove the Find tab + normalise stale mode
**Files:** `app/src/event-editor/right-pane/RightPane.tsx`

- Remove `{ mode: 'find', label: 'Find' }` from the `TABS` array (line 31).
- Remove the `{ active === 'find' ? <FindTabPanel /> : null }` render and the `FindTabPanel` import.
- Normalize the active mode so a persisted `ws.state.rightPaneMode === 'find'` does not leave an empty body:
```tsx
const active = ws.state.rightPaneMode === 'find' ? 'ai' : ws.state.rightPaneMode
```
(then use `active` for tab matching + body dispatch — the `find` case in the body is gone.)

### Task B.2 — Change the default right-pane mode from `find` to `ai`
**Files:** `app/src/event-editor/workspace/types.ts` (`defaultWorkspaceState` line ~251 `rightPaneMode: 'find'`), `app/src/shared/shell/OpenTabsContext.tsx` (`defaultRightPaneMode` — change the `project` / `lab-entity` cases that return `'find'` to `'ai'`).

Keep `'find'` in the `WorkspaceRightPaneMode` union type for backward-compat with persisted `workspace.yaml` (server parse) — the type member stays; it is just no longer surfaced as a tab. Add a code comment marking `'find'` as legacy/pre-migration.

### Task B.3 — Update tests that assert the Find tab / find default
**Files:** `app/src/event-editor/right-pane/RightPane.test.tsx` (remove/update assertions that the Find tab renders and that clicking it switches mode), `app/src/event-editor/workspace/reducer.test.ts`, `app/src/event-editor/workspace/WorkspaceContext.test.tsx`, `app/src/shared/shell/OpenTabsContext.test.ts` (change `'find'` default assertions to `'ai'`; the persisted-`'find'` test should now assert the rendered fallback is `ai` in RightPane). Update to the new reality; do not weaken unrelated coverage.

**Verify:**
1. `npm run typecheck -w app`
2. `npx vitest run src/event-editor/right-pane src/event-editor/workspace src/shared/shell/OpenTabsContext.test.ts`
3. Browser: open a project (right pane shows AI · Search · Details · Protocol — no Find) and a run (no Find; Protocol or AI selected).

**Acceptance:** Find tab gone from right pane; no empty right-pane body for persisted `find`; defaults are `ai`.

---

## Phase C — Find content becomes the project homepage (Part 1)

Goal: opening a project's landing (the `project-details` tab) shows the Find contents (Experiments→runs tree + inventory + artifacts), not the record-oriented `ProjectDetailsView`.

### Task C.1 — Render Find content as the project homepage
**Files:** `app/src/event-editor/projects/ProjectWorkspacePage.tsx`

In `LeftPane`, change the `project-details` branch (line ~273) from `<ProjectDetailsView studyId={studyId} />` to a full-width rendering of the Find content. Reuse `FindTabPanel` directly (it is now not rendered in the right rail after Phase B), wrapped so it lays out full-width:
```tsx
if (activeTab.kind === 'project-details') {
  return (
    <div className="project-home" data-testid="project-home">
      <FindTabPanel />
    </div>
  )
}
```
Add a `.project-home` rule (in `ProjectWorkspacePage.css`) that lets the find content use the full left-pane width (e.g., `height:100%; overflow-y:auto; padding:20px 28px;`). Because `FindTabPanel` reads `useOptionalEventEditor()`, in the `project-details` context that provider is not mounted → returns null → live deck items are simply omitted (correct).

Remove the now-unused `ProjectDetailsView` import from `ProjectWorkspacePage.tsx`.

### Task C.2 — Retire the old record-oriented homepage
**Files:** `app/src/event-editor/projects/ProjectDetailsView.tsx` (+ `.css`)

`ProjectDetailsView` becomes dead code once C.1 lands (no other importer — verify with a grep). Delete it and its CSS. If anything else imports it, redirect that importer to the homepage instead. (Confirm importers first; the plan expects only `ProjectWorkspacePage`.)

### Task C.3 — Update tests
**Files:** raise/direct any tests referencing `ProjectDetailsView` (e.g. `ProjectDetailsView.test.tsx`) to assert the homepage renders the find content / `project-home`. If the file is deleted, delete its test too (or repoint it). Add a light assertion that a `project-details` tab renders the find tree/inventory sections ("Experiments", "Artifacts").

**Verify:**
1. `grep -rn ProjectDetailsView app/src` → no remaining imports.
2. `npm run typecheck -w app`
3. `npx vitest run src/event-editor/projects`
4. Browser: open a project whose workspace has no tabs (or a fresh one) → the project landings shows the Experiments tree + Labwares/Materials inventory + Artifacts in the main window, right pane has no Find; the `RunBreadcrumb` "back to project" still lands on it.

**Acceptance:** project homepage = Find content; `ProjectDetailsView` no longer used; right pane absent of Find.

---

## Files changed (summary)

| File | Action | Phase |
|------|--------|-------|
| `app/src/run/RunWorkspacePage.tsx` | Modify — real run title; auto-switch right pane to protocol | A |
| `app/src/event-editor/right-pane/RightPane.tsx` | Modify — remove Find tab; normalize stale `find`→`ai` | B |
| `app/src/event-editor/workspace/types.ts` | Modify — default rightPaneMode `find`→`ai` (keep `'find'` in union, legacy) | B |
| `app/src/shared/shell/OpenTabsContext.tsx` | Modify — `defaultRightPaneMode` `find`→`ai` for project/lab-entity | B |
| `app/src/event-editor/projects/ProjectWorkspacePage.tsx` | Modify — project-details renders Find content as homepage | C |
| `app/src/event-editor/projects/ProjectDetailsView.tsx` (+css) | Delete — retired (verify no importers) | C |
| Tests (RightPane, reducer, WorkspaceContext, OpenTabsContext, ProjectDetailsView, projects) | Modify/Delete | A/B/C |

## Risks / decisions
1. **`find` mode in the data model**: we keep `'find'` in the union + server parse for backward compat but never surface it as a tab and stop defaulting to it; a later cleanup can remove it + add a server-side `find`→`ai` migration. This avoids cross-layer (server `workspace/types.ts`) changes now.
2. **Homepage = promote FindTabPanel**: reusing the existing component guarantees identical content to today's Find, at the cost of a right-rail→full-width layout adjustment (the `.project-home` wrapper). If the Find panel's right-rail-specific CSS fights the layout, add a `surface`/`embedded` class to `FindTabPanel` for the home mode rather than fighting selectors with overrides.
3. **Deleting `ProjectDetailsView`**: only after verifying zero importers; otherwise repoint them first.
4. **ProjectDetailsView overlaps FindTabPanel**: both already contained experiments/runs/artifacts; the promoted Find homepage additionally brings the Labwares/Materials inventory, so nothing is lost.
