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
