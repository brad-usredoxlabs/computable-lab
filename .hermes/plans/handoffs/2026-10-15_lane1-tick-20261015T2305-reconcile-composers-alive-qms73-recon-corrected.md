# Handoff — lane 1 tick 2026-10-15 23:00–23:15 EDT (RECONCILE: both wave-3 composers ALIVE with fresh motion; QMS7-3 recon CORRECTED at tip)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. :3092 200 + :5192 200
(direct curl; no restarts — no YAML merged). Trunk cl/integration-1 @ **71412415**, porcelain
-uno clean. Lane data-repo index.lock absent.

## Reconciliation at tick start (verified first-hand)

1. cl-spec-composer QMS7-2: wrapper 1511602 / hermes pid 1511664 ALIVE (elapsed 3h34m at
   check). Liveness proven via cl-spec-composer state.db session 20261015_193406_fe2f6f:
   messages grew 69 (last tick) → 73, last message 22:56:18, session last_activity
   23:03:49 "waiting for stream response" — CONTINUOUS MOTION.
2. cl-spec-composer QMS7-1: wrapper 1533802 / pid 1533864 ALIVE (3h25m). Session
   20261015_194324_3faf4a: 70 → 79 messages, last message 22:59:22, last_activity
   23:04:10 "receiving stream response".
3. Both past 2x expected duration, but per SOUL 7b the escalation trigger is IDLE-past-
   deadline, not elapsed: both show minute-fresh motion, so no re-shoot. Composers write
   their draft file only near the end of the run; neither draft path exists yet:
   .hermes/plans/2026-10-15_1930-QMS7-2-seed-cow-spec-draft-l1t1920.md,
   .hermes/plans/2026-10-15_1935-QMS7-1-registry-shell-spec-draft-l1t1920.md.
   DO NOT re-dispatch while motion continues.
4. Fleet coder lock: flock -n probe FREE (pid-file residue names lane-2's 1351193, wrapper
   gone). NOT acquired — no promoted spec exists; spec promotion is the gate, not the lock.
5. Thunderbeast live sessions this tick: 2 composers + this orch + lane-2's SH-QB-1 browser
   gate (tier-1, on computable, not thunderbeast) + lane-2 orch — at/near cap; nothing else
   launchable there regardless.
6. Cheap gate: 0 due/changed blockers. OWN-14: decisions ruling md5 1f41d881 UNCHANGED,
   readiness fingerprint df885500 UNCHANGED (attempts=7) — NOT re-asked. OWN-12 gate-owner
   watch unchanged. Change sweep (-newermt 2026-10-15 19:00) across decisions/, specs/inbox,
   lane plans/ (excl. handoffs): EMPTY — no new human input.

## QMS7-3 PRE-RECON — CORRECTED anchors (verified first-hand at tip 71412415; supersedes the
## banked §QMS7-3 in handoff 2026-10-15_lane1-tick-20261015T2100 where they differ)

- **Landmine is SHARPER than banked**: equipment-class.schema.yaml:10 is
  `unevaluatedProperties: false` at the TOP level (the :44 additionalProperties belongs to
  readinessRequirements only). schema/core/common.schema.yaml FAIRCommon declares NO
  `lifecycleId` and NO `state` (grep count 0). So a create-time stamp of lifecycleId/state on
  equipment-class fails validation under BOTH gates unless the declaration lands as per-schema
  fields or a reviewed FAIRCommon addition. Composer spec MUST pin the shape; coder must NOT
  open unevaluatedProperties as the fix.
- All 7 registry kinds re-checked first-hand, none declare lifecycleId: person, equipment,
  equipment-class, training-record, competency-authorization, instrument, calibration-record.
- Governed (keep untouched): controlled-document, training-material, material, material-spec,
  protocol, role-grant, request, sample, term, audit-event, signature (+ tyf order.schema in
  domains/test-your-food, and material-profile.registry.yaml reference).
- Lifecycle loader: server/src/server.ts ~:449-451 (`resolve(schemaDir,'core/lifecycles')` +
  loadLifecyclesFromDir); 6 lifecycle files in schema/core/lifecycles/.
- lifecycle.meta.schema.yaml: required [lifecycleVersion, id, states, transitions]; states
  support initial/terminal booleans; transitions require from/to/role, optional label +
  guards. additionalProperties:false throughout.
- Create-path hardcoded precedent CONFIRMED at server/src/api/handlers/RecordHandlers.ts
  (NOTE the path: api/handlers/, not handlers/): :529-533 protocol force version+state draft;
  :534-536 controlled-document INITIAL_STATE_REQUIRED; :537+ access-policy resource check;
  :524-528 SYSTEM_OWNED kinds wall. This is the anti-pattern QMS7-3's "declare, don't branch"
  replaces for registry kinds; legacy switches stay (governed kinds).
- PUT lifecycle-change guard: RecordHandlers.ts:848 LIFECYCLE_IMMUTABLE 409.

## Live at checkpoint (do NOT duplicate)

- cl-spec-composer QMS7-2: pid 1511664 (wrapper 1511602), session 20261015_193406_fe2f6f,
  log /home/brad/.hermes/cl/lanes/1/logs/composer-QMS72-l1t1920.log, draft
  .hermes/plans/2026-10-15_1930-QMS7-2-seed-cow-spec-draft-l1t1920.md — motion 23:03.
- cl-spec-composer QMS7-1: pid 1533864 (wrapper 1533802), session 20261015_194324_3faf4a,
  log logs/composer-QMS71-l1t1920.log, draft
  .hermes/plans/2026-10-15_1935-QMS7-1-registry-shell-spec-draft-l1t1920.md — motion 23:04.
- No coder dispatched (correct: fleet-single rule AND specs pre-promotion).
- :3092/:5192 200; trunk 71412415 clean; fleet lock FREE.

## Next tick (ordered)

1. Reconcile both composers. Gone + draft on disk + END-line (SPEC-DRAFT-QMS72/QMS71 DONE) →
   review cites myself at tip (spot-check every file:line), rule their OQs (QMS7-2: delete()
   asymmetry recommendation; QMS7-1: WorkspaceTab kind + AI-context channel), promote via cp
   to canonical .hermes/plans/2026-10-15_QMS7-{1,2}-spec.md, link in task block.
2. Promote whichever lands first; acquire the fleet lock; dispatch that item's cl-coder via
   the queue-*.sh pattern (worktree /mnt/vast/home/brad/git/wt/<item>-lane1-<ts> off tip,
   node_modules symlinks + lane-exclude loop as in queue-docingest-b.sh). QMS7-1 app-side vs
   QMS7-2 server-side are disjoint — the FIRST coder starts immediately; the second waits for
   the fleet slot.
3. If a composer DIED without a draft: orchestrator-authored PROVISIONAL spec route (SOUL 7b)
   — I hold enough recon for both.
4. When a coder slot frees AND both wave-3 specs are coding: claim QMS7-3, dispatch its
   composer seeded with the CORRECTED recon above (esp. the unevaluatedProperties landmine and
   the api/handlers/ path).
5. OWN-14 silent decisions/ check (md5 watch); OWN-12 gate-owner watch — unchanged pattern.

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-068 (OWN-14's gate); AS-ORCH-L1-082 (record-only);
  AS-ORCH-L1-087 PARTIAL; AS-ORCH-L1-088; AS-ORCH-L1-089; AS-ORCH-L1-096; AS-ORCH-L1-097.
- assumptions.md untouched this tick — NO new assumptions (recon-only; every finding verified
  first-hand at tip; no substituted values).
- Record-only carry-forward unchanged (see handoff 2026-10-14_lane1-tick-20261014T0005).

## assumptions
(empty — recon-only tick; every finding above is first-hand verified at trunk 71412415.)

## APPENDED at budget checkpoint (tick end ~00:15 EDT)

Composers still ALIVE with motion at tick end: QMS7-2 session 79 msgs, last 00:06:48; QMS7-1
session 87 msgs, last 00:03:49. Elapsed ~4.5-4.7h = 6x expected duration: past the SOUL-7b 3x
threshold, but the re-dispatch trigger is IDLE-past-deadline and both stream continuously.
ESCALATION NOW PINNED for the next tick (do not simply "leave running"): if either session
shows >=30 min no message growth, or neither draft exists by ~05:00 EDT, the composer is
treated as exhausted for deliverable purposes -> orchestrator-authored PROVISIONAL spec route
(SOUL 7b; I hold complete verified recon for BOTH items at tip 71412415 — the T2100 handoff +
this handoff's corrected §QMS7-3 recon + the composer prompts at
/home/brad/.hermes/cl/lanes/1/prompts/composer-QMS7{1,2}-l1t1920.txt contain the full approved
intent), flagged PROVISIONAL for architect ratification. A late composer draft that lands
afterwards becomes input for ratification, not a competing authority. If a live composer's
draft lands FIRST, it is reviewed/promoted as normal. Trunk still 71412415 clean; :3092/:5192
200; fleet lock FREE (nothing promotable); OWN-14 md5 unchanged, not re-asked; 0 due blockers;
no new assumptions.
