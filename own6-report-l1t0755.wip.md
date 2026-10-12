# OWN-6 coder report — l1t0755 (RETRY, clean start)

Branch: `wt/OWN-6-lane1-l1t0755` @ /mnt/vast/home/brad/git/wt/OWN-6-lane1-l1t0755
Base: `cl/integration-1` @ **a711e818fd03986ff3c3588f6c573d1ec181e044** (OWN-3 merged tip; >= f6e52565; OWN-5 merged).
Spec: `.hermes/plans/2026-10-11_own-6-project-principal-spec.md` + plan §T6 (word of record).

## OWN-5 merge state observed at base
- `AccessControlService.ts:3` `export type Visibility` PRESENT (OWN-5 merged) — NOT re-declared.
- `OwnershipPolicyService.ts` exists with pinned comment `// 'project' principal lands with OWN-6` at coerceGrant — handoff EXECUTED (guard widened to admit 'project'; comment updated).
- `OwnershipPolicyService.test.ts` checked: no test asserts project rejection (only group/user defaultGrants at :23/:68) — no test expectation change needed, none made.

## Worktree setup note (fresh-worktree trap, bit again)
`git worktree add` produced a tree WITHOUT the lane-local untracked symlinks the trunk carries. First baseline run failed with a bogus module-load error: `Failed to load url ../../lint/AuthoringGuard.js` in RecordHandlers.ts (LocalAuthorization.test.ts import chain) — 1 failed file / 27 tests, NOT a real baseline. Enumerated trunk's untracked symlinks and recreated 92 of them in the worktree (node_modules x3, .env, config.yaml, server/schema, server/src/lint/AuthoringGuard.ts, server/src/ai/*, drafts/, sequences/, etc.). All baselines below were captured AFTER the fix; the contaminated first raw is discarded.

## BASELINES (captured verbatim at a711e818, post-symlink-fix)
- `npm run test:run -w server -- src/security/` → exit 0, **6 files / 37 tests passed, fail-set EMPTY**.
- `npm run test:run -w server -- src/schema/` → exit 1, **8 failed files / 38 failed tests** (26 passed, 5 skipped; 336 total). Fail-file list saved: /tmp/own6/base-schema-fails.txt (CandidateMapperSchemaConformance, ConcentrationFirstSchemaContract, ContextChainSchemaContracts, ControlledDocumentSchemas, EventGraphEquipmentSchema, LabwarePhysicalGeometryData, ProtocolPhasesSchema, ProtocolProseFieldsSchema — pre-existing lane debt).
- `npm run typecheck -w server` → **45 "error TS" lines** (exit nonzero, expected). Raw: /tmp/own6/base-server-tsc.txt.
- `npm run typecheck -w app` → **31 "error TS" lines**. Raw: /tmp/own6/base-app-tsc.txt.
(Composer's a6e3c4c0 pins 45/31 match this base exactly.)

## RED evidence (test appended FIRST, before any implementation)
Commit `91129760 test(security): RED — project principal membership contract (§T6)`.
`npm run test:run -w server -- src/security/AccessControlService.test.ts` → **exit 1**:
```
 ❯ src/security/AccessControlService.test.ts  (5 tests | 2 failed) 7ms
   ❯ ... > propagates a project grant to EVERY project member, and to nobody else
     → expected false to be true // Object.is equality   (line 68: USR-MEMBER-1 write)
   ❯ ... > enforces project grants through the grant loop only (role-scoped, nested, non-chaining)
     → expected false to be true // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```
RED carried by the true-assertions exactly as the spec predicted (USR-OWNER passes trivially via the owner short-circuit; the false-assertions already pass pre-implementation).

## Implementation (commit `314db3fc feat(security): project principal type — grants to STU-* open to the study's own members (OWN-6 / plan T6)`)
Files touched (matches task-block list + the OWN-5 handoff file):
1. `server/src/security/AccessControlService.ts` — added `AccessPrincipalType = 'user' | 'group' | 'project'`; `AccessGrant.principalType: AccessPrincipalType`; `ProjectPolicyIndex` interface; `CanAccessInput.projectPolicies?`; grant-loop `project` branch resolving via `projectPolicies?.get(...)` then `principalIsMember`; `principalIsMember` helper (owner / public / user grant / group grant via `groupContainsUser`; deliberate `return false` tail — **project principals do NOT chain**). Visibility untouched.
2. `server/src/security/AuthorizationService.ts` — **coercePolicy grant filter widened at the :48 seam** to `user || group || project` (the load-bearing coercion fix without which §T6 can never go green); `canAccess` now passes `loadProjectPolicies()`; `loadProjectPolicies()` added following the `findPolicyForRecord` list-idiom (`store.list({kind:'access-policy', limit:10000})` + `coercePolicy` + `getResourceRefId`), **index keyed by resourceRef.id, NOT ACL recordId**. No ctor change (OWN-7 owns that).
3. `server/src/api/handlers/IdentityHandlers.ts` — `sanitizeGrants` guard admits `'project'`; PUT prefix check is the plan's verbatim three-way ternary USR-/GRP-/STU- (grep gate: `:345 : g.principalId.startsWith('STU-');`). Group-membership endpoint (:452-462) untouched (out of scope).
4. `schema/identity/access-policy.schema.yaml` — `principalType.enum: [ user, group, project ]` + §T6 description line (`project = members of the project (study) named by principalId (STU-*)...`). Flat `$id` untouched.
5. `app/src/shared/api/client.ts:1899` — ONE line: `principalType: 'user' | 'group' | 'project'`. Forced ZERO app fixes (see typecheck table).
6. `server/src/security/OwnershipPolicyService.ts` — coerceGrant admits `'project'` at the pinned comment site (OWN-5→OWN-6 handoff per orchestrator ruling 1).
7. Tests: `AccessControlService.test.ts` — §T6 block copied EXACTLY (verbatim contract, `index = { get: ... }` duck-type kept) + orchestrator-approved ADDITIVE second test (role-scoped editor grant ≠ admin; nested-only memberGroupIds membership; public study admits stranger only for grant-role actions; **project-in-project does NOT chain** → false). Nothing verbatim altered or removed. `LocalAuthorization.test.ts` — appended integration test proving the coercePolicy seam: study ACL with nested-group member + direct user grant, target ACL with `{project: STU-PROJECT, editor}` → member1 (nested group), member2 (user grant) open; admin NOT carried; stranger closed; index keyed by resourceRef id.

## GREEN evidence
- `npm run test:run -w server -- src/security/AccessControlService.test.ts src/security/LocalAuthorization.test.ts` → **exit 0, 2 files / 16 tests passed** (5 + 11).
- Full `src/security/` suite: **exit 0, 6 files / 40 tests passed** (base 37 + 3 new; fail-set identical: empty).
- Schema suite: **8 failed files / 38 failed tests — diff vs base fail-list: IDENTICAL** (`diff /tmp/own6/base-schema-fails.txt /tmp/own6/head-schema-fails.txt` → empty). Zero-NEW.

## Zero-NEW-error-line table (typecheck)
| workspace | base (a711e818) | head (314db3fc) | new lines |
|---|---|---|---|
| server | 45 error TS | 45 error TS | **0** (sorted diff empty) |
| app | 31 error TS | 31 error TS | **0** (sorted diff empty) |

Exit codes nonzero at base AND head — no exit-0 claim made.

## Reviewer-bait pre-emptives
- coercePolicy seam: widened AND proven by the LocalAuthorization-level test above (coercion preserves the grant end-to-end).
- Index keying: resourceRef.id (test asserts STU-PROJECT lookup; ACL-STU-PROJECT key would fail).
- Owner short-circuit: verbatim first assertion kept; additive assertions answerable ONLY by the grant loop (member≠admin on editor grant, nested-only group member, public-study stranger role-scoped, non-chaining).
- exactOptionalPropertyTypes: `projectPolicies` never passed as explicit `undefined`; server canAccess always passes a real index; tests always pass a real object literal.
- Visibility: not re-declared (already on trunk at base).
- Hardcode boundary: code only checks USR-/GRP-/STU- prefix shapes; membership rules stay in study ACL data; no kind lists, no member enumeration (D10), no members[] on study (D3).
- YAML-reload trap: the access-policy.schema.yaml change is INERT on the running :3092 stack until the orchestrator restarts. NO runtime claim made; no restart, no curl performed.

## Stop boundary
Not hit: no project-in-project chaining was needed (non-chaining is implemented and asserted), canAccess response shape unchanged. No new platform gap found (client widening forced zero app changes; schema registry accepted the enum — schema suite fail-set identical).

## Commits
- 91129760 test(security): RED — project principal membership contract (§T6)
- 314db3fc feat(security): project principal type — grants to STU-* open to the study's own members (OWN-6 / plan T6)
- (this report) docs(own6): coder report

Staged file-by-file; no `git add -A`; trunk worktree untouched; live tree untouched.
