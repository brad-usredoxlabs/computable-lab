# RULING — the starter pack ships; a vendor product is not a type

Lane 2 · architect · 2026-11-14 · Brad, in session (verbatim): "the goal os to ship computable-lab with a
starter pack of generic labwares. i suppose the fault is mine, i should have picked a labware not in the
starter pack. IDK what's in the starter pack. i could say, 'place a Thermo Optical-Quality Imaging Plates,
384-well, black-walled, clear bottom Catalog number:A58941' plate on the deck"

## 1. The starter pack is a product decision, not an accident

Computable-lab ships with a pack of GENERIC labwares (plates, reservoirs, tubes, racks, tip racks). Their
presence in the lab is intended. This SUPERSEDES the 2026-11-13 decision to prune the deepwell definitions so
that scenario 1 could start from "the type does not exist": that prune was a workaround for a scenario whose
wording collided with the pack, not a truth about the lab. Brad's words: "the fault is mine, i should have
picked a labware not in the starter pack."

Consequence: the deepwell belongs in the pack. Do not remove generic shapes to make a scenario true, and do not
treat a generic shape existing as an entry-state failure.

## 2. Scenario 1's sentence changes, and it now tests the thing that actually matters

New utterance (corpus + manifest, commit 770cd6bd):

    "Place a Thermo Optical-Quality Imaging Plate, 384-well, black-walled, clear bottom
     (catalog number A58941) on the deck."

This is better than the deepwell sentence for three reasons:
- it names a VENDOR PRODUCT with a catalogue number, so the journey must distinguish a registered product from
  a generic type — the distinction Brad drew on 2026-11-13;
- it cannot be satisfied by a starter-pack shape, so "a plate is on the deck" only happens if the system
  actually created something new;
- it makes the invented-catalogue-number trap real: A58941 must be carried verbatim, and no other number may
  appear.

## 3. What "not in the system" now means (entry state)

Absent: this specific TYPE as lab stock, and the Thermo A58941 PRODUCT record.
Present and expected: the generic starter pack, including a generic 384-well shape.

Binding: binding a generic 384-well plate as the Thermo product is a DEFECT, not a convenience — that is the
silent promotion the three-referent rule forbids. The product must be its own record, pointing at the type it
realizes, with the catalogue number it was given.

## 4. One authority for the pack (open question for Brad)

Measured today: 41 labware definitions are served as records, and the registry directory holds 23 entries of
which 19 are not store records — the deepwell is one of those 19 and is nonetheless offered in the deck picker
as "[LAB] Your lab". So the pack has two sources. One question remains for Brad before a brief is written:
are the registry entries themselves the pack (and therefore legitimately offered), or must the pack be store
records (and the registry is only vocabulary)? Until he says, nothing may be seeded and no entry may be
promoted silently.

## 5. Process: gate iterations are not two-strike failures

Brad, same session: "the 'two failures in a row' rule ONLY applies to simple, one-shot coding jobs." Journey
gates iterate by design; the instruments and the orchestrator's instructions are updated accordingly. A gate
FIX produces a finding and another round. Escalation still happens when the same defect recurs twice with no
new evidence, or when a fix would change a scenario's meaning or the lab's data.

## AMENDMENT — Brad answered the pack-authority question (2026-11-14, option "a")

"The registry is vocabulary only; the pack is store records; anything offered as '[LAB] Your lab' must be a
record." Binding consequences:

1. **A picker row labelled as this lab's stock must be backed by a store record.** The label is a claim of
   ownership; it may not be rendered for a registry entry that has no record. Registry-only entries are
   vocabulary (a TYPE the system understands) and must be presented as such, or not offered at all.
2. **No fabricated reads.** `GET /api/records/:id` must not return a payload for a registry entry that is not
   a store record. The legacy-spelling fallback merged on 2026-11-13 (609e902d) may resolve ALIASES to real
   records; it may not promote vocabulary into a record-shaped read. A 404 there is the honest answer.
3. **The pack grows by records.** Adding a generic shape to the shipped pack is a data change that creates a
   record, with provenance, like any other; the registry stays the vocabulary layer.
