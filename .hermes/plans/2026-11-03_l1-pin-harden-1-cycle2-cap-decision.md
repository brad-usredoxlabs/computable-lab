# ARCHITECT DECISION — L1-PIN-HARDEN-1 cycle-2 cap (lane 1)

Date: 2026-11-03 (architect, local model + repo evidence — no paid consultation required)
Item: L1-PIN-HARDEN-1 · branch `cl/lane1-pin-harden-1-l1t0020` · tip `b2b59fdf` (tree CLEAN)
Decision request: `.hermes/plans/2026-11-03_l1-pin-harden-1-cycle2-cap-decision-request.md`
Cycle-2 review: `reviews/L1-PIN-HARDEN-1-advc2-l1t0345.md` (VERDICT: fix)
Orchestrator probe (defect 1 reproduced first-hand on tip):
`~/.hermes/cl/lanes/1/orch-evidence/pinh1-tip-probe-l1t0445/pinh1-advc2-defect1-probe-l1t0450.txt`

## Ruling

**A — authorize exactly ONE final fix cycle (fix run 2).** Not B: the item's entire mandate is
that the pin cannot be silently evaded, and a plain `.view-spec__table { td { overflow-wrap:
anywhere } }` is relaxed CSS Nesting that Vite ships as-is — the same native family whose `&`
shapes fix run 1 already closed. The evasion is confirmed first-hand on the tip, the fix is
small, precisely specified, and fail-closed in direction. Accepting (B) would enshrine a false
pin claim and requires amending acceptance criteria down — Brad's call, and refused here.

No third *blind* cycle exists. Fix run 2 closes a named, bounded defect set (below); the gate
after it is a targeted re-probe of exactly that set, not a fresh full review. If the targeted
gate returns `fix` again, the item is FROZEN and escalated to Brad — no fourth cycle.

## In-scope defect set for fix run 2 (exactly these three, nothing else)

D1 (BLOCKER, product-behaviour) — `resolveNestedSelector` (cssRuleScan.ts:144-152) keeps a
non-`&` head verbatim, dropping the parent scope. Required behaviour: a nested style rule whose
head contains no `&` composes against the parent as an implicit descendant
(`parent + " " + head`), distributing over a parent selector list. Composition applies ONLY
when the parent is a style rule; heads directly inside at-rules keep current behaviour (at-rule
prelude goes to `atContext`, head unmodified), and top-level heads are never composed.
The fail-closed invariant: a nested rule's emitted selector must always retain its full parent
chain — resolution may widen scope, never drop it. If the exact `&`-placement semantics of a
head are ambiguous (e.g. `:is(&) td`), over-flagging is acceptable; escaping the ban is not.

D2 (LOW, evidence-trail) — `deliverables/l1-pin-harden-1-fix1/fix1-battery.mts:94` prints a
hardcoded sibling path. Print the resolved argv[2] path actually imported (or the git rev of
the module under test). Re-run the battery so the committed transcripts name a real module.

D3 (LOW, pre-existing fail-open) — **RULED IN SCOPE for this item.** The
`.view-spec__cell-item` carve-out at ViewRenderer.cellrender.test.tsx:95 must become a
token-boundary test; the reviewer verified
`/(^|[^\w-])\.view-spec__cell-item(?![-\w])/` closes the fail-open and still exempts the real
`.view-spec__cell-item`. Rationale: it is one regex inside the predicate chain this item
exists to harden; splitting it into a separate item spawns a second pin-evade-adjacent task
against code that will otherwise never be opened again. This strengthens, never relaxes, the
approved scope. Pins required in BOTH directions (`.view-spec__cell-item-x { … anywhere }`
violates; the real `.view-spec__cell-item` rule stays exempt).

Anything outside D1-D3 found during fix run 2 is recorded as an observation for the
orchestrator to file; the coder may not expand scope.

## Required RED evidence (fix run 2, before any fix commit)

Commit a probe that runs the pin's `sourceViolations` on tip `b2b59fdf` and shows `[]` for the
bare-nested family. The adversarial fixture set that MUST yield `[ANYWHERE_VIOLATION]` after
the fix (from advc2 §1 — K, L, M, N, O, D2 plus the probe shapes):

    .view-spec__table { td { overflow-wrap: anywhere; } }
    .view-spec__table { th { … } }
    .view-spec__table { @media (m) { td { … } } }
    @media (m) { .view-spec__table { td { … } } }
    .view-spec__table { th, td { … } }
    .view-spec__table { :hover td { … } }
    .view-spec__table { & { color:red } td { … } }
    .view-spec__table, .other { td { … } }            (parent-list distribution)
    :is(&) td / :where(&) > td under .view-spec__table
    @supports (x:y) { .view-spec__table { @media (min-width: 1px) { td { … } } } }

The `&`-control shape must keep flagging, the CONFORMING_FLOOR-plus-benign-shapes fixtures must
keep returning `[]` (no false positives), and shipped `AnalysisPage.css` must still return `[]`
under the composed scanner (it contains no nested rules — byte-identical blob `c6930c66` is
re-checked, unchanged rule AC4).

## Required docstring wording (replaces cssRuleScan.ts:138-142; report §8.1 must match)

  - a selector WITHOUT `&` composes against the parent as an implicit descendant
    (`parent head`). This is the relaxed CSS-Nesting behaviour shipped by current
    engines and by Vite as-is: `.view-spec__table { td { … } }` means
    `.view-spec__table { & td { … } }`. Composition distributes over the parent's
    selector list. Resolution can only WIDEN a rule's visible scope — a nested rule
    never escapes its parent chain — which is the fail-closed direction for this
    pin. Dropping the parent would hide text from the ban and is exactly what this
    branch must not do.

The old claim ("kept as-is … can only make MORE text visible to the ban, never less") must not
survive anywhere: scanner docstring, pin docstring, or report.

## Spec amendment consequence (architect's authority; recorded here, binding)

- AC1-AC5: UNCHANGED. They still hold and are re-verified after fix run 2 (vitest all green,
  fixture count grows; tsc stays <= the worktree's 12-line baseline, 0 in src/analysis; AC4
  byte-identity re-checked; report restates O1 non-reproduction with a literal command).
- Spec §2 sentence "the `.view-spec__cell-item` carve-out … is unchanged" is AMENDED to: the
  carve-out is applied at token boundaries. This preserves the clause's intent ("extend, do not
  re-derive" — the carve-out's semantic is unchanged, only its boundary is made exact) and
  removes the only reading that locks in a fail-open. This is a tightening within the approved
  intent; Brad's morning click-test remains the backstop.
- Spec §4's blanket "each demonstrated failing before the fix" cannot hold for the
  no-false-positive guard (advc2 observation O1). AMENDED to: "each evasion-shape fixture
  demonstrated failing before the fix; no-false-positive guards are GREEN pre-fix by
  construction and stated as such."

## Gate after fix run 2 (what the next tick does)

Targeted re-probe ONLY (same reviewer if possible, read-only): the fixture set above, both D3
directions, D2 re-run banner, docstring/report wording gone, shipped file `[]`, vitest green,
tsc no new errors, diff still within the three permitted app files + deliverables. PASS →
orchestrator proceeds per SOUL (merge path is the orchestrator's, trunk-layout tsc 21 applies
post-merge per AC3). FAIL → freeze item, escalate to Brad with this file, both reviews, and the
fix-2 receipts. No third cycle is authorized under any outcome.

Slots: no slot is free this tick; hold the worktree at `b2b59fdf` and dispatch fix run 2 on the
next tick with a free lane-1-eligible slot. Corpus priority stands.

DECISION: A
