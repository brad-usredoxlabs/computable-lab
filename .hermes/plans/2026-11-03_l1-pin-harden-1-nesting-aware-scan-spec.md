# L1-PIN-HARDEN-1 — make the FAME-8 cell-render source pin nesting-aware

Authored by the lane-1 orchestrator tick, 2026-11-03T00:35 EST. Banked from advc-cycle-3
observation **O1** of FAME-8-GATEFIX5 (reviews/FAME8-GATEFIX5-adv3-l1t2350.md), which the 262nd
handoff recorded as a NEW NON-GATING evidence-debt entry, not a FAME-8 blocker. FAME-8 is DONE
(trunk 71fb849c); this item changes NO product code — it hardens a test-side pin so a future CSS
edit cannot silently reopen the mid-token shatter that FAME-8 closed.

## Ground truth (orchestrator-verified at trunk 71fb849c, not taken from the review prose)

- File under test: `app/src/analysis/ViewRenderer.cellrender.test.tsx` (378 lines). The pin is
  `sourceViolations(css)` at :120, its parser `parseCssRules(css)` at :38:
  `Array.from(stripped.matchAll(/^([^{}\/][^{]*)\{([^}]*)\}\s*$/gm), ...)` — line-anchored, and the
  decls group is `[^}]*`, so it cannot span a nested closing brace.
- Product CSS: `app/src/analysis/AnalysisPage.css` — `.view-spec__table th, .view-spec__table td
  { overflow-wrap: break-word; white-space: normal; }` (:118), `.view-spec__cell-item {
  overflow-wrap: anywhere; min-width: 12ch; }` (:122). **No `@media` / `@supports` / `@layer` in the
  file today** (grep, 0 hits) ⇒ there is no live product defect.
- Evasion REPRODUCED by the orchestrator with the test's own regex on a fixture:

      @media (max-width: 900px) {
        .view-spec__table td {
          overflow-wrap: anywhere;
        }
      }

  parses to ONE rule `{selector: "@media (max-width: 900px)", decls: ".view-spec__table td {\n
  overflow-wrap: anywhere;"}`. `isTableCellSelectorPart("@media (max-width: 900px)")` is false, so
  the `anywhere` ban never fires and `sourceViolations` returns `[]`. The one-line form
  `@media (…) { .view-spec__table td { overflow-wrap: anywhere; } }` is likewise reduced to the
  `@media` selector with the whole block as decls — also not seen. **Both evade.**
- Mirror-image failure (also to be pinned): a rule that exists ONLY inside `@media` must not be
  read as satisfying the unconditional floor. `plainCellRules` today would miss a nested
  `break-word` rule entirely (fine), but a nesting-aware parser that flattens at-rule context
  naïvely would accept it — the pin must keep distinguishing "declared unconditionally" from
  "declared under a condition".

## Scope (exactly this, no product behaviour change)

Files: `app/src/analysis/ViewRenderer.cellrender.test.tsx` ONLY.
If — and only if — a helper is cleaner as a separate module, `app/src/analysis/cssRuleScan.ts` plus
its own test may be added; that is the ONLY permitted second file. NO edits to `AnalysisPage.css`,
any other CSS, any component, any server file, any YAML.

1. **Replace the line-anchored scan with a brace-depth scanner.** `parseCssRules` (or its
   successor) must walk the stylesheet tracking `{}` depth and quote/comment state, emitting each
   rule with `selector`, `decls`, and a new `atContext: string[]` — the chain of enclosing at-rule
   preludes (e.g. `['@media (max-width: 900px)']`) that are NOT themselves selectors. Rules nested
   in `@supports` / `@layer` / `@container` behave the same way. Comments stripped before scanning
   (keep the existing GATEFIX5 rationale verbatim).
2. **Keep both existing pin directions, now over nested rules.** A `td`/`th`-cell selector
   declaring `overflow-wrap: anywhere` is a violation REGARDLESS of `atContext`; the pre-existing
   selector-part logic (`splitSelectorParts`, `isTableCellSelectorPart`, case-insensitivity, the
   `.view-spec__cell-item` carve-out) is unchanged — extend it, do not re-derive it.

   **AMENDED 2026-11-03 by the architect's cycle-2 cap decision** (`.hermes/plans/2026-11-03_l1-pin-harden-1-cycle2-cap-decision.md`, binding): the `.view-spec__cell-item` carve-out is applied at TOKEN BOUNDARIES, not as a substring test. The carve-out's semantic is unchanged (only its boundary is made exact), which removes the one reading that locks in a fail-open (`…td.view-spec__cell-item-x` must not be excused).
3. **Do not weaken the current floor.** `plainCellRules` (the `break-word` requirement on the
   unconditional `th, td` rule) and the `.analysis-right { overflow: auto }` door check stay
   requirements on UNCONDITIONAL rules only (empty `atContext`). A conditional-only rule must not
   satisfy them; report that as the existing "no … declares overflow-wrap: break-word" violation.
4. **RED FIRST — new fixtures.** **AMENDED 2026-11-03 (same decision):** each EVASION-SHAPE fixture is demonstrated failing before the fix; NO-FALSE-POSITIVE guards are GREEN pre-fix by construction and are stated as such (advc2 observation O1: the original blanket wording was unsatisfiable).
   a. multi-line `@media`-nested `td { overflow-wrap: anywhere }` ⇒ exactly `[ANYWHERE_VIOLATION]`;
   b. one-line `@media`-nested equivalent ⇒ exactly `[ANYWHERE_VIOLATION]`;
   c. `@supports`-nested equivalent ⇒ exactly `[ANYWHERE_VIOLATION]` (proves the scanner is
      at-rule-generic, not `@media`-special-cased);
   d. `@media`-nested `:is(th, td)` shape ⇒ still `[ANYWHERE_VIOLATION]` (D4 evasion + nesting);
   e. CONFORMING_FLOOR plus a benign `@media` block (e.g. `.view-spec__cell-item { min-width: 8ch }`)
      ⇒ `[]` (no false positive);
   f. a stylesheet where the `break-word` floor exists ONLY inside `@media` ⇒ the floor violation is
      reported (conditional does not satisfy unconditional).
   Commit message must call out the RED inversion, as GATEFIX5 did.
5. **Real-file assertion unchanged and non-vacuous:** the existing test that runs the pin against
   the actual `AnalysisPage.css` must still report `[]` AFTER the parser change — i.e. the shipped
   CSS still satisfies the floor under the stricter scanner. If it does not, STOP and return
   requires-rescope rather than adjusting the CSS (product change is out of this item's scope).

## Acceptance criteria (orchestrator verifies first-hand)

1. `npx vitest run src/analysis/ViewRenderer.cellrender.test.tsx` in `app/` — all tests pass, and
   the new fixture count is non-zero (state the number of new `it` blocks). PRE-DISPATCH BASELINE
   measured by the 267TH tick at `1a443259` in the pre-built
   `/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1` worktree: **8 tests passed (RUN v1.6.1, exit 0)**
   — the six new fixtures come ON TOP of those 8 and none of the 8 may go red.
2. `node -e` reproduction of the O1 fixture through the exported scanner shows ONE rule with
   `atContext: ['@media (max-width: 900px)']` and `sourceViolations` returning
   `[ANYWHERE_VIOLATION]` (the pre-fix run returning `[]` is recorded in the report as the RED
   evidence, with the command used).
3. `npx tsc --noEmit` in `app/`: zero NEW error lines versus the coder's OWN start-commit baseline
   in the SAME worktree, and `src/analysis/` stays at zero. MEASURED FIRST-HAND at base `1a443259`
   by the 267TH tick (2026-11-03T01:55), and the two numbers are NOT interchangeable:
     - trunk `/mnt/vast/home/brad/git/cl-integration-1/app` → exit 2, **21** `error TS` lines, 0 in `src/analysis/`;
     - the coder worktree `/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1/app` → exit 2, **12** `error TS` lines, 0 in `src/analysis/`.
   Cause (verified): a fresh `git worktree` carries no `app/node_modules` package graph, so tsc
   resolves app-level packages through the `/mnt/vast/home/brad/git/wt/node_modules` symlink (the
   live tree's root) instead of the trunk's own `app/node_modules`; the error SETS differ (e.g. the
   6 `src/shared/hooks/useAiChat.surfaceContext.test.ts` lines appear only in the trunk layout).
   **The bar is therefore per-worktree: 12 is this worktree's baseline and the coder must not exceed
   it; a reported total of 21 would be a REGRESSION in the worktree, and 12 is simply this worktree's
   baseline — neither good nor bad. Trunk-layout 21 remains what the orchestrator must see after merging.
4. `git diff --stat <base>..HEAD` touches ONLY the permitted file(s); `AnalysisPage.css` and every
   other product file byte-identical.
5. Report states, with the command and its output, that the O1 evasion no longer reproduces.

## Contracts / conventions

- Never weaken a pin to make a test pass; the shipped CSS is the contract (architect A3 ruling,
  handoff 2026-11-02_lane1-fame8-a3-cell-render-decision.md).
- No new dependency (no postcss/css-tree) — a ~60-line brace scanner is the point; adding a parser
  dependency is a requires-rescope.
- Delivery is report-first: write the report to the assigned unique deliverable path under
  `deliverables/`, then make commits. Report overstating what ran is an adversarial FIX defect.
