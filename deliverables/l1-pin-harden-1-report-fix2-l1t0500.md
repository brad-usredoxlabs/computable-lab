# L1-PIN-HARDEN-1 — FIX RUN 2 report (l1t0500)

Item:      L1-PIN-HARDEN-1 · lane 1 · branch `cl/lane1-pin-harden-1-l1t0020`
Worktree:  /mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1
Start:     b2b59fdf (tree CLEAN verified at start: `git -c core.fileMode=false status --porcelain` empty, `git log --oneline -3` tip b2b59fdf)
Decision:  .hermes/plans/2026-11-03_l1-pin-harden-1-cycle2-cap-decision.md (D1-D3, exactly)
Review:    reviews/L1-PIN-HARDEN-1-advc2-l1t0345.md (VERDICT: fix)
Run id:    l1t0500-fix2 (claim recorded under task-list.lock)

Commits this run:
  e2ecc88f RED probe + pre-fix transcript (D1)
  fbb36e7c D1 composition fix + D3 token-boundary carve-out + pin/parser fixtures
  8a62aad9 D2 battery banner fix + re-run battery transcripts + replaceAll->replace (tsc lib)
  68384616 parser-contract pins + green vitest transcript
  (this report commit follows)

--------------------------------------------------------------------------------
## 1. What changed and why

### D1 (BLOCKER) — relaxed nesting dropped the parent scope
`app/src/analysis/cssRuleScan.ts` — `resolveNestedSelector` (was :144-152) is
now `resolveNestedSelectors` returning `string[]`:
- bare `&` -> `[parent]`; `&` + whitespace -> `[parent head]`; glued `&.x` ->
  `[parent.x]` (unchanged fix-run-1 semantics, now array-shaped);
- head with NO `&`: implicit descendant `parent + " " + head`, DISTRIBUTED
  over the parent's selector list via `splitSelectorParts(parent)` —
  `.view-spec__table, .other { td { … } }` emits two composed rules;
- head with `&` in an AMBIGUOUS position (`:is(&) td`, `:where(&) > td`):
  emits BOTH the `:is()`-equivalence substitution AND the implicit-descendant
  composition per parent part — over-flagging is acceptable, escaping the
  parent chain is not (decision invariant);
- composition applies ONLY when the parent is a style rule: the function is
  called solely from `scanDecls` (a style-rule body). Top-level heads and
  heads written directly inside at-rules keep prior behaviour (prelude ->
  `atContext`, head unmodified).

`scanDecls` (cssRuleScan.ts, nested-style-rule branch) now emits one rule per
resolved selector (same decls, same atContext chain) and recurses with the
joined resolved selector as the child's parent — a grandchild under a
distributed parent distributes again, so the invariant "a nested rule's
emitted selector always retains its FULL parent chain" holds at every depth.

Docstring cssRuleScan.ts:130-163 replaced with the decision's required wording
("a selector WITHOUT `&` composes against the parent as an implicit
descendant … Resolution can only WIDEN a rule's visible scope … Dropping the
parent would hide text from the ban and is exactly what this branch must not
do"). The old claim ("kept as-is … can only make MORE text visible to the
ban, never less") no longer exists anywhere in app/src/analysis or the
fix2 deliverables (grep verified; it survives only in the historical
report-l1t0020.md §8.1, which is append-only — corrected in §8.1-correction
below).

### D2 (LOW) — battery banner named a non-existent module
`deliverables/l1-pin-harden-1-fix1/fix1-battery.mts:94` printed
`new URL('./cssRuleScan.ts', import.meta.url).pathname` — a hardcoded sibling
path that is not committed. It now prints
`resolve(process.cwd(), scannerPath)` — the module actually imported from
argv[2]. Battery re-run both directions; transcripts in
`deliverables/l1-pin-harden-1-fix2/` (§4 paths).

### D3 (LOW) — substring carve-out became token-boundary
`app/src/analysis/ViewRenderer.cellrender.test.tsx` — inside
`sourceViolations`, `!part.includes('.view-spec__cell-item')` is now
`!CELL_ITEM_TOKEN.test(part)` with
`const CELL_ITEM_TOKEN = /(^|[^\w-])\.view-spec__cell-item(?![\w-])/` — the
exact pattern the reviewer verified and the decision names. Both directions
pinned (§5).

### Corrections made during this run (not scope additions)
- `String.prototype.replaceAll` (used transiently in the D1 patch) is outside
  this project's tsc lib target (TS2550); replaced with
  `head.replace(/&/g, () => …)` — function replacement so a `$` in the parent
  text stays literal. tsc back to the 12-line baseline.
- One fix-run-1 parser test (review case 13) asserted the OLD scope-dropping
  selector `.view-spec__table td` for `.analyses { @media … { .view-spec__table
  td {…} } }`. That assertion ENCODED the defect: with composition the rule is
  `.analyses .view-spec__table td`. Updated to the composed selector — the
  assertion strength is unchanged (exact selector + exact atContext), and the
  pin-level case-13 fixture (`.analyses` at-rule fixture, test (g)) still
  flags via the composed selector without any weakening.

## 2. RED evidence (real pre-fix output, before any fix commit)

Probe (committed, re-runnable): `node deliverables/l1-pin-harden-1-fix2/fix2-red-probe.mts .. b2b59fdf`
(run from `app/`; extracts scanner + pin VERBATIM from commit b2b59fdf via
`git show`). Full transcript: `deliverables/l1-pin-harden-1-fix2/fix2-red-probe-prefix.txt`:

    node v26.8.1
    scanner+pin extracted from commit b2b59fdf
    CASE K  bare nested td                              -> []  RED (evasion accepted)
    CASE K2 bare nested th                              -> []  RED (evasion accepted)
    CASE L  @media inside style rule, bare td head      -> []  RED (evasion accepted)
    CASE M  bare td nested under .view-spec__table inside @media -> []  RED (evasion accepted)
    CASE N  bare nested head list th, td                -> []  RED (evasion accepted)
    CASE O  bare nested :hover td                       -> []  RED (evasion accepted)
    CASE P  &-block then bare td sibling                -> []  RED (evasion accepted)
    CASE Q  parent selector list distribution           -> []  RED (evasion accepted)
    CASE R  :is(&) td (ambiguous & placement)           -> []  RED (evasion accepted)
    CASE S  :where(&) > td (ambiguous & placement)      -> []  RED (evasion accepted)
    CASE D2 @supports > style > @media > bare td        -> []  RED (evasion accepted)
    RED (evasion accepted): 11/11
    PARSER DUMP K: [[".analysis-right",[]],[".view-spec__table th, .view-spec__table td",[]],
      [".view-spec__cell-item",[]],[".view-spec__table",[]],["td",[]]]

The parser dump reproduces advc2 §1's independently: the emitted selector is
bare `td` with `atContext []` — no `.view-spec__table` scope, ban silent.
The &-controls (`& td`, `&.x td`) already FLAGED pre-fix (fix run 1 held);
the benign guards were [] pre-fix BY CONSTRUCTION (no-false-positive guards,
per the decision's §4 amendment — not claimed RED).

--------------------------------------------------------------------------------
## 3. Required fixture set — post-fix verdicts (case by case)

Same probe against the WORKTREE module (`node ../deliverables/l1-pin-harden-1-fix2/fix2-red-probe.mts .. WORKTREE`
from `app/`), full transcript committed as
`deliverables/l1-pin-harden-1-fix2/fix2-red-probe-postfix.txt`. ANYWHERE =
`["a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere"]`.

    .view-spec__table { td { overflow-wrap: anywhere; } }                          -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table { th { … } }                                                 -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table { @media (m) { td { … } } }                                  -> [ANYWHERE_VIOLATION]  FLAG
    @media (m) { .view-spec__table { td { … } } }                                  -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table { th, td { … } }                                             -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table { :hover td { … } }                                          -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table { & { color:red } td { … } }                                 -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table, .other { td { … } }              (parent-list distribution) -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table { :is(&) td { … } }                                          -> [ANYWHERE_VIOLATION]  FLAG
    .view-spec__table { :where(&) > td { … } }                                      -> [ANYWHERE_VIOLATION]  FLAG
    @supports (x:y) { .view-spec__table { @media (min-width: 1px) { td { … } } } } -> [ANYWHERE_VIOLATION]  FLAG
    RED (evasion accepted): 0/11

Every case is appended to the CONFORMING_FLOOR and must yield EXACTLY the one
ANYWHERE violation; the probe compares with `JSON.stringify(got) ===
JSON.stringify(ANY)`, so a double-report or an extra floor violation would
print MISS, not FLAG.

MUST STAY [] (controls + guards, same transcript):
    CTRL control "& td"                    -> [ANYWHERE_VIOLATION]  FLAG   (keeps flagging)
    CTRL control "&.x td" glued            -> [ANYWHERE_VIOLATION]  FLAG   (keeps flagging)
    CTRL control bare "&" block            -> []  CLEAN
      (`.view-spec__table { & { … } }` resolves to the parent ELEMENT selector
      `.view-spec__table` — no th/td token, so the cell-family ban does not
      apply; it behaved identically pre-fix and that is the pin's documented
      cell-family scope, not an evasion of THIS defect. The overflow-wrap
      inheritance question is an OBSERVATION in §7, not fix-2 scope.)
    GUARD benign nested font-size / td padding / thead anywhere / @media font-size -> [] CLEAN (x4)
    SHIPPED AnalysisPage.css                -> []   (unchanged under the composed scanner)

The same eleven shapes plus the controls and benign guards are ALSO pinned
inside vitest: `ViewRenderer.cellrender.test.tsx` describe
"L1-PIN-HARDEN-1 FIX RUN 2 — relaxed nesting (bare head) composes against
the parent (advc2 D1)" (3 it-blocks: 11 labelled fixtures each expected
[ANYWHERE_VIOLATION], controls keep flagging, benign shapes stay []).
Parser-contract level (exact emitted rule objects incl. the atContext chain
and the parent-chain invariant at depth) in `cssRuleScan.test.ts` (3 new
it-blocks).

--------------------------------------------------------------------------------
## 4. D2 — re-run battery transcripts (banner names the real module)

`fix1-battery.mts:94` now prints the RESOLVED argv[2] path. Re-run transcripts
committed under `deliverables/l1-pin-harden-1-fix2/`:

- POST-FIX: `fix2-battery-postfix.txt`
      == BATTERY (review §3) against /mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/app/src/analysis/cssRuleScan.ts ==
      … battery: 20/20 match expectation
      (run from app/: `node ../deliverables/l1-pin-harden-1-fix1/fix1-battery.mts
        ./src/analysis/cssRuleScan.ts src/analysis/ViewRenderer.cellrender.test.tsx`
        at final tip — the banner names the module actually imported)
- PRE-FIX: `fix2-battery-prefix.txt`
      == BATTERY (review §3) against /tmp/fix2-battery-prefix/cssRuleScan.ts ==
      … battery: 20/20 match expectation
      (scanner + pin extracted from commit b2b59fdf via `git show` into
      /tmp/fix2-battery-prefix/; the banner names the extracted file, which is
      what was actually imported)

Honest note (and the reason the D1 hole survived fix run 1): the PRE-FIX
battery is ALSO 20/20 — fix run 1's battery never contained a bare-head
shape, so it could not catch the relaxed-nesting family. That is precisely
advc2 §5's test-gap finding. The D1 coverage lives in the fix2 probe (§3) and
the vitest pins, not in the fix1 battery; the fix2 battery re-run exists to
prove the D2 banner defect is closed and fix-run-1's 20 cases did not regress.

--------------------------------------------------------------------------------
## 5. D3 — token-boundary carve-out, pinned BOTH directions

Carve-out regex (ViewRenderer.cellrender.test.tsx, inside `sourceViolations`):
`/(^|[^\w-])\.view-spec__cell-item(?![\w-])/` — the exact pattern advc2 §7
verified and the decision names.

Pinned in describe "L1-PIN-HARDEN-1 FIX RUN 2 — .view-spec__cell-item
carve-out is token-exact (advc2 D3)" (2 it-blocks, all green in
`fix2-vitest-green.txt`):

VIOLATES (must report the anywhere ban):
    CONFORMING_FLOOR + .view-spec__table td.view-spec__cell-item-x { overflow-wrap: anywhere; }  -> [ANYWHERE_VIOLATION]
    CONFORMING_FLOOR + .view-spec__table td.view-spec__cell-itemx { overflow-wrap: anywhere; }   -> [ANYWHERE_VIOLATION]
EXEMPT (must stay []):
    CONFORMING_FLOOR + .view-spec__table td .view-spec__cell-item { overflow-wrap: anywhere; }   -> []
    shipped AnalysisPage.css (bare .view-spec__cell-item rule, token at both boundaries)          -> []

Boundary behaviour recorded honestly: the reviewer's exact regex treats a
glued compound `td.view-spec__cell-item` as NOT exempt — the character before
the token's `.` is `d` (a word char), so neither the start-of-part branch nor
the `[^\w-]` branch can match. (Measured: the lookaround variant
`(?<![\w-])…(?![\w-])` behaves IDENTICALLY on this shape — `td.` fails both
patterns; both exempt `td .view-spec__cell-item` and the bare token. There is
no reasonable variant that exempts `…td.view-spec__cell-item-x` while also
exempting `…td.view-spec__cell-item`; any leading-boundary rule that accepts
the glued form re-opens the fail-open.) This over-flag is the fail-closed
side the decision sanctions ("over-flagging is acceptable; escaping the ban
is not"), and the shape does not exist in the real DOM — ViewRenderer.tsx:88
puts the class on a DIV inside the td, never on the td itself. Pinned
explicitly so the behaviour is owned, not accidental:
    CONFORMING_FLOOR + .view-spec__table td.view-spec__cell-item { overflow-wrap: anywhere; }    -> [ANYWHERE_VIOLATION]
with the reason in the test comment.
