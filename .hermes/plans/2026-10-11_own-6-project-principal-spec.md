# OWN-6 — The `project` principal: share with project members via the project's own ACL

Composer draft l1t0535 (2026-10-11). DRAFT — orchestrator reviews and promotes; never dispatched unreviewed.
Plan of record: `.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md` §T6 (word of record),
D3/D10 pinned, §Reconciliation respected. Task block: `~/.hermes/cl/lanes/1/task-list.md` id OWN-6 (~:2618).

## Goal

One sentence: a grant `{principalType: 'project', principalId: 'STU-*', role}` on any record's
access-policy opens that record's role-actions to EVERY member of the study named by principalId —
membership being the study's OWN access-policy (owner, user grant, group grant incl. nested, or a
public study) — with no `members[]` field on study (D3) and no enumeration of members (D10).

## Dependencies and lane state (composer-verified at a6e3c4c0)

- Trunk: `cl/integration-1` @ `a6e3c4c0` (QMS-8 merged: `25f74aaa` is an ancestor — the client.ts
  rebase note in the task block is already satisfied). ALWAYS use `git -c core.fileMode=false`.
- **OWN-5 sibling** (queued, branch `wt/OWN-5-lane1-l1t0520`, tip `c54fb495`): composer diffed the
  branch first-hand. It adds `export type Visibility = 'private' | 'shared' | 'public'` to
  `AccessControlService.ts` (line 3 on the branch) and uses it in `AccessPolicyRecord.visibility`;
  it adds `server/src/security/OwnershipPolicyService.ts` whose `coerceGrant` (:75-84 on the
  branch) is deliberately narrowed to user|group with the pinned comment
  `// 'project' principal lands with OWN-6` (:83). **Visibility is NOT on trunk at a6e3c4c0**
  (composer verified: grep of trunk AccessControlService.ts finds no Visibility symbol).
  WORKER RULE: at YOUR dispatch base, re-check. If OWN-5 is merged: do NOT re-declare `Visibility`,
  and DO widen `coerceGrant` at the pinned comment site to admit `'project'` (that handoff is
  OWN-6's). If OWN-5 is NOT merged: touch nothing Visibility-related, skip the coerceGrant edit
  (file won't exist), and never duplicate the type. Your AccessControlService edits are confined
  to AccessGrant/CanAccessInput/canAccess/the helper and are textual-disjoint from the Visibility line.

## Anchors verified first-hand at a6e3c4c0 (path:line)

- `server/src/security/AccessControlService.ts` (78 lines total):
  - `:5` `AccessGrant.principalType: 'user' | 'group'` (the union to widen; no `AccessPrincipalType`
    name exists yet — plan §T6 verbatim introduces it).
  - `:10-16` `AccessPolicyRecord` (visibility inline union at :13 until OWN-5 lands).
  - `:34-38` `CanAccessInput` (add `projectPolicies?` here).
  - `:54-67` `canAccess` — flow: null policy → true (:55); public read → true (:56); no userId →
    false (:57); **owner short-circuit :58**; grant loop :60-64 (user :62, group :63 via
    `groupContainsUser`).
  - `:69-77` `groupContainsUser` — THE nesting resolver OWN-6 mirrors: visited-set cycle guard,
    `memberUserIds` direct hit, recurse via `memberGroupIds`. `principalIsMember` reuses it, so
    nested-group project members are covered for free.
- `server/src/security/AuthorizationService.ts` (223 lines):
  - `:33-53` `coercePolicy` — **`:48` is the hidden load-bearing seam**: the grant filter accepts
    only `principalType === 'user' || 'group'`. Without widening THIS, `resolveEffectivePolicy`
    and `loadProjectPolicies` both drop project grants and the §T6 server test can never go green.
    Plan §T6's sketch does not call this out — reviewer bait, see below.
  - `:67-72` `getResourceRefId` — reads `payload.resourceRef.id`; THIS is how an access-policy is
    keyed to its resource (e.g. policy ACL-STU-XXX ↔ resource `STU-000003`). NOT recordId.
  - `:93` constructor `constructor(private readonly store: RecordStore) {}` — OWN-6 adds NO ctor
    param (OWN-7 owns that). `:95-99` `canAccess` is the single place to pass `loadProjectPolicies()`.
  - `:175-178` `findPolicyForRecord` — precedent for `store.list({ kind: 'access-policy', limit: 10000 })`
    + resourceRef matching; `loadProjectPolicies` follows the same idiom (plan §T6 verbatim).
  - Consumers of `canAccess(userId, action, record)` (no signature change, so no churn):
    server.ts:495 constructs the service; handlers SignatureHandlers, IdentityHandlers,
    ExecutionHandlers, LabSettingsHandlers, RecordHandlers all call it unchanged.
- `schema/identity/access-policy.schema.yaml`:
  - `:2` flat `$id` `https://computable-lab.com/schema/computable-lab/access-policy.schema.yaml`
    (no `/identity/` segment — do not "fix" it).
  - `:52-54` `grants.items.properties.principalType.enum: [ user, group ]` — becomes
    `[ user, group, project ]`; extend the grants description per §T6:
    `project = members of the project (study) named by principalId (STU-*)`.
  - `:55-56` `principalId` is a bare string (no pattern) — the STU- prefix is enforced at the API gate.
- What identifies "the project": kind `study`, schema `schema/studies/study.schema.yaml`
  (flat `$id` at :2), recordId convention `STU-000003` (study.schema.yaml:27-29 — description only,
  NO enforced pattern; the STU- gate at IdentityHandlers:343 is the only enforcement). Flow:
  grant.principalId `STU-X` → loadProjectPolicies map keyed by `resourceRef.id` → study's own
  access-policy → membership.
- `server/src/api/handlers/IdentityHandlers.ts`:
  - `:117-132` `sanitizeGrants` — guard at `:126` (`principalType !== 'user' && !== 'group'` →
    continue). Must admit `'project'` (extend the guard; keep returning `AccessGrant[]`).
  - `:343` PUT prefix check: `g.principalType === 'user' ? USR- : GRP-` → plan §T6 verbatim
    three-way ternary adding `project → STU-`.
  - `:452-462` group-membership endpoint (`principalType (user|group)` at :460) — **OUT OF SCOPE**:
    project principals are never group members; do not touch.
- `app/src/shared/api/client.ts`:
  - `:1899` `principalType: 'user' | 'group'` on `AccessGrant` — the ONE-line widening (task block's
    ":1882" drifted; 1899 is current).
  - `:1999` `addGroupMember` member type — OUT OF SCOPE (same reason as :460 server-side).
- Test harness: `server/src/security/AccessControlService.test.ts` (39 lines, plain unit style,
  fixture groups at :14-17 with a real nested case — append the §T6 test here).
  `server/src/security/LocalAuthorization.test.ts` (363 lines) has `class MemoryRecordStore` at :17
  whose `list()` filters by `payload.kind` — a store holding an ACL for the study will serve
  `loadProjectPolicies` in an integration-style test; do NOT rewrite the store (OWN-5 extracts it).
- `exactOptionalPropertyTypes: true` at `server/tsconfig.json:13`.
- Baselines measured by composer at a6e3c4c0: `npm run typecheck -w server` = **45 "error TS"
  lines**; `npm run typecheck -w app` = **31 "error TS" lines**. Both exit nonzero — "exit 0"
  claims are FORBIDDEN; the gate is zero NEW error lines vs your own base.

## Explicitly OUT of scope

- No product-code changes beyond the In-scope files. No `members[]` on study.schema.yaml (D3).
- No OwnershipPolicyService creation/rewrite; only the pinned coerceGrant widening IF OWN-5 is
  already in your base (see Dependencies).
- No ShareRecordDialog / VisibilityBadge / GroupMembershipSection UI work (UI authoring of project
  grants rides OWN-11/OWN-12). If widening the client union forces any app file to change beyond
  zero-error preservation, that is a platform gap → STOP.
- No changes to `ensureOwnerPolicy` (:101-151), the hardcoded `'private'` (:124), canAccess's
  response shape, group-membership endpoints, `addAccessGrant`/role-grant, `POLICY_ROOT_KINDS`.
- No server.ts / routes.ts edits (no wiring needed: canAccess loads its own index).
- No lane-stack restart, no curl against :3092/:3001/:5174/:3093/:5193/:5192 (orchestrator owns
  restarts and API proofs). Schema YAML changes will NOT be live on the running stack until the
  orchestrator restarts — never claim runtime acceptance.

## Acceptance criteria (verbatim from task list, id OWN-6)

> verified by:
>   npm run test:run -w server -- src/security/AccessControlService.test.ts
>   src/security/LocalAuthorization.test.ts green; npm run typecheck clean.
> stop_boundary:
>   Any need to make project principals chain (project-in-project) or to change canAccess's
>   response shape -> architect.

(`npm run typecheck clean` is interpreted per AS-ORCH-L1-027/028 as **zero NEW error lines vs your
own base**; exit-0 claims forbidden.)

## Implementation (plan §T6 verbatim-authoritative)

Verbatim from plan §T6, use as-is:

1. RED test appended to `AccessControlService.test.ts` — the §T6 block at plan lines 825-857
   (`propagates a project grant to EVERY project member, and to nobody else`), copied EXACTLY
   (it is the contract; the `index = { get: ... }` object literal is the ProjectPolicyIndex duck-type).
2. Type block (plan lines 862-884): `AccessPrincipalType = 'user' | 'group' | 'project'`,
   `AccessGrant.principalType: AccessPrincipalType`, `ProjectPolicyIndex` interface
   (`get(projectId): AccessPolicyRecord | null`), `CanAccessInput.projectPolicies?`.
   If OWN-5 is in your base, `Visibility` already exists — do not re-declare it; the §T6 block
   also shows `export type Visibility` — OMIT that line when it already exists.
3. Grant-loop extension (plan lines 888-898) — destructure `projectPolicies`, add the
   `principalType === 'project'` branch resolving through `projectPolicies?.get(...)` then
   `principalIsMember`.
4. `principalIsMember` helper (plan lines 903-914) — owner, `visibility === 'public'`, user grant,
   group grant via `groupContainsUser`; **the `return false` tail is deliberate: project principals
   do NOT chain** (project-in-project is the stop boundary).
5. `AuthorizationService.canAccess` + `loadProjectPolicies` (plan lines 919-936) — the index is
   keyed by `getResourceRefId(env)` (NOT policy recordId), built via
   `store.list({ kind: 'access-policy', limit: 10000 })` + `coercePolicy`.
6. **Plus the seam the plan sketch assumes silently**: widen `coercePolicy` at
   AuthorizationService.ts:48 to `(g.principalType === 'user' || g.principalType === 'group' ||
   g.principalType === 'project')`. Without it both the target policy's project grants and every
   study policy pass through a filter that DROPS project grants — §T6's test stays red forever.
7. Schema widening at access-policy.schema.yaml:54 + description line (see Anchors).
8. API gate: IdentityHandlers.ts:126 guard admits `'project'`; :343 becomes the plan's verbatim
   three-way ternary (USR-/GRP-/STU-).
9. Client: client.ts:1899 `principalType: 'user' | 'group' | 'project'`. ONE line.

## First targeted check (early proof)

After step 1 only (test written, before implementation), from repo root:

    npm run test:run -w server -- src/security/AccessControlService.test.ts

Expected: the new §T6 test FAILS (the project grant is ignored — `toBe(true)` assertions fail for
USR-MEMBER-1/USR-MEMBER-2; the false-assertions may already pass, which is why the true-assertions
carry the RED signal). If it goes green without implementation, the test was mis-copied — fix that
before writing code.

## Verification commands (worker runs; exact expected outcomes)

1. Security suite:
   `npm run test:run -w server -- src/security/AccessControlService.test.ts src/security/LocalAuthorization.test.ts`
   Expected: ALL tests pass, including pre-existing ones (base fail-file set for `src/security/`:
   **recapture at YOUR OWN base** before implementing —
   `npm run test:run -w server -- src/security/ 2>&1 | tail -20` — and require the identical
   fail-set at head; if the lane moved, the done-gate is zero-NEW-failures).
2. Server typecheck baseline diff:
   base: `git -c core.fileMode=false rev-parse HEAD` (record in report; 45 error-TS lines expected
   at a6e3c4c0) → head: `timeout 300 npm run typecheck -w server 2>&1 | grep -c "error TS"` —
   must equal your recorded base count (zero NEW lines; exit code nonzero is expected).
3. App typecheck: `timeout 300 npm run typecheck -w app 2>&1 | grep -c "error TS"` — must equal
   your recorded base count (31 at a6e3c4c0). The client.ts widening must force ZERO app fixes.
4. Schema gate: `grep -n "principalType" schema/identity/access-policy.schema.yaml` →
   `enum: [ user, group, project ]` on the line after it; and no schema-test regression:
   `npm run test:run -w server -- src/schema/` (zero-NEW-failures vs own base per AS-ORCH-L1-028).
5. API gate grep: `grep -n "STU-" server/src/api/handlers/IdentityHandlers.ts` shows the new branch.
6. `git -c core.fileMode=false diff --stat` in report — files touched must match the task block's
   file list (+ OwnershipPolicyService.ts ONLY if the OWN-5 handoff applies).
7. YAML reload trap: schema change does not hot-reload; do not restart anything, do not curl; note
   in report that runtime proof belongs to the orchestrator's post-merge restart.

## Worker contract

- Branch off DISPATCH-TIME trunk HEAD of `cl/integration-1`: `wt/OWN-6-lane1-l1t0535`.
- Commit sequence: RED test commit, then implementation, then docs — suggested messages:
  `test(security): RED — project principal membership contract (§T6)`,
  `feat(security): project principal — share with project members via the project's own ACL`,
  `docs(own6): coder report`.
- Unique report path: `<REPORT_PATH>` (orchestrator substitutes at dispatch; suggested
  `/home/brad/.hermes/cl/lanes/1/own6-report-l1t0535.md`). Report must contain: base sha, base
  fail-file set + error-TS counts (steps 1-3 baselines), RED evidence excerpt, GREEN evidence,
  zero-NEW-error-line table, OWN-5-merge state observed (Visibility present? coerceGrant widened?),
  and any STOP justification.
- NO lane-stack restarts, NO curl, NO git writes to trunk, NO `git add -A` (stage exact files).
- Stop-boundary: (a) any need for project principals to CHAIN (project-in-project) or any change
  to canAccess's response shape → STOP, requires-rescope (architect via orchestrator); (b) any NEW
  platform gap discovered (e.g. client widening forces non-additive app changes, schema registry
  rejects the enum change, lint schema pins principalType elsewhere) → STOP, requires-rescope, with
  evidence in the report. Do not widen scope to plumb through a gap.

## Reviewer bait (expect these in adversarial review — pre-empt in the report)

- **AuthorizationService.ts:48 coercePolicy filter** — the silent seam. If you only applied plan
  §T6 verbatim, project grants are dropped at coercion and the integration behaviour is fake.
  Prove with a LocalAuthorization-level test (study ACL carrying a nested-group member + a target
  record ACL carrying `{project: STU-*}` → member canAccess true, stranger false) that coercion
  preserves the grant.
- **Index keying** — resourceRef.id, not ACL recordId (ACL-STU-A maps STU-A; a map keyed by
  recordId passes the unit duck-type test but is wrong in production).
- **Owner short-circuit at AccessControlService.ts:58** — in §T6's verbatim test the first
  assertion (USR-OWNER) is trivially true via the owner check, not via the project grant. Do NOT
  delete it; ADD assertions that only the grant loop can answer: project member ≠ admin on an
  editor-role project grant; a user inside a group that is ONLY reachable via nested memberGroupIds
  on the study policy; a public study admits a stranger only for actions the grant role allows;
  a study policy carrying a `project` grant pointing at another study does NOT chain
  (`principalIsMember` returns false — add the assertion).
- **exactOptionalPropertyTypes** (server/tsconfig.json:13) — `projectPolicies?:` is optional; never
  pass `projectPolicies: undefined` explicitly; canAccess server-side always passes a real index.
- **Visibility duplicate** — if OWN-5 merged, a second `export type Visibility` is a re-declaration
  compile error; check before typing anything. If OWN-5 did NOT merge, do not "helpfully" add it.
- **Hardcode boundary** — membership rules stay in the study's ACL data; code only checks prefix
  shapes (USR-/GRP-/STU-). No kind lists, no member enumeration, no study-id special-casing.
- **YAML-reload trap** — access-policy.schema.yaml change is inert on the running :3092 stack until
  the orchestrator restarts; any report claiming the API accepts project grants at runtime without
  a restart is unfounded.
- **Ontology terms** — "project" == study record (STU-*); "project members" is a SET (D10);
  "public study" means its ACL visibility, not the record's payload.

## Open questions for orchestrator

1. Dispatch order vs OWN-5: my spec handles both orders (see Dependencies), but the coerceGrant
   handoff at OWN-5's `// 'project' principal lands with OWN-6` comment (branch c54fb495, OwnershipPolicyService.ts:83
   on-branch) is only executable if OWN-5 is merged first. Recommend promoting/dispatching OWN-6
   to run AFTER the OWN-5 merge; else the pinned handoff silently no-ops and ownership-policy
   `defaultGrants` keep rejecting project entries until a later item. (Checked: branch diff
   first-hand, Visibility absent from trunk at a6e3c4c0.)
2. §T6's verbatim test has the weak first assertion (owner short-circuit) described in reviewer
   bait. My spec keeps it verbatim and ADDS stronger assertions — confirm the orchestrator accepts
   the additive deviation (nothing verbatim is altered or removed).
3. Task block's client.ts anchor says :1882; current trunk line is :1899 (verified — QMS-8 merged
   at 25f74aaa shifted it). Spec pins :1899 at a6e3c4c0; if the task-list line is the promoted
   authority, update it or confirm the drift is acceptable.

COMPOSER DONE /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/drafts/2026-10-11_own-6-project-principal-spec.l1t0535.draft.md

## ORCHESTRATOR PROMOTION + ADJUDICATION (20261011T0650) — CANONICAL

Promoted from draft l1t0535. Trunk has MOVED to 9067df66 (OWN-5 + OWN-1 merged since the
composer's a6e3c4c0 anchor). Orchestrator re-verified the load-bearing anchors FIRST-HAND at
9067df66: AccessControlService.ts:3 `export type Visibility` PRESENT;
OwnershipPolicyService.ts:83 pinned comment `// 'project' principal lands with OWN-6` PRESENT;
AccessGrant union still `'user' | 'group'` (:6); AuthorizationService coercePolicy filter at ~:48
still user|group only; IdentityHandlers sanitizeGrants guard (`!== 'user' && !== 'group' ->
continue`) and the PUT ternary (USR-/GRP- only) present; client.ts:1899 union at :1899;
access-policy.schema.yaml:54 `enum: [ user, group ]`. All composer anchors hold.

RULINGS on the composer's open questions:
1. OWN-5 IS MERGED (9067df66). The merged path applies: do NOT re-declare Visibility; DO widen
   coerceGrant at OwnershipPolicyService.ts:83 to admit 'project' (update its test expectations
   if any assert project rejection — check OwnershipPolicyService.test.ts for such a case; if it
   exists, change it to accept 'project' per this ruling, that is OWN-6's own handoff, not churn).
   Base = dispatch-time trunk HEAD (record sha in report).
2. Additive deviation ACCEPTED — §T6 verbatim test kept intact, stronger assertions added.
3. client.ts :1899 is the authoritative anchor; the task-block's :1882 drift is accepted as
   stale; the promoted spec's line wins.

DISPATCH: worktree wt/OWN-6-lane1-l1t0650 (self-create off dispatch-time trunk HEAD). Report
path: /home/brad/.hermes/cl/lanes/1/own6-report-l1t0650.md. Fleet-queued behind EDITOR-9 fix2.
