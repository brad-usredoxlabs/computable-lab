# QMS Governance Runtime — Handoff (2026-09-27)

## Status: plan executed and committed

Commit `56740422` — feat(governance): QMS governance runtime — roles, e-signatures, audit events, policy-driven strictness (42 files, +4701).
Plan of record: `.hermes/plans/2026-09-26_203123-qms-governance-gap-plan.md` (includes an Execution Outcome section).
Spec of record: `specs/computable-lab-qms-governance-architecture.md` (implementation-status appendix §1–§27 appended at its foot).

## What landed (all verified by parent-run tests, not child self-reports)

1. Actor truth (plan Phases 1). Lifecycle transitions act as the authenticated
   session user. The spoofable `x-actor-id` header no longer feeds the gate.
   Regression: `RecordHandlers.lifecycle.test.ts` (spoof header loses to session user).
   `MaterialLifecycleHandlers` gained the optional `security.identityService` param.

2. Roles (Phase 2). `role-grant` records (`schema/identity/role-grant.schema.yaml`,
   GRANT-, userId + optional lifecycleId scope + roles[]) interpreted by
   `server/src/security/RoleResolver.ts`. LifecycleContext gained
   `actorRoles` / `enforceTransitionRoles`; transition `role:` now enforced when
   the active policy bundle resolves `enforceTransitionRoles: deny`
   (POL-TRACKED, POL-REGULATED = deny; sandbox/notebook = allow). `requires_role`
   guard added to the DSL (meta-schema + both interpreters, pinned equal by an
   advisory-mirror cross-check in `LifecycleEngine.roles.test.ts`).
   `lifecycleMiddleware.extractRoleAssignments()` maps any `<role>Ref` payload
   key to snake_case roles generically (steward etc. need no code change).

3. Transitions endpoint (Phase 3). `GET /lifecycle/:lifecycleId/transitions?recordId=`
   (`LifecycleHandlers`), preview deliberately permissive (write path enforces).
   Frontend client now sends recordId; DocumentControlBar finally gets real data
   (the endpoint it called never existed before — it swallowed 404 -> []).

4. E-signatures (Phase 4). `signature` record (`schema/governance/signature.schema.yaml`,
   SIG-; action enum; binds `subject.gitCommit`; authentication.method
   = password_reauthentication). `POST /signatures` (`SignatureHandlers`): step-up
   password re-auth via CredentialStore, signer ALWAYS from session, 403
   REAUTH_FAILED uniform. `requires_signature` guard fails closed unless the
   transition declares `signatureAction` in YAML (zero TS role→action mapping).
   Opt-in lifecycle `document-controlled-signing` (= document-control + signature
   gates on in_review→approved and approved→effective); existing document-control
   records untouched.

5. Audit (Phase 5). `audit-event` record (EVT-, `schema/governance/`).
   `server/src/governance/AuditEventService.ts` appends on governed transitions
   (`lifecycle_transition`, data carries from/to/event/lifecycleId/commitSha) and
   signature application (`signature_applied`); internal try/catch, never fails
   the business op. `server.appendOnlyKinds` config (default
   ['audit-event','signature']) -> 405 APPEND_ONLY on update/delete.

6. Policy-driven strictness (Phase 6). `enforceTransitionRoles: PolicyDisposition`
   in CompilerPolicySettings + meta-schema + all four bundle YAMLs; wired live
   through server.ts accessors (same pattern as materialTracking — survives
   runtime config patching). `governanceStrictness.test.ts` is the executable
   proof of spec §15: same schemas, sandbox permissive-but-structured, regulated
   denies, role-grant unblocks + audit lands, signing gate fails closed /
   satisfied by presented signature, audit tamper -> 405.

7. Docs (Phase 7). `docs/agent/API_MAP.md` (routes, UPDATE chain, call-chain
   section, Core Files rows) and `docs/agent/DATA_MODEL.md` (kinds + mechanics)
   updated; spec appendix DONE/PARTIAL/DEFERRED table.

Verification at commit: server typecheck exit 0; governance suites 62/62;
strictness 4/4. Full-suite attribution done via baseline worktree: zero
regressions attributable to this work — all remaining red is pre-existing at
HEAD 959ca0c1 or belongs to the concurrent intake/lab-sync session's untracked
tests.

## NOT implemented — deferred deliberately, not faked

From the plan (explicit descopes):
- Task 6.2 data-driven PolicyBundleSelector — DONE 2026-09-27 (uncommitted
  alongside the shared tree). GET /settings/lab now returns
  `availablePolicyBundles` (presentation fields from
  `policyBundleService.listBundles()`); the selector renders that with zero
  hardcoded catalog (empty -> "No policy bundles reported by server"). The
  switch routes through the real config-write endpoint PATCH /api/config
  `{ lab: { policyBundleId } }` (the old client `patchLabSettings` targeted a
  nonexistent PATCH /settings/lab and is deleted). ConfigHandlers gained a
  fail-closed guard: 400 on an unknown `lab.policyBundleId`, validated against
  the live bundle catalog wired in server.ts. Live switching needs no restart
  (getPolicySettings accessors re-read ctx.appConfig per request).
  Tests: LabSettingsHandlers.test.ts, configHandlers.test.ts,
  app/src/shell/settings/PolicyBundleSelector.test.tsx. Still NO
  bundle-switch authorization gate — any session that can PATCH /config can
  pick POL-SANDBOX; wire to role-grant if that ever matters.
- Task 1.2 (envelope actor stamping): skipped as unnecessary — update actor was
  already carried; re-verify if meta actor provenance ever proves thin.
- Audit hook coverage: only `lifecycle_transition` and `signature_applied`
  emit. Spec §10's login/run_started/sample_accessioned etc. need hooks at
  their call sites; the service is the reusable piece.

From the spec appendix (PARTIAL/DEFERRED rows):
- §5 semantic version state: authoritative-version pinning rides on transition
  audit events' data.commitSha; no first-class `governance:` envelope block
  (§24 allows graph-queryable representation, nobody built the query).
- §9 re-auth mechanisms: password only. Passkey/WebAuthn/hardware-key per
  policy package is open.
- §12 `record_correction` schema (old_value/new_value/reason amendment records).
  Next natural spec drop; corrections currently rely on git history.
- §17–20 controlled-use enforcement: preconditions gating
  planned→in_progress (method effective, operator authorized, calibration
  valid, reagents in-date) NOT wired to the new role/signature machinery.
  competency-authorization/calibration records exist but the run-start
  transition does not query them yet. This is the highest-value follow-on.
- §21 general policy-query API ("can this actor do X now?" with reasons list).
  Transition-time evaluation exists; a reusable query endpoint does not.
- §26 Test-your-food domain package (order→sample→report workflow records).
  Own spec drop. Note: the concurrent session's lab-sync worker is adjacent
  plumbing to that deployment.
- Bypass audit: grep non-RecordHandlers `store.update` callers that mutate
  lifecycle-managed `state` (ingestion promoters etc.) — any that do are holes
  in the gate until they call `checkLifecycleTransition` or route through the
  record API.

## Design decisions a successor must not re-litigate

- Role satisfaction = actor HOLDS role (grant) OR is the assigned person
  (`<role>Ref`); enforcement skipped entirely when bundle says allow.
- `requires_signature` fails closed when `signatureAction` undeclared; the
  action↔transition mapping lives ONLY in lifecycle YAML.
- Preview endpoint is permissive by design; a bar button yielding a server 422
  under regulated bundles is the intended behavior, not a bug to "fix" by
  making preview bundle-aware (one-liner if the UI ever complains).
- Signature binding = commit sha at signing time, not hash of the pending
  next-payload. Auditor-acceptability is an open question, deliberately not
  over-engineered.
- Role-grant privilege escalation is UNRESOLVED (flagged in plan risks):
  v1 has no guard preventing a user from authoring a role-grant for a role
  they lack. Intended stopgap is USR-LOCAL-ADMIN-only grant authoring; enforce
  before exposing grants to non-admin UI.
- Guards are duplicated in LifecycleEngine.guardsPass and
  lifecycleCompiler.createGuardFunction (compiler path is ADVISORY — nothing
  calls .transition() on it). Cross-check test pins equality. Long-term: make
  one the single interpreter.
- LifecycleContext fields are REQUIRED arrays/bools (never optional) due to
  exactOptionalPropertyTypes; callers set []/false.

## Environment caveats

- Working tree is shared with Brad's live intake/lab-sync session: 1888
  modified files + untracked lab-sync/ code are THEIRS, uncommitted. The
  governance commit excluded their hunks via index surgery (stripped lab-sync
  lines, staged, restored). Expect their next commit to re-touch server.ts /
  routes.ts / config/types.ts near ours.
- Never run unfiltered vitest as a health signal here — the shared tree's
  baseline is red (116 server files at HEAD baseline). Use targeted filters;
  attribute full-suite noise via the pre-change-test-baseline worktree method.
