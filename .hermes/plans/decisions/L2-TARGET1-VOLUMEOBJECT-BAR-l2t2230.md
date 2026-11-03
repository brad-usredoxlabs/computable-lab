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
