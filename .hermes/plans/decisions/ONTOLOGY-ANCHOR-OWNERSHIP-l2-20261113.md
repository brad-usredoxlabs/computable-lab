# RULING — who owns an ontology anchor: the name, not the bottle

Lane 2 · architect · 2026-11-13 · answers cards/architect-card-ontology-anchor-ownership-l2t1891.md
and cards/architect-card-ontology-anchor-schema-l2t1863.md (one seam, two cards)
Status: BINDING for lane 2. Unblocks L2-ONTOLOGY-ANCHOR-SOURCES-1 legs g4-leg3 / g6-legB.

## First, a correction to the premise both cards share

Both cards describe "the current merged design: anchor fields live on the labware-definition
record; instances inherit". **Measured on trunk f4987dc7 while writing this ruling:** no such field
exists. `grep -rn "anchor\|ontology_anchor" schema/lab/labware.schema.yaml
schema/lab/labware-instance.schema.yaml schema/lab/labware.ui.yaml schema/lab/labware-instance.ui.yaml`
returns nothing; `schema/lab/labware-instance.schema.yaml:12` requires only
`[kind, recordId, labwareId]` and its properties are `kind, recordId, labwareId, label, barcode,
links`. So the "merged design" is not merged; the anchor shape must be ADDED as data. Plan
accordingly, and do not brief a leg against a field that isn't there.

## The ruling

**An anchor belongs to whatever is being NAMED.**

1. **A definition is a concept and owns the anchor.** "96-well deepwell plate" is a term in a
   labware ontology; the design record is the thing that claims it. The anchor is one declared
   object on the definition: the ontology term (CURIE), its label, its namespace, and an explicit
   `anchored | unanchored` state with a reason when unanchored. Same shape as the existing term
   discipline: a CURIE plus a human label, never free text alone.
2. **An instance inherits, and never duplicates.** A physical plate does not have its own species
   or its own well count. The instance form shows the anchor **read-only, labelled with its
   source** ("anchored to NCIT:C111111 via definition LBW-000042"), resolved from `labwareId`.
   It is never copied into the instance payload, because a copy is a second authority that drifts
   on the first rename.
3. **The one exception, and it is the creation journey's whole point:** an instance with **no
   definition** carries its own anchor (the marker-labelled bottle of DMEM is still DMEM,
   NCIT:C185409, even though its vendor provenance is unknown). In that case the missing definition
   is a **declared unresolved slot** on the instance, visibly empty, and the anchor is an optional
   field of the same declared shape. Ownership follows the name: no definition, so the instance is
   the only thing that can carry it.
4. **Shape: data, not a new record type.** One shared `$def` (e.g.
   `schema/core/datatypes/ontology-anchor.schema.yaml`) referenced by both labware schemas, with
   `.lint.yaml` rules declaring that `anchored` requires a CURIE and `unanchored` requires a reason.
   No `ontology-anchor` record kind, no parallel local vocabulary, no "anchor" boolean without its
   term.
5. **Migration stance: leave unanchored and flag.** No backfill, no lazy write-on-read, no boot-time
   repair. An existing instance renders "no anchor declared" naming its definition's anchor state.
   Backfilling would mint claims nobody made — the same failure as a ghosted assumption shown as a
   fact.

## Consequences (binding)

- **Gate criterion, corrected.** ONTOLOGY g6 leg B currently grades FIX every cycle because the
  instance door has zero ref-comboboxes. That is the wrong criterion for an instance that HAS a
  definition: the correct assertion is "shows the anchor inherited from definition X, labelled with
  X's id, read-only". Add one leg for the definition-less instance, where a ref-combobox IS
  required. Re-grade leg B against the corrected pair, not against the old single assertion.
- **Landing leg**: add the shared `$def`, the two schema references, the two lint rules and the two
  UI reads (definition: editable; instance: read-only with source label, editable only when
  `labwareId` is absent). Then the existing term-linking path (leg C's accepted commit) supplies
  the value; no new search machinery.
- **Tests**: an instance with a definition renders the inherited anchor and names its source; a
  definition-less instance requires an anchor or an explicit unanchored reason; renaming the
  definition's anchor changes what the instance displays and does not change the instance record;
  an `anchored` record without a CURIE fails lint by name.

## Not in scope

No anchor record type, no per-instance vocabulary, and no retro-anchoring of existing records
without a human accept.
