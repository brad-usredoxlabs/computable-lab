# Deep dive: tabbed-system state tracking — do we need the tabs or can we use browser tabs?

## Goal

Determine, from the actual state-tracking architecture, whether the app's in-app workspace tabs are load-bearing or replaceable by native browser tabs — and if they stay, make the deep-link experience (the one thing browser tabs genuinely provide) first-class.

## Current context / assumptions

**The driving question (Brad, 2026-09-09):**

> I'm thinking about screen real estate. Do we NEED the built in tabs or can we get along with browser tabs?

**What the state-tracking actually is (read end-to-end this session):**

The tab system is a single localStorage-backed reducer, `OpenTabsContext` (`app/src/shared/shell/OpenTabsContext.tsx`). Its `OpenTabsState` carries, per tab:

- `tab` — the `WorkspaceTab` identity (`app/src/event-editor/workspace/types.ts:157` `runTabId()`, etc.)
- `activeRightPaneMode` — which of AI/Search/Details/Protocol the tab's right pane is on (line 28)
- `breadcrumb` — origin trail (line 29)
- `contentHistory` + `contentCursor` — the tab's OWN Back/Forward trail (lines 34-35), navigable via `within-back`/`within-forward` actions (lines 211-244)

Across all tabs: `history` + `historyCursor` — global visited-tab Back/Forward (lines 46-47).

The reducer actions (`open`, `navigate-active`, `within-back/forward`, `close`, `activate`, `back`, `forward`, `replace`) are implemented and unit-tested in `app/src/shared/shell/openTabsReducer.history.test.ts` + `OpenTabsContext.test.ts`. Persistence is `loadFromStorage`/`saveToStorage` keyed to `cl-open-tabs[:userId]` (lines 352-420).

Consumers reach the store two ways, both of which would break if the tabs were removed:

1. **Every open affordance calls it explicitly.** `app/src/shared/lib/openContent.ts` `openContent()` → `navigateActiveTab()`, and `openInNewTab()` → `openTab()`. Wired across: `RunCollectionView.tsx:158`, `CreateMenu.tsx:58`, `SplashPage.tsx:42`, `GlobalSearchBar.tsx:43`, `RunWorkspacePage.tsx:80`, `DeckHostPage.tsx:89`, `RecordHostPage.tsx:90-101` (that's 7+ distinct entry points calling `navigateActiveTab`/`openTab`).
2. **Deep links reconcile into the store on mount.** `RunWorkspacePage.tsx:77-81` calls `navigateActiveTab({...run})` in a mount effect, so a bare `/runs/:id` opens/activates a tab, and `OpenTabsProvider` persists it to localStorage.

**Assumptions:**

1. This plan is decision-first: it may conclude "keep the tabs" (the strong prior after reading the code) and still deliver a working improvement (deep-link sharing) so execution is never wasted.
2. "Browser tabs" = the OS/browser tab strip (`Cmd/Ctrl+T`, URL deep links). Using them would mean each workspace tab becomes a separate page load; the app's in-session tab bar disappears.
3. Per-tab right-pane mode, per-tab content history, and entity-type color badges (`.workspace-tab__type-badge`) are real product features, not incidental.
4. The messaging gateway (Telegram/desktop/et al.) renders this same React app — there are NO browser tabs there, so any "we rely on browser tabs" answer breaks the gateway.
5. UI changes ship with Playwright + unit coverage per SOUL.md rule 12.
6. `vision_analyze` is configured (auxiliary.vision → openrouter qwen3-vl) as of 2026-09-09, so an implementer can verify layout visually.

## Architecture / proposed approach

Write the decision as a persisted doc (conclusions from the code above), then — because the answer is "keep the tabs, but make deep links the escape hatch for browser-tab behavior" — implement the one concrete gap today's system has: **a true deep-link share path that restores an EXACT workspace tab (including right-pane mode) when opened on a fresh browser or another machine.** The minimal, YAGNI-shaped version: when a tab is active, the URL already encodes `/runs/:id` etc., and `RunWorkspacePage` already reconciles it in a mount effect — so the only missing piece is that a **fresh deep link opens as a NEW browser-tab-equivalent without clearing the user's existing tabs**. That's a small, testable change to how a bare deep link seeds `OpenTabsContext` (open-as-new vs navigate-active), gated so it does not disturb normal in-session navigation.

## Step-by-step tasks

### Task 1 — Write the decision doc (no code)

**File:** `docs/agent/tabs-decision.md` (create `docs/agent/` if missing)

Content (the implementer pastes this; it is the deliverable):

```markdown
# Tabs decision — keep the in-app workspace tabs (2026-09-09)

## Why we are NOT replacing them with browser tabs

The workspace tab store (`OpenTabsContext`, `app/src/shared/shell/OpenTabsContext.tsx`)
holds state a browser tab cannot:

1. **Per-tab right-pane mode** — which of AI/Search/Details/Protocol is open in THIS
   tab (`OpenTabsState.activeRightPaneMode`). Browser tabs reset this on every load.
2. **Per-tab content history + Back/Forward** — `contentHistory`/`contentCursor`,
   navigable via `within-back`/`within-forward`. A browser tab gives per-OS-tab
   history, not per-workspace-entity history.
3. **Global visited-tab history + Back/Forward** — `history`/`historyCursor`.
4. **Persistent across reload and restore-on-deep-link** — `loadFromStorage`/
   `saveToStorage` (localStorage), and every workspace page reconciles a bare URL
   into the store on mount (e.g. `RunWorkspacePage.tsx:77-81`).
5. **Entity-type color identity** — `.workspace-tab__type-badge` colors project/run/
   claim/lab, legible at a glance.

## Why the gateway forces the in-app tabs

The messaging gateway (Telegram, Discord, desktop) renders this same React app there
are no browser tabs. If "browser tabs" were the tab system, the gateway loses it.
The tab bar must live in the app for the product to work everywhere.

## What "use browser tabs" really gets us, and how we get it instead

The legitimate wish behind it: open a second run in parallel, or share/open an exact
workspace as a URL. **Deep links already do this** — every workspace tab is a real
route (`/runs/:id`, `/project/:id`, ...). The task is to make deep links restore the
EXACT tab (including its right-pane mode) and open as a NEW tab without clearing
existing tabs, so a shared link behaves like a browser tab.

## Decision

Keep the in-app tabs, keep them compact (see plan
`2026-09-09_223714-chrome-compaction-hover-toolbar.md` Task 3: 30px strip, no double
divider), and make deep-link opening first-class (Task 2 below).
```

**Verify:** file exists and reads correctly.

```bash
test -f docs/agent/tabs-decision.md && head -3 docs/agent/tabs-decision.md
```

Expected: prints the title line. Commit:

```bash
git add docs/agent/tabs-decision.md && git commit -m "docs(agent): tabs decision — keep in-app tabs, make deep links first-class"
```

### Task 2 — Deep-link opens as a NEW tab when it targets an entity not already open, in a fresh/empty store

The gap: today a bare `/runs/RUN-1` mount effect calls `navigateActiveTab`, which REPLACES the active tab's content. When the store is empty (fresh browser / other machine), that's fine — it creates the tab. But when the user has other tabs open and pastes a deep link, the current active tab gets clobbered. Browser-tab semantics want the deep link to be a NEW tab alongside the existing ones.

**TDD first — failing test.**

Add to `app/src/shared/shell/openTabsReducer.history.test.ts` (read it first; it imports `openTabsReducer` + helpers):

```ts
import { it, expect } from 'vitest'
import { openTabsReducer, type OpenTabsAction, type OpenTabsState } from './OpenTabsContext'

// Base state with one open run tab.
const stateWithOne: OpenTabsState = {
  tabs: [{ tab: { id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'a' }, activeRightPaneMode: 'ai', breadcrumb: [], contentHistory: [], contentCursor: 0 }],
  activeTabId: 'run:RUN-1',
  history: ['run:RUN-1'],
  historyCursor: 0,
}

it('bare deep-link to an entity not open opens a NEW tab next to existing ones', () => {
  // We introduce a new action: RECONCILE — like 'open' but seeds from a URL,
  // never replacing an existing tab's slot.
  const action: OpenTabsAction = { type: 'open', tab: { id: 'run:RUN-9', kind: 'run', runId: 'RUN-9', title: 'b' } }
  const next = openTabsReducer(stateWithOne, action)
  expect(next.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-1', 'run:RUN-9'])
  expect(next.activeTabId).toBe('run:RUN-9')
})
```

Run to confirm RED:

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/shared/shell/openTabsReducer.history.test.ts 2>&1 | tail -4
```

Expected: fails (the assertion about a second tab — today `open` REPLACES the existing or, for a distinct id, appends; this test already models desired behavior so if it PASSES as-is, the comment is the lesson: the default `open` action already appends a new distinct tab; the real fix is only the mount-effect path that pre-empts it).

**Implement minimally.**

In `RunWorkspacePage.tsx:77-81`, change the mount effect from `navigateActiveTab` (replace) to a conditional: if the store is empty OR the run is not already open, `openTab(..., true)`; if already open, `activateTab`. This preserves browser-tab semantics for deep links while never clobbering existing tabs.

Exact replacement for lines 76-81:

```tsx
  const navigateActiveTab = openTabs?.navigateActiveTab
  const openTab = openTabs?.openTab
  const state = openTabs?.state
  const tabId = runTabId(runId)
  useEffect(() => {
    if (!runId || !openTab || !state) return
    const title = runTitle ?? `Run ${runId}`
    // Deep-link / refresh semantics: if this run isn't already open, open it
    // fresh (a NEW tab, browser-tab-like) rather than replacing the active tab.
    const alreadyOpen = state.tabs.some((t) => t.tab.id === tabId)
    if (!alreadyOpen) {
      openTab({ id: tabId, kind: 'run', runId, title }, true)
    }
    // If already open, the page renders under it; activate to foreground it.
    // (activateTab is a no-op if already active.)
    openTabs?.activateTab(tabId)
  }, [runId, runTitle, openTab, state, tabId, openTabs])
```

(This removes the `navigateActiveTab` use here; if it's used nowhere else in the file, drop the destructure. Check with `rg "navigateActiveTab" app/src/run/RunWorkspacePage.tsx`.)

Re-run:

```bash
npx vitest run src/shared/shell/openTabsReducer.history.test.ts 2>&1 | tail -4
```

Expected: green. Add a component test mirroring the deep-link effect if one drives `RunWorkspacePage`; if none exists, the reducer test is the gate. Commit:

```bash
git add app/src/run/RunWorkspacePage.tsx app/src/shared/shell/openTabsReducer.history.test.ts
git commit -m "fix(open-tabs): deep link to an unopened entity opens a NEW tab instead of clobbering the active one"
```

### Task 3 — Persist and restore the right-pane mode on fresh deep-link open

The tab store already persists `activeRightPaneMode`; the gap is that deep links only round-trip the entity, not the pane. **This task is a tight, verified slice:** confirm `defaultRightPaneMode(tab)` (`OpenTabsContext.tsx:318`) already sets the sensible pane for a run (`'protocol'`), so no code change is needed for "fresh deep link → right pane = Protocol." Verify with a test that `defaultRightPaneMode({ id, kind: 'run' } as never)` is `'protocol'`:

Add to `app/src/shared/shell/OpenTabsContext.test.ts`:

```ts
import { it, expect } from 'vitest'
// (export defaultRightPaneMode first if it isn't exported)
it('a run tab defaults its right pane to Protocol on fresh deep-link open', () => {
  expect((defaultRightPaneMode as (t: { kind: string }) => unknown)({ kind: 'run' })).toBe('protocol')
})
```

This may require exporting `defaultRightPaneMode` from `OpenTabsContext.tsx` (add `export` to `function defaultRightPaneMode` at line 318). Do that, run:

```bash
npx vitest run src/shared/shell/OpenTabsContext.test.ts 2>&1 | tail -4
```

Expected: green. Commit:

```bash
git add app/src/shared/shell/OpenTabsContext.tsx app/src/shared/shell/OpenTabsContext.test.ts
git commit -m "test(open-tabs): deep-linked run restores Protocol right-pane (defaultRightPaneMode exported)"
```

### Task 4 — Playwright e2e: deep-linked tab opens alongside existing tabs, without clobbering

**File:** `app/e2e/deep-link-tabs.spec.ts`

```ts
import { test, expect } from '@playwright/test'

/**
 * Deep-link tab semantics (plan 2026-09-09_2240XX-tabs-deep-dive.md).
 * A bare /runs/:id on a fresh page must open a NEW workspace tab next to any
 * existing ones — not replace the active tab.
 */
const RUN = 'RUN-2026-09-07-run-nzrs'

test('deep-linking to a run opens a new workspace tab without clearing existing ones', async ({ page }) => {
  // Seed two open tabs by visiting two runs.
  await page.goto(`/runs/${RUN}`)
  await page.goto(`/runs/RUN-2026-09-07-run-f9m1`)
  await expect(page.locator('.workspace-tab')).toHaveCount(2, { timeout: 15_000 })

  // Now deep-link to a third run directly.
  await page.goto(`/runs/${RUN}`)
  await expect(page.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })
  // The newly opened tab is active.
  await expect(page.locator('.workspace-tab--active')).toContainText(RUN)
})
```

Note: the second `page.goto` is a full page load in Playwright; if the app's SPA navigation (not full reload) is what you want, use `page.click` on a run link instead. The assertion that matters is: after deep-linking, three tabs exist (the third not clobbered).

Run:

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/deep-link-tabs.spec.ts --project=chromium 2>&1 | tail -4
```

Expected: passes. Commit:

```bash
git add app/e2e/deep-link-tabs.spec.ts
git commit -m "test(e2e): deep-linked run opens a new workspace tab (rule-12 gate)"
```

### Task 5 — Runtime check with the vision loop (optional but recommended)

After Task 4, load the live run workspace at `:5174`, take a `browser_exec` screenshot, and confirm visually that multiple compact tabs render without clipping (per SOUL rule 12 the e2e is the gate; this is a final manual-sanity check only).

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/chrome-compaction.spec.ts e2e/three-pane-harness.spec.ts e2e/deep-link-tabs.spec.ts --project=chromium 2>&1 | tail -4
```

Expected: all pass. Commit any fixup.

## Tests / validation

- Task 2 and Task 3 are strict TDD (failing test → implement → pass → commit). Exact commands and expected output are above.
- Task 4 is the Playwright rule-12 gate for the behavior change.
- Typecheck after each code task: `cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck -w app` (expected exit 0).
- Pre-existing unrelated failures (unrelated to this work): `recentStore`, `RightPane` localStorage-on-node-26, and sibling uncommitted `graph/` surface — do not chase them.

## Risks, tradeoffs, and open questions

**Risks:**

1. **The `openTab` change could double-open on refresh.** `RunWorkspacePage` already de-dupes `open` on an already-open tab id (reducer `open` returns the existing tab and activates without a new history step — `OpenTabsContext.tsx:120-142`). The new effect guards with `alreadyOpen`, so it calls `openTab` only for a genuinely-new run. Refresh of an already-open run hits the `alreadyOpen` branch → `activateTab` (no-op). This is the main thing the e2e (Task 4) protects.
2. **`openTabs?.activateTab` in the effect could re-trigger the effect** via state identity churn. The effect deps include `state`, which changes when `activateTab` changes `activeTabId`. Guard with a ref (`didOpenRef`) or only call `activateTab` when `activeTabId !== tabId`. The implementer should add this guard if the e2e shows an infinite loop; the placeholder deps above are the risk spot.

**Tradeoffs:**

- Keeping the tabs costs ~30px (now compacted) but preserves per-tab right-pane mode, per-tab history, and entity color-coding — product features the deep-dive proved real.
- Making deep links open-as-new costs a small behavioral change to `RunWorkspacePage`'s mount effect but directly answers "open a second in parallel / share this workspace."

**Open questions (do not block):**

1. Should the deep-link-as-new behavior also apply to `/project/:id` and `/claim/:id` pages (they have the same mount-reconcile pattern)? The plan covers the run case (the one with the explicit concern + a mount effect); generalize only if a later polish asks.
2. Does Brad want the in-app tab bar to hide when only one tab is open (saving ~30px on the common single-run case)? That's a UI-preference call, deliberately out of scope — note it for the chrome-compaction follow-up.
3. Browser-tab "migration": if a user opens `/runs/A` and `/runs/B` in two OS tabs, should both still write to the SAME localStorage store (they currently do, since `OpenTabsProvider` shares `cl-open-tabs`)? Two OS tabs would fight over `activeTabId`. Flag as the real cost of mixing browser + in-app tabs; do not fix unless Brad wants true multi-OS-tab sync (would need `broadcastchannel`/`storage`-event coordination — its own plan).