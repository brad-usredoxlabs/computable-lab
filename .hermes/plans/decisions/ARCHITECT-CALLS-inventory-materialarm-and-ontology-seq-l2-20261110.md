# Architect calls — lane 2, 2026-11-10 (two, both routine, neither changes approved scope)

Source: the lane-2 spec composer's two open questions in
`/home/brad/.hermes/cl/lanes/2/prompts/READY.md` (notes 2026-11-10T20:54:42 and the
20:40 composer row of `no-work.log`). Brad's instruction to settle them: "go ahead
and make thise two architect calls." Both are decisions inside work Brad has already
approved (inventory create: "i 100 agree wuth your decision: build the UI to add
inventory."; ontology anchoring: the 2026-11-10 clarification on new nouns).

Both were grounded against the lane trunk at `7a5148ab` before ruling. Nothing below
grants new scope, changes domain policy, or weakens an acceptance criterion.

---

## CALL 1 — `material-instance` MAY be a third candidate kind in the material arm of role-binding proposals

**Question as asked.** May the material arm of `server/src/protocol/roleBindingProposal.ts`
gain `material-instance` as a third candidate kind, or is that a Brad-level product call?

**Ruling: yes, granted — additively, with the constraints below. This is not a
Brad-level call.** The material arm already derives its candidates from the role's
own declaration (`allowedMaterialIds[]`) and already returns a heterogeneous list
(`material` concepts plus `vendor-product` rows whose `material_ref.id` matches,
`roleBindingProposal.ts:215-240`). `RoleProposal.candidates` is already a
`BindingCandidate[]` whose `recordKind` is a free string and which already carries an
optional `lotNumber` (`:15-20`). Adding a third producer to an existing list of
producers is an implementation choice about a seam that is still in-progress, not a
change to what the product promises. The provenance rule this touches is already
ratified (materials are a hierarchy; a lot without a source is refused —
`LOT_WITHOUT_SOURCE`, u2 of the same item), and that rule is what makes the addition
safe: an instance is only ever a candidate when it descends from something the role
declared.

**Constraints (binding on whoever implements u5).**

1. **Derivation is unchanged.** The selector remains the role's declaration
   (`allowedMaterialIds[]`). No name matching, no fuzzy matching, no inference from
   the run's current deck contents.
2. **Provenance chain required.** A `material-instance` is a candidate only when its
   own refs resolve to a declared id, either through `materialRef.id` (the instance is
   of that concept) or through `vendorProductRef` → `vendor-product.material_ref.id`.
   An instance whose chain does not land on a declared id is **never** a candidate.
   Free-standing instances (the shape u2 now refuses at write time) must not become
   selectable here by the back door.
3. **Additive ordering, not replacement.** Existing behaviour for `material` and
   `vendor-product` candidates is byte-identical; instance candidates are appended
   after them, then the whole list is ordered by recordId as today.
4. **No silent pick — and instances are where this matters.** The existing state rule
   stands: exactly one candidate → `proposed`; more than one → `ambiguous`. A single
   instance among three candidates is still `ambiguous`. Instances are physical objects
   that differ only by lot, so "the list has one instance" must never be read as
   consent to consume that lot.
5. **The label must disambiguate.** A candidate's label must carry the lot number when
   the record has one (the `lotNumber` field already exists on `BindingCandidate`);
   two instances of the same product must not render as two identical rows.
6. **Binding shape unchanged.** A binding to an instance is still a record ref
   (`{kind:'record', id, type}`); no new ref kind, no new schema file, no change to
   `material-instance.schema.yaml` (it already declares `materialRef`/`vendorProductRef`/
   `lot`).
7. **Read-only stays read-only in this unit.** u5 does not add a select affordance to
   `app/src/run/RoleBindingProposalsPanel.tsx`; selectability is u4/u4select's seam.
   If u5's server change has no way to be observed without the panel, prove it at the
   API level and say so in the report — do not widen the unit.

**Verification u5 must show.** (a) an instance with a `vendorProductRef` whose
vendor-product points at a declared material id appears as a third-kind candidate with
its lot in the label; (b) two such instances yield `state: 'ambiguous'`, not
`proposed`; (c) a free-standing instance (no resolvable chain) does not appear, and if
it is the only physical record the role still reports `proposed` on the concept/
vendor-product candidates that do exist; (d) a role with an empty
`allowedMaterialIds[]` still returns `unbound` with its existing reason text; (e) the
labware arm's output is unchanged (same fixture, byte-identical JSON).

---

## CALL 2 — the ontology boot-wiring unit (O5) is sliced against o2's MERGED tip, not against trunk

**Question as asked.** Once o2 merges, O5 (registry → boot wiring) becomes cuttable in
one unit — slice it against o2's merged tip or against the current trunk?

**Ruling: against o2's merged tip.** The loader half (o2) defines the provider
contract that the wiring half consumes: the registry shape, the provider's exported
entry point, and the result shape it returns. That contract does not exist on trunk
today. A brief written against trunk would have to *assume* the contract o2 is about
to land, which is the exact defect class we already paid for twice today — a browser
verdict that predated the expander rewrite (receipt 09:50Z), and a spec-sheet "fix"
that pinned a heading as a value because nothing it could observe contradicted it.

**Two conditions, both binding.**

1. **Merged, not merely in review.** O5 may be cut only after o2 is merged to
   `cl/integration-2`. "The branch is green" is not the trigger; the trunk commit is.
2. **The brief must name o2's merge sha as its base and its anchors must be read on
   that sha.** If o2's merged tip differs from the sha an O5 brief assumed, the brief
   is re-graded, not dispatched — a stale slice is a re-brief, never a "close enough".

Sequencing consequence, stated so nobody has to infer it: o2 is a prerequisite of O5,
and O5 is not dispatchable in any tick where o2 is still unmerged. That is a real
dependency and it belongs in the queue's `deps` line, not in a composer's memory. O1,
O3 and O4 are unaffected and may dispatch in any order.

---

## What this does NOT decide

- It does not authorise any vocabulary change (equipment/protocol domains in
  `scientist-intent-vocabulary.yaml`) — that stays with Brad.
- It does not widen `L2-LAB-INVENTORY-CREATE-1` beyond its approved criteria; u5's
  material arm is one candidate source inside an existing read, not the "material
  half of acceptance (e)" rewrite the composer worried about.
- It does not relax the browser gate: `RoleBindingProposalsPanel` is UI, so the item
  still owes a browser verdict on the served revision before it is done.
