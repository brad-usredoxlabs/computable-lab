VERDICT: accept

# MINT-FLOOR-UI-1 — tier-2 browser acceptance gate (AC5) — 2026-10-18 05:05

Task: MINT-FLOOR-UI-1 (MINT-FLOOR-UI-1 mint-row dedup), TIER-2 per rule 6c.
Receipts dir: /home/brad/.hermes/cl/receipts/MINT-FLOOR-UI-1/2026-10-18_0505-tier2/
Driver: deterministic node .mjs Playwright (copied in as _drive-prescribed-flow.mjs and
_drive-fallback-novel-noun.mjs). Two real trails, each with its own trail.json + shots/:
  - ./trail.json          + ./shots/          = prescribed fixture flow (family-axis route)
  - ./fallback-drive/trail.json + .../shots/  = product-UI drive that surfaced the held card
md5s.txt is the recursive md5 sweep of this dir.

AC5 verbatim (spec §ACCEPTANCE CRITERIA):
"at :5193, the held card for an unknown noun shows exactly ONE 'Create local term' row per noun
(screenshot replaces the DEFECT-4 double row); clicking it mints once (one POST /vocab/mint) and
the answer rides the answers map as before. Dedup is per-noun: a card whose candidates legitimately
contain TWO DIFFERENT mint labels keeps both." Orchestrator ruling OQ1 (binding, strict): exactly
ONE mint affordance TOTAL on the held card — mint-LABEL option buttons suppressed; the picker floor
row is the survivor.

RESULT: every AC5 claim is exercised and PASSES in-browser at :5193.
  - Held card for an unknown noun shows exactly ONE "Create local term" row (DOM count + zoom shot).
  - Clicking it mints once: exactly one POST /api/vocab/mint, HTTP 200, one new MAT record.
  - The answer rides the answers map: the noun drops from the held set on the next compile and the
    thread proceeds; no error bubble; the chat/refine input stays present and enabled.

## Preflight (all confirmed before navigating)

- git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-2 merge-base --is-ancestor
  f57149e3 HEAD  ->  exit 0 (containment confirmed; HEAD = 0036a548 docs commit, f57149e3 is an
  ancestor).
- curl :5193/ -> 200 ; curl :3093/api/health -> 200 ({"status":"ok"}).
- Served checkout contains the candidate:
  curl :5193/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts
  | grep -c isMintOfferForLabel -> 2 (>= 2).
- ACTIVE AI profile = qwen3.8-thunderbeast (GET :3093/api/config/ai/profiles: active:true,
  model qwen3.8-flash-next, baseUrl http://thunderbeast:8080/v1). NOT switched by me.
- Never touched :3001/:5174; no stack restart; no process kill; no product/YAML edit.

## FIXTURE CAVEAT (why the prescribed route was insufficient, and what I did instead)

The prescribed route (answer family axis "Which lysis method?" -> Bead beater -> Apply & compile)
no longer produces an unknown-noun held card at this revision, and the cause is environmental, not
a MINT-FLOOR-UI-1 defect:

- ./shots/03-draw1-after.png: the FIRST answered draw returned HTTP 200 / outcome=complete with the
  deck review already carrying labware ("1.5 mL Microcentrifuge Tube (seed)", "Load onto deck &
  ghost events (1)"). No clarification, no card.
- ./shots/04-draw2-after.png == ./shots/05-draw3-after.png (identical md5, identical state): the two
  bounded redraws returned HTTP 422 needs-clarification whose held facts were
  ["sample volume", "bead beating parameters"] — missing-PARAMETER hedges, whose reasons are NOT in
  CLARIFICATION_MENU_BY_REASON, so no card renders (cards=0). Per-draw trail: ./trail.json .cycles.
- Cause: the earlier W2-8 A5d gate MINTED real records on this same backend. GET
  :3093/api/records?kind=material confirms MAT-lysis-reagent-1dkp ("lysis-reagent"),
  MAT-microcentrifuge-tube-sgzg, MAT-sample-tube-1fh8 (all status proposed, definition "Locally
  minted term ..."). "lysis-reagent" now RESOLVES, so the fixture's sparse answers complete instead
  of holding an unknown-noun card. This is fixture state, not the dedup fix (which does not change
  WHICH nouns get a mint offer — spec §NON-GOALS 2).

To exercise AC5 I drove a turn through the PRODUCT'S OWN input — the thread's "Universal protocol
text" textarea (pl-protocol-text) + "Localize (one-shot)" (pl-localize-btn) — with a novel material
noun, then answered the resulting branch question. No out-of-band seeding, no record fabricated by
me; the only records created were minted by the product's own mint affordance. Trail:
./fallback-drive/trail.json.

## Evidence — AC5 core (fallback drive; :5193; deck /deck/EVG-a5-fixture-method/RUN-2026-09-19-run-vwr8)

Held card 0, noun "gate plate" (menu /m, unknown-noun):
- DOM count (COUNT_IN_CARD): optionMint (`.pl-held-clarification-option` matching /create local
  term/i) = 0 ; slashMint (`[data-slash-row]` matching /create local term/i) = 1 ; TOTAL = 1.
  trail.json step 7 / .counts[0]. EXPECTED 1, ACTUAL 1. (Pre-fix DEFECT 4 was 2 identical option
  buttons + 1 floor row.)
- Screenshots: ./fallback-drive/shots/04-card0-zoom.png (card zoom, rows countable),
  ./fallback-drive/shots/05-card0-picker-open.png (search fired, exactly ONE
  'New  Create local term "gate plate"' row, NO option buttons above the search box),
  ./fallback-drive/shots/03-novel-apply-after.png (full card: menu /m, label "gate plate", one row).
- Click: step 8 -> clicked the single mint row (rc=1, ri=0). Network: exactly ONE
  POST /api/vocab/mint -> 200, body {"success":true,"recordId":"MAT-gate-plate-1f6a",
  "label":"gate plate",...}. mintDelta (fetch capture) = 1. Step 9 / .mintPosts.
- Answer rides the answers map: step 9 post-mint compile (HTTP 422) held set NO LONGER contains
  "gate plate" as unknown-noun (it is gone; remaining facts are microcentrifuge tube / frigozyme
  reagent / lysis-duration / samples). msgIsErr=false.
- Screenshot after: ./fallback-drive/shots/06-card0-after-mint.png — "gate plate" gone, next card
  (microcentrifuge tube) rendered, no red error bubble.

Held card 1, noun "frigozyme reagent" (menu /m, unknown-noun):
- DOM count: optionMint = 0 ; slashMint = 1 ; TOTAL = 1. Step 10 / .counts[1]. EXPECTED 1, ACTUAL 1.
- Screenshots: ./fallback-drive/shots/07-card1-zoom.png,
  ./fallback-drive/shots/08-card1-picker-open.png (exactly ONE 'Create local term "frigozyme
  reagent"' row).
- Click: step 11 -> ONE POST /api/vocab/mint -> 200 {"recordId":"MAT-frigozyme-reagent-v0ok"}.
  mintDelta = 1. Step 12.
- Answer rides the answers map: step 12 post-mint compile (422) held set no longer contains
  "frigozyme reagent"; cards=0. msgIsErr=false.

Chat input usable after the mints (step 13): refineInputPresent=true, refineInputDisabled=false,
localizeBtnText="Localize (one-shot)" (not frozen "Localizing…"/"APPLYING…"), msg is a normal info
line (no error class). Screenshot: ./fallback-drive/shots/09-card1-after-mint.png (also
10-post-mint-input.png, identical state).

Per-noun dedup (not a blanket drop): the wire DID carry a second "gate plate" fact (a different
reason) and a second "frigozyme reagent" fact; the adapter correctly rendered ONE card per
card-eligible fact and ONE mint row per card — it did not blank the card. The mint-LABEL option
buttons are absent (optionMint=0), the picker floor row is the single survivor — exactly OQ1 strict.

## Negative-state checks

- No rejected/failed mint, no error bubble: msgIsErr=false at every post-mint state; every
  POST /api/vocab/mint returned 200. (Task step 5's "if any error surfaces" did not trigger, so no
  backend.log line was needed.)
- consoleErrors: only the flow-triggered "Failed to load resource: 422" lines from the
  needs-clarification compiles (3 in the fallback drive) — the expected held-compile responses, not
  page-load errors. pageErrors: 0.
- No fixture record was written by the review except the two product-minted MAT records.

## Trail hygiene / duplicate-md5 note (declared, not hidden)

- ./shots/04-draw2-after.png == ./shots/05-draw3-after.png == ./shots/06-no-held-card.png: identical
  md5 = SAME state (the two redraws produced identical uncarded 422 state; the third shot is the
  same screen labelled). They are NOT claimed as different states.
- ./fallback-drive/shots/09-card1-after-mint.png == 10-post-mint-input.png: SAME state (probe only,
  no UI change between them). Not claimed as different states.
- Every DISTINCT state has a distinct md5; the fallback drive has 10 distinct-md5 shots covering:
  auto-ask settled, localize(novel), axes answered, held-card state, card0 zoom, card0 picker open,
  card0 after mint, card1 zoom, card1 picker open, card1 after mint (+input).
- Every goto/click step's `url` in both trails equals the requested deck route — no redirect.

## Reproduce

RECEIPT_DIR=<dir> PLAYWRIGHT_BASE_URL=http://localhost:5193 node _drive-prescribed-flow.mjs   # fixture route
RECEIPT_DIR=<dir>/fallback-drive PLAYWRIGHT_BASE_URL=http://localhost:5193 node _drive-fallback-novel-noun.mjs

## Limits

- The AC5 claim is verified on a product-driven unknown noun ("gate plate", "frigozyme reagent"),
  not on the fixture's "lysis-reagent", because that noun now resolves (prior mints). If the
  orchestrator requires the fixture's exact noun, the fixture's backend state must be reset
  (a decision outside this read-only gate) — the dedup behaviour itself is noun-agnostic and was
  observed to hold.

VERDICT: accept
