# PB-CH-5 residual repair — analysis_proposal branch on the generic chat stack (coder report)

Lane 2 / worktree `/mnt/vast/home/brad/git/wt/PB-CH-5fix-lane2-l2t1355`
Branch `pbch5fix-lane2-l2t1355`, base `d3c73f00` (merge-base verified:
`git merge-base HEAD d3c73f00` = `d3c73f007a8ae98f90d94c4c944ef7aaec1a983b`).
Spec: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-08_1355-PB-CH-5-analysis-proposal-branch-fix-spec.md`
Evidence: `/home/brad/.hermes/cl/lanes/2/decisions/PB-CH-5-analysis-proposal-drop-finding.md`

## What was wrong (verified in this worktree before any edit)

- `app/src/types/ai.ts` `AiStreamEvent` union carried `AiAgentActionEvent` and
  `AiWorkstateProposalEvent` but NO `analysis_proposal` member.
- `app/src/shared/hooks/useAiChat.ts` branched on `workstate_proposal` and
  `agent_action` only — an `analysis_proposal` frame fell through the event
  loop silently.
- `app/src/analysis/AnalysisChatPanel.tsx` wired `onWorkstateProposal` /
  `onAgentAction` and had no analysis callback to register.
- Server side already correct: `server/src/ai/AgentOrchestrator.ts:2337`
  `onEvent?.({ type: 'analysis_proposal', analysis })`; wire shape authority
  `app/src/event-editor/right-pane/ai/assistStream.ts:259`
  `| { type: 'analysis_proposal'; analysis: Record<string, unknown> }`.
  NO server change made (see gate below).

## RED first (transcript: `.hermes/plans/PB-CH-5fix-red-transcript.wip-l2t1355.txt`)

New tests written BEFORE any source edit:
- `app/src/shared/hooks/useAiChat.analysisProposal.test.tsx` (3 tests)
- `app/src/analysis/AnalysisChatPanel.analysisProposal.test.tsx` (1 test,
  flow hook spied at its module — spec-preferred seam)

`cd <wt>/app && npx vitest run src/shared/hooks/useAiChat.analysisProposal.test.tsx src/analysis/AnalysisChatPanel.analysisProposal.test.tsx`

```
 ❯ src/shared/hooks/useAiChat.analysisProposal.test.tsx  (3 tests | 3 failed) 172ms
   ❯ ... > analysis_proposal frame fires onAnalysisProposal with the verbatim analysis payload
     → expected "spy" to be called 1 times, but got 0 times
   ❯ ... > analysis_proposal with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed
     → expected undefined not to be undefined
   ❯ ... > a throwing onAnalysisProposal does not break the turn (workstate-branch wrapper style)
     → expected "spy" to be called 1 times, but got 0 times
 ❯ src/analysis/AnalysisChatPanel.analysisProposal.test.tsx  (1 test | 1 failed) 3042ms
   ❯ ... > an analysis_proposal frame calls flow.proposeWorkstate with adapter "analysis" and the verbatim intent
     → expected "spy" to be called 1 times, but got 0 times

 Test Files  2 failed (2)
      Tests  4 failed (4)
```

Fails for the RIGHT reason: the callback is never called (0 times) and no
system bubble exists — i.e. the frame falls through the loop, exactly the
silent-drop defect the finding documents. The panel test's DOM dump shows the
chat panel rendered with no card and no named bubble.

## The fix (smallest additive, mirrors the workstate_proposal block)

1. `app/src/types/ai.ts` — new `AiAnalysisProposalEvent { type:
   'analysis_proposal'; analysis: Record<string, unknown> }` with the same
   comment discipline as the two envelope members above (cites
   AgentOrchestrator.ts:2337 and assistStream.ts:259 as the wire-shape
   authority; compile is the trust boundary), added to the `AiStreamEvent`
   union.
2. `app/src/shared/hooks/useAiChat.ts` — `onAnalysisProposal?: (analysis:
   Record<string, unknown>) => void` on `UseAiChatOptions` (doc comment
   mirroring the PB-CH-6 block), destructured in the signature, a stable ref
   pair next to `workstateProposalRef`, and a new `if (event.type ===
   'analysis_proposal')` branch placed immediately after the
   `workstate_proposal` block with the IDENTICAL shape: callback → verbatim
   relay; throwing callback → system line, turn continues; NO callback →
   NAMED system bubble. Bubble texts are distinct per frame kind
   (`'The assistant proposed an analysis but this page cannot show proposal
   cards yet. Nothing was written.'` / wrapper
   `'The analysis proposal card could not open: … Nothing was written.'`) so
   the existing test's pinned workstate wording is untouched. `continue` at
   the end. No logic forked, no generalization needed.
3. `app/src/analysis/AnalysisChatPanel.tsx` — registered
   `onAnalysisProposal: (intent) => { void flow.proposeWorkstate('analysis', intent) }`
   (same adapter-parameter discipline AiTabPanel.tsx:635-637 uses;
   `'analysis'` is a valid `WorkstateAdapter`).

Diff stat vs merge-base (`git -c core.fileMode=false diff --stat d3c73f00 -- app/`):
```
 app/src/analysis/AnalysisChatPanel.tsx |  7 +++++
 app/src/shared/hooks/useAiChat.ts      | 51 +++++++++++++++++++++++++++++++++-
 app/src/types/ai.ts                    | 20 +++++++++++++
 3 files changed, 77 insertions(+), 1 deletion(-)
```

## Gate 1 — app tsc SET identity (zero new errors)

Baseline captured BEFORE any edit (`npm run typecheck -w app`, saved to
`.hermes/plans/PB-CH-5fix-tsc-baseline.wip-l2t1355.txt`):
```
error lines: 34   distinct files: 24
```
Final after the fix (`.hermes/plans/PB-CH-5fix-tsc-final.wip-l2t1355.txt`):
```
final error lines: 34
final error files: 24
comm -3 baseline vs final (must be empty):
comm done
```
`comm -3` of the position-normalized (`sed 's/([0-9]*,[0-9]*)//' | sort`)
error-line sets is EMPTY → zero new tsc errors.

Note for the orchestrator: the spec cites a 47-line/24-file trunk baseline;
this worktree's own step-1 measurement is 34 lines / 24 files (the same 24
files). The gate as written — comm -3 against my own step-1 capture — is
satisfied exactly. The 47-vs-34 delta is a baseline-count discrepancy in the
spec's cite, not a change introduced here; the file set is identical.

## Gate 2 — GREEN targeted

`cd <wt>/app && npx vitest run src/shared/hooks/useAiChat.channelEnvelopes.test.tsx src/shared/hooks/useAiChat.analysisProposal.test.tsx src/analysis/AnalysisChatPanel.analysisProposal.test.tsx src/analysis/analysisChat.health.test.tsx src/analysis/AnalysisPage.chat.test.tsx`

```
 ✓ src/shared/hooks/useAiChat.analysisProposal.test.tsx  (3 tests) 174ms
 ✓ src/shared/hooks/useAiChat.channelEnvelopes.test.tsx  (5 tests) 286ms
 ✓ src/analysis/AnalysisChatPanel.analysisProposal.test.tsx  (1 test) 58ms
 ✓ src/analysis/AnalysisPage.chat.test.tsx  (5 tests) 286ms
 ✓ src/analysis/analysisChat.health.test.tsx  (2 tests) 83ms

 Test Files  5 passed (5)
      Tests  16 passed (16)
```
Full transcript: `.hermes/plans/PB-CH-5fix-green-transcript.wip-l2t1355.txt`.

Extra confidence runs (not gates):
- `src/types/aiStreamTypes.pin.test.ts` — 5 passed (the union pin stays green
  with the new member; assistStream.ts untouched).
- `src/analysis/AnalysisPage.no-execute.test.tsx`, `AnalysisPage.test.tsx`,
  `src/shared/hooks/` — 8 files / 32 tests passed, plus one PRE-EXISTING
  failure: `src/shared/hooks/useAiChat.surfaceContext.test.ts`
  (`Failed to load url … resolved id: /mnt/vast/home/brad/git/computable-lab/…`).
  Verified pre-existing: with my changes stashed (`git stash push -u -- <5
  changed paths>`) the same file fails identically on pristine HEAD ("Test
  Files 1 failed, Tests no tests"). Cause: the lane worktree's untracked
  symlink points into `/mnt/vast/home/brad/git/computable-lab` and vite's
  resolution of that symlinked test file fails in this worktree — a
  lane-bootstrap artifact, not this change. Stash popped cleanly afterwards.

## Gate 3 — server diff EMPTY

`git -c core.fileMode=false diff --stat $(git merge-base HEAD d3c73f00)...HEAD -- server/`
→ no output (empty). No server change, no AiTabPanel/useChatThread/assistStream
change, no YAML/lint change.

## Gate 4 — touched files

Tracked modifications (`git -c core.fileMode=false status --porcelain -uno`):
```
 M app/src/analysis/AnalysisChatPanel.tsx
 M app/src/shared/hooks/useAiChat.ts
 M app/src/types/ai.ts
```
New files: the two test files above plus this report and the four transcript
captures under `.hermes/plans/`. Nothing else. `node_modules` remain trunk
symlinks; no npm install run. `git -c core.fileMode=false` used throughout.
No server/:3093/:5193 restart or curl.

## Assumptions / notes

- The panel-level test spies `useWorkstateProposalFlow` at its module (spec
  preference) rather than asserting card rendering; the card machinery for the
  'analysis' adapter is already pinned by AnalysisPage.chat.test.tsx and the
  flow's own suite.
- Wrapper wording for the throwing-callback arm reuses the workstate branch's
  `… proposal card could not open: … Nothing was written.` shape with
  `analysis` prefixed, keeping the per-kind distinction the spec requires.
- UI-visible effect (a card now appears where the drop happened) is left to
  the orchestrator's browser gate (reuse orchgate5 send), per spec.

## Status

Implementation complete; all four coder gates green. Acceptance pending the
orchestrator's browser evidence gate.

PB-CH-5-FIX CODER DONE
