# QMS8-A — Permissions & roles settings section — coder report (lane 1, l1t1640)

STATUS: complete

Commit: 13bf2db082c9cdc51af8fb2229c610a57a1a199d (`cl/lane1-qms8a-l1t1640`, off cl/integration-1 @ 2299d24c)
Worktree: /mnt/vast/home/brad/git/wt/QMS8-A-lane1-l1t1640

## What was built

Server (thin read-only aggregate, per spec):
- `server/src/api/handlers/PermissionsHandlers.ts` (NEW) — `GET /settings/permissions`.
  - grants: `store.list({ kind: 'role-grant', limit: 10000 })` — the exact read path RoleResolver.ts:18 uses. NO new ACL logic added; generic /records ACL behavior untouched.
  - lifecycles: enumerated from `engine.loadedIds()` (see addition below); `declaredRoles` = distinct `role` values across the loaded spec's transitions (plain read of loaded YAML via `specFor`-class accessor — no ad-hoc file re-parse, no invented roles); `kinds` from the coverage echo where covered, else [].
  - coverage: echo of `ctx.kindLifecycleRegistry` (`{lifecycleId, kinds}`), null when the coverage load failed (degrades honestly).
  - bundle: echo of `appConfig.lab.policyBundleId` via the LIVE accessor pattern (LabSettingsHandlers precedent), enriched with the loaded bundle's label/level from the same `ctx.policyBundleService` instance; null when no config.
  - gate: `resolveRequestUser` (same resolver the lifecycle handlers use); null/no userId -> 401 UNAUTHENTICATED. No new authorization concept. No kind/role/lifecycle/user literals in TS.
- `server/src/lifecycle/LifecycleEngine.ts` — added `loadedIds(): string[]` returning `[...this.specs.keys()]`. This is the "smallest honest addition" the spec allowed: a plain read-only report of what `loadLifecycle()` registered (same precedent class as `specFor`/`terminalStates`); no lifecycle list is invented in TS.
- `server/src/api/routes.ts` — `permissionsHandlers?: PermissionsHandlers` in RouteOptions + `fastify.get('/settings/permissions', ...)` in the settings block, adjacent to the OWN-9 ownership-policy handlers (placement precedent).
- `server/src/server.ts` — `createPermissionsHandlers({...})` wired adjacent to lifecycleHandlers with live accessors (`() => ctx.kindLifecycleRegistry`, `() => ctx.appConfig`, `ctx.policyBundleService`, `ctx.localIdentityService.resolveRequestUser`); `permissionsHandlers` added to routeOpts.

Client:
- `app/src/components/settings/PermissionsSection.tsx` (NEW) — one aggregate fetch on mount + Refresh; row-per-grant table (user label joined from `apiClient.listUsers()` with raw USR- id fallback; blank lifecycleId renders as "all lifecycles"; grantedBy; notes); client-side user filter (text input, no server filter); INERT FLAG: a role absent from the bound lifecycle's declaredRoles renders `role — not declared by <lifecycleId> (inert)` (computed from the aggregate's own data — no witness record id in TS); governance panel (per lifecycle: declared roles + governed kinds; coverage row; active bundle id/label/level); honest empty state string exactly as specified; OwnershipPolicySection error law (refusal row ABOVE controls, Refresh stays operable and re-fetches — no dead chrome); null coverage/bundle degrade honestly. No grant authoring UI (hint sentence only).
- `app/src/shared/api/client.ts` — `getPermissions()` + `PermissionsResponse`/`PermissionsGrantView`/`PermissionsLifecycleView`/`PermissionsCoverageView`/`PermissionsBundleView` types.
- `app/src/shell/SettingsPage.tsx` — `<Section title="Permissions & roles"><PermissionsSection /></Section>` mounted directly after the Ownership & Sharing section.

## Files touched (+/-)

9 files changed, 902 insertions(+), 0 deletions:
- server/src/api/handlers/PermissionsHandlers.ts        NEW +166
- server/src/api/handlers/PermissionsHandlers.test.ts   NEW +216
- server/src/lifecycle/LifecycleEngine.ts               +10
- server/src/api/routes.ts                              +8
- server/src/server.ts                                  +12
- app/src/components/settings/PermissionsSection.tsx    NEW +238
- app/src/components/settings/PermissionsSection.test.tsx NEW +152
- app/src/shared/api/client.ts                          +56
- app/src/shell/SettingsPage.tsx                        +6

No schema YAML touched (no lane-stack restart needed; none performed). No :3001/:5174/:3092/:5192 process touched.

## RED-first evidence (RED files predate GREEN runs)

- RED server: /home/brad/.hermes/cl/lanes/1/qms8a-red-server-l1t1640.txt (mtime 2026-10-20 17:00:19) — `Failed to load url ./PermissionsHandlers.js` (suite-load RED, handler absent).
- RED client: /home/brad/.hermes/cl/lanes/1/qms8a-red-client-l1t1640.txt (mtime 2026-10-20 17:00:31) — `Failed to resolve import "./PermissionsSection"` (component absent).
- GREEN server: /home/brad/.hermes/cl/lanes/1/qms8a-green-server-l1t1640.txt (mtime 17:03:42) — written AFTER the handler existed.
- GREEN client: /home/brad/.hermes/cl/lanes/1/qms8a-green-client-l1t1640.txt (mtime 17:05:28) — written AFTER the component existed.

## Test output tails (own runs, all green)

Server touched suites (PermissionsHandlers + LifecycleHandlers + LifecycleEngine + OwnershipPolicyHandlers + RecordHandlers.roleGrant + RoleResolver):
  ✓ src/api/handlers/LifecycleHandlers.test.ts  (8 tests)
  ✓ src/api/handlers/RecordHandlers.roleGrant.test.ts  (5 tests)
  ✓ src/api/handlers/OwnershipPolicyHandlers.test.ts  (7 tests)
  ✓ src/api/handlers/PermissionsHandlers.test.ts  (7 tests)
  ✓ src/lifecycle/LifecycleEngine.test.ts  (6 tests)
  Test Files  6 passed (6)
       Tests  38 passed (38)
  (raw: /home/brad/.hermes/cl/lanes/1/qms8a-green-server-suite-l1t1640.txt)

Client touched suites (PermissionsSection + OwnershipPolicySection + SettingsPage.bundleError):
  ✓ src/components/settings/PermissionsSection.test.tsx  (8 tests)
  ✓ src/components/settings/OwnershipPolicySection.test.tsx  (6 tests)
  ✓ src/shell/SettingsPage.bundleError.test.tsx  (1 test)
  Test Files  3 passed (3)
       Tests  15 passed (15)
  (raw: /home/brad/.hermes/cl/lanes/1/qms8a-green-client-l1t1640.txt)

Pre-existing debt NOT chased: `server/src/api/handlers/LabSettingsHandlers.test.ts` fails 2 tests ("getAppConfig is not a function") — proven pre-existing by running the identical command in cl-integration-1 trunk (same 2 fails there). It is a lane-exclude SYMLINK whose computable-lab target lags the tracked handler; not my change, not fixed (out of ownership).

## tsc delta-ZERO proof

App (the 23-error pin is the app error-set — the pin file contains app `src/...` lines):
- Head error-set saved: /home/brad/.hermes/cl/lanes/1/qms8a-coder-tsc-l1t1640.txt — 23 "error TS" lines.
- `diff <(sort head) <(sort /home/brad/.hermes/cl/lanes/1/changes-ui-1fix1-orch-tsc-head-l1t1555.txt)` -> EMPTY. SET identical, count 23 == 23. APP TSC DELTA: ZERO.

Server:
- Head: /home/brad/.hermes/cl/lanes/1/qms8a-server-tsc-HEAD-l1t1640.txt — 0 errors.
- Base (post-bootstrap, new files moved aside + tracked edits stashed, symlinks kept): /home/brad/.hermes/cl/lanes/1/qms8a-server-tsc-BASEPOST-l1t1640.txt — 0 errors. SERVER TSC DELTA: ZERO.
- NOTE: the FIRST bare-worktree server tsc read 25 errors — all phantom TS2307 "Cannot find module" from missing lane-exclude symlinks/regular files (lane-verification skill: "baselines read WRONG until repaired"). Repaired via /home/brad/.hermes/cl/lanes/1/qms8a-bootstrap-l1t1640.sh (recreated trunk's lane-exclude symlinks — skipping paths TRACKED at HEAD — plus 3 ignored-but-present schema files; `server/schema` points at the worktree's own schema dir). The pre-repair base read is preserved at qms8a-server-tsc-BASE-l1t1640.txt for transparency.

## Live-mount proof (boot probe, NOT the lane stack)

Scratch probe (server/tmp/qms8a-boot-probe.ts, deleted after the run; throwaway CONFIG_PATH + /tmp dataDir + gitignored server/records — durable stores untouched) through the real `initializeApp`/`createServer` seam:
- `GET /api/settings/permissions` (x-user-id: USR-BRAD) -> 200 with grants incl. `GRANT-DEMO-AUTHOR` (author @ document-controlled-signing, grantedBy USR-LOCAL-ADMIN); NO registry-ops grant for BRAD (acceptance leg 3 shape).
- registry-ops lifecycle echo: `{"id":"registry-ops","declaredRoles":["author","approver"],"kinds":["person","equipment","equipment-class","training-record","competency-authorization","instrument","calibration-record"]}` — coverage echo matches the loaded registry exactly.
- bundle echo: `{"policyBundleId":"POL-SANDBOX","label":"Sandbox","level":0}`.
- A probe grant `quality_manager @ registry-ops` (registry-ops declares only author/approver) demonstrates the inert-flag witness class end-to-end (client flags it from data).
- Unresolvable identity (x-user-id: USR-PROBE-USER, no such record) -> 401 UNAUTHENTICATED.
- Raw capture: /home/brad/.hermes/cl/lanes/1/qms8a-boot-probe-l1t1640.txt
The :3092/:5192 live gate is the orchestrator's browser track — not run by me (rules: do not touch those processes; no YAML touched so no restart).

## Assumptions (explicit)

- AS-QMS8A-01: The spec recon said components/settings has an `index.ts` barrel; it does NOT (verified: only OwnershipPolicySection.tsx/.test.tsx + PolicyBundleSelector.tsx live there, imported by SettingsPage via direct path). I followed the OwnershipPolicySection precedent (direct import) rather than inventing a new barrel.
- AS-QMS8A-02: Read gate semantics match the lifecycle-handler precedent exactly: 401 only when `resolveRequestUser` yields null/no userId. A headerless request still resolves through LocalIdentityService's documented implicit fallback (same as GET /lifecycle/.../transitions and the ungated GET /settings/ownership-policy OQ2 adjudication). The DEV-2 fail-closed-for-credentialless rule applies to privileged WRITES; this endpoint is read-only and has no write half.
- AS-QMS8A-03: `label` in the grant view maps the role-grant payload's FAIRCommon `title` (role-grant.schema.yaml carries no `label` property; title is the human-readable label per common.schema.yaml).
- AS-QMS8A-04: bundle echo enriches with label/level from the already-loaded PolicyBundleService (reuse, not re-derivation); absent service -> id-only echo. Client renders whatever parts exist.
- AS-QMS8A-05: Worktree bootstrap (lane-exclude symlinks + 3 schema regular files) was required before baselines read correctly; recipe documented in /home/brad/.hermes/cl/lanes/1/qms8a-bootstrap-l1t1640.sh. Bootstrap artifacts stay untracked/ignored; git status shows only the 9 intended files.

## Platform-gap check

No rescope needed: the aggregate was expressible entirely from loaded data (store list, engine specs, loaded registry, appConfig) with zero invented domain policy in TS. No kind/role/lifecycle/user literals in any new product file (verified by grep; the only lifecycle name near my edit is a pre-existing doc comment in LifecycleEngine.ts:125).

## Unresolved / for the orchestrator

- Browser gate (:5192 UI as BRAD) is the orch's async track.
- LabSettingsHandlers.test.ts lagging-symlink debt (2 fails at trunk too) is flagged, not fixed — trunk-owned file.
