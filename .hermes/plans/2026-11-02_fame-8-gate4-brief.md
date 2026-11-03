# FAME-8 gate 4 (post-GATEFIX5) — browser re-gate brief
# Written 261ST tick while the GATEFIX5 coder ran, so the gate can dispatch the moment the merge lands.
# Criteria authority: `.hermes/plans/2026-11-02_lane1-fame8-a3-cell-render-decision.md` §6 (architect).
# Graded acceptance wording: `.hermes/plans/2026-11-02_fame-8-spec.md` §11 (A3-r1) supersedes §10 A3.
# Receipts dir (create fresh, unique): ~/.hermes/cl/receipts/FAME-8/gate4-<HHMM>/
# Candidate revision: MUST be recorded from `git -C /mnt/vast/home/brad/git/cl-integration-1 rev-parse HEAD`
#   AFTER the merge, and the served checkout verified before any leg runs (`/api/schemas` 200 on :3092,
#   page HTML served from the cl-integration-1 tree, never from Brad's live tree).

## Pre-flight (orchestrator does this, not the reviewer)
1. Merge GATEFIX5 -> trunk; trunk HEAD sha becomes the candidate.
2. `cl-lane-stack.sh 1 status` = 200/200. NO YAML in the fix, so no restart is forced — but the app
   bundle must be rebuilt/served: verify the served bundle actually contains the new CSS rule by
   fetching the built stylesheet that :5192 serves and grepping `view-spec__cell-item` + `break-word`.
   A cache-busted reload is mandatory. If the served bundle is stale, restart the lane stack first.
3. Pin the candidate in the reviewer prompt; the reviewer repeats the served-revision check itself.

## Graded legs (architect §6) — every measurement by Range/geometry, not by eye alone

**G1 — ANR-000071 peak-1 row (`assignment_results_view`), 1440x900, default divider, NO drag.**
- `rt_min` cell ("4.946334540681159"), `area_pa_min` ("1664.7037274749032"), `area_percent` ("100"):
  line-box count = **1** each (Range.getClientRects().length on the cell's text).
- Every `th` paints its whole token — explicitly `peak` and `eligible` (gate-3 saw p/e/a/k and
  el/ig/ib/le).
- `flags` cell: BOTH `div.view-spec__cell-item` nodes present; all three substrings painted
  (`UNDEFINED_SIBLING_AREA_NULL`, `CONTESTED_CLAIM:...peak 1 (tentative)`, `CHEBI:143577`,
  `provisional`) once the pane's horizontal door is opened.
- Pane `maxScrollLeft > 0` (expect ≈150–250 px) and a trusted wheel dx=600 moves `scrollLeft`.
  **A working h-scroll here is EXPECTED and is NOT a D1 reopen** (A3-r1).

**G2 — ANR-000069 (`comparison_report_view`, 14 columns).**
- `table.scrollWidth > pane.clientWidth` (expect ≈2000 px, the pre-fix readable width).
- pane `maxScrollLeft > 0`; trusted wheel dx=600 moves `scrollLeft` > 0.
- `butter_area_percent` "100" paints in 1 line box; per-column widths all >= honest min-content
  (no 28–52 px crushing).

**G3 — ROUND-TRIP-GATE-1 kept.** One real AI round trip on `/analysis`: zero interception of
`/api/ai/**`, capture the outgoing REQUEST BODY as a receipt artifact, plus the rendered answer
screenshot.

**G4 — payload integrity kept.** `AOUT-000134` contentSha `0768786c…` unchanged; the flags element
strings rendered == payload strings (byte-identical; no precision or formatting change anywhere).

**G5 — no-mid-token rule globally.** On every `.view-spec__table` seen in any leg: no numeric cell
and no `th` breaks mid-token at natural width.

**G6 — console/page/failed-request errors = 0**; `trail.json` all steps ok.

## Non-gating observations to record, never to grade
- Table height re-measurement (architect §7.1: 4165 px was measured WITH 6-line numbers; expect a
  substantial drop — report the number, a still-pathological height goes to the trade-off pile).
- O1 separator concatenation across cell items (unchanged, non-gating).
- Pre-existing red chrome (`Cannot render 'null_area_policy'`), A8 refusal rendering, D2 x-tick clip,
  D3 `[object Object]` on frozen ANR-000056 — all remain recorded follow-ups.

## Verdict rules
- `VERDICT: accept` requires real trail + screenshots + the G1/G2 geometry numbers + the G3 request
  body. No accept on "mounted"/"visible DOM".
- `VERDICT: fix` must name the failing criterion and attach absolute screenshot paths.
- Tier ladder applies (tier-1 computable vision -> tier-2 OpenRouter deepseek if the run dies/hangs or
  returns no receipts -> orch-authored Playwright + artifact judging recorded as such).
