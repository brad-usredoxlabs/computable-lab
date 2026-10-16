# SH-QC-1 coder report (wip) — lane 2, worktree wt/SH-QC-1-lane2-l2t0830, branch cl/SH-QC-1-lane2-l2t0830

Base: trunk d668920f (SH-QA-3 ad828c76 + SH-QA-4 509ca293 + SEQ-2 fix3 74590f53 all ancestors).
All git via `git -c core.fileMode=false`. Spec: .hermes/plans/2026-10-16_0558-SH-QC-1-ghost-cancel-resend-spec.md (canonical, §12 rulings binding).

## 0. CITE RE-PIN TABLE (every §0 cite re-opened first-hand at d668920f)

| Spec cite (compose-time 27ef008f) | Reality at d668920f | Status |
|---|---|---|
| AiTabPanel handleCancelDraft :1104-1112 | :1104-1112 — protocolProposalRef null :1107, sidebarDispatch cancel :1109, resolvedClarificationsRef.clear :1110, editor?.actions.clearPreview() :1111 | HOLDS |
| Cancel affordances QuestionsPanel onCancel :1369 / ChangesPanel onDiscard :1423 / escape :1491 | :1369 / :1423 / :1491 | HOLDS |
| onDraftResult :389; error guard :423-428; workstateTurn :437; ledgerTurn :449; draft-ready dispatch :529-541; `if (!editor) return` :543; buildPreviewFromDraft :556-568; hasPreview :569-571; revision trail :575-585; setPreview :586-607; deps :609 | all verified at those lines | HOLDS |
| send-time context memo :224-325 (acceptedGraphProjection from editorState.labwares; draftRevision only when preview mounted :306-313) | :224-325; previewDraft :277-286; draftRevision spread :306-313 | HOLDS |
| sidebarState initialSidebarState :180, 'cancel' action :177, case cancel/reset :254-256 | :180 / :177 / :254-256 | HOLDS |
| EventEditorContext set_preview :835-854 (normalize :836, assignVisibleLabwareHandles :839, droppedFocus :844-848, replace :851) | :835-854 exactly; helper normalizePreviewPlacementLocations :529-564 | HOLDS |
| clear_preview :857-869; commit_preview :870-885; clearPreview action :1150, wiring :1418-1419 | :857-869 / :870-885 / :1150 / :1418-1419 | HOLDS |
| useChatThread send :164-; done handler :219-238; SILENT SWALLOW :221-225 | :164; :219-239; try{onDraftResult}catch{} at :221-225 | HOLDS |
| previewProjection buildPreviewWellIndex :28-60, collectEventLabwareIds :120-134, previewWellsForLabware :71-76 | :28 / :120 / :71 | HOLDS |
| DeckSlot affected :47-49, ghost branch requires previewPlacement && previewLabware :174-182, data-preview :153 | :47-49 / :174 (`previewPlacement && previewLabware ?`) / :153 | HOLDS |
| LawnSurface preview lawn :70-77, affected :269, ghost labware lookup+skip :340-342 | :70 / :269 / :340-342 | HOLDS |
| LabwareTile data-ghost :74, data-affected :75 | :74-75 | HOLDS |
| LabwareFocus labwareStates :164-170, previewWells :172-177 | :164-170 / :172-177 | HOLDS |
| WellGrid data-preview :270 | :270 | HOLDS |
| eventGraph computeLabwareStates :745+, details read :765, skip :852 | DRIFTED: computeLabwareStates at :807; `const labwareId = details.labwareId` at :827; `if (!labwareId) continue` at :914. Re-derived by grep for the literals, not by line number. File NOT owned (OQ2) — untouched. | RE-PINNED |
| systemPrompt deriveContextCacheKey :642 | :642 | HOLDS |
| AgentOrchestrator conversationKey :1209-1210, deck-hint composeLabwareHintLookupWithDeck :1219-1223, takeHeld :1253/:1703, hold :1292/:1323/:2424 | conversationKey :1210; compose :1219-1222; takeHeld :1254/:1738; hold :1293/:1324/:2469 | RE-PINNED (drift +1..+45) |
| shorthandChat heldIntents :324, hold :326, take :335-340, composeLabwareHintLookupWithDeck :113-124, bindShorthandEventsToDeck :139+, shorthandResultFromCompile :623+ | heldIntents :325, hold :327, take :336-340, compose :114-124, bind :140+, resultFromCompile :637+ | RE-PINNED (drift +1..+14) |
| ChangesPanel Discard button :128 onClick={onDiscard}, label :130, NO data-testid | :128 / :130; grep confirms no data-testid on that button | HOLDS |
| e2e spec stubAssistStream :182-203, seed :205-262, drive :264-282, asserts :284-330, serial :57 | all hold at those lines | HOLDS |
| shorthandPreviewGhosting.test.ts header :1-18 | :1-18 | HOLDS |

## 1. BASELINES MEASURED AT BRANCH POINT d668920f (this worktree)

- app `npx tsc --noEmit | grep -c "error TS"` = **23** (matches orchestrator's 09:20 measurement).
- server `npx tsc --noEmit | grep -c "error TS"` = **1**.
- app full vitest @ d668920f (clean tree, before any edit): **Test Files 56 failed | 306 passed (362); Tests 71 failed | 2374 passed (2445)**; fail-file list saved at /tmp/shqc1-base-failfiles.txt (56 files: 28 e2e specs that vitest cannot run + 28 src unit files — pre-existing debt).
- server honesty test `shorthandChat.e2eStubHonesty.test.ts` @ branch point: **7 passed**.
- Existing deck-ghost Playwright legs vs orchestrator stack :5193: **2 passed**.

## 2. §2 MANDATED DIAGNOSTIC CAPTURE (done BEFORE any code change)

### 2a. Stubbed two-cycle probe (P6 discriminator) — app/e2e/zz-shqc1-probe.spec.ts (throwaway, deleted after capture)
Sequence stub (queue-popping fetch interceptor + request tee + console tee), resetDeckWithPlate ('ghost plate'/LBW-96-1), prompt -> drill -> Discard -> re-prompt IDENTICAL text, both cycles fed the SAME honest bound payload (fixedShorthandResult verbatim: 96 events, details.labwareId 'LBW-96-1', details.wells [well]).

CAPTURED DOM (verbatim from run):
- CYCLE 1: affectedCommitted 1, changesPanel true (tile: ghost=false affected=true text 'ghost platePreview⟲×')
- CYCLE 1 DRILLED: previewWells 96
- POST-CANCEL: ghostTiles 0, previewWells 0, affectedCommitted 0, changesPanel false  (Cancel clears — hard requirement already true today)
- CYCLE 2: previewWells 96, changesPanel true  -> **cycle 2 GHOSTS FINE under an identical bound payload**

Console during cycle 2: no errors, no pageerror (only vite/router debug lines).
Request tee: cycle-1 body 1178 B, cycle-2 body 1389 B; the ONLY context differences: cycle 2 adds `activeDeckScope.focusedLabwareId:"LBW-96-1"` (because focus stayed on the committed plate — clear_preview only drops focus when it sat on a PREVIEW placement, EventEditorContext.tsx:860-863) and `history` carries the cycle-1 turns. `labwares`, `deckPlacements`, `allowedLabwareIds`, `eventGraphId` byte-identical — context is NOT stale/emptied after Cancel.

=> **Outcome P6: the client lifecycle (set_preview/clear_preview/set_preview, ghost consumers, tooltip path) is EXONERATED.** Per spec §6/§2 this routes to the server-side line (STOP for architect).

### 2b. LIVE two-cycle captures against the real :3093/:5193 stack (F4 recipe verbatim)

Probe app/e2e/zz-shqc1-f4-probe3.spec.ts (throwaway): deck plate NAMED '96 well plate' (so the model's labware noun exact-matches the deck name and bindShorthandEventsToDeck binds it), prompt = the wave SHARED REPRO ENV verbatim:
`Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS containing 200 HepG2 cells per uL to each well.`
Cycle 1 -> Discard -> re-prompt IDENTICAL. Console tee: no client errors in any run.

**F4 PAIR CAPTURED (run 11, /tmp/shqc1-f4-capture-11.txt):**
- CYCLE 1 DOM: affectedCommitted 1, changesPanel true. Cycle-1 done frame (RAW, verbatim): success true, 1 event, `details.labwareId:"LBW-96-1"`, `details.wells:[A1..H12]` (96 wells), `labwareId:"LBW-96-1"`, composition_snapshot 4 draft component_refs, volumeUl 50, counter_density 200 cells/uL, count 10000, shorthand `labware: "96 well plate"`, notes present. Deck ghosted.
- POST-CANCEL DOM: ghostTiles 0, previewWells 0, affectedCommitted 0, changesPanel false. Cancel cleared everything.
- CYCLE 2 DOM: affectedCommitted **0**, previewWells **0**, changesPanel **true** (sidebar card re-opens, deck dead) — the F4 symptom reproduced.
- Cycle-2 done frame (RAW, verbatim, complete):
  {"success":false,"notes":["Drafted 1 event.\nDraft compiled deterministically from the scientist-intent shorthand."],"usage":{"promptTokens":14809,"completionTokens":19,"totalTokens":14828,"turns":1,"toolCalls":0}}
  -> NO events, NO shorthand, NO error text, NO clarificationRequests; toolCalls 0, completionTokens 19.
- Cycle-2 request body (verbatim): context BYTE-IDENTICAL to cycle 1 (same labwares incl. name '96 well plate', same deckPlacements, same activeDeckScope, same eventGraphId); only `history` differs: [{"role":"user","content":"<same prompt>"},{"role":"assistant","content":"Drafted 1 event.\nDraft compiled deterministically from the scientist-intent shorthand."}].

Same signature in run 4 (/tmp/shqc1-f4-capture-4.txt): cycle 1 bound+ghosted (details.labwareId LBW-96-1 + 96 wells), cycle 2 done frame success:false, eventsLength 0, shorthand null, changesPanel true, deck dead.

Second live shape (runs 2/7, /tmp/shqc1-f4-capture-2.txt, plate named 'ghost plate'): cycle 2 produced 1 event with top-level `labwareId:"96-well plate"` (model noun != deck name 'ghost plate') and NO details.labwareId / NO details.wells -> unbound label -> no bucket -> no ghost (bindShorthandEventsToDeck shorthandChat.ts:140+ binds ONLY on exact deck-name match; KNOWN-IDS from request context.labwares). Cycle 1 in that run was a needs-clarification turn (events []). Model-noun variance across runs; the deterministic constant across ALL runs: **when the server re-drafts and binds, the client ghosts (2a); when the server does not re-draft (success:false, toolCalls 0) or emits an unbound noun, the sidebar card still renders and the deck stays dead.**

### 2c. Branch-table outcome

PRIMARY: **P1** — cycle-2 `done` result is `success:false` with events[] EMPTY (and no shorthand/error/clarifications; toolCalls 0) while cycle 1 carried the fully bound 96-well payload. Server never re-drafted the repeat prompt. §2 table: P1 -> **STOP — payload defect; exact payload to architect**.
SUPPORTING: **P6** — stubbed two-cycle leg with an IDENTICAL bound payload ghosts fine on cycle 2 (2a): the defect is NOT in the client lifecycle. §6: "If it goes GREEN immediately... STOP and file the §2-P2 wire diff (this is outcome P6, a valid, reportable RED outcome for the ORIGINAL recipe)."
REQUEST-BODY DIFF (P2 row's precondition test): the two cycle bodies' `context` objects are byte-equivalent (only `history` differs; `labwares`/`deckPlacements`/`activeDeckScope` identical) -> NOT branch C (client did not send stale/emptied context after Cancel).
NOT P3/P4 (no throw in console; onDraftResult ran — sidebar card rendered), NOT P5 (state.preview never received events: the done frame has none).

VERDICT: **payload defect -> architect (stop_boundary)**. No client-side workaround will be patched around it (spec §3 Branch A/P1/P2-server; task-block stop_boundary).

## 3. Owned tests written (RED discriminator + lifecycle pins)

Owned-file diff (3 files, all inside §3 ownership):
- `app/e2e/deck-ghost-shorthand.spec.ts`: new `stubAssistStreamSequence` (F-5 sequence stub — the two pinned builders `fixedShorthandResult`/`blobClarificationResult` are BYTE-UNTOUCHED; honesty suite re-run green, §4), extracted `askInChat` helper (openFreeformDeckAndAsk behavior unchanged), two new legs:
  - **CYCLE leg** (T-A): prompt -> Discard -> re-prompt IDENTICAL text with the SAME honest bound payload both cycles; asserts cycle-1 affected tile, post-Cancel zero `[data-ghost="true"]` + zero `[data-preview="true"]` + committed tile `data-affected="false"` (HARD REQUIREMENT asserted mid-leg), then cycle-2 re-arm: affected true, 96 `[data-preview="true"]`, `.well-tooltip` visible containing /50/ (content-agnostic per B9).
  - **CYCLE-B characterization leg**: the cycle-2 `done` frame VERBATIM as captured live (run 11) fed as cycle 2 — card re-opens, deck stays clean. Pins the failure mode (mirrors shorthandPreviewGhosting.test.ts), NOT a fix.
- `app/src/event-editor/EventEditorContext.test.ts`: T-B preview-context-lifecycle describe (6 tests): (i) replacement drops all A placements; (ii) focus on an A ghost DROPPED when B lacks the id + (ii-b) SURVIVES when B keeps it (bait B8 both directions pinned); (iii) clear nulls preview + drops ghost focus + (iii-b) keeps committed focus; (iv) post-clear set_preview with `details.labwareId = LBW-96-1` + `details.wells` buckets 96 wells via buildPreviewWellIndex.
- `app/src/event-editor/right-pane/ai/ChangesPanel.tsx`: `data-testid="changes-discard"` on the Discard button (F-6, cancel-leg chrome, one line).

### RED run (failing for the RIGHT reason) — throwaway `zz-shqc1-red-demo.spec.ts` (deleted after capture; output preserved here)
The new cycle-2 acceptance assertions driven with the CAPTURED live cycle-2 payload as cycle 2:

```
✘  1 [chromium] › e2e/zz-shqc1-red-demo.spec.ts:111:1 › RED: cycle-2 acceptance assertions against the CAPTURED live payload fail for the right reason (no events on the wire) (30.2s)
    Locator:  locator('.tile[data-ghost="false"]').filter({ hasText: 'ghost plate' }).first()
    Expected: "true"
    Received: "false"
      137 |   await ask(page, GHOST_PROMPT)
    > 138 |   await expect(plateTile.first()).toHaveAttribute('data-affected', 'true', { timeout: 10_000 })
```
Cycle 1 ghosted and Discard cleared inside the same run (those assertions passed); the failure lands exactly at the cycle-2 re-arm — because the wire payload carries NO events. This is the F4 symptom reproduced deterministically from the captured payload.

### GREEN run — shipped legs vs the orchestrator's lane stack :5193 (chromium)
```
✓  1 … CANONICAL leg … (2.4s)
✓  2 … GHOST leg … (2.5s)
✓  3 … CYCLE leg: prompt -> Discard -> re-prompt re-arms the ghost on cycle 2 and Cancel leaves nothing behind (no model) (2.7s)
✓  4 … CYCLE-B characterization leg: the captured live cycle-2 payload (success:false, no events) re-opens the card but ghosts NOTHING — defect is on the wire (no model) (2.6s)
4 passed (12.4s)
```
The CYCLE leg going GREEN with an identical bound payload is the §2-P6 exoneration of the client lifecycle (spec §6: "If it goes GREEN immediately … STOP and file the §2-P2 wire diff … a valid, reportable RED outcome for the ORIGINAL recipe").

### T-B unit run
`npx vitest run src/event-editor/EventEditorContext.test.ts` -> **8 passed (8)** (2 pre-existing + 6 new). Targeted trio `EventEditorContext.test.ts + shorthandPreviewGhosting.test.ts + previewProjection.test.ts` -> **3 files / 16 tests passed**.

## 4. BARS (measured at branch point d668920f AND at tip)

| Bar | Branch point d668920f | Tip | Verdict |
|---|---|---|---|
| app `npx tsc --noEmit` error lines | 23 | 23 | sorted-diff EMPTY (zero new lines; verified via stash-base vs tip diff) |
| server `npx tsc --noEmit` | 1 | 1 | server untouched |
| app full vitest fail-file set | 56 files (56 failed/306 passed files; 71 failed/2374 passed tests) | 56 files (56 failed/306 passed; 71 failed/**2380** passed) | `comm -3` of sorted fail-file lists = **EMPTY** (zero new failing files anywhere in app; +6 passing tests = the new T-B pins) |
| deck-ghost Playwright legs vs :5193 | 2 passed | **4 passed** (CANONICAL + GHOST + CYCLE + CYCLE-B) | green |
| server `shorthandChat.e2eStubHonesty.test.ts` | 7 passed | **7 passed** | builders unmutated; no new stub builder added (CYCLE-B payload is a verbatim live capture, not a compile-claim builder) |
| vitest unhandled "Errors" line | 5 | 5 | pre-existing debt (unchanged) |

exactOptionalPropertyTypes note: app tsconfig does not enable it (server does); all new conditional data uses full literals/conditional spread — no `key: undefined` anywhere in the diff.

## 5. stop_boundary record (verbatim task block: "if the second proposal's payload is actually rejected by the deck consumer for a validation reason, stop and hand the exact rejection to the architect")

Precise record: the deck consumer never REJECTED a payload for validation — the second proposal's payload contained NO events at all. The exact cycle-2 `done` frame (run 11, verbatim, complete):

{"success":false,"notes":["Drafted 1 event.\nDraft compiled deterministically from the scientist-intent shorthand."],"usage":{"promptTokens":14809,"completionTokens":19,"totalTokens":14828,"turns":1,"toolCalls":0}}

Exact cycle-2 REQUEST body (verbatim; cycle-1 body identical except `history` — context byte-equivalent, so NOT branch C):
{"prompt":"Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS containing 200 HepG2 cells per uL to each well.","surface":"workspace.deck","context":{"studyId":"STU-scratch","activeTabKind":"project-details","activeArtifactId":null,"activeEventGraphId":"EVG-SPK-VERIFY","systemPromptId":"workspace.deck","systemPromptBody":"You are helping draft compiler-native event graphs for a lab deck. Prefer structured tool calls over free-text. Ghost previews must not commit local namespace records until the user accepts.","activeDeckScope":{"locked":false,"platformId":"manual","variantId":"manual_freeform","allowedSurfaces":["lawn"],"allowedSlots":[],"allowedLabwareIds":["LBW-96-1"]},"labwares":[{"labwareId":"LBW-96-1","labwareType":"plate_96","name":"96 well plate","rows":8,"columns":12}],"eventSummary":"No events yet.","vocabPackId":"liquid-handling/v1","availableVerbs":[…15 verbs…],"deckPlatform":"manual","deckVariant":"manual_freeform","deckPlacements":[{"slotId":"lawn","labwareId":"LBW-96-1"}],"eventGraphId":"EVG-SPK-VERIFY"},"history":[{"role":"user","content":"Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS containing 200 HepG2 cells per uL to each well."},{"role":"assistant","content":"Drafted 1 event.\nDraft compiled deterministically from the scientist-intent shorthand."}],"enableThinking":false}

Architect-facing observations (server territory, NOT fixed here):
- Cycle-2 turn: `toolCalls: 0`, `completionTokens: 19`, `success:false`, `notes` verbatim-ECHOES cycle 1's assistant summary. The server never invoked the draft tool on the repeat prompt despite a byte-equivalent context.
- `deriveContextCacheKey` (systemPrompt.ts:642) keys on `event-editor:<eventGraphId>` + scope — HISTORY IS NOT PART OF THE KEY, so both cycles share one conversation key; the held-intent map (shorthandChat.ts:325, destructive-take-only) and any warm-prefix fold keyed on that same key are the prime suspects (spec §9 F-3 already flags the leak; OQ1 follow-up line exists).
- Secondary live shape (run 2): when the model re-drafted but named the plate with a NON-matching noun ("96-well plate" vs deck name "ghost plate"), the event shipped UNBOUND (no details.labwareId/wells) -> no bucket -> no ghost (bindShorthandEventsToDeck binds exact deck names only, shorthandChat.ts:140+). That is a separate server-side binding-fragility observation, not the primary defect.

## 6. Assumptions

- AS-LANE2-SHQC1-001: the lane stack :5193 serves the cl-integration-2 TRUNK checkout, so the new `changes-discard` testid is invisible to e2e legs until merge; the legs locate the Discard button by `[data-testid="changes-discard"], .changes-panel__btn--discard` (same element, works pre- and post-merge).
- AS-LANE2-SHQC1-002: live model output varies run to run (labware noun, clarification bars). The F4 pair was captured with the deck plate NAMED '96 well plate' so the model's cycle-1 noun exact-matches the deck name (binds + ghosts); the prompt is the wave SHARED REPRO ENV verbatim. Bait B10 respected: the fix/diagnosis is NOT built on paste #7's single payload — BOTH cycles were captured live.
- AS-LANE2-SHQC1-003: the CYCLE-B leg feeds the captured live payload verbatim as a characterization pin; it is not a compile-claim builder, so the honesty suite (which extracts only the two pinned builders) is unaffected — re-verified 7/7.
- AS-LANE2-SHQC1-004: the app vitest fail-file baseline includes 28 e2e Playwright specs vitest cannot execute (pre-existing debt at d668920f, present identically at tip); comm-empty is the zero-new proof, not headline exit 0.
- AS-LANE2-SHQC1-005: live captures drove the /deck surface (where the seeded fixture lives, per spec §4); the OQ3 run-page T-C gate leg belongs to the orchestrator's cl-browser-reviewer dispatch, not to this coder session. My stubbed CYCLE leg's tooltip assertion (visible + /50/) is the SH-QA-4 folded spot-check MENTION: cycle-2 tooltip rendered populated with the volume string; I judge nothing on SH-QA-4's content.
- AS-LANE2-SHQC1-006: no YAML touched (B2); no ontology binding added (B4); no labware-name/id literals beyond the existing fixture in product code (B5 — the only new literals are test fixtures in test files); useChatThread's catch NOT widened (B6); clear_preview NOT suppressed (B7 — post-Cancel emptiness asserted in the same legs).

## 7. Verdict + handoff

VERDICT: **SHQC1-BLOCKED-P2** — payload defect (branch table P1 primary, P6 supporting exoneration; P2 row's request-body diff shows byte-equivalent context -> server-side). No client-side workaround patched (spec §3 Branch A; task-block stop_boundary). The client lifecycle is proven correct end-to-end by the CYCLE leg (96 wells re-armed on cycle 2 with an identical bound payload, Cancel leaves nothing behind) and pinned at reducer level by T-B.

Handoff to orchestrator/architect (exact artifacts above §5): cycle-2 done frame + both request bodies + receipts at `.hermes/plans/receipts/SHQC1-l2t0830/` (md5s in MD5SUMS.txt). Suggested architect focus: the conversation-keyed fold on the repeat prompt (toolCalls 0, notes echo of the prior turn) — deriveContextCacheKey:642 + heldIntents (shorthandChat.ts:325) + the fresh-extraction path (AgentOrchestrator.ts hold/take sites :1254/:1293/:1324/:1738/:2469). OQ1 (held-intent leak) is already a recorded follow-up line; this defect may be its sibling on the no-answers path.

T-C browser gate (orchestrator dispatch, :5193 run page per OQ3): my live /deck captures already demonstrate the recipe's cycle-1-ghosts/post-Cancel-empty DOM and the cycle-2 dead DOM on the CURRENT trunk — the gate will show the SAME symptom until the payload defect is fixed server-side; the stubbed CYCLE leg is the deterministic proof that the client side of the acceptance criterion passes once the wire carries the bound payload.

Commits: `test(SH-QC-1): RED` 332276e2 -> `test(SH-QC-1): GREEN` 4cfd1b6e (owned-code tip) -> this report commit (branch tip: see `git -c core.fileMode=false log --oneline -1` on cl/SH-QC-1-lane2-l2t0830). No merge, no push, stacks untouched.

SHQC1-BLOCKED-P2 4cfd1b6e
