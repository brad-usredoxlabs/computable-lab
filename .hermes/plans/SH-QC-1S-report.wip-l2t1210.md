# SH-QC-1S coder report — server half of the repeat-prompt echo defect (lane 2, l2t1210)

Worktree: /mnt/vast/home/brad/git/wt/SH-QC-1S-lane2-l2t1210
Branch: cl/SH-QC-1S-lane2-l2t1210 (off trunk 468dcb9e)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-16_1215-SH-QC-1S-repeat-prompt-echo-compliance-spec.md
Decision: /home/brad/.hermes/cl/lanes/2/decisions/SHQC1-server-payload-decision-l2t1115.md (D1-D4)

## 0. What was built (R1 + R2, one task)

R1 — DATA-declared per-surface forced-tool compliance policy replaces the
`if(surface==='sequences')` gate (AgentOrchestrator.ts:2075 at trunk):

- NEW DATA file `config/drafting/forced-tool-compliance.yaml` (sibling — the
  spec's coder's-choice option; cleaner since sequences is not a shorthand
  surface). Per-surface entries declare `maxRetries` (1), `retryStatus` (the
  user-visible line) and `nudge` (verbatim model text). The sequences nudge
  moved BYTE-IDENTICAL from the pinned TS literal (HARNESS-SEQ-2 wording,
  never reworded — P6 pins it). The workspace.deck nudge carries (a) the
  agent_intent demand, (b) the anti-claim clause verbatim ("Do not claim to
  have saved or changed anything; no action has executed."), (c) the
  fresh-request rule ("A repeated request with no clarification answers is a
  NEW drafting request; answering with your prior summary is not a drafting
  action."). A `coerceAntiEcho:` clause rides inside buildForcedDraftJsonPrompt
  (the coerce slow path, :2112 call site) so the second call stops
  pattern-completing on the echo.
- NEW loader `server/src/ai/forcedToolCompliance.ts` (the shorthandDrafting.ts
  precedent: loaded PER call, never process-cached; absent file/section/entry
  => null => silent-off; present-but-malformed throws naming the path).
- AgentOrchestrator.ts: gate is now
  `forcedToolComplianceEntry(compliancePolicy, surfaceName)` — membership from
  DATA, zero surface literals (P5 greps the source for the literal). The
  honest compliance-failure return is generalized and surface-neutral (names
  model + tool + attempt count + "Nothing was saved"; no "sequence" wording on
  other surfaces). `sequenceRepairAttempts` renamed
  `forcedToolComplianceAttempts` (:1771 site; the sequence-action validation
  repair arm at :2419 keeps trunk semantics — same shared counter, same <2
  budget).
- Test seam: `AgentConfig.forcedToolCompliancePolicyPath` (server/src/config/
  types.ts) so tests point at fixture copies; production default is the
  shipped file.

R2 — structural echo guard at the prose-routing site (:2194-2195 at trunk):
`finalProse` routes to notes ONLY when it is NOT a whitespace-collapsed copy of
the immediately preceding assistant turn in `historyMessages` (read-only
compare; history rendering untouched). An echo routes to the ERROR channel
(:2237+ shape) with a server-log line, never notes. A GENUINE distinct refusal
prose still routes to notes (W2-9 DEFECT-2 survives — honestRefusal suite
green + P4b).

## 1. RED-first evidence

RED pass 1 (trunk source; P1 pinned TODAY's wrong shape and PASSED):
`Tests 8 failed | 1 passed (9)` — the passing P1 leg proves the captured wrong
shape `success:false, notes:[<echo>], usage.toolCalls:0` (the defect on record).

RED pass 2 (trunk source; P1 flipped to the REQUIRED shape — the artifact raw
/tmp/shqc1s-RED-vitest.raw): `Tests 8 failed | 1 passed (9)`
- P1 `expected [ Array(1) ] to be undefined` — the echo turn returns
  `notes:[<echo>]` (the notes-echo laundering, decision D1 §D).
- P2 `expected 1 to be 2` — NO retry arm on workspace.deck (the surface gate).
- P3 `expected 'undefined' to contain 'agent_intent'` — no honest
  compliance-failure error; the turn ends in the notes-echo.
- P4 `expected [ Array(1) ] to be undefined` — the echo routes to notes on an
  unlisted surface too (no structural guard).
- P7 `expected '## Current Context…' to contain 'Do not claim to have saved…'`
  — the coerce slow-path prompt carried no anti-echo clause.
- P8 `expected [ Array(1) ] to be undefined` — same notes-echo on the held-intent leg.

GREEN (after the fix): same command -> `Tests 9 passed (9)`.

## 2. Bars (exact commands + outputs)

All vitest runs: `cd /mnt/vast/home/brad/git/wt/SH-QC-1S-lane2-l2t1210/server && npx vitest run <files>`.

### 2a. Named bar set (after fix)
`npx vitest run src/ai/AgentOrchestrator.shorthandChat.test.ts src/ai/AgentOrchestrator.test.ts src/ai/AgentOrchestrator.sequencesFocusGuard.test.ts src/ai/AgentOrchestrator.sequencesAgentAction.test.ts src/ai/AgentOrchestrator.honestRefusal.test.ts src/ai/workstateComposeRules.test.ts src/sequences/sequenceIntent.test.ts src/ai/AgentOrchestrator.repeatEcho.test.ts`
-> `Test Files 2 failed | 6 passed (8)` / `Tests 9 failed | 79 passed (88)`
  ✓ shorthandChat 19/19  ✓ AgentOrchestrator.test 11/11  ✓ honestRefusal 2/2
  ✓ workstateComposeRules 15/15  ✓ sequenceIntent (all green)  ✓ repeatEcho 9/9
  The 9 fails are the PRE-EXISTING sequences drift debt (6 in
  sequencesAgentAction.test.ts, 3 in sequencesFocusGuard.test.ts G2/G3/H2 —
  present at trunk 468dcb9e BEFORE any edit; baseline captured first thing in
  this run: `Tests 9 failed | 59 passed (68)` on the 6-file set).

### 2b. Zero-new proof (comm of FAIL lists, base vs after, same 7-file set)
Base run (my changes stashed, trunk source): `Tests 9 failed | 70 passed (79)`
After run: `Tests 9 failed | 79 passed (88)` (+9 = the new repeatEcho legs)
- fail-FILE comm (`grep -F "FAIL " | sed 's/ >.*//' | sort -u` then diff):
  EMPTY — identical sets {sequencesAgentAction.test.ts, sequencesFocusGuard.test.ts}.
- fail-TEST comm (sorted full FAIL lines): EMPTY.

### 2c. Orchestrator-adjacent sweep (regression fence)
`npx vitest run src/ai/shorthandChat.e2eStubHonesty.test.ts src/ai/AgentOrchestrator.draftProseSuppression.test.ts src/ai/AgentOrchestrator.protocolEditRecovery.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts src/ai/AgentOrchestrator.workspaceAction.test.ts src/ai/AgentOrchestrator.workstateProposal.test.ts src/ai/AgentOrchestrator.surfaceVocab.test.ts`
-> `Test Files 8 passed (8)` / `Tests 92 passed (92)` (raw: /tmp/shqc1s-after-sweep.raw)

### 2d. Full server suite (drift bookkeeping)
After: `npx vitest run` -> `Test Files 104 failed | 622 passed | 9 skipped (735)` / `Tests 152 failed | 5911 passed | 70 skipped (6310)`
Base (changes stashed): `Test Files 103 failed | 622 passed | 9 skipped (734)` / `Tests 151 failed | 5898 passed | 70 skipped (6301)`
Fail-file comm: after-only = {W25DraftLifecyclePromotion.test.ts, Qms6bSchemaDrift.test.ts}; base-only = {DraftCopyDerivedRefValidation.test.ts}. NONE of the three references AgentOrchestrator/compliance (grep: zero hits). All three PASS in isolation on the changed tree (`Test Files 3 passed (3)` / `Tests 18 passed (18)`) — load-timeout flappers (the known lane pattern), not implicated. No ai/ file differs between base and after.

### 2e. tsc sorted-set comparison (INSIDE this repaired worktree only)
- server: `cd server && npx tsc --noEmit` — base 1 error, after 1 error. The
  single error is the pre-existing `src/ai/AgentOrchestrator.ts(34x,18): error
  TS2339: Property 'id' does not exist on type 'ResolvedRecordTarget | …'`
  (trunk debt at :346; my import shifts it to :347). Sorted-set diff ignoring
  the line-number prefix: EMPTY. Raw counts identical (1 = 1).
- app: `cd app && npx tsc --noEmit` — base 23 errors, after 23 errors; sorted
  diff EMPTY (matches the known repaired-worktree app baseline 23).
- Test-file classes are never typechecked at trunk (server tsconfig excludes
  **/*.test.ts); the new test file was validated by vitest execution (9/9)
  and its LSP diagnostics are clean after the fix landed.

## 3. Data file shape (config/drafting/forced-tool-compliance.yaml)

```yaml
surfaces:
  - surface: sequences
    maxRetries: 1
    retryStatus: Requesting the structured sequence emission…
    nudge: >-   # byte-identical HARNESS-SEQ-2 wording (P6-pinned)
  - surface: workspace.deck
    maxRetries: 1
    retryStatus: Requesting the draft emission…
    nudge: >-   # agent_intent demand + anti-claim clause + fresh-request rule
coerceAntiEcho: >-   # rides inside buildForcedDraftJsonPrompt
```
Absent file/section/entry => null => NO retry (silent-off, disclosed).
Present-but-malformed => throw naming the path (P5 pins both with fixtures
`server/src/ai/fixtures/forced-tool-compliance-{off,swapped-nudge,malformed}.yaml`).

## 4. Must-not-change guards (each with its test cite)

- UI Cancel client semantics / propose-never-write / app files: `git status`
  shows ZERO app/ changes (diff touches only server/src/ai/AgentOrchestrator.ts,
  server/src/config/types.ts, the new loader, the YAML, tests/fixtures).
  Store tripwires (create/update/delete throw) in repeatEcho P8 + honestRefusal.
- The single forced tool (agent_intent terminal emission): shorthandChat
  "ONE forced tool" pin green (19/19).
- Fold arms (:1253-1328 takeHeld/fold) + re-extraction arm (:1737-1739):
  untouched — diff hunks are at :70, :816-834, :1019, :1217-1220, :1784,
  :2090-2128, :2142, :2225-2251, :2419-2420; none inside the fold arms.
  shorthandChat fold pins green ("folds deterministically… ZERO model calls",
  "OQ1 fallback", "SH-QA-1 fold-leg ledger"). D4 invariant (answer-turn iff
  clarificationAnswers present; no-answers turn = fresh request) pinned by
  repeatEcho P8: the no-answers echo turn ran extraction/drafting machinery
  (retry arm), and the answer turn folded with ZERO model calls.
- Retry arm never calls takeHeldShorthandIntent / never mutates heldIntents:
  repeatEcho P8 — a legitimate needs-clarification hold survives the echo turn
  byte-for-byte (yaml identity asserted) into the answer turn. (Note:
  takeHeldShorthandIntent is destructive by design — P8 restores the verified
  hold so the answer leg sees it; the compliance arm itself never pops.)
- Honesty suite builders: honestRefusal 2/2 green; repeatEcho P4b proves a
  GENUINE distinct refusal prose still routes to notes with no error event.
- Raw-history fidelity contract (AgentOrchestrator.test.ts:58 pin): 11/11
  green; history rendering (:1154-1162, :1725) untouched — R2 is a READ-ONLY
  compare at the routing site (stop-boundary 2 honored).
- Warm/real prefix parity (:1049-1098; workstateComposeRules.test.ts:229):
  15/15 green; deriveContextCacheKey untouched; NO history added to any cache
  key (architect-REJECTED shapes avoided).
- Sequences compliance parity: sequencesFocusGuard H1 + sequenceIntent
  prose_only legs green with the nudge moved to data (byte-identical, P6);
  fail-test comm EMPTY vs base.

## 5. Stop boundaries — none hit

1. Byte-identical sequences nudge in DATA: achievable (P6 asserts exact string
   equality; the YAML `>-` folded scalar reproduces the single-line literal).
2. R2 without touching historyMessages rendering: achieved (read-only compare).
3. No client/wire-protocol change: none made (server-only).
4. heldIntents NOT implicated: confirmed — the compliance arm never touches the
   held map (P8); architect's disjointness ruling stands.

## 6. Assumptions

- Sibling YAML file chosen over a section inside shorthand-drafting.yaml (the
  spec's coder's-choice; sequences is not a shorthand surface, and the loader
  stays one file per policy like reviewWriteWall.ts / shorthandDrafting.ts).
- The compliance policy is loaded once per run() (per-call, never process-
  cached) and read by both the retry arm and the coerce anti-echo clause.
- The sequence-action validation repair arm (:2419) shares the renamed counter
  exactly as trunk shared `sequenceRepairAttempts` (budget <2 preserved;
  sequenceIntent repair legs green).
- Full-suite 3-file drift (2a-d) is load-timeout flapping, proven by isolated
  green runs on the changed tree; not a lane-2 regression.
- Live F4 receipt on :3093 is the orchestrator's post-merge step (spec §RED
  "Secondary receipt"); this run used stub inference only and touched no stack.

## 7. Changed paths

- server/src/ai/AgentOrchestrator.ts (R1 gate + generalized honest return +
  counter rename + coerce anti-echo call sites + R2 echo guard)
- server/src/config/types.ts (AgentConfig.forcedToolCompliancePolicyPath seam)
- server/src/ai/forcedToolCompliance.ts (NEW loader)
- config/drafting/forced-tool-compliance.yaml (NEW DATA)
- server/src/ai/AgentOrchestrator.repeatEcho.test.ts (NEW, 9 pins)
- server/src/ai/fixtures/forced-tool-compliance-{off,swapped-nudge,malformed}.yaml (NEW fixtures)

SH-QC-1S DONE 82b792e9
