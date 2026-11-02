# SHELL-PANE-SCROLL-1 SPEC DRAFT — l1t0645 (composer draft; orchestrator reviews, promotes, then dispatches)

Item: SHELL-PANE-SCROLL-1 "Housekeeping: AppShell.css left/action-pane overflow rules are DEAD
CODE — react-resizable-panels inline overflow:hidden wins, so left panes are not scrollable
despite the rule" — lane 1, trunk `cl/integration-1`.
Authority: /home/brad/.hermes/cl/lanes/1/task-list.md:11548-11567 (the item block is BINDING; title,
description, why and `verified by:` are copied verbatim in §1 and §8).

Composed at trunk **d85dcccd** (2026-11-02 ~06:35-06:50 EST), worktree
/mnt/vast/home/brad/git/cl-integration-1. Every file:line below was read first-hand at this SHA, and
every measurement in §5 was taken first-hand with Playwright against the served trunk build on
:5192 at viewport 1440x900 (read-only page loads; no route interception, no stack mutation). No
scout call was needed and nothing here is screening-grade.

**The composer's survey CHANGED the item's premise. Read §3 before §4.** The `--left` rule is not
dead everywhere: it is dead on every PanelGroup route and LIVE — and load-bearing — on every
single-pane route. A coder who "deletes the dead rule" as the title suggests will regress
`/ingestion`'s scrolling. That is the single most important fact in this spec.

---

## 1. Item block, verbatim (task-list.md:11548-11567)

```
id: SHELL-PANE-SCROLL-1
title: "Housekeeping: AppShell.css left/action-pane overflow rules are DEAD CODE — react-resizable-panels inline overflow:hidden wins, so left panes are not scrollable despite the rule"
status: todo
owner:
deps: none
description: >-
  Discovered while speccing FAME-LAYOUT-1 (composer finding, orch-verified 2026-11-02 at
  17a760f7): app/node_modules/react-resizable-panels@3.0.6 stamps every Panel with INLINE
  overflow:hidden (dist:1458); AppShell.css:381-384 (.cl-workspace__pane--left
  overflow-y:auto/overflow-x:hidden) and the analogous --action rule are therefore dead at
  runtime — left/action-pane long content relies on inner-surface scroll containers only.
  Either move the scroll door onto page-owned content roots (FAME-LAYOUT-1 pattern, per-surface,
  deliberate) or use !important app-wide (blast radius: every pane incl. AI chat) — the item must
  DECIDE per surface with a browser measurement, not blanket-fix. Friction-first; dead chrome is a
  defect but an invisible dead CSS rule alone is not user-breaking; survey which pages actually
  clip content today.
why: latent bug class — a rule that lies about behaviour invites wrong fixes later.
verified by:
  Per-surface browser spot-check: either the rule is replaced by a working door on the page-owned
  root (screenshot pair) or the dead rule is deleted with a comment naming the library constraint.
```

## 2. Goal (one sentence)

Make every workspace pane's scroll behaviour TRUE — one comment-scoped CSS change removes the
three pane-level overflow declarations that the panel library overrides, preserves the one place
where a pane genuinely owns its scroll, and adds the page-owned door on the one surface measured
to clip content today (`/analysis` left pane, 2796 px unreachable) — with zero TSX changes and no
`!important` anywhere.

## 3. Root cause, re-verified first-hand (this is where the item's premise is corrected)

Three layers, in the order they bite:

1. **The library stamps an INLINE `overflow: hidden` on every `Panel`.**
   `app/node_modules/react-resizable-panels` is version 3.0.6 (`app/package.json`); `getPanelStyle()`
   returns `overflow: "hidden"` at `dist/react-resizable-panels.js:1458` and the `PanelGroup`
   wrapper gets the same at `:2182` (both re-read this tick; two hits, no others). Inline
   declarations beat any stylesheet rule short of `!important`.

2. **So the pane-level rules are dead on every route that renders a `PanelGroup` — and only
   there.** `WorkspaceMain` has FOUR shapes (`app/src/shared/shell/AppShell.tsx`):
   - no `rightPane` -> **single-pane**, `:210-221`: the pane is a plain
     `<div className="cl-workspace__pane cl-workspace__pane--left">` with **no Panel and no inline
     style**. `.cl-app--workspace .cl-workspace__pane--left { overflow-y:auto; overflow-x:hidden }`
     (`AppShell.css:381-384`) is **LIVE here**.
   - mobile drawer -> `:226-257`: `--main` pane, not in scope.
   - `navPane` present -> **three-pane** `:263-303`: `--nav` / `--action` / `--chat` are all
     `Panel`s -> inline clip -> their pane rules (`AppShell.css:392-397`, `:401-404`) are DEAD.
   - otherwise -> **two-pane** `:306-335`: `--left` / `--right` are `Panel`s -> `AppShell.css:381-384`
     is DEAD.

3. **Measured proof of both halves** (Playwright, :5192, 1440x900, this tick):

   | route | pane element | inline style attr | computed overflow | verdict |
   |---|---|---|---|---|
   | `/ingestion` | `--left` (single) | `null` | `ox:hidden oy:auto` | rule **LIVE**; pane `cH 829 / sH 1750` -> the rule is the only reason 921 px of content is reachable |
   | `/claims`, `/chat`, `/gc-run/:id`, `/splash` | `--left` (single) | `null` | `ox:hidden oy:auto` | rule **LIVE** |
   | `/registry` | `--left` (Panel) | `flex: 74 1 0px; overflow: hidden;` | `ox:hidden oy:hidden` | rule **DEAD** |
   | `/find`, `/record/:id`, `/project/:id`, `/analysis` | `--left` (Panel) | `flex: 60 1 0px; overflow: hidden;` | `ox:hidden oy:hidden` | rule **DEAD** |
   | `/runs/:runId`, `/sequences` | `--action` (Panel) | `flex: 52 1 0px; overflow: hidden;` | `ox:hidden oy:hidden` | `--action` rule **DEAD** |
   | `/runs/:runId`, `/sequences` | `--nav` (Panel) | `flex: 18 1 0px; overflow: hidden;` | `ox:hidden oy:hidden` | `--nav` rule **DEAD** |

   Consequence: the item's "delete the dead rule" arm is only correct for the PanelGroup shapes.
   Deleting `AppShell.css:381-384` outright would make `/ingestion` (and every other single-pane
   page without its own door) un-scrollable — a NEW user-visible defect, which the acceptance
   ("no new clipping") would reject.

4. **The page-owned door convention already exists and is the house pattern.** Pages that live in
   a PanelGroup mostly already own their scroll on the content root:
   `.graph-search { overflow-y:auto; height:100%; flex:1 }` (`app/src/graph-search/GraphSearchPage.css:1-7`),
   `.sequences-page { padding:1rem; overflow:auto; height:100% }`
   (`app/src/sequences/SequencesPage.css:1`), `.record-create-panel { overflow:auto; height:100% }`
   (`app/src/event-editor/create/RecordCreatePanel.css:3-11`, also used by `RecordEditPanel`),
   `.intake-scroll` (`app/src/intake/intake.css:3-6`), `.extraction-scroll`
   (`app/src/extraction/extraction.css:314-317`), `.lab-entity-workspace`
   (`app/src/lab/LabEntityWorkspace.css:3-10`), `.splash-page`
   (`app/src/shared/shell/SplashPage.css:1-9`), `.project-home` (measured `ox/oy:auto`).
   This is why the dead shell rule went unnoticed: the PanelGroup pages never needed it.

5. **One surface does NOT have the door and clips today — `/analysis`'s LEFT pane.**
   `app/src/analysis/AnalysisPage.tsx:866` passes `leftPane={leftPane}`, whose root is
   `<div className="analysis" data-testid="analysis-page">` (`AnalysisPage.tsx:663`; measured
   `leftChild.cls === "analysis"`), and
   `app/src/analysis/AnalysisPage.css:1-7` is
   `.analysis { display:flex; flex-direction:column; gap:1rem; padding:1rem 1.25rem 2rem; max-width:720px; }`
   — no `overflow`, no `height`, no `flex`. Measured on `/analysis` at 1440x900:
   pane `cH 829 / sH 3625`; `.analysis` `cH 3625 / sH 3625`, `oy:visible`. **2796 px of the left
   pane is unreachable by wheel, drag or scrollbar**: the tail of the `Run method` section
   (`.analysis__section` #4, `top 830` — i.e. its bottom edge lands at the pane's clip) and the
   entire `Runs` section (`.analysis__section` #5, height 2589, `top 1075`, already below the
   900 px viewport) — the run list a user would click to pick an analysis. This is the same defect
   class FAME-LAYOUT-1 fixed on the RIGHT pane; FAME-LAYOUT-1 deliberately did not touch it
   (`AppShell.css:381-384` was ruled out of that item as R3/OQ-3 and filed as THIS item).

## 4. Per-surface decision table (the item's core deliverable)

Legend — **LIVE**: single-pane route, the pane is a plain div, the pane-level rule works.
**OWN-DOOR**: PanelGroup route whose page content root already scrolls itself -> nothing to fix
on the page; the pane rule is deleted as a lie. **CLIPS**: PanelGroup route with measured overflow
and no door -> the page gets the door. **TBD**: not measured by the composer -> the coder measures
(§6) and applies the same decision rule.

| # | route(s) | shell shape | content root (file:line) | composer measurement (1440x900) | decision |
|---|---|---|---|---|---|
| 1 | `/ingestion`, `/ingestion/:tab` | LIVE (single) | `.ingestion-page` (IngestionPage.css:1-5, no overflow) | pane `cH 829 / sH 1750`, `oy:auto` | **LIVE — keep the door; the scoped rule must preserve it.** No page change. |
| 2 | `/claims` | LIVE (single) | `.claims-collection` (ClaimCollectionView.css:7-9, no overflow) | pane `oy:auto`, `cH 222 / sH 222` (fits) | LIVE, no page change |
| 3 | `/claims/:claimId` | LIVE (single) | `.claim-workspace` (ClaimWorkspace.css:3-7, no overflow) | not measured | LIVE — coder measures; no page change expected |
| 4 | `/chat` | LIVE (single) | `.chat-page` (ChatPage.css:2-10, `height:100%`, no overflow on root) | pane `oy:auto`, `cH 315 / sH 315` | LIVE, no page change |
| 5 | `/gc-run/:runId` | LIVE (single) | `.gc-evidence-run` (no overflow) | pane `oy:auto`, `cH 138 / sH 138` | LIVE, no page change |
| 6 | `/splash` | LIVE (single) | `.splash-page` (SplashPage.css:1-9, own `overflow-y:auto`) | pane `oy:auto`, child `ox/oy:auto` | LIVE + own door; no page change |
| 7 | `/lab`, `/lab/:category` | LIVE (single) | LabCollectionView root | not measured | LIVE — coder measures |
| 8 | `/lab/:category/:entityId` | LIVE (single) | `.lab-entity-workspace` (LabEntityWorkspace.css:3-10, own `overflow-y:auto`) | not measured | LIVE + own door; no page change |
| 9 | `/intake`, `/intake/:treeId` | LIVE (single) | `.intake-scroll` (intake.css:3-6, own `overflow:auto`) | not measured | LIVE + own door; no page change |
| 10 | `/extraction`, `/extraction/review/:id` | LIVE (single) | `.extraction-scroll` (extraction.css:314-317, own `overflow:auto`) | not measured | LIVE + own door; no page change |
| 11 | `/create/study` | LIVE (single) | CreateStudyPage root | not measured | LIVE — coder measures |
| 12 | `/ingestion/vendor-pdf/:recordId` | LIVE (single) | `.vendor-pdf-review` (embedded) | not measured | LIVE — coder measures |
| 13 | `/registry` | Panel, two-pane | `.registry-page` (RecordRegistryPage.css:3-9, `display:flex; height:100%; min-height:0`, columns scroll internally) | pane inline `flex: 74 1 0px; overflow: hidden;`, child `cH 772 / sH 772` | **OWN-DOOR**; delete pane rule only |
| 14 | `/record/:recordId`, `/record/new/:nodeType/:parentId?` | Panel, two-pane | `.record-create-panel` (RecordCreatePanel.css:3-11, `overflow:auto; height:100%`; shared with `RecordEditPanel.tsx:151`) | child `ox/oy:auto`, `cH 786 / sH 786` | **OWN-DOOR** |
| 15 | `/find` | Panel, two-pane | `.graph-search` (GraphSearchPage.css:1-7, own `overflow-y:auto`) | child `ox/oy:auto`, `cH 200 / sH 200` | **OWN-DOOR** |
| 16 | `/project/:studyId` | Panel, two-pane | `.project-home` (measured `ox/oy:auto`) | child `cH 793 / sH 793` | **OWN-DOOR** |
| 17 | **`/analysis`** | Panel, two-pane | `.analysis` (AnalysisPage.css:1-7 — **no overflow**) | pane `cH 829 / sH 3625`; `.analysis` `cH 3625 / sH 3625`, `oy:visible` | **CLIPS -> ADD THE DOOR (§5.2)** |
| 18 | `/deck/:eventGraphId/:runId?` | Panel, two-pane | `Viewer` (`DeckHostPage.tsx:126`) -> deck/document/pdf viewers own their scroll | not measured | TBD — coder measures; add a door only if the measured root clips |
| 19 | `/artifact/:kind/:artifactId` | Panel, two-pane | `PdfViewer` / `DocumentEditor` (`ArtifactHostPage.tsx:101-110`) | not measured | TBD — same rule |
| 20 | `/runs/:runId` | Panel, three-pane | `.event-editor.event-editor__stage-host` / `.gc-run-sheet` | action pane inline `overflow: hidden`; child `cH 786 / sH 786` (qng0), `cH 363 / sH 363` (brad-gc-drive) | **OWN-DOOR / fits**; delete `--action` rule only |
| 21 | `/runs/:runId` (nav rail) | Panel, three-pane | `.run-nav-pane` (RunNavPane.css:1-6, `height:100%`, no overflow) | nav pane inline `overflow: hidden`; child `cH 786 / sH 786` (fits) | fits today; delete `--nav` rule only (see §5.3) |
| 22 | `/sequences`, `/lab/sequences` | Panel, three-pane | `.sequences-page` (SequencesPage.css:1, own `overflow:auto; height:100%`) | action child `cH 829 / sH 1165`, `oy:auto`; nav child `.sequences-page.sequence-library` `oy:auto` | **OWN-DOOR** |

**Decision rule the coder applies to every TBD row (and re-verifies on the measured rows):**
if the content root's computed `overflow-y` is `visible` AND its `scrollHeight > clientHeight`,
it CLIPS -> add the door. Otherwise it is OWN-DOOR/fits -> no page change, and the row is recorded
in the report with its numbers. **Cap: at most ONE additional door beyond `/analysis`.** A second
clipping surface means the survey found something structural — STOP and return `requires-rescope`
with the measurement, do not absorb it.

**What the table proves for the item's central question:** `!important` app-wide is unnecessary
(§9 R1) because the clipping population is one surface, not a class; and blanket deletion is
wrong because the single-pane rule is load-bearing (row 1: 921 px).

## 5. Required change — exact rule shapes

### 5.1 `app/src/shared/shell/AppShell.css` — stop lying at the pane level

Replace the single-pane block and the three pane modifier blocks (current text at :356-366,
:377-384, :391-397, :399-404) with exactly this shape:

```css
/* Single-pane workspace (no right pane: /splash, /ingestion, /claims, /chat, /gc-run, ...).
   The lone pane here is a plain flex child, NOT a react-resizable-panels Panel, so it is
   the only pane that can own its own scroll. */
.cl-app--workspace .cl-workspace__panels--single > .cl-workspace__pane {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Pane-level overflow is not controllable on the PanelGroup shapes: the library stamps
   every Panel with an INLINE overflow:hidden (react-resizable-panels@3.0.6, getPanelStyle(),
   dist/react-resizable-panels.js:1458), which no stylesheet rule can beat without
   !important. Pages rendered in a PanelGroup own their scroll door on their own content
   root instead (.analysis, .graph-search, .sequences-page, .record-create-panel,
   .registry-page's columns, ...). Do not re-add overflow here. */
```

and then:

- **delete** `.cl-app--workspace .cl-workspace__pane--left { overflow-y: auto; overflow-x: hidden }`
  (:381-384) and its four-line comment (:377-380) — the declaration moves to the single-pane rule
  above, where it actually computes;
- **delete** the two `overflow-*` declarations from `--nav` (:395-396) and keep
  `background` + `border-right`;
- **delete** `.cl-app--workspace .cl-workspace__pane--action { ... }` (:401-404) and its comment
  (:399-400).

Nothing else in `AppShell.css` changes: `.cl-workspace__pane`'s own `overflow: hidden` (:373)
stays (it is the honest description of a Panel and the harmless belt on the single-pane path —
the single-pane rule above wins on specificity: 3 classes vs 2).

### 5.2 `app/src/analysis/AnalysisPage.css` — the one measured door

```css
/* SHELL-PANE-SCROLL-1: this page's left pane is a react-resizable-panels Panel, whose
   inline overflow:hidden clips the report column at the pane edge (measured 3625 px of
   content in an 829 px pane at 1440x900 — the run list was unreachable). The pane cannot
   scroll itself, so the page-owned content root does. Same door shape as .analysis-right
   on the opposite pane. */
.analysis {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.25rem 2rem;
  max-width: 720px;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
}
```

Each declaration is load-bearing (the reviewer will re-derive them):
`flex: 1 1 auto` — the pane is `display:flex; flex-direction:column` with a definite height, so
the child must claim that height; without it the element keeps content height and `overflow:auto`
puts its scrollbar below the pane's clip (a rule that looks applied and still fails);
`min-height: 0` — lets the flex child shrink to the pane instead of forcing its content height;
`min-width: 0` — cross-axis insurance (box is capped at 720 px inside an 861 px pane, so there is
no horizontal overflow today, but the declaration keeps a wide future child from pushing the box);
`overflow: auto` — the door itself, both axes.

`max-width: 720px` stays (the reading column is deliberate); the scrollbar therefore sits at the
right edge of the 720 px column, not at the pane edge. That is accepted, not a defect.

**Do not touch `.analysis-right`** (`AnalysisPage.css:57`): FAME-LAYOUT-1 owns that rule and is
in flight (§15 A-3).

### 5.3 Additional doors (TBD rows) — same shape, nothing else

For each TBD row that §4's decision rule measures as CLIPS, add exactly the four declarations
(`flex: 1 1 auto; min-height: 0; min-width: 0; overflow: auto`) plus a one-line comment naming the
measurement, to that page's existing content-root rule. No new classes, no new wrapper elements,
no new files beyond the page CSS that already owns that rule. **One such surface maximum.**

## 6. The measurement harness (how the coder fills the TBD rows — read-only)

The instrument is the served trunk build on **:5192**, not the worktree: :5192 serves the trunk
checkout, which is exactly the "does it clip TODAY" question this item asks. Loading pages is
read-only — **do not restart, rebuild or otherwise mutate the lane stack** (`cl-lane-stack.sh 1
restart` is the orchestrator's, not yours).

Write this OUTSIDE the repo (e.g. `/tmp/pane-survey.cjs`) so nothing is committed, and run it with
the worktree's modules on `NODE_PATH`:

```js
// /tmp/pane-survey.cjs — before-state survey for SHELL-PANE-SCROLL-1.
const { chromium } = require('@playwright/test')
const ROUTES = process.argv.slice(2)
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  for (const route of ROUTES) {
    try {
      await page.goto('http://localhost:5192' + route, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(7000)               // streaming routes never reach networkidle
      const out = await page.evaluate(() => {
        const d = (el) => { if (!el) return null; const cs = getComputedStyle(el)
          return { cls: typeof el.className === 'string' ? el.className : '',
                   inline: el.getAttribute('style'), ox: cs.overflowX, oy: cs.overflowY,
                   cH: el.clientHeight, sH: el.scrollHeight } }
        const q = (s) => document.querySelector(s)
        return { url: location.pathname + location.search,
                 single: !!q('.cl-workspace__panels--single'),
                 left: d(q('.cl-workspace__pane--left')),
                 leftChild: d(q('.cl-workspace__pane--left')?.firstElementChild),
                 action: d(q('.cl-workspace__pane--action')),
                 actionChild: d(q('.cl-workspace__pane--action')?.firstElementChild),
                 navChild: d(q('.cl-workspace__pane--nav')?.firstElementChild) }
      })
      console.log('### ' + route + ' ' + JSON.stringify(out))
    } catch (e) { console.log('### ' + route + ' ERROR ' + e.message.split('\n')[0]) }
  }
  await browser.close()
})()
```

```bash
WT=/mnt/vast/home/brad/git/wt/<branch>
cd /tmp && NODE_PATH="$WT/app/node_modules" node pane-survey.cjs \
  /claims /claims/CLAIM-0001 /chat /gc-run/<runId> /splash /lab /lab/sequences \
  /create/study /ingestion /intake /extraction /registry /find /record/<recordId> \
  /project/<studyId> /analysis /deck/<eventGraphId>/<runId> /artifact/pdf/<artifactId> \
  /runs/<runId> /sequences
```

Playwright browsers are already installed (`~/.cache/ms-playwright/chromium-*`); `@playwright/test`
1.59.1 is in `app/node_modules`. For ids: `curl -s localhost:3092/api/records?limit=5`,
`curl -s localhost:3092/api/runs?limit=3` (this tick: `DOC-DEMO-SOP`, `BUD-DEMO-LANE1`,
`ANR-000061`, `RUN-brad-gc-drive-2026-10-31-kknq4i`, `RUN-2026-10-31-run-qng0`, study
`STU-scratch`). A route that errors/times out is recorded as `NOT MEASURED` with the reason — it
does not fail the item.

**How to read a row:** `inline: null` + `oy:auto` on the pane = single-pane (rule live);
`inline: "flex: NN 1 0px; overflow: hidden;"` = Panel (rule dead). CLIPS iff the content root's
`oy` is `visible` and `sH > cH`.

**Composer's before-state numbers at d85dcccd** (reproduce at least rows 1, 13, 17, 22 exactly —
they are this spec's load-bearing claims):

```
/ingestion   single=true  left.inline=null oy=auto cH=829 sH=1750   .ingestion-page oy=visible
/claims      single=true  left.inline=null oy=auto cH=222 sH=222    .claims-collection oy=visible
/chat        single=true  left.inline=null oy=auto cH=315 sH=315    .chat-page oy=visible
/registry    single=false left.inline="flex: 74 1 0px; overflow: hidden;" oy=hidden  .registry-page cH=772 sH=772
/find        single=false left.inline="flex: 60 1 0px; overflow: hidden;" oy=hidden  .graph-search oy=auto
/record/...  single=false left.inline="flex: 60 1 0px; overflow: hidden;"             .record-create-panel oy=auto
/analysis    single=false left.inline="flex: 60 1 0px; overflow: hidden;" cH=829 sH=3625  .analysis cH=3625 sH=3625 oy=visible  <-- CLIPS
/sequences   single=false action.inline="flex: 52 1 0px; overflow: hidden;"           .sequences-page oy=auto cH=829 sH=1165
/runs/...    single=false action.inline="flex: 52 1 0px; overflow: hidden;"           .event-editor__stage-host cH=786 sH=786
```

## 7. Hard boundaries

- **Files in scope: at most THREE.** `app/src/shared/shell/AppShell.css` (mandatory),
  `app/src/analysis/AnalysisPage.css` (mandatory), plus at most one more page CSS for a measured
  CLIPS surface found in §6 (§5.3 cap: one such surface). A `git diff --stat` naming a fourth file
  is a reject unless the orchestrator re-ruled it in writing.
- **Out of scope:** every other `AppShell.*` file (no `AppShell.tsx` edit — the four shell shapes
  are correct, the CSS was lying); `server/**`; any schema/lint/ui YAML; `.analysis-right`
  (FAME-LAYOUT-1's rule); any `!important`; any px/rem/vw width or height; any new class name,
  wrapper element, or TSX file; any breakpoint; any `overflow: visible`; `node_modules`, `dist`.
- **No `!important` anywhere** — ruled out by the item text (blast radius: every pane incl. AI
  chat) and unnecessary (§4).
- **No new vocabulary** — comments name CSS concepts and the library, not domain terms.
- **No stack restart, no :3092/:5192 mutation, no :3001/:5174 touch, no pkill, no merge, no
  task-list edit.** Worker marks in-progress on claim and NEVER done.
- **No test additions.** This is a stylesheet change; jsdom does not apply stylesheet layout, so a
  unit test cannot observe it. Adding one is a boundary violation, not diligence.
- Genuine platform gap discovered mid-flight (e.g. a clipping surface whose content root does not
  exist as an element, needing a wrapper) -> STOP, return `requires-rescope`; never absorb it.

## 8. Acceptance criteria (VERBATIM from task-list.md:11565-11567)

```
verified by:
  Per-surface browser spot-check: either the rule is replaced by a working door on the page-owned
  root (screenshot pair) or the dead rule is deleted with a comment naming the library constraint.
```

Standing gates that ride with it (task-list.md:57-82): dead chrome is a defect; friction-first;
only the orchestrator marks done after real diffs + tests + a cl-browser-reviewer receipt with
VERDICT: accept; ROUND-TRIP-GATE-1 applies to every browser gate — but see §12.7 for why this
item's gate is a **layout** gate with a narrower round-trip leg than a chat-surface gate.

The browser gate is the real acceptance and is ORCHESTRATOR-RUN (cl-browser-reviewer) after merge.
The coder cannot grade it: the worktree is not what :5192 serves.

## 9. Rejected alternatives (state them in the report; do not drift into them)

- **R1 `!important` app-wide** (`.cl-workspace__pane--left { overflow-y:auto !important }`) — the
  item names it and rules it out: it fights the library for every pane in the app, including the
  AI chat / browser / ingestion panes whose inner surfaces already own their scroll, and the
  blast radius is unmeasured. It is also unnecessary: §4 finds exactly ONE clipping surface.
  Rejected.
- **R2 blanket deletion of the `--left` rule** (the literal reading of the item title) — would
  regress `/ingestion` (pane `cH 829 / sH 1750`, the rule is the only scroll path) and every other
  single-pane page without its own door. This is a NEW user-visible defect. Rejected; §5.1 keeps
  the declaration and moves it to where it computes.
- **R3 per-pane door in `AppShell.css` for the PanelGroup shapes** (e.g.
  `.cl-workspace__pane--left { overflow:auto }` with higher specificity) — inline styles cannot be
  beaten by specificity at all; only `!important` would land, which is R1. Rejected.
- **R4 a wrapper element / `style` prop on the affected page roots** — TSX, needs a per-surface
  justification that does not exist (every target root is already an element with a class), and it
  breaks the "CSS-only" expectation the item's own shape implies. Rejected.
- **R5 reflow/truncate instead of scroll** (shrink the analysis column, hide sections) — destroys
  content for no gain; friction-first says scroll. Rejected.
- **R6 fixing `.analysis-right` "while we are here"** — FAME-LAYOUT-1 owns it and is in flight;
  touching it here creates a same-file merge conflict for no benefit. Rejected.

## 10. First targeted check (run before anything else — 30 seconds)

The item stands or falls on ONE fact: the pane rule is dead on PanelGroup routes and alive on
single-pane routes. Prove it statically in one shot at claim time:

```bash
cd "$WT" && sed -n '205,225p' app/src/shared/shell/AppShell.tsx \
  && grep -n 'overflow' app/src/shared/shell/AppShell.css \
  && grep -n 'overflow: "hidden"' app/node_modules/react-resizable-panels/dist/react-resizable-panels.js
```

Expected:
- `AppShell.tsx:210-221` shows the `!hasRight` branch rendering a plain
  `<div className="cl-workspace__pane cl-workspace__pane--left">` — **no `Panel`**;
- `AppShell.css` shows `overflow` at the pane rules :373, :382-383, :395-396, :402-403;
- the library grep returns exactly two hits, `1458:` (Panel) and `2182:` (PanelGroup), both
  `overflow: "hidden"`.

Then the live half (read-only, 20 s):

```bash
cd /tmp && NODE_PATH="$WT/app/node_modules" node pane-survey.cjs /ingestion /analysis
```

Expected: `/ingestion` pane `inline:null oy:auto cH 829 sH 1750` (rule LIVE) and `/analysis` pane
`inline:"flex: 60 1 0px; overflow: hidden;"` with `.analysis cH 3625 sH 3625 oy:visible`
(rule DEAD + CLIPS). If those two rows do not reproduce, STOP and report — the premise of this
spec has drifted and the orchestrator must re-rule before any CSS is edited.

## 11. Gates the coder must run (with expected output)

Run from the worktree root (`WT=/mnt/vast/home/brad/git/wt/<branch>`).

**G0 — pristine baseline BEFORE editing.** App tsc is NOT clean on this trunk; the gate is a
baseline DIFF, never "exit 0".

```bash
cd "$WT/app" && npx tsc --noEmit > /tmp/tsc-before-$USER.txt 2>&1; echo "exit=$?"
grep -c 'error TS' /tmp/tsc-before-$USER.txt
```

Composer-measured at d85dcccd: `exit=2`, **21** `error TS` lines, **0** of them under
`src/analysis/`. If your baseline differs, record the number and the per-file counts — it drifts.

**G1 — diff boundary:**

```bash
cd "$WT" && git diff --stat && git diff --unified=0 | grep -c '^+.*!important'
```

Expected: `2 files changed` (or `3` if §5.3 added one door), small insertions/deletions, the file
names being `app/src/shared/shell/AppShell.css` and `app/src/analysis/AnalysisPage.css`, and
`0` for the `!important` count. No `px`, `rem`, `vw` widths in the added lines:

```bash
cd "$WT" && git diff --unified=0 | grep '^+' | grep -E '[0-9]+(px|rem|vw)' ; echo "px-hits=$?"
```
Expected: no output, `px-hits=1` (grep found nothing).

**G2 — typecheck baseline-diff empty:**

```bash
cd "$WT/app" && npx tsc --noEmit > /tmp/tsc-after-$USER.txt 2>&1; echo "exit=$?"
diff <(sort /tmp/tsc-before-$USER.txt) <(sort /tmp/tsc-after-$USER.txt) && echo TSC-BASELINE-IDENTICAL
```

Expected: `TSC-BASELINE-IDENTICAL` (still `exit=2`, still 21 lines). A CSS-only diff cannot change
tsc output; if it does, you edited the wrong file.

**G3 — vitest: NOT REQUIRED, and say so in the report.** No TS/JSX/DOM-structure change exists and
jsdom does not apply stylesheet layout, so no unit test can observe this fix and none is added. For
a cheap mount smoke (optional, ~15 s):

```bash
cd "$WT/app" && npx vitest run src/shared/shell/AppShell.test.tsx
```

Record the actual pass count; do NOT claim the fix from it — it only proves the shell still mounts.

**G4 — CSS parses.** Either `cd "$WT/app" && npx vite build` (expect success; `dist/` is gitignored,
never commit it) or rely on the orchestrator's post-merge served-CSS fetch (§12.1), which is the
stronger receipt. Report which you used.

**G5 — the survey table** (§4/§6): every row filled with either composer numbers reproduced, your
own numbers, or `NOT MEASURED` + reason.

## 12. What the orchestrator's browser gate must prove (orch-run; the acceptance)

Pre-launch on :5192 after merge + hard reload.

1. **Served-CSS receipt** (proves the change is in the bundle, not just the worktree):
   `curl -s http://localhost:5192/src/shared/shell/AppShell.css | grep -n -A4 'panels--single > .cl-workspace__pane'`
   -> the block contains `overflow-y: auto;`; and
   `curl -s http://localhost:5192/src/analysis/AnalysisPage.css | grep -n -A12 '^\.analysis {'`
   -> contains `min-height: 0;` and `overflow: auto;`.
   If the old text is served, restart :5192 with `cl-lane-stack.sh 1 restart` (orchestrator only).
2. **The fixed surface, `/analysis`, viewport 1440x900** — DOM-bound, not screenshot-only:
   read `.analysis` `clientHeight/scrollHeight`, set `scrollTop = scrollHeight`, assert the last
   `.analysis__section` (the `Runs` block) `getBoundingClientRect()` is inside the pane rect, and
   assert `getComputedStyle(pane).overflowY === 'hidden'` (the Panel still clips — the door is on
   the page root, that is the point). Receipt = JSON + screenshot PAIR: one at `scrollTop=0`, one
   at max scroll with the run list visible. That pair is the item's verbatim "working door on the
   page-owned root (screenshot pair)" leg.
3. **The live-rule regression, `/ingestion`** (the deletion trap): pane `overflowY` still `auto`,
   pane `inline` still `null`, and `scrollTop` reaches `scrollHeight - clientHeight` (~921 px);
   screenshot pair top/bottom. A pane that no longer scrolls here is a REJECT — it means the
   single-pane declaration was deleted instead of moved.
4. **Two-pane OWN-DOOR control, `/registry` or `/find`**: pane still inline `overflow: hidden` and
   its content root still scrolls as before (no visual change). Proves the PanelGroup shape was not
   disturbed.
5. **Three-pane control, `/sequences`**: `--action` pane still inline `overflow: hidden`;
   `.sequences-page` still reaches its bottom (1165 px content in an 829 px pane).
6. **Nav-rail control, `/runs/<runId>`**: `.run-nav-pane` fully visible (fits at 786 px) after the
   dead `--nav` declaration was removed — i.e. no visual delta.
7. **ROUND-TRIP-GATE-1** (task-list.md:69-82, BRAD-BINDING): one full live round trip on the
   changed surface `/analysis` — real `/api/ai/**` stream, ZERO route interception, a user-visible
   AI answer, and the outgoing REQUEST BODY captured as a receipt artifact PAIRED with the
   rendered-answer screenshot. Mounted/visible DOM alone is NOT accept evidence. If the model
   endpoint is unavailable, the gate is recorded INCOMPLETE, never "accept with a note".

## 13. Reviewer bait (pre-empt these; the adversarial reviewer will hunt them)

1. **The title trap — "it says DEAD CODE, so delete it".** The `--left` rule is LIVE on every
   single-pane route and is the only scroll path for `/ingestion` (measured 1750 px content in an
   829 px pane). A diff that deletes the declaration outright is a REJECT even though it matches
   the item's title. Evidence to put in the report: `AppShell.tsx:210-221` (plain div) + the
   `/ingestion` measurement row.
2. **`overflow:auto` without `flex:1 1 auto; min-height:0` is a NON-FIX** on `.analysis`: the
   element keeps content height, its scrollbar lands below the pane's clip, and the gate's
   screenshot pair shows nothing new. All four declarations are one unit.
3. **Specificity, not order.** The single-pane selector must carry three classes
   (`.cl-app--workspace .cl-workspace__panels--single > .cl-workspace__pane`) so it beats
   `.cl-workspace__pane`'s `overflow:hidden` (:373) regardless of source order. Do not "tidy" it
   back onto `.cl-workspace__pane--left` — that recreates a rule whose reach depends on file order.
4. **`!important` is a hard reject** — grep gate in G1. So is any px/rem/vw width or height, any
   breakpoint, and any `overflow: visible`.
5. **`exactOptionalPropertyTypes` is IRRELEVANT here** (zero TS in the diff). Say so explicitly in
   the report so a reviewer does not go fishing in `server/tsconfig.json` or `app/tsconfig.json`.
6. **YAML-reload trap is IRRELEVANT here** (no schema/lint/ui YAML touched; no stack restart). Say
   so, and do not restart the stack to "make sure".
7. **Nested scroll on `/analysis` is intended.** The right pane already scrolls (FAME-LAYOUT-1's
   `.analysis-right`); the left pane now scrolls too. Two independent panes, wheel chaining is
   normal. Do NOT add `overscroll-behavior` or remove either door.
8. **A horizontal scrollbar on `.analysis` would be a finding, not a fix.** `max-width: 720px`
   inside an 861 px pane means `overflow:auto` should produce a vertical bar only. If the gate
   sees an x-bar, a child is wider than the column — report it; do not paper over it with
   `overflow-x: hidden`.
9. **Same-file merge risk with FAME-LAYOUT-1** in `AnalysisPage.css`. Your hunk is `.analysis`
   (:1-7); theirs is `.analysis-right` (:57). If `git merge` reports a conflict, STOP and report —
   do not resolve it by hand.
10. **Do not grade the fix yourself.** A report claiming "the run list is now reachable" without a
    post-merge browser receipt is the void-accept pattern the lane's reliability rule bans. State
    the diff + static gates + the survey table, and hand off.

## 14. Worker contract

- **Branch**: `wt/shell-pane-scroll-1-lane1-l1t<dispatch-ts>` off `cl/integration-1` at the tip the
  orchestrator pins at dispatch. Worktree under `/mnt/vast/home/brad/git/wt/`. Never branch off an
  in-flight item branch (`cl/lane1-famelayout1-l1t0620` and friends).
- **Deliverable report (unique path)**: `/home/brad/.hermes/cl/lanes/1/shell-pane-scroll-1-report-l1t<ts>.md`
  containing: the exact CSS diff, the §4 survey table fully filled with numbers and file:line, the
  §10 premise output, the G1 stat + `!important`/px grep counts, the G2
  `TSC-BASELINE-IDENTICAL` line, the G3 statement ("vitest not required: CSS-only, jsdom cannot
  observe layout") plus the optional smoke count, and an explicit "browser gate owed by
  orchestrator" line.
- **Receipts** (if the coder captures any, e.g. survey JSON): `~/.hermes/cl/receipts/SHELL-PANE-SCROLL-1/<ts>/`.
  The survey script itself lives in `/tmp` and is NOT committed.
- **Commits**: one-or-few, each message naming the item and the mechanism, e.g.
  `[SHELL-PANE-SCROLL-1] AppShell: move the live pane-scroll declaration to the single-pane shape;
  PanelGroup panes get inline overflow:hidden from the library (dist:1458)` and
  `[SHELL-PANE-SCROLL-1] analysis: page-owned scroll door on .analysis (left pane clipped 3625 px
  of content)`. Two commits are preferred over one when the two files carry different arguments;
  do not split a single file across commits. `git -c core.fileMode=false`; never commit
  `node_modules`/`dist`.
- **Markers**: in-progress on claim; final line `SHELL-PANE-SCROLL-1 DONE <full-sha>` or
  `SHELL-PANE-SCROLL-1 BLOCKED <one line>`. The orchestrator merges; a CSS change needs no stack
  restart (Vite serves the file per request) — if the served-CSS receipt (§12.1) still shows the
  old text, the orchestrator restarts :5192.

## 15. Assumptions (composer; correct any you disagree with)

1. **The shipped viewport is 1440x900.** Every measurement in §3/§4/§6 was taken there. The fix is
   width-agnostic (no breakpoints), so the gate can be graded at 1440x900 plus whatever window Brad
   clicks at.
2. **:5192 serves the trunk checkout, not any worktree.** Hence the survey measures the BEFORE
   state there and the AFTER state is proven only post-merge (§12). This is the same instrument
   discipline FAME-LAYOUT-1 used.
3. **FAME-LAYOUT-1 is in flight and owns `.analysis-right`** (`AnalysisPage.css:57`). This item
   must not touch that rule; the two hunks are ~50 lines apart so a same-file merge is expected to
   be trivial, but §13.9 forbids hand-resolving a conflict.
4. **The single-pane path always renders `cl-workspace__pane--left`** (`AppShell.tsx:215`), so the
   scoped selector `.cl-workspace__panels--single > .cl-workspace__pane` covers every single-pane
   page today and any future one without a new class.
5. **The `/analysis` left-pane clip is a real product defect, not an artifact of an empty data
   state.** The clipped content is the `Runs` section (`top 1075`, height 2589) — the run list a
   user clicks to select an analysis — plus the lower part of `Run method`. Recorded from the live
   :5192 render, not inferred.
6. **No lane restart is required for a CSS change** (Vite serves per request; a hard reload
   suffices). If the served-CSS receipt disagrees, the orchestrator restarts — §14.
7. **`--nav` is in scope only for the deletion of its dead declarations**, not for a new door: the
   measured nav content fits (786/786) on both three-pane routes. See OQ-1.

## 16. Open questions for the orchestrator (max 3; each with what I checked)

- **OQ-1 — does the `--nav` rule belong in this diff?** The item names `--left` and "the analogous
  `--action` rule"; `--nav` (`AppShell.css:392-397`) is the same dead declaration on the same
  library mechanism (verified: nav pane inline `overflow: hidden` on `/runs/:id` and `/sequences`).
  I include its deletion in §5.1 because leaving one identical lie behind defeats the item's `why:`
  ("a rule that lies about behaviour invites wrong fixes later"), and it is two lines with a
  measured no-op. Checked: nav content fits on both three-pane routes (786/786), so deletion
  cannot change rendering. If you want the strict boundary, drop those two lines from the diff —
  nothing else in the spec changes.
- **OQ-2 — is the `/analysis` door inside this item or a separate one?** The acceptance's second
  arm allows "the rule is replaced by a working door on the page-owned root", which is exactly
  what §5.2 does, but it is the one place the diff leaves `AppShell.css`. I rule it IN because the
  survey found exactly one clipping surface and filing a follow-up for a 4-declaration CSS rule
  would leave the item's own acceptance unsatisfiable ("the rule is deleted with a comment" alone
  would not address a measured defect on the same surface). Checked: `.analysis` is the direct
  child of the left pane (`AnalysisPage.tsx:663`, measured `leftChild.cls === "analysis"`) and has
  no `style` prop, so the door needs no TSX. Confirm at promotion, or split it out and drop §5.2 +
  rows 17 of §4.
- **OQ-3 — dispatch order vs FAME-LAYOUT-1.** Both items touch `app/src/analysis/AnalysisPage.css`
  (`.analysis` vs `.analysis-right`). Options: (a) dispatch SHELL-PANE-SCROLL-1 now off the
  current trunk tip and accept a trivial same-file merge (git handles non-overlapping hunks; the
  fallback is §13.9's STOP); (b) hold until FAME-LAYOUT-1 merges so the file has one owner at a
  time. I recommend (b) if the lane is not starving — it removes the only merge risk in an
  otherwise one-file housekeeping item — and (a) is safe if throughput matters more. Checked: the
  two rules are `.analysis` (`:1-7`) and `.analysis-right` (`:57`), non-adjacent; FAME-LAYOUT-1's
  spec forbids it from touching `.analysis`.


---

## 17. ORCHESTRATOR RULINGS (BINDING, promotion tick 248TH, 2026-11-02 ~07:15)

- OQ-1 RULED IN: the --nav dead-declaration deletion is part of this item. Leaving one identical
  lie defeats the item's why:. Measured no-op stands (nav fits 786/786).
- OQ-2 RULED IN: the .analysis door is inside this item (§5.2 as drafted).
- OQ-3 MOOT: FAME-LAYOUT-1 MERGED (fa638303 in cl/integration-1; .analysis-right at
  AnalysisPage.css:57-72 with the four declarations). Branch off the cl/integration-1 tip the
  orchestrator pins at dispatch — it CONTAINS the .analysis-right change; do NOT touch that rule,
  and the same-file merge risk is gone.
- Orch first-hand premise verification at promotion: dist overflow:"hidden" at :1458 and :2182
  (v3.0.6) CONFIRMED; AppShell.tsx single-pane plain-div path CONFIRMED; AppShell.css rule
  positions CONFIRMED; .analysis rule (display/flex/gap/padding/max-width only, no door)
  CONFIRMED; tsc app baseline drifts (orch saw 12 and 21 error-TS lines on two checkouts the same
  morning — the gate is the worktree's own before/after diff, never an absolute count).
