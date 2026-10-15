# SH-QB-1 — CODER REPORT — lane 2 — l2t1535 (RESUME run l2t1740)

Worktree: /mnt/vast/home/brad/git/wt/SH-QB-1-lane2-l2t1535
Branch: cl/SH-QB-1-lane2-l2t1535 — base 95d1c8bc (merge SH-QA-2)
RED commit: 19983ce391ba95adfb8a743c6c7a8ac40377811a (test(shqb1): RED — T1-T10)
GREEN commit: 9fc5fb639e652c56ff3024e797885b1d04bb6809 (feat(shqb1): save&re-compile round-trip — verbatim recompile, loud-failure, shape-fork pin; resume l2t1740)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-15_1415-SH-QB-1-recompile-roundtrip-spec.md (incl. ORCHESTRATOR RULINGS l2t1535 15:30 EDT)

## Resume provenance (honesty first)

The previous run died mid-task (context-compression failure) with the GREEN work UNCOMMITTED in
the worktree. This resume run did NOT restart: it audited the uncommitted diff against the spec's
fix points A/B/C (all three present and honest), re-ran every verification bar FRESH at HEAD
(raws .hermes/raws/shqb1-resume-*), then committed. One untracked scratch file from the prior run
(server/.hermes-probe.mts, a throwaway spine probe) was deleted — it was never part of the diff.
Prior-run raws (shqb1-T1/T6/T8-red, shqb1-clientdeck-red, shqb1-base-*) are cited as RED/baseline
evidence; every GREEN/set-diff claim below is re-derived from THIS run's raws.

OQ rulings were ruled BEFORE coding (orch rulings 15:30 EDT; RED commit 16:59 EDT): OQ1 ADOPTED
(additive optional deckLabwares? on POST /intent/compile), OQ2 ADOPTED (loud failure rides the
existing shorthandApply error arm, NO clarification cards), OQ3 ADOPTED (pin-only).

## T6 shape-fork pin outcome (handoff-mandated statement)

T6/T7 GREEN as-is after the deck threading: paste-#3 (params-nested) and paste-#8 (top-level +
targetWells) deep-equal through the threaded route, and the deck-plate-absent-from-store leg
compiles. The RED at 19983ce3 was the DECK ASYMMETRY (both shapes barred 'needs-clarification'
with the store-only lookup — see shqb1-T6-red.txt: "expected 'needs-clarification' to be
'complete'"), NOT a normalizer fork. F5 closes with the pin + B's loud rule. NO normalizer file
was touched; no hand-back needed.

## Per-fix evidence

### Fix A — deck-context threading (OQ1)

| Site | Change | exactOptionalPropertyTypes |
|---|---|---|
| server/src/api/handlers/IntentCompileHandlers.ts | IntentCompileBody.deckLabwares?: readonly DeckLabwareSummary[]; deckFromBody() gates a non-empty array; composeLabwareHintLookupWithDeck(deck, storeLookup) IMPORTED from ../../ai/shorthandChat.js; bindShorthandEventsToDeck post-pass on terminalArtifacts.events when deck threaded; clarifications forwarded verbatim via non-empty-only conditional spread | conditional spreads only; deck absent/empty ⇒ both passes skipped ⇒ store-only path byte-identical |
| app/src/shared/api/client.ts (intentCompile method ONLY) | second param deckLabwares?: Array<{labwareId; labwareType?; name?}>; body conditional spread (key ABSENT, never undefined); response type gains clarifications?: Array<Record<string, unknown>> | spread `...(deckLabwares && deckLabwares.length > 0 ? { deckLabwares } : {})` |
| app/src/event-editor/right-pane/ai/AiTabPanel.tsx (handleShorthandRecompile leg) | Object.values(editor.state.labwares) mapped structurally to labwareId/labwareType/name (generic map, zero name literals); two-arg call only when plates exist, else one-arg call | never passes undefined |

RED→GREEN (server, roundTrip T1/T2/T4/T5):

RED raw .hermes/raws/shqb1-T1-red.txt:
```
 ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts  (6 tests | 5 failed) 72ms
   ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts > SH-QB-1 T1 — no-edit recompile with deck context compiles, binds, and never bars silently > deck-threaded recompile of the no-edit document: outcome complete, non-empty events, deck-bound details.labwareId
   ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts > SH-QB-1 T1 — no-edit recompile with deck context compiles, binds, and never bars silently > THE DROP (server half of the silent-empty): a barred compile with deck threaded forwards the structured clarifications verbatim on the 200 body
   ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts > SH-QB-1 T2 — the no-edit round-trip reproduces the chat path event-for-event > threaded recompile events deep-equal the chat path's bound proposals (details.labwareId included)
   ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts > SH-QB-1 T4 — a one-value edit changes exactly that value > no-edit vs volume-edited events differ ONLY in the edited event's volume fields
   ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts > SH-QB-1 T5 — clarifications ride verbatim when present and stay ABSENT when empty > a clean deck-threaded compile carries NO clarifications key (non-empty-only conditional spread)
 ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts:193:29
 ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts:216:36
 ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts:242:49
 ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts:278:27
 ❯ src/api/handlers/IntentCompileHandlers.roundTrip.test.ts:301:29
 Test Files  1 failed (1)
      Tests  5 failed | 1 passed (6)
   Start at  16:52:19
   Duration  1.32s (transform 381ms, setup 0ms, collect 645ms, tests 72ms, environment 0ms, prepare 93ms)
```

GREEN raw .hermes/raws/shqb1-resume-server-green.txt (roundTrip 7 + shapeFork 2 + existing IntentCompileHandlers.test 2):
```
 Test Files  3 passed (3)
      Tests  11 passed (11)
   Start at  18:43:42
   Duration  4.49s (transform 1.74s, setup 1ms, collect 7.17s, tests 353ms, environment 1ms, prepare 1.05s)
```

RED→GREEN (client deck pin, client.intentCompileDeck.test.ts):

RED raw .hermes/raws/shqb1-clientdeck-red.txt:
```
 ❯ src/shared/api/client.intentCompileDeck.test.ts  (4 tests | 1 failed) 7ms
   ❯ src/shared/api/client.intentCompileDeck.test.ts > apiClient.intentCompile — additive deckLabwares leg (SH-QB-1 OQ1) > with deck plates: the summaries ride verbatim beside the untouched YAML
 ❯ src/shared/api/client.intentCompileDeck.test.ts:67:38
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  16:58:50
   Duration  6.65s (transform 125ms, setup 561ms, collect 91ms, tests 7ms, environment 3.95s, prepare 322ms)
```

GREEN raw .hermes/raws/shqb1-resume-client-green.txt (shorthandRecompile 7 + intentCompileDeck 4 + intentCompileHeld 4):
```
 Test Files  3 passed (3)
      Tests  15 passed (15)
   Start at  18:43:49
   Duration  10.65s (transform 2.44s, setup 1.55s, collect 4.01s, tests 697ms, environment 14.79s, prepare 693ms)
```

T2 non-vacuity (B5): the deep-equal compares the CHAT path's bound proposals (compose + bind
built in-test from the same imported helpers, AgentOrchestrator.shorthandDeckBinding fixture
style) against the route's events; every event's details.labwareId is asserted to be the deck
plate id; normalizeIncidentalIds normalizes ONLY the Math.random()-minted eventId (shipped mint
shape regex; a non-matching id is left untouched) — labwareId/wells/volumes/material/event_type
stay verbatim.

### Fix B — loud failure on zero events (OQ2)

Client-side invariant in handleShorthandRecompile (AiTabPanel.tsx, new region :646-680):
events.length === 0 ⇒ setShorthandApply({ error: reason }) + return — the EXISTING verbatim
error arm (same surface a rejected edit already uses; prior proposal stays; NO clarification
cards). Reason priority: first clarification `label + ': ' + reason` → first gap message →
`The recompile produced no events (outcome: <outcome>)`. Non-empty events keep today's
draft-ready flow with clarifications mapped into warnings beside the gaps.

RED→GREEN (T8/T9/T10):

RED raw .hermes/raws/shqb1-T8-red.txt:
```
 ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx  (7 tests | 6 failed) 4223ms
   ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx > SH-QB-1 T8 — a zero-event recompile fails LOUDLY, never a silent empty preview > zero events + clarifications: NO draft-ready over an empty change list; the error surface names the reason; the prior proposal stays
   ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx > SH-QB-1 T8 — a zero-event recompile fails LOUDLY, never a silent empty preview > zero events with NO structured reason either: still errors with the outcome named ('no events' IS the zero-ghost condition)
   ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx > SH-QB-1 T8 — a zero-event recompile fails LOUDLY, never a silent empty preview > outcome 'complete' with zero events STILL errors (a zero-ghost is a zero-ghost)
   ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx > SH-QB-1 T8 — a zero-event recompile fails LOUDLY, never a silent empty preview > a gap-shaped zero-event compile surfaces the gap message as the named reason (no fine-print-only warnings)
   ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx > SH-QB-1 T9 — the recompile request carries the editor YAML verbatim + the deck plates > intentCompile receives the UNTOUCHED editor YAML and the structural deck summaries (labwareId/name/labwareType)
   ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx > SH-QB-1 T10 — a non-empty recompile keeps today's draft-ready flow (no regression) > non-empty events: draft-ready fires with the compiled changes, gaps ride as warnings, carried clarifications ride as warnings too
 ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx:235:32
 ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx:261:32
 ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx:279:32
 ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx:299:32
 ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx:335:21
 ❯ src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx:380:31
 Test Files  1 failed (1)
      Tests  6 failed | 1 passed (7)
   Start at  16:57:05
   Duration  7.04s (transform 548ms, setup 47ms, collect 806ms, tests 4.22s, environment 353ms, prepare 57ms)
```

GREEN: same raw as the client GREEN block above (7/7 in
AiTabPanel.shorthandRecompile.test.tsx, .hermes/raws/shqb1-resume-client-green.txt).

### Fix C — shape-fork pin (OQ3, PIN ONLY)

server/src/api/handlers/IntentCompileHandlers.shapeFork.test.ts (T6 deep-equal both shapes +
deck-plate-absent leg; T7 explicit targetWells ghost exactly A1/B1/C1). Fixture strings live
ONLY in the test file.

RED raw .hermes/raws/shqb1-T6-red.txt:
```
 ❯ src/api/handlers/IntentCompileHandlers.shapeFork.test.ts  (2 tests | 2 failed) 57ms
   ❯ src/api/handlers/IntentCompileHandlers.shapeFork.test.ts > SH-QB-1 T6 — both observed shorthand shapes normalize to the same events > paste-#3 (params-nested) and paste-#8 (top-level + targetWells) compile NON-EMPTY and deep-equal through the threaded route
   ❯ src/api/handlers/IntentCompileHandlers.shapeFork.test.ts > SH-QB-1 T7 — explicit targetWells ghost exactly the pre-selected wells > the paste-#8 document with explicit targetWells carries exactly those well addresses on every event
 ❯ src/api/handlers/IntentCompileHandlers.shapeFork.test.ts:147:33
 ❯ src/api/handlers/IntentCompileHandlers.shapeFork.test.ts:165:21
 Test Files  1 failed (1)
      Tests  2 failed (2)
   Start at  16:54:05
   Duration  2.66s (transform 569ms, setup 0ms, collect 1.60s, tests 57ms, environment 0ms, prepare 350ms)
```

GREEN: shapeFork 2/2 in the server GREEN block above (.hermes/raws/shqb1-resume-server-green.txt).

## Test-leg refinements made by the prior run (disclosed, not silent)

These are tweaks to the RED-committed test files in the uncommitted diff, audited and kept by
this resume run:

1. T3 split into two legs: a no-deck COMPLETING compile pins keys EXACTLY
   {outcome, terminalArtifacts} (the strict byte-identity / goldens guard); a no-deck BAR now
   pins clarifications as the ONLY additive key. Rationale: spec §A.3 forwards the dropped-reason
   channel UNCONDITIONALLY on deck presence (a barred compile without a deck also gets its reason
   forwarded — strictly better for the loud rule), so the single-leg "outcome, terminalArtifacts
   only" pin contradicted §A.3 for bar calls. The completing-call leg keeps the strict pin; the
   goldens (which replay this route) are GREEN (see targeted block).
2. T4 additionally pins BOTH volume carriers (bare volumeUl and the declared volume quantity
   object) move, nothing else — strengthens the exact-diff pin.
3. T7 re-pinned to ghosted-well SET semantics (the shipped expander lowers one event per
   addressed well with details.well/details.wells carriers — the original per-event
   toEqual(['A1','B1','C1']) contradicted the shipped COMP-1 geometry). Pin: the union of
   ghosted wells is EXACTLY A1/B1/C1, never a plate-wide sweep.
4. T10 setPreview count made relative to the draft mount's own preview call (mountReviewingDraft
   itself calls setPreview) — flake-proofing, same assertion strength.

## B1-B7 bait outcomes

- B1 NO SILENT EMPTY: client guard is independent of server forwarding — T8 proves the VISIBLE
  reason (error surface names plate1 label+reason verbatim; a zero-event leg with NO structured
  reason still errors with the outcome literal); NO draft-ready fires over an empty change list;
  prior preview untouched (asserted). GREEN 7/7.
- B2 NO HARDCODES / NO RE-IMPLEMENTED DECK LOGIC: grep of the three changed src/ files for
  plate1 / plate_96 / Trypsin / HepG2 / Clofibrate / deck-fixture ids → zero hits (fixture
  strings live only in test files). Deck matching is the IMPORTED
  composeLabwareHintLookupWithDeck / bindShorthandEventsToDeck only.
- B3 shorthandChat.ts IMPORT-ONLY: not in git diff --name-only base..HEAD (verified below).
- B4 WIRE ADDITIVITY: /intent/compile keeps its existing keys; clarifications rides via
  non-empty-only conditional spread; IntentCompileFromPromptHandlers.ts NOT in the diff (422
  convention untouched); no new outcome value, no new reason code; ScientistIntentUnresolvedFact
  verbatim. No wire redesign.
- B5 DEEP-EQUAL IS THE CONTRACT: T2 compares chat-path bound proposals field-for-field INCLUDING
  details.labwareId (see non-vacuity note above).
- B6 labwareAdditions HONESTY: the legacy `labwareAdditions: []` hardcode in the recompile's
  buildPreviewFromDraft/setPreview (AiTabPanel.tsx :688/:700) is UNCHANGED — disclosed residual,
  not silently widened. The round-trip tests do not depend on it (deck plates are existing
  labwares in editor state).
- B7 MANIFEST / ONTOLOGY: MANIFEST hash-object fbf743ab1384778de43eeb113da0f0857eef9fce IDENTICAL
  to dispatch base; no goldens path in the diff; no golden bless; no new vocabulary/cue/config
  YAML (git diff --name-only shows zero .yaml).

## Verification bars (CODER-CAPTURED, this resume run)

### Targeted server (vitest cwd=server; handlers dir + spine4 + shorthandDeckBinding + labwareIdBinding + goldens)
Raw .hermes/raws/shqb1-resume-targeted-server.txt:
```
 Test Files  5 failed | 57 passed (62)
      Tests  6 failed | 428 passed (438)
   Start at  18:41:46
   Duration  29.48s (transform 36.24s, setup 10ms, collect 149.91s, tests 36.21s, environment 31ms, prepare 18.00s)
```
Key suites GREEN in that raw: spine4ProductionWiring 4/4, AgentOrchestrator.shorthandDeckBinding
8/8, shorthandChat.labwareIdBinding 5/5, goldens goldenIntentToClarification 6/6 +
goldenIntentToGraph 3/3 + goldenRolesSeam 7/7 (goldens green WITHOUT any MANIFEST movement).
The 5 failing files (EventEditorFixHandlers, ExtractHandlers, LabSettingsHandlers,
MeasurementHandlers.applianceJob, WorkspaceHandlers) are ALL in the base failing set — extracted
list .hermes/raws/shqb1-resume-targeted-server-failfiles.txt; `comm -13` vs base set → empty
(zero NEW failing files).

### Targeted app (right-pane/ai/ + shared/api/)
Raw .hermes/raws/shqb1-resume-targeted-app.txt:
```
 Test Files  3 failed | 43 passed (46)
      Tests  297 passed (297)
     Errors  1 error
   Start at  18:42:36
   Duration  53.88s (transform 59.70s, setup 72.75s, collect 193.25s, tests 74.49s, environment 608.70s, prepare 30.08s)
```
Failing files (draftChanges, ParameterAnswerInput, useChatThread.deckLayout) are IDENTICAL to the
base targeted raw's failing set (shqb1-base-targeted-app.txt: 3 failed | 41 passed) — comm -3
empty. 297 tests pass, 0 test failures; `Errors 1 error` is the pre-existing unhandled-exception
line, identical base→head.

### Full server suite (failing-FILE-SET equality vs base 95d1c8bc)
Head raw .hermes/raws/shqb1-resume-full-server.txt:
```
 Test Files  108 failed | 611 passed | 9 skipped (728)
      Tests  171 failed | 5778 passed | 70 skipped (6236)
     Errors  2 errors
   Start at  18:42:32
   Duration  300.71s (transform 180.15s, setup 370ms, collect 2128.89s, tests 2014.43s, environment 1.62s, prepare 622.72s)
```
Base raw .hermes/raws/shqb1-base-server-suite.txt (prior run, captured at 95d1c8bc):
```
 Test Files  108 failed | 609 passed | 9 skipped (726)
      Tests  171 failed | 5769 passed | 70 skipped (6227)
     Errors  2 errors
   Start at  16:43:16
   Duration  250.63s (transform 120.91s, setup 388ms, collect 1567.79s, tests 1748.11s, environment 966ms, prepare 527.93s)
```
Headline counts differ only by the 2 NEW test files this item adds (728 vs 726 collected; the
added files pass, raising the passed count). The load-bearing proof is the failing-FILE SET,
extracted from both raws with the SAME rule (❯-prefixed failing-file lines, src/ and test/):
head set .hermes/raws/shqb1-resume-full-server-failfiles.txt (108 files) vs base set
.hermes/raws/shqb1-base-full-server-failfiles.txt (108 files) — `comm -3` EMPTY (verified this
run). (The prior run's .hermes/raws/shqb1-base-failfiles.txt is a src/-only 104-file subset of
the same base raw; the 4 test/api/*.test.ts entries it omits fail identically in BOTH raws.)
`Errors 2 errors` identical base→head — both raws show the same two pre-existing unhandled
rejections (AgentOrchestrator.goldenWithSeeds.test.ts:107 / AgentOrchestrator.golden.test.ts:21
'Should not be called' mock rejections), untouched by this diff.

### tsc
- server: `npx tsc --noEmit` → exactly 1 error, the pre-existing
  `src/ai/AgentOrchestrator.ts(344,18): error TS2339` (do-not-fix baseline). Raw
  .hermes/raws/shqb1-resume-server-tsc.txt; comm vs .hermes/raws/shqb1-base-server-tsc.txt →
  SET-EQUAL (zero new).
- app: `npx tsc --noEmit` → 23 errors. Raw .hermes/raws/shqb1-resume-app-tsc.txt; sorted comm -3
  vs .hermes/raws/shqb1-base-app-tsc-sorted.txt (23) → EMPTY set-diff (verified this run).

### MANIFEST
`git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
→ fbf743ab1384778de43eeb113da0f0857eef9fce — IDENTICAL to dispatch base.

### Scope diff (git -c core.fileMode=false diff --name-only 95d1c8bc..HEAD)
```
app/src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx
app/src/event-editor/right-pane/ai/AiTabPanel.tsx
app/src/shared/api/client.intentCompileDeck.test.ts
app/src/shared/api/client.ts
server/src/api/handlers/IntentCompileHandlers.roundTrip.test.ts
server/src/api/handlers/IntentCompileHandlers.shapeFork.test.ts
server/src/api/handlers/IntentCompileHandlers.ts
```
All 7 ⊂ the contract-header owned set. shorthandChat.ts / AgentOrchestrator.ts /
normalizeScientistIntent.ts / resolution/** / IntentCompileFromPromptHandlers.ts / schema/** /
EventEditorContext / deck files / any .yaml: ABSENT from the diff.

### Region discipline on AiTabPanel.tsx (git diff -U0 base..HEAD)
```
@@ -623 +623,16 @@ export function AiTabPanel() {
@@ -630,0 +646,35 @@ export function AiTabPanel() {
@@ -658 +708 @@ export function AiTabPanel() {
```
Base-side touched positions: 623, 630 (insertion point), 658 — ALL inside the owned region
:618-671. ZERO hunks at :1340-1345 (the wiring sites already pass onShorthandRecompile +
shorthandApply spreads; no change was needed there — absence of hunks is the proof). No hunk
outside the owned regions.

## Restart / live-behavior note

The route change is TS-only; NO YAML was changed (diff shows zero .yaml). This report makes NO
live :5193 claim — the browser gate (F2 recipe verbatim) is the orchestrator's done-gate and was
not run by the coder. The lane stack was never restarted or touched by this run.

SH-QB-1 DONE 9fc5fb639e652c56ff3024e797885b1d04bb6809
