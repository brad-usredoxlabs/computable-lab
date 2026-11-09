# BRAD CARD — L1-PIN-HARDEN-1 FROZEN after the ONE authorized third cycle (2026-11-03 06:35 EST)

**Why this is a card and not a decision by the pipeline.** The architect's DECISION A
(`.hermes/plans/2026-11-03_l1-pin-harden-1-cycle2-cap-decision.md`) capped this item at one final
fix cycle and ruled: *"If this re-probe returns fix, the item FREEZES and goes to Brad; no fourth
cycle."* The re-probe did return **VERDICT: fix**. The pipeline therefore stopped exactly where it
was told to stop. Nothing is merged; nothing is half-merged.

## What the item is

A **test pin**, not shipped product behaviour. `app/src/analysis/cssRuleScan.ts` is a CSS scanner
used by `ViewRenderer.cellrender.test.tsx` to assert that no shipped/source CSS sets
`overflow-wrap: anywhere` on table cells (the FAME-8 mid-token-shatter ban). `AnalysisPage.css` —
the actual shipped stylesheet — is **byte-identical** to the base (`c6930c66…` at `1a443259` and at
the fix tip). No user-visible rendering changes; no schema, no server, no record touched.

So the open defect is a **hole in a guard**, not a broken page. That is the judgement you are being
asked for: is "the guard misses one nested-shape family" an acceptable shipped state (documented),
or does it warrant one more cycle.

## What was already fixed (2 cycles, verified by two independent reviewers)

- **Cycle-1 → fix-1**: the scanner was not nesting-aware at all (`@media`/`@supports`-wrapped
  declarations invisible to the pin).
- **Cycle-2 (adv-2) → fix-2** (this cycle): `resolveNestedSelectors` now composes a bare nested head
  against its parent instead of keeping it verbatim, distributes over a parent selector list,
  handles ambiguous `&` placement fail-closed, and the `.view-spec__cell-item` carve-out is a
  token-boundary test with both directions pinned. All **11 mandated fixtures** flag; controls hold;
  shipped CSS returns `[]`. Both reviewers agree on this.

## The one surviving evasion (BLOCKER, PRODUCT-BEHAVIOUR, reproduced by ME as well as the reviewer)

```
.view-spec__table { .wrap, td { overflow-wrap: anywhere; } }
  emitted selector: ".view-spec__table .wrap, td"     -> pin returns []   (ESCAPES)
.view-spec__table { td { overflow-wrap: anywhere; } }
  emitted selector: ".view-spec__table td"            -> pin flags       (correct)
```

Cause: `cssRuleScan.ts:177-179` (and the ambiguous-`&` branch at `:170-176`) prefix the parent to
the **whole head string**; when the head is itself a selector LIST, every part after the first is
emitted with no parent chain. My own run of the tip's `parseCssRules` printed the exact selectors
above, so this is not a reviewer artefact.

Reviewer's fix direction (no patch written): compose the **cartesian product** of parent parts ×
head parts (same split in the ambiguous-`&` branch), add head-list fixtures (parent-list × head-list,
deep variant), and make the invariant test assert **per emitted selector part** rather than
`.toContain` over the joined string. Estimated one focused cycle.

## Evidence

| artifact | path |
|---|---|
| targeted re-probe (verdict fix, 1 BLOCKER) | `~/.hermes/cl/lanes/1/reviews/L1-PIN-HARDEN-1-reprobe-fix2-l1t0500.md` |
| adversarial cycle-2 (the blocker fix-2 was closing) | `~/.hermes/cl/lanes/1/reviews/L1-PIN-HARDEN-1-advc2-l1t0345.md` |
| adversarial cycle-1 | `~/.hermes/cl/lanes/1/reviews/L1-PIN-HARDEN-1-advc1-l1t0300.md` |
| binding decision (DECISION A, D1-D3, wording) | `.hermes/plans/2026-11-03_l1-pin-harden-1-cycle2-cap-decision.md` |
| spec | `.hermes/plans/2026-11-03_l1-pin-harden-1-nesting-aware-scan-spec.md` |
| fix-2 report (+ receipts dir) | worktree `wt/l1-pin-harden-1-lane1`: `deliverables/l1-pin-harden-1-report-fix2-l1t0500.md`, `deliverables/l1-pin-harden-1-fix2/` |
| branch / tip | `cl/lane1-pin-harden-1-l1t0020` @ `6ea3ec29` (functional tip `68384616`), tree CLEAN, base `1a443259` |
| my own bars | `npx vitest run src/analysis/` → 25 files / **372 passed**, rc=0; `diff --stat 1a443259..HEAD` confined to the 3 permitted app files + `deliverables/`; `AnalysisPage.css` blob identical |

## Options (pick one word)

- **(A) ONE MORE CYCLE** — authorized fourth cycle on the same branch against the head-list family
  only (cartesian product + per-part invariant test). ~30-60 min of coder time, then the same
  targeted re-probe. This is the option I would take: the fix direction is precise and narrow.
- **(B) SHIP AS-IS + DOCUMENTED HOLE** — merge the current pin, record the head-list family as a
  known escape in the module docstring and as a carried evidence-debt in the lane list, and file a
  follow-up campaign item. The guard already catches everything it caught before plus the whole
  @media/@supports/& family.
- **(C) DROP THE PIN BACK** — revert the item to `todo`, keep FAME-8's original narrower pin
  shipped, and revisit when the CSS-nesting scanner gets a real parser (postcss-less or similar).

Silence is not approval for this one: the item stays **blocked/frozen** until you answer.
