# THREAD-ASK-1 — coder report (lane 2, l2t1450)

Worktree: /mnt/vast/home/brad/git/wt/THREAD-ASK-1-lane2-l2t1450
Branch: THREAD-ASK-1-lane2-l2t1450 (off trunk cl/integration-2 afd2d0da; my base commit a5b3999a — the lane-2 checkpoint docs commit on top of afd2d0da)
Tip: d5e388a0
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-13_1450-THREAD-ASK-1-spec.md (read in full, incl. the ORCHESTRATOR PROMOTION NOTE)

## Commits (RED-first)

1. 98e90508 test(THREAD-ASK-1): RED — clarification-answer binding (server seam) + answerable held cards (client)
2. 39862530 feat(THREAD-ASK-1): Leg 1 GREEN — clarification answers ride the answers map as data
3. d5e388a0 feat(THREAD-ASK-1): Leg 2 GREEN — held 422 renders answerable cards (picker + mint) + pick re-sends via the existing round-trip

## First targeted check (before writing UI) — PASSED, no hand-back

The spec's curl mint probe against :3093 was forbidden by the dispatch (no live stack
touched), so I used the spec's stated alternative — "a supertest/vitest against the real
handler (no stack mutation)" — in `server/src/api/handlers/IntentCompileFromPromptHandlers.clarificationAnswers.test.ts`:

- CONTROL: answered compile of `seed the plate with Threadask Probe Gadget` with a store
  that has NO matching record -> 422 with clarification `{label:'Threadask Probe Gadget',
  reason:'unknown-noun'}` (the bar is real).
- SPINE LEG: same request with a minted-style MAT- record in the test store
  (`{recordId:'MAT-threadask-probe-gadget', name:'Threadask Probe Gadget', kind:'material'}`,
  the spine4ProductionWiring.test.ts recordStoreWith convention) -> the label is GONE from
  the unknown-noun clarifications (outcome complete/gap). Tier-1 binds with NO new
  mechanism. The spine is NOT the defect; the design stands.

## RED evidence (commit 98e90508)

Server (`IntentCompileFromPromptHandlers.clarificationAnswers.test.ts`, 5 tests):

```
 ❯ src/api/handlers/IntentCompileFromPromptHandlers.clarificationAnswers.test.ts  (5 tests | 1 failed)
   ❯ ... > data-only: an injected spine stub receives the clarification label — the handler binds nothing itself
     → expected "spy" to be called at least once
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```

RED was test 6 only: the handler had NO injectable spine seam (it always built its own
store-backed spine), so the data-only proof had no declared seam. Tests 5/7/8 were already
green at trunk — composeAnsweredPrompt already iterates answers verbatim and tier-1 already
binds — which is itself the proof that Leg 1 needs pass-through only.

Client (`ProtocolLocalizationThread.clarificationCards.test.tsx`, 4 tests):

```
 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)
```

RED was tests 1-3 (no cards rendered; the held bar showed only the infoMsg string). Test 4
(infoMsg fallback, no picker-less card) already held at trunk.

## GREEN evidence

Commit 39862530 (Leg 1):

```
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts  (4 tests)
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts  (4 tests)
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.clarificationAnswers.test.ts  (5 tests)
 ✓ src/api/handlers/IntentCompileFromPromptHandlers.test.ts  (11 tests)
 Test Files  4 passed (4)
      Tests  24 passed (24)
```

```
 Test Files  3 passed (3)   (resolveNounsPass 18 + nounResolution 15 + spine4ProductionWiring 4)
      Tests  37 passed (37)
```

server tsc: 0 error lines.

Commit d5e388a0 (Leg 2):

```
 ✓ src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx  (6 tests)
 ✓ src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx  (3 tests)
 ✓ src/event-editor/right-pane/protocol/ProtocolLocalizationThread.familyAxes.test.tsx  (7 tests)
 ✓ src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationCards.test.tsx  (4 tests)
 Test Files  4 passed (4)
      Tests  20 passed (20)
```

```
 Test Files  3 passed (3)   (ClarificationPicker + client.intentCompileHeld + ProtocolIdeShell.clarifications)
      Tests  18 passed (18)
     Errors  1 error        <- the KNOWN pre-existing unhandled TypeError noise (identical at baseline)
```

(ProtocolLocalizationThread.resolvedDeck.test.tsx — DECK-FOLD-1's file — also run green:
4 files / 20 tests when included.)

## Baselines at my tip vs spec baselines (measured 99b057f8, re-confirmed at my base)

| Gate | Spec baseline | My base (a5b3999a) | My tip (d5e388a0) |
|---|---|---|---|
| server IntentCompileFromPrompt 3 files | 3 files / 19 tests PASS | 3/19 PASS | 4 files / 24 PASS (3 existing 19 unchanged + new 5) |
| spine 2 files | 2 files / 33 tests PASS | 2/33 PASS | 2/33 PASS (+ spine4ProductionWiring 4/4 run too) |
| thread 3 files | 3 files / 16 tests PASS | 3/16 PASS | 4 files / 20 PASS (3 existing 16 unchanged + new 4) |
| picker-consumers 3 files | 3 files / 18 tests PASS (+1 known noise error) | 3/18 + 1 noise | 3/18 + 1 noise (identical) |
| server tsc | 0 error lines | 0 | 0 |
| app tsc | 23 error lines incl. runDeckLock TS2339 | 23 | 23 — ZERO NEW; the only diff vs base is the pre-existing `ProtocolLocalizationThread.tsx` runDeckLock TS2339 line shifting 220->232 (my additive imports pushed it; NOT fixed, NOT suppressed, per spec) |

## Diff vs trunk

`git -c core.fileMode=false diff --stat a5b3999a HEAD` (my base -> tip; a5b3999a is a
docs-only checkpoint on top of trunk afd2d0da, so this equals the change vs trunk):

```
 .../protocol/ProtocolLocalizationThread.clarificationAdapter.ts   |  75 ++++++  (new)
 .../protocol/ProtocolLocalizationThread.clarificationCards.test.tsx | 244 +++++ (new)
 .../protocol/ProtocolLocalizationThread.tsx                       | 127 ++++++++-
 .../right-pane/protocol/protocolTabPanel.css                      |  70 +++++
 .../handlers/IntentCompileFromPromptHandlers.clarificationAnswers.test.ts | 288 +++ (new)
 .../handlers/IntentCompileFromPromptHandlers.ts                   |  27 +-
 6 files changed, 826 insertions(+), 5 deletions(-)
```

Out-of-scope byte-unchanged proof (`git diff --quiet a5b3999a HEAD -- <file>` all UNCHANGED):
ClarificationPicker.tsx, QuestionsPanel.tsx, ProtocolIdeShell.tsx, shared/api/client.ts,
VocabHandlers.ts, resolveNounsPass.ts, resolutionEngine.ts, app/src/types/ai.ts,
scientistIntent/types.ts. No new endpoint, no new fetch path, no YAML touched.

## What was built

LEG 1 (server, IntentCompileFromPromptHandlers.ts):
- The clarification answer rides the EXISTING `answers: Record<string,string>` into
  composeAnsweredPrompt VERBATIM: key = the clarification's own label, value = the picker's
  `[[material:MAT-…|label]]` mention (answerFromMention idiom). composeAnsweredPrompt itself
  is UNCHANGED code — only its doc-block records the binding contract. Zero new domain
  literals, zero reason/label branches (adversarial grep on the diff: NONE).
- `deps.spine?: EngineSpineLike` added as the declared test-seam arm of the SPINE-4 §3
  fail-loud doctrine (compileScientistIntent.ts:139-145 "an explicitly injected ... spine is
  legal only as a declared test seam"). Production callers leave it absent and get the
  byte-unchanged store-backed `createResolveSpineFromContext` composition. This is the ONLY
  functional handler change and it exists to make test 6's data-only proof possible: the
  injected spine stub receives the clarification label (the SPINE is the binder; the handler
  binds nothing).
- 422 envelope byte-unchanged (test 7 pins keys exactly
  error/outcome/clarifications/localMacro/terminalArtifacts via Object.keys).

LEG 2 (client, ProtocolLocalizationThread.tsx + adapter):
- ONE adapter module beside the thread
  (`ProtocolLocalizationThread.clarificationAdapter.ts`): `heldFactToClarificationRequest`
  maps ScientistIntentUnresolvedFact -> AiClarificationRequest. No unification, no renaming,
  no third clarification type. `CLARIFICATION_MENU_BY_REASON` is a DATA table
  (unknown-noun/ambiguous-noun/resolution-lookup-failed -> '/m'); a fact whose reason has no
  entry maps to null -> no card, infoMsg fallback stays (test 4).
- foldHeldBundle: additive `setHeldCards(...)` BEFORE the gate call;
  `holdForReview(held.terminalArtifacts)` remains the fold's LAST statement, unconditional,
  same argument — it appears as unchanged CONTEXT in the git diff (byte-diff target closed).
- Card region (`data-testid="pl-clarification-cards"` / `pl-clarification-card`): one card
  per answerable held fact, label visible, candidates as option buttons, ClarificationPicker
  (consumed UNMODIFIED via `requestHasPicker` + `onPick`) with the mint affordance.
- `handleClarificationPick`: records `answers[<label>] = mentionToken` and RE-SENDS via the
  existing `apiClient.intentCompileFromPrompt` round-trip (same call handleSubmitAnswers /
  handleSendCorrection use; those two sites now send `compileAnswers()` = axis answers merged
  additively with clarification answers — with no picks the map is identical to before, axis
  semantics byte-unchanged). A re-send that re-bars re-folds through foldHeldBundle (test 3
  pins: deck review persists + the re-barred fact re-appears as a NEW card); a 2xx re-send
  goes through holdForReview, never straight to the canvas.
- Card CSS added to protocolTabPanel.css (the thread's existing stylesheet).

## Reviewer-bait disposition (spec section, checked against my own diff)

1. exactOptionalPropertyTypes: no `: undefined` anywhere in new code — conditional spreads
   (`...(sourceProtocolId ? { sourceProtocolId } : {})`, `...(option.ref ? { ref: option.ref } : {})`).
2. ONE adapter, no renaming/forking: both shapes consumed as-is; adapter invents nothing
   (label -> query/prompt, candidates -> options, reason -> menu via the table).
3. holdForReview byte-diff: fold's last statement, unconditional, same argument (verified in
   the diff — it is context, not a +/- line); pick re-sends route held results back through
   foldHeldBundle (test 3).
4. No server-side `if (reason === 'unknown-noun')` anywhere (grep on the handler diff: NONE);
   client reason->menu mapping is the CLARIFICATION_MENU_BY_REASON data table.
5. Mint-floor trap: NO labware minting added; unknown-noun cards map to '/m', the only menu
   with a mint floor today; the OQ is named in a comment at the adapter's mapping site.
6. YAML-reload: N/A — no YAML touched.
7. Client union discipline: narrowed with `'held' in res && res.held === true` at the new
   call site; apiClient types untouched.
8. Byte-stability: ask-vs-answer gate, needsAnswers flow, familyAxes fold, corrections fold,
   QuestionsPanel + ProtocolIdeShell behavior, 422 envelope keys, existing testids — all
   unchanged (out-of-scope file proof above; existing suites green).

## OPEN QUESTION for Brad (NOT decided — implemented Option A per the spec's default)

`/vocab/mint` is MATERIAL-ONLY today (VocabHandlers MINTABLE declares 'material' only;
ClarificationPicker canMint excludes non-material layers). The unknown-noun facts this item
makes answerable (e.g. "BashingBead Lysis Module") are labware-semantic. I implemented
Option A (status quo, zero VocabHandlers change): unknown-noun cards mint as MATERIAL drafts
via the '/m' menu; tier-1 binds the LABEL for resolve_nouns (proven in-process by test 8),
the noun clears, and the object still lands on the zero-match labwareAdditions arm at deck
time — the layer shortcut the decision names. Option B (a labware draft floor in MINTABLE)
is a materials-provenance-hierarchy domain-policy call and is NOT in this item's file
boundary. The OQ is stated in a comment at the adapter's menu-mapping site
(CLARIFICATION_MENU_BY_REASON) — never a silent labware mint.

## Coder choices inside spec-permitted latitude

- Card lifecycle after a SUCCESSFUL re-send: cards collapse (setHeldCards([])) and the honest
  2xx message shows — the spec's open question 1 allowed either; QuestionsPanel's collapse
  was the pattern followed.
- Ambiguity bars (reason 'ambiguous-noun' with candidates) DO render as cards with candidates
  as option buttons (spec open question 2: "spec allows rendering ALL held clarifications as
  cards"); reasons with no table entry stay infoMsg-only.

## Unresolved / pending

- Browser gate: cl-browser-reviewer receipts against :5193 (new surface) are
  orchestrator-arranged AFTER merge — not run by me (all ports forbidden in this dispatch).
- The `deps.spine` seam is the one functional addition to the handler; if the adversarial
  review prefers the data-only proof WITHOUT it, test 6 can be re-expressed against the real
  store-backed spine (the store IS the seam) — the seam is documented as a declared test
  seam, production behavior byte-unchanged.
- Known noise unchanged: ClarificationPicker.test.tsx prints one pre-existing unhandled
  TypeError while all 18 pass (identical at base and tip; not chased).

THREAD-ASK-1 DONE d5e388a0
