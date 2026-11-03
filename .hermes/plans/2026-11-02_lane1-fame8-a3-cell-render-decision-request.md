# LANE 1 — FAME-8 A3 acceptance read + cell-render decision request (architecture)

- Requested by: lane-1 orchestrator tick 260TH, 2026-11-02 ~22:10 EST
- Task: **FAME-8** (in-progress; code merged at **879192cc** on `cl/integration-1`, browser gate cycle 3 returned **VERDICT: fix**)
- Deliverable asked of the architect: ONE written decision at
  `/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-11-02_lane1-fame8-a3-cell-render-decision.md`
  answering the question in §6 and stating explicitly, per option, whether it is a **reading of approved intent**
  (architect may decide) or an **acceptance-criteria amendment** (must go to Brad).
- Why an architect and not another coder run: this is the **3rd** A3 fix verdict on FAME-8 and the two candidate
  fixes are mutually exclusive under the current criteria text. A fourth blind coder run would trade one defect for
  the other (measured; see §4). Pre-committed counter (AS-L1T253-2) says stop at 3.

## 1 — What is actually deployed (my own diff read, not a worker's summary)

`879192cc` = merge of `cl/lane1-fame8-gatefix4-l1t1855`; product delta `5e861a0e..879192cc`:
- `app/src/analysis/ViewRenderer.tsx` +27/-2 — array-valued cell now renders one
  `div.view-spec__cell-item` per element (generic `Array.isArray` branch), plus `app/src/analysis/ViewRenderer.test.tsx`
  +46 (4 files / 46 tests green, my own run) and `app/src/analysis/AnalysisPage.css` +12 (below).
- The CSS rule that causes the current defects (verbatim, `AnalysisPage.css:123`):
  ```css
  .view-spec__table th, .view-spec__table td { overflow-wrap: anywhere; white-space: normal; }
  ```
  `overflow-wrap: anywhere` **reduces every column's min-content to ~1 character**, so with
  `.view-spec__table { width: 100% }` and auto table layout the table always collapses to the pane width
  (534 px of content in a 574 px pane) instead of overflowing it. That is exactly what D1 needed for the
  `flags` cell — and exactly what destroys every other column.

## 2 — Gate cycle 3 result (first-hand audit by me, not the reviewer's word)

Receipts `~/.hermes/cl/receipts/FAME-8/gate3-2115/` (`report.md` 221 lines, `trail.json` 72 entries all `ok`,
17 shots + `shot-md5.txt` with 3 disclosed identical groups, `legE/request-round-trip.json` real SSE body,
0 console / 0 page / 0 failed-request errors). Served candidate confirmed `879192cc` (`GET :5192/src/analysis/
ViewRenderer.tsx` contains `view-spec__cell-item`; CSS module carries the rule). I opened the two exhibit
screenshots myself and read the shattered cells directly — the reviewer's numbers are true.

- **PASS — D1 (cycle-2's defect) is genuinely closed.** Pane 574/574 (clientWidth == scrollWidth), table 534 px
  inside it, `flags` td x 1296→1420 with pane right edge 1440, `clientWidth 122 == scrollWidth 122`, 20 px
  clearance, no horizontal scroll, all of `UNDEFINED_SIBLING_AREA_NULL`, `CONTESTED_CLAIM:Methyl hexanoate
  (6:0 FAME) - FAME-2 standard peak 1 (tentative)`, `CHEBI:143577`, `provisional` painted. Payload unchanged
  (AOUT-000134, 2-element array, contentSha `0768786c…`).
- **DEFECT 1 (medium, NEW — regression of the same rule).** Numeric cells unreadable at the same edit:
  `rt_min "4.946334540681159"` (46 px) painted `4.94`/`633`/`454`/`068`/`115`/`9` (6 line boxes);
  `area_pa_min "1664.7037274749032"` (46 px) → `166`/`4.70`/`372`/`747`/`490`/`32`; `area_percent "100"`
  (36 px) → `10`/`0`; headers `peak` (28 px) → `p`/`e`/`a`/`k`, `eligible` → `el`/`ig`/`ib`/`le`.
  Shots: `exhibits/E1-anr000071-peak1-cells-zoom.png`, `E2-anr000068-peak1-cells-zoom.png`.
- **DEFECT 2 (medium, NEW).** ANR-000069's 14-column `comparison_report_view` crushed to 534 px, columns
  28–52 px, `maxScrollLeft = 0` → **FAME-LAYOUT-1's horizontal door has zero range** (trusted wheel dx=600 moved
  `scrollLeft` by 0). Pre-fix this table was `scrollWidth 2089` vs pane 574 — wide but readable by scrolling.
  Shot: `exhibits/E3-anr000069-14col-zoom.png`, `legD/shots/10-02-after-vertical-wheel.png`.
- **Trade-off already measured:** `assignment_results_view` is now **4165 px tall** for 31 rows (cycle-2
  baseline 1120 px) — ~13 screens of vertical scrolling at 829 px pane height. The wrap-everything fix does fix
  reach (D1) but converts a horizontal-reach problem into a vertical-scan problem.

## 3 — The reviewer's own direction (agrees with my diagnosis)

> "the two tables need opposite treatment. The flags *reach* fix does not require collapsing every column — a
> per-column minimum width (optionally declared in the view-spec data, per 'things that can be data should be
> data') plus the preserved `.analysis-right` scroll door keeps genuinely wide tables wide and readable, while the
> long array/flag cell still wraps inside the pane. Numeric cells should not break inside a token at all."

## 4 — Why that direction cannot be applied alone (the arithmetic that forces this decision)

`assignment_results_view` (ANR-000071) has 10 columns. Readable min-content per column, with numbers **not**
breaking mid-token (i.e. `overflow-wrap: anywhere` removed from plain cells):

| column | content | honest min width |
|---|---|---|
| peak | `1` | ~40 px |
| rt_min | `4.946334540681159` | ~110 px |
| assigned_label | `Methyl hexanoate (6:0 FAME) — …` (breaks at spaces) | ~75 px |
| assigned_ref | `LOCA:L:methylhexanoate-n6` (breaks at `:`/`-`) | ~90 px |
| assignment_state | `verified` | ~60 px |
| eligible | `true` / `null_area` | ~55 px |
| bucket | (empty) | ~40 px |
| area_pa_min | `1664.7037274749032` | ~120 px |
| area_percent | `100` | ~40 px |
| flags | array text (may break anywhere) | ~110 px |
| **table min** | | **≈ 740–750 px** |

The default report pane is **574 px** (content 534 px) at 1440×900 with no divider drag. So for THIS table:

- **Option A — per-column min widths + wrap only the array cell** (reviewer's direction): columns readable and
  numbers intact, table ≈750 px ⇒ the pane **scrolls horizontally** (`maxScrollLeft ≈ 176`). Defect 1 and 2 fixed,
  FAME-LAYOUT-1 door restored for wide tables — but A3's literal wording *"no h-scroll … table must FIT"* is then
  **not met** for ANR-000071, and the `flags` cell's reach would again depend on a horizontal scroll of ~176 px
  (the exact complaint D1 was filed about, at a much smaller magnitude).
- **Option B — keep wrap-everything, fix only numeric/header cells** (e.g. `white-space: nowrap` +
  `min-width` on numeric `td`/`th` only, `anywhere` restricted to the array cell): defect 1 fixed, but the table
  then exceeds the pane again ⇒ same h-scroll as A, plus the 4165 px height cost stays.
- **Option C — reduce displayed precision** of long decimals (e.g. 6 significant digits on display, full value in
  `title`/tooltip; or declarative display-precision in the view-spec YAML): this is the only variant that fits
  ANR-000071 in 574 px without breaking a number or scrolling. It is also a **product-intent change** — the
  rendered cell would no longer equal the payload string, which the gate has been grading ("elements equal
  payload"); and precision policy is domain-facing (a lab reading a number off screen).
- **Option D — widen the report pane** (default split, or per-view-spec pane width): touches global layout, out of
  FAME-8's surface, and changes Brad's default screen for every surface. Not recommended inside this item.

## 5 — My recommendation (for the architect to confirm or overrule)

**A + a re-read of A3**: treat "table must FIT" as *"no content is unreachable and no value is illegible"*, i.e.
fit **or** reachable-through-the-declared-scroll-door with per-column minimum widths, rather than "never scrolls".
Keep "no divider drag" and "no mid-token breaking of numbers/headers" as hard. This is the only reading that is
consistent with FAME-LAYOUT-1 (which was filed **by the same campaign** precisely to guarantee the horizontal door
for wide tables); the two criteria cannot both be literal for a 10-column table in a 574 px pane.
Preferred *declarative* shape (CL ground rule): column min-width / no-break / array-wrap policy declared **in the
ui/view-spec YAML** consumed by `ViewRenderer`, not a new blanket CSS rule — but only if the existing view-spec
schema already has a place for it; if that would mean a schema change, say so and I will route it as a separate
one-line data item with its contract pin rather than smuggling layout policy into TS.

## 6 — The question

> For FAME-8's A3 leg, which of A/B/C/D (or another reading you state) is the acceptance standard, and is a
> per-column minimum width / no-mid-token-break policy to be (i) a generic CSS floor in
> `app/src/analysis/AnalysisPage.css`, or (ii) declared per column in the view-spec YAML with `ViewRenderer`
> consuming it? State explicitly whether your answer is a **reading of approved intent** (decide and I proceed)
> or requires a **Brad amendment** (I will file one card with your recommendation and consequences).
> If you choose a declarative shape, name the exact existing data surface (file + key) or state that a schema
> addition is required and what the smallest one is.

## 7 — Constraints the decision must respect

- No mid-token breaking of numeric values or header words (gate-graded, non-negotiable).
- `flags`/array cells keep wrapping inside their column (D1 must not reopen).
- No hardcoded column names / artifact ids in TS or CSS (CL: things that can be data should be data).
- Trunk is `cl/integration-1` @ `584ade4d`; the fix will be a fresh branch off it. No schema/lint/ui YAML change
  without its contract pin, and any YAML change forces a lane-stack restart before re-gate.
- No fourth blind attempt: the next coder run implements the decided option directly, then one browser re-gate.
