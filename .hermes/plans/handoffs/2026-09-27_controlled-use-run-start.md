# Controlled-Use Enforcement (spec §17–20) + Wave-1 leftovers — Handoff (2026-09-27)

Status: implemented, parent-verified, UNCOMMITTED (shared tree — interleave-safe
by file group; commit needs index surgery like 56740422).

## Landed this session (two waves, all parent-run tests, not child claims)

WAVE 1 — PolicyBundleSelector data-driven (task 6.2, closes handoff
2026-09-27_qms-governance-runtime-complete.md descope #1):
- GET /settings/lab returns availablePolicyBundles (presentation fields from
  PolicyBundleService.listBundles()). Selector renders it; hardcoded BUNDLES
  const deleted; empty => "No policy bundles reported by server" (no fallback
  catalog, by design).
- Switch routes through real config-write endpoint PATCH /api/config
  {lab:{policyBundleId}}; dead client method patchLabSettings deleted
  (targeted a PATCH /settings/lab that never existed).
- ConfigHandlers: optional 5th ctor param knownPolicyBundleIds, fail-closed
  400 on unknown lab.policyBundleId; wired in server.ts to the live
  policyBundleService catalog.
- Tests: server LabSettingsHandlers.test.ts (2), configHandlers.test.ts (+1);
  app PolicyBundleSelector.test.tsx (4). tsc server 0; app errors all
  pre-existing in the other session's files.

WAVE 2 — controlled-use run-start gate (spec §17–20, the "highest-value
follow-on"):
- server/src/readiness/RunStartGateService.ts — pure
  evaluateRunStartGate(report, policy) reusing ReadinessReportService +
  ReadinessDiagnosticService. Zero new business logic in TS: dispositions come
  from the bundle YAMLs (sandbox allow / tracked confirm / regulated deny).
- POST /runs/:runId/start gate (run-execution.ts): deny => 403
  CONTROLLED_USE_BLOCKED (details.findings, run stays planned);
  needs-confirmation => 409 CONFIRMATION_REQUIRED (details.confirmationRequired
  codes) satisfied ONLY by body.acknowledgements [codes]; unreadable plannedRunRef
  => 422 CONTROLLED_USE_UNEVALUABLE (fail closed); no plannedRunRef => gate
  skipped by design (nothing declared to evaluate).
- Audit: ctx.auditService (AppContext member, assigned after construction)
  appends run_started on accepted starts — first §10 hook beyond
  lifecycle_transition/signature_applied. data carries from/to/plannedRunRefId/
  policyBundleId/acknowledgements.
- App: ExecutionContext.startExecution is server-authoritative (awaits POST;
  4xx => reducer 'startFailed' => state.executionError, never transitions
  locally; never rejects). ProtocolTabPanel handlePlayAll/handleToggleMode flip
  to executing ONLY on result.isActive; RunHeader renders executionError alert.
  (handlePlayAll's step-chain moved into the accept callback — no modal opens
  on a rejected start.)
- Tests: RunStartGateService.test.ts (4, real bundle YAMLs),
  RunStartControlGate.test.ts (5 endpoint scenarios incl. tracked 409->ack->200
  and sandbox 200-without-ack), ExecutionContext.test.tsx (3).
  ProtocolTabPanel.test.tsx 25/25 unaffected. Server tsc 0.

## Decisions a successor must not re-litigate
- Gate semantics are pure policy interpretation; adding a precondition means
  extending ReadinessReportService/diagnostics + bundle YAML, NEVER an if in
  the run-start handler.
- The tracked-mode ack is a bare code list, NOT an e-signature. If signed acks
  ever matter, mint via the step-up /signatures path with a declared
  signatureAction (e.g. run_start_ack) — mapping stays in YAML.
- executedBy still comes from the request body; audit actor is claimed, not
  session-proven (unlike lifecycle transitions). Bind run routes to
  LocalIdentityService.resolveRequestUser when that work happens; the audit
  data shape is already prepared for it.
- UI error surface is the RunHeader role=alert strip; do not make start
  optimistic again.

## Remaining follow-ons (unchanged from QMS handoff unless noted)
- ~~run_completed audit hook~~ DONE (hook + 2 pinning tests in
  RunStartControlGate.test.ts; 7/7 suite green).
- ~~Bypass audit~~ DONE: detector at the store choke point. New pure
  predicate server/src/lifecycle/BypassAudit.ts; RecordStoreImpl gained
  setLifecycleBypassAudit late-setter (wired in server.ts next to
  auditService construction) + UpdateRecordOptions {viaLifecycleApi?, actor?}.
  A direct store.update that flips a loaded-lifecycle record's
  state??status without viaLifecycleApi:true self-reports
  lifecycle_state_bypass {lifecycleId, from, to, via:'store_update'}.
  RecordHandlers passes the marker only when the gate ran, allowed, AND a
  real transition occurred (parity with middleware). Known writers now
  self-reporting: lab-sync inbound tyf-order status writes (6 sites),
  tree MCP filing (only when the filed record is lifecycle-managed).
  Follow-on: teach those writers to pass options.actor (events currently
  land with meta.createdBy or 'unknown').
- run_aborted: NO code path writes status 'aborted'/'failed'/'superseded'
  to runs anywhere (verified by grep; UI abortExecution is local-only).
  Hook would guard a nonexistent write — needs an endpoint first if abort
  should be real.
- Session-identity binding of executedBy (see above).
- Bundle-switch authz (any PATCH /config session can select POL-SANDBOX).
- record_correction schema (§12), policy-query API (§21), TYF domain package (§26).

## Environment
Same caveats as prior handoff: shared tree with intake/lab-sync session (their
ProtocolTabPanel/ExecutionContext churn shows in git status — the execution/
hunks in ExecutionContext.tsx are OURS; ExecutionTabShell.tsx/useExecutionState.ts
modifications are THEIRS, untouched by us). Never unfiltered vitest; targeted
files only.
