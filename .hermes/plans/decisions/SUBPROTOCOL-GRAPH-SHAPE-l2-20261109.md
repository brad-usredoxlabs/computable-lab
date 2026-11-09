# SUB-PROTOCOL GRAPH SHAPE — lane 2, prompt 3 (Brad, 2026-11-09)

Status: DECIDED by Brad. Binding for lane 2. Do not re-litigate in code.

## The problem this settles

Prompt 3 opens with "add the Cell Seeding Protocol to the list of protocols followed in this run".
That protocol is not decoration: its own context produces the trypsin-EDTA vendor product, the
900 mL DMEM + 100 mL FBS quench, and the HepG2 flask contents, and its execution returns the
parameter `cells/µL` (483) that the dosing step divides into 10,000. Its labware (flask, bench
vessels) must not occupy deck slots. Today a run references exactly ONE protocol
(`schema/studies/run.schema.yaml:137`) and no `subProtocol` / `sub_protocol` construct exists
anywhere in `schema/` or `server/src/` — so the feature is new composition, not a new worldview.
The two seams it builds on already exist on `schema/workflow/protocol.schema.yaml`: `parameters`
(line 175) and the declarative `producesArtifactId` artifact contract (line 213).

## Brad's ruling, verbatim

  "1) I'll take your recommendation, 2) bisible, read-only."

Asked two questions; the answers:

**D8.1 — Where a sub-protocol's event graph lives.** ONE event-graph record per protocol instance,
linked from the run. Not a namespaced sub-graph inside the run's single graph.

Rationale (accepted): it matches `producesArtifactId` provenance — each produced material points at
the graph that made it — and keeps the plate's deck graph small and readable.

**D8.2 — Whether the sub-protocol is visible in the UI.** Yes: a **read-only "context of creation"
view** on the run surface. Not invisible plumbing.

Rationale (accepted): the whole promise of the exercise is that a user can inspect where a number
came from; a hidden provenance graph cannot be inspected.

## Consequences the implementers must honour

1. A run carries an ORDERED LIST of protocols (addable from the run surface and from chat). A list of
   one is valid, and every existing run is a list of one after migration.
2. Expanding a protocol instance creates its own event-graph record, linked from the run; its
   materials are resolvable from that graph.
3. Context labware (flask, bench vessels) never occupies a deck slot. Verification probe: deck
   labware count is unchanged by adding a protocol.
4. Protocol parameters become run-scoped values addressable by name from later instructions. An unset
   parameter makes the dependent instruction UNDERIVABLE (the app asks or refuses); it is never
   guessed.
5. Produced artifacts materialise as records whose provenance points at the sub-protocol's graph, so
   well composition is computed from provenance. Verification probe: change the quench formulation
   inside the sub-protocol and the well's percentages must change without editing any plate event.
6. The read-only view must show, at minimum: the protocol, its event graph's materials, and the
   parameters it produced — with no editing affordance in that view.

## What this decision does NOT authorise

- No change to the clarification-defaults ruling (CLARIFY-DEFAULT-ghost-first-ruling.md).
- No weakening of the prompt-2 acceptance criteria.
- No product code is written under this decision by the architect; the task blocks in lane 2's
  queue carry it out.


## ADDENDUM (2026-11-09) — universal vs local protocol, and build != execute

Brad, verbatim:

  "the 'protocol' i wrote at the end 'cell seeding' - is a universal protocol. it needs to be brought
   down to a local protocol (bound to soecufic labware and specific lab-local vendor products -
   trypsin-EDTA and DMEM are available from multiple vendors). once its built into a local event graph,
   it can be executed which produces the sub-event graph (it should prompt the user for the cells/ul).
   perhaps we should pre-seed the DB with dome local labwares and materials that are linked to specific
   vendor products and ontology terms?"

### D8.3 Universal -> local is by ROLE, and the binding surface is already declared

A universal protocol names roles, never vendors, catalogue numbers, lots or labware instances. Turning
it local means filling these declarations, which already exist:

  schema/workflow/protocol.schema.yaml            role declarations on the protocol
  schema/workflow/planned-run.schema.yaml:103-140 bindings: LabwareBinding, MaterialBinding
                                                 (roleId + materialRef + lotNumber), ParameterBinding,
                                                 ContextBinding, InstrumentBinding, ...
  schema/lab/vendor-product.schema.yaml           the vendor-product tier
  schema/lab/material-lot.schema.yaml:33-39       supplier { catalog_number, vendor_lot }
  schema/lab/material-receiving.schema.yaml       vendorProductRef + lot (a bare lot never mints an id)

Nothing fills these bindings today. The missing piece is a PRODUCER, not a model.

### D8.4 Build != execute

Building the local plan graph is not executing it. Execution is what produces the sub-event graph, and
execution is what ASKS for the measured parameters (cells/uL) - it must never assume one. Recorded
values carry their producing step and mechanism. An unanswered required parameter blocks execution with
a named error; it does not default.

### Seeding: yes, with a line drawn

Seed labware, lab-local vendor products and lots with catalogue numbers, and ontology-term anchors.
Do NOT seed derived objects - the 90:10 quench formulation, the 50:50 reservoir mixture, the counted
density - because those are results of execution and seeding them would hardcode the answer the gate
is meant to test. Where the lab has no catalogue entry, seed the concept (+ ontology term) and leave
the vendor product absent so the binding step asks.
