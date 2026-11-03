# Brad card — L2-CLARIFY-TARGET-1 golden leg: where does the target well address come from?

Filed 2026-11-03T03:00 EST by the lane-2 orchestrator tick (l2t0255). One question, one answer needed.

## What is already done and shipping

The WELLS DOOR fix is complete on branch `cl/lane2-target1-1-l2t1810` (worktree
`wt/L2-CLARIFY-TARGET-1-lane2-l2t1810`, functional tip `9374a681`, head `5919f288`):

- A real well address typed as a scalar (`A1:H12`) on a `kind:'wells'` argument is no longer barred as
  `unknown-address`; it rides to the lowering, which expands it through the existing parser (`expandWellTokens`)
  into per-well events. Shape-gated: symbolic labels (`control_well`) and bogus addresses (`A1:ZZ99`) still bar.
- The shipped test edits the previous run had made were REVERTED (per ruling §2/§4); the two string pins now pass
  because the engine changed, not because the tests moved.
- Evidence: dir sweep 547/549 server resolution tests, only `realizationGolden` T1/T2 red; two string pins,
  nounResolution `bogus_role`, rolesSeam SPINE-7 (20/20 + 7/7), e2eStubHonesty 7/7, pattern fixtures 13/13 all green;
  server typecheck 0; app typecheck zero-new; the 2 golden fails reproduce byte-identical at the pre-fix engine
  (so the door change is orthogonal to them).

## The open question (yours — the ruling says no one below you may decide it)

`realizationGolden` T1/T2 fail with `missing-required-argument`: the LOWERER emits `add_material` with no
`volumeUl` and no `targetWells`. The coder measured (and I have no contrary evidence) that **no honest data source
exists** for the target-wells value in that realization:

- the `add-lysis` step declares no constraints;
- the realization's only wells-unit datum is a COUNT (not an address);
- the profile carries only source-side / capacity fields;
- `assumedValues` declares `add_material.targetWells` as a **question with no value** (volume has 100, but that is a
  chatbot chip surface, not a realization source).

So emitting a value would invent a number or an address the scientist never stated — the W11/W12 defect the
campaign forbids. The coder therefore refused to emit and refused to re-bless the golden.

## Pick one

1. **Brad supplies the honest source** for `targetWells` (and `volumeUl`) in the lysis realization — e.g. "the plate
   is the 96-well deepwell from the seeded plate; lysis targets the whole seeded well range" — and I file a lowerer
   leg that reads it from a DECLARED surface (fixture/policy/vocabulary data), not from code.
2. **Approve re-blessing the golden** to the current outcome (bar stays visible as a known lowerer gap, tracked).
   The ruling forbids this without your explicit approval — that is exactly this card.
3. **Leave the golden leg red and tracked**, split it into its own task (`TARGET-1-LOWERER-WELLS`), and close
   TARGET-1 on the door work alone. Nothing else in the campaign blocks on it.

Recommended if you have no preference: **3** — it is the smallest reversible step, it keeps the defect visible
instead of blessed, and the door work (the part a scientist can feel: typing `A1:H12` no longer errors) ships either
way. Answer in one line; I will act on it in the next tick.

## What is NOT blocked on this answer

- Merging the door work (adversarial gate is running now; I merge on ACCEPT regardless of this card).
- The clarify-card fix run, the ghost-paint and fixture-board specs, and prompt-2's re-gate.
