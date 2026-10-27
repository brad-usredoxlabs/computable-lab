# L2-FREEFORM-1F — thin spec (orch-authored, 2026-10-27T02:15 EDT)

AUTHORITY: the architect decision IS the spec basis and is binding verbatim:
/home/brad/.hermes/cl/lanes/2/decisions/SUITEA-D1-decklayout-trichotomy-l2t0055.md
(ARCH-RULING (i), predicate, arm order, WHERE, OWNER, RED-SHAPE sections).

## Goal
Add the 'action-delivered' arm to server/src/ai/honestOutcome.ts exactly as the decision
rules, converge the SUITE-A harness byte-mirror, extend the parity pin, and make the one
data edit that lets SUITE-A's P1 verdict expectation admit the honest outcome.

## Files IN (exact — anything else is a scope violation)
- server/src/ai/honestOutcome.ts — HonestOutcomeInput gains `deckLayout?: unknown`
  (exactOptionalPropertyTypes: optional = absent OR value, never undefined);
  classifyHonestOutcome gains the arm with the decision's STRUCTURAL predicate
  (non-null object AND platformId non-empty string AND variantId non-empty string);
  arm order events-bound > honest-failure > action-delivered > cards; header amended with
  the zero-vocabulary note extended (no manifest lookup, no literals) + a DRIFT COMMENT
  naming draftArgDiagnostics.ts draftProducedNothingOnServer's deckLayout term
  ("if the 7-channel guard changes, this arm must change — pins will trip").
- server/src/ai/honestOutcome.test.ts (or its actual test file) — fixtures (a)-(e) stay
  BYTE-IDENTICAL; add (f) {success:true, deckLayout:{platformId:'manual',
  variantId:'manual_freeform'}} -> 'action-delivered' (pre-arm RED captured: THROW with
  channel dump); add (g) deckLayout:{} and {platformId:'',variantId:''} variants -> THROW
  both feeds pre- AND post-arm (anti-ghost pins).
- .hermes/plans/harness/l2-suite-a/lib/verdict.py — byte-mirror updated in the SAME
  commit to carry the arm (mirror contract: same expressions, same order).
- server/src/ai/L2SuiteA.honestOutcome.parity.test.ts — expected column extended for the
  new fixtures (deckLayout shapes flow through both feeds); 16 existing pins unchanged.
- .hermes/plans/harness/l2-suite-a/expectations/P1.json — verdict_in gains
  'action-delivered' (data edit, sanctioned kind). NO other expectation file.

## Files OUT (instant reject)
app/** (everything), any YAML under schema/ or config/, run-suite-a.py logic,
draftArgDiagnostics.ts, draftEmptiness.ts, AgentOrchestrator.ts, the replay-verdict tree,
any manifest/registry lookup added to the helper.

## RED-FIRST
Capture the pre-arm RED for fixture (f) (helper throws 'silent shape' — reproduces the P1
receipt defect verbatim) to /home/brad/.hermes/cl/lanes/2/freeform1f-RED-l2t0155.txt
BEFORE implementing; raw vitest tail, never retyped.

## Environment
Worktree (yours): /mnt/vast/home/brad/git/wt/L2-FREEFORM-1F-lane2-l2t0155, branch
cl/lane2-freeform-1f-l2t0155 off trunk cl/integration-2 tip aa8f7468. NEVER touch
/mnt/vast/home/brad/git/computable-lab, cl-integration-2 (orch trunk), :3001/:5174,
:3093/:5193 (orch's stack — never start/stop/restart). ALWAYS `git -c core.fileMode=false`.

## Gates before 'STATUS: complete' (real outputs in the report)
1. RED file exists with the pre-arm throw.
2. Helper vitest GREEN (all fixtures incl. new f/g), cwd=server.
3. Parity pin GREEN extended (npx vitest run src/ai/L2SuiteA.honestOutcome.parity.test.ts).
4. Mirror convergence: verdict.py sha CHANGES (state new sha); selfcheck
   `python3 .hermes/plans/harness/l2-suite-a/test-channel-selfcheck.py` still rc 0.
5. Server tsc --noEmit 0 errors.
6. Purity: `git -c core.fileMode=false diff --name-only aa8f7468...HEAD` == the 5 IN files.
7. ONE commit 'feat(lane2): L2-FREEFORM-1F action-delivered arm in honestOutcome (D-1)'.
Report: APPEND to /home/brad/.hermes/cl/lanes/2/deliverables/L2-SUITE-A-report.l2t2255.md
a section '## L2-FREEFORM-1F (D-1 fix-run)' ending 'STATUS: complete'. End final line:
FREEFORM1F DONE <sha>.

## Assumptions to record
Any consequential judgment call (fixture field ordering, drift-comment wording, extra
(g)-variant selection) goes in the report's assumptions block.
