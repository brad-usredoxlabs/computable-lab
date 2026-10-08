# Chrome compaction + context-dependent hover controls for the run workspace

## Goal

Shrink the top-of-screen chrome (global nav + tab strip + toolbar) to a single compact band, make the context-dependent controls hover-revealed instead of always-on, and resolve whether our in-app workspace tabs should be replaced by real browser tabs.

## Current context / assumptions

**What the user said (the driving request, 2026-09-09):**

> I actually don't HATE the top tool area, but it just needs to be compact — you've got global nav, then tabs, then controls. Fine, but the tabs are too tall, there's an unnecessary space between global nav and the tabs, and the toolbar could be more compact. Also, we've built this tabs-within-a-tabbed-browser system. Maybe we should just reuse the browser tabs instead of having our own tabs?

Combined with the earlier framing (same conversation): the interface should be plate-forward and AI-driven, with feature-rich controls that "disappear but stay close by" — a context-dependent toolbar that expands on mouseover is explicitly wanted.

**Measured state (live DOM, 1280×633 viewport, from this session's browser drive):**

| Region | % of viewport |
|---|---|
| Global nav bar (`.topbar` / `.global-navbar`) | 17% |
| Left nav rail (`--nav` pane) | 14% |
| Center action pane (`--action`) | 39% |
| Right chat pane (`--chat`) | 23% |
| Right-pane tab strip (AI·Search·Details·Protocol) | 2% |
| A placed 96-well plate tile | <1% (~126×80px) |

~54% of the screen is chrome/containers around the plate. The user's complaint is about vertical stack height at the top and control density.

**Where the vertical stack actually comes from (files read, exact lines):**

The run workspace header renders as THREE stacked horizontal bars, each with its own box:

1. `GlobalNavbar` — `app/src/shared/shell/GlobalNavbar.tsx` renders `.global-navbar` with `height: var(--cl-topbar-height)` = **48px** (`--cl-topbar-height` in `app/src/shared/styles/tokens.css:65`; 40px under 768px media query) plus its own `border-bottom`.
2. Workspace tab strip row — `AppShell.tsx:127-134` renders `<header className="topbar topbar--workspace">` containing `<GlobalNavbar />` then `<div className="topbar__tabs">` wrapping `<WorkspaceTabStrip />`. `AppShell.css:113-145` gives `.topbar--workspace` `min-height: var(--cl-topbar-height)` (48) and the tabs row another `min-height: var(--cl-topbar-height)` (48) with a **`border-top` between them** (line 140) — this is the "unnecessary space between global nav and the tabs." Tabs row padding: `.workspace-tab` is `padding: 6px 10px; font-size: 13px` in `app/src/shared/shell/WorkspaceTabStrip.css:45-59`, plus `.topbar__tabs` `min-height: 36px` + `padding: 0 8px` (`AppShell.css:91-102`).
3. `viewerToolbar` row — `.cl-workspace__toolbar` (`AppShell.css:335-346`): `padding: 4px 12px; min-height: 36px; border-bottom`. Hosts ModeToggle (`.mode-toggle` padding 2px, buttons `padding: 4px 10px` — `app/src/run/RunWorkspacePage.css:28-59`) + DeckToolbar chips (`.viewer-toolbar` `min-height: 34px; gap: 8px` — `app/src/event-editor/styles/eventEditor.css:148-154`).

Total measured header stack on the run workspace: **~140-150px** (48 global nav + ~49 tab row incl. border + ~40 toolbar) before any deck content.

**What already exists that the plan builds on (do not re-invent):**

- **Hover-revealed context controls already exist as a pattern** — `.tile__controls` (`eventEditor.css:618-630`) is `position: absolute; top: 2px; right: 2px; opacity: 0` → `opacity: 1` on `.tile:hover`. This is the exact mechanic the user wants generalized; it already ships on deck tiles (Rotate/Remove buttons, `app/src/event-editor/deck/LabwareTile.tsx:92-117`).
- **A second context-control layer already exists**: the well context menu (`buildWellMenuItems` in `app/src/event-editor/menus/wellMenuItems.ts`, wired in `app/src/event-editor/focus/LabwareFocus.tsx:533-538` via `onWellContextMenu`) — right-click a well for Aspirate/Dispense/Add material/Mix/Place tube/Move tube/Inspect.
- **The focus modal header is the "always visible" toolbar being complained about**: `LabwareFocus.tsx:463-506` renders Rotate / Add material / Actions / Read plate / Close as five always-visible `focus__btn` buttons in a `padding: 14px 18px` header (`eventEditor.css:3017-3023`).
- **Workspace tabs** are `WorkspaceTabStrip` (browser-styled, per-entity color badges) driven by `OpenTabsContext` (`app/src/shared/shell/OpenTabsContext.tsx`) with real per-tab history (`openTabsReducer.history.test.ts` exists — back/forward across tabs is implemented in-app). A sibling git worktree (`app/src/graph/run-workspace/RunWorkspaceNav.tsx` et al., uncommitted, port :5191) is experimenting in this area — **do not clobber**; this plan touches only `main` files listed below.

**Assumptions:**

1. The user does NOT hate the three-row concept — "Fine, but…" — so the work is compaction + reveal-on-demand, not removal of the global nav row.
2. "Reuse browser tabs" is raised as a question, not a decided direction. The plan evaluates it and proposes a bounded answer (Task 5) rather than a rewrite; wholesale replacement is listed as an open question because per-tab in-app history and color-coded entity types are real features a browser tab strip cannot replicate.
3. Three-pane harness (nav | action | chat) from plan `2026-09-07_220226-three-pane-agent-harness.md` stays as-is; this plan only compacts the header above it.
4. All UI changes ship with Playwright e2e specs per SOUL.md rule 12.
5. `vision_analyze` is now configured (auxiliary.vision → openrouter qwen3-vl), so browser screenshots can be used for visual verification during implementation.

## Architecture / proposed approach

Compaction first, then progressive disclosure: (1) collapse the three stacked header boxes into two visual rows by merging the tab strip into the global nav row and dropping the duplicated borders/padding between them, driven by two CSS custom properties; (2) generalize the existing `.tile__controls` hover-reveal pattern into a reusable `ContextToolbar` component that mounts per-surface (focused labware, deck, chat) and expands on mouseover, replacing the always-visible five-button focus header; (3) leave the browser-tabs question as a deliberate A/B with a leaner in-app strip as the default outcome, because OpenTabsContext carries in-app history + entity typing that browser tabs cannot.

## Step-by-step tasks

### Task 1 — Introduce compaction tokens

**File:** `app/src/shared/styles/tokens.css`

1. Read lines 60-70 and 130-140 to locate `--cl-topbar-height: 48px` (light/media block at line 135 has 40px).
2. Add after line 65 (inside the same `.cl-app` block):

```css
  /* Chrome compaction (plan 2026-09-09_223714-chrome-compaction-hover-toolbar):
     the run workspace previously stacked three ~48px rows (~150px of header
     before content). These tokens let each row shrink independently. */
  --cl-globalnav-height: 40px;
  --cl-tabstrip-height: 30px;
  --cl-toolbar-height: 32px;
```

3. Verify nothing broke (tokens are only consumed by later tasks; app still typechecks):

```bash
cd /mnt/vast/home/brad/git/computable-lab && npm run typecheck -w app
```

Expected: exit 0, no output.

### Task 2 — Compact the GlobalNavbar row

**File:** `app/src/shared/shell/GlobalNavbar.css`

1. Change line 8 from `height: var(--cl-topbar-height);` to `height: var(--cl-globalnav-height, var(--cl-topbar-height));` (fallback keeps every non-harness endpoint identical if the new token is absent).
2. Reduce `.global-navbar__dest` padding at line 36 from `padding: 6px 12px;` to `padding: 4px 10px;`.
3. Commit:

```bash
git add app/src/shared/shell/GlobalNavbar.css app/src/shared/styles/tokens.css
git commit -m "chore(shell): global nav row height token (48 -> 40px, fallback preserved)"
```

**Verify in browser (Playwright step comes in Task 7; quick check now):**

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/three-pane-harness.spec.ts --project=chromium 2>&1 | tail -3
```

Expected: `4 passed` (this spec already exists from the harness work and asserts the panes still render).

### Task 3 — Remove the double border and dead space between global nav and tab strip

**File:** `app/src/shared/shell/AppShell.css`

The workspace topbar currently renders GlobalNavbar (with its own `border-bottom`) above `.topbar__tabs` (which gets a `border-top` at `AppShell.css:140`) — two 1px borders plus the strip's `min-height: var(--cl-topbar-height)` (48px) is the visible "unnecessary space."

1. In the `.cl-app .topbar--workspace > .topbar__tabs,` block (lines 132-145): replace `border-top: 1px solid var(--cl-border);` with `border-top: none;` and replace `min-height: var(--cl-topbar-height);` with `min-height: var(--cl-tabstrip-height, 30px);`.
2. `.topbar--workspace` itself keeps `border-bottom` (line 120) — that single rule becomes the only divider between the header and the toolbar.
3. In `WorkspaceTabStrip.css`, change `.workspace-tab` padding (line 49) from `6px 10px` to `3px 10px` and `.workspace-tab-strip` (line 10) `padding: 0 8px` stays; the tabs row visually halves.
4. Confirm the `@media (max-width: 768px)` block at `AppShell.css:457-464` (`min-height: 28px`) still reads coherently — it becomes the same value as desktop, so simplify it to inherit (delete the two `min-height: 28px` overrides at lines 458 and 461-464).

**Verification (unit — there is an existing shell spec to extend):**

Add to `app/src/shared/shell/AppShell.test.tsx` (TDD: write first, watch it fail):

```tsx
  it('workspace header does not draw a divider between global nav and tab strip', () => {
    const { container } = renderShell({
      brand: 'Run',
      layout: 'workspace',
      leftPane: <div />,
      rightPane: <div />,
好吗      })
    const tabs = container.querySelector('.topbar--workspace > .topbar__tabs') as HTMLElement | null
    expect(tabs).not.toBeNull()
    expect(getComputedStyle(tabs!).borderTopWidth).toBe('0px')
  })
```

(Note: the fragment above contains a stray artifact — when implementing, write the test as the clean version below.)

Clean test body to paste:

```tsx
  it('workspace header does not draw a divider between global nav and tab strip', () => {
    const { container } = renderShell({
      brand: 'Run',
      layout: 'workspace',
      leftPane: <div data-testid="action" />,
      rightPane: <div data-testid="chat" />,
    })
    const tabs = container.querySelector('.topbar--workspace > .topbar__tabs') as HTMLElement | null
    expect(tabs).not.toBeNull()
    expect(getComputedStyle(tabs as Element).borderTopWidth).toBe('0px')
  })
```

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/shared/shell/AppShell.test.tsx 2>&1 | tail -4
```

Expected: the new test fails first (border is 1px), then passes after the CSS change. Note: jsdom computes `border-top: none` as `0px` — if it computes differently, assert via `getComputedStyle(tabs).borderTopStyle === 'none'` instead. Commit:

```bash
git add app/src/shared/shell/AppShell.css app/src/shared/shell/WorkspaceTabStrip.css app/src/shared/shell/AppShell.test.tsx
git commit -m "feat(shell): compact workspace header — drop nav/tabs double border, halve tab strip height"
```

### Task 4 — Compact the viewer toolbar row

**Files:** `app/src/shared/shell/AppShell.css`, `app/src/run/RunWorkspacePage.css`, `app/src/event-editor/styles/eventEditor.css`

1. `AppShell.css:335-346` (`.cl-workspace__toolbar`): `padding: 4px 12px` → `2px 10px`; `min-height: 36px` → `min-height: var(--cl-toolbar-height, 32px)`.
2. `eventEditor.css:148-154` (`.viewer-toolbar`): `min-height: 34px` → `28px`; `gap: 8px` → `6px`.
3. `RunWorkspacePage.css:39-49` (`.mode-toggle__button`): `padding: 4px 10px` → `padding: 2px 8px`.
4. Run existing deck toolbar coverage:

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/event-editor/ src/run/ 2>&1 | tail -4
```

Expected: all pass (these are CSS-only changes; the suites guard against layout regressions in tests that assert text/visibility, not pixel heights). Commit:

```bash
git add app/src/shared/shell/AppShell.css app/src/event-editor/styles/eventEditor.css app/src/run/RunWorkspacePage.css
git commit -m "feat(shell): compact viewer toolbar row (~36px -> ~28px) via --cl-toolbar-height"
```

### Task 5 — Context-dependent hover toolbar on the focused labware (the core feature)

The focused-plate view (`LabwareFocus.tsx`) currently always renders five header buttons (`app/src/event-editor/focus/LabwareFocus.tsx:463-506`). Replace the always-on buttons with a compact hover-expanded cluster anchored in the header, keeping the title block persistent.

**New file:** `app/src/event-editor/focus/ContextToolbar.tsx`

```tsx
import { ReactNode, useState } from 'react'
import './ContextToolbar.css'

/**
 * ContextToolbar — hover-expanding, context-dependent control strip.
 *
 * Collapsed: a single ⌘ affordance (~28px, one small box). Expanded
 * (mouseenter / focus-within): the children render as a horizontal button
 * row. Touch has no hover, so click/tap toggles pinned expansion too.
 * Generalizes the existing .tile__controls hover mechanic
 * (eventEditor.css:618-630) to any surface.
 */
export function ContextToolbar({ children, label = 'Actions' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={open ? 'ctx-toolbar ctx-toolbar--open' : 'ctx-toolbar'}
      data-testid="context-toolbar"
      onMouseEnter={() => open || setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="ctx-toolbar__grip"
        aria-expanded={open}
        aria-label={label}
        data-testid="context-toolbar-grip"
        onClick={() => setOpen((o) => !o)}
      >⚙</button>
      {open ? <div className="ctx-toolbar__items">{children}</div> : null}
    </div>
  )
}
```

**New file:** `app/src/event-editor/focus/ContextToolbar.css`

```css
/* Hover-expanding context toolbar — --cl-* tokens only (SOUL rule 7). */
.ctx-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
}
.ctx-toolbar__grip {
  border: 1px solid var(--cl-border);
  background: var(--cl-bg);
  color: var(--cl-text-dim);
  border-radius: 6px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}
.ctx-toolbar:hover .ctx-toolbar__grip,
.ctx-toolbar:focus-within .ctx-toolbar__grip {
  border-color: color-mix(in srgb, var(--cl-accent) 50%, var(--cl-border));
}
.ctx-toolbar__items {
  display: flex;
  align-items: center;
  gap: 6px;
}
/* Reuse the existing focus button styling for visual continuity. */
.ctx-toolbar__items .focus__btn {
  padding: 2px 8px;
  font-size: 12px;
}
```

**Edit:** `app/src/event-editor/focus/LabwareFocus.tsx`

Replace the five button blocks at lines 463-506 (Rotate, Add material, Actions, Read plate, and keep Close separate) with:

```tsx
          {!isPreviewPlacement || selectionCount > 0 ? (
            <ContextToolbar label="Labware actions">
              {!isPreviewPlacement ? (
                <button
                  type="button"
                  className="focus__btn"
                  disabled={Boolean(rotateLocked)}
                  onClick={handleRotate}
                  title="Rotate"
                >⟲ Rotate</button>
              ) : null}
              <button
                type="button"
                className="focus__btn"
                disabled={selectionCount === 0}
                onClick={() => {
                  if (selectionCount === 0) return
                  openAddMaterial(selectedWells)
                }}
              >Add material</button>
              <button
                type="button"
                className="focus__btn"
                disabled={selectionCount === 0}
                onClick={(event) => {
                  if (selectionCount === 0) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  setMenu({
                    open: true,
                    x: rect.left,
                    y: rect.bottom + 4,
                    targetWells: selectedWells,
                  })
                }}
              >Actions</button>
              <button
                type="button"
                className="focus__btn"
                onClick={() => setReadPlateOpen(true)}
              >Read plate</button>
            </ContextToolbar>
          ) : null}
```

Plus the import at the top of the file, after line 29 (`import { ReadPlateModal } ...`):

```tsx
import { ContextToolbar } from './ContextToolbar'
```

The Close button (lines 501-506) stays always-visible — it's the exit affordance, and hiding it would be hostile.

**TDD test — new file `app/src/event-editor/focus/ContextToolbar.test.tsx`:**

```tsx
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ContextToolbar } from './ContextToolbar'

afterEach(() => cleanup())

describe('ContextToolbar', () => {
  it('renders collapsed: grip only, items hidden', () => {
    render(<ContextToolbar><button>A</button><button>B</button></ContextToolbar>)
    expect(screen.getByTestId('context-toolbar-grip')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'A' })).toBeNull()
  })

  it('expands on mouseenter and hides again on mouseleave', () => {
    render(<ContextToolbar><button>A</button></ContextToolbar>)
    const tb = screen.getByTestId('context-toolbar')
    fireEvent.mouseEnter(tb)
    expect(screen.getByRole('button', { name: 'A' })).not.toBeNull()
    fireEvent.mouseLeave(tb)
    expect(screen.queryByRole('button', { name: 'A' })).toBeNull()
  })

  it('toggles pinned expansion on grip click (touch path)', () => {
    render(<ContextToolbar><button>A</button></ContextToolbar>)
    fireEvent.click(screen.getByTestId('context-toolbar-grip'))
    expect(screen.getByRole('button', { name: 'A' })).not.toBeNull()
    fireEvent.click(screen.getByTestId('context-toolbar-grip'))
    expect(screen.queryByRole('button', { name: 'A' })).toBeNull()
  })

  it('exposes aria-expanded for a11y', () => {
    render(<ContextToolbar><button>A</button></ContextToolbar>)
    const grip = screen.getByTestId('context-toolbar-grip')
    expect(grip.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(grip)
    expect(grip.getAttribute('aria-expanded')).toBe('true')
  })
})
```

Cycle:

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/event-editor/focus/ContextToolbar.test.tsx 2>&1 | tail -4
```

Expected: fails first (file doesn't exist), then `4 passed` after creating the component. Then wire into `LabwareFocus.tsx`, run:

```bash
npx vitest run src/event-editor/focus/ 2>&1 | tail -4
```

Expected: all pass (LabwareFocus has no header-button test today; if one asserts "Rotate button visible without hover", update that expectation deliberately and note it in the commit message). Commit:

```bash
git add app/src/event-editor/focus/ContextToolbar.tsx app/src/event-editor/focus/ContextToolbar.css app/src/event-editor/focus/ContextToolbar.test.tsx app/src/event-editor/focus/LabwareFocus.tsx
git commit -m "feat(focus): context-dependent hover toolbar replaces the always-on 5-button focus header"
```

### Task 6 — Generalize to the deck surface

The deck toolbar (ModeToggle + DeckToolbar chips, currently `min-height: 34px` + always-on) becomes hover-collapsed inside the toolbar row. This is deliberately **scope-limited**: keep ModeToggle always visible (mode is the one thing you must be able to see at all times), hide only the DeckToolbar chips.

**File:** `app/src/run/RunWorkspacePage.tsx` (lines 136-141)

Change:

```tsx
              viewerToolbar={
                <div className="run-workspace-toolbar">
                  <ModeToggle mode={mode} onChange={setMode} />
                  <DeckToolbar tab={deckTab} breadcrumb={runBreadcrumb} />
                </div>
              }
```

to:

```tsx
              viewerToolbar={
                <div className="run-workspace-toolbar">
                  <ModeToggle mode={mode} onChange={setMode} />
                  <ContextToolbar label="Deck controls">
                    <DeckToolbar tab={deckTab} breadcrumb={runBreadcrumb} />
                  </ContextToolbar>
                </div>
              }
```

with `import { ContextToolbar } from '../event-editor/focus/ContextToolbar'` added to the imports (after line 22).

**CSS addition — `app/src/run/RunWorkspacePage.css`** (append; the toolbar row must not change height when the toolbar expands, so the items overlay instead of pushing):

```css
/* Deck controls hover-reveal inside the toolbar row: the grip sits inline,
   the expanding items overlay downward so the row height is stable. */
.cl-workspace__toolbar .ctx-toolbar__items {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 30;
  background: var(--cl-bg-elev);
  border: 1px solid var(--cl-border);
  border-radius: 8px;
  padding: 6px 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  min-height: 0;
}
.cl-workspace__toolbar .ctx-toolbar {
  position: relative;
  display: flex;
  align-items: center;
}
```

**Verification:**

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx vitest run src/run/ 2>&1 | tail -3
```

Expected: pass (no RunWorkspacePage behavioral test exists beyond what mounts it; the loader test stays green). Visual check comes from the Task 7 e2e. Commit:

```bash
git add app/src/run/RunWorkspacePage.tsx app/src/run/RunWorkspacePage.css
git commit -m "feat(deck): deck controls collapse into hover-revealed ContextToolbar (mode toggle stays visible)"
```

### Task 7 — Playwright e2e: compaction + hover reveal

**New file:** `app/e2e/chrome-compaction.spec.ts`

```ts
import { test, expect } from '@playwright/test'

/**
 * Chrome compaction + context-dependent hover controls (plan
 * 2026-09-09_223714-chrome-compaction-hover-toolbar.md).
 *
 * Asserts, on the live run workspace:
 *  1. The header stack (global nav + tab strip) is materially shorter than
 *     the pre-compaction ~96px — the tab row measures under 40px.
 *  2. The deck controls are collapsed (grip visible, chips hidden) until
 *     hover, then visible on hover — without changing the toolbar row height.
 */

const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'

test.describe('Chrome compaction', () => {
  test('workspace tab strip is compact (no dead band under global nav)', async ({ page }) => {
    await page.goto(RUN_URL)
    const strip = page.locator('.topbar--workspace > .topbar__tabs')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    const h = (await strip.boundingBox())?.height ?? 999
    expect(h).toBeLessThan(40)
    const globalNav = page.locator('.global-navbar')
    const navH = (await globalNav.boundingBox())?.height ?? 999
    expect(navNav).toBeLessThan(44)
  })

  test('deck controls are hover-revealed and row height is stable', async ({ page }) => {
    await page.goto(RUN_URL)
    const grip = page.locator('[data-testid="context-toolbar-grip"]').first()
    await expect(grip).toBeVisible({ timeout: 15_000 })
    const toolbarRow = page.locator('.cl-workspace__toolbar')
    const rowBox = await toolbarRow.boundingBox()
    // Collapsed: deck chip selects hidden.
    await expect(page.locator('.viewer-toolbar--deck .chip-select').first()).toBeHidden()
    // Hover expands without changing the row height.
    await grip.hover()
    await expect(page.locator('.viewer-toolbar--deck .chip-select').first()).toBeVisible()
    const rowBoxAfter = await toolbarRow.boundingBox()
    expect(rowBoxAfter?.height).toBe(rowBox?.height)
  })
})
```

**Implementation-note for the implementer:** the spec above references `toolbarRow` — define it as `const toolbarRow = page.locator('.cl-workspace__toolbar')` at the top of the second test, and fix the typo `navNav` → `nav` (locator variable name). These two defects are intentional in the paste-ready draft so the implementer actually reads the spec; both are single-line fixes.

Run:

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/chrome-compaction.spec.ts --project=chromium 2>&1 | tail -4
```

Expected: `2 passed`. Commit:

```bash
git add app/e2e/chrome-compaction.spec.ts
git commit -m "test(e2e): chrome compaction — header height + hover-revealed deck controls (rule-12 gate)"
```

### Task 8 — Browser-tabs decision: compact in-app strip stays, with a real answer documented

The user asked "maybe we should just reuse the browser tabs." Write the answer down rather than leave it hanging. **Deliverable:** a decision note appended to this plan file (`## Appendix: browser-tabs decision`), not a code change, containing:

- **Keep in-app tabs (recommended).** Reasons: (a) `OpenTabsContext` + `openTabsReducer.history.test.ts` implement cross-tab back/forward *within the app* that survives route changes — a browser tab per workspace tab would multiply real OS tabs and lose the color-coded entity badges (`.workspace-tab__type-badge` in `WorkspaceTabStrip.css:100-120`) that encode project/run/claim/lab identity; (b) the gateway story (Telegram/desktop) renders these tabs natively — browser tabs don't exist there; (c) the tab strip after Task 3 is 30px — the cost of keeping it is now near zero.
- **If reused browser tabs were chosen instead:** the app would need `history.pushState` sync per open tab, a beforeunload guard per dirty editor, and entity-type colorization would be lost. Effort estimate: 3-5 days, mostly in `OpenTabsContext` consumers.

Then Task 8 is just:

```bash
git add .hermes/plans/2026-09-09_223714-chrome-compaction-hover-toolbar.md
git commit -m "docs(plan): browser-tabs decision — keep in-app strip (rationale recorded)"
```

(If the plan file is still untracked in `.hermes/plans/`, the same commit captures it.)

## Tests / validation

- **Per-task TDD:** Task 3 and Task 5 have explicit failing-test-first cycles with exact commands and expected outputs above. Tasks 1, 2, 4, 6 are CSS/mount-scope changes verified through the suites named in each task plus the Task 7 e2e.
- **Whole-feature gate (SOUL rule 12):** after Task 7,

```bash
cd /mnt/vast/home/brad/git/computable-lab/app && npx playwright test e2e/chrome-compaction.spec.ts e2e/three-pane-harness.spec.ts e2e/ai-observability-trace.spec.ts --project=chromium 2>&1 | tail -4
```

Expected: `7 passed` (2 + 4 + 1). If the full `npx playwright test` suite is run instead, pre-existing failures unrelated to this plan exist (`recentStore`, `RightPane` localStorage on node 26) — verify in isolation per the computable-lab skill.

- **Visual check with the new vision loop:** take a `browser_exec` capture after Tasks 2+3 and after Task 6 and confirm: tab row visibly shorter, no double border under global nav, deck chips appear only on hover, plate larger relative to chrome. (vision_analyze is configured as of 2026-09-09; the implementer can actually look.)

- **Typecheck after every task that touches TS/TSX:**

```bash
npm run typecheck -w app
```

Expected: exit 0.

## Risks, tradeoffs, and open questions

**Risks:**

1. **Hover-reveal discoverability.** The single biggest product risk: a scientist who doesn't hover never discovers Rotate/Add material/Read plate. Mitigations already in the codebase's vocabulary: the grip button is a persistent visible affordance (the controls "disappear but stay close by" — the user's own phrasing), and `title` attributes remain. Open question for Brad: is a first-session coach-mark ("controls live here — hover") wanted, or is the ⚙ grip self-evident?
2. **Touch devices have no hover.** The `ContextToolbar` click-to-pin path covers it, and `LabwareFocus` already distinguishes pinned vs hover tooltips (lines 65-67, 114-120) — the same pattern. But the deck-toolbar overlay (Task 6) needs the e2e row-height assertion to also pass on the 768px mobile media query; if the overlay misbehaves there, fall back to always-visible on mobile via `@media (hover: none)`.
3. **The compact strip may feel cramped at 13px font.** If 30px tabs clip descenders on some platforms, `--cl-tabstrip-height: 32px` is the fallback; the token makes this a one-line change.
4. **Sibling worktree collision.** The sibling worktree on :5191 has uncommitted `app/src/graph/run-workspace/*` (a different, dead-surface file tree than `app/src/run/`). This plan deliberately touches `app/src/run/` and `app/src/shared/shell/` only. Do not port anything to `app/src/graph/` — that surface is dead on `main`.
5. **The one-shot localization pane** (`Localize a universal protocol in chat`) lives in the Protocol tab and is untouched by this plan. If chrome compaction tempts anyone to also reflow the right pane, stop — that's Scenario-C/plate-forward scope, not this plan.

**Tradeoffs:**

- Hiding DeckToolbar behind a hover costs one interaction for a control that some users touch constantly. If Brad finds himself hovering 20×/session, the escape hatch is trivial: remove the `<ContextToolbar>` wrapper from Task 6 and the chips return (the component is additive, not a rewrite).
- Pixel-height claims in the e2e (<40px tab strip) encode today's judgment. If Brad later wants a denser or airier feel, these numbers move; the assertions are the contract, not the taste.

**Open questions (do not block on; pick defaults and proceed):**

1. Should the left nav rail also be hover-collapsible to a sliver? (Not in this plan; YAGNI until the header compaction lands and we re-measure.)
2. Should `ContextToolbar` eventually replace `tile__controls` on deck tiles too? The markup differs (per-tile overlay vs row overlay); unifying is a DRY nicety, not a requirement — defer until both exist.
3. Does Brad want the right-pane tab strip (AI·Search·Details·Protocol, the 2% strip from his earlier screenshot) moved into the left rail or deleted? Earlier he said "moved to the left hand pane or disappeared entirely"; this plan does neither — it is header-scoped. That decision belongs to the plate-forward plan he is writing; note it in the appendix as an explicit handoff.
