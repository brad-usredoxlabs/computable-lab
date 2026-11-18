# Prompt 1 becomes the generic step; the vendor-product test moves to prompt-1b (BRAD, 2026-11-14)

Status: BINDING, one-time authority given in session. Canon edited and committed in Brad's tree
(`0776eb94b`); manifest re-pinned and clean at 11 scenarios, sha `3a92e094488e729a…`.

## Brad's words

> "the original prompt i wrote was simply, 'place a 96-well deepwell plate onto the deck.' which
> apparently we didnt have a deepwell version of. maybe we just need to take this stepwise. im not in a
> place where i can edit the prompts, but i dont want to lose the nights work. im giving you the
> one-time authority to replace my specific Thermo plate ask with just '96-well plate'. something that
> the AI can pull from the generic library just to get something on the deck the same way you can in
> the UI."

## What changed

- **prompt-1** is now `"Place a 96-well plate on the deck."` — the generic case, satisfiable by pulling
  `lbw-def-generic-96-well-plate` from the shipped starter pack. It grades REUSE: the plate is visibly
  on the deck, backed by an instance that points at that definition by record id, with the definition
  count UNCHANGED. Creating a definition where one already exists is now a failure, not a success.
  Being sent through a registration/curation form to place a generic plate is also a failure.
- **prompt-1b** is the previous Thermo A58941 scenario, preserved verbatim as its own scenario
  (`continues_from: null`, own entry state, own human choices, own criteria). Nothing from last night
  is lost and the specificity test is not waived.

## Why this is the right step and not a retreat

The failure mode we kept hitting was that prompt 1 asked the AI to do the *hardest* thing first: invent
nothing, find a vendor product, create a definition, create a product, create an instance, show an
anchor. Eight drives died inside that chain while the UI would place a generic plate on a right-click.

Now the first step is the thing the product can already do — and the acceptance is stricter in one
respect, not looser: the AI must REUSE the library record rather than mint a new one. A model that
"helps" by creating a fresh 96-well definition now fails, which is exactly the discipline we want
before we ask it to create anything at all.

prompt-1b then tests specificity with the same machinery, on a build where the easy path is proven.

## Consequences for lane 2

- `L2-P1-PRODUCT-DOOR-1` now serves **prompt-1b** (criterion 3 there), not prompt-1. It stays urgent in
  the queue but it is no longer on the critical path to prompt-1's pass.
- `L2-P1-DECK-ACTION-ROUTE-1` divides: for prompt-1 the AI must select the existing definition and mount
  it (`addLabware` / `addLabwareFromRecord`); for prompt-1b it navigates to the create surface with the
  noun prefilled. Same ruling, two branches — both already written.
- `L2-P1-ABSENCE-*` remain: a lookup miss on the generic plate must never be reported as an absence.
- The gate prompt reads the manifest's scenario block, so iteration 9 grades the NEW prompt-1 with no
  further instruction; the shipped gate prompt text is generated per drive.
- The corpus tripwire is clean at 11 scenarios and all utterances verbatim.

## What must NOT happen

- prompt-1 must not be graded against the old Thermo criteria, and prompt-1b must not be quietly
  dropped because the first step now passes. Both are acceptance cases; neither waives the other.
- Nothing may be created to make prompt-1 pass. Reuse is the test.
