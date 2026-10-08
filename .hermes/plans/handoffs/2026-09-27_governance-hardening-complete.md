# Governance-hardening wave — Handoff (2026-09-27, overnight run)

Status: plan `.hermes/plans/2026-09-27_governance-hardening-wave.md` executed
through Wave A + Wave B(partial) + Wave C(spec). Parent-verified by targeted
vitest + server tsc, not child self-reports. UNCOMMITTED (shared tree).

## Landed

A1 — run-route identity binding (server/src/api/routes/run-execution.ts):
- POST /runs/:runId/start resolves ctx.localIdentityService.resolveRequestUser
  BEFORE the controlled-use gate. userId null -> 401 IDENTITY_REQUIRED (run
  stays planned). body.executedBy is DEPRECATED/optional: present-but-mismatch
  -> 403 OPERATOR_MISMATCH (stricter option per plan); payload.executedBy and
  the run_started audit actor and the git commit message are the SESSION user.
- POST /complete: same resolution; audit actor = session user (was payload
  executedBy ?? 'unknown'). Step-level executedBy untouched (deferred).
- Tests: RunStartControlGate.test.ts fake ctx gained the identity stub (7
  stay green); new RunStartIdentity.test.ts (6): no-session 401 + no
  mutation, mismatch 403, no-body executedBy accepted + audit actor proves
  session identity.

A2 — role-grant authoring guard — DECLARATIVE, no kind/role literals in TS:
- schema/identity/role-grant.lint.yaml (NEW): `authoring:` block —
  denyCode GRANT_FORBIDDEN, require.anyOf [systemActor, localAdmin,
  role=admin], guardWhenChanged [roles, userId], stampActorAs grantedBy.
  Rules VALUES live only in this YAML.
- Generic interpreter: server/src/lint/AuthoringGuard.ts (pure, zero domain
  literals). AuthoringPolicy type added to lint/types.ts LintSpec.
  LintEngine.authoringPolicyForSchema(schemaId). server.ts: zero-rule specs
  with an authoring block now reach the engine; recordHandlers security
  gained getAuthoringPolicy wired to ctx.lintEngine.
- RecordHandlers: createRecord runs the declared policy against the actor
  AFTER identity resolution (anonymous -> existing 401 UNAUTHENTICATED
  path); on pass, stamps payload.grantedBy := session user (via
  stampActorAs). updateRecord fires only when a guardWhenChanged path
  actually changes (authoringGuardFiresOnUpdate) -> 403 GRANT_FORBIDDEN.
- Tests: RecordHandlers.roleGrant.test.ts (5; loads the REAL lint YAML so
  the data-dependency is pinned). A2 child drifted ~20 min in recon and was
  stopped with its RED test intact; parent implemented against it.
- MECHANISM NOTE (open_issues per plan): the policy travels
  schema->LintSpecLoader->LintEngine->accessor; loader already tolerates
  unknown top-level blocks (no meta-schema rejection encountered).
  `localAdmin` is a platform primitive like isSystem, not a role — added to
  AuthoringRequirement because resolveRequestUser sets isSystem=false for
  the USR-LOCAL-ADMIN session itself.

A3 — bundle-switch authz + audit (configHandlers.ts, wired in server.ts by
parent — the designated contention point, single owner):
- ConfigHandlers optional 6th ctor param PolicyChangeGuard
  {resolveActor, isAdmin, appendAudit?}. Any PATCH /api/config carrying
  lab.policyBundleId AFTER the known-ids 400 validation: unresolvable actor
  or non-admin -> 403 POLICY_BUNDLE_CHANGE_FORBIDDEN (config untouched);
  accepted switch appends policy_bundle_changed {from,to} with session
  actor via AuditEventService. Guard absent -> byte-for-byte old behavior.
- server.ts wiring: resolveActor = localIdentityService; isAdmin =
  isSystem || LOCAL_ADMIN_USER_ID || RoleResolver 'admin'; appendAudit =
  auditService.append.
- Tests: configHandlers.test.ts 13 (was 3; admin pass + audit, non-admin 403
  + file unchanged, anonymous 403, isSystem actor 'system', non-policy
  patches never call the guard).

B(partial) — login audit hooks (AuthHandlers.ts): login_success /
login_failed via optional auditService ctor param, best-effort (append
throw never fails login). login_failed carries reason
(unknown_user|inactive|no_verifier|bad_password) with actor 'unknown' only
when the username is unknown. Tests: AuthHandlers.test.ts 10 (was 7).

C — run_start_ack signing decision left to Brad (bare-code ack stays);
policy-query API (§21) spec dropped:
~/.hermes/specs/inbox/2026-09-27_policy-query-api.md.

## Verification (parent-run)

117/117 across 13 targeted files (run-execution identity+gate, roleGrant,
lifecycle, configHandlers, AuthHandlers, src/governance, src/lint,
LocalAuthorization, RunStartGateService). `npx tsc --noEmit -p
tsconfig.json` (server) exit 0. Loader smoke: role-grant authoring block
parses + resolves through the real LintEngine. The two pre-existing
"Invalid lint spec structure" loader errors (lab-state,
local-protocol.lint.yaml) predate this wave — not introduced here.

## NOT done / open

- COMMIT: deliberately skipped unattended. server.ts is touched by BOTH this
  wave and the sibling intake/lab-sync session's uncommitted hunks — index
  surgery (56740422 method) is doable but must not be attempted overnight
  unattended. Suggested split: one commit for governance-hardening (this
  wave + the still-uncommitted controlled-use/policy-selector/bypass waves)
  with lab-sync lines stripped.
- B bypass-writer actor stamping: tree MCP filing (treeTools.ts) and lab-sync
  inbound both own files the sibling session is actively working; MCP
  transport is stateless (no session identity to resolve) so an honest
  worker/MCP identity is a design conversation, not a one-liner. Left for
  coordination with the sibling session — NOT faked with a static actor.
- sample_accessioned and friends: awaiting Brad's pick of which intake
  transitions matter (plan says ASK, so not implemented).
- Frontend: 403 on bundle switch surfaces via the existing useConfig error
  path; no dedicated "admin required" copy yet.
- Run-route step-level executedBy binding: deferred by plan.

## Decisions a successor must not re-litigate

- Identity resolution precedes the controlled-use gate (401 before any
  gate evaluation); pinned by RunStartIdentity.test.ts.
- OPERATOR_MISMATCH chosen over silently-ignoring body.executedBy (truer to
  regulated "operator binding required").
- Authoring policies are ACTOR-side lint data: same file family as
  record-side rules, evaluated by a dedicated generic interpreter — do not
  move the predicate into the record-side PredicateEvaluator (it evaluates
  records, not actors).
- Policy-query endpoint (spec) is preview-permissive like the transitions
  preview: writes remain the enforcement point.
