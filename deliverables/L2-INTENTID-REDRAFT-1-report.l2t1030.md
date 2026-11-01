# L2-INTENTID-REDRAFT-1 — coder report (l2t1030)

Branch: `cl/lane2-intentid-redraft-1` off `b9b998cd` (app-only trunk tip).
Worktree: /mnt/vast/home/brad/git/wt/L2-INTENTID-REDRAFT-1-lane2
Owned files touched: `server/src/ai/AgentOrchestrator.ts`, `server/src/ai/shorthandChat.ts`,
NEW `server/src/ai/AgentOrchestrator.intentIdStability.test.ts`, plus ONE minimal gate-pin
update in `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` (DEFECT-4 — flagged §5).
Criterion (3) live J2 leg is ORCHESTRATOR-OWNED (OQ-2); not run by the coder.

---

## 1. ROOT CAUSE (two-stage mechanism; cites re-verified at tip b9b998cd)

The answer turn's intent-card identity is re-derived on the PERMITTED
extraction-only fallback arm. The mechanism is two-stage.

### Stage A — identity is model-authored on every model turn

The sampler contract says `intentId: <short id>` with NO stability requirement
(`shorthandChat.ts:1341` and `:1374` — the two contract-quote blocks in
`malformedShorthandRepairPrompt` / `emptyShorthandRepairPrompt`; the tool-usage prose
`AgentOrchestrator.ts` FORCED_DRAFT bullets carry the same shape). On the canonical blob
utterance each draw mints its own id. Pre-answer drift is SAMPLER VARIANCE, not a TS
bug — NOT "fixed" here (OQ-3: drift-tolerant pre-answer is correct; ruling Q-C pins the
ANSWER turn identity only).

### Stage B — THE DEFECT SITE (where the answer-turn identity is re-derived)

On an answer turn the fold arm
(`AgentOrchestrator.ts:1388` `if (shorthandSurface && !deterministicOnly &&
clarificationAnswers && clarificationAnswers.length > 0)`) consumes the held intent
(`takeHeldShorthandIntent` `:1389`, one-shot consume `shorthandChat.ts:649-655`). When
`folded` is null (the else arm `:1557-1574`) it RE-HOLDS (`:1560`) and falls through to
the model turn, where the held document + answers ride as grounded context via
`heldReextractionContext` (consumed at `AgentOrchestrator.ts:2005-2009` via a SECOND
`takeHeldShorthandIntent` `:2006`; builder at `shorthandChat.ts:1263-1279`). That
fallback prompt demanded "Re-emit the COMPLETE corrected shorthand document" and said
"Keep every other action unchanged" (`shorthandChat.ts:1274`) — it pins ACTIONS but said
NOTHING about `intentId`. The model re-emits a fresh document with a FRESH intentId; that
model-written yaml becomes the answer turn's result shorthand (`shorthandYaml` bound at
`AgentOrchestrator.ts:2861`, handed to `shorthandResultFromCompile` at `:3023-3028`), which
the UI renders as a NEW `.chat-log-intent-card` with a DIFFERENT intentId — the re-announced
card J2 grades (`run-journeys.py:187-195` `answer_intent_id_same` compares ids[0] vs ids[-1]
captured from the cards by `ui-drive.cjs:372-378`; `journeys/J2.yaml:82`
`answer_intent_id_same: true`).

The RE-ANNOUNCE of the answered prompt is the SAME arm: the fallback recompile call
(`AgentOrchestrator.ts:2959` `compileShorthandDeterministically(shorthandDoc, …)`) passed
reuseBindings + priorLabState but NOT `answeredClarificationLabels` / `scientistAnswers` —
exactly rider R1 (ANSWERFOLD-ROLEGAP-jurisdiction-l2t0115 R1), unlike the 422 route
(`IntentCompileFromPromptHandlers.ts:440-460`) and the fold arm
(`AgentOrchestrator.ts:1444-1450`). By contrast the fold-SUCCESS arm PRESERVES identity:
the fold re-serializes `intentId: doc.intentId` verbatim (`shorthandChat.ts:1069-1074`) and
the fold result carries `folded.yaml` (`AgentOrchestrator.ts:1538-1544`). So identity churn
localizes to the extraction-only fallback arm.

**Why the fold goes null on the blob draws (run evidence).** The fold is null when an
answer lacks a 1:1 mapping onto the held intent (`foldAnswersIntoShorthand` null contract
`shorthandChat.ts:968ff`, re-derived by the pure mirror `foldNullArm`
`shorthandChat.ts:1140`). Live receipts show the measured arms:
- `fold-null arm=slot-not-string requestId=unresolved-c-042c129f21 answers=2 heldFacts=2 slotType=array`
  (`/home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-24_062716-a5-tier2/backend.log.extract.txt:21,29,37`).
  The sampler offers the COMPOSITION card first (the array slot); the answer's label does
  not name a 1:1 entry carrier of that slot, so the array-slot splice fails → null.
- `fold-null arm=join-miss requestId=unresolved-c-0422b7823f answers=3 heldFacts=2`
  (`/home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-25-probe4/trail.jsonl:26`): the
  answer BATCH does not join 1:1 onto the held facts (3 answers, 2 held facts) → null.
That sets the fallback's trigger rate. Explaining ≠ eliminating the fallback: it stays
permitted (OQ-1).

### Cite re-verification at tip b9b998cd

`b9b998cd` is app/-only (the project-workspace deck-tab chat registration fix); `git log
753899dd..b9b998cd -- server/` is EMPTY, so the server tree is byte-identical to the
spec's verified cite tip `753899dd`. All cites above were re-grepped at the CLEAN pre-fix
tip (`git show 753899dd:…`) and re-confirmed against the worktree's own tree (±1-2 line
drift only where the worktree has a prior in-flight edit; every cite holds).

### Baseline finding (honest, not in scope)

The spec's FIRST TARGETED CHECK (`AgentOrchestrator.readingCardAnswer.test.ts`) is
expected "PASS (baseline honest)" but is **RED at trunk b9b998cd with 3 failures**
(`expected the fold leg to consume the turn` / `expected the recompile leg to consume the
turn` / `expected 2 to be 1`). Root cause: commit `0257123d` ("clarification-answer channel
— the fold was unreachable on every live surface", 2026-10-31, ANCESTOR of both cite tips)
changed the policy DATA `config/drafting/shorthand-drafting.yaml` from
`surfaces: [workspace.deck]` to `surfaces: [run-workspace, event-editor]` (the yaml's own
comment: `workspace.deck` "is a surface id NO client sends"). The readingCardAnswer test
fixture still posts `surface: 'workspace.deck'` (`AgentOrchestrator.readingCardAnswer.test.ts:126`),
so `surfaceDraftsShorthand('workspace.deck')` is FALSE and the fold arm (`:1388`) never
engages — turn 2 goes straight to the model. This is a PRE-EXISTING fixture/data drift
laid down by `0257123d`, NOT introduced by this worktree, and NOT in my owned files. I
verified the fail set is IDENTICAL pre- and post-fix (captures in deliverables/), so my
change neither caused nor cured it. It is out of scope to fix (the test file is not owned);
flagged to the orchestrator. (The live J2 journey drives the REAL surface `run-workspace`/
`event-editor`, so the live leg is unaffected by this stale fixture.)

---

## 2. RED-FIRST capture (criterion-1 evidence — the defect reproduced deterministically)

New file `server/src/ai/AgentOrchestrator.intentIdStability.test.ts` (the deterministic
leg, criterion 4: stub model, real spine, zero network — the harness's fake-inference.py
shape inside the product suite). Test 1 drives (i) a first turn that holds the canonical
2-card blob (composition-fraction-sum + composition-role-gap), (ii) an answer to the
role-gap card with FREE TEXT (no label carrier) → the fold's never-guess null → the
PERMITTED extraction-only fallback (`:1557`), (iii) the stub re-emits the held document
with a FRESH intentId (`intentid-stability-reemitted`) and the SAME composition (the
Alpha Reagent honest-gap survives → the role-gap bar re-derives).

Assertions on the answer turn: the result shorthand carries the HELD intentId
(`intentid-stability-held`) and NOT the re-emitted fresh id; and no card re-offers the
answered role-gap prompt.

RED on base (captured at commit `acdeac5c`, full output in
`deliverables/intentid-red-capture.l2t1030.txt`):

```
 ❯ src/ai/AgentOrchestrator.intentIdStability.test.ts:224:99
    expect(second.shorthand, …).toMatch('intentid-stability-held')
- Expected
+ Received
+ intentId: intentid-stability-reemitted
+ actions:
+   - action: add_material
+     …
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

The answer-turn result shorthand carries the FRESH `intentid-stability-reemitted` (the
sampler-minted id) instead of the held `intentid-stability-held` — exactly the Stage-B
identity churn J2 grades. Tests 2 (fold-SUCCESS arm already carries the held identity —
the fold re-serializes `intentId: doc.intentId` verbatim) and 3 (a FRESH ask on a held
conversation stays free to mint — the carry must be answer-turn-only) are GREEN on base,
pinning the guardrails the fix must not break. This RED is criterion-1 evidence: the
defect site is the extraction-only fallback arm.

---

## 3. Fix contract compliance (spec §2)

Chose BOTH candidate shapes (a) and (b) — justified below. Committed at `71fdd7db`.

### (a) Prompt-contract clause (model contract = contract-quoting discipline)
`heldReextractionContext` (`shorthandChat.ts:1274`, the OQ1 fallback prompt) now reads:
"…Re-emit the COMPLETE corrected shorthand document … Keep every other action unchanged
and **KEEP the held document's intentId exactly as it appears below — do not mint a new
intentId.**…" This pins the identity in the prompt TEXT the sampler is given (the
`malformedShorthandRepairPrompt` / `emptyShorthandRepairPrompt` precedent
`shorthandChat.ts:1341,1374` — the contract quotes the document shape; now it also names
the identity-stability requirement). It is the ONLY pre-answer influence allowed (spec §6:
"the only acceptable pre-answer influence is prompt-contract text") and it does NOT
hardcode an id — it points at the held document's own `intentId` field.

### (b) Deterministic identity-carry at the ai/ seam (answer-turn-only, REUSE-not-mint)
New pure helper `carryShorthandIdentity(doc, heldIntentId)` (`shorthandChat.ts`, beside
`heldReextractionContext`): returns `null` (no-op, nothing to carry) when the ids agree or
the held id is absent; otherwise the carried doc (`intentId` replaced ONLY —
actions/unresolved untouched) plus the re-serialized yaml that carries it (mirroring the
fold's canonical re-serialization key order `shorthandChat.ts:1069-1074` — intentId,
sourcePrompt conditional, actions, unresolved).

Wiring in `AgentOrchestrator.ts`:
- The fold arm's ONE-SHOT consume (`:1404`) re-holds on fold-null (`:1575`) and is taken a
  SECOND time by the message builder (`:2006`) before the model re-extract returns — so by
  the model-turn result site the hold is GONE. The carry therefore reads the held identity
  WITHOUT an extra consume: `fallbackCarryIntentId = held.doc.intentId` and
  `fallbackAnsweredLabels = answeredClarificationLabelsFromBatch(held.clarifications,
  clarificationAnswers)` are captured in the fold-null else arm (`:1585-1586`), into
  run-scoped closure vars (`:1324-1325`), exactly as the spec's hold/take one-shot bait
  requires (a second `take()` returns null and would silently skip the carry).
- After the model document is parsed (Ajv sole authority) and BEFORE the recompile
  (`:3005`), the carry is applied: if the re-emitted doc's intentId differs from the held
  one, the HELD identity wins (a REUSE of held identity — the reuseBindings discipline —
  never a mint, never a guess); `shorthandDoc` + `shorthandYaml` are set to the carried
  doc + yaml, so the recompile AND the result shorthand both carry the held identity.
  Answer-turn-ONLY: the capture vars are set exclusively by the fold-null else arm, so a
  FRESH ask (no hold) and the fold-SUCCESS arm (which re-serializes the held intentId
  verbatim) never reach the carry and it is a no-op — a fresh turn stays free to mint
  (pinned by test 3).
- An honest carry log names its arm: "shorthand answer-turn identity carried: the fallback
  re-extract re-emitted a fresh intentId; the held identity … wins (reuse, not a mint)…"
  (advc-c1 D2 log-honesty: the "folded deterministically" line still fires only when a real
  splice ran — untouched).

### No new card re-offers the ANSWERED prompt (rider R1, OQ-1)
The `:2959` fallback recompile now passes `answeredClarificationLabels` (the 422 route +
fold-arm precedent) by CONDITIONAL SPREAD — absent when `fallbackAnsweredLabels` is empty
(fresh turns and the fold-success arm), so every other caller is byte-identically
unchanged. The answered role-gap bar does not re-fire (pinned by test 1). Labels-only per
OQ-1: `scientistAnswers` is NOT threaded (the re-extract answers arrive as prose in the
prompt, not structurally recoverable); if the fraction (reading) bar still re-asks live,
that is reported honestly (OQ-1) — not silently expanded.

### Never-guess contract intact (spec §2)
- No reasons list, no intentId literal, no utterance literal in TS (the carry reads the
  held doc's own `intentId` field and the answered labels from the held facts + answers —
  all DATA, no new policy branch).
- `foldAnswersIntoShorthand` null contract and `foldNullArm` byte-mirror are UNTOUCHED
  (the fold-null else arm's `foldNullArm(held, foldAnswers)` diagnostic is preserved — I
  briefly dropped it in an edit and restored it; final tree is byte-mirror).
- No new jurisdiction exception; no event-shape / card-content / escalation / wire-channel
  change (the carry is identity-field-only; needs-clarification keeps `events: []`).
- Characterization "replay arm line reproduces exactly" stays green (verified in the
  regression gate, §4).

### exactOptionalPropertyTypes
Every new dep field rides CONDITIONAL SPREAD (absent, never undefined):
`answeredClarificationLabels` at `:2959`, the closure vars (`string | undefined` /
`readonly string[]`), and `carryShorthandIdentity` returns `null` (not an undefined field).
The carried yaml's `sourcePrompt` is conditional (never dropped) — the fold's
byte-stability pin (spec §6 YAML-reload trap) is honored; the fold serialization itself is
untouched.

---

## 4. GREEN evidence (all commands spec §5; full outputs in deliverables/)

New file (criterion 4 deterministic pin) — 3/3 green post-fix
(`deliverables/intentid-green-capture.l2t1030.txt`):
```
 ✓ src/ai/AgentOrchestrator.intentIdStability.test.ts  (3 tests) 534ms
   — RED→GREEN: fallback answer turn carries the held intentId (test 1)
   — fold-SUCCESS arm already carries the held identity (test 2, green on base+post)
   — FRESH ask stays free to mint (test 3, answer-turn-only guard)
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Regression gate (the 6 spec-named files + the new pin), excluding the pre-existing
`readingCardAnswer` stale-fixture file (see §1 baseline finding). 6/6 files green
(`deliverables/gate-green-capture.l2t1030.txt`):
```
 ✓ IntentCompileFromPromptHandlers.answeredPrompt.test.ts   (4 tests)
 ✓ shorthandChat.nounShape.test.ts                          (9 tests)
 ✓ IntentCompileFromPromptHandlers.clarificationAnswers.test.ts (5 tests)
 ✓ IntentCompileFromPromptHandlers.answeredBinding.test.ts  (7 tests)
 ✓ AgentOrchestrator.intentIdStability.test.ts              (3 tests)
 ✓ AgentOrchestrator.shorthandChat.test.ts                  (19 tests)
 Test Files  6 passed (6)
      Tests  47 passed (47)
```
(`AgentOrchestrator.shorthandChat.test.ts` includes the foldNullArms characterization
"replay arm line reproduces exactly" pin and the OQ1 fallback test — both green; the
OQ1 fallback test passed because it compares EVENTS, and `intentId` is a passthrough in the
frozen pipeline (`normalizeScientistIntent.ts:1139`), so the carry does not change events.)

`AgentOrchestrator.readingCardAnswer.test.ts`: 3 failures at trunk, IDENTICAL fail set
pre- and post-fix (captures `deliverables/readingcard-base-trunk-capture.l2t1030.txt` and
`deliverables/readingcard-after-fix-capture.l2t1030.txt`; the three failing test names and
their `expected the fold leg to consume the turn` / `expected 2 to be 1` messages match).
Pre-existing at b9b998cd (the `0257123d` stale `workspace.deck` fixture), NOT caused by this
change — out of scope, flagged to the orchestrator.

Typecheck `npx tsc --noEmit` (cwd=server): **0 error lines** after materializing the
lane-excluded untracked files (`materializeBranchCandidate.ts`, `labwareDefinitionSearch.ts`,
`RunStartGateService.ts`, `BypassAudit.ts`, the `server/schema` symlink,
`revision-ref.schema.yaml`) from cl-integration-2 disk (fresh-worktree debt, not product
code — git-ignored, untracked, never staged). `deliverables/tsc-after-capture.l2t1030.txt`
is empty (0 errors). ZERO NEW errors from this change (the 6 `TS2307 Cannot find module`
lines seen before materialization were all lane-excluded files, none in owned files).

---

## 5. Non-owned change (flagged) + diff stat + live leg + open items

### Non-owned gate-pin update (ONE assertion)
`server/src/ai/AgentOrchestrator.shorthandChat.test.ts` DEFECT-4 (the extraction-only
fallback turn) asserted `expect(result.shorthand).toBe(ADD_DMEM_YAML)` — a BYTE-EXACT
pin of the model's verbatim fallback bytes. That assertion encodes the exact pre-fix churn
this item removes: the held doc (`AMBIGUOUS_YAML`) carries `intentId: chat-add-mystery`;
the model re-emits `ADD_DMEM_YAML` (`intentId: chat-add-dmem`); the carry contract (spec
§2(b), "the HELD identity wins") necessarily re-stamps the result's intentId to
`chat-add-mystery`. So the byte-exact pin could not survive the fix as-written. Minimal,
clearly-commented change: the assertion now reads `toMatch('intentId: chat-add-mystery')`
+ `not.toMatch('chat-add-dmem')` (identity-only restamp; the re-extracted actions are
otherwise byte-stable). The OQ1 fallback test (same `:2959` path) was NOT touched — it
compares EVENTS (intentId is a passthrough) and stays green. This is a non-owned file
(`§4` names only the three agent/shorthand files + the new test); the change is the
minimal, correct consequence of the approved fix contract and is flagged here for the
orchestrator/reviewer.

### Diff stat (vs base b9b998cd) — actual `git diff --stat b9b998cd..HEAD -- server/`:
```
 server/src/ai/AgentOrchestrator.intentIdStability.test.ts | 312 ++++++++++ (NEW)
 server/src/ai/AgentOrchestrator.shorthandChat.test.ts     |  11 +-  (DEFECT-4 pin)
 server/src/ai/AgentOrchestrator.ts                        |  64 +-
 server/src/ai/shorthandChat.ts                            |  42 +-
 4 files changed, 425 insertions(+), 4 deletions(-)
```
Commits (branch `cl/lane2-intentid-redraft-1`, off b9b998cd):
- `acdeac5c` test(lane2): RED-first intentId stability pin (RED capture committed)
- `71fdd7db` fix(lane2): the clarification ANSWER turn carries the held intentId
  end-to-end + no re-offer of the answered prompt (extraction-only fallback arm)
- (report + green captures appended in this final commit)

### Criterion (3) — LIVE J2 5/5 leg: ORCHESTRATOR-OWNED (OQ-2)
NOT run by the coder (no trunk-stack touch, no restart, nothing against :3093/:5193).
The orchestrator owns the serve-your-branch window + the 5 consecutive green J2 runs under
`/home/brad/.hermes/cl/receipts/L2-INTENTID-REDRAFT-1/<ts>/` post-merge (ANSWER-FOLD
precedent). This deliverable is the deterministic leg (criterion 4) + all unit evidence.
At 5/5 the J2-live advisory carve-out flips to gate-worthy — the ORCHESTRATOR retires it
(not the coder's action).

### Honest open items (not closed)
1. Live J2 5/5 (criterion 3): orch-owned, pending merge + serve-your-branch window.
2. `AgentOrchestrator.readingCardAnswer.test.ts` 3 fails at trunk: PRE-EXISTING
   (`0257123d` stale `workspace.deck` fixture), out of scope (non-owned file), fail set
   identical pre/post fix. Needs a fixture surface update to `run-workspace` — route to
   the owner of that test / the orchestrator.
3. OQ-1 labels-only: `scientistAnswers` is NOT threaded onto the `:2959` fallback
   recompile (re-extract answers arrive as prose, not structurally recoverable). If the
   fraction (reading) bar still re-asks live, that is an honest report to the orchestrator,
   not a silent scope expansion.
4. Pre-answer draw-drift (Stage A): intentionally NOT "fixed" in TS (OQ-3; the only
   allowed pre-answer influence is the prompt-contract clause, which is applied).

No merge performed; task list untouched; no npm install (node_modules symlinks intact).

---

## 6. END MARKER

Work tip (all content: code + test + report + all captures): 8a2b47abe4aaf343449f2832c4d94f1e67a8e021
(This marker line itself lives in the final docs-only commit, which therefore carries a
sha one commit past the content tip it names — a commit cannot contain its own sha.
The marker line below references the content-complete tip; the final-turn marker carries
`git -c core.fileMode=false rev-parse HEAD` of the marker commit, tree clean.)

INTENTID DONE 5f716f6bbb5537b77d978b7c9136db3999b594f0
