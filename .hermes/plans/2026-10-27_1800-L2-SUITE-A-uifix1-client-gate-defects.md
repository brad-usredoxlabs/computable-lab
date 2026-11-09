# L2-SUITE-A uifix1 — client-side browser-gate defects D1/D2/D3/D4/D5

Item: rides L2-SUITE-A (these are its own browser-gate-1 defects, report
/home/brad/.hermes/cl/receipts/L2-SUITE-A/gate-20261027T205347Z/report.md).
Worktree: /mnt/vast/home/brad/git/wt/L2-SUITE-A-uifix1-lane2-l2t1755
Branch: cl/lane2-suite-a-uifix1-l2t1755 off cl/integration-2 @ b62f1e78.
ALWAYS `git -c core.fileMode=false` (NFS mode-bit noise). Stack for YOUR tests: the
lane-2 app is at /mnt/vast/home/brad/git/cl-integration-2 — do NOT restart the stack;
the orchestrator owns :3093/:5193.

## ORCH DIAGNOSIS PACK (verified first-hand at dispatch — do not re-derive)

- D3 is CLIENT-SIDE, not thread drift, not a server card-channel regression:
  the gate's own backend turns in the browser's inherited-history shape
  (.run/backend.log traces tjor7p, 4xj7xf, 08zy46; historyLen=20) logged
  `done event_shorthand success=true events=0 clarifications=1|2|1` — the SAME
  card counts the headless drive delivered (receipts
  /home/brad/.hermes/cl/receipts/L2-SUITE-A/20261027T192830Z/prompt-4/5/6.json
  cards=1/2/1). Yet the browser rendered the empty-success arm's system message
  "AI completed the task but did not propose any changes." (useAiChat.ts:1260),
  which fires ONLY when askedQuestion=false — i.e. the done payload the client
  consumed carried NO clarificationRequests/clarification. Zero consoleErrors /
  pageErrors in all three gate trails. The client-side done path is the suspect;
  RED must reproduce the browser's failure shape through the deck-surface
  client leg (POST /api/ai/draft-events/stream), then GREEN must make the cards
  render.
  HonestWall accounting to explain (evidence-first, in your report): the reviewer
  read honestWall=null on those turns while the empty-success message appeared —
  under the code at useAiChat.ts:1196-1263 the wall should have been set in the
  same arm. Reproduce first, explain what really happened, then fix the cause.
- D1: server leg WORKS (`done deck_layout success=true variant=manual_freeform`,
  every drive). The done payload's `deckLayout` has NO mount arm in the
  universal pane — useAiChat.ts:1214-1226 comments state this explicitly
  ("deckLayout ... NO universal arm"). The legacy pane's handling lives near
  AiTabPanel.tsx / LabwareEventEditor.tsx (grep deckLayout) — port the SAME
  editor action (switch platform manual / variant manual_freeform =
  "Manual Bench (freeform)", defaultManifests.ts:47-76) into the universal deck
  path (DeckSurfaceChat/useDeckGhostMount seam or ChatLog host — smallest
  correct seam), so a deck_layout done switches the deck.
- D2: wall copy bug, useAiChat.ts:1233-1253: the clause joins bare noun phrases
  after "it" — renders "it a deck layout". Give the clause a verb
  (e.g. "it delivered only a deck layout" / "delivered only bench-equipment
  requirements"), grammatical for every part combination. Pin in
  useAiChat.wall.test.tsx.
- D4: event well footprints never render on the deck. With an add_material
  carrying 42 wells staged OR accepted, all 96 wells render identical, zero
  data-affected="true" (LabwareTile.tsx supports the marker; the well set never
  reaches the tile). wellStateProjection.ts:29 computes wells only for the
  focus surface (LabwareFocus.tsx). Make the deck tile consume staged AND
  committed events' details.wells so affected wells mark (and badges where the
  existing badge surface exists). Data-driven from the event record — no
  hardcoded well lists.
- D5: same labwareId re-placed: three placements after repeated drafts, tile
  relabelled plate2. The ghost-mount/accumulation adds a placement per resolved
  labware offer even when the deck already carries that labwareId — dedupe: an
  offer whose labwareId already has a placement REUSES it, never places a second
  tile. (Receipts: run2/shots/*-p7-mix*.png, report D5.)
- D6 IS EXCLUDED — do NOT touch it. Orch first-hand: the browser's P8 turns
  (traces ks4r5n, mfaa0i) logged server-side `done event_shorthand events=1` —
  the SERVER drafted the invented labware + incubate. Per the handoff ruling,
  D6 belongs behind WELLSET-RESOLVER-1 (plate-binding), not the UI fix. Any
  coder diff touching the server draft path is out of scope and gets rejected.

## Scope / ownership

- app/ ONLY (universal chat + deck surface + their tests). Server, schema YAML,
  harness (expectations/, run-suite-a.py, lib/) are OUT — no YAML means no stack
  restart needed for your tests, but the orch restarts before re-gating anyway.
- Hot-file serialization already checked by orch: live lane-1 coder GC-10 touches
  app/src/analysis/* + schema/knowledge/view-spec.schema.yaml — ZERO overlap. Do
  not touch app/src/analysis.
- Tests: RED-first per defect, shaped on the receipt evidence (absolute screenshot
  paths in the gate report). Run: cd app && npx vitest run <touched test files>;
  npm run typecheck -w app — record the BEFORE baseline error-line count on your
  branch in the report and prove zero growth (baseline is whatever trunk gives
  you; capture it, do not assume).
- No new npm deps. No hardcoded policy text beyond copy strings. UI copy changes
  stay in the existing template sites.

## Deliverable + report

Report: /home/brad/.hermes/cl/lanes/2/deliverables/L2-SUITE-A-uifix1-report.l2t1755.md
(create parent dirs). Sections per defect: root cause (with the file:line you
found), RED evidence (failing test output lines), fix diff summary, GREEN output,
typecheck before/after counts. D3's honestWall accounting goes under its own
heading. Consequential assumptions: list them in the report's `assumptions:`
block. Commit per defect or one commit per logical fix; message prefix
[L2-SUITE-A-uifix1][D<n>].
END MARKER — exactly one final line: L2SUITEA-UIFIX1 DONE <sha>  (or)
L2SUITEA-UIFIX1 BLOCKED <one-line reason>
