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

Command (the literal runnable command, run from app/ — the probe script is
committed at deliverables/l1-pin-harden-1-fix1/fix1-ac2-repro.mts so the
line is verbatim re-runnable; node version per `node --version` in this
toolchain, v26.7.0 — see the FIX RUN 1 section for the v26.7.0 vs v26.8.1
explanation):

    cd /mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/app && \
      node ../deliverables/l1-pin-harden-1-fix1/fix1-ac2-repro.mts

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

## 7. Independent re-verification pass (cl-coder, fresh run at af1c024c,
## 2026-11-03 ~02:46 EST)

All commands below were re-run from scratch on the committed worktree (clean
`git status --porcelain` at HEAD af1c024c4914bf80f032c88585e1d7939d3baab8);
none of this section is copied from section 4.

7.1 `cd app && npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx`:

    RUN  v1.6.1 /mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/app
    ✓ src/analysis/ViewRenderer.cellrender.test.tsx  (15 tests) 109ms
    Test Files  1 passed (1)
         Tests  15 passed (15)

    (both files together: `... run src/analysis/ViewRenderer.cellrender.test.tsx
    src/analysis/cssRuleScan.test.ts` -> `2 passed (2)` files, `25 passed (25)`
    tests — 15 pin-suite + 10 parser-contract.)

7.2 `cd app && npx tsc --noEmit`: exit 2 (pre-existing debt), 12 `error TS`
lines, 0 in `src/analysis`. Normalized sorted diff of the error lines against
the start-commit baseline capture (/tmp/tsc-base-l1pin.txt, measured at
1a443259 in this worktree):

    $ diff <(grep 'error TS' /tmp/tsc-base-l1pin.txt | sort) \
           <(grep 'error TS' /tmp/tsc-verify-l1pin.txt | sort)
    ERROR SET IDENTICAL: 12 error lines, zero new

7.3 `git diff --stat 1a443259..HEAD` (re-run): exactly the four permitted
paths (the two test/source files under app/src/analysis/, the report), 4 files
changed, 665 insertions(+), 58 deletions(-). `git status --porcelain` empty.

7.4 O1 fixture through the exported scanner, re-run with `node --input-type=module`
importing ./src/analysis/cssRuleScan.ts directly (pre-fix path computed in the
same process with the verbatim line-anchored regex for the RED record):

    PRE-FIX line-anchored: rules=["@media (max-width: 900px)"] -> violations []
    POST-FIX nested rule: {"selector":".view-spec__table td","decls":"overflow-wrap: anywhere;","atContext":["@media (max-width: 900px)"]}
    POST-FIX violations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]

    The pre-fix line-anchored scan collapses the O1 fixture to the single
    pseudo-rule `@media (max-width: 900px)` and returns `[]` (the O1 evasion,
    reproduced first-hand); the brace-depth scanner emits the nested rule with
    `atContext ["@media (max-width: 900px)"]` and the ban fires — the evasion
    no longer reproduces (spec AC 2 + AC 5).

7.5 The RED capture referenced in section 2 (/tmp/red-run-l1pin.txt, 02:33)
was re-inspected and matches the quoted summary exactly: 5 failed | 10 passed
(15); failures are fixtures (a)-(d) plus the atContext-shape test (missing
module `./cssRuleScan`).



## 8. FIX RUN 1 (adversarial review advc1 — L1-PIN-HARDEN-1-advc1-l1t0300.md)

Adversarial review VERDICT: fix. Defects: (1) BLOCKER — pin still evadable by
native CSS Nesting (nested at-rule inside a style rule, `&`-prefixed nested
rule) — cssRuleScan.ts:66-104 + test :90-97; (2) LOW — AC2 node repro was a
placeholder, node version stated v26.7.0 vs reviewer-measured v26.8.1; (3)
LOW — tsc/RED receipts only under /tmp. The review's §3 battery also missed
cases 13, 14 AND 17 (17: `.view-spec__table \74 d` — a hex-escape-encoded
cell token; identified from the battery text in §3, reproduced first-hand).

### 8.1 D1 — scanner recursed into nested style rules (direction (a) from the
review's fix options)

Changes (RED first — the three new fixtures were written and shown failing
against the pre-fix scanner in this run, see 8.2):

1. `app/src/analysis/cssRuleScan.ts` — the style-rule arm no longer swallows
   nested blocks as raw decl text:
   - `captureBlock` (brace-matched, string-aware) extracts the rule body,
     then `scanDecls` walks it: text up to `;` commits to the rule's own
     decls; text up to `{` becomes a nested construct's head.
   - Nested style rule: `resolveNestedSelector` desugars the CSS Nesting
     `&` per the spec's `:is()` equivalence — bare `&` IS the parent
     selector; `& td` -> `parent td`; glued `&.y` -> `parent.y`; a
     non-`&` selector is kept verbatim (conservative: only makes MORE text
     visible to the ban, never less). The nested rule is emitted with its
     resolved selector, its own decls, and the parent's `atContext`.
   - At-rule nested INSIDE a style rule (CSS Nesting spec §2.3): its prelude
     is pushed onto the context chain exactly like a top-level one; its
     contents parse with the same rules. Declarations written directly under
     it (no selector) apply to the PARENT selector while the condition holds,
     so they are emitted as a separate rule — parent selector, EXTENDED
     atContext — never merged into the parent's own (unconditional) decls:
     a conditional `break-word` cannot satisfy the unconditional floor.
   - New export `decodeCssEscapes`: decodes CSS hex escapes (`\74 ` -> `t`,
     the trailing whitespace is the escape terminator) and `\_`-style
     escapes in a selector — generic CSS syntax handling, no domain values.
     The pin's `anywhere` ban now runs over
     `splitSelectorParts(decodeCssEscapes(r.selector))`, closing the case-17
     escape-encoded-token evasion identically to plain text.
   - Fail-closed behaviour preserved and verified unchanged vs pre-fix: an
     unbalanced `{`/unterminated at-rule keeps the remainder inside the open
     scope (transcript `fix1-unbalanced-compare.txt` — identical rule/atContext
     sets before and after this fix).
   - No hardcoded selectors beyond what the spec declares; no domain policy in
     TS; the `view-spec` literals stay in the pin, verbatim.

2. `app/src/analysis/ViewRenderer.cellrender.test.tsx`:
   - imports `decodeCssEscapes` from './cssRuleScan'; the `anywhere` ban's
     selector check is now `splitSelectorParts(decodeCssEscapes(r.selector))`
     (one line changed, the rest of `sourceViolations` untouched).
   - THREE NEW pin fixtures in the O1 describe block, letters (g)/(i)/(j)
     (continuing the a-f enumeration; (h) unused):
     (g) `(g) at-rule nested INSIDE a style rule cannot reopen anywhere
        (CSS Nesting §2.3, review case 13)` — `NEST_ATRULE_INSIDE_RULE`:
        conforming floor + `.analyses { @media (max-width: 900px) {
        .view-spec__table td { overflow-wrap: anywhere; } } }`
        => toEqual([ANYWHERE_VIOLATION])
     (i) `(i) &-prefixed nested style rule cannot reopen anywhere (CSS
        Nesting & desugaring, review case 14)` — `AMPERSAND_TAIL`: conforming
        floor + `.view-spec__table { & td { overflow-wrap: anywhere; } }`
        => toEqual([ANYWHERE_VIOLATION])
     (j) `(j) escape-encoded cell token cannot evade the ban (review case 17:
        \74 d is td)` — `ESCAPED_CELL_TOKEN`: conforming floor +
        `@media (max-width: 900px) { .view-spec__table \74 d {
        overflow-wrap: anywhere; } }` => toEqual([ANYWHERE_VIOLATION])

3. `app/src/analysis/cssRuleScan.test.ts` — SIX NEW parser-contract tests
   (recursion into nested at-rule with exact atContext + outer decls empty;
   `& td` desugaring with exact atContext; bare `&` + glued `&.y`; separate
   conditional rule for decls directly under a nested at-rule; two-deep
   nested at-rules inside a style rule; `decodeCssEscapes` unit checks incl.
   the case-17 raw-vs-decoded token comparison).

### 8.2 RED evidence (pre-fix, this run)

Against the pre-fix committed scanner + pin (e2d18589), the three new pin
fixtures were staged in the worktree (scanner/pin checked out from
e2d18589; the three fixtures added; nothing else) and run:

    cd app && npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx src/analysis/cssRuleScan.test.ts

Real output (full capture: deliverables/l1-pin-harden-1-fix1/fix1-vitest-red.txt):

    ✓ src/analysis/cssRuleScan.test.ts  (10 tests)
    FAIL  ... > (g) at-rule nested INSIDE a style rule cannot reopen anywhere (CSS Nesting §2.3, review case 13)
    AssertionError: expected [] to deeply equal [ Array(1) ]
    FAIL  ... > (i) &-prefixed nested style rule cannot reopen anywhere (CSS Nesting & desugaring, review case 14)
    AssertionError: expected [] to deeply equal [ Array(1) ]
    FAIL  ... > (j) escape-encoded cell token cannot evade the ban (review case 17: \74 d is td)
    AssertionError: expected [] to deeply equal [ Array(1) ]
     Test Files  1 failed | 1 passed (2)
          Tests  3 failed | 25 passed (28)

Exactly the three new fixtures RED (each returning [] against the pre-fix
scanner — the two CSS-Nesting evasions + the escape evasion); all 25
pre-existing tests (8 base + 7 O1 fixtures/atContext + 10 parser contract)
green. A standalone probe (committed:
deliverables/l1-pin-harden-1-fix1/fix1-red-probe.mts, re-runnable via
`node ../deliverables/l1-pin-harden-1-fix1/fix1-red-probe.mts .. e2d18589`
from app/) recorded the pre-fix rule dumps, e.g. case 13 parsed as ONE rule
`{"selector":".analyses","decls":"@media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } }","atContext":[]}`
and case 14 as `{"selector":".view-spec__table","decls":"& td { overflow-wrap: anywhere; }","atContext":[]}` —
the same shapes the review quoted (transcript: fix1-red-probe.txt).

The review's §3 battery re-run PRE-FIX (committed probe
deliverables/l1-pin-harden-1-fix1/fix1-battery.mts against the e2d18589
scanner, transcript fix1-battery-prefix.txt) reproduced the review's own
result exactly: 17/20, MISS on cases 13/14/17, atContext-stack probes OK,
floor/door directions OK, shipped CSS -> [].

### 8.3 Post-fix verification (real output; all captures under
deliverables/l1-pin-harden-1-fix1/, absolute paths
/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/deliverables/l1-pin-harden-1-fix1/)

vitest (fix1-vitest-green.txt):

    cd app && npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx src/analysis/cssRuleScan.test.ts
    ✓ src/analysis/cssRuleScan.test.ts  (16 tests)
    ✓ src/analysis/ViewRenderer.cellrender.test.tsx  (18 tests)
    Test Files  2 passed (2)
         Tests  34 passed (34)

18 = 8 pre-existing + 7 (a-f + atContext) + 3 NEW pin fixtures (g)/(i)/(j);
16 = 10 pre-existing parser tests + 6 NEW. All existing fixtures green; the
real-file pin returning [] is among the 8 pre-existing and green; the
atContext === [] assertion is green.

Review §3 battery re-run POST-FIX (fix1-battery-postfix.txt) — case-by-case
(full 20-case transcript committed; every case that should flag does flag,
every benign case returns []):

    case 1  multi-line @media                    -> [ANYWHERE_VIOLATION] OK
    case 2  one-line @media                      -> [ANYWHERE_VIOLATION] OK
    case 3  @supports                            -> [ANYWHERE_VIOLATION] OK
    case 4  @layer                               -> [ANYWHERE_VIOLATION] OK
    case 5  @container                           -> [ANYWHERE_VIOLATION] OK
    case 6  two-deep @media > @supports          -> [ANYWHERE_VIOLATION] OK
    case 7  :is(th, td) inside @supports         -> [ANYWHERE_VIOLATION] OK
    case 8  selector split across lines          -> [ANYWHERE_VIOLATION] OK
    case 9  @media no space after name           -> [ANYWHERE_VIOLATION] OK
    case 10 @media screen and (...)              -> [ANYWHERE_VIOLATION] OK
    case 11 rule+at-rule brace same line         -> [ANYWHERE_VIOLATION] OK
    case 12 commented-out rule (benign)          -> []                OK
    case 13 NESTED at-rule inside style rule     -> [ANYWHERE_VIOLATION] OK  (was MISS/[] pre-fix)
    case 14 NESTED & td inside .view-spec__table -> [ANYWHERE_VIOLATION] OK  (was MISS/[] pre-fix)
    case 15 comment between prelude and brace    -> [ANYWHERE_VIOLATION] OK
    case 16 UPPERCASE decl                       -> [ANYWHERE_VIOLATION] OK
    case 17 CSS escape-encoded td: \74 d        -> [ANYWHERE_VIOLATION] OK  (was MISS/[] pre-fix)
    case 18 benign: floor only, no at-rules      -> []                OK
    case 19 benign @media over conforming floor  -> []                OK
    case 20 3 declarations including anywhere    -> [ANYWHERE_VIOLATION] OK
    battery: 20/20 match expectation

Stack/floor/door probes in the same transcript: atContext chains a/b/c/d OK,
side-by-side at-rules OK, fail-closed unbalanced @media behaviour IDENTICAL
to pre-fix (fix1-unbalanced-compare.txt), floor-only-in-@media -> FLOOR
violation OK, door-only-in-@media -> door violation OK, benign @media over
conforming floor -> [], unconditional+conditional break-word -> [],
SHIPPED AnalysisPage.css -> [].

tsc (fix1-tsc-after.txt): `cd app && npx tsc --noEmit -p tsconfig.json`
exit 2, 12 `error TS` lines, 0 in src/analysis; normalized sorted diff
against the start-commit baseline (/tmp/tsc-base-l1pin.txt — supplementary;
the set is reproduced in fix1-tsc-after.txt): identical, zero NEW.

git: `git diff --stat 1a443259..HEAD` touches only the permitted paths (the
two test files, cssRuleScan.ts, deliverables);
`git rev-parse 1a443259:app/src/analysis/AnalysisPage.css
HEAD:app/src/analysis/AnalysisPage.css` -> c6930c66eabf3918ececb2df3a0f682b7e94c4da
both (byte-identical); `git status --porcelain` empty after the commit.

### 8.4 D2 — literal AC2 command + node version

The placeholder in §4.4 is replaced in place by the literal command, which
is verbatim re-runnable (probe committed):

    cd /mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/app && node ../deliverables/l1-pin-harden-1-fix1/fix1-ac2-repro.mts

Real output (fix1-ac2.txt):

    node v26.7.0
    CURRENT  nested rule: {"selector":".view-spec__table td","decls":"overflow-wrap: anywhere;","atContext":["@media (max-width: 900px)"]}
    CURRENT  violations:  ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]
    PREVIOUS (e2d18589) violations: ["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]

i.e. ONE rule with atContext ['@media (max-width: 900px)'] and
sourceViolations -> [ANYWHERE_VIOLATION]. (The ORIGINAL line-anchored parser
at base 1a443259 returned [] for this fixture — the first run's RED record,
report §2/§4.4, supplementary capture /tmp/red-run-l1pin.txt.)

Node version, measured both ways in this session:
`/usr/bin/node --version` -> v26.7.0 (the toolchain `node` on PATH in this
session — the version every command in this run actually executed);
`/home/brad/.local/share/mise/shims/node --version` -> v26.8.1 (mise-managed
install, `mise ls node` -> 26.8.1; the reviewer's shell resolves node
through the mise shim, hence its v26.8.1). All runs in this report were
executed under v26.7.0; the probe scripts print `node <version>` so the
version of record is in each transcript. No behavioural difference
asserted between the two.

### 8.5 D3 — durable receipts moved into the worktree

All receipts now live under
`/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/deliverables/l1-pin-harden-1-fix1/`
(this section cites them by absolute path):

    fix1-vitest-red.txt        RED vitest transcript (3 new fixtures fail, 25 pass)
    fix1-vitest-green.txt      post-fix vitest transcript (34/34 green)
    fix1-tsc-after.txt         tsc --noEmit capture (12 errors, 0 in src/analysis)
    fix1-red-probe.mts/.txt    pre-fix RED probe (re-runnable; rule dumps for 13/14/17)
    fix1-battery.mts           the §3 20-case battery + stack/floor/door probes
    fix1-battery-prefix.txt    battery vs pre-fix scanner: 17/20, MISS 13/14/17
    fix1-battery-postfix.txt   battery vs fixed scanner: 20/20, case-by-case
    fix1-unbalanced-compare.txt fail-closed parity pre-fix vs post-fix
    fix1-ac2-repro.mts/.txt    literal AC2 command + output

The /tmp captures (/tmp/red-run-l1pin.txt, /tmp/tsc-base-l1pin.txt,
/tmp/tsc-after-l1pin.txt, /tmp/tsc-verify-l1pin.txt) remain cited as
supplementary only.

L1-PIN-HARDEN-1 FIX1 DONE 4bf0303f549623f063c4b929bc2d1579e25f0b2e
