# L1-CELLRENDER-1 report — lane 1, run l1t0057 (THUNDERBEAST cl-worker)

Branch `cl/lane1-cellrender-1-l1t0057`, base `1a443259`.
Commits: `ade2a13f` (RED pins, proven failing at base) → `9e455216` (GREEN + schema comment) → this report.

## 1. What changed and why

Root cause (ruling-confirmed): `app/src/analysis/ViewRenderer.tsx` `cellContent()`
formatted every cell with `String(value ?? '')` (old :93) and the same to array
ELEMENTS (old :89), so the object-valued `params` column of `effective_parameters`
(ANR-000056 / ANR-000071, a dict behind a declared `type: string`) rendered the
literal text `[object Object]`.

Fix in the SHARED cell path, three parts per the ruling:

- `app/src/analysis/ViewRenderer.tsx`
  - FALLBACK ARM (:104-119): `scalarCellText()` holds the ONLY `String(` in the
    cell path and is reached only after `isCellScalar()`/null narrowing; any
    other shape renders `jsonCell()` = compact `JSON.stringify(value)` on a
    `<span class="view-spec__cell-json" title={text}>` — full text on `title`,
    never `[object Object]`, never blank. Applied to the cell value AND to
    array elements (`cellContentBody`, :170-182).
  - DECLARED ARM (:121-168): `parseCellPath()` + `resolveCellPath()` — a
    hand-written segment walker over dot-separated segments with `[*]` (map,
    one resolved scalar per `view-spec__cell-item` line) and `[<n>]` (index).
    NO eval/Function/dynamic execution. Unparseable path, mid-way miss, non-array
    for index/map, or a resolved/mapped non-scalar → falls through to the
    fallback arm, never blank.
  - WIRING: `TableView` now takes `bindings?` (:238) and applies
    `columnFieldPaths(bindings)` at its cell call site (:264) exactly as
    `ArtifactTable` does (:334, :394); the `table` dispatch arm passes
    `view.bindings ?? {}` (:598). `columnFieldPaths()` (:198-206) ignores
    malformed binding shapes per-column.
  - Scalars, the empty-array arm and the `'No rows'` arm are byte-identical to
    before (arms (d)/(e) below pin that and passed PRE-fix too).
- `app/src/analysis/ViewRenderer.celljson.test.tsx` — new, the 10 RED-first pins.
- `schema/knowledge/view-spec.schema.yaml` — COMMENT-ONLY hunk (+8 lines) under
  the `bindings` docs: the canonical `columnFields` shape, path grammar and
  fallback rule. No `properties`/enum/validation change (`additionalProperties: true`).

## 2. RED evidence (pre-fix, at base 1a443259)

Command (worktree `app/` as cwd, trunk binaries, no node_modules installed here):

    /mnt/vast/home/brad/git/cl-integration-1/app/node_modules/.bin/vitest run src/analysis/ViewRenderer.celljson

REAL output (summary; the run after fixing one fixture bug of my own — the first
draft's arm-(d) rows did not match the declared column names and failed for the
wrong reason; corrected fixture, same base):

     ❯ src/analysis/ViewRenderer.celljson.test.tsx  (10 tests | 7 failed) 163ms
       → (a)  expected '[object Object]' not to contain '[object Object]'
       → (b)  expected [] to deeply equal [ 'Caffeine', 'Aspirin-d4' ]            (table)
       → (b)  expected [] to deeply equal [ 'Caffeine', 'Aspirin-d4' ]            (artifact-table)
       → (b)  expected '[object Object]' to be 'Aspirin-d4'                       ([n] index)
       → (c)  expected '[object Object]' not to contain '[object Object]'         (missing path)
       → (c)  expected '[object Object]' to be '{"label":"Caffeine"}'             (non-scalar resolve)
       → (f)  expected '[object Object]MANUAL_INTEGRATION1,2' not to contain '[object Object]'

     Test Files  1 failed (1)
          Tests  7 failed | 3 passed (10)

The 3 PRE-fix passes are exactly the byte-identical arms — (d) scalar direct-Text,
(e) empty-array, (e) 'No rows' — which must stay green, and all 7 new-behavior arms
failed. Committed as `ade2a13f` BEFORE the fix.

Note: the very first invocation of this command timed out at 300 s (NFS-cold
vitest resolution in the fresh worktree); the rerun completed in ~104 s and the
captured output above is from completed runs.

## 3. The six arms (all green post-fix, `ViewRenderer.celljson.test.tsx`)

| arm | test | key assertions |
|---|---|---|
| (a) | `renders parseable JSON containing the payload keys, never [object Object], with the full text on title` | no `[object Object]`; `JSON.parse(cell.textContent)` has `assignments` (2 entries); `[title]` == full text |
| (b) | `table renderer + columnFields.params = "assignments[*].compound_ref.label" renders the labels one per line` | `.view-spec__cell-item` texts == `['Caffeine','Aspirin-d4']` |
| (b′) | `artifact-table renderer applies columnFields too (shared formatter)` | same labels via `artifact-table` |
| (b″) | `a [<n>] index segment resolves a single scalar verbatim (no wrapper)` | text == `Aspirin-d4`, zero `.view-spec__cell-item` |
| (c) | `a missing mid-way path renders the full cell JSON, not an empty cell` | non-blank, parseable == PARAMS, no `[object Object]` |
| (c′) | `a declared field whose RESOLVED value is non-scalar also falls through` | text == `{"label":"Caffeine"}` |
| (d) | `numeric/string/boolean/null/undefined scalars render exactly as before (direct td text)` | `4.946334540681159` / `100`; 1 direct Text child; no `[title]` |
| (e) | `an empty-array cell renders the empty string with no wrapper nodes` | text == `''`, 0 child nodes |
| (e′) | `a zero-row declared payload still renders the named No rows arm` | `No rows` present, 0 cells |
| (f) | `each object element renders its own parseable JSON with title; string elements stay verbatim` | 3 items: `{"flag":"SPLIT_PEAK","confidence":0.8}` (+title), `MANUAL_INTEGRATION`, `[1,2]`; no `[object Object]` |

TableView wiring (spec AC 2) is proven by arm (b): the `renderer: "table"` view
with `bindings.columnFields` renders the declared labels.

## 4. Verification (REAL output, post-fix)

1. Full lane suite (cwd `…/l1-cellrender-1-lane1/app`):

       /mnt/vast/home/brad/git/cl-integration-1/app/node_modules/.bin/vitest run src/analysis/

       Test Files  25 passed (25)
            Tests  348 passed (348)
       Duration  18.14s

   Baseline was 24 files / 338 tests; +1 file / +10 tests, none of the floor red.

2. Targeted suite:

       /mnt/vast/home/brad/git/cl-integration-1/app/node_modules/.bin/vitest run src/analysis/ViewRenderer

        ✓ ViewRenderer.compat.test.tsx  (5 tests)
        ✓ ViewRenderer.signal.test.tsx  (13 tests)
        ✓ ViewRenderer.artifact-table.test.tsx  (13 tests)
        ✓ ViewRenderer.test.tsx  (15 tests)
        ✓ ViewRenderer.celljson.test.tsx  (10 tests)
        ✓ ViewRenderer.cellrender.test.tsx  (8 tests)
       Test Files  6 passed (6)
            Tests  64 passed (64)

   Baseline 54 (compat 5, signal 13, artifact-table 13, cellrender 8, ViewRenderer 15)
   — all still green; FAME-8 cell-render pins untouched and passing.

3. Typecheck:

       /mnt/vast/home/brad/git/cl-integration-1/app/node_modules/.bin/tsc --noEmit -p tsconfig.json
       → EXIT=2, 12 `error TS` lines (identical to the 12-line worktree baseline at
         1a443259; 9 src/event-editor, 2 src/ingestion, 1 src/editor — none in src/analysis)
       tsc … 2>&1 | grep "src/analysis" | wc -l  →  0

4. No `String(` on a non-scalar in the cell path:

       grep -n "String(" app/src/analysis/ViewRenderer.tsx

   Remaining hits: :109 `scalarCellText` (behind null + `isCellScalar` narrowing —
   the only one in the cell path); :273+ are `isBlankString` (name substring);
   :457 `String(err)` is the SignalView error message (not a table cell);
   :556 `MetricView` and :680 the unsupported-renderer label are outside the
   table-cell path and outside the ruling's scope ("the non-scalar CELL FORMATTER
   only — no other renderer").

## 5. diff --stat

The `1a443259..HEAD` range INCLUDES this report file (it is committed on the same branch),
so the HEAD receipt is 4 files while the product-only delta is the same range ending at the
GREEN commit `9e455216` — 3 files. Raw output of both commands, run in the worktree at HEAD:

    $ git -c core.fileMode=false diff --stat 1a443259..HEAD
     app/src/analysis/ViewRenderer.celljson.test.tsx | 178 ++++++++++++++++++++++++
     app/src/analysis/ViewRenderer.tsx               | 154 ++++++++++++++++++--
     deliverables/l1-cellrender-1-report-l1t0057.md  | 174 +++++++++++++++++++++++
     schema/knowledge/view-spec.schema.yaml          |   8 ++
     4 files changed, 506 insertions(+), 8 deletions(-)

    ^ 4 files = the 3 permitted product files PLUS this report file itself.

    $ git -c core.fileMode=false diff --stat 1a443259..9e455216
     app/src/analysis/ViewRenderer.celljson.test.tsx | 178 ++++++++++++++++++++++++
     app/src/analysis/ViewRenderer.tsx               | 154 ++++++++++++++++++--
     schema/knowledge/view-spec.schema.yaml          |   8 ++
     3 files changed, 332 insertions(+), 8 deletions(-)

    ^ 3 files / 332 insertions = the product-only delta (the three permitted product files).

Only the three permitted product files. `git status --porcelain` after the report commit: clean.

## 6. Not done / notes

- Browser gate (spec AC 5, ROUND-TRIP-GATE-1 on :3092) NOT run — dispatched by
  the orchestrator, never the coder; per this dispatch, verification was
  vitest + tsc + git only.
- No dev server touched, no node_modules installed in this worktree, no new
  dependency. `app/node_modules` remains empty.
- The declared-`type: string`-vs-stored-dict payload mismatch
  (`assignment-contested-entry.py` emitter) is untouched by design — owned by
  rider item L1-PARAMS-EMITTER-RIDER.
- The fallback JSON renders inside a `<span class="view-spec__cell-json">`
  wrapper (needed to carry `title`). Scalar/array-string DOM is byte-identical;
  the wrapper exists ONLY on the previously-broken `[object Object]` path, so the
  GATEFIX5 one-line-box scalar contract (cellrender pins) is unaffected. No CSS
  was added (AnalysisPage.css is out of scope); the span inherits cell styling.
