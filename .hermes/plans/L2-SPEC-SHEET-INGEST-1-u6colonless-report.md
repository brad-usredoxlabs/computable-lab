# L2-SPEC-SHEET-INGEST-1 · unit u6colonless · lane 2 · REPORT

Status: **BLOCKED** — one-site guard implemented and verified for D1; the flipped D2
pin on the full cotaus fixture cannot go green without a second code site the brief
freezes. Exact case + recommended ruling below. Tree clean at exit; guard+tests
committed (they are correct and needed for D1 regardless of the ruling).

Worktree /home/brad/cl-wt/L2-SPECSHEET-u6cl-lane2, branch cl/lane2-specsheet-u6cl,
base a4ca2e9a (descendant of 89b5912c — verified).
Owner/run: cl-worker lane2 overflow run=u6colonless-l2t2100.

## Commits
- e4003c8d RED legs (flip :204-210 pin to toHaveLength(0) naming g4 D2; + 3 legs:
  D1 nest-header, D2 isolated chrome line, positional guard leg)
- c14df926 production change: loop guard at :238-242 becomes
  `if (seg.label !== seg.value && keywords.some((kw) => labelMatches(seg.label, kw))) {`
  (exactly the brief's one site; segmentLine, isHeaderRow, positional arm,
  whole-line fallback, single-segment arm, TRANSFORMS, YAML all untouched —
  `git diff a4ca2e9a --stat` = 2 files, +86/-6, all in the two owned files)

## RED-before (raw, at e4003c8d before the guard)
```
 ❯ src/ingestion/SpecSheetExtractor.test.ts  (19 tests | 3 failed)
 Test Files  1 failed (1)
      Tests  3 failed | 16 passed (19)
```
(= flipped :204-210 pin + D1 leg + D2 leg all RED; guard leg GREEN)

## GREEN-after (raw, at c14df926 with the guard)
```
 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```
The single failure is ONLY the flipped full-fixture pin (:210). D1 leg GREEN,
D2 isolated-chrome leg GREEN, guard leg GREEN.

## Mutation probe (raw)
Guard removed (sed back to `keywords.some(...)` alone), D1+D2 legs:
```
 Test Files  1 failed (1)
      Tests  2 failed | 1 passed | 16 skipped (19)
```
(D1 + D2 legs RED without the guard; guard leg GREEN. Restored → state above.
Both new legs are load-bearing.)

## Other VERIFY items (raw)
- labelMatch + FieldMaps: `Test Files 2 passed (2) / Tests 11 passed (11)` (labelMatch fixture NOT touched)
- `npx tsc --noEmit -p .` -> zero lines (exit 0)
- `git status --short` -> clean (see exit sha commit below)

## THE BLOCK — exact case (why the flipped pin cannot go green at one site)
The cotaus line is chrome segments FOLLOWED BY colon segments:
`Manufacturer | OEM/ODM Supplier | Wholesale Factory Price ◉ Reservoir Material: Polypropylene (PP) ◉ ... ◉ Reservoir Capacity: 195 mL, 185 mL ◉ ...`
After the guard correctly rejects every segment in the label arm, control falls to
the **whole-line fallback at :257-263** (frozen by brief SCOPE/THE CHANGE). It fires:
labelMatches takes trimmed.split(':')[0] = "Manufacturer | OEM/ODM Supplier | Wholesale Factory Price ◉ Reservoir Material", which startsWith "manufacturer" -> matched; extractValue's lazy `^(.+?):\s*(.+)$` grabs everything after the FIRST colon. Measured output (probe):
```
PROPOSAL vendor => "Polypropylene (PP) ◉ Reservoir Format: Single well ◉ Reservoir Capacity: 195 mL, 185 mL ◉ Reservoir Color: Clear ◉ ... ◉ Compatibility: Multichannel pipettes & automated pipetting systems"
PROPOSAL capacity.max_well_volume_uL => "195 mL, 185 mL"
```
i.e. a page-wide blob as vendor — strictly worse than the g4-measured "Manufacturer" echo.
Receipts confirm the g4 value came from the label arm (lw-0f2fc1.json value="Manufacturer"),
so the guard kills the measured defect but the fallback re-introduces a fatter one on this fixture.
The isolated chrome line (no colon anywhere) yields NO proposal under the guard — proven GREEN.

## Recommended ruling (orchestrator's call — one of)
A. Gate the fallback in the multi-segment branch (2nd site, one line): run the
whole-line fallback only when no segment had a value delimiter, or skip it when
`segments.length > 0` and at least one segment matched by label position — needs
an audit of which existing legs rely on :257-263 (none visible: all 16 baseline
legs + labelMatch stay green with the fallback SKIPPED for multi-segment lines —
measured: only the flipped pin changed).
B. Widen the brief to two sites (guard + fallback condition) — same seam, one file.
I did NOT do this unilaterally per THE CHANGE ("Do NOT touch ... the whole-line fallback").

## Work completed / still possible
Done: D1 fully closed and mutation-proven; guard leg proves positional arm intact;
pin flipped per brief; all non-cotaus-fixture legs green; tsc clean; labelMatch/
FieldMaps green. Remaining: one orchestrator ruling, then a one-line follow-up in
this worktree flips the last pin green (est. <10 min + re-VERIFY).

L2-SPEC-SHEET-INGEST-1 UNIT u6colonless BLOCKED one-site guard fixes D1 fully, but the frozen whole-line fallback (:257-263) re-emits the cotaus line as a page-wide blob vendor value, so the flipped full-fixture pin needs a ruling on a second site (fallback gating) per THE CHANGE's don't-widen instruction
