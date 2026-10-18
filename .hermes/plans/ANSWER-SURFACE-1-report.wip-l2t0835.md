# ANSWER-SURFACE-1 — coder report (lane 2, spec l2t0835)

Worktree: /mnt/vast/home/brad/git/wt/ANSWER-SURFACE-1-lane2-l2t0835
Branch: wt/ANSWER-SURFACE-1-lane2-l2t0835 · base 534f7e5f (trunk)
Commit: 30f4b0cf (no reset/rebase; all git via `git -c core.fileMode=false`)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-18_0905-ANSWER-SURFACE-1-labware-menu-routing-spec.md
Origin: .hermes/plans/decisions/W28-A5h-labware-semantic-noun-answer-decision.md (Q2 TASK ANSWER-SURFACE-1)

## What changed (2 files, both in the assigned scope)

1. app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts
   - The flat `CLARIFICATION_MENU_BY_REASON[reason]` lookup is replaced by ONE
     lookup `menuForFact(reason, argument)`: the (reason, argument) override
     table `CLARIFICATION_MENU_BY_REASON_ARGUMENT` is consulted first, and the
     unchanged `CLARIFICATION_MENU_BY_REASON` row is the SINGLE (reason,'*')
     fallback. No if-ladders. A reason with no menu row never gets a card,
     argument or not (the lookup consults the reason table first).
   - `argument` is read generically off the wire fact's `actionLocation`
     (SPINE-1 frozen unresolved shape, schema/workflow/scientist-intent.schema
     .yaml:220-244 — verified first-hand in this worktree: `argument: {type:
     string, minLength: 1}` under unresolved.actionLocation, additionalProperties:false).
     Never inferred from label/candidates. No new AiClarificationRequest field
     (menuProvider already accepts '/l': app/src/types/ai.ts:215
     `AiClarificationMenuProvider = '/m' | '/l' | '/e' | 'choice'`).
   - The table's OPEN QUESTION comment is replaced by the CLOSED note (W28-A5h
     Q2): labware-semantic facts are answered by PICKING '/l', never by minting;
     '/vocab/mint' stays material-ONLY. No mint floor change, no materialLayer
     set (canMint already handles the floor; ClarificationPicker.tsx:31 already
     routes '/l' -> resolveLabware).
   - Card prompt/options/candidate handling untouched (byte-identical code path).
2. app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.test.ts (NEW)
   - 9 pins per the spec's RED-first list (a)-(d) + a table-identity pin.

No schema change, no server change, no new chrome, no App.test.tsx touch, no
stack touched (:3093/:5193/:3001/:5174 untouched), nothing installed (node_modules
are symlinks).

## RED run (before implementation)

Command: `cd <worktree>/app && npx vitest run src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.test.ts`

    ❯ src/.../ProtocolLocalizationThread.clarificationAdapter.test.ts  (9 tests | 1 failed) 42ms
      ❯ ... > 1. ambiguous-noun WITH actionLocation.argument=labware routes to the labware menu /l
        → expected '/m' to be '/l' // Object.is equality
    Test Files  1 failed (1)
         Tests  1 failed | 8 passed (9)

RED is exactly the spec's defect: reason-only keying sends the labware-argument
fact to '/m'. Pins (b)/(c)/(d) passed at baseline (byte-identical behavior).

## GREEN run (after implementation)

Targeted suites: `npx vitest run src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.test.ts src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationCards.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx src/event-editor/right-pane/ai/ClarificationPicker.test.tsx`

    Test Files  5 passed (5)
         Tests  39 passed (39)
        Errors  1 error

The 1 "Errors" line is pre-existing unhandled-exception debt: the same
`TypeError: Cannot read properties of undefined (reading 'then')` from
ClarificationPicker.tsx:215 in the ClarificationPicker.test.tsx labware-browse
test. PROVEN pre-existing: with my changes stashed (`git stash -u`), the same
command at base prints `Test Files 1 passed (1) / Tests 12 passed (12) /
Errors 1 error` — identical error at base. (Matches the standing memory note
that the "Errors N" line is unhandled-exception debt, not a lane regression.)

Adapter unit file alone post-fix: `Test Files 1 passed (1) / Tests 9 passed (9)`.

## Full app run — fail-FILE names zero NEW vs trunk baseline

Baseline captured BEFORE any edit (worktree clean at 534f7e5f):
`cd <worktree>/app && npx vitest run` -> raw /tmp/as1-vitest-full-base.txt
(61 failed | 320 passed (381) files; 71 failed | 2492 passed tests; Errors 5)

After (HEAD 30f4b0cf): same command -> raw /tmp/as1-vitest-full-after.txt
(61 failed | 321 passed (382) files; 71 failed | 2501 passed tests; Errors 5)

Fail-file name extraction:
`grep "^ FAIL " <raw> | sed 's/ FAIL  //' | awk '{print $1}' | sort -u`
-> /tmp/as1-base-failfiles.txt (61 lines), /tmp/as1-after-failfiles.txt (61 lines)

`comm -3 /tmp/as1-base-failfiles.txt /tmp/as1-after-failfiles.txt` -> EMPTY
(exit 0). Zero NEW fail-file names; identical 61-file fail set. The +1 passed
file / +9 passed tests are exactly the new adapter test file.
LiteraturePage.test.tsx suite-load failure present in BOTH baselines
(pre-existing, as the spec states).

## App tsc — file-set comm-empty vs baseline

`cd <worktree>/app && npx tsc --noEmit` at base -> /tmp/as1-tsc-base.txt
(exit 2; 23 `error TS` lines across 16 distinct files) and at HEAD ->
/tmp/as1-tsc-after.txt (exit 2; 23 `error TS` lines across 16 distinct files).

File-set extraction: `grep -oP '^[^ (]+(?=.*error TS)' <raw> | sort -u`
-> /tmp/as1-tsc-base-files.txt, /tmp/as1-tsc-after-files.txt
`comm -3 /tmp/as1-tsc-base-files.txt /tmp/as1-tsc-after-files.txt` -> EMPTY
(exit 0). Zero new tsc files, zero new tsc error lines (23 = 23).

NOTE on the "21-file baseline" in the spec: the measured baseline AT THIS
worktree's base 534f7e5f is 16 error-files / 23 error lines (raw
/tmp/as1-tsc-base.txt). The gate as written — comm-empty file-set vs the
baseline captured at this base — passes exactly. The 21-file figure is a
different trunk snapshot (baselines shift with trunk drift; per lane
convention baselines are captured after rebasing onto the current tip, never
cross-pinned). No tsc debt was added or removed by this lane either way.

## Scope proof

`git -c core.fileMode=false diff 534f7e5f..HEAD --stat`:

     ...LocalizationThread.clarificationAdapter.test.ts | 106 +++++++++++++++++++++
     ...tocolLocalizationThread.clarificationAdapter.ts |  63 +++++++++---
     2 files changed, 156 insertions(+), 13 deletions(-)

Touches ONLY the adapter file + its test (this report is the only .hermes doc,
committed separately below).

## Assumptions / notes for the orchestrator

- Table shape decision (nested map, coder judgement per spec §1): a second
  DATA table `CLARIFICATION_MENU_BY_REASON_ARGUMENT` (reason -> {argument ->
  menu}) + one lookup function; the (reason,'*') default is the single
  fallback; no if-ladders.
- The override table names `labware` for all three menu-carrying reasons
  (unknown-noun / ambiguous-noun / resolution-lookup-failed). The decision's
  mechanism (A5h Q1 point 4) is that ANY of these reasons can carry
  actionLocation.argument='labware' (clarificationFor carries actionLocation
  for all emitted noun facts); routing all three is the generic rule, not a
  per-reason special case. Only ambiguous-noun+labware is pinned by the spec's
  (a); unknown-noun+labware riding '/l' is the same declared-role logic the
  CLOSED OQ comment documents.
- No materialLayer set on the '/l' request (spec §2: only if an existing
  pattern required it — it does not; canMint is material-only so the '/l'
  card shows no mint floor).
- Browser proof of the surface rides W28-A5D-R3 per decision Q4.2 (no separate
  browser gate for this item).

ANSWER-SURFACE-1 DONE 30f4b0cf
