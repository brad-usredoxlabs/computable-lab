# FAME-8-GATEFIX5 — cell-render floor: plain cells keep honest min-content, array cells keep wrapping
# Lane 1 · written by the 261ST orchestrator tick (2026-11-02T22:2x EST) · parent item: FAME-8
# Authority: ARCHITECT DECISION `.hermes/plans/2026-11-02_lane1-fame8-a3-cell-render-decision.md`
#   (§3: "READING OF APPROVED INTENT — the orchestrator may proceed now"). A3 amendment appended to
#   `.hermes/plans/2026-11-02_fame-8-spec.md` §11 (A3-r1) BEFORE this dispatch.
# Branch: cl/lane1-fame8-gatefix5-l1t2225, worktree /mnt/vast/home/brad/git/wt/FAME-8-GATEFIX5-lane1
# Base: cl/integration-1 @ 05c3c0e0 (tip-pinned; the worktree's HEAD must start there).
# Report path (UNIQUE, yours): /home/brad/.hermes/cl/lanes/1/deliverables/fame-8-gatefix5-report-l1t2225.md

## 0. What went wrong (the defect you are fixing)

FAME-8 GATEFIX4 added ONE rule at `app/src/analysis/AnalysisPage.css:123`:

```css
.view-spec__table th, .view-spec__table td { overflow-wrap: anywhere; white-space: normal; }
```

`anywhere` collapses EVERY column's min-content to ~1 character, so the table always fits the pane.
It fixed the `flags` cell (D1 reachability) and simultaneously SHATTERED every other cell: browser
gate 3 (receipts `~/.hermes/cl/receipts/FAME-8/gate3-2115/`, 18 shots, 72 trail steps, all ok)
photographed `rt_min "4.946334540681159"` split into 6 line boxes (`4.94`/`633`/`454`/`068`/`115`/`9`),
`area_pa_min "1664.7037274749032"` into 6 fragments, `area_percent "100"` into `10`/`0`, and headers
`peak` -> `p`/`e`/`a`/`k`, `eligible` -> `el`/`ig`/`ib`/`le`. One rule, two opposite outcomes.

## 1. The fix (architect-decided; do not redesign it)

ONE product file changes: `app/src/analysis/AnalysisPage.css`. Zero TS, zero YAML, zero schema.

Replace the GATEFIX4 rule at :123 — and the GATEFIX4 comment block directly above it, whose prose
describes behaviour that will no longer exist — with these two rules and this comment. Keep a
one-line history pointer so the trail is not erased:

```css
/* FAME-8 GATEFIX5 (supersedes the GATEFIX4 `anywhere` rule; architect decision 2026-11-02):
   plain cells never break a token in layout — auto table layout sizes every column to its honest
   min-content (longest whole token), so numbers and header words stay intact; `break-word` is only
   the last-resort valve if a cell is ever artificially narrowed. Genuinely wide tables then exceed
   the pane and stay reachable through the .analysis-right door (overflow:auto, :72-81);
   `.view-spec__table { width:100% }` (:110) keeps narrow tables fitting. */
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
/* Array-valued cells (ViewRenderer value-shape branch, .view-spec__cell-item) keep D1's collapse —
   they wrap anywhere INSIDE their own column — with a content floor so auto layout cannot starve
   the column to one character. */
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
```

Do NOT touch `:110` (`.view-spec__table { width:100% }`), the `.analysis-right` door at `:72-81`
(`overflow:auto`), or the `.chromatogram__table` rules (`:189-191`; separate classes, proven unscathed
by gate-3 leg B). No selector may gain a hardcoded column name, artifact id, flag substring or number
taken from a payload (R8 — the floor is generic and value-shape-keyed).

## 2. Test pins — NEW file `app/src/analysis/ViewRenderer.cellrender.test.tsx`

jsdom cannot measure line boxes, so the MECHANISM is pinned here and the GEOMETRY is gate-pinned
(browser gate 4). Both pins must be non-vacuous: each must FAIL against the pre-fix file.

1. **Source pin on `app/src/analysis/AnalysisPage.css`** (read the file with `fs`, do NOT import it
   through the bundler). Comments must be stripped before matching (`/\*[\s\S]*?\*/`), because the
   history/architect comment prose legitimately contains the words `overflow-wrap: anywhere`:
   - no `overflow-wrap:` declaration with value `anywhere` exists on any selector that does not
     contain `.view-spec__cell-item`;
   - the `.view-spec__table th, .view-spec__table td` rule declares `overflow-wrap: break-word`;
   - `.view-spec__cell-item` declares a `min-width`;
   - `.analysis-right` still declares `overflow: auto` (the FAME-LAYOUT-1 door is not regressed).
   Prove non-vacuity by asserting the pin's own matcher against the pre-fix string
   (`th, td { overflow-wrap: anywhere; white-space: normal; }`) in-test — i.e. the check is a
   function, called twice: once on the real file (expect pass) and once on the pre-fix text
   (expect fail). No hardcoded expectation of the whole file.
2. **DOM pin**: a scalar numeric cell renders its digits as DIRECT text of a single `td` (no wrapper
   `div`) — that is what lets the browser lay it out on one line box; an array cell renders exactly
   one `div.view-spec__cell-item` per element, each string equal to the payload element (extends the
   existing array arm in `ViewRenderer.test.tsx`, which must stay green and unmodified).

## 3. Boundary (hard)

Exactly TWO files in the diff:
- `app/src/analysis/AnalysisPage.css`
- `app/src/analysis/ViewRenderer.cellrender.test.tsx` (new)

Anything else — a TS change, a schema/ui YAML change, a snapshot update, an unrelated formatting
sweep — is OUT OF SCOPE: stop and report `OUT-OF-SCOPE <path> <reason>` instead of doing it. If you
believe the CSS alone cannot satisfy §1, STOP and report rather than inventing plumbing.

## 4. Verification you must run and paste verbatim into the report

```
cd app && npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx src/analysis/ViewRenderer.test.tsx
cd app && npx tsc --noEmit
git -c core.fileMode=false diff --stat <base>..HEAD && git -c core.fileMode=false status --porcelain
```
`tsc` on this trunk has PRE-EXISTING errors (baseline debt). Your acceptance is: ZERO new errors in
`app/src/analysis/` and zero in the two files you touched — report the total error count and the
baseline comparison, do not claim a clean `tsc`.

## 5. Report (unique path, §0 header)

`/home/brad/.hermes/cl/lanes/1/deliverables/fame-8-gatefix5-report-l1t2225.md`, ending with
`FAME-8-GATEFIX5 DONE <40-sha>`. Must contain: the exact diff file list; the two rules as written;
the RED evidence for BOTH pins (the pin failing against the pre-fix CSS/test text, with the real
command output); the GREEN run counts; the `tsc` before/after counts. Do not claim any browser
evidence — you cannot see the UI, and gate 4 is the orchestrator's job. Do not re-mint records, do
not touch `~/.computable-lab-lane1`, do not restart any stack.
