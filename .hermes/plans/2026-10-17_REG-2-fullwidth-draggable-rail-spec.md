# [DRAFT — for orchestrator review/promotion; do NOT dispatch a coder against this path]

# REG-2 SPEC — DocumentShell width=full + opt-in draggable rail (registry editor fills the pane)

DRAFT author: cl-spec-composer, lane 1, 2026-10-17. Composed while REG-1 is in progress.
Status: DRAFT. Canonical spec after promotion lives at
`.hermes/plans/` inside the lane trunk — this file is the execution spec AROUND the plan; the
plan remains the intent.

## Goal (one sentence)

Give `DocumentShell` an explicit `width?: 'prose' | 'full'` posture (default `'prose'`, so every
existing surface keeps the 720px capped paper column) and an opt-in `railResizable` pointer-drag
rail splitter persisted to localStorage, and have ONLY `RecordRegistryPage` pass both — because
registry records are wide QMS/diagnostic forms, not prose.

## Canonical intent (VERBATIM tasks)

CANONICAL PLAN: `.hermes/plans/2026-10-17_192653-registry-legibility-recordrefs-provenance.md`
(promoted to trunk at 8ac57673). **Read plan Tasks 5, 6, 15, 16 in full before touching
anything** (Task 5 at plan:620, Task 6 at plan:652, Task 15 at plan:1393, Task 16 at plan:1428).
The plan contains the exact test code (Tasks 5/15), prop/CSS snippets (Task 6), the drag handler
(Task 16), and the two commit commands — follow them verbatim. This draft adds execution
mechanics, baselines, and reviewer bait around them.

## Binding rulings (W4-D1, Brad 2026-10-17 — do not relitigate)

- Rail becomes USER-DRAGGABLE via opt-in `railResizable` prop; pointer-events splitter; clamp
  **[220px, 40% of `.document-shell__body`]**; localStorage key **`cl-registry-rail-width`**.
- **NOT `react-resizable-panels`.** DocumentShell's body is plain flex (`.document-shell__body`
  is `display:flex` — taptab.css:79-85); the AppShell drag+persist PATTERN is the precedent,
  not its Panel machinery. Re-platforming DocumentShell onto react-resizable-panels is a
  spec violation, not an implementation flavor.
- ONLY `RecordRegistryPage` opts in. `RawRecordEditor` and `SlideOverEditor` keep the fixed
  320px rail (`--shell-rail-width: 320px`, taptab.css:14) and show NO splitter.
- `railBelow` suppresses the splitter (render guard: `rail && railResizable && !railBelow`).

## Dependency / execution base — READ TWICE

REG-1 (token styling of RecordRegistryPage/RelatedRecordsCard) is IN PROGRESS on
`wt/REG-1-lane1-l1t2305` off 8ac57673. **REG-2 executes AFTER REG-1 merges.** At your execution
base:
- `app/src/pages/RecordRegistryPage.tsx` will ALREADY carry REG-1's className swaps, and
  `RecordRegistryPage.css` + `RecordRegistryPage.styling.test.tsx` will exist. The plan's
  RecordRegistryPage anchors will have shifted — anchor your edit on the JSX element
  `<DocumentShell` in that file (8ac57673 position was :703, `rail={` at :749; line numbers WILL
  differ post-REG-1, so treat these as orientation only, not anchors).
- **All baselines (tsc raw capture, DocumentShell.test.tsx pass count, taptab suite pass/fail
  set) MUST be RE-MEASURED at the post-REG-1 base in your worktree, not taken from this
  document.** The numbers below are composer measurements at 8ac57673-lineage trunk for
  orientation only.

## Worktree contract (worker)

- Worktree: `/mnt/vast/home/brad/git/wt/REG-2-lane1-<orch-tick>` — branch
  `wt/REG-2-lane1-<orch-tick>` off lane-1 trunk **at the post-REG-1-merge tip** (tick assigned
  by orchestrator at dispatch).
- `node_modules` symlinked at repo root, app/, server/ — do NOT pnpm install.
- ALL git commands with `git -c core.fileMode=false` (NFS mode-bit noise).
- Never `git add -A` — stage exactly the 4 in-scope files (below), per the plan's commit
  commands (Task 6 and Task 16 each carry an explicit commit; make both).
- Do NOT start/restart any dev stack; do not touch :3001/:5174/:3092/:5192; no merge, no push,
  no writes to either data dir. Browser gate is orchestrator-side after merge.
- Report at EXACTLY `/home/brad/.hermes/cl/lanes/1/reg2-report-l1t<orch-tick>.md` with: RED raw
  output (both new describes failing), GREEN raw output, taptab-suite base vs head raw captures,
  tsc base/head raw capture files + delta line count, staged-file list (both commits), every
  assumption/deviation. Last line exactly: `REG2 CODER DONE <head-sha>` (commit before it).

## Files IN scope (the entire diff surface — 4 files, both commits combined)

1. `app/src/editor/taptab/DocumentShell.tsx` — `width` prop + `railResizable` prop + splitter +
   drag/restore/keyboard logic.
2. `app/src/editor/taptab/DocumentShell.test.tsx` — append the two new describes VERBATIM from
   plan Tasks 5 and 15 (12 existing tests untouched; base pass count below).
3. `app/src/editor/taptab/taptab.css` — append the width-full block (Task 6) and the
   splitter/user-select block (Task 16). No existing rule is modified.
4. `app/src/pages/RecordRegistryPage.tsx` — add `width="full"` and `railResizable` to its
   `<DocumentShell ...>` — TWO props, nothing else. (Post-REG-1 this file also carries REG-1's
   className changes; do not re-touch them.)

## Files EXPLICITLY OUT of scope

- `app/src/editor/RawRecordEditor.tsx` (uses DocumentShell at :428 with `DocumentShellRail`)
- `app/src/components/registry/SlideOverEditor.tsx` (DocumentShell at :104)
- `/record` route surfaces, the protocol IDE (`app/src/event-editor/**`), TapTabEditor /
  FieldRow / documentMapper / RefCombobox / ChipComboboxWidget — these are REG-3/REG-4
  territory; zero diff there.
- Server, schema, `*.ui.yaml`, RelatedRecordsCard/RelatedRecordsCard.css (REG-1's files).
- `app/package.json` — adding `react-resizable-panels` or any dependency is a violation.

## Verified mechanics anchors (composer first-hand, trunk b5be05b8 = docs-only descendant of
8ac57673; code content identical for these files)

- `app/src/editor/taptab/taptab.css:13` `--shell-column-max: 720px;` — confirmed.
- `app/src/editor/taptab/taptab.css:14` `--shell-rail-width: 320px;` — confirmed.
- `app/src/editor/taptab/taptab.css:100` — **plan claim VERIFIED: the rail's flex-basis already
  reads the var**: `.document-shell__rail { flex: 0 0 var(--shell-rail-width); ... }`. Setting
  `--shell-rail-width` on `.document-shell__body` overrides it for that instance only — no other
  consumer changes.
- `app/src/editor/taptab/taptab.css:436-438` `.taptab-editor-container { width: 100%; max-width:
  var(--shell-column-max); ... }` — this is the cap that `.document-shell--width-full` must
  un-cap (plan Task 6's scoped selector).
- `.document-shell__body` is `display:flex` (taptab.css:79-85) — confirms W4-D1's "flex, not
  Panel machinery" premise; splitter is a flex child `flex: 0 0 5px`.
- Token vars the splitter CSS needs already exist: `--shell-border` (taptab.css:25),
  `--shell-accent-soft` (:20), `--shell-accent` (:29). NO new hex, none of your own.
- `DocumentShell.tsx:45` outer div is `<div className={`document-shell ${className}`}>` (Task 6
  rewrites it), `:52` body div gets `ref={bodyRef}`, `:55-63` the `{rail && <aside>}` (splitter
  goes immediately before it).
- Existing tests: `DocumentShell.test.tsx` has 6 describes / **12 tests, all PASS at base**
  (measured). It imports only `render/screen/cleanup/afterEach` — Task 16's restore-on-mount
  effect and localStorage assertions may need extra imports (`fireEvent`, `waitFor`) — extend
  the import line as needed; do not restructure existing tests.
- RecordRegistryPage: `<DocumentShell` at :703, `rail={...}` at :749, no `railBelow` usage — the
  two new props go on the same JSX element (8ac57673 line numbers; re-anchor post-REG-1).

## Exact edits (per plan Tasks 5/6/15/16 — verbatim, with execution notes)

**Task 5 (RED, width mode):** append `describe('DocumentShell width mode', ...)` from plan:620
verbatim. Run `cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx` → expect FAIL
(width prop unknown to TS is not a vitest failure; the failure is the missing
`document-shell--width-full` class assertion). RED must show BOTH its tests failing; if they
don't fail as predicted, STOP and report.

**Task 6 (GREEN, width):** `DocumentShellProps` gains `width?: 'prose' | 'full'` with the plan's
doc comment; destructure `width = 'prose'`; outer div becomes
`className={`document-shell document-shell--width-${width} ${className}`}` (note: template
literal, plan:668). Append Task 6's CSS block to taptab.css after the `.document-shell__column`
rule — the block is SCOPED (`.document-shell--width-full .document-shell__column
.taptab-editor-container { max-width: none; box-shadow: none; }`). In RecordRegistryPage add
`width="full"` to `<DocumentShell ...>`. Commit with Task 6's exact message.

**Task 15 (RED, splitter):** append `describe('DocumentShell resizable rail', ...)` from
plan:1393 verbatim. RED = the railResizable test fails (no separator); the default-NO-separator
test PASSES incidentally at RED (it asserts absence) — that is expected, not a broken RED;
only 1 of the 2 must newly fail.

**Task 16 (GREEN, drag/persist):** verbatim from plan:1428-1543, with these binding execution
notes:
- State/effects: `useRef`/`useState` imports must be added to DocumentShell.tsx (currently
  imports only default React — plan:13).
- Restore on mount: effect keyed on `railResizable` reads `localStorage.getItem('cl-registry-
  rail-width')`; if numeric, set `--shell-rail-width` on `bodyRef.current` **through the same
  [220, 40%-of-body] clamp** (a width saved in a wide window must not exceed 40% when restored
  in a narrow one; the clamp is the binding W4-D1 invariant, not a drag-time-only detail).
- Keyboard: `onKeyDown` on the splitter, ArrowLeft/ArrowRight nudge **16px** through the
  identical clamp + persist path. Sign matters: the rail is on the RIGHT, so ArrowLeft
  increases width (drag-left widens). If body width is unavailable (jsdom rect width 0) the
  clamp degenerates — do not write unit assertions on computed widths in jsdom; the two
  plan-verbatim tests + browser gate cover behavior.
- Drag body: `document.addEventListener('pointermove'/'pointerup')` per plan; width is
  `Math.min(Math.max(rect.right - ev.clientX, 220), rect.width * 0.4)` set via
  `body.style.setProperty('--shell-rail-width', ...)` — NOT React state (no re-render per
  pointermove); persist once, on pointerup, `Math.round`, inside `try/catch` (private mode).
- `cl-rail-dragging`: toggle on `document.body` in `startDrag`/`up` (remove on up even if the
  pointerup lands outside).
- Splitter render guard is exactly `rail && railResizable && !railBelow` and sits immediately
  before the `<aside>`, INSIDE `.document-shell__body`.
- CSS: Task 16's block verbatim (token-only: `var(--shell-border)`, `var(--shell-accent-soft)`,
  `var(--shell-accent)`), including `body { user-select: auto; }` and
  `body.cl-rail-dragging { user-select: none; cursor: col-resize; }`.
- In RecordRegistryPage add `railResizable` to the same `<DocumentShell>` (it already has
  `width="full"` after Task 6). Commit with Task 16's exact message.

## Acceptance criteria (VERBATIM from lane task list, item REG-2 "verified by")

> DocumentShell.test.tsx RED->GREEN for both the width describe and the resizable-rail
> describe (default = NO separator); cd app && npx vitest run src/editor/taptab -> PASS;
> app tsc no new errors. Browser gate per plan steps c + f: at 1600px viewport
> .taptab-editor-container width > 900; splitter drags, clamps at 220px/40%, survives
> reload (localStorage matches measured width +/-2px); RawRecordEditor shows NO splitter.
> cl-browser-reviewer VERDICT: accept.

**Composer caveat on "-> PASS":** the taptab suite does NOT pass at base. Composer measured
(base 8ac57673-lineage): **15 files, 3 failed | 12 passed; 156 tests, 6 failed | 150 passed**,
failures confined to `documentMapper.test.ts` (2 — stale heading expectations: "Provenance
(DERIVED)", "Localization (LOCAL_REALIZATION)"), `RefCombobox.test.tsx` (2), and
`widgets/ChipComboboxWidget.test.tsx` (2) — all ref/ontology-structured-value territory owned by
REG-3 (plan Tasks 7-12) / REG-4, none in REG-2's diff surface. Unless REG-3/REG-4 land BEFORE
REG-2, literal suite PASS is unachievable by REG-2's diff. **Operational gate for the coder:
REG-2's diff must be DELTA-ZERO — DocumentShell.test.tsx fully green (12 + 4 = 16 tests), and
the same 6 named failures, in the same 3 files, failing for the same reasons as your own base
capture; ANY new failure is a fix defect.** The orchestrator must reconcile the task-list
verified-by wording at promotion (see open question OQ-A).

**Browser gate outcomes (orchestrator-side, after merge; quoted for completeness):** 1600px
viewport → `.taptab-editor-container` rect width > 900 (was 720); splitter follows pointer,
clamps at 220px min / 40% max; after reload, `localStorage.getItem('cl-registry-rail-width')`
matches the rail's measured width ±2px; `/record` RawRecordEditor shows NO splitter; plan
verification block step f is the runbook (plan:1587-1591).

## First targeted check (proves the approach early)

After Task 6 GREEN only (before any splitter code):
`cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx`
→ 14/14 pass (12 existing + width describe), existing "defaults" test asserting NO
`--width-full` class still green. If the width describe can't go green without touching any
existing rule, stop — the scoped-CSS approach is wrong.

## Verification commands (complete)

```bash
# RED (Task 5), then RED (Task 15) — capture raw each time
cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx 2>&1 | tee ~/.../reg2-red-<n>-raw.txt
# GREEN (Task 6), GREEN (Task 16) — same command, expect 16/16
# Suite gate (delta-zero vs own base capture; see caveat above)
cd app && npx vitest run src/editor/taptab 2>&1 | tee <report-dir>/reg2-taptab-head-raw.txt
# tsc delta ZERO — own15 precedent: raw error-line capture files, sort, diff
cd app && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /home/brad/.hermes/cl/lanes/1/tsc-reg2-base-l1t<tick>.txt   # BEFORE any edit
cd app && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /home/brad/.hermes/cl/lanes/1/tsc-reg2-head-l1t<tick>.txt   # after final commit
diff /home/brad/.hermes/cl/lanes/1/tsc-reg2-base-l1t<tick>.txt /home/brad/.hermes/cl/lanes/1/tsc-reg2-head-l1t<tick>.txt   # MUST be empty
```
(Redact `~/.../` to the report dir; capture files go beside the report.)

## Baselines taken by composer at 8ac57673-lineage (b5be05b8) — MUST BE RE-MEASURED at the
post-REG-1 base

| Baseline (composer, 2026-10-17, trunk b5be05b8 ≡ 8ac57673 code) | Value |
|---|---|
| `cd app && npx tsc --noEmit` raw error lines | **23** (`error TS`) — raw capture: `/home/brad/.hermes/cl/lanes/1/evidence/reg2-tsc-base-8ac57673-lineage-raw.txt` (28 lines incl. continuation). All 23 are pre-existing, in event-editor/ingestion/shared — none in REG-2's files. NOTE: the REG-1 addendum claims "app tsc BASELINE = ZERO raw errors"; the own15 raw files are 0 lines but OWN-15's stage-set had no app/ files (those captures were evidently server-side). **23 is the honest app-side trunk number; the operative rule is base→head delta ZERO at YOUR base, not an absolute zero.** |
| `DocumentShell.test.tsx` | **12/12 PASS** (1 file) |
| `npx vitest run src/editor/taptab` | **150 passed / 6 failed (156); 12 files passed / 3 failed** — raw capture: `/home/brad/.hermes/cl/lanes/1/evidence/reg2-taptab-base-raw.txt`. The 6 named in the caveat above; pre-existing; NOT REG-2's to fix. |

## Reviewer bait (the gate hunts these — pre-empt them)

1. **Global de-cap.** `max-width: none` on bare `.taptab-editor-container` (or deleting
   `--shell-column-max`) would "pass" a naive test and silently widen the protocol IDE and every
   prose surface. The un-cap MUST be scoped under `.document-shell--width-full` (plan Task 6's
   exact selectors), and the default-posture test (`not.toContain('document-shell--width-full')`)
   is your own tripwire — keep it honest.
2. **Wiring `react-resizable-panels`.** Any package.json diff is an instant fix defect (W4-D1).
   The splitter is ~40 lines of pointer events.
3. **Splitter on non-opt-in surfaces.** `railResizable` must default false and the render guard
   is `rail && railResizable && !railBelow`. A splitter on RawRecordEditor/SlideOverEditor — or
   a always-rendered splitter hidden by CSS — violates the plan-verbatim default test AND the
   browser gate's "RawRecordEditor shows NO splitter".
4. **Wrong-axis clamp.** The rail is right-anchored: width is `rect.right - clientX`. Using
   `clientX - rect.left`, or clamping `[220, body.width*0.4]` against the COLUMN width or the
   viewport instead of `.document-shell__body` rect, inverts or misbounds the drag. Also:
   max wins ties when `40% < 220` (narrow body) — do not "fix" this with min/max order swap.
5. **Persistence laziness.** Persisting on every pointermove (writes per frame, no restore
   path), or restoring only a raw number without re-clamping on mount, or no try/catch around
   localStorage, or leaving `cl-registry-rail-width` in localStorage across tests so a later
   test's restore leaks into it (cleanup in afterEach).
6. **Hex in splitter CSS.** Only `var(--shell-border)` / `var(--shell-accent-soft)` /
   `var(--shell-accent)` (already defined, taptab.css:20-29) — REG-1's token-only precedent
   (ChangesPanel.css) makes any new hex/rgb/hsl a defect.
7. **Re-render drag.** Driving width through React state on pointermove (jank + fights the
   plan's `body.style.setProperty` contract) — the plan's mechanism sets the custom property on
   the DOM node directly; React state is used ONLY for the `--dragging` class.

## Ontology / knowledge-layer note

No claim/context/assertion touchpoints — pure presentation-layer item;
`docs/knowledge-layer-canonical-example.md` not in scope.

## COMPOSER OPEN QUESTIONS (unresolved locally — for orchestrator)

- **OQ-A (gate reconciliation):** task-list verified-by says taptab suite `-> PASS`, but base
  carries 6 pre-existing failures (documentMapper/RefCombobox/ChipComboboxWidget) that belong
  to REG-3/REG-4 territory. Checked: raw base capture above, git log (failures predate 8ac57673
  territory — composer did not bisect further), plan Tasks 7-12 (they change exactly the
  ref-commit behavior those 6 tests assert). Orchestrator must either (a) order REG-3 before
  REG-2's full-suite gate, or (b) accept the delta-zero formulation in the Acceptance section
  and amend the wording at promotion.
- **OQ-B (tsc baseline conflict):** REG-1 addendum says app tsc baseline ZERO; composer
  measures 23 raw errors on trunk (all pre-existing, out-of-scope files). Checked: own15 raw
  files (0 lines — but those runs evidently covered a server-only stage-set), re-ran tsc on
  trunk and on the computable-lab main tree (25 there — tree differs). The delta-zero rule at
  the coder's own base is safe either way; flag in the promoted spec so the reviewer doesn't
  chase phantom ZERO-vs-23 drift.
- **OQ-C (restore-on-mount clamp):** the plan text restores the stored number without re-clamping
  (plan:1500-1504); W4-D1 states the clamp as an invariant of the rail width, not of the drag.
  This spec directs clamp-on-restore (narrow-window restore of a wide-window width would
  otherwise breach 40%). Brad may prefer verbatim-plan; behavior differs only in the
  resize-then-reload edge.

COMPOSER DONE

---

## ORCHESTRATOR ADJUDICATIONS at promotion (l1t2355 tick) — BINDING for the coder

- OQ-A RESOLVED (option b): the operative full-suite gate is DELTA-ZERO against the coder's
  own base capture (the 6 pre-existing documentMapper/RefCombobox/ChipComboboxWidget failures
  are REG-3 territory, not REG-2's). DocumentShell.test.tsx itself must be fully green
  (16/16). If REG-3 merged before REG-2 dispatch, re-measure: those failures may be gone —
  delta-zero still binds either way. Task-list wording reconciled to this at claim.
- OQ-B RESOLVED: the binding rule is base->head DELTA ZERO at the coder's own worktree base
  (raw capture file), never an absolute-zero claim. REG-1's precedent holds (27-at-worktree vs
  23-at-trunk: node_modules symlink resolution differs between trees; delta-0 absorbs it).
- OQ-C RESOLVED (orchestrator ruling, minimal justified change): RESTORE-ON-MOUNT MUST
  RE-CLAMP through [220px, 40% of body]. W4-D1 states the clamp as the invariant of the rail
  width, not of the drag gesture; a wide-window width restored into a narrow window must not
  breach 40%. This supersedes the plan's unclamped restore snippet. Recorded as
  AS-ORCH-L1-167.
