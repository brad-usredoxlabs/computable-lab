# RULING — one definition, one identity (the flagged "two identities" seam)

Lane 2 · architect · 2026-11-13 · raised by the orchestrator in tick l2t2015, answered here
Status: BINDING. Folds into L2-P1-SEED-ENTRY-1; no new producer, no alias table.

## What was observed

Two identifiers exist for one labware concept:

- the record STORE carries `lbw-def-generic-96-well-deep-plate` (payload id `generic/96_well_deep_plate@v1`);
- the labware-definition REGISTRY entry the clarifier offered was `lbw-def-generic-96-well-deepwell-plate`
  — a slug minted from the display name "Generic 96-Well Deep Well Plate".

The merged answer-channel fix (609e902d) now makes BOTH resolvable. That is a correct stop-gap and a
wrong end state: two resolvable ids for one thing is the "second authority" defect with a friendly face.

## The ruling

1. **An id is minted once, at creation, and referenced everywhere.** A registry entry, a picker row, an
   answer, a link, a fixture and a test carry the SAME recordId. Never a slug of a display name, never a
   second spelling that "also works".
2. **A registry may not invent an identity.** If the registry needs an entry for a store record, that
   entry's id IS the store recordId. A slug derived from a human label is a display artefact and must never
   leave the presentation layer.
3. **Aliases resolve to one canonical id.** A legacy spelling may be accepted on INPUT (so old links and
   old answers do not break) but it resolves to the canonical recordId and is never emitted. Emitting an
   alias is the defect.
4. **Test it as a set relation, not a spot check:** for labware definitions, every registry id must appear
   in the store's recordIds. One test, fails loudly on the next minted slug.

## Consequences

- The seed entry-state unit (L2-P1-SEED-ENTRY-1) also removes or renames the registry's deepwell entry so
  that it carries the surviving record's recordId; the two records are not allowed to both survive under
  different names.
- The answer-channel fallback merged today stays as the resolver for legacy spellings, but nothing new may
  emit one.
- Add the set-relation test to the same unit; it is the guard that keeps this closed.

## Not in scope

No general alias table, no id migration tool for arbitrary records, and no renaming of store records that
runs, event graphs or instances already point at.

## AMENDMENT — Brad's decision (2026-11-13, in session) and the registry/store question answered

Brad: "my decision: a. doesnt a missing labware simply fire the add labware loop, which we are in the
process of finalizing?" — Yes, and that is what makes (a) correct rather than merely cheaper. Adopted as
option (a), with one routing rule that makes his sentence literally true.

1. **Offered means it exists.** A registry entry may be OFFERED as bindable labware only when its id is a
   store recordId. That is the set-relation test: every OFFERABLE registry id appears in the store.
2. **Not bindable is a create-door prefill, never an option.** An entry with no record (the 19 generic
   shapes) is declared non-bindable and cannot be selected as a definition. Selecting it instead OPENS THE
   CREATE PATH with its name prefilled — the same creation journey the corpus exercises. The catalogue then
   never pretends the lab owns a beaker; it offers to help the lab acquire one.
   This is what makes "a missing labware fires the create journey" true on the PICKER path as well as the
  chat path; a blank or disabled row would be the dishonest version.
3. **No 19 new records.** The lab's stock does not grow to satisfy a vocabulary. Store records are created
   when a person creates one, through the governed write, with provenance.
4. **The test is scoped, not weakened:** assert (i) every offerable registry id ∈ store recordIds, and
   (ii) every non-offerable entry carries the declared flag. Two directions, both mechanical.

## SUPERSEDING AMENDMENT — Brad, 2026-11-13, verbatim

"Yes. A biologist should be able to say 'I used a 5 mL tube,' and CL should record that without requiring
inventory setup. The quoted rule conflates a thing we can describe with a thing the lab has registered as
stock.

* A vocabulary entry isn't an ownership claim. Offering '5 mL tube' means CL understands that category. It
  doesn't mean the lab has any in stock.
* The sentence supplies the evidence: the biologist reports using a 5 mL tube in this experiment. Record that
  assertion with its provenance; manufacturer, catalog number, lot, and inventory identity can remain
  unspecified.
* Both paths should support the same lightweight result. Typing '5 mL tube' or selecting it from a picker
  should let the user describe what they used. Neither should force them through inventory creation.
* Require detail when it changes execution or interpretation. A historical note may need only nominal volume.
  A robot handling that tube may need exact geometry and compatibility. Ask for those details at that boundary.
* Replace 'offered means it exists' with 'offered means its meaning is explicit.' Distinguish a generic
  labware type, a registered product, and a tracked physical item. Never silently promote one into another.

Inventory should become richer as a consequence of recording lab work — not be the admission fee for
recording it."

**This supersedes my admission rule.** "Offered means it exists" was wrong: it made stock the price of
description. The id-uniqueness half of this ruling still stands (one id, minted once, never a slug).

## The three referents (never collapsed, never silently promoted)

1. **GENERIC LABWARE TYPE** — a category CL understands ("5 mL tube", "96-well deepwell plate"). A vocabulary
   entry. Says nothing about ownership, count, location, lot, vendor or geometry.
2. **REGISTERED PRODUCT** — a specific catalogue item the lab buys (vendor, catalogue number, package size),
   which points at a generic type. Still not a count and not a location.
3. **TRACKED PHYSICAL ITEM** — a concrete vessel or aliquot with an instance identity, location, lot, quantity
   and receiving provenance.

Recording use may reference ANY of the three. Referencing (1) is a complete assertion, not a degraded one.

## Rules

- **A run assertion records what the person reports, with provenance, and may leave detail unspecified.**
  "I used a 5 mL tube in this experiment" is a first-class record: nominal type + who said it + when +
  which run/step. Unspecified fields are declared unspecified, never filled with defaults and never used to
  demand inventory setup.
- **Detail is required at the boundary where it changes execution or interpretation, and nowhere earlier.**
  A capability or human task DECLARES the detail it needs (a deck placement needs a geometry-bearing
  definition and an instance; an imaging analysis may need well geometry; a narrative note needs only the
  nominal type). The requirement lives in declared data at that step, not in a global admission gate.
- **Promotion between referents is an explicit, recorded act** with its own provenance: "is a 5 mL tube" →
  "this is Nunc 339650 lot L24" → "this is ITEM-000412 in drawer B2". Each step is a record written when the
  information exists. No path may silently upgrade a description into stock, and no path may refuse to
  record work because the upgrade has not happened.
- **Both entry paths give the same lightweight result.** Typing the name and picking it from a picker must
  produce the same assertion; neither may divert into an inventory workflow. If a step needs more detail,
  it asks for that detail at the step, visibly, and the record shows what is still unspecified.
- **The catalogue's admission test becomes semantic, not stock-based:** every entry declares WHICH referent
  it is, and the set-relation test becomes (i) every offered entry declares a referent kind, (ii) a type
  entry never claims a vendor/catalogue identity and a product entry always names the type it realizes,
  (iii) no entry is promoted between kinds without a recorded act.

## Consequences for the work in flight

- **L2-P1-SEED-ENTRY-1 / seedreg:** the test is rewritten to the semantic form above. Do NOT require store
  records for vocabulary entries and do NOT seed any. The earlier "every offerable id ∈ store recordIds"
  assertion is withdrawn.
- **L2-P1-CREATE-DOOR-1:** the create path must accept a type-only outcome ("record that I used a 5 mL tube")
  and offer, but not require, registering a product or an item. A person may finish the journey with a
  generic type and no inventory.
- **L2-JOURNEY-NOUN-CREATE-1:** the three declared alternatives stay (vendor/ontology, local formulation,
  local product/sample) but the generic-type outcome must be reachable from each without forcing the heavier
  path — and the manifest's scenario-2/3 expectations (create the Sigma/NEB product) remain explicit because
  those sentences name vendors and catalogue numbers.
