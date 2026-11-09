# DECISION REQUEST — L1-PIN-HARDEN-1, adversarial cycle-2 cap reached (lane 1, 270TH tick)

Date: 2026-11-03 04:31 EST
Requested by: lane-1 orchestrator (270TH tick)
Item: L1-PIN-HARDEN-1 — make the FAME-8 cell-render source pin nesting-aware
Branch: `cl/lane1-pin-harden-1-l1t0020`, worktree `/mnt/vast/home/brad/git/wt/l1-pin-harden-1-lane1`
Tip: `b2b59fdf` (product commit `4bf0303f`, report-only commit on top), tree CLEAN
Spec: `.hermes/plans/2026-11-03_l1-pin-harden-1-nesting-aware-scan-spec.md`
Status: NOT merged. Nothing accepted.

## Why this is with you

SOUL step 6: "max two review cycles, then route to architect." Both cycles are now spent and the
cycle-2 gate still returns `VERDICT: fix`:

- cycle 1 (`reviews/L1-PIN-HARDEN-1-advc1-l1t0300.md`) — D1 BLOCKER: two CSS-Nesting shapes evaded
  (`@media` nested inside a style rule; `& td` nesting). D2/D3 LOW evidence-trail.
- fix run 1 (`4bf0303f`) — closed D1/D2/D3 per the coder's report.
- cycle 2 (`reviews/L1-PIN-HARDEN-1-advc2-l1t0345.md`) — **VERDICT: fix** with one BLOCKER, one LOW
  evidence-trail, one LOW pre-existing.

There IS convergence: cycle 1's two evasions are closed, and cycle 2's blocker is a strictly narrower
shape that cycle 1 never named. But the pin's own claim (a nested override cannot reintroduce
`overflow-wrap: anywhere` on a `.view-spec__table` cell) is still false for one shape, so I am not
accepting and I am not starting a third blind cycle without your ruling.

## The three cycle-2 defects

1. **BLOCKER / product-behaviour.** Nested style rules WITHOUT `&` lose the parent scope.
   `cssRuleScan.ts:144-152` `resolveNestedSelector()` returns a non-`&` head verbatim, so
   `.view-spec__table { td { overflow-wrap: anywhere } }` emits `{selector: "td"}` and the pin's
   `isTableCellSelectorPart` (which requires `.view-spec__table` in the part) does not fire.

   **I reproduced this myself, first-hand, on the tip** (not the reviewer's word):
   `~/.hermes/cl/lanes/1/orch-evidence/pinh1-tip-probe-l1t0445/pinh1-advc2-defect1-probe-l1t0450.txt`
   — the probe imports the tip's `cssRuleScan.ts` and copies the pin's `sourceViolations` verbatim:

       bare-nested-td           []          <- EVADES
       bare-nested-th           []          <- EVADES
       at-rule-wrapped-bare     []          <- EVADES
       with-amp-control         [ANYWHERE_VIOLATION]   <- caught (the fix works for `&`)
       emitted rules: [{selector:".view-spec__table",decls:""},{selector:"td",decls:"overflow-wrap: anywhere"}]

   The review also calls out that the scanner docstring's "a selector WITHOUT `&` is kept as-is … can
   only make MORE text visible to the ban, never less" is FALSE as written — the emitted `td` loses the
   `.view-spec__table` scope and therefore hides from the ban. That docstring claim must not survive.

2. **LOW / evidence-trail.** `deliverables/l1-pin-harden-1-fix1/fix1-battery.mts:94` prints a hardcoded
   sibling path (`deliverables/l1-pin-harden-1-fix1/cssRuleScan.ts`, not committed) instead of the
   module actually imported, so the battery transcripts name a file that does not exist.

3. **LOW / product-behaviour, PRE-EXISTING (carried as evidence debt O2 since advc3).** The
   `.view-spec__cell-item` carve-out at `ViewRenderer.cellrender.test.tsx:95` is a substring test
   (`part.includes('.view-spec__cell-item')`), so `…td.view-spec__cell-item-x { overflow-wrap: anywhere }`
   is excused. The review states a token-boundary regex closes it and that it verified this.

## The two candidate answers

**(A) Authorize ONE final fix cycle (fix run 2) with defects 1+2, and defect 3 only if you rule it in
scope for this item.** The code change for defect 1 looks like a single resolution rule in
`resolveNestedSelector()`: a head without `&` becomes `parent + " " + head` (descendant composition)
instead of being kept verbatim. That is the fail-closed direction (over-flags, never hides), and it is
one line plus fixtures. Defect 2 is a one-line probe-path fix. My read: this is small, precisely
specified, and the review already verified defect 3's remedy — but a third cycle is past the cap, so it
needs your word.

**(B) Accept the item with the residual documented.** Not recommended: the item's whole purpose is that
the pin cannot be silently evaded, and a plain `.view-spec__table { td { … } }` is a shape a developer
could plausibly write. Accepting would also require amending the item's acceptance criteria, which is
Brad's call, not mine.

## Constraints you should weigh

- **No coder slot is free this tick.** Both appliance-2 lanes are held by LANE 2
  (`TARGET1-WELLSFIX-FIX1` since 03:05:22, `CHATHOST-CONSOLIDATE-1` since 04:22:13) and corpus priority
  (Brad 2026-11-02T17:05) means lane 1 does not take a slot lane 2 can use. So a decision now does not
  cost a wasted tick — the fix run would fire in the next tick that has a free slot regardless.
- The worktree is CLEAN at `b2b59fdf`; no partial work to rescue.
- Shipped product CSS is unaffected either way: the real `AnalysisPage.css` still returns `[]`
  (I re-ran that: `REAL AnalysisPage.css -> []`), and `AnalysisPage.css`'s blob is byte-identical
  base..tip (`c6930c66`). This is a test-pin hole, not a live rendering defect.

## What I need written

A decision file at:
`.hermes/plans/2026-11-03_l1-pin-harden-1-cycle2-cap-decision.md`

with: (1) A or B (or a third option you prefer); (2) for A, the exact in-scope defect set and whether
the `.view-spec__cell-item` token-boundary fix (defect 3) belongs to this item or a separate one;
(3) any wording the scanner docstring must carry instead of the false "never less" claim; (4) whether
the acceptance criteria in the spec need amending as a consequence.
