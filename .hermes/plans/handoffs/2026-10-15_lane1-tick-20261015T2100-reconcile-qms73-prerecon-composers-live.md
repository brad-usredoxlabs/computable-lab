# Handoff — lane 1 tick 2026-10-15 21:02–22:50 EDT (RECONCILE: both wave-3 composers ALIVE with motion; QMS7-3 pre-recon banked)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. :3092 200 + :5192 200
throughout (no restarts — no YAML merged).

## Reconciliation at tick start (verified first-hand)

1. Trunk cl/integration-1 @ **71412415** unchanged (porcelain -uno clean). Both wave-3 spec
   drafts (QMS7-2 `..._1930-...l1t1920.md`, QMS7-1 `..._1935-...l1t1920.md`) NOT yet on disk.
2. cl-spec-composer QMS7-2 wrapper 1511602 / hermes pid 1511664 ALIVE (started 19:34);
   QMS7-1 wrapper 1533802 / pid 1533864 ALIVE (started 19:43). Liveness proven via
   profile state.db session rows, NOT the wrapper logs (which only carry the START line):
   session 20261015_193406_fe2f6f grew 49→69 messages, last 22:38:59; session
   20261015_194324_3faf4a grew 56→70 messages, last 22:38:28. Both past the 2x expected
   duration (~45 min) but with CONTINUOUS FORWARD MOTION — per SOUL 7b idle-past-deadline
   counts as dead; motion does not. DO NOT re-dispatch and do not re-shoot at a higher tier
   while motion continues; composers write their draft file only near the end of the run.
   Recent tool-result excerpts inspected: QMS7-2 session is probing the live PUT asymmetry
   (`Record not found: EQC-QUANTSTUDIO5` HTTP response in-session) and reading the
   lifecycle-bypass predicate; QMS7-1 session is reading useSurfaceContext (the ONE
   page→AI-context builder) — exactly the required RightPane-context recon. On-track.
3. Fleet coder lock: flock -n probe returned FREE (pid-file residue names 1351193 = lane 2's
   SH-QB-1 wrapper, confirmed gone). NOT acquired — no promoted spec exists yet, so there was
   nothing to dispatch; spec promotion is the gate, not the lock.
4. Thunderbeast: 2 composers + lane 2's SH-QA-3 composer (pid 951631, gone by this tick's ps)
   + myself — under cap at checkpoint.
5. Cheap gate: 0 due/changed blockers. OWN-14 decisions/ check: no new due item surfaced this
   tick; OWN-12 gate-owner watch unchanged — no dispatchable action.

## Work done this tick (no dispatches were legal; prep + verification instead)

1. **Independent reproduction of the QMS7-2 defect** at :3092: GET /api/records/EQC-QUANTSTUDIO5
   200 (seed-resolved), PUT with a probe body -> `BAD_REQUEST payload is required` (not the
   404 — my probe was invalid-body so it failed earlier than the store lookup; the composer's
   own session shows the real PUT 404 reproduced). Seed file confirmed at
   records/seed/equipment-class/eqc-quantstudio5.yaml (same for eqp-quantstudio5,
   ecp-quantstudio5, ecp-qpcr-kind).
2. **Store asymmetry verified first-hand** (RecordStoreImpl.ts @ 71412415): get() :247-249 falls
   back to getSeedRecord :224; list() seed-merge at :439-440; updateUnlocked :635-639 and
   deleteUnlocked :806 resolve via findRecordPath ONLY. withRecordLock wraps create :465,
   update :632, delete :799. append-only wall :660/:825 uses config.appendOnlyKinds (data-fed,
   keep generic). seedDir wired via server.ts:504-509 resolveSeedRecordsDir(). No
   promotion/provenance vocabulary exists in the store yet.
3. **QMS7-3 PRE-RECON banked** (todo item, will be next claimed once a coder frees):
   - Lifecycle loader: server.ts:448-452 loads schema/core/lifecycles (6 files today); meta
     schema schema/core/lifecycle.meta.schema.yaml requires [lifecycleVersion, id, states,
     transitions], states support initial/terminal.
   - Governed kinds to keep untouched: controlled-document + training-material
     (document-control), material, material-spec, protocol, role-grant, request, sample, term,
     audit-event, signature (grep of lifecycleId across *.schema.yaml).
   - Plain registry kinds WITHOUT lifecycleId (QMS7-3 targets): person, equipment,
     equipment-class, training-record, competency-authorization,
     equipment-training-requirement, instrument, calibration-record, qualification-record,
     verb-definition, equipment-capability.
   - **LANDMINE (verified): equipment-class.schema.yaml:44 payload `additionalProperties:
     false`, and schema/core/common.schema.yaml (FAIRCommon) declares NO lifecycleId/state.**
     A create-time stamp of lifecycleId/state on such kinds FAILS payload validation unless
     the declaration lands in data the right way (per-schema fields, or a FAIRCommon
     addition reviewed against every consumer). The composer spec MUST pin the shape;
     do NOT let a coder open additionalProperties as the fix.
   - Existing create-path precedent is HARDCODED kind switches in RecordHandlers.ts
     (~:523-538: protocol force-state draft, controlled-document force-state, access-policy)
     — the exact anti-pattern QMS7-3's "declare, don't branch" replaces; the new stamping
     must be data-driven and the spec should say whether the legacy switches stay (they are
     governed kinds with their own lifecycles).
   - PUT lifecycle-change guard :847-849 LIFECYCLE_IMMUTABLE exists (governed records cannot
     discard lifecycleId) — matches QMS7-3's verified-by claim.
   - No engine-side initial-state stamping exists (LifecycleEngine has no `initial` writer).

## Live at checkpoint (do NOT duplicate)

- cl-spec-composer QMS7-2: pid 1511664 (wrapper 1511602), session 20261015_193406_fe2f6f,
  log /home/brad/.hermes/cl/lanes/1/logs/composer-QMS72-l1t1920.log, draft path
  .hermes/plans/2026-10-15_1930-QMS7-2-seed-cow-spec-draft-l1t1920.md — ALIVE, motion 22:38.
- cl-spec-composer QMS7-1: pid 1533864 (wrapper 1533802), session 20261015_194324_3faf4a,
  log logs/composer-QMS71-l1t1920.log, draft path
  .hermes/plans/2026-10-15_1935-QMS7-1-registry-shell-spec-draft-l1t1920.md — ALIVE, motion 22:38.
- No coder dispatched (correct: fleet-single, and specs are pre-promotion).
- :3092/:5192 200; trunk 71412415; lane data-repo clean; fleet lock FREE.

## Next tick (ordered)

1. Reconcile both composers: gone + draft present + END-line (`SPEC-DRAFT-QMS71/2 DONE`) ->
   review cites myself (spot-check every file:line at tip), rule OQs (QMS7-2 delete()-
   asymmetry; QMS7-1 WorkspaceTab kind + AI-context channel — note the composer session was
   reading useSurfaceContext, its answer likely resolves the channel OQ), promote via cp to
   canonical .hermes/plans/2026-10-15_QMS7-{1,2}-spec.md, link in task block.
2. Dispatch QMS7-2 coder via the fleet-locked queue-*.sh pattern (queue-docingest-b.sh minus
   the dispatch-gate guard; worktree /mnt/vast/home/brad/git/wt/QMS7-2-lane1-<ts> off tip,
   node_modules symlinks + lane-exclude loop exactly as in that launcher). QMS7-1 coder waits
   for the fleet lock (app-side, but the fleet-single rule binds the cl-coder endpoint).
3. If a composer DIED without a draft: re-shoot the deliverable via the orchestrator-authored
   route (I hold enough recon to write QMS7-2's spec directly; flag PROVISIONAL for architect
   ratification per SOUL 7b).
4. When a coder slot frees AND QMS7-3 is next: claim QMS7-3 + dispatch composer, seeding it
   with this handoff's §QMS7-3 PRE-RECON (especially the additionalProperties landmine).
5. OWN-14 silent decisions/ check; OWN-12 gate-owner watch — unchanged pattern.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-068 (OWN-14's gate); AS-ORCH-L1-082 (record-only);
  AS-ORCH-L1-087 PARTIAL; AS-ORCH-L1-088; AS-ORCH-L1-089; AS-ORCH-L1-096; AS-ORCH-L1-097.
  assumptions.md untouched this tick — NO new assumptions (no consequential values supplied;
  all recon facts verified first-hand at tip).
- Record-only carry-forward unchanged (see handoff 2026-10-14_lane1-tick-20261014T0005).

## assumptions
(empty — recon-only tick; every finding above is first-hand verified at trunk 71412415,
no substituted values.)
