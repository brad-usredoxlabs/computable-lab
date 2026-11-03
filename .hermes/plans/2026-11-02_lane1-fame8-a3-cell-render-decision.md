# LANE 1 — FAME-8 A3 cell-render decision (architect, 2026-11-02)

Requested by: lane-1 orchestrator tick 260TH (`2026-11-02_lane1-fame8-a3-cell-render-decision-request.md`).
Grounded against: `app/src/analysis/AnalysisPage.css` (rule at :123, door at :72–81, table width at :110,
chromatogram table at :189–191), `app/src/analysis/ViewRenderer.tsx` (`cellContent` :84–94, `view-spec__cell-item`
:88, `case 'table'` dispatch :460–461), `schema/knowledge/view-spec.schema.yaml` (:86–93 bindings/options free),
`scripts/fame-gatefix/assignment-contested-entry.py:729` (`ctx.view("assignment_results_view", "table", …)`),
gate3 receipts (`gate3-2115/report.md`).

## 1 — DECISION

**Option A, realized as a generic CSS floor keyed on the already-shipped value-shape class**: remove the
pane-wide `overflow-wrap: anywhere` from plain `th`/`td` (numbers/headers keep honest min-content and never break
mid-token), keep `anywhere` ONLY on `.view-spec__cell-item` (array cells keep wrapping inside their own column), and
let genuinely wide tables overflow the pane through the existing `.analysis-right` horizontal door.

## 2 — ACCEPTANCE-STANDARD REREAD (A3)

A3's "no h-scroll … table must FIT" is replaced, in the FAME-8 spec text, by:

> **A3 (r1):** at 1440×900 with the default divider position and NO drag: no content is illegible (no number or
> header word breaks mid-token; every value renders on one or more whole-token lines) and no content is
> unreachable (every column reachable inside the pane OR through the pane's own horizontal scroll door with real
> range, `maxScrollLeft > 0`). The table need not never-scroll; it must be legible and reachable.

D1's grade shape changes accordingly: the flags text was unreachable at 1723 px with a dead door; it is now
legible and reachable at ~740–820 px with a working door. "No divider drag" and "no mid-token breaking" stay hard.
This is a documented amendment to the spec wording, appended visibly by the orchestrator BEFORE dispatch — not a
silent drop.

## 3 — AUTHORITY

This is a **READING OF APPROVED INTENT — the orchestrator may proceed now.** All three constraints in play are
already approved: A3's literal fit, §7's non-negotiable no-mid-token rule, and FAME-LAYOUT-1's merged guarantee of
the horizontal door (accepted 0428ee7d) — measurements show they are mutually exclusive for a 10-column table in a
574 px pane, and the reread is the only reading that satisfies all three simultaneously. Nothing domain-facing
changes: rendered cells remain byte-identical to payload strings (no precision change, so Option C's product-intent
problem never arises), and the campaign itself already ratified scroll-door reachability as the mechanism for wide
tables. Required accompaniment (non-silence): orchestrator appends the §2 wording to the FAME-8 spec citing this
file, and lists "A3 re-read: fit → legible-and-reachable" in Brad's morning digest as an acceptance-criteria
clarification for the live click-test. If Brad overrules at the click-test, the fallback is his card, not a revert
loop.

## 4 — SHAPE — (i) generic CSS floor, not (ii) declared per column

**(i) is the decided shape, and (ii) is not available for this gate.** Two grounded reasons:
1. The gate-graded runs are frozen, contentSha-verified records (gate3 report §A3: "nothing was re-minted"); a
   per-column key in ANREV-000022's view-spec bindings would require a new revision/re-mint, which the campaign
   forbids.
2. The `table` renderer dispatch passes no `bindings` to `TableView` (`ViewRenderer.tsx:460–461`), so bindings
   can't reach the very arm that renders `assignment_results_view` (`assignment-contested-entry.py:729`) without
   new plumbing for a policy that is uniform across columns-by-shape, not per-column-by-name.

No new data key is required, so **no schema addition is required**. The floor is generic: it keys on the existing
data-driven class `view-spec__cell-item` (emitted by the value-shape branch, `ViewRenderer.tsx:85–91`) — zero
column names, artifact ids or flag substrings in CSS/TS, satisfying R8 the same way the FAME-LAYOUT-1 door does.
The smallest schema/data form IF a future measurement shows a named column needs an above-content floor:
`bindings.columnMinWidths: {"<payload field NAME>": <number of ch>}` in `schema/knowledge/view-spec.schema.yaml`
as a canonical-shape comment (bindings is already `additionalProperties: true`, :86–88 — no structural change)
consumed as an inline `min-width` on `th`, per the artifact-table slot convention. That is a future one-line data
item with its own contract pin; it is NOT part of this fix.

## 5 — IMPLEMENTATION CONTRACT (next coder run; branch off `cl/integration-1` @ 584ade4d)

ONE file changes: `app/src/analysis/AnalysisPage.css`. Zero TS changes, zero YAML changes (so no lane-stack
restart is forced by this fix).

Replace line 123 (`.view-spec__table th, .view-spec__table td { overflow-wrap: anywhere; white-space: normal; }`)
with exactly these semantics:

```css
/* FAME-8 GATEFIX5: plain cells never break a token in layout — auto table layout sizes
   every column to its honest min-content (longest whole token), so numbers and header
   words stay intact; `break-word` is only the last-resort valve if a cell is ever
   artificially narrowed. Wide tables then exceed the pane and stay reachable through
   the .analysis-right door (overflow:auto, :72-81); `.view-spec__table { width:100% }`
   (:110) keeps narrow tables fitting. */
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
/* Array-valued cells (ViewRenderer value-shape branch, .view-spec__cell-item) keep the
   D1 collapse — they wrap anywhere INSIDE their own column — with a content floor so
   auto layout cannot starve the column to one character. */
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
```

Semantics: numbers and header words never break mid-token (min-content = longest token); array cells keep wrapping
inside their own column; genuinely wide tables (14-col comparison_report_view) exceed the pane and the
`.analysis-right` horizontal door gets real range. Do NOT touch `:110`, `:72–81`, or the `.chromatogram__table`
rules (`:189–191` — separate classes, proven unscathed by gate3 leg B).

Test pins (new file `app/src/analysis/ViewRenderer.cellrender.test.tsx`, jsdom + source-pin; jsdom cannot measure
line boxes, so the mechanism is pinned here and the geometry is gate-pinned in §6):
1. Source-pin on the CSS file: no `overflow-wrap: anywhere` appears under any selector other than one containing
   `.view-spec__cell-item`; the `th`/`td` rule states `overflow-wrap: break-word`; `.analysis-right` still declares
   `overflow: auto`; `.view-spec__cell-item` declares a `min-width`.
2. DOM pin: a scalar numeric cell renders its digits as direct text of a single `td` (no wrapper div — a single
   line box is what the browser will then lay out); an array cell renders exactly one
   `div.view-spec__cell-item` per element, strings equal payload elements (extends the existing
   `ViewRenderer.test.tsx` array arm, which stays).

## 6 — RE-GATE CRITERIA (one cycle; receipts under `~/.hermes/cl/receipts/FAME-8/gate4-*/`)

- **ANR-000071 peak-1 row** (`assignment_results_view`): Range line-box count = **1** for `rt_min`
  ("4.946334540681159"), `area_pa_min` ("1664.7037274749032"), `area_percent` ("100"); every `th` paints its full
  token(s) (no `p`/`e`/`a`/`k` fragmentation); `flags` cell shows BOTH `div.view-spec__cell-item` nodes with all
  three substrings (`UNDEFINED_SIBLING_AREA_NULL`, `CONTESTED_CLAIM:…peak 1 (tentative)`, `CHEBI:143577`,
  `provisional`) fully painted once the pane's own horizontal door is opened — pane `maxScrollLeft > 0` (expect
  ≈150–250 px) and a trusted wheel dx=600 moves `scrollLeft`; A3-r1 wording (§2) is the graded criterion; a
  working h-scroll on this table is EXPECTED, not a D1 reopen.
- **ANR-000069** (`comparison_report_view`, 14 cols): `table.scrollWidth > pane.clientWidth` (expect ≈2000 px,
  the pre-fix readable width), pane `maxScrollLeft > 0`, trusted wheel dx=600 moves `scrollLeft` > 0,
  `butter_area_percent` "100" paints in 1 line box, per-column widths all ≥ honest min-content (no 28–52 px
  crushing).
- **ROUND-TRIP-GATE-1 kept**: one real AI round trip on `/analysis`, zero interception, request body + rendered
  answer captured.
- **Payload integrity kept**: `AOUT-000134` contentSha `0768786c…` unchanged, flags element strings == payload.
- **No-mid-token rule globally**: on every `.view-spec__table` seen in any leg, no numeric cell and no `th`
  exceeds 1 line box per whole token at its natural width.
- Console/page/failed-request errors = 0; served-candidate commit confirmed before any browser work.

## 7 — RISKS CARRIED

1. **Height**: the 4165 px/31-row measurement was taken WITH mid-token breaking (numbers 6 lines tall each).
   Under this fix numeric cells return to 1 line, so height drops substantially (estimated ~1500–2000 px,
   driven by label/flags wrapping) — likely near or below the 1120 px baseline's neighborhood. Gate must
   re-measure and report; a still-pathological height goes to the trade-off pile, not a defect.
2. **H-scroll on ANR-000071 (~150–250 px)** is now correct behavior under A3-r1; the gate must not grade it as
   D1 (see §6 wording). This is the whole cost of the reread — flag it plainly in Brad's morning digest.
3. **Column starvation**: `min-width: 12ch` on `.view-spec__cell-item` is a judgment floor (measured flags column
   was 123 px); if the array column still renders too narrow to read, that is the §4 data-key follow-up, not a
   re-gate loop.
4. The O1 separator NOTE (concatenated textContent across cell items) is unchanged and stays non-gating.
5. Nothing in this fix touches the chat, the chromatogram table, or the pre-existing red chrome (gate3 NOTES 6–7);
   those remain recorded, not graded.

ARCH DECISION WRITTEN /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-11-02_lane1-fame8-a3-cell-render-decision.md
