# L1-PIN-HARDEN-1 — FIX RUN 3 (l1t0700) — nested head-list composition under the full parent chain

Branch: `cl/lane1-pin-harden-1-l1t0020` — start tip `6ea3ec2905391b45e9664802cc463b97af79a33b` (tree CLEAN, confirmed by `git status --porcelain` — empty output before any edit).
Permitted files touched: `app/src/analysis/cssRuleScan.ts`, `app/src/analysis/cssRuleScan.test.ts`, `app/src/analysis/ViewRenderer.cellrender.test.tsx`, `deliverables/` (probe, transcripts, this report). `app/src/analysis/AnalysisPage.css` NOT edited — blob verified `c6930c66eabf3918ececb2df3a0f682b7e94c4da` (B3 below).

## 1. RED evidence first (recorded before the fix)

The defect: in `resolveNestedSelectors` (cssRuleScan.ts:177-179 pre-fix), a nested rule whose HEAD is itself a selector list got the parent prefixed to the WHOLE head string — `parentParts.map((p) => `${p} ${head}`)` — so every head part after the first was emitted with no parent chain (`.view-spec__table { .wrap, td { … } }` emitted the single selector `.view-spec__table .wrap, td`; the pin's top-level comma split re-splits it into `.view-spec__table .wrap` + a scope-less `td`, which the ban never sees). The same hole existed at :170-176 (ambiguous-`&`: `head.replace(/&/g, () => parentParts.join(', '))` and `${p} ${head}`). The pin's per-part check (ViewRenderer.cellrender.test.tsx:103-110) is correct in isolation but never saw a part still carrying `.view-spec__table`; the fail-closed invariant test (cssRuleScan.test.ts:206-219 pre-fix) passed only because it asserted `.toContain('.view-spec__table')` over the JOINED string.

### 1.1 Probe B4, pre-fix (real output)

Command: `cd app && node --experimental-strip-types ../deliverables/probe-fix3-l1t0700.mts` on tip `6ea3ec29` (scanner sha256 `9038b90deee830008883ad6e6a20f2b2d72cba00eeae38a1ce89d13069cbf946`; pin function extracted VERBATIM from the test file, esbuild-transformed only to strip TS, verbatim-extract sha256 `6c7fbb3800828562f77cdb61822fbbd3b4005f3c7cf1839eaca9247511a7d730` — same extract sha in the RED and GREEN runs below proves the pin logic was not touched between them). Full transcript: `deliverables/fix3/fix3-red-probe.txt`.

All six shapes returned `[]` (RED — the pin accepted every evasion). Emitted selectors show the dropped chain:

| shape (appended to conforming floor) | pre-fix emitted selector | pre-fix sourceViolations |
|---|---|---|
| `.view-spec__table { .wrap, td { overflow-wrap: anywhere; } }` | `.view-spec__table .wrap, td` | `[]` |
| `.view-spec__table { .wrap, th { overflow-wrap: anywhere; } }` | `.view-spec__table .wrap, th` | `[]` |
| `.view-spec__table { .a, .b, td { overflow-wrap: anywhere; } }` | `.view-spec__table .a, .b, td` | `[]` |
| `.other, .view-spec__table { .wrap, td { overflow-wrap: anywhere; } }` | `.other .wrap, td` and `.view-spec__table .wrap, td` | `[]` |
| `.view-spec__table { .wrap { .x, td { overflow-wrap: anywhere; } } }` | `.view-spec__table .wrap .x, td` | `[]` |
| `.view-spec__table { :is(&) .x, td { overflow-wrap: anywhere; } }` | `:is(.view-spec__table) .x, td` and `.view-spec__table :is(&) .x, td` (raw `&` left in emitted text) | `[]` |

Controls, pre-fix: `td, .wrap` (first head part is the cell token) already flagged — `[".view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]`; non-cell head list clean (`[]`); shipped AnalysisPage.css clean (`[]`, 169 emitted rules).

### 1.2 RED tests (real output, before the scanner fix)

New tests committed at `62c81894` ("RED: nested head-list shapes return [] (parent chain dropped)"), run against the UNFIXED scanner:

```
Test Files  2 failed | 23 passed (25)
     Tests  7 failed | 374 passed (381)
```

Full transcript: `deliverables/fix3/fix3-red-vitest.txt`. The 7 failures:

```
FAIL  cssRuleScan.test.ts > composes a nested head that is itself a selector list part-by-part (cartesian product over the parent)
FAIL  cssRuleScan.test.ts > distributes a parent selector list x a nested head selector list (cartesian product, both axes)
FAIL  cssRuleScan.test.ts > composes an ambiguous-& nested head list part-by-part (substitution never collapses the head into one string)
FAIL  cssRuleScan.test.ts > keeps distributing a head list across the full chain at every nesting depth (triple nesting)
FAIL  cssRuleScan.test.ts > filters empty head-list parts (trailing comma) — never emits a bare parent or a blank tail
FAIL  cssRuleScan.test.ts > never emits a nested rule part that escaped its parent chain (fail-closed invariant, per emitted part)
FAIL  ViewRenderer.cellrender.test.tsx > L1-PIN-HARDEN-1 FIX RUN 3 — nested head-list composes under the full parent chain (advc3 blocker) > every nested head-list shape is flagged as exactly the anywhere violation
```

Representative RED assertion (per-part invariant, `cssRuleScan.test.ts:285`): `AssertionError: expected 'td' to contain '.view-spec__table'` — the re-split part with the scope dropped is exactly what the old `.toContain`-over-joined-string check missed.

## 2. The fix (commit `755b9afe`)

`resolveNestedSelectors` (cssRuleScan.ts) now:

1. **no-`&`**: splits the head with `splitSelectorParts` (top-level commas only) and composes the CARTESIAN PRODUCT `parentParts x headParts` — every head part resolves against every parent part on its own, so every emitted selector keeps the full parent chain. Never parent x joined head.
2. **ambiguous-`&`**: same head split; the `&` substitution operates on the SPLIT part (`part.replace(/&/g, () => p)`), never on the joined head string; each part additionally gets the per-part descendant composition (`p + ' ' + part`). Both branches flow through the same per-part loop, so fixing only no-`&` would have left `.view-spec__table { :is(&) .x, td { … } }` with an unscoped `td` part.
3. **empty parts filtered**: `splitSelectorParts(…).filter((x) => x.length > 0)` on both lists — a trailing comma yields no bare-parent or blank-tail emission.
4. **kept green**: `head === '&'` fast path (plus a bare `&` list member resolves to that parent part in the loop); `& td` descendant and `&.x` glued behaviours unchanged per part; recursion untouched — `scanDecls` still receives `selectors.join(', ')`, so a grandchild head list distributes over the already-composed middle (the triple-nested fixture exercises exactly this).
5. **generic composition only**: no class-name special-casing, no fixture-aware branches, no hardcoded fixture strings in the scanner. No `replaceAll`/`.at()` (tsc lib target predates ES2021); `exactOptionalPropertyTypes` unaffected (no new optional fields; `CssRule` fields stay required).

Docstring (work item 5): the claim that a selector WITHOUT `&` "can only make MORE text visible" / "can only WIDEN a rule's visible scope" no longer exists in the file — `grep "WIDEN\|MORE text visible" app/src/analysis/cssRuleScan.ts` returns nothing. Replacement states: a nested head is ALWAYS composed under its parent chain, and a head that is itself a selector list is distributed PART-BY-PART (cartesian product) over the parent list. The banned phrase survives only in the historical fix1/fix2 deliverables, where it is quoted as the FALSE claim being corrected (fix2 report §2 and §8 correction of record) — those are append-only history and out of this run's permitted paths.

## 3. Green verification — every bar's real output

### B1. vitest (real output)

`cd app && /mnt/vast/home/brad/git/cl-integration-1/app/node_modules/.bin/vitest run src/analysis/`:

```
✓ src/analysis/cssRuleScan.test.ts  (24 tests) 17ms
✓ src/analysis/ViewRenderer.cellrender.test.tsx  (27 tests) 266ms
...
Test Files  25 passed (25)
     Tests  381 passed (381)
```

(it()/expect() counted as `grep -c` of `it(` / `expect(` in each file; cellrender's raw `it(` count includes 2 occurrences inside comments at lines 230 and 272, same as at tip — real test count 27.)

| file | tip 6ea3ec29 | this tip | strictly higher |
|---|---|---|---|
| cssRuleScan.test.ts — it() | 19 | 24 | yes (+5) |
| cssRuleScan.test.ts — expect() | 48 | 55 | yes (+7) |
| ViewRenderer.cellrender.test.tsx — it() | 23 | 27 | yes (+4) |
| ViewRenderer.cellrender.test.tsx — expect() | 39 | 45 | yes (+6) |
| combined it() | 42 | 51 | yes (+9) |
| combined expect() | 87 | 100 | yes (+13) |

File count 25 = baseline 25; all green; 381 > 372 baseline.

### B2. tsc (real output)

`cd app && /mnt/vast/home/brad/git/cl-integration-1/app/node_modules/.bin/tsc --noEmit -p tsconfig.json` → **12 `error TS` lines, 0 in src/analysis** (baseline `deliverables/fix3/fix3-tsc-baseline.txt` diff: IDENTICAL). The 12 lines (pre-existing, unrelated, NOT fixed per the assignment):

```
src/editor/taptab/tabNavPlugin.ts(102,7): error TS2322: ...
src/event-editor/EventEditorContext.tsx(1302,29): error TS2339: ...
src/event-editor/deck/LawnSurface.moveAcross.test.tsx(47,5): error TS2353: ...
src/event-editor/deck/PreviewActionBar.test.tsx(108,5): error TS2353: ...
src/event-editor/editorHistory.test.ts(176,34): error TS2345: ...
src/event-editor/editorHistory.test.ts(199,37): error TS2345: ...
src/event-editor/focus/LabwareFocus.instrument.test.tsx(47,5): error TS2353: ...
src/event-editor/right-pane/ai/systemPromptForViewer.ts(46,3): error TS2322: ...
src/event-editor/viewer/Viewer.tsx(65,13): error TS2322: ...
src/event-editor/viewer/ViewerToolbar.tsx(55,13): error TS2322: ...
src/ingestion/components/IngestionUploadModal.tsx(232,23): error TS2554: ...
src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx(9,19): error TS6133: ...
```

### B3. diff confinement + pinned blob (real output)

`git diff --stat 6ea3ec29..HEAD`:

```
app/src/analysis/ViewRenderer.cellrender.test.tsx |  63 ++++
app/src/analysis/cssRuleScan.test.ts              |  77 ++++-
app/src/analysis/cssRuleScan.ts                   |  96 ++++--
deliverables/fix3/fix3-red-probe.txt              | 303 ++++++++++++++++++
deliverables/fix3/fix3-red-vitest.txt             | 357 ++++++++++++++++++++++
deliverables/fix3/fix3-tsc-baseline.txt           |  18 ++
deliverables/probe-fix3-l1t0700.mts               | 128 ++++++++++++
7 files changed, 1006 insertions(+), 36 deletions(-)
```

(all three app paths permitted; all deliverables paths permitted; nothing else — note this stat predates the two green-transcript commits, which are also deliverables/ only)

`git hash-object app/src/analysis/AnalysisPage.css`:

```
c6930c66eabf3918ececb2df3a0f682b7e94c4da
```

### B4. probe post-fix (real output)

Same command as §1.1; full transcript `deliverables/fix3/fix3-green-probe.txt`. The six shapes each FLAG (one `ANYWHERE_VIOLATION`); controls hold; shipped CSS clean. Emitted selectors now all carry the full parent chain:

```
--- H1 head list .wrap, td
      selector=".view-spec__table .wrap" atContext=[] decls="overflow-wrap: anywhere;"
      selector=".view-spec__table td" atContext=[] decls="overflow-wrap: anywhere;"
    sourceViolations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    verdict: expect FLAG -> OK
--- H2 head list .wrap, th
      selector=".view-spec__table .wrap" ...
      selector=".view-spec__table th" ...
    sourceViolations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    verdict: expect FLAG -> OK
--- H3 head list .a, .b, td
      selector=".view-spec__table .a" ...
      selector=".view-spec__table .b" ...
      selector=".view-spec__table td" ...
    sourceViolations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    verdict: expect FLAG -> OK
--- H4 parent list x head list
      selector=".other .wrap" ...
      selector=".other td" ...
      selector=".view-spec__table .wrap" ...
      selector=".view-spec__table td" ...
    sourceViolations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    verdict: expect FLAG -> OK
--- H5 triple-nested head list
      selector=".view-spec__table .wrap .x" ...
      selector=".view-spec__table .wrap td" ...
    sourceViolations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    verdict: expect FLAG -> OK
--- H6 ambiguous-& head list
      selector=":is(.view-spec__table) .x" ...
      selector=".view-spec__table :is(&) .x" ...
      selector=".view-spec__table td" ...
    sourceViolations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    verdict: expect FLAG -> OK
--- C1 control: first head part is the cell token (td, .wrap) — must keep flagging
      selector=".view-spec__table td" ...
      selector=".view-spec__table .wrap" ...
    sourceViolations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    verdict: expect FLAG -> OK
--- C2 control: non-cell head list must NOT start flagging
      selector=".view-spec__table .wrap" ...
      selector=".view-spec__table .other" ...
    sourceViolations: []
    verdict: expect CLEAN -> OK
--- shipped AnalysisPage.css
    sourceViolations: []
    verdict: expect CLEAN -> OK
```

## 4. Fixtures added and exact-array expectation notes

**cssRuleScan.test.ts** (5 new `it`s; the fail-closed invariant tightened, not rewritten):
- `composes a nested head that is itself a selector list part-by-part` — H1 exact product `['.view-spec__table .wrap', '.view-spec__table td']`;
- `distributes a parent selector list x a nested head selector list` — H4 exact product (4 selectors, parent-list order x head-list order);
- `composes an ambiguous-& nested head list part-by-part` — H6 exact product `[':is(.view-spec__table) .x', '.view-spec__table :is(&) .x', '.view-spec__table td']`;
- `keeps distributing … triple nesting` — H5 grandchild head list over the joined resolved middle;
- `filters empty head-list parts (trailing comma)` — no bare-parent/blank-tail emission;
- fail-closed invariant: assertion changed to PER EMITTED SELECTOR PART — `splitSelectorParts(r.selector)` and every part must `toContain('.view-spec__table')` — with the two head-list heads (`.wrap, td`, `:is(&) .x, td`) added to the loop; the at-rule-chain case (`@supports > rule > @media > td`) kept green unchanged.

**ViewRenderer.cellrender.test.tsx** (1 new describe, 4 `it`s):
- all six shapes flagged as exactly `[ANYWHERE_VIOLATION]`;
- control `td, .wrap` keeps flagging (regression pin — it flagged pre-fix because the first head part is the cell token);
- non-cell head list (`.wrap, .other { color: red; }`) must NOT start flagging;
- `.view-spec__cell-item` carve-out interaction on composed parts.

**Carve-out statement (reviewer bait):** the `.view-spec__cell-item` carve-out is the unchanged token-boundary regex `(^|[^\w-])\.view-spec__cell-item(?![\w-])`. Of the six fixture shapes, NO emitted part is excused by it — none of the emitted parts contains the `.view-spec__cell-item` token at all (H1-H5: `.wrap`/`.th`/`.a`/`.b`/`td`/`.x`; H6: `:is(.view-spec__table) .x` / `.view-spec__table :is(&) .x` / `.view-spec__table td`), so all six flag unexcused. The dedicated carve-out interaction it pins: a composed descendant-carrier part (`.view-spec__table td .view-spec__cell-item`) IS excused exactly as the flat form is (cell token present, carve-out token at a true boundary → `[]`), while a glued `td.view-spec__cell-item` part is NOT excused (word char before the token's `.` → still flagged) — both directions pinned. The carve-out was not widened.

**Exact-array note (reviewer bait):** the cartesian product changes exact-array expectations on purpose — the fix2 distribution tests (single head part) produce identical arrays to before (parent x one head part = old `parentParts.map(p => p + ' ' + head)`), so the pre-existing exact-array tests at cssRuleScan.test.ts:186-204 needed NO change and stayed green; the NEW tests pin the product order (parent-list outer, head-list inner) for list-valued heads.

## 5. Commits

| sha | subject |
|---|---|
| `62c81894` | lane1 L1-PIN-HARDEN-1 FIX RUN 3: RED: nested head-list shapes return [] (parent chain dropped) — probe + 7 failing tests + transcripts; scanner untouched. The commit message states the RED state (six shapes returning `[]`) as required by work item 5. |
| `755b9afeb88f0be98e68cc523b410b572f9602fb` | lane1 L1-PIN-HARDEN-1 FIX RUN 3: resolveNestedSelectors composes nested head lists part-by-part (cartesian product parentParts x headParts) — the fix + docstring replacement. |
| `…` (this report's commit) | lane1 L1-PIN-HARDEN-1 FIX RUN 3: report + green transcripts. |

## 6. Next actions / residual

- Independent browser reviewer still owns acceptance (not run by this lane).
- Orchestrator: no YAML changed, so no lane-stack reload needed for live verification; the pinned artefact and its blob are untouched.
- Residual known-over-broad (accepted, fail-closed): the ambiguous-`&` descendant form (`.view-spec__table :is(&) .x`) over-flags relative to strict `:is()` semantics; over-flagging is acceptable per the decision, escaping the parent chain is not — and nothing escapes anymore (per-part invariant).

--------------------------------------------------------------------------------
STATUS: RED recorded (62c81894, six shapes returning []); fix committed
(755b9afeb88f0be98e68cc523b410b572f9602fb); all bars green (§3). Not marked
done — orchestrator gate owns that.

L1-PIN-HARDEN-1 FIX3 DONE 755b9afeb88f0be98e68cc523b410b572f9602fb
