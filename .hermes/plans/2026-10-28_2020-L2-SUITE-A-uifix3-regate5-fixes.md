# SPEC — L2-SUITE-A UIFIX3 (regate-5 fix run) — lane 2
Orch-authored, 2026-10-28T20:20 EDT (l2t2015). Work order = the re-gate 5 tier-2 report
(receipts: /home/brad/.hermes/cl/receipts/L2-SUITE-A/gate-l2t1520-regate5-tier2/report.md)
defects D1, D2, D4, D5, D6 + D3-chrome. D3-threading is OUT (architect decision pending).

TRUNK BASE: cl/integration-2 @ 2d6d7b7a (contains the merged uifix chain through 0e6eb598,
gate-served f2cb526a + docs). Served candidate for the next gate = the merged tip.

## D1 MAJOR — "Manual Bench (freeform)" layout is client-only; reload silently reverts,
## and the honest copy overclaims.
Gate evidence: run-main/shots/15-02-p1.png vs reload/90-01-reload-main-deck-sbs-not-freeform.png.
Record EVG-cellrox-...-e0bedf9b payload contains the string "freeform" NOWHERE (orch-verified
via :3093 GET); methodContext.deckVariant stays "default". The assistant line
" The deck layout was applied to the deck." (app/src/shared/hooks/useAiChat.ts:1391) is a claim
that silently reverses on reload.
SMALLEST FIX (chosen, no new persistence scope): the copy must not claim more than happened.
When the layout effect is view-session-only, the line reads exactly:
  " The deck layout was applied to this view."
Pin the sentence in the existing DeckSurfaceChat.deckLayout.uifix1.test.tsx (update the pin at
:300) + useAiChat test. INVESTIGATE (cheap, cite in report): whether a real persistence seam
already exists (deckVariant rides a search param at app/src/shared/api/client.ts:3675 — find
what the server does with it). If a one-call persistence already exists on the ordinary path,
wiring the layout through it is IN SCOPE; if persistence needs new server/schema work, it is
OUT — the copy fix ships and the gap is filed as a follow-up (report names it).

## D2 MAJOR — committed well footprints never render at rest; the mark is preview-only.
Gate evidence: run-legs/shots/19-02-t1-...-after-accept.png (A1 accepted, nothing painted),
run-probe10 (two tiles, marked []), reload n=4/n=5.
Orch-grounded shape: the legs record's committed add_material carries details.wells=['A1']
with labwareId ABSENT (orch-verified via :3093). LawnSurface.tsx:295 already reads
eventWellIndex.get(placement.labwareId); eventWellIndex.ts attributes a labwareId-less
committed event via the tri-state OFFER binding (recordId / ABSENT=fallback-to-single-placed-
vessel / marker=forbid). committedOfferByEvent lives in EventEditorContext client state
(reducer :1047-1058, reset :741) — NOT persisted. RED-test the REAL rest shapes:
  (a) committed add_material {wells:[A1], no labwareId} + NO offer binding (post-reload shape)
      + exactly one placed plate -> index MUST attribute A1 to that plate (fallback allowed
      when ABSENT) and LabwareGlyph MUST render data-affected-well on A1;
  (b) same with an offer recordId binding -> paints;
  (c) two placed plates + no binding -> paints NOTHING (never-guess, existing rule preserved).
Find where the committed-path attribution drops the well set between index and glyph AT REST
(the index or the tile/glyph handoff — LawnSurface slot/lawn tile call sites :295/:375) and fix
the attribution path, NOT the never-guess rules. Tile-level outline does not count as the mark:
the painted well (data-affected-well) is the deliverable at accept AND after reload.

## D4 MODERATE — duplicate clarification cards for ONE unresolved noun in one transcript.
"1 mM clofibrate in DMSO" asked twice in one turn (ambiguous-noun +
unrealized-mixture-blob-material) with the SAME single action (create-local mint); DMEM/FBS
re-ask on every following turn. Evidence: run-main/shots/62-06-p5.png, trail.json p5_state.cards.
Fix at the card-EMIT aggregation (server ai card builder — locate via the reason codes
ambiguous-noun / unrealized-mixture-blob-material in server/src/ai/): when two cards in the
SAME response carry the same unresolved noun and the same only-action, emit ONE card keeping
the more specific reason code. Do NOT suppress cards with distinct actions. Cross-turn repeats
(the re-ask on following turns) are the fold/answer jurisdiction (ANSWER-FOLD lineage) — OUT
unless a one-line same-response rule covers them; report what you saw.

## D5 MINOR — card search field pre-seeded with the noun; typing APPENDS ("golden bead
platebead" -> No matches). Fix: focus/select-all semantics — the first user keystroke REPLACES
the seed (select-on-focus via onFocus select(), or the pre-fill becomes a placeholder + initial
query). Preserve: opening the card with the seed already filtered to the noun.
Evidence: run-probe6/shots/13-03-probe6-after-typing.png.

## D6 MINOR — incubate proposal card face shows kind only ("incubate"); the record carries
duration overnight / temperature 37 that never reach the card. Enrich the proposal preview
card face with the event's declared detail fields the record actually carries (same data the
mix card shows: "75 uL · 3 cycles" precedent). Data-driven from details, no per-kind TS switch
tables (YAML/registry precedent — follow how mix renders volume/cycles; mirror that).

## D3-CHROME (the in-scope slice of D3) — on reload, cards do not restore but their SEARCH
INPUTS DO: 8 bare unlabelled <input placeholder="Search labware…"> boxes float in the restored
transcript. Dead/duplicative chrome on a touched surface is a defect (SOP rule 12). Fix: the
restored transcript must not render answer-card inputs for non-interactive/historical messages
— either restore the full card (answerable, with question) or render neither. Smallest
defensible: render neither for historical card turns (inputs belong to live staged cards only).
OUT OF SCOPE (architect decision pending, decisions/SUITEA-D3-deck-thread-scope-l2t2015.md):
cross-deck thread sharing itself (main deck's turns visible on legs deck). Do NOT touch
aiThreadClient.ts / AiThreadStore.ts / thread identity.

## MECHANICAL FLOOR (report real numbers, re-run at final tip)
- cwd app: npx vitest run src/event-editor src/shared/hooks/src/ai card areas touched -> ALL
  green; the WHOLE app vitest failing-FILE set must not grow vs base (capture base set first).
- app tsc: zero NEW error lines vs base 2d6d7b7a floor; server tsc 0.
- RED-first per defect: show each new test failing at base, green at tip.
- No YAML unless D1-persistence lands (then orch restarts the stack — say so in the report).
- NEVER touch /mnt/vast/home/brad/git/computable-lab or :3001/:5174. Restart NOTHING.
- All git via `git -c core.fileMode=false`.

## REPORT-FIRST (token-cap defense): write to the deliverable path AS YOU GO, one commit per
defect with the defect id in the message ([UIFIX3-D1] ...). Short chat replies; the file
carries detail. End with 'STATUS: complete' and exactly 'L2SUITEA-UIFIX3 DONE <sha>' (or
'... BLOCKED <reason>').
