# Handoff — lane 1 tick 2026-10-20 20:30 → QMS8-B coder LIVE at 2x-watch · VPDF-3 spec composed+promoted (spec-ready, coder-slot gated)

Author: orchestrator cron tick l1t1920 — lane 1. :3001/:5174 never touched. All git via -c core.fileMode=false.

## Reconciliation (first-hand)

- QMS8-B coder (pid 2694522): ALIVE, 1h55m at 20:24 (dispatch 18:49; expected 45-90 min, due-check
  19:35 passed, now exactly at the 2x-watch ~20:25). Forward motion proven first-hand, not inferred:
  branch commits d38f832d (RED suite) + a4f769e2 (D1 scoped rolesFor + D2B gateOnPolicySetting) on
  cl/lane1-qms8b-l1t1845; worktree file writes continuous through 20:08 (AuthoringGuard.ts,
  RecordHandlers.ts, lint/policy types, PolicyProfileService + test, instrument.lint.yaml, all four
  policy bundles); cl-coder state.db-wal mtime 20:08. Fleet lock held correctly (pid-file
  QMS8B(l1t1845) pid:2694522, no QUEUE-RELEASED). NOT killed, NOT re-dispatched. No commits since
  a4f769e2 as of 20:24 — per the 7b ladder this is inside the watch window (file motion + wal
  active); 3x re-route threshold ~21:15.
- IMPORTANT OBSERVATION (recorded so the next tick does not 'fix' a non-problem): the trunk
  worktree /mnt/vast/home/brad/git/cl-integration-1 is DIRTY with 11 uncommitted QMS8-B files
  (+85/-9: RecordHandlers.ts, lint/types.ts, policy types, PolicyProfileService(+test),
  instrument.lint.yaml, policy-bundle schema + 4 bundles). This is the coder's live-probe
  technique BY DESIGN (cl-lane-stack.sh serves the trunk worktree; step-6 probes require the
  server to load the edits — same procedure the 18:50 handoff ran). The coder restarted the lane
  stack from its session at 20:05; :3092 flaps 200/000 while tsx --watch reloads mid-edit (200
  confirmed sustained at 20:09-20:10). DO NOT merge/revert/stash/restart while this tree is dirty
  under the live coder. The branch commits, not the dirty tree, are the deliverable; the coder
  must leave the trunk tree clean or its report must state the residue (next tick: if coder is
  gone and trunk is still dirty with QMS8-B files, that is a cleanup obligation before merge —
  the merge brings the branch commits, and the trunk working tree gets reset to trunk content).
- No other live lane-1 workers at checkpoint (composer exited, see below).

## Actions this tick

1. QUEUE reconciled: only QMS8-B in-progress (coder live) + VPDF-3/VPDF-4 todo (VPDF-4 deps
   VPDF-3) + QMS8-C todo (deps QMS8-B). Zero due/changed blockers. Fleet lock held → no coder
   dispatch possible; per SOUL, advanced spec composition instead.
2. VPDF-3 COMMISSIONED + REVIEWED + PROMOTED. Composer dispatched 19:30 (background, thunderbeast,
   log logs/composer-VPDF3-l1t1930.log, brief briefs/composer-vpdf3-l1t1930.txt). Draft landed
   20:15 (35KB, STATUS: draft-complete). Orch reviewed all 170 lines and spot-verified four
   load-bearing recon claims FIRST-HAND: (a) appendOnlyKinds includes
   'vendor-protocol-candidate' at config/types.ts:528, wired server.ts:532/784 — the intake never
   surfaced this wall and it directly contradicts Brad's update-in-place ruling (composer's R1);
   (b) rung-vocabulary.yaml:44-47 'candidate is immutable' note is real; (c) graph-lemur ghost
   generator at VendorSearchHandlers.ts:1125/:1233; (d) live ghost ref on
   VPDF-6C821D307E98 via read-only GET :3092. The draft also found R2 (the merged AI summary is
   not schema-legal for a VPC mint — must go store.create + pure adapter, POST /records 422s —
   pinned by Wave2SemanticPassE2E.test.ts:297-307). PROMOTED to
   .hermes/plans/2026-10-20_2030-VPDF-3-honest-extraction-ladder-spec.md with the binding orch
   decisions appended IN THE FILE: OQ-1 adopt the DATA-list fix (drop the kind from
   appendOnlyKinds + W25CandidateImmutability row flips same commit + vocabulary note corrected;
   justification: Brad's 2026-10-20 ruling supersedes the W2-5 immutable-candidate posture; the
   wall moves only through its data knob, governance kinds stay walled); OQ-2 adopt
   document-level anchor + conservative pageStart:1 + AI_CHUNK_ANCHORS_APPROXIMATE diagnostic
   (no schema loosening, no fabricated pages); OQ-3 approved coder read-only probes to pick the
   intake-button documentId, delete-the-sentence fallback per task (6). Task block linked
   (spec path + status_note: spec-ready, dispatch gated on the fleet slot, rebase to trunk head
   at claim time).
3. Lane stack: verified via cl-lane-stack.sh 1 status + direct curls; backend health fluctuates
   only under the coder's watch-reloads; frontend :5192 200 steady. Not restarted by the orch
   (coder owns the tree right now).

## QUEUE STATE at checkpoint

- QMS8-B in-progress — cl-coder LIVE at 2x-watch (pid 2694522). Fleet lock held. Nothing else may
  dispatch a coder.
- VPDF-3 todo — SPEC-READY, dispatch-gated on the coder slot.
- QMS8-C todo — deps [QMS8-B]; composer NOT commissioned (its spec depends on the shipped
  authoringGate shape; per the 18:50 handoff do not pre-compose).
- VPDF-4 todo — deps [VPDF-3].

## NEXT TICK CHECKLIST

1. QMS8-B reconcile: adopt only after pid 2694522 GONE AND report
   ~/.hermes/cl/lanes/1/qms8b-report-l1t1845.md shows STATUS: complete (log
   logs/coder-QMS8B-l1t1845.log stays 0 bytes until exit — normal). If alive past 3x (~21:15)
   with NO file/wal motion, treat as dead for ownership after confirming; with motion, extend
   watch and record elapsed+assessment again.
2. On adopt: trunk-worktree cleanup check first (see IMPORTANT OBSERVATION) — restore the trunk
   working tree to clean trunk content (checkout -- . of ONLY the QMS8-B-dirty paths, never
   stash, never touch node_modules untracked entries) BEFORE merging; the merge is the branch's
   commits. Then adv gate FULL scope (~/.hermes/cl/lanes/1/advreview-qms8b-l1t<tick>.md; must
   check: the D1 scope-leak discriminator is a REAL RED-verified test, role-grant gate
   byte-identical, zero kind/lifecycle/role literals in TS, gateOnPolicySetting absent from
   role-grant lint, bundles declare authoringGate honestly) → orch self-verify (own vitest:
   instrumentAuthoring + roleGrant + governanceStrictness + denialMessage + PolicyProfileService;
   own server tsc vs the coder's pinned baseline; open the diff) → LIVE re-probe on :3092 after a
   stack restart (POL-REGULATED denial + GRANT-BRAD-REGOPS happy lap + POL-SANDBOX zero-friction;
   coder's probes do not count as mine). UI: verify the diff smuggles no app/ changes (browser
   gate only if it does).
3. After QMS8-B merges: release lock, claim VPDF-3 (spec already canonical — skip composer),
   create wt/VPDF-3-lane1-l1t<tick> off the NEW trunk head, dispatch coder with the OQ decisions
   verbatim. THEN commission VPDF-4's composer in background (its spec depends on VPDF-3's
   persist-leg shape — note the seam section in VPDF-3's spec is the shared contract; also
   QMS8-C composer once its dependency ships, queue both by tick budget).
4. If QMS8-B report is STATUS: blocked or the coder died mid-flight: preserve branch commits,
   route per persistence protocol; do not duplicate a live worker.

## CARRIED (not blocking)

- Registry layout posture at narrow widths (AS-ORCH-L1-201): future intake only.
- app/tsconfig lacks exactOptionalPropertyTypes: spec-template housekeeping (VPDF-3 spec pins it).
- POST /api/vendor/exa/search 502s from the term picker (console-clean caveat on clarify-state runs only).
- LabSettingsHandlers.test.ts 2 failures = lane-exclude symlink artifact (adv O7 proof) — do not chase.
- QMS8-A fix2 polish notes (break-word, .permissions-load-error pin list): future polish.
- Reviewer-harness lesson: orch Playwright route proven 4x (QMS7-6, CHANGES-UI-1 g4, QMS8-A g1+g2);
  prefer it after any tier-1 harness failure. VPDF-3's browser gate will likely want it.

## assumptions

New this tick: none new open. (VPDF-3's OQ decisions are recorded in the spec + here as
orchestration decisions inside approved intent, not assumptions — they rest on Brad's binding
2026-10-20 ruling; AS-ORCH-L1-216 below records the appendOnlyKinds posture change as the
consequential one.)
- AS-ORCH-L1-216 | VPDF-3 | dropping 'vendor-protocol-candidate' from appendOnlyKinds (data) |
  server/src/config/types.ts:528 (pre-merge decision, coded by the VPDF-3 run) | sources conflict:
  W2-5 immutability posture vs Brad's 2026-10-20 update-in-place ruling; no source names which
  supersedes | affects W25CandidateImmutability rows, rung-vocabulary note, candidate update path |
  reversible true (re-add the entry) | evidence_debt true UNTIL the flipped W25 tests + VPDF-3
  verified-by(1) run green — until then any immutability claim for this kind is unverifiable |
  cleanup: the VPDF-3 acceptance run | owner: orchestrator at VPDF-3 gate.
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099; 101; 119
(+post-QMS76 ext); 137 residual; 154 (interpretive only); 201 (posture-watch only); 206; 209;
210; 211; 212; 214 (reversible, QMS8-B); 215. Evidence debt: AS-ORCH-L1-216 open (above).

## decisions md5 sweep (unchanged)

L1-qms-field-defects-ruling-20261010.md = 1f41d8818f8864410281a79f5a40fb75
L1-wave3-followup-rulings-20261017.md = dcc03382b945287ce804bbab2518a810
