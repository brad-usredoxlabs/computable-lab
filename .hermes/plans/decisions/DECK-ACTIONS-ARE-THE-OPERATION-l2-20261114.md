# Deck placement is a proven action; the AI path should call it, not rebuild it

Status: BINDING design note, 2026-11-14, from Brad's observation:
> "in the UI, you can very simply take any of the pre-specified generic plate types, right click and
> plunk any one of them onto the deck, no questions asked."

## What is actually true

The manual path exists and is one call: `addLabware(labwareType, name?)`
(`app/src/graph/context/LabwareEditorContext.tsx:548`, implemented `:595`, wired to the deck at
`LabwareEventEditor.tsx:4225`), plus `addLabwareFromRecord(record)` for a record-backed item
(`LabwareList.tsx:206`, `LabwareEventEditor.tsx:1026`). No clarifier, no proposal, no accept: the plate
appears on the deck.

## What that does and does not prove

It proves the **presentation** half of prompt 1 is cheap: putting a plate on the deck is a single
existing editor action, and it never fails. It does NOT produce the records the corpus also requires:
`addLabware` adds a shape to the in-memory graph and nothing else. There is no labware-definition
record, no product record, no instance record, and no anchor state — so criteria 2, 3, 4 and 5 remain
unsatisfied, and `not_done_if` 2 (generic shape presented as the vendor product) is exactly what the
manual shortcut does if used for this request.

So the honest decomposition:

| Leg | Manual today | AI path today |
|---|---|---|
| plate visible on deck | works, one action | fails (nothing is mounted) |
| labware-definition record with entered geometry | exists via the deck picker's create flow | fails (no form opened) |
| vendor product record with catalogue # | exists via `/lab/labware` "+ New product" (hand-filled) | fails (no field in the payload) |
| instance record pointing at the definition | exists via "+ New instance" | fails |
| anchor state visible | exists on the definition form | fails (never rendered) |

## The rule

**The AI path must invoke the operations that already exist; it must not maintain a parallel
implementation of them.** Concretely:

1. When a turn decides a plate belongs on the deck, it mounts through `addLabware` /
   `addLabwareFromRecord` — the same action the manual right-click uses. That makes "the plate appears"
   impossible to fail for a card-rendering or acceptance reason, and it removes one whole leg from the
   chat pipeline's responsibility.
2. When a turn decides a record must be created (definition, product, instance), its treatment is
   `navigate`, not a bespoke card: open the existing surface prefilled with what the sentence supplied,
   and let that form do geometry, anchor and validation. The person's decision stays the same; the
   second implementation disappears.
3. Anything the AI cannot route to an existing operation is a NAMED wall, not a silently accepted
   proposal — the acceptance invariant from the channel ruling.

This is the integration guidance's §1 rule ("human controls and AI requests reach the same underlying
operations") applied to the one surface where we have watched it fail eight times.

## Consequence for the queue

`L2-P1-PRODUCT-DOOR-1`'s payload work (manufacturer + catalogue as real fields) is still required for
criterion 3, but it is no longer on the critical path to a plate on the deck. The fast path to criteria
1, 2, 4 and 5 is: route the unknown-noun turn to the deck's create/place actions with the sentence's
noun prefilled.
