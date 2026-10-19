# Spec — IB-L1-PERF-1: request-scoped ACL snapshot for the record list (no per-record policy scans)

Item: IB-L1-PERF-1 (lane 1). Branch off `cl/integration-1`, worktree `/mnt/vast/home/brad/git/wt/IB-L1-PERF-1-lane1-l1t1245`.
Deliverable/report path: `/home/brad/.hermes/cl/lanes/1/ibl1perf1-report-l1t1245.md` (yours ONLY; never write any other report path).

## The defect (orchestrator-measured, verified first-hand 2026-10-19 12:45)

Unfiltered `GET :3092/api/records` took **118.06s** wall (measured live this tick; 637 records returned, corpus ~1335 record files, 374 access-policy files). Kind-filtered and singleton routes are fast. Raw disk scan of all records is only ~0.6s — the cost is the per-record visibility loop.

Verified call chain (line numbers from trunk `c98957c1` / backend `6ade6e8b`, all opened by the orchestrator):

- `RecordHandlers.ts:461-463` (listRecords): `for (const record of pagedRecords) { if (await canAccess(user, 'read', record)) ... }` — one `canAccess` per record.
- `RecordHandlers.ts:329-336`: local `canAccess` wrapper delegates to `security.authorizationService.canAccess(userId, action, record)`.
- `AuthorizationService.canAccess` (`server/src/security/AuthorizationService.ts:117-127`): per call runs
  1. `resolveEffectivePolicy(record)` (:282) → `findPolicyForRecord(recordId)` (:304-307) → `store.list({ kind: 'access-policy', limit: 10000 })` — **full ACL collection scan + per-file sha + YAML parse every record** (~87ms measured for 374 files);
  2. `loadGroups()` (:348) → `store.list({ kind: 'group', limit: 10000 })`;
  3. `loadProjectPolicies()` (:418) → `store.list({ kind: 'access-policy', limit: 10000 })` again.
  So one unfiltered list ≈ 637 records × ~3 full-collection reads/parses ≈ 116s — matches the observed 117-140s on both :3092 and :3001.
- Also `ownerOfReferencedRecord` (:161-181) does its own `store.list({kind:'access-policy'})` (:165) — only on the `admin`-on-ACL path, not the read-list hot loop.
- `resolveEffectivePolicy` parent walk uses `store.get` (singleton, cheap) — fine as-is.

## Required fix (shape is binding; internals yours)

**Request-scoped ACL snapshot — no cross-request cache.** Build ONE snapshot per list request; every `canAccess` in that request consumes it. Request-scoped lifetime is chosen deliberately: the very NEXT request rebuilds, so write-visibility is automatic and a stale-ACL class of security defect cannot exist. Do NOT add a TTL/LRU cache keyed on data version — that path needs invalidation proof far beyond this item's value.

Concrete shape (adapt minimally, keep the public `canAccess` signature backward-compatible):

1. New type, e.g. `AclSnapshot { policiesByResource: Map<string, RecordEnvelope>; policiesById: Map<string, RecordEnvelope>; groups: GroupRecord[]; projectPolicies: ProjectPolicyIndex }` (exact fields yours; it must let every hot-path lookup avoid `store.list`).
2. `AuthorizationService.buildAclSnapshot(): Promise<AclSnapshot>` — reads `access-policy` once (map resourceRef.id → policy; id → policy), `group` once (coerced via existing `coerceGroup`), and computes the project-policy index once (reuse `loadProjectPolicies`'s logic against the already-listed policies — do not re-list).
3. `canAccess(userId, action, record, snapshot?)`: when a snapshot is supplied, `resolveEffectivePolicy`, `findPolicyForRecord`, `loadGroups`, `loadProjectPolicies` all resolve FROM the snapshot (no `store.list` calls at all on the hot path). The `admin`-delegation path (`referencedRecordOwnerSatisfiesAdmin` → `ownerOfReferencedRecord` :165) may also use the snapshot's policy map when present; when absent it keeps today's behavior. Decision logic in `AccessControlService` is UNCHANGED — same decisions, same OWN-15 rules, same creator-private fallback. Only data loading changes.
4. `RecordHandlers.ts` listRecords: build the snapshot once before the loop, pass it into the local `canAccess` wrapper (:329) as an optional parameter through to the service. Every OTHER `canAccess` call site (:370, :379, :413, :416, :522, :546, ...) is a single-record path — leave those signatures/behavior alone (snapshot param optional everywhere).
5. No new store API, no IndexManager changes needed (investigate was done: IndexManager is a boot-time JSON-LD index with no subscription surface — reuse not applicable; the store's `setWriteHook`/`fireUpsertHook` exists but is NOT needed for a request-scoped snapshot — do not touch it).

## Hard boundaries

- NO policy-semantics change: every decision today must be the decision tomorrow. If you find a case where snapshot-based resolution changes an outcome, STOP and return `requires-rescope` with the case — do not "fix" it.
- Do not touch `AccessControlService.ts` decision code, `ensureOwnerPolicy`, `backfillOwnerPolicies`, role-grant logic, or `RoleResolver`.
- Do not refactor unrelated `store.list` callers (e.g. `userPrincipalResolves`) outside the hot path.
- exactOptionalPropertyTypes stays on; `npm run typecheck` must introduce NO new errors (server has a pre-existing 33-error baseline on trunk — compare, don't "fix" baseline).

## RED-first tests (write failing tests BEFORE implementation)

T1 (call-count RED): a unit/integration test with a spy `RecordStore` (or call-counting wrapper) proving that today one `listRecords`-style visibility pass over N records performs O(N) `store.list({kind:'access-policy'})` calls; after the fix, exactly ONE (snapshot build) per request. Pin the N≥3 case.
T2 (behavior equivalence): the existing security suites — `LocalAuthorization.test.ts`, `AccessControlService.test.ts`, `OwnershipPolicyService.test.ts`, plus RecordHandlers visibility tests — must stay green UNCHANGED. Do not edit their expectations; if one fails, the snapshot leaked a decision change (defect).
T3 (freshness pin): a test proving minting or editing an access-policy (or group membership change) is visible to the VERY NEXT list request — request-scoped snapshots satisfy this trivially; pin it anyway with two sequential list calls around a policy write, asserting grant-then-visible and revoke-then-invisible.
T4 (snapshot-path parity): for at least one record WITH direct ACL, one INHERITING from a parent, one group-granted, one with no policy (creator-private fallback): `canAccess(..., snapshot)` === `canAccess(..., undefined)` for read/write/admin × owner/non-owner.

## Verification you must run and paste (raw output, not summary)

- RED run of T1/T4 pre-implementation (failures shown), GREEN post.
- T2 suites full-run output.
- `npx vitest run server/src/security` + the RecordHandlers visibility suites; ALSO run the same scoped suite set on the pristine trunk base and show the fail-file sets are delta-ZERO (known pre-existing debt pattern — reuse base/head fail-file diffing).
- server `tsc --noEmit`: error-line count identical to trunk baseline (33), zero new in touched files.
- Do NOT restart :3092 or any stack — the orchestrator does live proof after merge.

## Report

Write to the deliverable path: what changed (files + why), raw test evidence (or paths to raw logs under /home/brad/.hermes/cl/lanes/1/ suffixed `-l1t1245` — your unique suffix), T1 call-count before/after numbers, assumptions, and end with `STATUS: complete` + commit sha. Commit on your worktree branch with a message that calls out the RED-first inversion.
