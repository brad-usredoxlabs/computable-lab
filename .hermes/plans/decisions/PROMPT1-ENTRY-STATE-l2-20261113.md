# RULING — prompt-1 must start from a type the lab genuinely does not have

Lane 2 · architect · 2026-11-13 · follows the first live recon of Corpus2 scenario 1
Evidence: `~/.hermes/cl/lanes/2/receipts/RECON-PROMPT1-20261113T181736/` (86 steps, 54 screenshots,
report.md, api snapshots). Brad approved option (b) in session: "and yes on b".

## The decision

**The lab's stock must not already contain a generic 96-well deepwell plate.** The seed definitions that
differ from that — `lbw-def-generic-96-well-deep-plate` ("Generic 96-Well Deep Well Plate") and
`lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1` ("NEST 96 Well Plate 2 mL Deep") — are either removed
from the lab-layer seed or namespaced so they are not offered as the lab's own stock. Subsequent
scenarios keep whatever they genuinely need; this ruling is about the entry state of scenario 1.

Why: the recon proved the drive cannot even enter the scenario. Before any action the deck's Add-to-deck
dialog offered both, and the clarifier's only forward row was one of them (shots/38, shots/26). The
creation journey is the entire point of the scenario; with the type pre-existing it can never be
entered, and every future pass would start from a state the acceptance manifest declares impossible.

## Consequences (binding)

1. **Data change, not code**: the pruning is a change to the lab-layer seed records, and any fixture or
   run that references those ids must be re-pointed or reseeded in the same unit. Do not delete a
   definition that a run, event graph or instance still points at without re-pointing it first; the
   instance/record read-back after the change is part of the evidence.
2. **The card must say what is true.** When a noun cannot be bound, the assistant says plainly that the
   type is not in the system and offers to create it. Offering only existing bindings leaves the person
   unable to tell absence from a failed search — that is a defect, not a style preference.
3. **The accept door for a create proposal is the create surface's own accept**, not the edit-diff
   panel the earlier spec assumed. The Changes panel exists to review edits to something that already
   exists; a creation's accept belongs where the thing is being created, and its completion is a
   committed record.
4. **The scenario text does not change.** The corpus keeps Brad's words; what changes is the lab's data
   so the words describe a true state.

## Evidence this rests on (one line each, all shot-cited in the report)

- Entry state false: two deepwell definitions present before the drive (`api/defs-43-snapshot`; shots/38).
- Un-bindable answer channel: the offered row's id `lbw-def-generic-96-well-deepwell-plate` returns 404;
  the record is `lbw-def-generic-96-well-deep-plate` (a display-name slug vs the real recordId).
- Three identical unknown-noun round trips (display name, label, offered id) — shots/42, 48, 56, 60.
- No create door and no geometry surface anywhere: clarifier, search panel, deck dialog — shots/26, 29, 38.
- Reload drops the live unanswered question (shots/63, 65); a second tab lists the thread but renders an
  empty transcript (shots/83, 86).
- No served revision anywhere in the UI; only `server.version 1.0.0` (api/meta.json).

## Not in scope

No change to the acceptance criteria, no relaxation of the manifest's `not_done_if` traps, and no
"make the deck look populated" shortcut. The pass is earned by a committed definition and instance
placed on the deck, or it is not a pass.
