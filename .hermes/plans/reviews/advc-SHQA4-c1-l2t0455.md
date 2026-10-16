# ADVERSARIAL REVIEW — SH-QA-4 (lane 2, cycle 1)
# reviewer: cl-adversarial-reviewer (OpenRouter deepseek-v4.1-flash)
# item: SH-QA-4 | candidate: /mnt/vast/home/brad/git/wt/SH-QA-4-lane2-l2t0250
# branch: cl/SH-QA-4-lane2-l2t0250 | base 95f73755 | GREEN af5e9936 | tip 287189fd
# spec: .hermes/plans/2026-10-16_0300-SH-QA-4-tooltip-volume-spec.md (orchestrator rulings at bottom override draft body)
# coder report: .hermes/plans/SH-QA-4-report.wip-l2t0250.md

## 1. Diff read in full

`git diff --name-status 95f73755...af5e9936` — 10 files, all under app/src:
  A focus/WellTooltip.test.tsx, M focus/WellTooltip.tsx, M focus/wellStateProjection.test.ts
  A graph/context-panel/ContextPanel.test.tsx, M graph/context-panel/ContextPanel.tsx
  A graph/labware/WellTooltip.test.tsx, M graph/labware/WellTooltip.tsx
  M graph/lib/eventGraph.ts
  A graph/wellcontext/WellContextPanelV2.test.tsx, M graph/wellcontext/WellContextPanelV2.tsx
I read every hunk (eventGraph.ts full file, all 4 renderers, all 5 test files).

## 2. Contract scope / hard-untouchables — ZERO diff
  `git diff --stat 95f73755...af5e9936 -- server/ config/ schema/` -> EMPTY.
  `git diff 95f73755...af5e9936 -- server/src/compiler/scientistIntent/ server/src/compiler/resolution/resolutionEngine.ts server/src/ai/shorthandChat.ts config/drafting/shorthand-drafting.yaml` -> EMPTY.
  No YAML, no schema, no pins/goldens/e2e edits. Presentation/projection only. PASS.

## 3. Acceptance criteria (spec :166-171, verbatim) and how I checked each
  AC1 "Red-first unit tests on the well-state projection + WellTooltip render"
     -> CHECKED. RED commit 26017219 = 5 test files only (463 insertions, no product code); GREEN af5e9936 = 5 product files only.
  AC2 "composition event -> exactly one volume assertion (well total)"
     -> CHECKED. focus WellTooltip.test.tsx:60-62 asserts `.well-tooltip__volume` count 1 = '100.0 µL'; header render at WellTooltip.tsx:61.
  AC3 "component rows show fraction/role"
     -> CHECKED. Carrier volCell = fractionOfMixture (WellTooltip.tsx:90-92); role suffix (:97). wellStateProjection.test asserts fractions 50%/10% and role 'cells'. Sibling tests assert fraction in meta.
  AC4 "cells row count-only"
     -> CHECKED. count grant predicate unchanged (eventGraph.ts:519, role==='cells'||len===1); density attached by the SAME predicate (:531) and rendered beside count (WellTooltip.tsx:87-89). Focus test asserts '50,000 count' + '500 cells/uL', no volume.
  AC5 "single-material and dilution tooltips unchanged (existing tests green)"
     -> CHECKED, WITH ONE DEFECT (see §7). Targeted suites: base 16f/81t all pass; head 18f/89t (spec 4-dir) and 20f/93t (extended) all pass. BUT the `snapshot.length === 1` branch of "single-material adds" is NOT byte-unchanged on the concentration dimension (proven below).
  AC6 "Browser spot-check ... no separate gate run"
     -> Not this item's run (folded into SH-QB-1/SH-QC-1); coder correctly shipped no browser evidence. e2e pin app/e2e/deck-ghost-shorthand.spec.ts:329 `/50/` untouched and keeps matching the header. Out of my scope to run (browser); noted, not a defect.

## 4. Coded claims — attacks and results
  CLAIM 1 (multi-entry rows marked volumeIsCarrier; ledger carrierVolume_uL intact; transfer/merge/isMeaningful/row-survival untouched)
    -> VERIFIED. `isCarrierComposition = snapshot.length > 1` (:515); marker spread (:525). Ledger carrierVolume_uL:364 unchanged; merge sum :384 unchanged; isMeaningful :423-427 unchanged; transfer scaling :435 unchanged; row-survival filter :492 `volume_uL > 0.001 || count` unchanged. No hunk touches those lines.
  CLAIM 2 (parseMixtureFraction shape-only on 'source', never name-keyed, unparseable->nothing; no material literals)
    -> VERIFIED. Regex at :318 `/^\s*([\d.]+\s*%)\s+of\s+the\s+mixture\s*$/i` matches the compiler shape (server/src/compiler/biology/verbs/simpleVerbs.ts:385 `source: "${entry.fraction} of the mixture"`). Grep of added product lines for HepG2|FBS|PBS|DMEM|Matrigel|pUC19|trypsin|EDTA|clofibrate = NONE. Literals only in test fixtures.
  CLAIM 3 (counterDensity via same predicate as count grant; noEventConcentrationFallback ONLY in snapshot arm; no-snapshot arms byte-identical)
    -> PARTIALLY. counterDensity predicate `count !== undefined && details.counter_density` (:531) == count grant (:519) -> VERIFIED. Flag appears once (:532) in the snapshot arm only; no-snapshot arms (:535-549) show no diff -> VERIFIED. BUT the flag is NOT gated on isCarrierComposition — see DEFECT 1.
  CLAIM 4 (OQ1 FOUR render sites covered, carrier rows fraction+count/density never carrier volume, header single assertion, non-carrier rows byte-identical)
    -> VERIFIED with the same exception. All 4 sites read the marker: focus/WellTooltip.tsx:86-92; graph/labware/WellTooltip.tsx:100-106; wellcontext/WellContextPanelV2.tsx:279-285; context-panel/ContextPanel.tsx:261-267. Each has its own test file asserting "not.toContain('100.0 µL')" on carrier rows. Non-carrier RENDER branches are byte-identical (diff shows same JSX output; verified conc·vol·count join). The single-entry-snapshot non-carrier row diverges via the projection, not the JSX — DEFECT 1.
  CLAIM 5 (verification bars: 20f/93t; app tsc 23 empty sorted-diff; server tsc byte-identical; symlink repair harness-only; base 23/1 reproduce)
    -> FULLY VERIFIED by independent re-run (see §5/§6).
  CLAIM 6 (no fraction math, no reagent/cell-line literals, stop_boundary honored, carrierVolume_uL not zeroed)
    -> VERIFIED. No added line multiplies/divides a volume by a parsed percentage; carrierVolume_uL never reassigned/zeroed.

## 5. Commands I ran (real output)

  # spec targeted (4 dirs), HEAD:
  cd app && npx vitest run src/event-editor/focus src/graph/lib src/graph/labware src/shared/lib
    -> Test Files 18 passed (18) | Tests 89 passed (89)
  # extended (add wellcontext + context-panel), HEAD:
  cd app && npx vitest run src/event-editor/focus src/graph/lib src/graph/labware src/shared/lib src/graph/wellcontext src/graph/context-panel
    -> Test Files 20 passed (20) | Tests 93 passed (93)      [matches coder claim 20f/93t]
  # app tsc HEAD: `cd app && npx tsc --noEmit` -> 23 error TS lines
  # server tsc HEAD: `cd server && npx tsc --noEmit` -> 1 error TS
       src/ai/AgentOrchestrator.ts(345,18): error TS2339 ... ; md5 745876ef4a13beb3ab5c10b636cd255e

  # independent BASE reproduction (fresh detatched worktree at 95f73755, 60 lane-exclude
  # symlinks + root node_modules replicated — no tracked file touched):
    base app    tsc -> 23   | base server tsc -> 1  md5 745876ef4a13beb3ab5c10b636cd255e
    diff <(grep 'error TS' base-app | sort) <(grep 'error TS' head-app | sort) -> EMPTY
    diff base-server-tsc head-server-tsc -> BYTE-IDENTICAL
    base targeted vitest (4 dirs) -> Test Files 16 passed (16) | Tests 81 passed (81)   [matches coder claim 16f/81t]

  # symlink repair harness-only check:
    git diff 95f73755...af5e9936 -- .gitignore app/.gitignore server/.gitignore app/vitest.config.ts app/tsconfig.json -> EMPTY
    git status --porcelain -> clean; 60 symlinks are git-ignored via ~/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430 (outside the repo), not a tracked config.
    NOTE: the base reproduce HELD a hidden gotcha — a fresh worktree without the hoisted root node_modules
    reports inflated counts; my first base run gave 0/0 (npx fell back to the decoy 'tsc' package).
    After linking root node_modules the 23/1 pair reproduced exactly. The coder's 27/26 -> 23/1
    account is consistent with this mechanism; the repaired 23/1 is authoritative and reproducible.

  # post-GREEN commits:
    git show --stat 36ca0c2e -> report file only (110 ins)
    git show --stat 287189fd -> report file only (26 ins)
    git diff --stat af5e9936...287189fd -> 1 file (.hermes/plans/SH-QA-4-report.wip-l2t0250.md)
    -> the "two docs commits after GREEN, report files only" claim is TRUE.

## 6. The base-vs-head behavioural probe (headline evidence)
  Temp test in BOTH worktrees: a schema-valid event with composition_snapshot.length === 1,
  event-level details.concentration {1,mM}, entry WITHOUT concentration.
    BASE 95f73755 -> material = { materialRef:"X", role:"solute", volume_uL:50, concentration:{value:1,unit:"mM",basis:"molar"} }
    HEAD af5e9936 -> material = { materialRef:"X", role:"solute", volume_uL:50 }   <- concentration GONE
  (probe files removed; candidate `git status` clean; temp worktree removed.)

## 7. DEFECTS

DEFECT 1 — MAJOR-ish, but currently compiler-unreachable (I still report it: it is a real,
reproducible divergence from an explicit requirement + the coder's own claim, with a test gap).
  path:line  app/src/graph/lib/eventGraph.ts:532   (`noEventConcentrationFallback: true,`)
  rule       Requirement 3 / spec design item 2 (:149-153): "Single-material adds
             (`snapshot.length === 1` or no snapshot): volume IS the material's volume; current
             display byte-unchanged." Orchestrator attack-list #4: "non-carrier rows byte-identical."
             Also spec bait B2 (:245-248): a fix keyed off `snapshot.length > 0` instead of `> 1`
             "silently changes single-component-snapshot adds."
  why        The flag is passed UNCONDITIONALLY in the snapshot arm (all `snapshot.length > 0`),
             while `volumeIsCarrier`/`fractionOfMixture` are correctly gated on
             `isCarrierComposition = snapshot.length > 1` (:515/:525/:528). A single-entry
             composition_snapshot is a spec-named NON-carrier "single-material add", but the
             event-level concentration fallback (:344-348) is killed for it, so its concentration
             display flips from "1 mM" to "no concentration" — a false honesty regression.
             Proven base-vs-head in §6. Not caught by the T3 single-entry pin
             (wellStateProjection.test.ts:150-172 checks only volume + marker absence, not concentration).
             Reachability: the shipped compiler never emits a 1-entry snapshot
             (simpleVerbs.ts compositionSnapshotFromParams requires >=2), BUT
             schema/workflow/events/plate-event.add-material.schema.yaml:114-118 gives
             composition_snapshot no `minItems`, so a 1-entry snapshot is schema-valid input from
             any other producer / future path.
  fix dir    Gate the guard on the same predicate as the marker — pass
             `...(isCarrierComposition ? { noEventConcentrationFallback: true } : {})` — and add a
             T3 assertion that a single-entry snapshot WITH an event-level concentration keeps its
             concentration display. (Do not patch the test to accept the drop.)

## Notes (non-defects, recorded for completeness)
  - parseMixtureFraction is invoked twice in the same spread (:528). Harmless; cosmetic.
  - acceptedEventGraphProjection.ts:171 and LabwareEventEditor.tsx:1881/1997/3340 still read
    material.volume_uL (which for carrier rows is the marked carrier). Those are projection/event-
    drafting paths, not the four OQ1 render sites, are unchanged by this diff, and the spec
    deliberately leaves them byte-identical. Not a defect of this item.
  - The 27 vs 23 tsc discrepancy in the coder's report is fully explained by the missing hoisted
    node_modules / lane-exclude symlinks; the repaired 23/1 pair reproduces exactly. No dishonesty.

VERDICT: FIX
  1. app/src/graph/lib/eventGraph.ts:532 — gate `noEventConcentrationFallback` on
     `isCarrierComposition` (snapshot.length > 1) so single-entry composition_snapshot rows keep
     today's concentration display (requirement 3 byte-unchanged); extend the T3 pin to assert it.
