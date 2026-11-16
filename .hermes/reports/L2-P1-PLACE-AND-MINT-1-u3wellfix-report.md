# L2-P1-PLACE-AND-MINT-1 — unit u3wellfix report

- worktree: /home/brad/cl-wt/L2-P1-PLACE-AND-MINT-1-u1journey-lane2
- branch: cl/lane2-p1-place-mint-u2-1116 (continued — fixing u2's own merged-in-cycle branch)
- base: ff676fac554105f585575783ebf92338f6cb5450
- RED test commit: 68e53f30e8ea01ebff2129c029cbf3e7fe0a44df (committed RED, failing — anti-thrash contract)
- code fix commit: a7c11dec2e7d66d83de39198350cef724a6361c2 (GREEN)
- this report: committed at the marker commit (the marker names the commit that CONTAINS this report, u2's S1/S2 pattern)
- JOURNEY OPERATION: "place a 96-well plate and add 100 uL of water to A1" (prompt-1; fixes the D4 well-marking leg feeding the r16 vertical gate)

## WHAT THE DEFECT WAS (D1, adversarial c1, quote-verified at HEAD ff676fac5 vs base a2de24ee3)

u2 re-keyed a DEFINITION offer's editor labware to a fresh placement identity
(draftPreview.ts:360-363, `labwareId: nextPlacementIdentity()` → `lbw-placed-*`), but the
event-well index still attributed the offer's wells under the OFFER'S recordId. So the deck
tile read `eventWellIndex.get(placement.labwareId) = []` — 96 UNMARKED wells where base
marked them (both sides `lbw-def-generic-96-well-plate` at base → PASS).
Receipt: /home/brad/.hermes/cl/lanes/2/receipts/PLACEANDMINT-u2-advc-20261116T083649Z/report.md (FINDINGS D1).

## THE FIX — one fact (the batch's offered vessel), one key (the placement identity)

One new helper, used by BOTH arms, so the attribution key and the tile key cannot drift
(one fact, one key — never two authorities; zero-or-many matches keep the recordId key, never guess):

```ts
// app/src/event-editor/lib/eventWellIndex.ts
export function resolvePlacementIdentity(
  offerRecordId: string,
  previewLabwares: Record<string, { sourceRecordId?: string }>,
): string {
  const matches = Object.entries(previewLabwares)
    .filter(([, labware]) => labware.sourceRecordId === offerRecordId)
    .map(([labwareId]) => labwareId)
  return matches.length === 1 ? matches[0]! : offerRecordId
}
```

Every `previewLabwares` entry is resolvable: draftPreview stamps `sourceRecordId ===` the offer
recordId on every preview labware (definition branch re-keys labwareId to the placement identity;
vessel branch keeps `labwareId === recordId` — the identity map). So the UNIQUE entry whose
`sourceRecordId === offerRecordId` IS the offered vessel, and its key IS the placement identity.

Arm 1 (staged) — eventWellIndex.ts, the offer-attribution branch of `buildEventWellIndex`:
key the set under `resolvePlacementIdentity(offerRecordId, preview?.previewLabwares ?? {})`
instead of `offerRecordId`. The tile consumers (LawnSurface.tsx:295/:375, DeckSlot.tsx:77 —
NOT touched) read `eventWellIndex.get(placement.labwareId)` and now find the wells.

Arm 2 (committed) — EventEditorContext.tsx, `committedOfferCapturesForPreview`:
widened the param to carry `previewLabwares?`; the single-distinct-offer binding value is now
`resolvePlacementIdentity(ids[0], preview.previewLabwares ?? {})` instead of `ids[0]` — the SAME
resolution the staged arm uses (AC3 parity). The value still rides per-batch at capture time; a
later rebuild does not re-route earlier events (uifix2-fix1 D1 contract kept).

D2 (optional deckAdoption persisted-entry leg): NOT done — it would require reading
deckAdoption.ts/eventGraphPersistence.ts (do-not-read unless doing D2) and would grow a unit that
already exceeds the line budget; the reviewer verified the persistence hop CORRECT. Within the
brief's allowance ("only if <30 min"; "do NOT let it grow the unit").

## RED → GREEN EVIDENCE (exact commands, real output)

Working directory for every vitest command: the worktree's app/ dir.

RED (at 68e53f30e — the pin committed BEFORE any production edit):

  $ npx vitest run src/event-editor/eventWellIndex.definitionPlacement.test.ts
  ❯ src/event-editor/eventWellIndex.definitionPlacement.test.ts  (6 tests | 2 failed) 12ms
  Test Files  1 failed (1)
  Tests  2 failed | 4 passed (6)

  Failing leg 1 (the reviewer's P5 shape, staged arm):
    "a definition offer + an add_material (details.wells, no labwareId) marks the PLACEMENT's wells"
    AssertionError: expected [] to deeply equal [ 'A1', 'A2', 'B1' ]   (eventWellIndex.get(placement.labwareId))
  Failing leg 2 (committed arm, AC3):
    "commit_preview binds the single definition offer to the PLACEMENT identity"
    binding resolved to the offer recordId, not the placement key.
  The 4 passing-at-RED legs (vessel parity, zero-match fallback ×2, vessel committed) pin the
  behavior the fix must NOT change — they pass before AND after the fix.

GREEN (at a7c11dec2 — the brief's exact VERIFY command + the new test):

  $ npx vitest run src/event-editor/right-pane/ai/draftPreview.dedupe.uifix1.test.ts \
      src/event-editor/deck/placeAndMint.journey.test.ts \
      src/shared/hooks/useAiChat.genericPlacement.test.tsx \
      src/event-editor/eventWellIndex.definitionPlacement.test.ts
  ✓ src/event-editor/eventWellIndex.definitionPlacement.test.ts  (6 tests) 7ms
  ✓ src/event-editor/deck/placeAndMint.journey.test.ts  (2 tests) 10ms
  ✓ src/event-editor/right-pane/ai/draftPreview.dedupe.uifix1.test.ts  (3 tests) 6ms
  ✓ src/shared/hooks/useAiChat.genericPlacement.test.tsx  (1 test) 30ms
  Test Files  4 passed (4)
  Tests  12 passed (12)

Baseline 40/40 (the reviewer's six named files — placeAndMint.journey, draftPreview.dedupe.uifix1,
useAiChat.genericPlacement, draftPreview, draftPreview.resolved, deckAdoption.ghostgate) reproduced
at a7c11dec2: `Test Files 6 passed (6) / Tests 40 passed (40)` — vessel-offer behavior unchanged.

Full suite, no NEW failures vs HEAD baseline (per-file comparison, exact):

  $ npx vitest run src/event-editor
  base ff676fac5 (2 independent runs): Test Files 16 failed | 147 passed (163); Tests 37 failed | 1150 passed (1187)
  final a7c11dec2 (run 4):             Test Files 16 failed | 148 passed (164); Tests 37 failed | 1156 passed (1193)
  Per-file failure map base vs final: IDENTICAL — new files: none, gone files: none, per-file
  count deltas: none. 37 is the PRE-EXISTING failure count (eventGraphPersistence,
  ClarificationPanel, DeckSurfaceChat.deckLayout.uifix1, ProtocolLocalizationThread.clarificationCards,
  FindTabPanel, LawnSurface.moveAcross, LawnSurface.equipment, RecordCreatePanel.readonlyId,
  PdfViewer, etc.). My 6 tests add 6 passes (1150 → 1156). NO NEW FAILURES.

  Caveat (measured, attributed, NOT a regression): runs 1–3 of the final-commit full suite showed
  38 failed — one extra failure, DeckSurfaceChat.threadScope.test.tsx
  ("sends x-cl-thread-scope = loaded eventGraphId on get + append and RE-KEYS on deck navigation",
  expected 'EVG-seam-B' to be 'EVG-seam-A'). Attribution: (a) that test vi.mocks ../EventEditorContext
  entirely — my EventEditorContext.tsx edit cannot execute in it; (b) none of its live import-graph
  modules (DeckChatSlice, SurfaceChatBridge, HarnessChatPane) import eventWellIndex — my other
  changed file is unreachable from it; (c) its fixture state is `preview: null, events: []`;
  (d) A/B control in THIS lane: with both of my production files checked out AT BASE and my test
  file moved out, the same full-suite run produced the SAME 38 failures / SAME test / SAME
  assertion; (e) in isolation it passes 8/8 (5 at base worktree runs + 3 at HEAD), and run 4 of
  the full suite at HEAD passed it. Conclusion: a pre-existing parallel-load flake in that
  network-scope timing test (sessionStorage keying under load), present or absent independent of
  this diff.

Typecheck (tsc --noEmit via npm run typecheck -w app):

  base ff676fac5: 17 `error TS` lines; final a7c11dec2: 17 `error TS` lines;
  diff of the sorted error-line sets: IDENTICAL (zero new errors; 0 errors in the three
  changed files). All 17 are pre-existing in other files (this trunk does not typecheck clean;
  the gate is "no NEW errors vs baseline", established by the identical error sets).

## ACCEPTANCE MAPPING

1. ✅ Definition offer + add_material with details.wells and no labwareId →
   `eventWellIndex.get(placement.labwareId) === {A1, A2, B1}` (the tile marks the wells) —
   pinned RED (failed with `[]` at 68e53f3) then GREEN at a7c11dec2 (new test leg 1, P5 shape).
2. ✅ Vessel-offer behavior byte-identical — all 40/40 baseline tests green at the final commit
   (reproduced above); vessel pins in the new test pass at RED and at GREEN.
3. ✅ Committed-arm parity — `committedOfferCapturesForPreview` resolves the binding through the
   SAME `resolvePlacementIdentity` the staged arm uses (one function, one fact, one key);
   exactly-one match → the placement identity; zero-or-many matches keep the recordId key
   (pinned: new test legs 3/5 — zero-match stage + committed cases keep the recordId key;
   the committed index marks the tile under the placement key, leg 4).
4. ✅ This report + DONE marker committed with the real containing SHA, tree clean (see marker line).

## CHANGED FILES (base ff676fac5 → a7c11dec2, numstat)

- app/src/event-editor/lib/eventWellIndex.ts: +42/−7 (316 lines total) — resolvePlacementIdentity + staged arm + docs
- app/src/event-editor/EventEditorContext.tsx: +25/−2 (1758 lines total) — import, widened capture param, committed arm
- app/src/event-editor/eventWellIndex.definitionPlacement.test.ts: +232/−0 (new; 6 legs)

Honest budget note: the brief's budget was "~120 lines"; the fix LOGIC is minimal (the helper is
9 lines; each arm is a one-expression key change), the rest is documentation matching this
codebase's comment density, plus the 232-line pin (the P5 fixture needs the full
LabwareRecordPayload shape for the definition mapper: topology + capacity). If the budget is
binding, the two doc blocks in eventWellIndex.ts are the first candidates to trim.

## PROHIBITIONS / NON-CHANGES

draftPreview.ts, LawnSurface.tsx, DeckSlot.tsx, eventGraphPersistence.ts, server/**, the u2
identity model, schema/records YAML: untouched. `git diff --name-only ff676fac5..HEAD` shows
exactly the 3 files above.

## VERIFICATION COMMANDS (reproducible)

  cd /home/brad/cl-wt/L2-P1-PLACE-AND-MINT-1-u1journey-lane2/app
  npx vitest run src/event-editor/right-pane/ai/draftPreview.dedupe.uifix1.test.ts \
    src/event-editor/deck/placeAndMint.journey.test.ts \
    src/shared/hooks/useAiChat.genericPlacement.test.tsx \
    src/event-editor/eventWellIndex.definitionPlacement.test.ts      # 12/12
  npx vitest run src/event-editor                                     # 37 failed (pre-existing, per-file-identical to base) / 1156 passed
  cd /home/brad/cl-wt/L2-P1-PLACE-AND-MINT-1-u1journey-lane2
  npm run typecheck -w app                                            # 17 pre-existing errors, identical set to base

## NEXT ACTIONS

None for this unit. Orchestrator: reload the lane stack if live verification of the deck tile is
wanted (no YAML changes here — pure TypeScript, no reload needed for the code itself).
Optional follow-up (separate unit): the D2 deckAdoption persisted-entry leg, and the
pre-existing threadScope parallel-load flake.

L2-P1-PLACE-AND-MINT-1-u3wellfix UNIT L2-P1-PLACE-AND-MINT-1-u3wellfix DONE a7c11dec2e7d66d83de39198350cef724a6361c2
