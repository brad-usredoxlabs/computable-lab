# SPEC DRAFT — L2-INTENTID-REDRAFT-1 (lane 2, product) — l2t0810

Status: DRAFT for orchestrator review (cites verified first-hand against cl/integration-2 @
753899dd915692de6419ab5408656e12b77c53cc; all line numbers re-grepped at that tip).
Brad APPROVED as framed 2026-11-01 (decisions/L2-INTENTID-REDRAFT-1-approval-card.md:
"approve as is; INTENTID: FIX IT!!"). Acceptance shape = ruling Q-C verbatim-minimum
(decisions/TRUNKJOURNEYS-c2-cyclecap-l2t0005-ruling.md, "RULING Q-C").

## GOAL (one sentence)

Make the clarification ANSWER turn on the shorthand chat path identity-stable end-to-end —
the answer turn carries the SAME `intentId` as the pre-answer turn and no new card
re-offers the ANSWERED prompt — with zero behaviour change beyond identity stability and
the ANSWERFOLD-ROLEGAP never-guess contract fully intact.

## 1. ROOT-CAUSE-FIRST REQUIREMENT (explanation, not patch-first)

The report MUST first explain the drift with cites. The mechanism is TWO-STAGE, verified
on current trunk:

Stage A — identity is model-authored on every model turn. The contract the sampler is
given says `intentId: <short id>` with NO stability requirement
(shorthandChat.ts:1301 and :1334 — the contract-quote blocks; AgentOrchestrator.ts:561 and
:892 the tool-usage prose). On the canonical blob utterance each draw mints its own id
({plain, -a2-h6, -mixture}) — pre-answer drift is sampler variance, NOT a TS bug, and MUST
NOT be "fixed" by hardcoding an id in TS.

Stage B — THE DEFECT SITE: on an answer turn the fold arm
(AgentOrchestrator.ts:1388 `if (shorthandSurface && !deterministicOnly && clarificationAnswers
&& clarificationAnswers.length > 0)`) consumes the held intent
(`takeHeldShorthandIntent` :1389, one-shot consume at shorthandChat.ts:649-655). When
`folded` is null (fold-null, :1411-1416; the else arm :1557-1574) it RE-HOLDS (:1560) and
falls through to the model turn, where the held document + answers ride as grounded context
via `heldReextractionContext` (consumed AgentOrchestrator.ts:2005-2009 via a SECOND
`takeHeldShorthandIntent`; builder at shorthandChat.ts:1263-1279). That fallback prompt
demands "Re-emit the COMPLETE corrected shorthand document" and says "Keep every other
action unchanged" (shorthandChat.ts:1274) — it pins actions but says NOTHING about
`intentId`. The model re-emits a fresh document with a FRESH intentId; that model-written
yaml becomes the answer turn's result shorthand (`shorthandYaml` bound at
AgentOrchestrator.ts:2862, handed to `shorthandResultFromCompile` at :3023-3028), which the
UI renders as a NEW `.chat-log-intent-card` (ChatLog.tsx:284-286) — the re-announced intent
card with a DIFFERENT intentId that J2 grades
(wt/L2-TRUNK-JOURNEYS-1-lane2 harness: run-journeys.py:187-195 `answer_intent_id_same`
compares ids[0] vs ids[-1] captured from the cards by ui-drive.cjs:372-378).

The re-announce of the ANSWERED prompt (observed reask_new_cards=1) is the SAME arm: the
fallback hands the whole document back to the sampler, whose re-derived bars can re-ask
what was just answered. Contributing site, verified: the re-extract recompile call
(AgentOrchestrator.ts:2959 `compileShorthandDeterministically(shorthandDoc, …)`) passes
reuseBindings + priorLabState but NOT `answeredClarificationLabels`/`scientistAnswers` —
exactly ruling rider R1 (ANSWERFOLD-ROLEGAP-jurisdiction-l2t0115.md R1) and unlike the 422
route (IntentCompileFromPromptHandlers.ts:440-460) and the fold arm
(AgentOrchestrator.ts:1444-1450). By contrast the fold-SUCCESS arm preserves identity: the
fold re-serializes `intentId: doc.intentId` verbatim (shorthandChat.ts:1069-1074) and the
fold result carries `folded.yaml` (AgentOrchestrator.ts:1538-1544). So identity churn
localizes to the extraction-only fallback arm.

The report must ALSO explain, from run evidence (fold-null arm log lines,
AgentOrchestrator.ts:1573), WHY the fold goes null on the blob draws (which card the
sampler offers first, which requestId fails the 1:1 join — fold null contract
shorthandChat.ts:968ff), since that sets the fallback's trigger rate. Explaining ≠
eliminating the fallback: it stays permitted (OQ1).

## 2. FIX CONTRACT (binding)

- SAME intentId end-to-end: on an answer turn (any arm — fold, reading-recompile, or the
  permitted extraction-only fallback) the ANSWER turn's result shorthand carries the held
  document's intentId. Candidate shapes (coder picks, justified in the report):
  (a) the fallback prompt explicitly demands the held `intentId` be kept (prompt TEXT =
      model contract, the contract-quoting discipline precedent
      malformedShorthandRepairPrompt shorthandChat.ts:1290-1312); and/or
  (b) a deterministic identity-carry at the ai/ seam on the fallback answer turn ONLY:
      if the re-emitted document's intentId differs, the HELD identity wins (a REUSE of
      held identity, the reuseBindings discipline — never a mint, never a guess).
      If (b) is chosen it must NOT rewrite actions/unresolved — identity field only.
- No new card re-offers the ANSWERED prompt: the fallback recompile must see the answered
  labels as DATA (the `answeredClarificationLabelsFromBatch` + MIXROLE-1 guard precedent,
  shorthandChat.ts:828-843, AgentOrchestrator.ts:1446-1450) — closing R1 on the fallback
  arm — or an equivalent data-riding mechanism the report justifies.
- Never-guess intact (ANSWERFOLD-ROLEGAP-jurisdiction-l2t0115.md + events-clause
  l2t0130.md): NO reasons list in TS, NO new jurisdiction exception, fold machinery
  (`foldAnswersIntoShorthand` null contract) byte-identical, `foldNullArm` stays a
  byte-mirror of whatever the fold does, characterization "replay arm line reproduces
  exactly" test stays GREEN, out-of-remit survivors survive as honest holds.
- No behaviour change beyond identity stability: no event-shape, card-content, escalation
  (H4 loop ledger), or wire-channel changes; needs-clarification keeps `events: []`.
- No hardcoded policy in TS: no intentId literal, no reason literal, no utterance literal.

## 3. ACCEPTANCE CRITERIA (verbatim from task list, ruling Q-C)

(1) Root cause identified with a cite in the shorthand/compile fold path for WHERE the
answer turn's intent card identity is re-derived (or the answered prompt is re-announced)
— an explanation, not a patch-first. (2) Fix preserves the never-guess contract from
ANSWERFOLD-ROLEGAP (no reasons list in TS, no new jurisdiction exception): the answer turn
carries the SAME intentId end-to-end and no new card re-offers the ANSWERED prompt.
(3) LIVE-sampler J2 (no fake) GREEN 5/5 consecutive runs, receipts under the lane receipts
root — at which point the J2-live advisory flips to gate-worthy (orch retires the
carve-out — ORCHESTRATOR action, not the coder's). (4) Deterministic replay leg (fake
endpoint or arm-log replay) pinning intentId stability as a regression guard, independent
of the sampler.

## 4. PLACEMENT / SCOPE

Product code. Own worktree /mnt/vast/home/brad/git/wt/L2-INTENTID-REDRAFT-1-lane2, branch
`cl/lane2-intentid-redraft-1` off cl/integration-2 (753899dd). node_modules are SYMLINKS
to /mnt/vast/home/brad/git/computable-lab (verified) — NEVER install.

Owned files (rationale):
- server/src/ai/AgentOrchestrator.ts — the answer-turn arms: fallback identity carry,
  answeredClarificationLabels ride on the :2959 re-extract compile (fallback arm only).
- server/src/ai/shorthandChat.ts — `heldReextractionContext` prompt clause (+ any pure
  identity-carry helper beside it).
- server/src/ai/AgentOrchestrator.intentIdStability.test.ts — NEW deterministic pin (§5).

Explicitly OUT of scope:
- .hermes/plans/harness/l2-trunk-journeys/** — DO NOT TOUCH, not even one byte: TJ1
  fix-run-4 may run there concurrently (handoff 2026-11-01_0900 l2t0810 §2). Reading
  fake-inference.py / run-journeys.py for the live-leg invocation contract is fine;
  editing is not.
- app/src/** — the re-ask is a server-arm defect; do NOT "fix" shownPrompts dedup in
  ChatLog.tsx (that per-render dedup is pinned behavior).
- foldAnswersIntoShorthand / foldNullArm internals (byte-identical / byte-mirror),
  server/src/compiler/** (frozen pipeline), server/src/resolve/**, YAML policy files
  (ZERO policy changes), the trunk-journeys harness driver/check-gate.
- The trunk stack (:3093/:5193) and the task list (orchestrator-owned).

## 5. VERIFICATION

First targeted check (proves the approach early — do this BEFORE writing the fix):
  cd server && npx vitest run src/ai/AgentOrchestrator.readingCardAnswer.test.ts
Expected on base: PASS (baseline honest). Then write
AgentOrchestrator.intentIdStability.test.ts RED-FIRST: using the stubModel harness pattern
of AgentOrchestrator.readingCardAnswer.test.ts:89-120 (same CANONICAL_YAML-style blob doc,
mockStore), drive (i) a first turn that holds, (ii) an answer engineered to trip fold-null
(a requestId with no 1:1 carrier join → the :1557 fallback arm), (iii) the stub re-emits a
document with a DIFFERENT intentId. Assert RED-on-base: the answer-turn result's shorthand
must carry the HELD intentId, and no clarification prompt repeats the answered question.
The RED capture is criterion-1 evidence.

Deterministic replay leg (criterion 4): that same vitest file is the pin — a fake
endpoint à la the harness's fake-inference.py (wt/L2-TRUNK-JOURNEYS-1-lane2, READ-ONLY)
but INSIDE the product test suite (stub model, real spine, zero network), green post-fix,
sampler-independent.

Regression suite (expected PASS):
  cd server && npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts \
    src/ai/AgentOrchestrator.readingCardAnswer.test.ts src/ai/shorthandChat.nounShape.test.ts \
    src/api/handlers/IntentCompileFromPromptHandlers.answeredPrompt.test.ts \
    src/api/handlers/IntentCompileFromPromptHandlers.answeredBinding.test.ts \
    src/api/handlers/IntentCompileFromPromptHandlers.clarificationAnswers.test.ts
Typecheck: cd server && npx tsc --noEmit (repo has exactOptionalPropertyTypes,
server/tsconfig.json:13).

LIVE leg (criterion 3), AFTER deterministic green, executed-only from
/mnt/vast/home/brad/git/wt/L2-TRUNK-JOURNEYS-1-lane2/.hermes/plans/harness/l2-trunk-journeys/
run-journeys.py (J2, no fake, REAL sampler — zero edits and zero git ops in that tree).
The stack under test must serve THIS branch; coordinate the stack restart with the
orchestrator (stack is orchestrator-owned; see OQ-2). Receipts: 5 consecutive green runs
under /home/brad/.hermes/cl/receipts/L2-INTENTID-REDRAFT-1/<ts>/ (per-run J2 receipt +
run-meta naming the branch sha). Any red run = honest receipt, restart the 5-count.
The J2-live advisory carve-out retires at 5/5 — the ORCHESTRATOR retires it; the coder
just reports the receipts dir.

## 6. REVIEWER BAIT (pre-empt these)

- exactOptionalPropertyTypes: every new dep field rides CONDITIONAL SPREAD (absent, never
  undefined) — the answeredClarificationLabels precedent AgentOrchestrator.ts:1446-1450.
- YAML-reload traps: the fold re-serializes via stringifyYaml (shorthandChat.ts:1069-1074);
  any identity handling must NOT drop the conditional `sourcePrompt` spread there or
  reorder keys (byte-stability pins). If any change touches fold serialization AT ALL
  (it should not), foldNullArm must be updated as a byte-mirror or its characterization
  test goes RED.
- hold/take one-shot semantics: the hold is consumed by takeHeldShorthandIntent TWICE on
  the answer path (fold arm :1389 re-holds at :1560; message builder takes at :2005). An
  identity-carry must read the identity WITHOUT an extra consume — a second take()
  returns null and silently skips the carry.
- Never-guess: identity-carry is a REUSE of held identity, never a mint and never a
  guess about a NEW draft; scoped to the answer turn only, never to fresh turns (a fresh
  ask must stay free to mint — pin that with a test).
- The fallback arm itself is PERMITTED (OQ1) and must NOT be deleted or made to fold-null
  less often by weakening the fold's null contract; the 502/422 shapes of the
  IntentCompile routes are untouched.
- Log honesty (advc-c1 D2): the "folded deterministically" line fires only when a splice
  ran; any new identity-carry log must name its arm honestly.
- Don't chase the pre-answer draw-drift (§Stage A) into TS constants; the only acceptable
  pre-answer influence is prompt-contract text.
- H4 loop ledger + dropSatisfiedFacts ledger: untouched or pinned; no new escalation.

## 7. WORKER CONTRACT

Worktree/branch: §4. Deliverable: /mnt/vast/home/brad/git/wt/L2-INTENTID-REDRAFT-1-lane2/
deliverables/L2-INTENTID-REDRAFT-1-report.l2t0810.md (UNIQUE path; if retaken use
.report.fix2run-<tick>.md). Report contents: root-cause section (the §1 cites, each
re-verified at the coder's tip + the sha), RED-first capture (failing test output BEFORE
the fix), green evidence (all commands §5 with outputs), live J2 receipts paths, diff
stat. ANTI-CAP turn discipline: small turns; build the report APPEND-ONLY (write section,
then next); NEVER paste >80 lines of file/test output — excerpt ≤20 lines + file path of
the full capture; never paste the report back into chat.
End marker: `INTENTID DONE <full-40-char-sha>` on the branch tip, or
`INTENTID BLOCKED <reason>`. Do not merge; do not touch the task list; no npm install
(node_modules symlinks).

## OPEN QUESTIONS (for orchestrator)

OQ-1: Should the fix ALSO thread `scientistAnswers` (the §14.2 RECORD leg) onto the :2959
re-extract compile, or only `answeredClarificationLabels`? Checked: fold arm passes both
(:1444-1450); :2959 passes neither; labels-only closes the role-gap re-ask, the reading
bar re-settle needs the values map — but re-extract answers arrive as prose in the prompt,
so the values may be unrecoverable structurally. Spec scopes labels-only; escalate if the
fraction bar still re-asks live.
OQ-2: Live-leg stack ownership. J2's gate pins trunk ports :3093/:5193 (ruling Q-D N1
literal), and the shared trunk stack serves cl/integration-2, not the coder branch.
Checked: labstate-contents-drive/labstate-worktree-stack.sh exists as a worktree-stack
precedent, and TJ1's check-gate pins trunk ports. The coder must NOT restart the trunk
stack unilaterally — orchestrator must own the serve-your-branch window for the 5/5 runs
(or ratify a worktree-stack variant of the live leg).
OQ-3: Is the Stage-A pre-answer draw-drift itself acceptable post-fix (fix = answer-turn
stability only)? Checked: ruling Q-C's fix sentence reads "the answer turn must carry the
SAME intentId end-to-end as pre-answer" — consistent with drift-tolerant pre-answer; the
J2 assertion compares ids[0] vs ids[-1], so a drift-tolerant pre-answer passes only
because the card count per run stays ≥2 with the fold path carrying held identity. Flagging
in case Brad reads acceptance as "no pre-answer churn either" (that would require a
deterministic server-minted intentId — a design change, not this item).

## Amendment (orch, 2026-11-01T15:25 EDT) — leg B scope, record fix per advc-c2 O5
Leg B (dispatched per the leg-B task-block claim, 2026-11-01T14:40) edits
app/src/shared/api/aiClient.ts (event-editor JSON body gains `surface`). §4's
`app/src/**` exclusion predates leg B and applies to leg A's ChatLog/dedup
surface only; the aiClient change is transport wiring authorized by the task
block, not the forbidden dedup edit. Reviewer (advc leg-B c1) O5 confirmed the
mismatch is record-only, not a coder defect.
