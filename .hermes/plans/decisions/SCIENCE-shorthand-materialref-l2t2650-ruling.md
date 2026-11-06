# ARCHITECT RULING — SCIENCE-CHAIN shorthand `material_ref`: the compiler owns it, the pin re-baselines (lane 2, l2t2650)

Date: 2026-11-06 13:55 EST. Decider: architect. Requested by: orchestrator, handoff l2t2610 ("5th
iteration on one seam => RULING question"), restated l2t2645.

## The collision, as posed

- **Criterion A** (u4 / SCIENCE-CHAIN-1): bound record refs + composition snapshots must land on
  compiler-draft events.
- **Criterion B** (`shorthandChat` pins): the compiled graph must be byte-equal to
  `direct.terminalArtifacts.events`, which carries no `material_ref`.
- Five iterations have now passed between these two. Failure mode observed: mint leak gone, replaced by
  `bound material_ref kind=record id:MAT-dmem-1` in 12 compiled events vs a deterministic graph without
  it.

## RULING

**The deterministic compiler owns `material_ref` on the shorthand compile path. The equality pin
re-baselines onto the compiled artifact; nothing strips data, and nothing skips enrichment.**

Against the three proposed shapes:

1. **projectGraph strips it — REJECTED.** A projection that deletes a bound reference makes the graph a
   lossy view of the compile. That is the same defect family as the blank tooltip and the `—`
   concentration: the UI shows an unbound material because the surface was never told. Stripping would
   satisfy a pin by removing truth.
2. **enrichDraftResultEvents skips the compile path — REJECTED.** It manufactures two classes of draft
   event with different fidelity, which is precisely the duplication seam that cost COMPBIND fourteen
   units (two tooltips, two boards, two formatters). One turn must not depend on which door it came
   through.
3. **The deterministic compiler emits it — ACCEPTED.** Both artifacts then derive from one compiled
   output, so byte-equality holds WITH the ref present.

**What the equality pin is actually for, and therefore how it may be changed.** Its purpose is "the graph
projection never invents facts the compile did not produce". That purpose survives the field's arrival;
what does not survive is a pin anchored to a PRE-enrichment fixture. A pin may be re-baselined when the
contract legitimately gains a field; it may never be satisfied by deleting the field from the producer.
Concretely: the `shorthandChat` pin must compare the projection against the compiled artifact carrying
`material_ref`, and the fixture that encodes the no-ref shape must be updated in the same commit with the
old value quoted in the report.

## BINDING CONSTRAINTS

- One owner for the field: the compiler. No second writer, no per-path branch, no name test on
  `MAT-dmem-1`.
- `MAT-dmem-1` must arrive through the vocabulary/declaration path like any bound ref; a literal in TS is
  a defect on sight.
- The composition snapshot rides WITH the ref (same event), because a ref without a snapshot is what left
  the tooltip blank.

## ACCEPTANCE

1. RED at d4ae846b: the two named pins fail as measured (`compiles the stubbed shorthand-only turn`,
   `REFUSES a raw event_graph call`). GREEN after: 12 compiled events carry `material_ref`
   `kind=record id:MAT-dmem-1` AND the projection equals the compiled artifact byte-for-byte.
2. Mutation: delete the compiler's ref emission -> equality pin must go RED (proves the pin still has
   teeth, i.e. it was not neutered into agreeing with a gapped fixture).
3. No enrichment skip path exists in the diff (grep proof), and no stripping branch in projectGraph.
4. Report must quote the old fixture value and the new one side by side.

## SCOPE

Unit files: the deterministic compiler's shorthand emission, `projectGraph` only if it needs no change,
the two failing pins + their fixtures. NOT in scope: the mint path, the `MSP-PR9-TEST-CLO-1MM` fixture
question (separate, awaiting a Brad decision on fixture retirement), VACUOUS-PINS.

**This ruling replaces the dispatch loop.** A sixth iteration on the same seam without this ordering is a
process defect, not a coding result.
