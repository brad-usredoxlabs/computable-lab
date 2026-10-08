# PB-CH-5fix cycle-1 report — pin the analysis_proposal union member against drift

Lane 2 / worktree `/mnt/vast/home/brad/git/wt/PB-CH-5fix-lane2-l2t1355`
Branch `pbch5fix-lane2-l2t1355`, prior HEAD `04a47d40`, base `d3c73f00`.
Defect: adversarial review `/home/brad/.hermes/cl/lanes/2/reviews/review-PB-CH-5fix-adversarial-l2t1435.md`, Defect [1] (minor).

## Defect restated

`app/src/types/ai.ts` (comment at :139-140) claims "the pin test keeps the
unions from drifting", but `app/src/types/aiStreamTypes.pin.test.ts` pinned
only `workstate_proposal` and `agent_action` — `grep -n analysis_proposal
src/types/aiStreamTypes.pin.test.ts` on HEAD 04a47d40 returned NO MATCH. The
new member was the only union member with no drift protection.

## Fix chosen (reviewer's preferred option)

ADD the pin assertions (not delete the comment — the pin is the real
protection, and with it the comment becomes true). One new `it` block in the
pin test's two-way section, `app/src/types/aiStreamTypes.pin.test.ts:59-75`:

1. `export interface AiAnalysisProposalEvent { type: 'analysis_proposal';
   analysis: Record<string, unknown> }` verbatim-shape regex on `aiTypesSrc`.
2. `\|\s*AiAnalysisProposalEvent` — the member is actually IN the
   `AiStreamEvent` union (same style as the existing
   `\|\s*AiWorkstateProposalEvent` / `\|\s*AiAgentActionEvent` pins).
3. `\| \{ type: 'analysis_proposal'; analysis: Record<string, unknown> \}` on
   `assistSrc` — the wire-shape authority side of the two-way pin
   (assistStream.ts:259). Note: the reviewer's literal suggestion also listed
   this inline regex against `aiTypesSrc`; that assertion is structurally
   vacuous there — types/ai.ts declares members as named interfaces
   (`| AiAnalysisProposalEvent`), never inline object literals (verified:
   `git show HEAD:app/src/types/ai.ts` union block lists only named
   interfaces; the existing workstate/agent_action pins use the same
   interface+union-member pattern). The interface regex + union-member regex
   together pin the generic side exactly as strongly as the inline regex pins
   the assist side. Mutation runs 2-3 below prove both bite.

NO source files touched. NO ai.ts comment edit needed (the claim is now
backed). Diff vs HEAD: `app/src/types/aiStreamTypes.pin.test.ts | 18 ++++`,
1 file changed.

## RED first (transcript: `.hermes/plans/PB-CH-5fix-red-transcript.wip-l2t1355-fix1.txt`)

Mutation-based RED (the honest RED for a drift-guard gap: show the OLD test
passes despite drift, and the NEW assertions fail on the same drift):

- Section 0: defect evidence — `grep -n analysis_proposal` on the PRE-FIX
  (HEAD 04a47d40) pin test → grep exit 1, NO MATCH.
- Section 1: OLD pin test vs ai.ts with `  | AiAnalysisProposalEvent` removed
  from the union → **5 passed** (old test blind to the drift):
  `✓ src/types/aiStreamTypes.pin.test.ts (5 tests) 2ms / Test Files 1 passed (1) / Tests 5 passed (5)`
- Section 2: NEW assertions vs the same mutation → FAIL for the right reason:
  `FAIL ... > the analysis_proposal member (PB-CH-5) is pinned two-way too — no drift on the newest member`
  `AssertionError: expected '...' to match /\|\s*AiAnalysisProposalEvent/` (Tests 1 failed | 5 passed)
- Section 3: NEW assertions vs ai.ts with the whole `export interface
  AiAnalysisProposalEvent {...}` block removed → FAIL:
  `AssertionError: expected '...' to match /export interface AiAnalysisProposalEv…/` (Tests 1 failed | 5 passed)
- Section 4: NEW assertions vs assistStream.ts with the inline
  `| { type: 'analysis_proposal'; analysis: Record<string, unknown> }` member
  removed → FAIL:
  `AssertionError: expected '...' to match /\| \{ type: 'analysis_proposal'; analys…/` (Tests 1 failed | 5 passed)
- After each mutation the source was restored via
  `git -c core.fileMode=false checkout -- <file>`; final
  `git status --porcelain -uno` shows ONLY `M app/src/types/aiStreamTypes.pin.test.ts`.

## GREEN (transcript: `.hermes/plans/PB-CH-5fix-green-transcript.wip-l2t1355-fix1.txt`)

`cd <wt>/app && npx vitest run src/types/aiStreamTypes.pin.test.ts src/shared/hooks/useAiChat.analysisProposal.test.tsx src/analysis/AnalysisChatPanel.analysisProposal.test.tsx`

```
 ✓ src/types/aiStreamTypes.pin.test.ts  (6 tests) 4ms
 ✓ src/shared/hooks/useAiChat.analysisProposal.test.tsx  (3 tests) 168ms
 ✓ src/analysis/AnalysisChatPanel.analysisProposal.test.tsx  (1 test) 51ms

 Test Files  3 passed (3)
      Tests  10 passed (10)
```

(pin test now 6 tests — was 5.)

## Gate — app tsc unchanged vs captured baseline

`npm run typecheck -w app` → `.hermes/plans/PB-CH-5fix-tsc-final.wip-l2t1355-fix1.txt`:
```
final error lines: 34
baseline error lines: 34
comm -3 (must be empty):
comm done
distinct files final: 24
```
comm -3 of position-normalized error-line sets vs
`.hermes/plans/PB-CH-5fix-tsc-baseline.wip-l2t1355.txt` is EMPTY → zero new
tsc errors (34 lines / 24 files, identical to the prior run's baseline and final).

## Gate — scope

- `git -c core.fileMode=false diff --stat HEAD -- app/` → only
  `app/src/types/aiStreamTypes.pin.test.ts` (+18).
- `git -c core.fileMode=false diff --stat d3c73f00...HEAD -- server/` → EMPTY
  (server diff vs base remains empty; no server file touched this cycle).
- No ai.ts / useAiChat.ts / AnalysisChatPanel.tsx / assistStream.ts change
  this cycle (mutations were reverted before commit; verified by status).
- `git -c core.fileMode=false` used for all git commands. node_modules
  symlinks untouched. No :3093/:5193 contact. No push.

## Commit

`b84e564b965933c8ac7a3991b06e0dc749aab70e` on `pbch5fix-lane2-l2t1355` —
"fix(app): PB-CH-5fix cycle-1 — pin analysis_proposal union member against
drift in aiStreamTypes.pin.test.ts (lane2 l2t1355)" (5 files: the pin test +
this report + red/green/tsc-final captures).

## Status

Defect [1] fixed with the reviewer's preferred option (pin added, comment
kept and now backed by real assertions). Implementation complete; acceptance
pending orchestrator verification.

PB-CH-5FIX CYCLE-1 DONE
