# L1-PIN-HARDEN-1 — coding report (cl-coder, LANE 1)

Item: L1-PIN-HARDEN-1 (test-only hardening of the FAME-8 GATEFIX5 cell-render
source pin against the O1 nesting evasion).
Worktree: /mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1
Start commit: 1a443259 (verified clean via `git status --porcelain` — empty)
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-11-03_l1-pin-harden-1-nesting-aware-scan-spec.md

## 1. What changed, and why (file:line)

Problem: `parseCssRules` in app/src/analysis/ViewRenderer.cellrender.test.tsx
was line-anchored
(`Array.from(stripped.matchAll(/^([^{}\/][^{]*)\{([^}]*)\}\s*$/gm), ...)`), so a
rule nested inside @media/@supports/@layer/@container was invisible to the pin
(a responsive override reintroducing `overflow-wrap: anywhere` on a
.view-spec__table cell would pass).

Changes (RED first — the six fixtures were written and shown failing BEFORE the
parser change, see section 2):

1. NEW app/src/analysis/cssRuleScan.ts (the ONLY permitted second module):
   - `parseCssRules(css): CssRule[]` (cssRuleScan.ts:37) — a brace-depth
     scanner: strips block comments first (GATEFIX5 rationale carried verbatim
     from the old parser), then walks the stylesheet tracking `{}` depth plus
     double/single-quote string state. Emits each style rule as
     `{selector, decls, atContext}` where `atContext` is the chain of
     enclosing at-rule preludes, outermost first (e.g.
     `['@media (max-width: 900px)']`); empty for an unconditional rule.
     At-rules (@media/@supports/@layer/@container alike) are handled
     generically by the `head.startsWith('@')` branch (cssRuleScan.ts:69).
     A `;` at prelude position discards the prelude so statement-level
     constructs (`@import`) cannot bleed into a later rule head
     (cssRuleScan.ts:61). decls are captured to the rule's OWN closing brace,
     tracking inner braces and strings, so a nested `}` cannot end the rule
     early; outer decls whitespace is trimmed (parity with the old parser's
     `.trim()`; inner text stays raw, as the old `[^}]*` capture did).
   - `splitSelectorParts` / `isTableCellSelectorPart` (cssRuleScan.ts:133 /
     :162) moved VERBATIM from the test file — same regexes, same comments,
     same semantics (D4 top-level-comma split, D5 case-insensitivity, the
     thead/tbody/.view-spec__table-cell guard). Not re-derived.

2. MODIFIED app/src/analysis/ViewRenderer.cellrender.test.tsx:
   - :6-11 imports `parseCssRules`, `splitSelectorParts`,
     `isTableCellSelectorPart` from './cssRuleScan' (local copies deleted).
   - :45-47 `FLOOR_VIOLATION` constant added (same string the pin already
     emitted inline: 'no .view-spec__table th/td rule declares overflow-wrap:
     break-word').
   - :74-119 `sourceViolations` rewritten around the scanner:
     * the `anywhere` ban is now evaluated over ALL rules — regardless of
       `atContext` — a nested rule can reintroduce it;
     * the positive floor claims are now satisfied ONLY by UNCONDITIONAL
       rules: `const unconditional = rules.filter((r) =>
       r.atContext.length === 0)` (line :85) and the `th, td` break-word
       floor (:86-95), the `.view-spec__cell-item` min-width/anywhere pair
       (:101-110) and the `.analysis-right { overflow: auto }` door check
       (:113-115) all run over `unconditional` (spec §3: "a rule declared
       only inside an at-rule must NOT satisfy them").
   - :351-428 NEW describe block "L1-PIN-HARDEN-1 — source pin is nesting-aware
     (O1)" with the six spec fixtures (a)-(f) at :385/:389/:393/:397/:401/:411
     plus one atContext-shape test at :422 (7 new `it` blocks on top of the 8
     pre-existing — 15 total).

3. NEW app/src/analysis/cssRuleScan.test.ts (its own test, within the permitted
   second-file allowance): 10 tests pinning the PARSER's contract (flat
   parsing, nested depth, atContext chain, @container one-liner, string
   literals, comment stripping, @import prelude discard, shipped-file
   unconditional-ness of the floor/door, plus the moved selector-part logic).

Nothing else touched: no CSS, no components, no server files, no YAML, no new
npm dependency (the ~60-line scanner is the point, per the item contract).

## 2. RED evidence (pre-fix command and real output)

Pre-fix state (RED phase): the six new fixtures were added to
app/src/analysis/ViewRenderer.cellrender.test.tsx while `sourceViolations`
still called the PRE-FIX line-anchored parser (verbatim copy, renamed
`parseCssRulesLineAnchored`), and `./cssRuleScan` did not exist yet. Command:

    cd app && npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx

Real output (summary + each new-fixture failure; full capture kept at
/tmp/red-run-l1pin.txt):

    ❯ src/analysis/ViewRenderer.cellrender.test.tsx  (15 tests)
    ⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯

    FAIL  ... > L1-PIN-HARDEN-1 — source pin is nesting-aware (O1) > (a) multi-line @media-nested td anywhere is flagged (O1, verbatim from the review)
    AssertionError: expected [] to deeply equal [ Array(1) ]

    - Expected
    + Received

    - Array [
    -   "a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere",
    - ]
    + Array []

    FAIL  ... > (b) one-line @media-nested td anywhere is flagged (same evasion, compact form)
    AssertionError: expected [] to deeply equal [ Array(1) ]

    FAIL  ... > (c) @supports-nested td anywhere is flagged (the scanner is at-rule-generic)
    AssertionError: expected [] to deeply equal [ Array(1) ]

    FAIL  ... > (d) @media-nested :is(th, td) shape is flagged (D4 evasion plus nesting)
    AssertionError: expected [] to deeply equal [ Array(1) ]

    FAIL  ... > the exported brace-depth scanner emits atContext for the O1 rule
    Error: Failed to load url ./cssRuleScan (resolved id: ./cssRuleScan). Does the file exist?

     Test Files  1 failed (1)
          Tests  5 failed | 10 passed (15)

Interpretation: exactly the four O1 evasion fixtures (a)-(d) went RED —
`sourceViolations` returned `[]` because the line-anchored parser cannot see a
rule nested inside an at-rule (the O1 evasion, reproduced verbatim). Fixtures
(e) and (f) were deliberately GREEN-against-the-old-parser by construction
((e) is a no-false-positive guard and (f) is a guard against a future
flattening that would weaken the floor); they still pin the intended contract.
All 8 pre-existing tests stayed green in the RED run. The atContext-shape test
went RED via the missing-module import, demonstrating the parser does not yet
exist.

## 3. The six fixtures (names + assertions)

All in describe "L1-PIN-HARDEN-1 — source pin is nesting-aware (O1)", each
fixture built on the unconditional CONFORMING floor (door + th,td break-word +
cell-item anywhere/min-width 12ch) so ONLY the nested defect can surface:

(a) `(a) multi-line @media-nested td anywhere is flagged (O1, verbatim from the
    review)` — the spec's O1 fixture verbatim (@media (max-width: 900px) with a
    multi-line nested `.view-spec__table td { overflow-wrap: anywhere; }`):
    expect(sourceViolations(O1_MULTI)).toEqual([ANYWHERE_VIOLATION])
(b) `(b) one-line @media-nested td anywhere is flagged (same evasion, compact
    form)` — `@media (max-width: 900px) { .view-spec__table td { overflow-wrap:
    anywhere; } }` on one line: toEqual([ANYWHERE_VIOLATION])
(c) `(c) @supports-nested td anywhere is flagged (the scanner is at-rule-
    generic)` — `@supports (overflow-wrap: anywhere) { .view-spec__table td {
    overflow-wrap: anywhere; } }` (one-line body form, so the pre-fix parser's
    line anchor also missed it): toEqual([ANYWHERE_VIOLATION])
(d) `(d) @media-nested :is(th, td) shape is flagged (D4 evasion plus nesting)`
    — @media-nested `.view-spec__table :is(th, td)` (multi-line body so the
    pre-fix parser missed it; also the D4 top-level-comma split): toEqual
    ([ANYWHERE_VIOLATION])
(e) `(e) conforming floor plus a benign @media block stays clean (no false
    positive)` — CONFORMING_FLOOR + `@media (max-width: 900px) {
    .view-spec__cell-item { min-width: 8ch; } .view-spec__table { font-size:
    .8rem; } }`: toEqual([])
(f) `(f) break-word floor existing ONLY inside @media does not satisfy the
    unconditional floor` — door + cell-item present, the th,td break-word rule
    exists ONLY inside @media: toEqual([FLOOR_VIOLATION]) — i.e. the floor
    violation IS reported.

Plus the atContext-shape test `the exported brace-depth scanner emits atContext
for the O1 rule`: parseCssRules(O1_MULTI) must contain a rule with
selector `.view-spec__table td` and atContext exactly
`['@media (max-width: 900px)']`.

## 4. Verification commands (real output; run at the code state the commit
records, before the report file was appended)

### 4.1 vitest (post-fix)

Command:

    cd app && npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx

    (node:236629) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
    (Use `node --trace-warnings ...` for the warning that caused the warning)

    ✓ src/analysis/ViewRenderer.cellrender.test.tsx  (15 tests) 112ms

    Test Files  1 passed (1)
         Tests  15 passed (15)
      Start at  02:42:02
      Duration  14.74s

15 = the 8 pre-existing tests (none went red) + 7 new (six spec fixtures +
atContext shape). The parser's own module test also passes in the same worktree
run: `npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx
src/analysis/cssRuleScan.test.ts` → 2 files, 25 passed (25) (run 02:38:42).
The real-file pin (first `it`, `sourceViolations(readFileSync(AnalysisPage.css))`
=== `[]`) is among the 8 pre-existing tests and is green — the shipped CSS
still satisfies the floor under the stricter scanner (spec AC 5; no
requires-rescope triggered).

### 4.2 tsc --noEmit

Commands:

    cd app && npx tsc --noEmit          (exit=2, pre-existing debt)
    grep -c 'error TS' /tmp/tsc-after-l1pin.txt     -> 12
    grep 'error TS' ... | grep -c 'src/analysis'    -> 0

Comparison to the OWN start-commit baseline (measured at 1a443259 in this
worktree, /tmp/tsc-base-l1pin.txt): 12 `error TS` lines, 0 in src/analysis.
Per-file, per-code diff of the two sorted error sets:

    $ diff /tmp/tsc-base-sorted.txt /tmp/tsc-after-sorted.txt
    ERROR SETS IDENTICAL TO BASELINE

So: 12 error lines after == 12 at base, zero NEW errors (the worktree-specific
baseline is 12, not the trunk-layout 21 — see spec AC 3).

### 4.3 diff --stat (permitted files only)

    $ git diff --stat 1a443259..HEAD
    app/src/analysis/ViewRenderer.cellrender.test.tsx | 166 ++++++++++-----
    app/src/analysis/cssRuleScan.test.ts              | 124 ++++++++++
    app/src/analysis/cssRuleScan.ts                   | 166 ++++++++++++++
    deliverables/l1-pin-harden-1-report-l1t0020.md    | +++++ (this report)
    4 files changed, 665 insertions(+), 58 deletions(-)

(The report line grows with this very file's size while it is being written;
the three source/test files above are the stable, verifiable part: exactly the
permitted set, with +58 deletions confined to ViewRenderer.cellrender.test.tsx.)

Only the two permitted source/test files plus this report. `git status
--porcelain` at start was empty (no pre-existing uncommitted work to absorb);
`git status --porcelain` after the commit is empty. AnalysisPage.css and every
other product file byte-identical (not in the diff).

### 4.4 O1 fixture through the exported scanner (node -e, node v26.7.0)

Command (verbatim, run from app/):

    node --input-type=module -e '<O1 fixture through the exported
    parseCssRules/splitSelectorParts/isTableCellSelectorPart from
    cssRuleScan.ts, printing the nested rule atContext and the violation
    list>'

Real output:

    atContext: ["@media (max-width: 900px)"]
    violations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]

i.e. ONE rule with `atContext: ['@media (max-width: 900px)']` and
sourceViolations-equivalent returning `[ANYWHERE_VIOLATION]`. Pre-fix, the
same fixture through the line-anchored parser returned `[]` (recorded as the
RED evidence in section 2 — that is the O1 reproduction the spec asks for).

## 5. diff --stat

(See 4.3 — the four permitted files only.)

## 6. What could not be done / open items

- Nothing inside the HARD SCOPE was left undone. No product file was touched,
  so no browser-gate re-run was required or performed.
- The RED-phase `parseCssRulesLineAnchored` verbatim copy and the RED test
  state live only in the RED run's working tree; the commit contains the
  GREEN state (parser + fixtures + report). The RED evidence is preserved in
  section 2 of this report (real vitest output) — this is the same
  RED-then-GREEN-in-one-commit convention GATEFIX5 used, with the RED output
  recorded in the report + commit message rather than in an intermediate
  commit (single-commit delivery keeps the tree bisectable; the report is the
  evidence of record).
- `tsc --noEmit` exits 2 with 12 pre-existing errors (identical set at base);
  zero NEW, and zero in src/analysis — the stated bar is met.
- The commit message records the RED inversion as GATEFIX5 required (RED run:
  5 failed | 10 passed, fixtures (a)-(d) returning [] — the O1 evasion —
  before the brace-depth scanner landed).
- Note for the orchestrator: the pre-dispatch baseline quoted in the spec
  ("12 error TS lines in this worktree") matched the first-hand measurement at
  1a443259 in this worktree (12), and the post-change run is identical to it —
  the 21-line trunk figure remains what the merged layout must show.


