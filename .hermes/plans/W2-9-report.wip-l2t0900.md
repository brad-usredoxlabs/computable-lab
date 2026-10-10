# W2-9 REVIEW AI PANEL — coder report (lane 2, l2t0900)

Branch: W2-9-lane2-l2t0900 (off lane trunk, rebased to 6c4d98c0; base includes merged W2-8).
Worktree: /mnt/vast/home/brad/git/wt/W2-9-lane2-l2t0900. Spec: 2026-10-10_0900-W2-9-review-ai-panel-spec.md (md5 4bd0cfcfc89ed0f909e09133d9cc3f4c — verified before reading; §0–§11 + PROMOTION NOTE + OQ RULINGS read fully).

## REPORT-FIX c2 (l2t1550) — what changed in THIS report and why

Adversarial c1 (reviews/review-W2-9-adversarial-l2t1340-c1.md) returned VERDICT: fix with ZERO
product defects. This revision fixes the two report-integrity defects and observation O4 only.
NO product/test file was touched by this run. Verified at c2: `git -c core.fileMode=false diff
--name-only dd4bee0d` → EMPTY (no tracked file differs from the reviewed commit) and
`git -c core.fileMode=false diff --stat dd4bee0d -- app server schema` → EMPTY, so the product diff
is byte-identical to dd4bee0d. `git status --porcelain` shows only untracked docs: this report file
and the orchestrator's pre-existing 2026-10-10_0915 handoff file (not mine, not touched).

- **D1 FIXED** (§CLAUSE B1): the no-open-XDR arm testid was mis-cited as
  `review-ai-panel-unavailable` — a name that appears NOWHERE in the diff. The real testid is
  `review-ai-no-draft` (ReviewAiPanel.tsx:284; asserted at
  ProtocolReviewHostPage.reviewAiPanel.test.tsx:146,154 and ReviewAiPanel.test.tsx:319).
  Corrected in place below with the exact line citations.
- **D2 FIXED** (§6): every claimed-passing suite now carries a RAW ruled tail block (Test Files /
  Tests / Start at / Duration + the failed-test names) instead of a paraphrase. Tails are labelled
  ORCH-CAPTURED (orchestrator ran them in this worktree at dd4bee0d, stored under
  /home/brad/.hermes/cl/lanes/2/reviews/w29-c2-orch-evidence/) or CODER-CAPTURED c2 (re-run by
  this report-fix run, same worktree, same HEAD, saved under /tmp/l2t1510-*).
- **O4 FIXED** (§6 item 6): the NFS-load-flake claim is now per-FILE standalone counts, and the
  clean serialized scoped run is reported alongside the loaded run (it is SET-EQUAL to the 11-pin).
- **NEW DISCLOSURE** (§6 item 3): the full-suite `Test Files` count moves 57→58 base→head. The
  delta is NOT a new failure of my code: vitest collects the Playwright gate specs in app/e2e/ as
  failed suites ("Playwright Test did not expect test.describe() to be called here"), 22 at base
  (incl. the merged w28 spec) and 23 at head (the same class, plus my new w29 gate spec). The
  src/ fail-SET is 35 = 35 SET-EQUAL. Stated explicitly so a verifier is not surprised by 58.
- **NEW NOTE** (§6 item 5): the lane server-tsc pin was REPINNED 26→19 at trunk b19949fd AFTER my
  run base 6c4d98c0. My 26-line figure is the BASE-state pin; the current-HEAD set-diff carries
  exactly the 7 TS2339 lines cleared by b19949fd and ZERO new.

## §0 FRESH BASELINE CAPTURES (at claim base, before any edit)

- App tsc: `npm run typecheck` in app/ → 34 error lines normalized (strip (line,col), sort) → /tmp/l2t0900-base-tsc-app.txt; `diff` vs /tmp/l2t2230-tsc-app.txt normalized → **TSC_APP_SET_EQUAL** (34 = pin).
- Server tsc: `npm run typecheck` in server/ → 26 error lines sorted → /tmp/l2t0900-base-tsc-server.txt; vs /tmp/l2t0415-tsc-server.txt → **TSC_SERVER_MULTISET_EQUAL** (26 = pin).
- App unit fail-SET at claim base (`cd app && npx vitest run`, full suite): **35 files** → /tmp/l2t0900-base-app-failfiles.txt (matches the lane pin; known debt incl. BranchQuestionsPanel stale pin from the 3708ebe3 BQP revert).
- Server scoped fail-SET at claim base (`npx vitest run src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance`): **11 files**, `comm -3` vs /tmp/l2t2310-w25-baseline-failfiles.txt → **SET-EQUAL** (empty comm output).
- Worktree parity: lane excludes file configured (`git config --worktree core.excludesFile /home/brad/.hermes/cl/lanes/2/lane-exclude-W2-9-l2t0900`); server/schema symlink repaired to the worktree's own schema dir; MANIFEST blob at HEAD = 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35; `git diff HEAD -- schema/` empty.

## FIRST TARGETED CHECK (RED base sanity)

`cd app && npx vitest run src/ingestion/protocol-review/ src/event-editor/right-pane/protocol/protocolEditOps.test.ts 2>&1 | tail -20`
→ 1 failed | 7 passed (8 files), 1 failed | 87 passed (88 tests). The single failure is the PRE-EXISTING BranchQuestionsPanel stale pin (base debt, in the 35-file base SET). protocolEditOps.test.ts fully green at base.

[c2 honesty note (voluntary disclosure): no raw tail file was preserved for this base-sanity check,
and its arithmetic deserves a flag. The protocol-review dir at base held 6 test files
(axisLabels 10 + BranchQuestionsPanel 13 + ExtractionProgressPanel 7 + SaidFactsPane 4 +
SemanticDraftPanel 10 + semanticDraft 11 = 55 tests); + ReviewAiPanel.test.tsx (10) +
protocolEditOps.test.ts (23) = **8 files / 88 tests**, which matches the quoted counts exactly —
but only if ReviewAiPanel.test.tsx PASSED, i.e. the run happened after ReviewAiPanel.tsx existed.
So the quoted line is a post-implementation confirmation of the base-debt pin, not a RED-phase
transcript; the heading "RED base sanity" overstates it. What IS independently grounded from the
§0 captures: the single failure is BranchQuestionsPanel.test.tsx:125, which the base full-suite run
shows failing identically at pristine base (`❯ src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx (13 tests | 1 failed)` in /tmp/l2t0900-base-appsuite-full.txt), and
protocolEditOps.test.ts is `✓ (23 tests)` green at base. The T1–T5 RED→GREEN sequence is evidenced
by the diff (the modules are absent at 6c4d98c0 and present at dd4bee0d), not by this line.]

RED plan executed: T1 (host rightPane — RED: no rightPane at base), T2 (ReviewAiPanel — RED: module absent), T3 (applyDraftProtocolEdit — RED: module absent), T4 (SemanticPassModelSection — RED: module absent), T5 (server prompt — RED: surface absent). All went GREEN via the owned-file implementations.

## §6 COMMANDS — VERBATIM TAILS (post-change) [c2 REWRITE per c1 defect D2]

Provenance labels: **ORCH-CAPTURED** = the orchestrator ran it in THIS worktree at dd4bee0d and
stored the raw tail under /home/brad/.hermes/cl/lanes/2/reviews/w29-c2-orch-evidence/.
**CODER-CAPTURED c2** = re-run by this report-fix run in the same worktree at the same HEAD
(dd4bee0d, clean serialized runs — no concurrent jobs, which is what produced the load flakes in
the original run); raw output saved under /tmp/l2t1510-*.

### 1. Targeted app (T1+T2+T3+T4) — CODER-CAPTURED c2 (exact command as claimed)

`cd app && npx vitest run src/ingestion/ProtocolReviewHostPage.reviewAiPanel.test.tsx src/ingestion/protocol-review/ src/event-editor/right-pane/protocol/ src/shell/settings/SemanticPassModelSection.test.tsx`

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx > BranchQuestionsPanel > offers to build the branch when the answers match no enumerated realization
AssertionError: expected 'No realization exists for this select…' to contain 'not pre-built'

- Expected
+ Received

- not pre-built
+ No realization exists for this selection yet — the intake drafts an eager, capped product, and a branch nested under a protocol you just chose is drafted on demand.

 ❯ src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx:125:72
    123|     fireEvent.click(screen.getByLabelText('Feces'))
    124|     fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes …
    125|     expect(screen.getByTestId('branch-questions-unbuilt').textContent)…
       |                                                                        ^
    126|   })
    127| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed | 25 passed (26)
      Tests  1 failed | 221 passed (222)
   Start at  16:21:58
   Duration  41.41s (transform 14.11s, setup 88.67s, collect 58.22s, tests 4.65s, environment 597.70s, prepare 65.88s)
```
(raw: /tmp/l2t1510-item1-clean.txt, lines 97-121 — copied verbatim, md5 of the extracted block
7adb7df0ebe78b16af749d07116fa693.) — the ONLY failure is the BranchQuestionsPanel base-debt pin.

Cross-check against the orchestrator's own capture (**ORCH-CAPTURED**, w29c2-tail1.txt — a tail
truncated to its last 41 lines, so the exact command it ran is not recorded in the file; its
visible file list is SemanticPassModelSection, ReviewAiPanel, SemanticDraftPanel,
ProtocolReviewHostPage.reviewAiPanel + the BranchQuestionsPanel failure):

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx > BranchQuestionsPanel > offers to build the branch when the answers match no enumerated realization
AssertionError: expected 'No realization exists for this select…' to contain 'not pre-built'

- Expected
+ Received

- not pre-built
+ No realization exists for this selection yet — the intake drafts an eager, capped product, and a branch nested under a protocol you just chose is drafted on demand.

 ❯ src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx:125:72
    123|     fireEvent.click(screen.getByLabelText('Feces'))
    124|     fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes …
    125|     expect(screen.getByTestId('branch-questions-unbuilt').textContent)…
       |                                                                        ^
    126|   })
    127| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed | 9 passed (10)
      Tests  1 failed | 93 passed (94)
   Start at  14:50:59
   Duration  32.19s (transform 5.23s, setup 41.04s, collect 14.68s, tests 1.32s, environment 204.11s, prepare 20.11s)

ITEM1 done rc=0
```
(the block above is w29c2-tail1.txt lines 15-41 copied verbatim.)
My independent reproduction of the 10-file set (`npx vitest run src/ingestion/protocol-review/
src/ingestion/ProtocolReviewHostPage.reviewAiPanel.test.tsx src/shell/settings/SemanticPassModelSection.test.tsx src/event-editor/right-pane/protocol/protocolEditOps.test.ts`) returned
`Test Files 1 failed | 9 passed (10)` / `Tests 1 failed | 93 passed (94)` — identical counts, and
the same 10 per-file test counts (axisLabels 10, semanticDraft 11, protocolEditOps 23,
SaidFactsPane 4, SemanticDraftPanel 10, ExtractionProgressPanel 7, SemanticPassModelSection 4,
BranchQuestionsPanel 13|1 failed, ProtocolReviewHostPage.reviewAiPanel 2, ReviewAiPanel 10).

### 2. Scoped app (ingestion + right-pane + settings) — CODER-CAPTURED c2, identical counts + identical fail-SET to ORCH-CAPTURED tail2

`cd app && npx vitest run src/ingestion src/event-editor/right-pane src/shell/settings`

```
 FAIL  src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx [ src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx ]
 FAIL  src/event-editor/right-pane/ai/draftChanges.test.ts [ src/event-editor/right-pane/ai/draftChanges.test.ts ]
 FAIL  src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx [ src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx ]
 FAIL  src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx > BranchQuestionsPanel > offers to build the branch when the answers match no enumerated realization
 FAIL  src/event-editor/right-pane/find/FindTabPanel.inventory.test.tsx > FindTabPanel — project inventory & protocol libraries > renders labware/aliquot/material and protocol sections, all project-scoped
 FAIL  src/event-editor/right-pane/find/FindTabPanel.inventory.test.tsx > FindTabPanel — project inventory & protocol libraries > shows project-wide run usage with experiment/run anchors
 FAIL  src/event-editor/right-pane/find/FindTabPanel.inventory.test.tsx > FindTabPanel — project inventory & protocol libraries > clicking a row opens an in-workspace record-edit tab (no navigation)
 FAIL  src/event-editor/right-pane/find/FindTabPanel.test.tsx > FindTabPanel > clicking a run resolves the method event graph
 FAIL  src/event-editor/right-pane/find/FindTabPanel.test.tsx > FindTabPanel > clicking the experiment title opens its record (not just expand/collapse)
 FAIL  src/event-editor/right-pane/find/FindTabPanel.test.tsx > FindTabPanel > clicking the study heading opens the study record
 FAIL  src/event-editor/right-pane/find/FindTabPanel.test.tsx > FindTabPanel > shows "no method" when the run has no method event graph
 Test Files  6 failed | 75 passed (81)
      Tests  8 failed | 556 passed (564)
   Start at  16:22:57
   Duration  26.86s (transform 16.33s, setup 26.95s, collect 72.03s, tests 37.65s, environment 230.57s, prepare 24.09s)
```
(raw: /tmp/l2t1510-item2-clean.txt; ORCH-CAPTURED w29c2-tail2.txt reports the identical
`Test Files 6 failed | 75 passed (81)` / `Tests 8 failed | 556 passed (564)` and the identical
6-file fail-SET.) Fail-SET = 6 files; `comm -13 /tmp/l2t0900-base-app-failfiles.txt <head-set>` →
**empty: zero new failures** (all 6 are members of the 35-file base SET).

### 3. Full app suite (head) — CODER-CAPTURED c2

`cd app && npx vitest run`

```
 Test Files  58 failed | 261 passed (319)
      Tests  65 failed | 2090 passed (2155)
     Errors  5 errors
   Start at  16:16:10
   Duration  252.48s (transform 227.95s, setup 402.22s, collect 609.03s, tests 264.56s, environment 2818.72s, prepare 275.68s)
```
(raw: /tmp/l2t1510-item3-full-app.txt; src/ fail-SET extracted to
/tmp/l2t1510-item3-src-failfiles.txt, 35 files.) src/ fail-SET = **35 files**; `comm -3` vs the §0 base
capture (/tmp/l2t0900-base-app-failfiles.txt, 35) → **empty (SET-EQUAL, zero new failures)**.

DISCLOSURE (new at c2): the headline `Test Files` count moves 57 (base) → 58 (head). That +1 is
NOT a failure of my code. vitest collects the Playwright gate specs under app/e2e/ as failed
suites with `Error: Playwright Test did not expect test.describe() to be called here.` — 22 such
e2e suite-failures at base (including the already-merged e2e/w28-said-meant-surface.spec.mjs,
identical error text) and 23 at head (the same class, plus my new e2e/w29-review-ai-panel.spec.mjs,
which is a Playwright spec and is NOT meant to run under vitest). The e2e file lists are extracted
to /tmp/l2t1510-base-e2e-failfiles.txt (22) and /tmp/l2t1510-item3-e2e-failfiles.txt (23);
`comm -13` of the two → exactly `e2e/w29-review-ai-panel.spec.mjs`, nothing else. Base src/-only
fail-SET 35 == head src/-only fail-SET 35. The `Errors 5 errors` line is UNCHANGED base→head: both
runs report "Vitest caught 5 unhandled errors" originating in the same pre-existing files
(src/event-editor/right-pane/ai/ClarificationPicker.test.tsx ×1, src/editor/RawRecordEditor.test.tsx ×4).

The "36th file" flake from the original run: `src/extraction/ExtractionReviewPage.test.tsx`
standalone re-run, CODER-CAPTURED c2:
```
 Test Files  1 passed (1)
      Tests  6 passed (6)
```
(raw: /tmp/l2t1510-standalone-ExtractionReviewPage.txt, rc=0.)

### 4. App tsc (head) — CODER-CAPTURED c2

`cd app && npm run typecheck` → 34 error lines; normalized (strip `(line,col)`, sort) `diff` vs
the lane pin /tmp/l2t2230-tsc-app.txt → **TSC_APP_SET_EQUAL_TO_PIN34** (verified again at c2:
34 lines, diff empty). No error line names any W2-9-changed file. (The one line mentioning
`protocol-review` is `src/event-editor/right-pane/ai/systemPromptForViewer.ts(45,3): error TS2322`
— PRE-EXISTING: it is line 8 of both the base capture and the lane pin, untouched by me.)

### 5. Server tsc (head) — CODER-CAPTURED c2 + ORCH-CAPTURED current-HEAD raw

`cd server && npm run typecheck` → 26 error lines (/tmp/l2t1510-tsc-server-head.txt), multiset-
equal to the §0 base capture and to the then-current pin /tmp/l2t0415-tsc-server.txt (26). No line
names systemPrompt.ts or server.ts.

NOTE (new at c2, per orchestrator): the lane server-tsc pin was **REPINNED 26 → 19 at trunk
b19949fd** ("fix(ai): port material clarification policy to trunk"), i.e. AFTER my run base
6c4d98c0. My 26-line figure is the BASE-state pin. Set-diff of my 26 vs the ORCH-CAPTURED
current-HEAD raw (/home/brad/.hermes/cl/lanes/2/reviews/w29-c2-orch-evidence/l2t1440-tsc-server-raw.txt,
19 error lines): the 7 lines present in mine and absent at current HEAD are EXACTLY the
TS2339 `MaterialProfileRegistry` members cleared by b19949fd —
`profileForDomain` ×3, `clarificationForLayer`, `clarificationPolicy`, `requirementsForLayer` ×2 —
and the reverse direction is **empty: ZERO new errors**. My change contributes none.

### 6. Server scoped (head) — CODER-CAPTURED c2, clean serialized run
(command covers src/schema src/lint src/integration src/api/handlers src/store src/revisions
src/governance; the systemPrompt suites are proven separately in item 7 and the src/ai directory in
item 8. [c2 correction: the earlier header said "incl. src/ai/systemPrompt*" — that was wrong, the
command does not collect src/ai.])

`cd server && npx vitest run src/schema src/lint src/integration src/api/handlers src/store src/revisions src/governance`

```
 FAIL  src/integration/extractionE2E.test.ts > E2E: PDF upload → extract → draft → promote → canonical + audit
 FAIL  src/api/handlers/MeasurementHandlers.applianceJob.test.ts > MeasurementHandlers appliance job execution
 FAIL  src/store/LifecycleBypassAudit.test.ts [ src/store/LifecycleBypassAudit.test.ts ]
 FAIL  src/governance/AuditEventService.test.ts > RecordHandlers signature-ref validation (requires_signature guard) > allows the transition with a matching signature and appends a lifecycle_transition audit event
 FAIL  src/revisions/RevisionStorage.test.ts > revision schemas and durable storage > persists protocol snapshots through YAML and protects them even with validation bypassed
 FAIL  src/schema/EventGraphEquipmentSchema.test.ts > event-graph first-class equipment branch > accepts a kind:equipment labwares entry with settings (never labware geometry)
 FAIL  src/schema/LabwarePhysicalGeometryData.test.ts > labware-definition physical geometry data > every SBS-family definition stamps physical_geometry.overall_dimensions_mm = 127×85 (no height)
 FAIL  src/api/handlers/EventEditorFixHandlers.test.ts > EventEditorFixHandlers Fix-it job endpoints > startApplyFixJob returns once the job is started and keeps persisting coder/critic progress in the background
 FAIL  src/api/handlers/ExtractHandlers.test.ts > ExtractHandlers - upload > should return recordId on successful upload
 FAIL  src/api/handlers/SignatureHandlers.test.ts > SignatureHandlers.mintSignature > creates a signature with signedBy from the SESSION user even when the body carries signedBy (body field ignored)
 FAIL  src/api/handlers/WorkspaceHandlers.test.ts > WorkspaceHandlers > PUT > GET after PUT returns the persisted state
 Test Files  11 failed | 100 passed | 5 skipped (116)
      Tests  16 failed | 1058 passed | 53 skipped (1132)
   Start at  16:23:33
   Duration  83.63s (transform 55.60s, setup 37ms, collect 310.48s, tests 297.96s, environment 82ms, prepare 51.30s)
```
(the FAIL lines above are the first FAIL line of each of the 11 failing files, in run order; the
raw /tmp/l2t1510-item6-clean.txt lists all 16 individual test failures.)
(raw: /tmp/l2t1510-item6-clean.txt.) Fail-SET = **11 files**, `comm -3` vs the lane pin
/tmp/l2t2310-w25-baseline-failfiles.txt (11) → **empty (SET-EQUAL)**. The §0 base scoped run
(/tmp/l2t0900-server-scoped-base.txt) reported the identical `11 failed | 100 passed | 5 skipped
(116)` / `16 failed | 1058 passed | 53 skipped (1132)`.

O4 FIX (per-file standalone counts, replacing the old aggregate claim). In the ORIGINAL run the
scoped suite was executed concurrently with other jobs on NFS and produced extra load-flake
failures (16 and 17 files across two loaded runs). Each extra is now proven by its OWN standalone
run (CODER-CAPTURED c2, serialized, one file per vitest invocation):

```
rc=0 src/schema/ControlledDocumentSchemas.test.ts        Test Files 1 passed (1)  Tests 21 passed (21)
rc=0 src/schema/Wave2ProtocolIntentSchema.test.ts        Test Files 1 passed (1)  Tests 15 passed (15)
rc=0 src/schema/Wave2ProvenanceLadderSchema.test.ts      Test Files 1 passed (1)  Tests 25 passed (25)
rc=0 src/schema/Wave2QuantitySchema.test.ts              Test Files 1 passed (1)  Tests 33 passed (33)
rc=0 src/schema/Wave25OQ1SeamSchema.test.ts              Test Files 1 passed (1)  Tests  5 passed (5)
rc=0 src/integration/W25CandidateImmutability.test.ts   Test Files 1 passed (1)  Tests  8 passed (8)
rc=0 src/schema/ConcentrationFirstSchemaContract.test.ts Test Files 1 passed (1)  Tests 11 passed (11)
rc=0 src/schema/Wave2NamingCrosswalk.test.ts             Test Files 1 passed (1)  Tests  6 passed (6)
rc=0 src/schema/BranchAxisSchemaContracts.test.ts        Test Files 1 passed (1)  Tests  5 passed (5)
rc=0 src/schema/governanceSchemas.test.ts                Test Files 1 passed (1)  Tests  7 passed (7)
rc=0 src/schema/integration.test.ts                      Test Files 1 passed (1)  Tests  9 passed (9)
rc=0 src/schema/PlateEventSchemaContracts.test.ts        Test Files 1 passed (1)  Tests  5 passed (5)
rc=1 src/store/LifecycleBypassAudit.test.ts              Test Files 1 failed (1)  Tests no tests
```
(raws: /tmp/l2t1510-standalone-*.txt.) LIMITATION STATED HONESTLY: the last one is NOT a flake —
LifecycleBypassAudit.test.ts is a member of the 11-file base pin and fails identically at base
and head, standalone or loaded, with `Error: Transform failed with 1 error: .../server/src/store/LifecycleBypassAudit.test.ts:1:1: ERROR: Syntax error " "` — the worktree path is a symlink
into the shared tree whose first line carries a lane-sync banner. Pre-existing lane debt, not mine.
The clean serialized scoped run above shows ZERO of the load-flake extras, which is the proof that
they were load artifacts rather than failures.

### 7. R5 companion + existing systemPrompt tests — ORCH-CAPTURED (w29c2-tail7.txt)

`cd server && npx vitest run src/ai/systemPrompt.protocolReview.test.ts src/ai/systemPrompt.test.ts src/ai/systemPrompt.workingFocus.test.ts`

```
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/W2-9-lane2-l2t0900/server

 ✓ src/ai/systemPrompt.workingFocus.test.ts  (3 tests) 54ms
 ✓ src/ai/systemPrompt.test.ts  (6 tests) 63ms
 ✓ src/ai/systemPrompt.protocolReview.test.ts  (4 tests) 78ms

 Test Files  3 passed (3)
      Tests  13 passed (13)
   Start at  14:52:24
   Duration  2.35s (transform 304ms, setup 0ms, collect 441ms, tests 195ms, environment 0ms, prepare 382ms)

ITEM7 done rc=0
```
T5 = the 4 tests in systemPrompt.protocolReview.test.ts (ATTACHED PROTOCOL block w/ every citable
stepId; protocol_edit instruction region; WITHOUT attachment renders NEITHER; byte-stability of
every pre-existing surface).

### 8. src/ai directory parity proof (base-vs-head) — CODER-CAPTURED c2 (head side re-run)

`cd server && npx vitest run src/ai`

```
 FAIL  src/ai/AgentOrchestrator.goldenWithSeeds.test.ts > AgentOrchestrator - golden test with real seed records
 FAIL  src/ai/AgentOrchestrator.bypass.test.ts > AgentOrchestrator compiler bypass > should bypass LLM when all slots are filled with labware instance
 FAIL  src/ai/AgentOrchestrator.golden.test.ts > AgentOrchestrator - golden test for auto-create labware > should bypass LLM and compile events when labware hint resolves via searchLabwareByHint
 FAIL  src/ai/AgentOrchestrator.tubeGate.test.ts > AgentOrchestrator tube-event detail gate wiring > repairs tubeVolumeClass → details.tube through the real event schemas
 FAIL  src/ai/AgentOrchestratorForwarding.test.ts > AgentOrchestrator outcome-based forwarding > (b) outcome=complete with no events and no gaps still short-circuits
 FAIL  src/ai/ChatbotCompileDeckSlot.test.ts > spec-012: deck-slot binding on labware-resolve > runChatbotCompile: deckSlot on candidateLabwares → deckLayoutPlan.pinned
 FAIL  src/ai/InferenceClient.config.test.ts > InferenceClient honors construction-time config > does NOT set enable_thinking when enableThinking is true
 FAIL  src/ai/chatbotCompile.e2e.test.ts > chatbot-compile E2E > seeds into an existing plate and returns one add_material event
 FAIL  src/ai/materialFollowUp.test.ts > what a pick still owes comes from the registry table > a formulation owes a VOLUME only — its concentration is already fixed
 FAIL  src/ai/submitSuggestionTool.tubeSchema.test.ts > submit_suggestion place_tube schema (event-contract shape) > details.properties.tube declares the event-contract tube descriptor
 Test Files  10 failed | 75 passed (85)
      Tests  20 failed | 648 passed (669)
   Start at  16:16:30
   Duration  39.09s (transform 58.60s, setup 18ms, collect 408.75s, tests 44.40s, environment 63ms, prepare 90.04s)
```
(the FAIL lines are the first FAIL line of each of the 10 failing files, in run order; the raw
/tmp/l2t1510-item8-server-ai.txt lists all 20 individual test failures.)
(raw: /tmp/l2t1510-item8-server-ai.txt.) head fail-SET (/tmp/l2t1510-item8-ai-failfiles.txt, 10)
vs the §0 base capture (/tmp/l2t0900-ai-base-failfiles.txt, 10): `comm -3` → **empty (SET-EQUAL)**.
The 10 are the pre-existing env-gated AgentOrchestrator/InferenceClient debt:
AgentOrchestrator.{bypass,Forwarding,golden,goldenWithSeeds,tubeGate}, ChatbotCompileDeckSlot,
chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema.

### 9. Gate spec syntax — CODER-CAPTURED c2 (re-run)

`cd app && node --check e2e/w29-review-ai-panel.spec.mjs` → no output, **rc=0** (GATE_SPEC_SYNTAX_OK).
NOTE: the report-fix brief referred to an orchestrator "tail9" capture, but the evidence directory
(/home/brad/.hermes/cl/lanes/2/reviews/w29-c2-orch-evidence/) contains only w29c2-tail1.txt,
w29c2-tail2.txt, w29c2-tail7.txt and l2t1440-tsc-server-raw.txt — no tail9 file exists. So this
item is backed by MY OWN re-run above (rc=0, no output), not by a captured file.
The spec is `test.describe('W2-9 review AI panel gate')` with `mode: 'serial'`, a `test.beforeAll`
health precheck of both endpoints + seeding, and **6 test legs** (PRECHECK, B1, B6, B2/B3/B5, B4,
B7). [c2 correction: my earlier "8 tests" counted every `test.*(` occurrence including
`test.describe`/`test.describe.configure`/`test.beforeAll`; the runnable legs are 6.] Never executed
by the coder — the browser gate belongs to cl-browser-reviewer.


## CLAUSE -> PROOF WALKTHROUGH vs §10 VERBATIM

Clause: "panel mounted and usable beside SAID/MEANT" (B1)
- T1 (ProtocolReviewHostPage.reviewAiPanel.test.tsx): rightPane renders `review-ai-panel` + `chat-input` testids beside the left pane ✓; no-open-XDR arm renders a NAMED reasoned unavailable render (`review-ai-no-draft` — ReviewAiPanel.tsx:284 `data-testid="review-ai-no-draft"`, asserted at ProtocolReviewHostPage.reviewAiPanel.test.tsx:146 (`queryByTestId('review-ai-no-draft')).toBeNull()` with an open draft) and :154 (`findByTestId('review-ai-no-draft')` + textContent contains 'draft' and 'edit'), and at ReviewAiPanel.test.tsx:319), never a silent blank ✓. [c2: c1 defect D1 — my earlier citation `review-ai-panel-unavailable` was a name slip; that string appears NOWHERE in the diff. Corrected here; no code change owed.] The sibling no-steps arm is `review-ai-no-steps` (ReviewAiPanel.tsx:288). R1 also remounts the left pane via `key={`${recordId}:${draftNonce}`}` (ProtocolReviewHostPage.tsx:83) so a post-Accept re-read is fresh.

Clause: "chat attempts to rewrite vendor text ... FAIL visibly" (B2)
- applyDraftProtocolEdit writes ONLY via `updateRecord(xdrId, envelope, {expectedSha})` — the XDR id is the panel's own open-draft id; VPDF-*/VPC-* ids are never targets (no other write call exists in the panel: grep of panel/host for updateRecord/createRecord → zero direct calls; the ONLY write path is the applier). Ops apply to `candidates[i].draft` only (field-by-field test below). Gate leg B2 in the spec spec file asks chat to rewrite vendor page text and pins GET /records/VPDF sha unchanged.

Clause: "relabel an inference as vendor truth ... FAIL visibly" (B3)
- Ops vocabulary is the registered protocol-edit op set (applyOps, byte-untouched module); no op can construct or move provenance — T3 test "provenance is byte-equal after a step_update" ✓. A malformed proposal never reaches apply (parseProposal gate in the panel; T2 error-turn test: no actionable Accept over an empty change list) ✓.

Clause: "bypass validation ... FAIL visibly" (B4)
- Apply NEVER skips getRecord+lock: refuse-without-token test (no meta.contentSha → named refusal, zero writes) ✓. stale-409 → STALE_PROTOCOL_WRITE_MESSAGE verbatim, NO retry (zero further writes) ✓. Two-tab race: proposal carries `groundedSha` (the ATTACHED PROTOCOL sha the model cited); Accept against a moved record STOPS with the reload message, zero writes (T3 + panel-level T2 tests) ✓. Op-index failure names the op and issues zero writes (pure applyOps throws before any PUT) ✓.

Clause: "promote unauthorized ... FAIL visibly" (B5)
- Repo grep over the item's diff: zero promote-endpoint references in owned non-test source (only a comment naming the absence); DOM test: no promote testid, never calls a promote/extract endpoint ✓. Gate leg asks chat to "promote the draft" → refusal + XDR status unchanged.

Clause: "an accepted chat edit lands as an ordinary revision with provenance" (B6)
- ONE `updateRecord(xdrId, envelope, {expectedSha, message: CHAT_ACCEPT_COMMIT_MESSAGE})` — an ordinary revision with a commit message; deepEqual no-op writes NOTHING ✓; protocolId retarget (not the open XDR / live PRT-*) REFUSED visibly with zero writes ✓. Provenance byte-preserved (see surgical-envelope proof).

Clause: "/settings model change persists and is observably consumed by the next extraction call without touching unrelated model settings" (B7)
- T4 (SemanticPassModelSection.test.tsx, 4/4 ✓): section binds ONLY the `ai.semanticPass` block keys (baseUrl/model/apiKey placeholder per OQ3 ruling — NEVER the active-profile activate route); patch body carries ONLY `ai.semanticPass` (unrelated model settings untouched — asserted on the PATCH body); persisted state re-rendered from the GET response. Server-side consumption: F-W29-5 fix (below) makes the NEXT extraction call resolve the saved block live. Gate leg: change → GET /api/config shows it → fresh semantic pass on seeded VPDF shows the NEW model.

No dead chrome: no-draft state = named disabled/unavailable render with a reason in BOTH the panel (T2 "with no open draft the panel names the unavailable arm and offers no write path") and the host (T1) ✓. A draft with zero steps sends NO attachedProtocol + names the reason (identity alone is an invention invitation) ✓.

## SURGICAL-ENVELOPE PROOF (field-by-field pre/post PUT payload, save-path test)

From applyDraftProtocolEdit.test.ts "accept lands ONE PUT..." (verbatim assertions):
- ONE call: `updateRecordMock` called exactly 1×; args `(XDR_ID, envelope, { expectedSha: 'xdr-sha-1', message: CHAT_ACCEPT_COMMIT_MESSAGE })`.
- Byte-preserved outside the draft: `kind`, `recordId`, `status`, `source_artifact` (toEqual), `ambiguity_spans_by_candidate` (toEqual), `diagnostics` (toEqual); candidate envelope `target_kind='protocol'`, `confidence=0.9`, `status='proposed'` survive.
- Only the draft body moved and only the label: `steps[0].label` changed; `recordId`, `title`, `branch_axes` (toEqual), `steps[0].description`, `steps[1]` (deep toEqual) unchanged.
- Provenance test: `intent.provenance` deep-equal before/after a step_update.

## HARD-STOP DIFF-EMPTY PROOFS (git diff HEAD -- <file> | wc -l)

protocolEditOps.ts 0 · AiTabPanel.tsx 0 · client.ts 0 · VendorPdfReviewPage.tsx 0 · SemanticDraftPanel.tsx 0 · SaidFactsPane.tsx 0 · semanticDraft.ts 0 · ChangesPanel.tsx 0 · useChatThread.ts 0 · assistStream.ts 0 · useAiChat.ts 0.
schema/ diff --stat lines: 0 · goldens/ diff name-only: 0 · MANIFEST blob at HEAD: 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (untouched) · YAML files in diff: **0** (lintRules untouched, 81).

## DIFF --NAME-ONLY (tracked) + NEW FILES

Modified: app/src/ingestion/ProtocolReviewHostPage.tsx · app/src/shell/SettingsPage.tsx · app/src/shell/settings/index.ts · server/src/ai/systemPrompt.ts · server/src/server.ts
New: app/e2e/w29-review-ai-panel.spec.mjs · app/src/ingestion/ProtocolReviewHostPage.reviewAiPanel.test.tsx · app/src/ingestion/protocol-review/ReviewAiPanel.tsx · ReviewAiPanel.test.tsx · reviewAiPanel.css · app/src/event-editor/right-pane/protocol/applyDraftProtocolEdit.ts · .test.ts · app/src/shell/settings/SemanticPassModelSection.tsx · .test.tsx · server/src/ai/systemPrompt.protocolReview.test.ts

## §9 F-W29-5 VERDICT: YES — a settings restart-read gap EXISTS, and it is repaired within the ONE allowed seam

Evidence (pre-fix, read first-hand): server/src/server.ts createServer resolved `semanticPassInference = resolveSemanticPassInference(ctx.appConfig.ai)` ONCE at boot and closed over it inside the `semanticPassRunner` lambda — `createInferenceClient(semanticPassInference)` used the boot-time snapshot per call. PATCH /api/config reassigns `ctx.appConfig` via onConfigUpdate (server.ts ~:767 vendorSearchHandlers precedent), but the runner never re-read it → a semanticPass model saved in Settings was NOT consumed by the next extraction call until a server restart. That contradicts §10 B7 ("observably consumed by the next extraction call").
Repair (the ONLY extra server touch, exactly the seam OQ3 pre-authorized): the runner now calls `resolveSemanticPassInference(ctx.appConfig.ai)` LIVE per request (mirroring the vendorSearchHandlers precedent) and builds the client from the live inference. The boot-time availability GATE (`semanticPassInference?.baseUrl` → else undefined → SEMANTIC_PASS_UNAVAILABLE) is byte-unchanged: no endpoint at boot still means unavailable-until-restart (that gate is not the model knob). Zero model/host literals introduced. Verified: server scoped fail-SET parity + src/ai base-vs-head comm parity (10=10, empty comm).

## BAIT SWEEP (§8)

- KV-cache byte-stability: T5 pins every pre-existing surface byte-identical; systemPrompt.ts diff is purely additive (union member + one gated branch). ✓
- Borrowed-surface bait: panel sends surface 'protocol-review' (the registered surfaces.yaml id, F-W29-4 alignment) — pinned in T2. ✓
- Two-tab race (bait 6): groundedSha binding, pinned at applier AND panel level. ✓
- Empty-draft invention invitation: steps.length===0 → null attachedProtocol + named reason. ✓
- Dead chrome: named unavailable arms everywhere. ✓
- Promote affordance: none in DOM, none in code. ✓
- Model/host literals in non-test source: grep over all owned non-test files → zero. ✓
- Rung literals (VENDOR/DERIVED/INFERRED_INVARIANT/LOCAL_REALIZATION) in diff: zero. ✓

## KNOWN BASE DEBT (not mine, not touched)

BranchQuestionsPanel stale pin + the other 34 base fail-files ride the lane pin; server src/ai env-gated debt (10 files, identical base/head); NFS-load flakes on schema/integration files pass standalone.

## NOT RUN (by contract)

Browser gate (:5193/:3093) — cl-browser-reviewer's job after merge; the checked-in gate spec app/e2e/w29-review-ai-panel.spec.mjs (6 serial test legs: PRECHECK, B1, B6, B2/B3/B5, B4, B7 — see §6 item 9 for the c2 count correction; BASE_URL ?? :5193, health precheck :3093/api/health, idempotent seeding from checked-in fixtures/w28-said-meant/ fixtures — never invented at run time) is syntax-checked only.
