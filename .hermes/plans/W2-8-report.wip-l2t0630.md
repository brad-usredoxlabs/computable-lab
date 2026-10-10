# W2-8 SAID/MEANT SURFACE — LANE 2 CODER REPORT (l2t0630)

Worktree: /mnt/vast/home/brad/git/wt/W2-8-lane2-l2t0630 (branch W2-8-lane2-l2t0630, base 529b787d incl. W2-5 fcce2212 + W2-6 f19cfa95).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-10_0630-W2-8-said-meant-surface-spec.md (md5 eb9fa8a8, PROMOTION RECORD M1-M10 binding).

## §0 BASELINE CAPTURE (fresh, in this worktree)

- app tsc multiset: `cd app && npm run typecheck | grep 'error TS'` -> 34 raw lines; normalized (strip `(line,col)`, sort) BYTE-MULTISET-EQUAL to /tmp/l2t2230-tsc-app.txt (34 lines). Proof at claim AND after all changes (final re-run: `raw lines: 34`, `TSC MULTISET MATCHES BASELINE`).
- app unit fail-SET at claim: `cd app && npx vitest run` -> 35 failing files captured to /tmp/l2t0630-app-unit-failfiles.txt (identical extraction method used for the final run).
- Server-side scoped baseline /tmp/l2t2310-w25-baseline-failfiles.txt (11 files) is server/** — out of this item's blast radius; empty server diff proves it (below).

## FIRST TARGETED CHECK (spec §6.1, adjusted to real files)

`src/ingestion/VendorPdfReviewPage.test.tsx` does not exist at this base; the spec's own FIRST TARGETED CHECK command was used:

```
cd app && npx vitest run src/ingestion/VendorPdfReviewPage.treeSelect.test.tsx src/ingestion/candidateToProtocolPayload.test.ts src/event-editor/right-pane/protocol/
Test Files  18 passed (18)
      Tests  159 passed (159)
```

ALL GREEN at the claim base. BranchQuestionsPanel.test.tsx at base: 1 failed | 12 passed — the failure is PRE-EXISTING (in the §0 fail-set): commit 98ec1e28 reworded the component's unbuilt-branch text ("not pre-built" -> "No realization exists for this selection yet...") but left the test's string pin stale. Verified via `git log -S "not pre-built"` and `git show 98ec1e28` (component changed, test pin not). See RELOCATION FIX below.

## §6.1 RED -> GREEN (verbatim tails)

RED (5 new test files written before implementation): 5 files collected, 19 collected assertion failures + import failures (semanticDraft.ts / SaidFactsPane.tsx / SemanticDraftPanel.tsx did not exist; VendorPdfReviewPage had no wave-2 composition; thread had no family axes).

GREEN after implementation:
```
npx vitest run <5 new test files>
      Tests  44 passed (44)
```
BranchQuestionsPanel.test.tsx (after relocation fix):
```
Test Files  1 passed (1)
      Tests  13 passed (13)
```
Scoped verification (`cd app && npx vitest run src/ingestion src/event-editor/right-pane`):
```
 Test Files  5 failed | 68 passed (73)
      Tests  7 failed | 514 passed (521)
```
The 5 failing files (draftChanges, ParameterAnswerInput, useChatThread.deckLayout, FindTabPanel.inventory, FindTabPanel) are ALL members of the §0 baseline fail-set — `comm -13` against the full-run fail-set: outside count 0. No new failures.

Full suite (`cd app && npx vitest run`):
```
 Test Files  53 failed | 258 passed (311)
      Tests  64 failed | 2066 passed (2130)
     Errors  5 errors
```
Unique FAIL-file set: 34 files. vs §0 baseline (35): NEW failures 0 (`comm -13` count 0); FIXED vs baseline: 1 — BranchQuestionsPanel.test.tsx. My tests only ADDED passing files.

Typecheck after all changes: 34 raw lines, multiset-equal to baseline (the one transient new error — `VitestUtils not assignable to Awaitable<void>` in my semanticDraft.test.ts afterEach — was fixed by block-bodied afterEach before final capture).

`grep -rn "candidateToProtocolPayload(" app/src --include='*.tsx'` -> EMPTY (exit 1).

## RELOCATION FIX (acceptance: "BranchQuestionsPanel.test.tsx stays green — RELOCATED, not deleted")

One-line test-string alignment: `BranchQuestionsPanel.test.tsx:125` now pins the component's actual merged wording ('No realization exists for this selection'). Component BranchQuestionsPanel.tsx is BYTE-UNTOUCHED (`git diff HEAD -- .../BranchQuestionsPanel.tsx` = 0 lines). This is the only way the mandated green-test clause can hold at this base; the stale pin was a pre-existing baseline failure, not introduced by me.

## CLAUSE -> PROOF WALKTHROUGH (spec §10 verbatim)

1. "SAID unmutable via any UI path incl. overrides/save" — UI-side only (no claim about the server wall). SaidFactsPane renders candidate facts read-only, zero mutating controls (T3 asserts 0 inputs/buttons that write). wave2 test: poke every `.vpdf-review__left button` -> `updateRecordMock`/`createRecordMock` never called; `candidate-preview` absent; overrides/skippedSteps handlers and editable ProtocolCandidatePreview deleted from the page (grep: no `ProtocolCandidatePreview` import, no `createRecord`, no `state: 'approved'`, no `PRT-` mint in VendorPdfReviewPage.tsx — grep exit 1).
2. "anchor navigation works from semantic evidence" — every rendered PDF page carries `data-vpdf-page`; evidence chips call `onGotoPage` -> `scrollIntoView` machinery (wave2 test spies scrollIntoView on `[data-vpdf-page="2"]`, fired); out-of-range anchor chip is `disabled`, not a crash.
3. "edits survive reload with provenance intact" — save path = `saveSemanticDraftEdit` (semanticDraft.ts): fetch XDR -> `meta.contentSha` human lock -> PURE rebuild of `candidates[0].draft` only -> `deepEqual` no-op (no write) -> ONE atomic `apiClient.updateRecord(xdrId, updated, { expectedSha })` = PUT /records/:XDR (M3, revisionOnEditKinds covers extraction-draft) -> stale-409 mapped to `STALE_PROTOCOL_WRITE_MESSAGE`, no retry. `intent.provenance` preserved by the pure rebuild (semanticDraft.test.ts asserts provenance arrays survive edits byte-equal). TapTab discipline mirrors protocolEditOps.applyProtocolEdit (:367, READ-ONLY reuse — file diff 0), NOT the chat ChangesPanel.
4. "family shows ALL branches, no extraction-time questions" — wave-2 render: right pane = SemanticDraftPanel over `candidates[0].draft` (all branch/variant steps unfiltered; A4 test); NO `branch-questions` testid, NO `vpdf-tree-select` on the wave-2 route (A4 test). BranchQuestionsPanel REMOVED from the wave-2 render; it remains only in the pre-draft legacy intake-review state (required by the still-green treeSelect tests). Realization entry: ProtocolLocalizationThread renders the FAMILY's `branch_axes` (W4 adapter, deduped by axisId, answers flow into POST /intent/accept `answers`) — no duplicate question minting.
5. "no visible action produces a literal-step protocol" — `grep -nE "vpdf-save|vpdf-save-as|vpdf-use-extracted"` over VendorPdfReviewPage.tsx / ProtocolReviewHostPage.tsx / VendorPdfWorkflowTab.tsx -> EMPTY (exit 1). No Save/Save-As modal, no use-extracted button, no protocol POST/PUT mint anywhere on the route. The only write affordance saves the MEANT draft (XDR).
6. "BranchQuestionsPanel.test.tsx stays green" — 13/13 passed (see RELOCATION FIX).

## RETIRED-CALL-SITE PROOF (M8/OQ2)

- `grep -nE "vpdf-save|vpdf-save-as|vpdf-use-extracted" app/src/ingestion/{VendorPdfReviewPage,ProtocolReviewHostPage,VendorPdfWorkflowTab}.tsx` -> no matches (exit 1).
- `grep -rn candidateToProtocolPayload app/src --include='*.ts*'` minus the module and its own test -> 1 hit, which is a COMMENT line (VendorPdfReviewPage.tsx:15, documenting the retirement). Non-module, non-comment caller count: 0.
- `grep -rn "candidateToProtocolPayload(" app/src --include='*.tsx'` -> EMPTY.
- Module+test byte-untouched: `git diff HEAD -- app/src/ingestion/candidateToProtocolPayload.ts app/src/ingestion/candidateToProtocolPayload.test.ts` -> 0 lines.
- No promotion button (OQ3): none rendered.

## AFFORDANCE BUTTON ENDPOINT WIRING (M1/OQ1 (a))

- client.ts sanctioned method (the ONLY client.ts touch, 5 added lines incl. 1-line doc comment):
  `async semanticDraft(candidateRecordId: string)` -> `POST /extraction/vendor-candidates/${encodeURIComponent(candidateRecordId)}/semantic-draft`.
- VendorPdfReviewPage.tsx:205 `canCandidateId` = the CAN-* vendor-protocol-candidate id (from the VPDF record's `vendorProtocolCandidateRef` / candidate lookup — NOT the VPDF route id); :599-604 `handleSemanticDraft` -> `apiClient.semanticDraft(canCandidateId)`; button testid `vpdf-semantic-draft`, error testid `vpdf-semantic-draft-error` (server error verbatim, affordance kept).
- wave2 test asserts `semanticDraftMock` called with `CAN-w28-demo` and `NOT` the VPDF id; after the pass lands the same render shows the MEANT editor (data state, no URL fork).
- Server codes (unchanged, endpoint pre-merged): SEMANTIC_PASS_UNAVAILABLE 503 / INVALID_INPUT 400 / SEMANTIC_PASS_NO_CANDIDATE 404 / SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL 400 / SEMANTIC_PASS_STEP_COVERAGE 422 / else 502.

## HARD-STOP DIFF-EMPTY PROOFS

- `git diff --name-only HEAD -- server/ schema/` -> EMPTY (0 lines). All schema YAML (incl. rung-vocabulary.ui.yaml, protocol.schema.yaml, extraction-draft.*) byte-untouched.
- Goldens: `git diff --name-only HEAD -- server/src/compiler/scientistIntent/goldens/` -> 0 files. MANIFEST.yaml sha256 = `873e13432ef6dc3e32e22ba47e69a7a66c0737e39e67fccb8ba63851fbca39a3` — matches the pinned `873e1343` prefix; git blob 58c447eb unchanged.
- candidateToProtocolPayload.ts + test: 0 diff lines. protocolEditOps.ts: 0. ChangesPanel: untouched. BranchQuestionsPanel.tsx: 0. App.tsx: 0. ProtocolReviewHostPage.tsx: 0 (no change needed). ProtocolLocalizationThread.test.tsx (existing): 0.
- client.ts: diff is exactly the sanctioned method block (verified via `git diff HEAD -- app/src/shared/api/client.ts`).
- M6/OQ4: no rung badges — `grep rung` in the new components matches only the comment stating rung badges are absent (banned re-mint respected).
- No scratch committed (app/scratch/ does not exist).

## DIFF --NAME-ONLY (tracked modifications)

```
app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx   (+82 family axes)
app/src/ingestion/VendorPdfReviewPage.css                                 (+73 W2-8 pane styles)
app/src/ingestion/VendorPdfReviewPage.tsx                                 (repoint, -303/+211 net)
app/src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx           (1-line stale-pin alignment)
app/src/shared/api/client.ts                                              (+5 sanctioned method)
```
New files:
```
app/src/ingestion/protocol-review/semanticDraft.ts            (MEANT data layer: M2 join, save discipline)
app/src/ingestion/protocol-review/semanticDraft.test.ts
app/src/ingestion/protocol-review/SaidFactsPane.tsx           (read-only SAID facts + page anchors)
app/src/ingestion/protocol-review/SaidFactsPane.test.tsx
app/src/ingestion/protocol-review/SemanticDraftPanel.tsx      (MEANT editor: TapTab + evidence chips + save)
app/src/ingestion/protocol-review/SemanticDraftPanel.test.tsx
app/src/ingestion/VendorPdfReviewPage.wave2.test.tsx          (T1)
app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.familyAxes.test.tsx  (T4)
```

## NOTES / UNRESOLVED

- W5 (app/e2e/w28-said-meant-surface.spec.mjs browser gate spec) is NOT written here: this dispatch is HEADLESS (no :5193/:3093 interaction); the gate belongs to cl-browser-reviewer after merge per the dispatch block. §6.2 flow is ready to run against a stack the orchestrator starts.
- The 34-file app fail-set is pre-existing lane-base debt (stale pins/env issues in unrelated surfaces); this item added zero failures and fixed one (BQP).
- Model is 3-bit quantized: every edit was re-verified by typecheck + targeted vitest; no unverified edit was trusted.
