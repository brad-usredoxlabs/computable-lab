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

## FIX-1 (advc c1 D1) l2t1110

Adversarial review advc-ANSWERSURFACE1-c1-l2t1045: VERDICT FIX, one MINOR defect
(D1: '/l' zero-hit card renders "No matches — keep typing to mint a local term"
although resolveLabware emits no mint row; plus two contradicted canMint claims).

### Commits

- 9c674dc5 ANSWER-SURFACE-1 FIX1 (advc c1 D1): mint empty-state copy now keys on
  the resolver — '/l'/'/e' zero-hit cards say plain 'No matches'; corrected the
  two contradicted canMint claims
  (4 files: ClarificationPicker.tsx +9/-1, ClarificationPicker.test.tsx +59,
  clarificationAdapter.ts comment 8, clarificationAdapter.test.ts header 6)
- (report committed separately below this section)

### Fix (smallest diff, orchestrator-granted scope)

app/src/event-editor/right-pane/ai/ClarificationPicker.tsx:262-268 —
  - const canMint = !request.materialLayer || request.materialLayer === 'material'
  + const canMint = resolver === resolveMaterial
  +   && (!request.materialLayer || request.materialLayer === 'material')
The mint floor row (`mint:<q>`, resolvers.ts:67-92) is emitted inside
resolveMaterial ONLY (grep of resolveLabware resolvers.ts:352-402 for "mint" ->
no match, exit 1). canMint now keys on the resolver actually being the material
resolver, exactly the reviewer's suggested direction. resolveLabware behavior
UNCHANGED; no mint floor added to labware; no YAML/schema/server touched.
Comment added at the site stating the mechanism truthfully.

Claim corrections (the reviewer's "ALSO"):
- clarificationAdapter.ts:41 — now states: "the mint floor row is emitted by
  resolveMaterial alone — resolvers.ts:67-92 — and resolveLabware emits none, so
  a '/l' card has no mint floor and its empty-state copy says plain 'No matches',
  FIX1 D1".
- clarificationAdapter.test.ts:8 — header now states the same mechanism
  ("the mint floor row exists only in resolveMaterial (resolvers.ts:67-92), a
  '/l' card has NO mint floor — its zero-hit copy says plain 'No matches', never
  'keep typing to mint', FIX1 D1").

### RED (before fix, on HEAD 7e1994ec; test-only diff added first)

$ cd app && npx vitest run src/event-editor/right-pane/ai/ClarificationPicker.test.tsx
 ❯ src/event-editor/right-pane/ai/ClarificationPicker.test.tsx  (16 tests | 2 failed) 4217ms
   ❯ ... > mint empty-state copy only appears where a mint floor actually exists (ANSWER-SURFACE-1 FIX1 D1) > a /l card with a non-empty query and zero resolver hits shows plain "No matches", never the mint-inviting copy
     → Unable to find an element with the text: No matches. ...
          ...
          No matches — keep typing to mint a local term        <-- rendered DOM, the D1 copy verbatim
   ❯ ... > a /e card with a non-empty query and zero resolver hits shows plain "No matches", never the mint-inviting copy
     → Unable to find an element with the text: No matches. ...
 Test Files  1 failed (1)
      Tests  2 failed | 14 passed (16)
     Errors  1 error
RED CONFIRMED: the 2 new '/l'/'/e' pins fail at HEAD; the 2 positive pins
('/m' material keeps mint copy; aliquot stays plain) already pass — no existing
pin weakened. The 1 "Errors" is the pre-existing ClarificationPicker.tsx:215
unhandled-exception debt (advc review E2/E4 confirms same at baseline).

### GREEN (targeted, gate 1)

$ cd app && npx vitest run src/event-editor/right-pane/ai/ClarificationPicker.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.test.ts src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationCards.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.heldBundle.test.tsx src/event-editor/right-pane/protocol/ProtocolLocalizationThread.test.tsx
 Test Files  5 passed (5)
      Tests  43 passed (43)
     Errors  1 error
Zero failures. "Errors 1" = the same pre-existing :215 unhandled exception
(line untouched; advc review E2 recorded it in their own run too).

### Full app run (gate 2) — host IS load-flaky; comm adjudication below

HEAD 9c674dc5, three full runs:
  run1: Test Files 62 failed | 320 passed (382) / Tests 72 failed | 2504 passed / Errors 5
  run2: Test Files 62 failed | 320 passed (382) / Tests 72 failed | 2504 passed (2576) / Errors 5
  run3: Test Files 61 failed | 321 passed (382) / Tests 71 failed | 2505 passed (2576) / Errors 5
Base 534f7e5f app tree (adapter at base, cycle-1 test removed), two full runs:
  run1: Test Files 61 failed | 320 passed (381) / Tests 71 failed | 2492 passed (2563) / Errors 5
  run2: Test Files 61 failed | 320 passed (381) / Tests 71 failed | 2492 passed (2563) / Errors 5
  (base fail-file union: 61, identical across both base runs)

$ grep '^ FAIL ' <raw> | sed 's/ FAIL  //' | awk '{print $1}' | sort -u
$ comm -13 base-union-failfiles head3-failfiles   # head3 = clean 61-file run
  (empty)
$ comm -3 base-union-failfiles head3-failfiles
  (empty)
=> Zero NEW fail-file names; identical 61-file fail set. +1 passed file / +13
   passed tests = the new ClarificationPicker pins (4) riding on the cycle-1
   adapter file (9). LiteraturePage.test.tsx suite-load failure in BOTH lists.

Flap adjudication (the host is load-flaky, as the mandate anticipated): run1's
head-exclusive file was src/event-editor/right-pane/search/VendorPdfSearchSection.test.tsx
(failure reason: "Error: Test timed out in 5000ms."), run2's was
src/graph/events/forms/AddMaterialForm.biological.test.tsx ("expected 0 to be
greater than 0"). Neither file imports ClarificationPicker or the adapter
(grep exit 1). Both PASS in isolation at HEAD (VendorPdfSearchSection 3/3 probes
"Test Files 1 passed"; AddMaterialForm.biological 2/2 probes "Test Files 1
passed"). Same-tree run-to-run comm (head1 vs head2) shows the two swapping —
load/timeout flaps, not fix-attributable. Base runs never flapped (61/61).

### tsc (gate 3)

$ cd app && npx tsc -p . --noEmit
HEAD 9c674dc5: exit 2, 23 error lines / 16 distinct files
Base 534f7e5f:  exit 2, 23 error lines / 16 distinct files
$ grep 'error TS' <raw> | sed 's/(.*//' | sort -u   (both sides)
$ comm -3 base-tsc-files head-tsc-files
  (empty)
=> File-set comm EMPTY; matches the mandated 23-line/16-file lineage.

### Server tree (gate 4)

$ git -c core.fileMode=false diff --stat 534f7e5f..HEAD -- server/
  (empty)
=> server/ untouched. Full item diff (534f7e5f..HEAD): report doc,
ClarificationPicker.tsx/.test.tsx (FIX1 scope grant), clarificationAdapter.ts/.test.ts.
No YAML/schema touched; no stack restart.

### Notes

- exactOptionalPropertyTypes: the fix adds no optional-field assignments at all
  (canMint is a local boolean). No undefined written anywhere.
- No hardcoded policy added: the fix keys copy on WHICH RESOLVER the picker
  already selected (code identity, resolverFor :30-35), not on nouns/labels.
- TermPanel.tsx:253 already renders plain 'No matches' (no mint copy) —
  unaffected. clarificationCards.test.tsx:74 comment ("the same mint floor the
  picker's canMint offers") refers to the '/m' card and remains true.
- Reviewer observation O2 (pin unknown-noun+labware / resolution-lookup-failed+labware
  rows) was NOT part of D1 and is not in this fix's declared repair; left as-is
  to keep the diff minimal.

ANSWER-SURFACE-1 FIX1 DONE 9c674dc5
