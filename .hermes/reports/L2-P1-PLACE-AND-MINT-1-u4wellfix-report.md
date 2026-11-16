# L2-P1-PLACE-AND-MINT-1 u4wellfix — report (lane 2)

- item: L2-P1-PLACE-AND-MINT-1-u4wellfix-l2t2673.txt (unit u4wellfix, 4 of n)
- worktree: /home/brad/cl-wt/L2-P1-PLACE-AND-MINT-1-u1journey-lane2
- branch: cl/lane2-p1-place-mint-u2-1116 (continuation — fixing my own branch)
- base: fc0602036f736f37cb0b5977c874fa67a0b6a83e (u3wellfix tip; tree clean at start)

## DECISION
Closes advc-c2 D1 (MAJOR, required-correction) and D3 (MINOR, missing-evidence) from
~/.hermes/cl/lanes/2/reviews/L2-P1-PLACE-AND-MINT-1-u3wellfix-advc-c2-l2t2672.md.
D1: the committed arm's offer binding is ALREADY the placement key (resolved at CAPTURE time by
committedOfferCapturesForPreview, EventEditorContext.tsx:701-704 — correct by ruling, untouched).
buildEventWellIndex's add() re-resolved it unconditionally against the CURRENT preview's
previewLabwares (eventWellIndex.ts:267 pre-fix): a second authority over the same truth. A later
preview placing the same definition re-routed the earlier batch's wells onto the later tile (the
reviewer's P5 measurement: committed key ['lbw-def-rc'] -> ['lbw-placed-…-gecmk1']).
Fix shape (brief-mandated, no design latitude): add() takes a third parameter, the arm's resolver.
The committed arm passes the captured value THROUGH (identity resolver — one fact, ONE resolution
point); only the staged arm resolves at render, via resolvePlacementIdentity(offerRecordId,
preview?.previewLabwares ?? {}). Vessel offers are the identity map, so committed vessel behavior
is byte-identical. D3: added the missing "later preview live" test leg (every existing committed
zero-match leg uses preview=null, which cannot witness render-time re-resolution).

## CHANGED FILES (scope: exactly the 2 owned files + this report)
- app/src/event-editor/lib/eventWellIndex.ts: +30 / -4 (add() resolver parameter; D1 site keys on
  the injected resolver; the two call sites pass identity vs stagedPlacementResolver)
- app/src/event-editor/eventWellIndex.definitionPlacement.test.ts: +50 / 0 (the D1/D3 leg)
80 lines added total (budget <= 90); 2 files (budget <= 2); no new files.
EventEditorContext.tsx NOT touched (capture-time resolution is correct by ruling).

## COMMITS (checkpoint order)
1. e3292529d3a8e9a9930b665dbc3d8f9fb4a89880 — test(lane2): L2-P1-PLACE-AND-MINT-1 u4wellfix RED —
   committed arm must not re-resolve against a later preview (advc-c2 D1/D3)
2. 7059caf9b09866101d5d2cf8777e7cb60a3b565a — fix(lane2): L2-P1-PLACE-AND-MINT-1 u4wellfix —
   committed offer key rides the capture-time resolution; only the staged arm resolves at render
   (one resolution point)
3. this report + the marker commit (below).

## RED (committed alone at commit 1, BEFORE the fix)
Command (in app/): npx vitest run src/event-editor/eventWellIndex.definitionPlacement.test.ts
New leg: 'a committed zero-match binding keeps the captured key when a LATER preview places the
same definition live (u4wellfix D1 — no re-route on a later rebuild)':
  - committed binding { 'EVT-1': 'lbw-def-generic-96-well-plate' } (zero-match capture)
  - LATER preview: previewLabwares = { 'lbw-placed-later-turn': { sourceRecordId:
    'lbw-def-generic-96-well-plate', … } }, previewEvents = [] (isolates the committed arm)
Real output:
  AssertionError: expected [] to deeply equal [ 'A1', 'A2', 'B1' ]
  Test Files  1 failed (1)
       Tests  1 failed | 6 passed (7)
Fails for the RIGHT reason: the committed key 'lbw-def-generic-96-well-plate' reads empty because
add() re-resolved the already-resolved captured key against the later preview (unique match ->
'lbw-placed-later-turn') — the reviewer's P5 migration, reproduced by this pin.
Full receipt (kept out of git): /tmp/u4wellfix-red.txt

## GREEN (after the fix, at commit 2)
Same command:
  Test Files  1 passed (1)
       Tests  7 passed (7)
Full receipt: /tmp/u4wellfix-green.txt

## ACCEPTANCE (measured, real)
1. Committed batch keeps its capture-time key when a LATER preview's labware map contains the same
   sourceRecordId under a different labwareId: the new leg is GREEN — the committed key carries
   ['A1','A2','B1'] and index.has('lbw-placed-later-turn') === false.
2. Staged/preview attribution unchanged: the staged arm still resolves through
   resolvePlacementIdentity against its OWN preview (eventWellIndex.ts stagedPlacementResolver);
   all pre-existing staged legs (definition re-key P5, vessel parity, zero-match) pass.
   placeAndMint.journey (2) + draftPreview.dedupe.uifix1 (3) + useAiChat.genericPlacement (1) =
   6/6 pass at baseline AND after the fix.
3. Exactly one resolution point: grep -n resolvePlacementIdentity
   app/src/event-editor/lib/eventWellIndex.ts -> line 70 (the export definition), line 271 (a
   comment), line 337 (the staged arm's resolver, applied to preview?.previewLabwares). No call
   site ever resolves a captured committed value.
4. This report + DONE marker committed; tree clean; the marker SHA resolves and CONTAINS this
   report (body-first / marker-second, per the u3wellfix pattern).

## BASELINES (measured at fc0602036, before any change)
- VERIFY 1: 6/6 pass (eventWellIndex.definitionPlacement.test.ts)
- VERIFY 2: 6/6 pass (2+3+1)
- VERIFY 3: npx tsc --noEmit -> 17 pre-existing 'error TS' lines; 0 mention eventWellIndex or
  EventEditorContext
After the fix: 7/7, 6/6, and 17 errors with 0 in the two owned files (no new errors).

## DISCLOSURES
- The brief's VERIFY 2 listed src/event-editor/placeAndMint.journey.test.ts and
  src/event-editor/useAiChat.genericPlacement.test.tsx; those exact paths do not exist in this
  worktree (vitest: "No test files found"). The real suites are
  src/event-editor/deck/placeAndMint.journey.test.ts (2 tests) and
  src/shared/hooks/useAiChat.genericPlacement.test.tsx (1 test) — the same suites; the 6/6 total
  matches the brief's stated baseline. I ran the real paths.
- Receipt files kept outside git: /tmp/u4wellfix-red.txt, /tmp/u4wellfix-green.txt,
  /tmp/u4wellfix-tsc-baseline.txt, /tmp/u4wellfix-tsc-final.txt.
