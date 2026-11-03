# ARCHITECT DECISION REQUEST — L2-CLARIFY-TARGET-1: does the `volume` OBJECT form satisfy the required `volumeUl`?
# lane 2 · tick l2t2230 (2026-11-02 ~22:25 EST) · requester: orchestrator
# Status: OPEN. Answer lands HERE under "## RULING".

## Context
TARGET-1 adds the assumed-value CHIP for an add_material turn whose prompt names NO volume
(`volume: 100 uL (assumed)`, value declared in DATA: config/drafting/shorthand-drafting.yaml
`assumedValues:`), and flips the vocabulary so `add_material.volumeUl.required: true`
(the CARD-1 3b flip, AMENDMENT l2t0920) plus a new `targetWells` required arg.

The coder measured the blast radius first-hand: with the flip, 11 ADDITIONAL test files fail at the
branch tip. Ten of them are golden/fixture updates. ONE is a genuine semantic collision, which the
coder refused to resolve unilaterally (correctly) and routed here.

## The collision — VERIFIED BY ME (orchestrator) in code, not from the report
`server/src/compiler/resolution/resolveNounsPass.ts:252-260`:
    function argumentPresent(raw: unknown): boolean {
      if (typeof raw === 'string') return raw.trim().length > 0;
      if (Array.isArray(raw)) return raw.length > 0;
      if (typeof raw === 'number') return Number.isFinite(raw);
      return false;                       // <-- OBJECTS are ABSENT
    }
The sweep then bars any declared-required, non-scalar argument for which `argumentPresent` is false
(`requiredArgumentClarifications`, same file :262-289).

But `scientist-intent.schema.yaml:166` declares a `volume` OBJECT form `{value, unit}` for an action,
and `simpleVerbs.ts:575-598` honors it. So a document that states its volume as
`volume: {value: 50, unit: uL}` now produces a MISSING-REQUIRED-ARGUMENT clarification for `volumeUl`,
even though a volume IS stated. Three shipped pins assert this shape compiles COMPLETE:
`declaredArgumentReachability.test.ts:159`, `:370`, `realizationGolden.test.ts:263`.

## Why this is not a routine implementation choice
- TARGET-1's own intent (W11): the defect is an INVENTED volume, not a STATED one. Barring a stated
  volume contradicts that intent and reads to a scientist as "you didn't say a volume" when they did.
- BUT the alternative (bar) is also defensible: `add_material`'s declared contract is `volumeUl`; if the
  object form is a legacy/alternate representation, the flip makes the contract single-form and those
  three pins are obsolete by design. That is a product-contract change, not a test update.
- Either way something must move: a shipped pin, or the presence predicate. Two readings, different
  user-visible behaviour → not an orchestrator call.

## Options
(a) OBJECT FORM SATISFIES (recommended). A stated `volume: {value, unit}` counts as present for the
    declared-required `volumeUl`. Rationale: never bar a stated fact; the item exists to stop invented
    numbers. Implementation must stay DATA-declared (e.g. a declared alias/equivalence list of
    argument names + accepted shapes in the existing scientist-intent vocabulary YAML, consumed by the
    generic sweep) — NOT a TS `if (args.volume)` branch. If you prefer, name the exact declarative
    surface and where the alias is declared.
(b) BAR ON volumeUl ONLY. The object form stops satisfying add_material's contract; the three pins are
    rewritten to expect the bar, and the vocab contract is genuinely single-form. Cost: a scientist who
    states `volume: {value, unit}` gets asked for a volume they already gave; needs an explicit
    product-intent line because it degrades a shipped behaviour.

## Constraint either way
- No new hardcoded field names in TypeScript; any equivalence is declared as DATA.
- The change must not re-open the invented-number defect (a turn stating NO volume still fires the
  assumed-value chip / W11 refusal leg).
- Answer must fit inside TARGET-1's scope or say explicitly that it is a separate item.

## Evidence paths
- branch/worktree: /mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810 (branch cl/lane2-target1-1-l2t1810)
- coder report: .hermes/plans/deliverables/L2-CLARIFY-TARGET-1-report.l2t1810.md §4 "BLOCKER 1"
- spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md
- sibling ruling on the flip: .hermes/plans/decisions/CARD1-W11-volume-boundary-l2t0747-ruling.md

## RULING: (a) OBJECT FORM SATISFIES.
Architect ruling, lane 2, tick l2t2230, 2026-11-02.

### Verification (all packet claims hold; three path corrections)
- `argumentPresent` bars objects exactly as quoted: resolveNounsPass.ts:252-257 (`return false`
  fallthrough for objects), sweep :259-284 loops `argContracts(verb)`, skips `kind: scalar`,
  checks `fields[contract.name]` raw — an action carrying `volume: {value, unit}` leaves
  `fields.volumeUl` undefined → MISSING_REQUIRED_ARGUMENT fires. Confirmed at the branch tip.
- The object form is honored downstream: simpleVerbs.ts:575-598 (actual path
  `server/src/compiler/biology/verbs/simpleVerbs.ts`) reads `declaredVolume` and derives
  `volumeUl` ONLY when `unit === 'uL'` (no arithmetic — unit honesty already ruled).
- The object form is declared data: `volume: {}` at `schema/workflow/scientist-intent.schema.yaml:166`
  (packet cited the bare filename; the schema lives under schema/workflow/, not schema/ root).
- The vocabulary ALREADY declares both args for add_material: `volumeUl` (quantity, now
  `required: true` at scientist-intent-vocabulary.yaml:294-296 — the flip is in the tree) and
  `volume` (quantity, `required: false`, :297-299). The equivalence therefore rides an
  already-declared pair; no new arg appears anywhere.
- The three pins exist and assert COMPLETE with `volume: { value: 50, unit: uL }`:
  declaredArgumentReachability.test.ts:159-175 and :369-385 (packet's ":370" is the same `it`
  block), realizationGolden.test.ts:262-263. These are SHIPPED behaviours the flip breaks,
  not fixtures written for the flip.

### Why (a)
W11's ruled intent (CARD1-W11-volume-boundary ruling, amendment (6): "a prompt naming NO volume
must fire a card or refuse ... never silently stage an invented number") is about ABSENT volumes.
Option (b) asks the scientist a question they already answered — that is the same failure class
as an invented number, wearing the other uniform. The alternative's "single-form contract"
justification is contradicted in-tree: normalizeScientistIntent already maps
`['volume', ['volume']]` and TWO lowering homes (simpleVerbs add_material, transferExpander)
honor the object deliberately (SHORTHAND-COMP-1 Task 14). (b) doesn't make the contract
single-form; it makes it inconsistent between the presence sweep and the lowering.

### The exact declarative surface (implementation contract for the coder)
1. `schema/scientist-intent/scientist-intent-vocabulary.schema.yaml`: add one DECLARATION SLOT
   to the arg-contract item properties (the arg item has `additionalProperties: false` at :69,
   so the slot must be declared here):
   `satisfiedBy: { type: array, items: { type: string, pattern: "^[a-z][a-zA-Z0-9_]*$" } }`
   — a list of ALTERNATIVE argument names whose presence satisfies this contract.
2. `schema/scientist-intent/scientist-intent-vocabulary.yaml`, add_material's `volumeUl`
   contract (:294): `satisfiedBy: [volume]`. No other verb gets the slot.
3. `resolveNounsPass.ts` generic sweep, present-check becomes:
   `argumentPresent(fields[contract.name])` OR any `contract.satisfiedBy ?? []` name passes
   `argumentPresent`. ZERO name literals — `volume`/`volumeUl` never appear in TS.
4. `argumentPresent` grows one SHAPE arm (not a name arm): plain object → present iff it has a
   finite numeric `value` AND a non-empty-string `unit`. Generic quantity-object recognition —
   `volume: {}` stays absent; a bare number already passes the number arm (consistent with the
   bare-numeric-volume-as-uL lowering rule at simpleVerbs.ts:564-571). NO unit validation,
   NO conversion in the sweep — unit honesty stays where it lives (lowering only derives
   volumeUl for literal 'uL'; a `{value: 0.05, unit: 'mL'}` stated volume counts as STATED,
   and the existing lowering behaviour for non-uL objects is unchanged, in or out of scope).
5. Optional-but-recommended lint addition in scientist-intent-vocabulary.lint.yaml: every
   `satisfiedBy` entry must name another declared arg of the same verb (no dangling aliases).

### Constraints check
- No hardcoded field names in TS: satisfied — the only new TS is a shape arm + a generic loop.
- Invented-number defect stays shut: a turn with NO volume and NO volume object still fails
  the present-check → MISSING_REQUIRED_ARGUMENT(volumeUl) → the assumed-value chip leg joins
  the exact `(add_material, volumeUl)` pair in the `assumedValues:` DATA
  (assumedQuantities.ts:144, shorthandChat.ts:917-927) → chip fires exactly as W11 requires.
  Only a STATED volume now skips the chip — which is the point.
- The three pins need NO edit under (a): they go green again as written. Under (b) all three
  (plus whatever the realization golden derives) get rewritten to expect a bar. (a) preserves
  shipped pins; (b) degrades shipped behaviour for consistency nobody asked for.

### Scope: fits inside TARGET-1. Not a separate item.
The deferral ruling (CARD1-W11-volume-boundary-l2t0747) made TARGET-1 the SOLE owner of the
entire W11 volume gate including the V1 flip. This collision is the flip's direct declared
blast radius — the coder found it exactly by doing TARGET-1's enumeration work. The hunk is
~10 lines in one function TARGET-1's sweep already owns, one schema slot, one YAML line. No
pin rewrites, no new file. Fold into TARGET-1's spec as Change 4a (or 5); the W11 truth-table
row's (i)/(ii) legs are unaffected.

END-RULING
