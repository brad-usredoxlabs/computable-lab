# L2-P1-EMPTY-TURN-CARD-2 — unit u3falseabsence (cycle-2 DEFECT 1)

Branch: cl/lane2-p1-empty-turn-card-2-u1-2055
Worktree: /home/brad/cl-wt/L2-P1-EMPTY-TURN-CARD-2-lane2
Base on entry: 98dbc2f18 (prior u2mentionfix delivery)

## Defect (reviewer-measured, re-verified here)

`emptyTurnAbsenceRequests` probed the WHOLE kept-whole clause against the shipped
name tier. That tier is `normalizedName.includes(normalized)`
(`server/src/ai/compiler/labwareLookup.ts:135`) — the RECORD NAME must contain the
HINT. A clause hint ("sample into the 96-well plate") is longer than any record name,
so it can NEVER match, even when the lab holds the labware. Result: a FALSE absence
card for a held plate — a regression of AC3 ("a turn naming an EXISTING labware gets
no new card"). Only the keep-whole arm (clarifications.ts:341-346) creates such
clause-shaped candidates.

## Fix (one production seam, clarifications.ts only)

New helper `emptyTurnProbeForms(candidate)` returns, de-duplicated case-insensitively
in this order:

1. the candidate itself;
2. `tailForm` — text after the LAST `/\b(?:on|onto|into|in|at|to|from)\b/`, leading
   `a|an|the` stripped, kept only if non-empty, passes `EMPTY_TURN_LABWARE_HEAD` and
   not `EMPTY_TURN_NOISE`;
3. `headWord` — the first labware head-noun WORD matched by
   `EMPTY_TURN_LABWARE_HEAD` inside the candidate (also absorbs hyphen/space drift:
   "96-well plate" vs "Generic 96 Well Plate").

The loop now probes every form with the SAME injected `searchLabwareByHint` and
emits the absence request ONLY if EVERY form returns zero matches (first hit ⇒ held ⇒
no card for that candidate; the loop still advances to the next candidate as before).
Emission payload is byte-unchanged: mention = the full candidate, same kind / reason /
query / snippet, one request id. No change to `extractEmptyTurnLabwarePhrases`, no
change to `labwareLookup.ts`, no lookup logic reimplemented.

Head-word probing deliberately UNDER-requests near an existing labware — the
friction-first trade (a missed absence card costs one re-ask; a false one invents a
gap). The comment at the loop and the helper's JSDoc state this and link
`labwareLookup.ts:135`.

## Tests

- RED commit `aa920794a`: new describe "cycle-2 DEFECT 1: a held record is never
  falsely declared absent" with 4 held-store legs + 1 genuinely-absent guard.
  At 98dbc2f18 the 4 held legs failed with the false card, e.g.
  `mention: "sample into the 96-well plate"` (verbatim assertion output), and
  `it in the cryobox` already yielded 1 card.
- GREEN commit `33308b21e`.
- Pin file now defines the stub in SHIPPED semantics: `shippedLookup(records)` matches
  when `record.toLowerCase().includes(hint.trim().toLowerCase())` (records:
  "Generic 96 Well Plate", "Generic 12-Channel Reservoir", "Cool Rack"). Legacy
  `stubLookup()` delegates to `shippedLookup(['Cool Rack'])` — a rack-only store, so
  the manifest plate and its probe forms all miss. That replacement was REQUIRED:
  the old `/Thermo…Plate/i ? [] : [hit]` stub returned a hit for every other hint, so
  the new bare-head probe ("plate") legitimately found a record and two pre-existing
  pins went to [] (false negative of the stub, not of the code).
- No pre-existing pin's expectation had to be changed to [] — none encoded the
  false-absence behavior once the stub spoke shipped semantics.

## Receipts (real output, final commit 33308b21e)

    $ cd server && npx vitest run src/ai/clarifications.emptyTurn.test.ts \
        src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts
    Test Files  2 passed (2)
    Tests  24 passed (24)          # 19 pre-existing + 5 new legs

    $ cd server && npx tsc --noEmit
    6 errors (baseline), 0 mentioning clarifications

    # wider regression comparison, src/ai run twice (only clarifications.ts swapped):
    base production code (git stash): Test Files 27 failed | 122 passed; Tests 47 failed | 1316 passed
    with this fix:                    Test Files 26 failed | 123 passed; Tests 43 failed | 1320 passed
    => delta is exactly the 4 new held-legs turning green; the remaining 43 failures
       pre-exist at base in unrelated files (submitSuggestionTool.*, shorthandChat.*,
       ChatbotCompileDeckSlot, AgentOrchestrator.* …) and are untouched here.

    # real shipped lookup (temporary script, createLabwareLookup over a 3-record store,
    # deleted after; not committed):
    Put the sample into the 96-well plate.                -> 0 card(s)
    Add 10 uL to the reservoir.                           -> 0 card(s)
    Place it in the plate.                                -> 0 card(s)
    Take the plate from the rack and put it on the deck.  -> 0 card(s)
    Put it in the cryobox.                                -> 1 card(s) mention="it in the cryobox"

## Bounded refusal check (BRAD-BINDING)

Governed by architect-context-l2.md §2 as relayed in the brief (that file is on the
DO-NOT-READ list for this unit; the brief quotes the ruling). No second authority was
created: the probe list is a thin adapter over the ONE injected `searchLabwareByHint`;
`labwareLookup.ts` remains the sole matching authority and is untouched. No BLOCKED
condition arose.

## Files changed

- server/src/ai/clarifications.ts (probe-form helper + probe loop; 54 insertions)
- server/src/ai/clarifications.emptyTurn.test.ts (shipped-semantics stub + 5 legs; 50 insertions)
- .hermes/plans/reports/L2-P1-EMPTY-TURN-CARD-2-u3falseabsence-report.md (this file)

## Decisions for the reviewer / architect

1. Head-word probing under-requests by design (friction-first). "Put it in the
   cryobox." against a store holding any record whose name contains "cryobox" correctly
   yields no card; against a store with a *plate* only, the candidate is still absent.
2. Brief's wording conflict about naming the bare noun instead of the full candidate in
   `mention` was NOT acted on (out of scope; routed to the architect per the brief).
   mention remains the full candidate (`it in the cryobox`).
3. Legacy `stubLookup()` intent changed from "everything but the phrase resolves" to
   "rack-only store, shipped name tier". Named here per acceptance 3.

## Verification commands

    cd /home/brad/cl-wt/L2-P1-EMPTY-TURN-CARD-2-lane2/server
    npx vitest run src/ai/clarifications.emptyTurn.test.ts src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts
    npx tsc --noEmit
