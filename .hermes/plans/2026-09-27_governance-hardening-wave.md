# Governance-hardening wave — phased plan (2026-09-27)

Closes the identity/authorization trio from the QMS remainder list:
(1) session-identity binding of run routes, (2) role-grant privilege-escalation
guard, (3) bundle-switch authorization + audit. Self-contained for a fresh
architect session — contract surfaces already recon'd (below); re-verify line
numbers (shared tree churns).

Prereq reading (in order):
- .hermes/plans/handoffs/2026-09-27_qms-governance-runtime-complete.md
  (design decisions not to re-litigate)
- .hermes/plans/handoffs/2026-09-27_controlled-use-run-start.md
- docs/knowledge-layer-canonical-example.md (touches nothing here, but canon)

## Pinned contract surfaces (verified 2026-09-27, pre-wave)

- server/src/security/LocalIdentityService.ts
  - resolveRequestUser(request) -> ResolvedRequestUser { userId: string|null,
    userRecord?, isSystem, reason? }. Order: session token (strongest) ->
    x-user-id / x-computable-user-id headers (LOCAL_ADMIN_USER_ID bootstraps).
    Inactive/unknown => userId null + reason.
  - This is the same resolver lifecycle transitions use (spoofable x-actor-id
    lost to session user — RecordHandlers.lifecycle.test.ts is the pattern).
- server/src/api/routes/run-execution.ts
  - POST /runs/:runId/start (~line 201): body.executedBy is TRUSTED today —
    required field, written to payload AND to audit actor (~297, ~325).
    registerRunExecutionRoutes(fastify, ctx) gets full AppContext;
    ctx.localIdentityService exists on AppContext.
  - run_started + run_completed audit hooks already in place; controlled-use
    gate in place (RunStartGateService; 403/409/422 shapes; ack via
    body.acknowledgements). Suite: RunStartControlGate.test.ts (7).
  - executedBy also appears in step-level bodies (~86/96/130 types) — out of
    scope; operator binding on steps is a later decision.
- schema/identity/role-grant.schema.yaml: kind role-grant, GRANT- id,
  userId USR-, roles [a-z_], optional lifecycleId scope, OPTIONAL grantedBy
  USR- field (already in schema, currently unfilled/unenforced).
- server/src/security/RoleResolver.ts: rolesFor(userId, lifecycleId?) reads
  role-grant records via store.list. NO authoring-side guard exists —
  any session that can POST /records can mint a GRANT for itself.
  (Handoff: "enforce before exposing grants to non-admin UI".)
- server/src/api/handlers/RecordHandlers.ts: createRecord at ~line 265;
  updateRecord ~600 runs checkLifecycleTransition + passes viaLifecycleApi
  marker to store (bypass detector in RecordStoreImpl, wired via
  setLifecycleBypassAudit in server.ts ~702).
  LOCAL_ADMIN_USER_ID constant lives in/next to LocalIdentityService.
- Bundle switch: PATCH /api/config (ConfigHandlers.patchConfig) merges
  patch.lab incl. policyBundleId; fail-closed 400 on unknown ids (5th ctor
  param knownPolicyBundleIds, wired in server.ts ~1262). onConfigUpdate
  reassigns ctx.appConfig; getPolicySettings accessors read it per request.
  Frontend: SettingsPage handlePolicyBundleChanged -> useConfig patchConfig.

## Wave A (parallel children, disjoint files)

A1 — run-route identity binding (server/src/api/routes/run-execution.ts +
new test; do NOT touch RecordHandlers/security/):
- POST /start: resolve user via ctx.localIdentityService.resolveRequestUser.
  - userId null -> 401 IDENTITY_REQUIRED (reason in message). No anonymous run
    starts under any bundle (identity is a primitive, not policy — no bundle
    key relaxes it; do NOT invent one, ask if a sandbox bypass seems needed).
  - Body executedBy: when present and !== userId -> 403
    OPERATOR_MISMATCH (or, if preferred UX: ignore body, always use session
    user — pick ONE, pin with test; MISMATCH is stricter and truer to
    "operator binding required" in regulated bundle copy).
  - payload.executedBy := session userId; audit actor := session userId.
    Keep body optional (deprecated; still accepted when it matches).
- Apply the same resolution to /complete audit actor (executedBy from payload
  is fine there; audit actor = session user).
- Regression: RunStartControlGate.test.ts fake ctx gains
  localIdentityService stub {resolveRequestUser: async () => ({userId:
  'USR-OP', isSystem: false})}; existing 7 tests must stay green. New tests:
  no-session 401; mismatch 403; audit actor proves session identity.

A2 — role-grant authoring guard (RecordHandlers.ts + RoleResolver-adjacent
test; do NOT touch run-execution/config):
- In createRecord (and updateRecord touching payload.roles or .userId):
  require the resolved actor to be LOCAL_ADMIN_USER_ID (isSystem true or
  userId === LOCAL_ADMIN_USER_ID) OR to hold role 'admin' via RoleResolver
  for the role-grant kind. Else 403 GRANT_FORBIDDEN.
  CRITICAL (non-negotiable rule #2): the predicate must be DECLARED, not
  if(kind==='role-grant') in TS. First grep schema/*.lint.yaml for an
  existing actor predicate in the lint DSL. If none exists, the declarative
  home is a new top-level block in schema/identity/role-grant.lint.yaml
  (create if absent), e.g. authoring: { require: { anyOf: [systemActor,
  role=admin] } }, interpreted generically (mirrors lifecycle guard
  interpretation). If the honest minimal path turns out to be a small
  TS rule keyed off lint data, that's acceptable ONLY if the rule VALUES
  come from YAML; log the mechanism in open_issues. If it can't be done
  declaratively without new spec surface, STOP and hand back to the
  architect for a spec drop rather than hardcoding.
- Always stamp payload.grantedBy := session userId on accepted create
  (schema field already exists). Fail closed: no resolved actor -> 401.
- Tests: new RecordHandlers.roleGrant.test.ts — anonymous 401, non-admin
  403, local-admin 201 + grantedBy stamped, edit of roles array on existing
  grant also guarded.

A3 — bundle-switch authz + audit (configHandlers.ts + SettingsPage test;
do NOT touch run-execution/RecordHandlers):
- ConfigHandlers gets optional 6th ctor param
  (e.g. requireAdminForPolicyChange?: { resolveActor: (req) => Promise<...>,
  isAdmin: (actor) => boolean }) — wired in server.ts from
  localIdentityService + RoleResolver. When patch.lab.policyBundleId present
  (changed value not required — any attempt audited) AND actor not admin:
  403 POLICY_BUNDLE_CHANGE_FORBIDDEN. Fail closed if actor unresolvable.
- Audit action policy_bundle_changed on success: {from, to, actor} via
  ctx.auditService — note ConfigHandlers has no ctx; parent wires an
  optional append hook param, same late-binding pattern.
- Wire at server.ts ConfigHandlers construction (~1262; re-read first —
  three agents have touched that call).
- Tests in configHandlers.test.ts: admin passes, non-admin 403, anonymous
  403, audit recorded.

Parent between waves: verify footprints (git status per owned file-group),
targeted suites + server/app tsc, wire any cross-child hooks myself
(the server.ts ConfigHandlers call is the contention point — I own edits to
it; children were told hands-off).

## Wave B — identity-in-audit sweep (after A lands; single child ok)

- Bypass-writer actor stamping: lab-sync inbound + tree MCP pass
  options.actor (worker identity / MCP session identity) so
  lifecycle_state_bypass events stop landing as 'unknown'.
  Files: server/src/lab-sync/translate/inbound.ts, server/src/mcp/tools/treeTools.ts
  (+ their tests). NOTE: lab-sync is the sibling session's active file —
  coordinate/confirm before touching.
- Chosen §10 hooks: login_success/login_failed (authHandlers),
  sample_accessioned or whichever intake transitions matter to Brad —
  ASK Brad which before implementing.

## Wave C — signature/action parity (small)

- run_start_ack as a declared signatureAction if tracked-mode acks must be
  signed (decision pending Brad; today's ack is a bare code list — fine for
  research labs).
- Optional: policy-query API (§21) spec drop — evaluateRunStartGate +
  checkLifecycleTransition are the two interpreters; a read-only
  POST /policy/query {actor, action, recordId} -> {decision, reasons[]}
  reuses both. Spec drop, not code.

## Standing constraints (every child prompt)

- exactOptionalPropertyTypes; conditional spread, never undefined.
- Business rules in YAML, interpretation in code — no kind/lifecycle
  name-branching in TS (the A2 mechanism note embodies this).
- Shared tree: no state-changing git, no unfiltered vitest, absolute paths,
  re-read files before patching; expect sibling-session churn in
  server.ts / routes.ts / lab-sync / event-editor.
- Verification bar: targeted vitest files + npx tsc --noEmit -p tsconfig.json
  exit 0 per workspace; parent re-runs everything before claiming done.
- Uncommitted so far this session (commit needs index surgery, see
  56740422 method): policy-selector wave, controlled-use wave, bypass
  detector, run_completed hook. Consider committing BEFORE wave A so the
  security wave lands as its own reviewable commit.
