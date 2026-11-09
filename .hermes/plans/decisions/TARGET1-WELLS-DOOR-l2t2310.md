# ARCHITECT DECISION PACKET — L2-CLARIFY-TARGET-1: the `kind: 'wells'` STRING dimension now barred by the doc door

Filed: 2026-11-02T23:20 EST (orch l2t2310)
Lane: 2 · Item: L2-CLARIFY-TARGET-1 (in-progress, continuation run `cl-l2-coder-target1-cont-l2t2245`)
Ending in: one RULING, options (i) / (ii) / (iii) below.

## What happened

The approved Change-4 DATA flip (`volumeUl.required: true`, `targetWells` declared on `add_material`) is in the branch.
The earlier ruling `decisions/L2-TARGET1-VOLUMEOBJECT-BAR-l2t2230.md` (a) has been implemented: `satisfiedBy: [volume]`
alias slot + one generic object-shape arm, committed `42f85403`, and it **cleared the volumeUl fact** — verified by the
coder's raw run (`/tmp/t21-green-satisfiedby.txt`, 4/4 spine4 pins green; `grep -n "'volume" resolveNounsPass.ts` empty).

But the three shipped pins the old ruling said "go green without edit" **still fail, on a DIFFERENT dimension**:
`targetWells` with the compact-range STRING `A1:H12` now yields `unknown-address`.

- `declaredArgumentReachability.test.ts:168` (CHARACTERIZATION) — exactly ONE fact remains:
  `{label:'A1:H12', argument:'targetWells', reason:'unknown-address'}` (the volumeUl fact is gone).
- `declaredArgumentReachability.test.ts:378` (GHOST) — `needs-clarification` on targetWells/unknown-address.
- `realizationGolden.test.ts` W2-7 T1/T2 — `needs-clarification` (the golden doc fires targetWells).

Base-parity confirms all three PASS at base, so this is a pure consequence of the mandated flip.

## Root cause (orch-verified first-hand at branch tip 42f85403)

`server/src/compiler/resolution/resolutionEngine.ts` doc door:

- `:488` `if (contract.kind !== 'resolvable' && contract.kind !== 'wells') continue;`  ← wells args ENTER the door
- `:516` `if (typeof raw !== 'string' || raw.trim().length === 0) continue;`  ← scalar arm spine-routes ANY non-empty string
- `:407` `else if (req.declared.kind === 'wells') clarifications.push(clarificationFor(req,'unknown-address',[]));`

So a declared `kind:'wells'` argument carrying a string address (`A1:H12`) is sent to the **material noun spine**, which
cannot bind an address, and the wells arm converts that miss into `unknown-address`.

Before this flip, `add_material` declared no `targetWells`, so nothing routed. Now it does — and the docs that carry the
string form (the three pins, plus the golden doc) bar.

**Blast radius is wider than add_material.** The shipped vocabulary declares `kind: wells` on many contracts
(`schema/scientist-intent/scientist-intent-vocabulary.yaml:319,359,362,569,575,788,791,822,825,853,856,881,884`), e.g.
`transfer` source/target wells and aliquot/incubate wells. Any of them fed a STRING address in a doc is on the same path.
(Only those documents are affected; the tests that pass arrays are invisible to the door — arrays require
`cardinality: many` with `itemNounField`, which `wells` contracts do not declare.)

## Why this is not the coder's call

The coder obeyed its STOP rule: changing `resolutionEngine.ts` (a behaviour change affecting every `kind:wells` arg) is
outside its exact in-scope path list and outside ruling (a)'s ~10-line scope; rewriting the three pins' string
`targetWells: A1:H12` into a 96-entry array would destroy the pins' compact-range property. Both are yours.

## Options

**(i) — DOOR FIX (recommended): wells args are addresses, not nouns; keep them out of the material spine.**
In the doc door, skip `kind:'wells'` contracts in BOTH arms (scalar and declared-cardinality), i.e. change `:488` to
`if (contract.kind !== 'resolvable') continue;`. Kind-declarative, zero field names, zero domain literals — the vocabulary
already declares which args are addresses. Wells addresses then resolve where they are already resolved today for the
array/`wellset` form (client well-target slot + the expander), never through the material spine.
Consequences to rule on explicitly:
  * `unknown-address` from the door arm `:407` becomes unreachable for scalar strings. Is that correct (address validity is
    the expander/lint's job, not the resolution door's), or does something rely on that bar for a genuinely bogus address
    (e.g. `A1:ZZ99`)?
  * Do the three pins then go green UNEDITED (the old ruling's expectation), or does the coder also need a characterization
    update because the fact disappears entirely?
  * Any doc currently relying on the door to bar a bad string address would lose that bar. The coder must MEASURE that
    (grep + run the resolution suites) and report it, not assume.
Multi-offer / never-guess invariants are untouched: this removes a false bar, it does not add a guess.

**(ii) — PIN ADAPTATION (smaller, semantically narrower):** keep the door as-is, and edit the three pins' documents to the
canonical ARRAY form `targetWells: [A1 … H12]` (96 entries) or to the declared `wellset` token form. Rejected by the coder
as destroying the compact-range property of the pins; it also leaves the door barring every future string-address doc.

**(iii) — CONTAIN IT (status quo + scoped exception):** make only `add_material.targetWells` exempt from the door, leaving
every other `kind:wells` contract on the spine path. Cheapest green, but it is a per-contract exception in code — the exact
shape the campaign forbids (two rules for one entity). Listed only for completeness.

## What the ruling must name

1. Which option; if (i), whether the door change may land inside L2-CLARIFY-TARGET-1's boundary (it is a new file for this
   item: `resolutionEngine.ts`) or must be filed as its own item with TARGET-1 blocked behind it.
2. Whether the three pins are expected to go green unedited under the chosen option (the coder's GREEN bar).
3. Whether `unknown-address` should remain reachable at all in the door, and if so on which path.
4. The blast-radius bar: does TARGET-1 merge on "the flip is green for the resolution+scientistIntent dirs", or does the
   wells dimension need its own per-leg evidence first?

## Evidence paths (all first-hand, orch-opened)

- Branch `cl/lane2-target1-1-l2t1810` in `/mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810`, tip `42f85403`.
- `server/src/compiler/resolution/resolutionEngine.ts:407,:488,:516`
- `server/src/compiler/resolution/resolveNounsPass.ts` (satisfiedBy sweep, grep-clean of `'volume` literals)
- Coder report `.hermes/plans/deliverables/L2-CLARIFY-TARGET-1-report.l2t1810.md` — "CRITICAL NEW FINDING" section
- Prior ruling `decisions/L2-TARGET1-VOLUMEOBJECT-BAR-l2t2230.md` (a)
