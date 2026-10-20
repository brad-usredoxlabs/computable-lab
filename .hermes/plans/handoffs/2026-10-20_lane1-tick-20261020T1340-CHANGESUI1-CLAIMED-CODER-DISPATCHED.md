# Handoff — lane 1 tick 2026-10-20 13:40 → CHANGES-UI-1 CLAIMED, CODER DISPATCHED

Author: orchestrator cron tick l1t1330 — lane 1. :3001/:5174 never touched.
All git via -c core.fileMode=false.

## What happened this tick

1. RECONCILE: newest handoff (1825 2026-10-19) reported the queue EMPTY, but
   the live task list carries ONE todo added since: CHANGES-UI-1 (four
   render-layer defects in the AI chat Changes tab). No live lane-1 workers,
   no due/changed blockers (cheap gate: none). Fleet coder lock entry was
   stale (pid 395813 "recv-coder l2t0115" — process GONE); flock -n confirmed
   FREE and was re-claimed at dispatch with the new holder line.
2. SPEC: wrote .hermes/plans/2026-10-20_1340-CHANGES-UI-1-changes-panel-honesty-and-scroll.md.
   Orientation: one cl-scout (computable vision slot; answered both bounded
   questions — composition_snapshot consumption in eventGraph applyAddMaterial,
   req:-handle mint in labwareRequirement.ts:126; SCREENING only). ALL
   load-bearing facts verified FIRST-HAND by the orch in the served trunk:
   describeMaterial :45-64 first-ref-label defect, describeAmount :38-41
   asString-drops-numbers, `on ${labwareId}` raw-handle print :87-88,
   `.ai-tab__section` flex-shrink:0 base + NO --changes rule (unbounded
   growth), --questions/QuestionsPanel scroll precedent in the same ai.css,
   CompositionEntryValue shape, ChangesPanel structure (diff div + pinned
   actions bar), draftChanges purity (call sites AiTabPanel.tsx:533/:707).
   Spec picks INTERNAL SCROLL for (D) with the >=40-row fixture requirement.
3. CLAIM + DISPATCH: claimed CHANGES-UI-1 under task-list.lock (todo ->
   in-progress, spec path linked). Worktree
   /mnt/vast/home/brad/git/wt/CHANGES-UI-1-lane1-l1t1340, branch
   cl/lane1-changesui1-l1t1340 off cl/integration-1 @ ed0f5d09 (verified HEAD),
   node_modules symlinked per the lane's established worktree pattern (no
   pnpm install — frozen-lockfile drift known).
   CODER: hermes -p cl-coder, pid 1990940, started 20261020T1335,
   log /home/brad/.hermes/cl/lanes/1/changes-ui-1-coder-l1t1340.log (0 bytes —
   normal, tee flushes at exit), report path
   /home/brad/.hermes/cl/lanes/1/changes-ui-1-report-l1t1340.md, RED evidence
   /home/brad/.hermes/cl/lanes/1/changes-ui-1-red-l1t1340.txt. Fleet coder
   lock pid file names the holder. ALIVE at last check (~13:55, 20 min in;
   expected 60-90 min). ONE live coder fleet-wide — no other coder dispatched.
4. No spec-composer dispatched: CHANGES-UI-1 was the ONLY todo; no next
   ready item to compose. (If a future intake lands, compose it then.)
5. STACK: lane 1 backend :3092 http=200, frontend :5192 http=200 — untouched
   beyond status. No YAML changes this tick (app-only item; no restart needed
   at merge time either, unless the coder touched YAML — spec forbids it).

## QUEUE STATE

CHANGES-UI-1 in-progress (cl-coder pid 1990940, worktree/branch above, live).
No other todo/in-progress/blocked items. 55 done + 1 superseded carry forward.

## NEXT TICK CHECKLIST

1. RECONCILE the coder: is pid 1990940 (or its python child) alive? Any
   commits on cl/lane1-changesui1-l1t1340? Red file / report file exist?
   Due-check 2026-10-20T15:15-04:00: ALIVE+worktree motion => leave running,
   note elapsed. Past 2x (~2h) => log/state.db motion inspection per SOUL
   7b; the appliance-2 session lives in ~/.hermes/profiles/cl-coder/state.db.
   A dead coder WITHOUT the report file = resume in a NEW run on the SAME
   worktree/branch (never duplicate a live run; never start a second coder
   while one is alive).
2. ON CODER EXIT: adversarial gate FIRST — cl-adversarial-reviewer
   (OpenRouter deepseek/deepseek-v4.1-flash) with item id, worktree
   /mnt/vast/home/brad/git/wt/CHANGES-UI-1-lane1-l1t1340, branch
   cl/lane1-changesui1-l1t1340, spec path above, coder report path, unique
   review path /home/brad/.hermes/cl/lanes/1/changes-ui-1-advreview-<ts>.md.
   FIX -> fix run same worktree with defect list verbatim (max 2 cycles).
3. ON ADV ACCEPT: orch self-verification — real git diff ed0f5d09..branch,
   run draftChanges.test.ts + ChangesPanel.test.tsx +
   ChangesPanel.styling.test.tsx (cd app && npx vitest run <files> — check
   package.json script first), app tsc delta vs ed0f5d09 baseline (capture the
   baseline count yourself; REG-6's tsc baseline check used 27 error lines —
   confirm still 27 on pristine).
4. BROWSER GATE (mandatory, UI change): confirm the SERVED checkout on :5192
   contains the candidate (lane frontend serves /mnt/vast/home/brad/git/
   cl-integration-1 — merge candidate first via the two-track rule: adv+tests
   hard gate passes => merge --no-ff, then browser-verify the MERGED revision
   on the running stack; record merged-revision pending explicitly). Restart
   stack if any YAML changed (should be none). cl-browser-reviewer against
   http://localhost:5192, receipts
   /home/brad/.hermes/cl/receipts/CHANGES-UI-1/<ts>/, criteria verbatim from
   the task block, canonical 40-well shorthand utterance ("50/50
   Trypsin-EDTA/DMEM + 10% FBS, 200 cells/uL" — see the task block's grounded
   example; the reviewer needs the exact draft flow: AI chat tab in the event
   editor, submit the utterance, review the Changes subtab). Tier ladder per
   SOUL 6c if the tier-1 gate dies.
5. MERGE (if not already merged in step 4's two-track sense): verify ancestry,
   mark done, handoff, assumptions.md append.

## CARRIED (not blocking)

- Registry layout posture at narrow widths (from 1825 handoff): ancestor of
  REG-6, candidate future intake only.

## assumptions

New this tick:
- assumption_id: AS-ORCH-L1-202
  assumption_task: CHANGES-UI-1
  assumption_value: (D) resolved as INTERNAL SCROLL of the changes list
    (flex-column panel + overflow-y diff region, --questions precedent)
    rather than a "+N more" row cap.
  assumption_where: .hermes/plans/2026-10-20_1340-CHANGES-UI-1-changes-panel-honesty-and-scroll.md
  assumption_why_missing: the task block explicitly delegates the pick to the
    spec ("spec picks ONE"); the --questions incident (ai.css comment
    2026-09-20) supplies an in-file precedent the orch verified first-hand.
  assumption_affects: reviewer gate asserts the diff container is the scroll
    region; the cap-rows alternative would assert a different DOM.
  assumption_reversible: true (CSS-only swap).
  assumption_evidence_debt: false (gate tests the picked behavior end-to-end).
  assumption_cleanup: none needed unless Brad prefers the row cap.
  assumption_owner: orchestrator.
- assumption_id: AS-ORCH-L1-203
  assumption_task: CHANGES-UI-1
  assumption_value: composition row render shape "add_material · <wells> ·
    <mixLabel> (<comp> as <role>; ...) · <amount> · on <labware>" with roles
    verbatim from snapshot data, no concentration inside the row.
  assumption_where: same spec, defect (A) section.
  assumption_why_missing: the list says "component labels with roles" but not
    the exact string grammar; draftChanges' existing fragment grammar (" · ")
    is the only source convention.
  assumption_affects: unit-test assertions + reviewer readability judgment.
  assumption_reversible: true (string-format only).
  assumption_evidence_debt: false.
  assumption_cleanup: adjust with Brad's wording preference if he objects.
  assumption_owner: orchestrator.
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096;
097; 099; 101; 119 (+post-QMS76 ext); 137 residual; 154 (interpretive only);
201 (posture, FALSE-debt confirmed closed posture-watch only).
No new evidence-debt entries opened; 200 closed last tick.

## decisions md5 sweep (unchanged)

L1-qms-field-defects-ruling-20261010.md = 1f41d8818f8864410281a79f5a40fb75
L1-wave3-followup-rulings-20261017.md = dcc03382b945287ce804bbab2518a810
