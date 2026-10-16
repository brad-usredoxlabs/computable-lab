# QMS7-3 lane handoff — lifecycle coverage COMPLETE (implementation)

Date: 2026-10-16  lane 1  coder l1t0400
Worktree: /mnt/vast/home/brad/git/wt/QMS7-3-lane1-l1t0400  branch wt/QMS7-3-lane1-l1t0400 (off trunk 7137b1c0)
Spec: .hermes/plans/2026-10-16_QMS7-3-lifecycle-coverage-spec.md (PROMOTED; rulings OQ1/OQ2/OQ3/OQ4 all followed)
Full report + evidence: /home/brad/.hermes/cl/lanes/1/qms7-3-report-l1t0400.md
Evidence dir: /home/brad/.hermes/cl/lanes/1/evidence/qms7-3-l1t0400/

## What landed (4 commits: RED -> data -> loader+wiring+stamp -> test-typecheck hygiene)

- schema/core/lifecycles/registry-ops.lifecycle.yaml (NEW) — draft->active (author),
  [draft, active]->archived (approver), no unarchive, no guards (OQ2).
- schema/registry/registry-kinds.registry.yaml (NEW) — coverage DATA, exactly the 7 approved kinds (OQ3).
- 7 schema/lab/*.schema.yaml — pinned lifecycleId (enum [registry-ops]) + state (enum [draft, active, archived])
  property declarations ONLY. unevaluatedProperties/additionalProperties untouched; FAIRCommon untouched;
  governed kinds byte-for-byte untouched.
- server/src/registry/KindLifecycleRegistry.ts (+ .test.ts) — PredicateRegistry-pattern loader; throws on
  unknown lifecycleId / bad-or-non-initial defaultState / unknown kind / duplicate kind / malformed file.
  knownKinds data-derived via collectKnownKinds (schema properties.kind consts).
- server/src/lifecycle/LifecycleEngine.ts — specFor plain spec getter only.
- server/src/api/handlers/RecordHandlers.ts — createRecord region ONLY: generic data-driven stamp-at-create
  (zero kind names in TS). Absent accessor -> skip; undeclared kind -> skip; lifecycleId mismatch -> 422
  LIFECYCLE_COVERAGE_MISMATCH; non-default state -> 422 INITIAL_STATE_REQUIRED; else stamp BOTH lifecycleId+state.
  PUT/update path, LIFECYCLE_IMMUTABLE, transition gate, CONTROLLED_RECORD_LOCKED all untouched.
- server/src/server.ts — coverage load after lifecycles in the predicate-registry try/catch (OQ4 warn+continue),
  AppContext.kindLifecycleRegistry, getKindLifecycleCoverage accessor wiring.
- server/src/governance/registryOpsLifecycle.test.ts (NEW, 21 tests) — RED-first real-stack suite.

## Verification (raw tails in the evidence dir)

- RED captured before implementation (suite could not load: KindLifecycleRegistry module absent); inversion named in RED commit.
- New suites GREEN: 30/30 (21 governance + 9 loader).
- Touched set (src/governance src/lifecycle src/schema/ControlledDocumentSchemas.test.ts src/api/Api.test.ts):
  worktree 98 passed / 2 failed vs trunk 77 passed / 2 failed — comm of sorted fail lists EMPTY both directions.
  The 2 fails are pre-existing at trunk: AuditEventService.test.ts x2 + Api.test.ts harness defect (hook timeout /
  ENOENT surfaces.yaml in its minimal tmp schema dir; identical at trunk with --hookTimeout=120000).
- Zero-new-failures sweeps: src/schema+registry+security+authorization+revisions+seeds+lifecycle+governance+lint
  (trunk 12f/999p vs wt 12f/1029p, comm empty) and src/api/handlers (6f/401p both, identical).
- tsc: worktree shows 3 error lines, ALL lane-exclude symlink drift (oligoOrder.ts/sequenceRoutes.ts symlinks into
  Brad's live checkout). PROOF: with those 2 files at trunk content, tsc over the worktree WITH all QMS7-3 changes = 0.
  Trunk = 0. New test files standalone project-flag tsc = 0.
- Ownership: git diff --name-status 7137b1c0..HEAD == ownership list exactly; no HARD-OUT file touched.
- No :3001/:5174/:3092 contact; no installs; no commits outside the worktree.

## Findings for the orchestrator (NOT fixed, per spec)

1. instrument pre-existing provenance-injection defect (bait #6, proven at base with the real Ajv pipeline):
   createRecord injects createdAt/updatedAt/createdBy; instrument.schema.yaml (additionalProperties:false, no
   FAIRCommon) rejects them -> plain instrument POST already 422s at base. lifecycleId/state declared per pinned
   shape; stamp test documented via it.fails; base-behavior test pins the defect. instrument stays uncovered-live
   until a follow-up fixes the injection exemption (candidate: declare the 3 fields in instrument.schema.yaml OR
   extend the exemption list — orchestrator call).
2. OQ1 precondition for the live gate: author GRANT-QMS7-REGOPS lane data (lifecycleId registry-ops,
   roles [author, approver], userId USR-QMS-ADMIN) + ACL before the curl gate; harness tests inject the equivalent.
3. Lane-exclude symlink drift (3 tsc residuals) — queue-script artifact; orchestrator merge check should run
   tsc against trunk content, not the drifted symlinks.

## Orchestrator next actions

1. Merge branch wt/QMS7-3-lane1-l1t0400 (4 commits) into cl/integration-1.
2. Author GRANT-QMS7-REGOPS lane data (OQ1).
3. Restart lane stack (tsx --watch does not reload YAML) and run the live gate verbatim from the task list:
   POST /records equipment-class -> governed draft; PUT draft->active for the authorized role; undeclared
   transitions / unauthorized roles 422 with denial-message boundary intact; training-material still document-control.
4. Dispatch cl-browser-reviewer only if the item's acceptance includes UI surfaces — this item has none (QMS7-5/6 own UI).
