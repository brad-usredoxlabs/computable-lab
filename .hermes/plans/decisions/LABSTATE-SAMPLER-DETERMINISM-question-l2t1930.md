# ARCHITECT DECISION PACKET — LABSTATE mix-turn sampler determinism + control-leg reachability
Filed: 2026-10-30T20:05 EDT (orch l2t1930) — lane 2, item L2-LABSTATE-CONTENTS-1
Ruling owed at: decisions/LABSTATE-SAMPLER-DETERMINISM-l2t1930-ruling.md (end with END-RULING)
Prior context: decisions/LABSTATE-MATERIALNOUN-gate-l2t0310-ruling.md (Q2 ratified utterances + Q4 swap authority; that ruling's swap authority is what the orch exercised with the pinned carrier 'the plate').

## Why this packet is due (the l2t1651/l2t1830 pre-registered condition)
"If run 2 add legs repeat green + mix leg still red on a NO-EVENT mix x2 runs -> the
drive-vs-sampler determinism architect packet is due." Condition MET:
- Run 20261030T225807Z: add legs GREEN (first time both in one run), mix leg RED with
  mix_event_count=0 (card hold: ambiguous-noun on 'plate').
- Run 20261030T235639Z (pinned carrier, same wire request family): add legs GREEN again
  (turn1b even shows the full A1:H1 + A2..H2 ethanol union committed), mix leg RED again
  with mix_event_count=0 — this time card reason unknown-noun on 'the plate', options [].
Two consecutive pinned-carrier runs, add legs green x2, mix legs red-on-no-event x2.

## Evidence matrix (live no-seed drive, LANDED ledger per ARM-LOG, identical session shape)
Receipts: /home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/{20261030T193551Z,203317Z,
211859Z,213618Z,214441Z,215810Z,215841Z,225807Z,235639Z}/drive-receipt.json

run          add1 ok  add1b ok  mix: events / cards / details-union
193551Z      False    False     1 ev / 0 cards / details {} (EMPTY union)
203317Z      False    False     0 ev / card / n-a
211859Z      False    False     0 ev / card / n-a
213618Z      True     True      1 ev / 0 cards / details {} (EMPTY union — LEDGER WAS
                                POPULATED per arm-log prior: A1:H1 beads present)
214441Z      False    False     1 ev / 0 cards / details {} ; turn1b committed A2:H2 ethanol
215810Z      False    False     1 ev / 0 cards / details {}
215841Z      False    False     1 ev / 0 cards / details {cycles:3, labwareId:lbw-seed-plate-96-flat}
                                — NO wells key at all
225807Z      True     True      0 ev / 1 card (ambiguous-noun 'plate', options [])
235639Z      True     True      0 ev / 1 card (unknown-noun 'the plate', options [])

Three distinct outcomes on the SAME turn (prompt "mix all wells that have material", one
held session, ledger verifiably populated in at least 213618Z/225807Z/235639Z):
  (a) no event at all — the sampler holds a labware card (reason flips ambiguous-noun vs
      unknown-noun across runs; options [] every time even though the deck plate exists),
  (b) event with details {} — vacuous union = the exact acceptance failure the spec names,
  (c) event with details {cycles, labwareId} — seeded-design labwareId, NO wells key.
The drive's expected 48-well union BY THE COMMITTED LEDGER has NEVER been emitted.
Shorthand forms also differ run-to-run (mix-wells-with-material vs mix-material-wells;
wells quoted vs bare; labware present vs absent).

## Questions (bounded — answer each; no code in this packet)
Q1. Which of (a)/(b)/(c) is the SAMPLER's contract for "mix all wells that have material"
    when a deck labware is placed in the SAME session and the contents ledger is populated?
    Cite the declarative surface (scientist-intent-compile.yaml / sampler vocab) that should
    produce the wells union from the committed ledger. If the current vocab can produce none
    of these three legitimately, is the fix a VOCAB/DECLARATIVE change (which file), or is
    product code required (outside this item's approved scope -> name the new-item boundary)?
Q2. The card holds (225807Z/235639Z) carry options=[] although a labware IS placed on the
    deck in-session (turn A committed LWI-1). Is an empty-options labware card on a
    resolvable-in-session deck plate a DEFECT in the card's candidate population (name the
    surface), or is 'the plate'/'plate' intentionally never bound to a run-placed instance
    (D2: protocol-vs-run identity)? If intentional, name the utterance form that DOES bind.
Q3. Control leg ('add acetonitrile to the ghost-plate well C1'): arm_log_lines=0 in EVERY
    run — the spine labware-card intercepts the unknown plate BEFORE the lab_state fold
    (AS-L2T1651-CONTROL-SPINE-INTERCEPTS). Per the l2t0310 ruling Q2 the ghost-plate leg was
    supposed to be "actually reached live". Does the control utterance need a plate-shaped
    resolvable noun to reach the fold, or is the control leg's non-vacuous arm-log evidence
    UNREACHABLE at current spine ordering (-> the acceptance criterion needs your ruling:
    re-shaped utterance vs a named limitation recorded in the merge report)?
Q4. Given all three outcomes are non-deterministic run-to-run on byte-comparable requests,
    is determinism itself in scope for L2-LABSTATE-CONTENTS-1's acceptance (spec §11 expects
    ONE green all-legs run), or do you re-define the drive's acceptance (e.g. n-of-m runs /
    a seeded sampler determinism precondition)? Silence here would leave the item blocked on
    a coin-flip; please rule.

## What the orch will NOT do without your ruling
- No vocab/product edits (item scope is server contents-ledger; sampler vocab is outside it).
- No weakening of the mix/control legs (they stay red-named, never waived).
- The drive itself is orch-owned harness; further utterance swaps stay within the l2t0310
  Q4 swap authority ONLY IF they can plausibly flip the named root cause you identify.
