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
