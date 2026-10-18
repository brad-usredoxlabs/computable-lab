# REG-2 CODER REPORT — DocumentShell width=full + opt-in draggable rail (lane 1, l1t0400)

Worktree: /mnt/vast/home/brad/git/wt/REG-2-lane1-l1t0400
Branch: wt/REG-2-lane1-l1t0400 @ base 033b7194 (post-REG-1/REG-3 merge tip)
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-17_REG-2-fullwidth-draggable-rail-spec.md
Canonical plan tasks 5/6/15/16 followed verbatim (W4-D1 + OQ-A/B/C adjudications binding).

## Commits (3)

- a45ac806 test(editor): RED pins for DocumentShell width posture + opt-in draggable rail (plan Tasks 5/15)
- ebf194fd feat(editor): DocumentShell width=full; registry editor uses the pane width  (Task 6, plan commit message verbatim)
- b2332e3e feat(editor): draggable registry rail (pointer splitter, localStorage-persisted)  (Task 16, plan commit message verbatim)  <- CODE HEAD

Diff surface (git diff 033b7194..b2332e3e --stat):
```
 app/src/editor/taptab/DocumentShell.test.tsx | 212 ++++++++++++++++++++++++++-
 app/src/editor/taptab/DocumentShell.tsx      | 112 +++++++++++++-
 app/src/editor/taptab/taptab.css             |  32 ++++
 app/src/pages/RecordRegistryPage.tsx         |   2 +
 4 files changed, 354 insertions(+), 4 deletions(-)
```
App-only. NO server/ or schema/ hunks. **YAML: none.** No package.json diff (no react-resizable-panels — W4-D1 respected; splitter is ~40 lines of pointer events on the existing flex body).

## Worktree bootstrap note

Dispatch claimed node_modules symlinks were pre-applied; at first check they were MISSING. I created them per lane convention (AS-L1T0400-REG2-001):
```
node_modules        -> /mnt/vast/home/brad/git/cl-integration-1/node_modules
app/node_modules    -> /mnt/vast/home/brad/git/cl-integration-1/app/node_modules
server/node_modules -> /mnt/vast/home/brad/git/cl-integration-1/server/node_modules
```
They show as untracked (`??`) because .gitignore's `node_modules/` pattern does not match a symlink; they were NEVER staged (staged-file lists below prove exactly 4 files per commit).

## BASELINE (taken before any edit, at 033b7194)

tsc base: `cd app && npx tsc --noEmit | grep 'error TS' | sort > /home/brad/.hermes/cl/lanes/1/tsc-reg2-base-l1t0400.txt` -> **23 lines**, none in DocumentShell/RecordRegistryPage/taptab.css (all pre-existing event-editor/ingestion/shared). Matches composer's honest trunk number (OQ-B).

taptab suite base (`npx vitest run src/editor/taptab`, raw: /home/brad/.hermes/cl/lanes/1/reg2-taptab-base-raw.txt):
```
 Test Files  3 failed | 13 passed (16)
      Tests  6 failed | 153 passed (159)
```
The 6 known pre-existing debt failures (documentMapper x2, RefCombobox x2, ChipComboboxWidget x2) — exact names captured for the delta-zero comm.

DocumentShell.test.tsx base: **12/12 PASS**.

## RED evidence (commit a45ac806, before any product edit)

`cd app && npx vitest run src/editor/taptab/DocumentShell.test.tsx` (raw: /home/brad/.hermes/cl/lanes/1/reg2-red-raw.txt):
```
 Test Files  1 failed (1)
      Tests  10 failed | 15 passed (25)
```
New pins failing pre-fix (FAIL lines verbatim from raw):
- width mode > width="full" lets the editing column fill the pane
- resizable rail > railResizable renders a vertical splitter before the rail
- resizable rail > drag clamps the rail to a 220px minimum
- resizable rail > drag clamps the rail to 40% of the body maximum
- resizable rail > restores a persisted width on mount, re-clamped (hostile stored value)
- resizable rail > restores a persisted width on mount when it is within bounds
- resizable rail > keyboard ArrowLeft widens the rail by 16px and persists (rail is right-anchored)
- resizable rail > keyboard ArrowRight narrows the rail by 16px and persists
- resizable rail > drag persists the rounded width to cl-registry-rail-width on pointerup
- resizable rail > toggles cl-rail-dragging on document.body during the drag

Expected incidental passes at RED (assert absence): 'defaults to the prose (capped) column', 'has no drag handle by default', 'railBelow suppresses the splitter' — per spec, not a broken RED.

## Interim check (Task 6 GREEN before any splitter code)

`npx vitest run src/editor/taptab/DocumentShell.test.tsx` (raw: reg2-green-task6-raw.txt): **9 failed | 16 passed (25)** — width describe fully green (12 existing + 2 width), all 9 remaining failures are the splitter pins. The default-posture tripwire (`not.toContain('document-shell--width-full')`) stayed green; no existing CSS rule was touched (width-full block appended after `.document-shell__column`, scoped selectors verbatim from plan Task 6).

## GREEN evidence (final, commit b2332e3e)

DocumentShell.test.tsx (raw: reg2-green-task16-raw.txt):
```
 ✓ src/editor/taptab/DocumentShell.test.tsx  (25 tests) 271ms
 Test Files  1 passed (1)
      Tests  25 passed (25)
```
(12 existing untouched + 13 new: 2 width + 11 rail. Composer's "16" estimate predates the dispatch-mandated clamp/restore/keyboard/persistence pins.)

Targeted suite gate `cd app && npx vitest run src/editor/taptab src/pages/RecordRegistryPage src/components/registry` (raw: reg2-suite-head-raw.txt):
```
 Test Files  3 failed | 24 passed (27)
      Tests  6 failed | 261 passed (267)
```
DELTA-ZERO proof (comm of sorted failing-test-name sets, base-taptab vs head-suite): **diff EMPTY** — the identical 6 named failures in the identical 3 files (documentMapper x2, RefCombobox x2, ChipComboboxWidget x2), all REG-3-territory debt per OQ-A adjudication. Zero new failures.

## tsc base vs head

```
23 /home/brad/.hermes/cl/lanes/1/tsc-reg2-base-l1t0400.txt
23 /home/brad/.hermes/cl/lanes/1/tsc-reg2-head-l1t0400.txt
diff base head -> EMPTY  (TSC DELTA ZERO at own base, per OQ-B)
```

## Bait audit (spec's reviewer bait, pre-empted)

1. Global de-cap: un-cap is scoped `.document-shell--width-full .document-shell__column .taptab-editor-container { max-width: none; box-shadow: none; }` — verbatim plan selectors; `--shell-column-max` untouched; default-posture test is the tripwire and stayed green.
2. No react-resizable-panels, zero package.json diff.
3. Splitter render guard exactly `rail && railResizable && !railBelow`; grep confirms ONLY RecordRegistryPage passes `railResizable`/`width="full"` (DocumentShell.tsx internals aside); RawRecordEditor/SlideOverEditor untouched, no splitter markup without opt-in.
4. Right-anchored clamp: `Math.min(Math.max(rect.right - clientX, 220), rect.width * 0.4)` — max wins ties, min/max order preserved.
5. Persistence: set once on pointerup (test asserts null mid-drag), `Math.round`, try/catch; restore-on-mount re-clamps (AS-ORCH-L1-167); afterEach removes `cl-registry-rail-width` so no cross-test leak.
6. Splitter CSS token-only: `var(--shell-border)`, `var(--shell-accent-soft)`, `var(--shell-accent)`; grep for hex/rgb/hsl in the new blocks -> zero.
7. No React-state drag: width set via `body.style.setProperty` on the DOM node; React state only for the `--dragging` class; `cl-rail-dragging` toggled on document.body in startDrag/up.

## Assumptions / deviations

- AS-L1T0400-REG2-001: node_modules symlinks were absent at dispatch despite the claim; created pointing at cl-integration-1's trees (lane convention; never staged).
- AS-L1T0400-REG2-002: dispatch's suite command spans 3 dirs (27 files) while my recorded suite baseline covers src/editor/taptab only (16 files). Delta-zero is proven on the failing-test-name comm (identical 6); the 11 extra head files (RecordRegistryPage/registry suites) all pass at head. No base capture exists for the wider scope at 033b7194.
- AS-L1T0400-REG2-003: jsdom reports zero rects for every element, so the restore-on-mount clamp reads a zero-width body unless `HTMLElement.prototype.getBoundingClientRect` is stubbed BEFORE mount. My clamp tests stub at prototype level (width 1000) and restore the original in afterEach. This supersedes my first attempt (per-element post-render stub — too late for the mount effect; it produced '0px' and was caught by the RED->GREEN loop). Product code unchanged by this; the spec's "do not write unit assertions on computed widths in jsdom" guidance is honored in spirit (stubbed rect is an explicit harness, not a jsdom-computed width).
- AS-L1T0400-REG2-004: keyboard-nudge base when no inline/stored width exists = 320px (the CSS `--shell-rail-width` default, taptab.css:14). The plan does not specify a keyboard base; 320 is the only sourced value.
- AS-L1T0400-REG2-005: hostile-restore test expects the 400px ceiling (40% of the stubbed 1000px body) for a stored 99999 — direct application of the binding clamp-on-restore ruling (OQ-C / AS-ORCH-L1-167).
- AS-L1T0400-REG2-006: `body { user-select: auto; }` is a global selector but is verbatim plan Task 16 CSS; kept verbatim.
- AS-L1T0400-REG2-007: RED commit carries the first test-file version; the rect-stub refinement rides in the Task 16 feat commit (harness mechanics, not product logic).
- AS-L1T0400-REG2-008: dispatch's end-token `REG2 DONE <sha>` supersedes the spec's `REG2 CODER DONE <head-sha>` wording; sha = final code commit b2332e3e.

## Staged-file lists (per commit, exactly)

- a45ac806: app/src/editor/taptab/DocumentShell.test.tsx
- ebf194fd: app/src/editor/taptab/DocumentShell.tsx, app/src/editor/taptab/taptab.css, app/src/pages/RecordRegistryPage.tsx
- b2332e3e: app/src/editor/taptab/DocumentShell.tsx, app/src/editor/taptab/DocumentShell.test.tsx, app/src/editor/taptab/taptab.css, app/src/pages/RecordRegistryPage.tsx

## Evidence files

- /home/brad/.hermes/cl/lanes/1/tsc-reg2-base-l1t0400.txt (23)
- /home/brad/.hermes/cl/lanes/1/tsc-reg2-head-l1t0400.txt (23, diff empty)
- /home/brad/.hermes/cl/lanes/1/reg2-taptab-base-raw.txt
- /home/brad/.hermes/cl/lanes/1/reg2-red-raw.txt
- /home/brad/.hermes/cl/lanes/1/reg2-green-task6-raw.txt
- /home/brad/.hermes/cl/lanes/1/reg2-green-task16-raw.txt
- /home/brad/.hermes/cl/lanes/1/reg2-suite-head-raw.txt

## Not done (by contract)

Browser gate (1600px width >900, drag/clamp/reload persistence ±2px, RawRecordEditor no splitter) is the orchestrator's post-merge cl-browser-reviewer step — not run here per dispatch. No stack restarted, no pushes, no merges.

REG2 CODER DONE b2332e3e
