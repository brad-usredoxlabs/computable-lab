# L2-P1-ABSENCE-SINGLE-ARM-1 / u1singlearm — unit report

item: L2-P1-ABSENCE-SINGLE-ARM-1
unit: u1singlearm (1 of 1)
worktree: /home/brad/cl-wt/L2-P1-ABSENCE-SINGLE-ARM-1-lane2
branch: cl/lane2-absence-single-arm-1
base: 0db1ee50b385a1d9ea2f7fe0a93bb0f35e85f31c
decision: .hermes/plans/decisions/ABSENCE-RENDERING-AND-PROBE-TIERS-l2-20261114.md (Ruling 1 — BINDING)
finding: advc cycle-1 defects 7-8 on L2-P1-EMPTY-TURN-CARD-2-u1emptycard
scenario: prompt-1 (human_choice #1)

## Defect (as briefed)
app/src/agent/ChatLog.tsx:604 mounts ChatClarificationCard — the ONLY renderer that
understands request.absence — only when clarificationRequests.length > 1. With
length === 1, renderTypedClarification rendered the PICKER (menuProvider '/l' makes
requestHasPicker true — ClarificationPicker.tsx:35 `if (request.menuProvider === '/l'
|| request.kind === 'labware') return resolveLabware`) and the absence payload was
never shown: no absence sentence, no create affordance.

## Fix (client-only, one seam)
- app/src/agent/ChatLog.tsx — ONE arm inserted in renderTypedClarification BETWEEN the
  hasDeclaredSlot arms and the options arm, i.e. tested BEFORE both
  `options.length > 0 && onClarificationPick` and `hasPicker && onClarificationPick` so
  the /l picker can never shadow it:
      ) : request.absence != null && options.length === 0 ? (
        <div className="chat-clarification-card__absent">
          <p className="chat-clarification-card__absent-reason">{request.absence.reason}</p>
          <a className="chat-clarification-card__absent-create"
             data-testid="chat-clarification-absent-create"
             href={`/lab/labware/new?prefillName=${encodeURIComponent(request.absence.mention)}`}>
            Create this record
          </a>
        </div>
  The markup MIRRORS the card's arm (ChatClarificationCard.tsx:214-224) — same classes,
  same testid, same href shape, inline JSX (the accepted shape for this unit). No
  onClarificationPick gate: the create affordance is a LINK, not a pick (the card mounts
  it the same way). `options.length === 0` mirrors the card's own condition.
- The :604 grouped-card gate line is UNCHANGED (brief: do not change). No synthetic
  second request emitted anywhere.
- Render guard (requestRendersOwnedPrompt, ChatLog.tsx:195-202): NOT extended. The
  absence request's menuProvider '/l' makes requestHasPicker true, so
  requestRendersPrompt already passes — proven by the legs (the card node mounts).
  No second copy of the rule added.
- app/src/agent/ChatLog.test.tsx — new describe, 2 legs (RED before the fix), fixture
  the EXACT server shape (server/src/ai/clarifications.ts:347-381): ONE request,
  id 'empty-turn-absence-1', kind 'labware', menuProvider '/l', options: [],
  absence: { mention: '96-well plate', reason: "Not in this lab's records: 96-well plate" }.
  (1) asserts .chat-log-clarification carries the reason text verbatim AND
      chat-clarification-absent-create with href containing
      '/lab/labware/new?prefillName=' AND encodeURIComponent('96-well plate'); asserts
      NO ClarificationPicker shadow (no .message-log__clarification-picker in the card,
      no clarification-identity-search testid anywhere) and exactly ONE create
      affordance in the log.
  (2) RULING 1 non-regression pin: exactly ONE [data-testid^=chat-log-request-] node
      for the message (the count is NOT load-bearing; the forbidden synthetic second
      request would add a node and fail this pin); the absence branch + create
      affordance sit INSIDE that one node.
- The existing single-slot pins (incl. :131 toHaveBeenCalledTimes(1)) are untouched and
  green.

## Commits (this branch, on base 0db1ee50b)
1. 15ff5f486c7143c4ef409ca404f4d2abd1699bba — RED: the two absence legs (failing on base)
2. e2f1c6845a0418853cff433cbad80b4f56bcf25c — GREEN: the one arm in ChatLog.tsx
3. (this commit) — this report
4. (marker commit) — DONE marker appended here + the -DONE file

Commit-budget note: the brief budgeted 3 commits with "(3) report + DONE marker" as one.
A DONE marker must name the sha of the commit that CONTAINS the report, and that sha is
unknowable before that commit exists (self-reference), so the marker necessarily lands
in a follow-up commit — the accepted fleet convention (L2-P1-EMPTY-TURN-CARD-2
u1emptycard: report commit 790dcd5f7, marker commit 3d2fe2bb9). Total 4 commits =
budget + 1, justified by that convention.

## Verification (real, measured — commands exactly as briefed)
Base for baselines: 0db1ee50b385a1d9ea2f7fe0a93bb0f35e85f31c (branch start, clean tree).

Command 1 (RED — run on the RED commit, before the fix):
  cd /home/brad/cl-wt/L2-P1-ABSENCE-SINGLE-ARM-1-lane2/app && npx vitest run src/agent/ChatLog.test.tsx
  Baseline on base (before adding legs): 28 passed, 0 failed (as briefed).
  After adding the legs (commit 15ff5f486c7143c4ef409ca404f4d2abd1699bba):
  2 failed | 28 passed (30) — both NEW absence legs fail ("expected null not to be null"
  on .chat-clarification-card__absent-reason / .chat-clarification-card__absent), all 28
  pre-existing pass. RED committed.

Command 2 (GREEN — run after the fix):
  cd /home/brad/cl-wt/L2-P1-ABSENCE-SINGLE-ARM-1-lane2/app && npx vitest run src/agent/ChatLog.test.tsx
  Result: Test Files 1 passed (1); Tests 30 passed (30); 0 failed (28 pre-existing + 2 new).

Command 3 (regression — run on the final state):
  cd /home/brad/cl-wt/L2-P1-ABSENCE-SINGLE-ARM-1-lane2/app && npx vitest run src/agent/ChatLog.test.tsx src/agent/ChatClarificationCard
  Result: 4 test files passed, 48 tests passed, 0 failed:
    src/agent/ChatClarificationCard.absent.test.tsx     (4)
    src/agent/ChatClarificationCard.stageAstring.test.tsx (5)
    src/agent/ChatClarificationCard.mint.test.tsx       (9)
    src/agent/ChatLog.test.tsx                          (30)
  (Brief baseline: 4 files / 46 tests. 46 = 4+5+9+28; + the 2 new legs = 48. All 46
  pre-existing tests pass; 0 failed.)

Command 4 (typecheck — run on the final state):
  cd /home/brad/cl-wt/L2-P1-ABSENCE-SINGLE-ARM-1-lane2/app && npx tsc --noEmit
  Baseline measured on base 0db1ee50b: 17 errors (the brief estimated 4; the measured
  base set is 17 — SchemaRecordForm.tsx x3, RefCombobox.ontologyref.test.tsx x1, plus
  RecordCreatePanel.gc16-widget-commit.test.tsx x4, RecordCreatePanel.gc16.test.tsx x1,
  ObjectWidget.nested.test.tsx x1, tabNavPlugin.ts x1, and 5 ../server module-resolution
  errors — the brief's 4 covered only the first two named files).
  Final: 17 errors. `diff` of the base and final error lists: byte-identical (delta 0).
  Neither changed file (ChatLog.tsx / ChatLog.test.tsx) appears in the error list.

## Acceptance
1. DONE — a single absence-carrying request (options: [], menuProvider '/l', absence
   payload) renders inside .chat-log-clarification the reason text and the
   data-testid chat-clarification-absent-create whose href is
   /lab/labware/new?prefillName=96-well%20plate (leg 1 asserts start + encoded mention).
2. DONE — the same render shows NO ClarificationPicker for that request (no
   .message-log__clarification-picker / clarification-identity-search) and exactly ONE
   create affordance (leg 1).
3. DONE — exactly ONE chat-log-request-* node for the single-absence message; the :604
   gate is byte-unchanged; no synthetic second request (leg 2 pin + untouched gate).
4. DONE — all 46 pre-existing tests in the ChatLog + ChatClarificationCard suites pass
   (48/48 incl. the 2 new legs); typecheck delta 0.
5. DONE at the marker commit — this report is committed at
   .hermes/reports/L2-P1-ABSENCE-SINGLE-ARM-1-u1singlearm-report.md citing real SHAs
   (git rev-parse per commit above); the DONE marker is appended to this file in the
   marker commit and mirrored to .hermes/reports/L2-P1-ABSENCE-SINGLE-ARM-1-u1singlearm-DONE.

## Changed files (git diff --stat 0db1ee50b..e2f1c6845)
  app/src/agent/ChatLog.test.tsx | 78 ++++++++++++++++++++++++++++++++++++++++++
  app/src/agent/ChatLog.tsx      | 24 +++++++++++++
  2 files changed, 102 insertions(+)
  Budget: files <= 2 (OK), lines <= 120 (OK: 102).

## Remaining blockers
- Browser acceptance: owned by the independent browser reviewer / orchestrator. The
  client render is proven by the unit legs; a live lane-2 stack render of a real
  empty-turn absence turn needs the orchestrator to merge + reload the lane stack
  (YAML/config reload lane rules). Resume condition: merge lands and the lane stack is
  reloaded; drive an empty-turn utterance on a clean thread and expect the absence
  statement + prefilled create link.
- Implementation complete; acceptance complete is a separate state (lane rule).
