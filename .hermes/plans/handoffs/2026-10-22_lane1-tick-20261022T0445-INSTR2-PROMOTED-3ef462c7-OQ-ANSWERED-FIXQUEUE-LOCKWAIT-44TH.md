# Handoff — lane 1 tick 2026-10-22 04:41 → INSTR-COLLAPSE-2 spec PROMOTED (3ef462c7, OQ-A/B/C answered); QMS8-C fix queue still flock-waiting behind lane-2 coder; all gates armed — 44th

Author: orchestrator cron tick l1t0445 — lane 1 only. :3001/:5174 never touched.
All git via -c core.fileMode=false. Budget ~04:41→~04:58. ZERO coder dispatches
(fleet lock legitimately held by lane-2; verified via lsof, not the pid file).

## Reconcile (first-hand)

1. FLEET LOCK: lsof holders = lane-2 queue bash 3144140 + hermes coder 3180038
   (REVISE-GHOST-1, ALIVE 1h33m at check — within 2-4h expectation) + my fix-queue
   flock 3231655 waiting. Fleet rule honored: exactly ONE live coder (lane-2's). No
   lane-1 coder dispatchable. My unit cl-l1-qms8c-fix1-0345 (pid 3231648) alive since
   03:34, log shows QUEUE-WAIT only — self-fires the QMS8-C fix run on release. Do NOT
   duplicate.
2. QMS8-C artifacts unchanged: no qms8c-fix1-report-l1t0330.md yet, no
   advreview-qms8c-cycle2-l1t0345.md yet (correct — fix hasn't started). Waiter
   cl-l1-wait-advreview-qms8c-v3 active (armed, watches the runner via the marker).
3. COMPOSER DONE: cl-l1-speccomposer-instr2-0310 exited; draft landed on disk
   (drafts/DRAFT-2026-10-22T0310-INSTR-COLLAPSE-2-spec.md, 461 lines,
   STATUS: draft-complete). REVIEWED end-to-end this tick and PROMOTED (see below).
4. Decision watch (cleanbreak) md5 8b67f579a7029913ba9151cd4f099e51 UNCHANGED —
   not re-asked (unchanged human question rule).
5. Stack :3092/:5192 both 200. Trunk was f8f49dc1 docs-only; now 3ef462c7 (docs-only
   promotion commit) — no YAML shipped, NO restart needed. Branch cl/lane1-qms8c-l1t2205
   tip d044fafd awaiting fix run.

## INSTR-COLLAPSE-2 spec promotion (the tick's substantive deliverable)

Canonical: .hermes/plans/2026-10-22_instr-collapse-2-kind-deletion-spec.md @ commit
3ef462c7. Draft md5 65c79c4e8c48c263f42923d3e06c6016 (draft copy left in drafts/).
Orch survey spot-check at trunk c53d2a69 CONFIRMED every load-bearing cite first-hand:
RecordEditController.ts:312 'instrument':'INS' row; InstrumentApplianceJob.ts:126
type:'instrument' emitter; registry-kinds.registry.yaml:14 instrument entry; OWN-LAB
seed row :86; verb-read.yaml:6 domain analytical_readout; ReadPlateModal.tsx:55-56
positional recordRef('instrument/gemini-em','instrument') emitter (composer's DELTA —
the second emitter the object-literal grep cannot see — CONFIRMED real); REGISTRY_TABS
instruments row :27.
OQ answers (binding, applied inline in the spec's OQ section):
- OQ-A = (i): client-side derivation in RecordRegistryPage from the three existing
  listRecordsByKind reads; NO new API surface.
- OQ-B CONFIRMED: measurement-capable iff instance-OR-class join resolves >=1 capability
  whose verbRef verb-definition record declares domain: analytical_readout (resolved from
  record data, never a verb-id literal — H1-clean, enum term is declared schema data).
- OQ-C(1): 'Measurement-capable' toggle pill on the Equipment tab (no kind-shaped
  pseudo-tab). (2) RecordSearchHandlers kindHints 'instrument' row: DELETE ratified.
  (3) settled — QMS8-C lands 'Equipment' label via D8-i; C5 keeps only the assertion.
Task-list spec-path line updated (6955) via lock-held staged tmp+rename.
The draft's quality was high: scope split honors the deletion-after-retarget gate, the
blessed-keep allow-list matches the OQ-1/cleanbreak rulings, the reviewer-bait section
pre-empts over-collapse and pin-weakening. No amendments beyond the OQ block.

## NEXT TICK checklist (inherits l1t0400 items 1-8; deltas marked)

1. Fix run: reconcile logs/coder-QMS8C-fix1-l1t0330.log (expect LOCK-ACQUIRED line) +
   qms8c-fix1-report-l1t0330.md. If EXITED without STATUS: complete -> re-dispatch the
   SAME brief once (unique report suffix l1<tick>); do NOT redo the rollout.
2. Cycle-2 adv report advreview-qms8c-cycle2-l1t0345.md -> VERDICT. Max 2 cycles; on a
   second FIX verdict route to architect with evidence.
3. ORCH VERIFY on ACCEPT: blocker-matrix probes; vitest delta vs md5
   7393960e9c93a49a36dd4dddb1ff9897 (AS-ORCH-L1-237); server tsc delta; app tsc delta vs
   the 23-error trunk pin tsc-trunk-f8f49dc1-app-l1t0400.txt; grep proofs re-run.
4. MERGE --no-ff cl/lane1-qms8c-l1t2205 -> cl/integration-1 (merge-tree preview 0 hunks;
   re-inspect trunk). YAML ships => cl-lane-stack.sh 1 restart (background=true) first.
5. RUNTIME apply-lap (orch-only): CONFIG_PATH=.../lane1-config.yaml npx tsx
   src/scripts/migrateRecordLifecycles.ts dry -> --apply -> re-dry 0 planned. EXPECT 6
   BLOCKED CONTROLLED_RECORD_LOCKED archived records; acceptable under Brad's
   all-records-are-test-data ruling; record it. Closes AS-ORCH-L1-232.
6. Browser gate LAST (registry EQP-NEW-7LS1 Draft, status field absent; LabCollectionView
   'Equipment'), tier-1 cl-browser-reviewer vs :5192, receipts
   ~/.hermes/cl/receipts/QMS8-C/<ts>/, ladder per SOUL 6c.
7. Mark QMS8-C done + handoff + promote artifacts. THEN claim INSTR-COLLAPSE-1
   (fleet lock; wt/INSTR-COLLAPSE-1-lane1-<ts>; re-pin the emitter greps at claim).
   INSTR-COLLAPSE-2's spec is NOW canonical — no composer wait remains behind it.
8. Follow-up future items when convenient: engine-initial-state fallback
   (AS-ORCH-L1-243), ProtocolCompileMonolithPass engine-absent posture (OBS-B).

## assumptions:

New: none of the evidentiary kind this tick (promotion review verified cites first-hand;
the OQ answers are recorded rulings in the spec, not assumptions).
Carried open (unchanged unless noted): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096;
097; 099; 101; 119 (+post-QMS76 ext); 137 residual; 154; 201 (posture-watch); 206; 209;
210; 211; 212; 217; 218; 219; 221; 227 (VPDF-4 fail-branch unit-only posture); 228
(historical, keep); 229; 230; 236 (evidence debt — clears on a no-draft button click in
any later gate); 237 (QMS8-C adopted REPAIRED baseline — operative); 238 (collapse split
+ OQ2/OQ3 blessings); 239 (cleanbreak addendum); 240 (comment-only pending edits adopted
— CONFIRMED good by cycle-1 review), 241 (waiter-v1 defect lesson — v3 applies it), 242
(state-erasure contract — binding on fix run + cycle-2), 243 (defect-3 deferral), 244
(pid-file liveness via lsof — operative).
AS-ORCH-L1-232 STILL OPEN (closes with the QMS8-C merge apply-lap receipts, item 5).

## live-worker checkpoint (budget expiry state)

- Lane-2 coder REVISE-GHOST-1 hermes pid 3180038 (queue bash 3144140): ALIVE 1h33m —
  holds the fleet lock; releases on runner exit -> my queue self-fires. NOT mine to touch.
- FIX-RUN-1 queue runner cl-l1-qms8c-fix1-0345 pid 3231648: ALIVE, flock-waiting,
  self-fires. Do not duplicate.
- cl-l1-wait-advreview-qms8c-v3: armed, watches the fix runner via the marker.
- Composer instr2: FINISHED (draft promoted this tick). No composer live on thunderbeast.
- Lane stack :3092/:5192 both 200. Trunk HEAD 3ef462c7 (docs-only since l1t0400).
