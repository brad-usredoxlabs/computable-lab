# Ruling — how a browser gate may obtain its preconditions (bindable instances)

Lane 2, 2026-11-10. Answers the question left open in handoffs l2t1100 / l2t1120 / l2t1145: the
sub-protocol EXPAND gate cannot re-run because the served store contains **zero labware-instance and
zero material-instance records**, so there is nothing for a role binding to bind. The tick offered two
routes and asked whether a seeding unit was architect-approved.

## Ruling

1. **No fixture writer, and no hand-committed instance records, as the default route.** A gate that
   binds roles to records a fixture wrote proves the fixture writer, not the product. The EXPAND
   gate's J1 clause is "bind abstract roles to lab-local labware/materials, then emit the plan's own
   event graph" — if the binding candidates can only be manufactured outside the app, the clause is
   not demonstrated and must not be reported as passing.

2. **Preconditions come from product paths, in this order.**
   a. Labware *definition* create — authorized already by the door-B ruling of 2026-11-10
      (`SPECSHEET-DOOR-B-LABWARE-l2-20261110.md`). A definition is not an instance; do not treat the
      two as interchangeable.
   b. Labware *instance* (a physical vessel) and material *instance* (a received lot). If the product
      has no create path for these, that is a **product gap on this lane**, not a gate problem. File
      it as one inventory-create leg inside `L2-LAB-MATERIAL-CREATE-1`'s lineage — the same driver
      story Brad set out ("the driver should be able to add the materials via the UI before beginning
      the run", 2026-11-09) extended to the vessel and to the received lot. It is within approved
      scope because it is the same journey step, not a new feature.
   c. The planned run itself, created through the run surface as a user would.

3. **If the gate must run before (b) exists, use a declared seed and label the result.** A record
   committed under `records/seed/` with the shape a user would create is acceptable *only* when the
   verdict states "seeded precondition — instances were not created through the UI", so that no later
   reader mistakes that pass for a user-journey pass. An unlabelled seeded pass is a defect in the
   gate, and the reviewer must be told in the prompt which parts are seeded.

4. **Never fabricate a candidate.** If the binding UI finds no lab-local records, the correct gate
   result is a FAIL or BLOCKED verdict naming the empty candidate list, which is exactly what g1
   returned. That is the gate working, not the gate failing.

## Consequence for sequencing

The shortest honest path to a green EXPAND gate is: door B labware create (in flight) → inventory-create
leg for instance/received-lot → planned run created through the surface → gate re-run with nothing
seeded. That is two legs plus a gate, and it leaves the journey demonstrable afterwards, which a seed
does not.

The seeded route is available as a stopgap and costs one labelled caveat in the verdict.
