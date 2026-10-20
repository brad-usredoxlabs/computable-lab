# QMS8-A — Permissions & roles settings section (lane 1, claim l1t1640)

Item: QMS8-A. Trunk base: cl/integration-1 @ 7eb72222. Branch
`cl/lane1-qms8a-l1t1640`, worktree `/mnt/vast/home/brad/git/wt/QMS8-A-lane1-l1t1640`.
Deliverable report (OWNED PATH, yours alone):
`/home/brad/.hermes/cl/lanes/1/qms8a-report-l1t1640.md`.

## Goal

A new READ-FIRST settings section "Permissions & roles" that answers, from data
only: which users hold which lifecycle roles, which roles each lifecycle
DECLARES (so a mis-bound grant is visible as inert), and which kinds each
lifecycle governs. No grant authoring here (generic record surface owns that;
you MAY render a hint sentence, not a duplicate editor).

## Orch-verified recon (2026-10-20, first-hand — trust these over your own grep on the same facts)

1. SETTINGS PATTERN: sections live in `app/src/components/settings/` (NOT
   shell/settings) with an `index.ts` barrel; `SettingsPage.tsx` imports
   `OwnershipPolicySection` from `'../components/settings/OwnershipPolicySection'`
   and mounts it inside `<Section title=...>` groups. OwnershipPolicySection is
   the closest sibling (read-first GET -> table, error law: server refusals
   render as a row ABOVE controls, never disable controls after a server 4xx).
   Its header comment documents the mount + refetch pattern — follow it.
2. GRANTS ARE ACL-FILTERED ON THE GENERIC SURFACE — LIVE-PROBED: GET
   `/api/records?kind=role-grant` as USR-BRAD -> `{"records":[],"total":0}`;
   as USR-LOCAL-ADMIN -> total 1 (GRANT-DEMO-AUTHOR). The lane data dir has FIVE
   grant files under `records/role-grant/` each with a sibling ACL under
   `records/access-policy/`. => The generic list CANNOT satisfy acceptance (2)
   "shows GRANT-DEMO-AUTHOR ... as BRAD". The thin server-side aggregate
   endpoint is FORCED, not optional. GRANT-DEMO-AUTHOR on disk:
   `userId: USR-BRAD`, `lifecycleId: document-controlled-signing`,
   `grantedBy: USR-LOCAL-ADMIN`.
3. DECLARED ROLES EXIST SERVER-SIDE: lifecycle YAMLs live in
   `schema/core/lifecycles/` (7 files: document-controlled-signing,
   document-control, lab-sample, lab-vocabulary-control, registry-ops,
   service-request, tyf-order). The existing `GET /lifecycle/:lifecycleId/
   transitions` WITHOUT recordId returns `{lifecycleId, state, transitions,
   terminalStates}` where each transition carries a `role` field (live-probed
   registry-ops: author on ACTIVATE, approver on ARCHIVE). LifecycleEngine has
   `specFor(id)` (:109) and `terminalStates(id)`; check for an id-enumeration
   method — if absent, adding one that returns the loaded spec ids is the
   smallest honest code (reads loaded YAML, no policy).
4. COVERAGE IS SERVER-SIDE ONLY: `schema/registry/registry-kinds.registry.yaml`
   declares `lifecycleId: registry-ops` + kinds [person, equipment,
   equipment-class, training-record, competency-authorization, instrument,
   calibration-record]; loaded into `KindLifecycleRegistry` (server.ts:457-470,
   on ctx as kindLifecycleRegistry). No client-readable endpoint exists — the
   aggregate must echo it.
5. POLICY BUNDLE: `GET /settings/lab` returns `policyBundleId` (client.ts:824
   LabSettings; PolicyBundleSelector consumes it). Reuse, don't re-derive.
6. USER NAMES: `GET /api/records?kind=user` IS readable by USR-BRAD (live
   probe: 3 users incl. USR-BRAD 'brad'). Join userId -> displayName/username
   client-side for the row label; fall back to the raw USR- id.

## Required end-state

### Server (one thin aggregate endpoint)

`GET /settings/permissions` (new handler or extend the settings route block in
server.ts's route wiring — follow the OWN-9 ownership-policy handlers as the
placement precedent). ANY authenticated local user may read it (resolve via the
same `resolveRequestUser` the lifecycle handlers use; 401 otherwise). Returns:

```
{
  grants: [{recordId, userId, lifecycleId?, roles[], grantedBy?, notes?, label?}],
  lifecycles: [{id, declaredRoles[], states?, kinds[]}],
  coverage: {lifecycleId, kinds[]} | null,
  bundle: {policyBundleId} | null
}
```

Rules:
- grants: `store.list({kind:'role-grant'})` — EXACTLY what RoleResolver.ts:18
  already does server-side (one read path, no parallel ACL logic — you add NONE;
  this endpoint intentionally shows the org-chart projection, matching
  RoleResolver's server view; the generic record surface's ACL filtering is
  unchanged and untouched).
- lifecycles: for every LOADED lifecycle spec: id + declaredRoles = the distinct
  `role` values across its transitions (from the loaded YAML via the engine —
  never re-parse files in TS ad hoc, never invent roles) + kinds from coverage
  where covered (else []).
- coverage/bundle echo the already-loaded ctx.kindLifecycleRegistry + appConfig
  value. If coverage failed to load (ctx undefined), return null — the section
  must degrade honestly, not crash.
- NO new authorization concept, NO kind literals in TS: everything the response
  contains comes from the loaded data.

### Client

`app/src/components/settings/PermissionsSection.tsx` (+ `.test.tsx`, `index.ts`
export, SettingsPage mount — place it near the Ownership/Group sections):
- One fetch of the aggregate on mount + a Refresh affordance.
- Row-per-grant table: user label (joined from user records), roles, lifecycle
  binding (blank lifecycleId renders honestly as "all lifecycles"), grantedBy,
  notes.
- Client-side user filter (a text input narrowing rows — no server filter).
- INERT FLAG (the core legibility win): for each grant with a lifecycleId, any
  role NOT in that lifecycle's declaredRoles renders flagged (e.g.
  `role — not declared by <lifecycleId> (inert)`). The real witness:
  GRANT-QMS7-REGOPS (wrong-binding case). Do not hardcode that record id in TS
  or in tests' product logic — the test seeds its own fixture.
- Governance panel: per lifecycle — declared roles + governed kinds (from
  coverage) + active bundle id/level display.
- Empty state honest: "no grants: everyone resolves to no-role; drafts-only is
  the only power".
- Error law from OwnershipPolicySection: a server refusal shows above the
  controls; never dead chrome — no button that does nothing.

## RED-first tests (write these failing first)

1. `PermissionsSection.test.tsx` (mock the client method): seeded grant renders
   with lifecycle binding + grantedBy; a grant whose role is absent from the
   named lifecycle's declaredRoles renders the inert flag; coverage rows
   map kinds->lifecycle; empty state string; server-error row.
2. Server test for the endpoint (follow LifecycleHandlers.test.ts /
   OwnershipPolicy handlers' test style): unauthenticated -> 401; seeded grants
   surface in `grants`; declaredRoles match the fixture lifecycle's transition
   roles; coverage echo matches the loaded registry.
3. apiClient method `getPermissions()` (+ types) — client.ts additions.

## Verified by (the gate)

(1) The unit tests above green (own run). (2) tsc delta-ZERO vs base pin — save
your head error-set to `/home/brad/.hermes/cl/lanes/1/qms8a-orch-tsc-head-l1t1640.txt`
pattern: same 23-error baseline set as the trunk, zero new (do NOT fix
pre-existing). (3) Live proof on :3092 as BRAD (x-user-id: USR-BRAD):
GET /settings/permissions returns grants incl. GRANT-DEMO-AUTHOR (author @
document-controlled-signing) and shows NO registry-ops role for BRAD; UI
served on :5192 shows it (browser gate is the orch's async track, NOT yours).
(4) Restart the lane stack ONLY if you touch YAML (you should not need to —
this is TS + a route; if you add nothing to schema/, no restart).
Report file: STATUS line + commit sha + files touched + RED evidence paths
(RED file must predate GREEN) + test/tsc outputs.

## Boundaries

- NO grant authoring/editing UI. NO new lifecycle endpoint (extend the
  aggregate instead). NO changes to the generic /records ACL behavior.
  NO schema YAML changes. No touching :3001/:5174 or the data dir by hand.
- Platform-gap stop rule: if the aggregate cannot be expressed without
  inventing domain policy in TS, STOP and return requires-rescope with
  evidence.
- exactOptionalPropertyTypes stays on (app tsconfig caveat carried: it is NOT
  on for app — write clean optional handling either way).
