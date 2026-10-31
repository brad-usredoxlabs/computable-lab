# HANDOFF ADDENDUM — lane 2 — 2026-10-30T23:40 EDT (orch l2t2250, same tick)

## CHAT-UI-1 LEG D: ADVC C2 ACCEPT + MERGED — WITH OPEN MERGE-GLUE DEFECT
- reviews/L2-CHATUI1-legD-advc2-l2t2250.md VERDICT: ACCEPT (terminal cycle, residual OBS
  only; reviewer ran its OWN vite :5296, reproduced D1 candidate-measured 5/5, mutation-proved
  D2 pin teeth, tsc-10 stable, scope clean).
- ORCH SELF-VERIFY (merged trunk 8ff1892f): owned-area targeted vitest 13/13 green (3 files);
  scope re-verified (diff 02008735..8d848095 app/-only, rc=1 non-app grep); base-ancestor yes.
- **OPEN GLUE DEFECT (blocking browser gate + LEG E acceptance): app tsc post-merge = 20 vs
  pre-merge baseline 11** (baseline snapshot /home/brad/.hermes/cl/lanes/2/evidence/tsc-premerge-baseline-l2t2250.txt; post-merge
  /tmp/tsc-postmerge-l2t2250.txt; worktree /tmp/premerge-base-l2t2250 @ a8511413 for
  re-derivation). 9 NEW errors are merge GLUE, not LEG D code: (a) ParameterAnswerInput.test
  imports ebbf5d4a-deleted ai/QuestionsPanel; (b) useChatThread.deckLayout.test expects
  UseChatThreadOptions.onDeckLayout (trunk-added test vs branch-removed option); (c)
  SurfaceId/SurfaceContextPayload/AiContext type disagreement between branch-era
  shared/context+shared/hooks and trunk-added useAiChat.surfaceContext.test. Runtime (:5193)
  is unaffected (vite does not typecheck); 1 pre-existing error (systemPromptForViewer)
  disappeared legitimately (file deleted by the merge).
- ARMED: prompts/coder-CHATUI1-legD-mergefix-armed-l2t2250.txt — glue-only repair branch off
  post-merge trunk, gate = sorted tsc set EQUAL/SUBSET the 11-line baseline, AiTabPanel/
  QuestionsPanel resurrection BANNED. Fill dispatch note with worktree/token, queue on slot
  (stagger: WEM-1 started 23:18 -> earliest fresh coder 00:18 or when WEM-1 exits), report
  deliverables/L2-CHAT-UI-1-report.legD-mergefix-<TOKEN>.md, marker
  L2-CHATUI1-LEGD-MERGEFIX DONE <40sha>. This is INTEGRATION repair, NOT fix run 3 of LEG D
  (the 2-cycle cap governs the reviewed branch; this is new trunk-facing glue).
- BROWSER GATE spec 8.2 must run AFTER the glue fix merges (verify the FINAL state once;
  receipts receipts/L2-CHATUI1-LEGD/<tag>/). Then LEG E claim+dispatch.

## NEXT TICK ORDER
1. WEM-1 coder (slot-0, 3435608/3435612): observe/on-DONE -> advc gate -> self-verify ->
   merge -> RESTART (YAML, LABSTATE_ARM_LOG=1) -> n-probe -> LABSTATE re-drive.
2. Merge-glue fix: create worktree wt/CHATUI1-LEGD-MERGEFIX-lane2-l2t2340 off trunk tip >=
   8ff1892f, fill armed prompt, dispatch when slot+stagger allow (queue form if needed).
   On DONE: narrow advc on glue diff -> self-verify tsc set -> merge --no-ff.
3. LEG D browser gate on post-glue trunk (tier-1 first).
4. LEG E claim gate = LEG D browser-gate accept.

## Health
Budget: entered 22:50, addendum at 23:40 (~50 min; slightly over 45 soft — stop-launching
applies). Live at exit: WEM-1 coder (slot-0), advc c2 DONE (accept). No new dispatches after
budget. Assumptions this addendum: none new (glue repair is coded from code-diagnosis, no
value invented). Evidence debt unchanged; add implicit open obligation: BROWSER GATE
8ff1892f+glue pending — LEG D cannot close without it.
