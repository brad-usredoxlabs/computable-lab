# Persistent Tab Collection on Every Surface (Fix missing tab strips)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task (fresh subagent per task, two-stage review).

**Goal:** Fix the regression where opening a protocol (or claim) in a tab renders the content in a window with **zero tabs**, and guarantee the tab collection is present on EVERY appliance surface — because this app runs as an appliance with no browser, and tabs are the browser-tab replacement. The user's tab set must be reachable from anywhere.

**Architecture:** The regression is a UI-shell bug, not a tab-data bug: the open-tabs state is fine, but two detail surfaces render `AppShell` with `topbarTabs={<div />}` (an empty slot), so the `WorkspaceTabStrip` never mounts on those routes. Fix by making the tab strip present everywhere it can be: correct the two empty-slot surfaces and (per the user's "every surface") make `AppShell` default the workspace tab strip rather than leaving it to each caller.

**Tech Stack:** React 18, react-router 6, existing `AppShell` + `WorkspaceTabStrip` + `OpenTabsContext`.

---

## Current Context (verified 2026-08-05)

- **Root cause of "zero tabs":** `app/src/lab/LabEntityWorkspace.tsx:103-109` renders
  ```tsx
  <AppShell brand="Lab" layout="workspace" topbarTabs={<div />} leftPane={...} />
  ```
  `topbarTabs={<div />}` puts an EMPTY node into `AppShell`'s `.topbar__tabs` (line 117), so no tab strip appears. This is the `/lab/:category/:entityId` protocol detail view → "open protocol → tabs disappear."
- **Same defect in claims:** `app/src/claims/ClaimWorkspace.tsx:107-113` renders `topbarTabs={<div />}`.
- **Sibling-but-present surfaces use the correct strip:** `LabCollectionView:435`, `RunCollectionView:241`, `ProjectCollectionView:206`, `ClaimCollectionView:176`, `RunWorkspaceShell:22`, `ProjectWorkspacePage:195`, `DeckHostPage:131`, `ArtifactHostPage:114`, `RecordHostPage:105`, `SplashRoute:10`, `IngestionPage:33`, `ExtractionReviewPage:48`, `ExtractionDraftsListPage:46` — all `topbarTabs={<WorkspaceTabStrip />}`.
- **Legacy strip on two old surfaces:** `WelcomePage:42` and `CreateStudyPage:37` use `topbarTabs={<ProjectTabStrip />}` (the old study-only system), not the unified `WorkspaceTabStrip`.
- **`AppShell` (app/src/shared/shell/AppShell.tsx):** in `layout="workspace"` it renders `<GlobalNavbar />` + `<div className="topbar__tabs">{topbarTabs}</div>` (lines 109-118). `topbarTabs` is undefined by default — callers must opt in. Per the appliance requirement (tabs are the browser replacement), the workspace layout should **default** the tab strip to `<WorkspaceTabStrip />` rather than rely on every caller to remember.
- **`WorkspaceTabStrip` requires `OpenTabsProvider`** at the root (it calls `useOpenTabs`). Confirmed mounted once at `App.tsx` root wrapping `BrowserRouter` (per the architecture skill) — so any surface under the router can render the strip. The bug is purely that these two surfaces pass `topbarTabs={<div />}` instead of omitting it (so the default can apply) or passing the strip.

---

## Proposed Approach

Make the tab collection **default-on** for the workspace layout, and fix the two surfaces that explicitly blank it. This satisfies "every surface should display the tab collection" without requiring every future caller to remember to pass the strip.

1. **AppShell default:** when `layout="workspace"` and `topbarTabs` is not provided, render `<WorkspaceTabStrip />` by default. (Surfaces can still override.)
2. **Fix the two blanking surfaces:** `LabEntityWorkspace` and `ClaimWorkspace` stop passing `topbarTabs={<div />}` (omit it → default applies).
3. **Migrate the two legacy surfaces** (`WelcomePage`, `CreateStudyPage`) from `ProjectTabStrip` to `WorkspaceTabStrip` so the unified tab set shows there too (these are appliance landing/entry surfaces).

---

## Phase 1 — AppShell defaults the workspace tab strip

### Task 1.1: Default `topbarTabs` to WorkspaceTabStrip in workspace layout

**Objective:** Any `AppShell layout="workspace"` without an explicit `topbarTabs` renders the full tab collection, so the appliance always shows the user's tabs.

**Files:**
- Modify: `app/src/shared/shell/AppShell.tsx` (twiddle `topbarTabs` default)
- Test: `app/src/shared/shell/AppShell.test.tsx` (add cases)

**Step 1 — failing test (RED):**
```tsx
it('workspace layout defaults to the unified tab strip when none is passed', () => {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <OpenTabsProvider>
          <AppShell brand="X" layout="workspace" leftPane={<div />} />
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  expect(screen.getByTestId('workspace-tab-strip')).toBeDefined()
})

it('workspace layout respects an explicit topbarTabs override', () => {
  render(
    <MemoryRouter>
      <ThemeProvider><OpenTabsProvider>
        <AppShell brand="X" layout="workspace" topbarTabs={<div data-testid="custom" />} leftPane={<div />} />
      </OpenTabsProvider></ThemeProvider>
    </MemoryRouter>,
  )
  expect(screen.getByTestId('custom')).toBeDefined()
  expect(screen.queryByTestId('workspace-tab-strip')).toBeNull()
})
```
Import `WorkspaceTabStrip` in the test. Existing `AppShell.test.tsx:106` asserts `topbarMiddle`/`topbarRight` are dropped in workspace — keep those.

**Step 2 — run test, expect FAIL** (no strip by default today).

**Step 3 — implement:**
```tsx
// AppShell.tsx — near destructuring, compute an effective tabs slot.
const workspaceLayout = layout === 'workspace' && !bare
// ... in the workspace header:
<div className="topbar__tabs">{topbarTabs ?? <WorkspaceTabStrip />}</div>
```
Add `import { WorkspaceTabStrip } from './WorkspaceTabStrip'` at the top of AppShell.tsx. Because `Layout="workspace"` pages that already pass `WorkspaceTabStrip` are unaffected (explicit override wins).

**Step 4 — run test, expect PASS.**

**Verification:** `cd app && npx vitest run src/shared/shell/AppShell.test.tsx`; `cd app && npx tsc --noEmit`.

---

## Phase 2 — Remove the blanking `topbarTabs={<div />}` on detail surfaces

### Task 2.1: Protocol / lab detail shows the tab strip

**Objective:** Opening a protocol in a tab keeps the tab collection visible (the reported bug).

**Files:**
- Modify: `app/src/lab/LabEntityWorkspace.tsx` (remove `topbarTabs={<div />}`)
- Test: `app/src/lab/LabEntityWorkspace.test.tsx`

**Step 1 — failing test (RED):** in `LabEntityWorkspace.test.tsx` `renderProtocolRoute()`, after the protocol resolves, assert:
```tsx
expect(await screen.findByTestId('workspace-tab-strip')).toBeDefined()
```
Update the test's provider wrapper to include `OpenTabsProvider` (it already wraps `ThemeProvider` + `OpenTabsProvider`? — ensure the strip's `useOpenTabs` is satisfied; if the test renders LabEntityWorkspace bare, wrap `MemoryRouter > ThemeProvider > OpenTabsProvider > LabEntityWorkspace`).

**Step 2 — run test, expect FAIL** (strip absent today).

**Step 3 — implement:** change line 106 from `topbarTabs={<div />}` to drop the prop entirely (the Phase-1 default supplies `WorkspaceTabStrip`):
```tsx
return (
  <AppShell
    brand="Lab"
    layout="workspace"
    leftPane={workspaceContent}
  />
)
```
No new import needed — relies on the AppShell default. (Alternatively pass `<WorkspaceTabStrip />` explicitly; preferring the default keeps DRY.)

**Step 4 — run test, expect PASS.**

**Verification:** `cd app && npx vitest run src/lab/LabEntityWorkspace.test.tsx`; browser: `/lab/protocols/:id` shows the tab strip with the protocol tab active.

### Task 2.2: Claim detail shows the tab strip

**Objective:** Opening a claim keeps the tab collection visible.

**Files:**
- Modify: `app/src/claims/ClaimWorkspace.tsx` (remove `topbarTabs={<div />}`)
- Test: `app/src/claims/ClaimWorkspace.test.tsx` (or add one)

**Step 1 — failing test (RED):** render ClaimWorkspace with an `OpenTabsProvider` and assert the strip testid appears.
**Step 2 — run, expect FAIL.**
**Step 3 — implement:** drop `topbarTabs={<div />}` from `<AppShell brand="Claim" layout="workspace" ...>`.
**Step 4 — run, expect PASS.**

**Verification:** `cd app && npx vitest run src/claims/`; browser `/claims/:claimId` shows tabs.

---

## Phase 3 — Migrate legacy ProjectTabStrip surfaces to WorkspaceTabStrip

### Task 3.1: Welcome page uses the unified tab strip

**Files:**
- Modify: `app/src/welcome/WelcomePage.tsx` (line 42 `ProjectTabStrip` → `WorkspaceTabStrip`)
- Test: `app/src/welcome/WelcomePage.test.tsx` (update assertion if it references `ProjectTabStrip`)

**Implement:** swap the import + the prop. Confirm the strip's provider is reachable (root `OpenTabsProvider` already wraps `/`).

**Verification:** `cd app && npx vitest run src/welcome/`; typecheck.

### Task 3.2: Create-study page uses the unified tab strip

**Files:**
- Modify: `app/src/welcome/CreateStudyPage.tsx` (line 37)
- Test: `app/src/welcome/CreateStudyPage.test.tsx` if present

**Implement:** swap `ProjectTabStrip` → `WorkspaceTabStrip`.

**Verification:** `cd app && npx vitest run src/welcome/`; typecheck.

> Note: `ProjectTabStrip` may become unused after both swaps — check `search_files` and remove the file only if truly orphaned (verify no other importer). Do NOT remove if any route still uses it.

---

## Files Likely to Change

- `app/src/shared/shell/AppShell.tsx` (default tab strip in workspace layout)
- `app/src/shared/shell/AppShell.test.tsx`
- `app/src/lab/LabEntityWorkspace.tsx` (+ `.test.tsx`)
- `app/src/claims/ClaimWorkspace.tsx` (+ test)
- `app/src/welcome/WelcomePage.tsx`
- `app/src/welcome/CreateStudyPage.tsx`
- Possibly `app/src/shared/shell/ProjectTabStrip.tsx` (remove if orphaned)

## Tests / Validation

- **Unit:** AppShell default-tabs test; per-surface strip-presence tests for Lab/Claim/Welcome/CreateStudy.
- **App typecheck:** `cd app && npx tsc --noEmit`.
- **Affected suites:** `cd app && npx vitest run src/shared/shell src/lab src/claims src/welcome`.
- **Browser (appliance) checklist — every surface shows tabs:**
  1. New session → splash (tabs visible) → open a **protocol** → protocol detail still shows the SAME tab collection (protocol tab present, tabs never disappear). ✅ the reported bug.
  2. Open a **claim** → claim detail shows tabs.
  3. `/lab/:category`, `/runs`, `/projects`, `/claims` collections → tabs remain.
  4. Run workspace, project workspace, deck/artifact/record hosts, splash → tabs remain.
  5. `WelcomePage` (`/`) and `CreateStudyPage` now show the unified strip.

## Risks / Tradeoffs / Open Questions

- **AppShell default could surprise callers that intentionally blank tabs.** Currently only `LabEntityWorkspace` and `ClaimWorkspace` do that, and both are the surfaces we want to FIX — so defaulting is aligned. Grep for any other `topbarTabs={<div />}` / `topbarTabs={null}` before merging; if a surface intentionally hides tabs (e.g. a bare wizard), it can pass `topbarTabs={<div />}` explicitly to opt out.
- **Stability on stacked layout:** the default only applies to `layout="workspace"` (not `stacked` / legacy `/protocols` route), preserving non-workspace behavior.
- **Test provider wiring:** `WorkspaceTabStrip` needs `OpenTabsProvider`; any test rendering a surface that now shows tabs must wrap accordingly (existing tests for these surfaces already wrap `ThemeProvider` + `OpenTabsProvider` per repo pattern — verify each).
- **Open:** whether to also default `topbarTabs` for the `stacked` layout (likely NO — leave legacy routes as-is).
- **Open:** removing `ProjectTabStrip` if orphaned — do it only after both Welcome + CreateStudy are migrated and no other importer remains.

## Execution Handoff

Plan complete and saved. Ready to execute using subagent-driven-development — dispatch a fresh subagent per task with two-stage review. Recommend Phase 1 + Task 2.1 first (the reported protocol bug), verify in-browser, then claims + legacy surfaces. Shall I proceed?
