# OWN-15 — Record-create ACL stamping: the CREATING user must own the new record

Status: SPEC PROMOTED (orchestrator l1t1545, 2026-10-17). Composer anchors re-verified
first-hand at trunk 73eafeb0: OwnershipPolicyService.ts:158 lab-substitution,
AuthorizationService.ts:127 resolvedOwnerUserId, RecordHandlers.ts:860 mint call,
:940 access-policy->admin gate, LocalAuthorization.test.ts:495/:500 +
OwnershipPolicyService.test.ts:48/:68 certify-the-defect assertions, seed
labOwnerUserId: USR-LOCAL-ADMIN + inert GRP-LAB-ADMINS grants, no group/ dir in either
data dir — ALL CONFIRMED.
ORCHESTRATOR OQ ADJUDICATIONS (all = the composer's recommended defaults, within the
binding R2 ruling "routine implementation choices" latitude):
  OQ1 = keep OwnershipScope 'lab' as visibility/grants semantics; creator is stamped owner;
    seed GRP-LAB-ADMINS as a real kind:group record with data-declared members so the five
    defaultGrants resolve.
  OQ2 = option (c): unresolvable declared grants are STRIPPED at mint with an explicit,
    observable, tested refusal (typed warning surfaced, never silent); a declaration-side
    lint makes the strip unreachable in practice; the record is never left ownerless/open.
  OQ3 = narrow rule only: the owner of the record referenced by an access-policy's
    resourceRef.id satisfies 'admin' on that ACL row; ONE declared rule in
    AuthorizationService.canAccess; a non-owner must still 403.
Task block: `/home/brad/.hermes/cl/lanes/1/task-list.md:4914-4949` (id: OWN-15).
Binding ruling: `/home/brad/.hermes/cl/lanes/1/decisions/L1-wave3-followup-rulings-20261017.md` R2
— "the ACL stamped at record creation must name the CREATING user as owner"; current behavior is
declared WRONG, not policy; no further ruling needed for routine implementation choices.

## Goal (one sentence)

Make record-create stamp the acting session user as `ownerUserId` on the new record's
access-policy, guarantee every identity/group referenced by a minted ACL actually resolves
(unresolvable = defect, honestly refused at create), keep the identity defaults in DATA (the
ownership-policy document), and let the owner of a record administer that record's own ACL.

## Verified recon (composer first-hand, trunk `cl-integration-1`, `git -c core.fileMode=false`)

### Where the create-path ACL is minted

- `server/src/api/handlers/RecordHandlers.ts:860` — createRecord's mint call:
  `await security?.authorizationService?.ensureOwnerPolicy(result.envelope, user.userId)`, where
  `user` comes from `resolveRequestUser` at `RecordHandlers.ts:581` (session token first, then
  explicit header). Other mint sites: `RecordHandlers.ts:395` (draftCopy),
  `IdentityHandlers.ts:372` (putAccessPolicy's ensure-base-ACL fallback),
  `sequences/SequenceService.ts:48`, and `AuthorizationService.backfillOwnerPolicies`
  (`AuthorizationService.ts:208-234`).
- THE MINT: `server/src/security/AuthorizationService.ts:109-168` (`ensureOwnerPolicy`) builds the
  `ACL-<RESOURCEID>` envelope at `:122-146` and persists it at `:158`. The stamped owner is
  `AuthorizationService.ts:127` — `resolvedOwnerUserId = defaults?.ownerUserId ?? ownerUserId`.
  The creator id itself is therefore only used when NO ownership-policy document resolves.

### Where USR-LOCAL-ADMIN + GRP-LAB-ADMINS come from (the defect, declaration side)

- DECLARATION (data): `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml:15`
  declares `labOwnerUserId: USR-LOCAL-ADMIN`, and `defaultGrants: [{principalType: group,
  principalId: GRP-LAB-ADMINS, role: admin}]` on five lab-owned kinds at lines 59-60 (material),
  67-68 (material-spec), 87-88 (instrument), 95-96 (equipment), 103-104 (labware). The seed's own
  comment (line 52) says "Create GRP-LAB-ADMINS (with its members) first; an unresolved group is
  inert" — nobody ever did.
- RESOLUTION (code): `server/src/security/OwnershipPolicyService.ts:158` —
  `ownerUserId: rule.owner === 'lab' ? doc.labOwnerUserId : input.creatorUserId`. For the five
  lab-owned kinds the creator is REPLACED by `USR-LOCAL-ADMIN` at mint time. For creator-owned
  kinds the stamping already honors `creatorUserId`.
- `USR-LOCAL-ADMIN` is the bootstrap constant `server/src/security/LocalIdentityService.ts:6`
  (`LOCAL_ADMIN_USER_ID`); `resolveRequestUser` (`LocalIdentityService.ts:97`) honors the
  bootstrap header only while the admin has no credential (`:119-138`), so on any real lane stack
  the acting user is a real USR-* while lab-kind ACLs keep pointing at the bootstrap id.
  `GRP-LAB-ADMINS` exists NOWHERE: no group record is seeded
  (`records/seed/identity/` contains only OWN-LAB-DEFAULT) and no `group/` directory exists in
  either data dir (verified `ls`, below). `AccessControlService.groupContainsUser`
  (`server/src/security/AccessControlService.ts:86-87`) returns false for a missing group —
  the grant is SILENTLY inert, never an error.

### The 403 + un-updatability mechanism (resolution side)

- Creator-owned kinds pass `owner == creator` (`AccessControlService.ts:67`), so the 403 bites on
  the five lab-owned kinds: creator ≠ stamped owner ⇒ read/write denied, and
  `IdentityHandlers.putAccessPolicy`'s admin gate (`IdentityHandlers.ts:363-367`,
  `canAccess(resolved.userId, 'admin', record)`) 403s the creator out of fixing it.
- The generic record-update route makes it self-locking: `RecordHandlers.ts:940` (and the second
  update gate at `RecordHandlers.ts:1484`) sets `requiredAction = 'admin'` when the payload kind is
  `access-policy`, and `resolveEffectivePolicy` (`AuthorizationService.ts:174-176`) resolves an
  access-policy record to ITSELF — so the ACL row is admin-only to `USR-LOCAL-ADMIN`, a dead end:
  the bad ACL cannot be updated through any API. (This matches the debt's "un-updatable via API".)

### Identity/group resolution surfaces (what "resolvable" means at create)

- Users: `IdentityHandlers.listUsers` (`IdentityHandlers.ts:227-228`, `store.list({kind:'user'})`),
  active-user predicate `LocalIdentityService.ts:23-27` (`payload.kind === 'user' && status === 'active'`).
- Groups: `IdentityHandlers.loadGroupSummaries` (`IdentityHandlers.ts:161`), `GET /api/groups`
  (`IdentityHandlers.ts:408-410`); enforcement-side coercion `AuthorizationService.coerceGroup`
  (`AuthorizationService.ts:59-69`), loader `:236-239`.

### Data-dir inventory (INVENTORY ONLY — no repair in this item)

MAIN (`/home/brad/.computable-lab/worktrees/main/records`, readable):
- 208 `access-policy/` records. Owner census: 183 USR-BRAD, **23 USR-LOCAL-ADMIN**, 2 USR-QMS-ADMIN.
- **0** name GRP-LAB-ADMINS. **No `group/` directory exists** — no group resolves on main either.
- Examples of USR-LOCAL-ADMIN-owned: `access-policy/ACL-PRT-2CCKM7__untitled.yaml`,
  `access-policy/ACL-PLR-000001__untitled.yaml`, `access-policy/ACL-PLR-AUTH-OP__untitled.yaml`.

LANE-1 (`/home/brad/.computable-lab-lane1/worktrees/main/records`):
- 368 `access-policy/` records. Owner census: 313 USR-BRAD, 32 USR-QMS-ADMIN, **23 USR-LOCAL-ADMIN**.
- **2** reference GRP-LAB-ADMINS: `access-policy/ACL-EQP-QMS8-JOURNEY-2__untitled.yaml` (equipment,
  ownerUserId USR-LOCAL-ADMIN + admin grant to the nonexistent group — minted 2026-10-17, live
  defect), `access-policy/ACL-OWN6-PROOF-1__untitled.yaml` (mentions GRP-LAB-ADMINS only as a
  resourceRef target, owner USR-QMS-ADMIN — benign). No `group/` directory.
- Migration decision this feeds: bulk repair stays OUT of scope (task block, verified-by);
  main's 23 + lane-1's 23 + 2 are the recorded backlog; lane data already hand-repaired per the
  task block. `applyOwnershipDefaults.ts` (`server/src/scripts/applyOwnershipDefaults.ts:180`,
  lab-owner rewrite) remains the existing repair lever if a future wave wants it.

### Existing tests to extend (RED-first hosts)

- `server/src/security/LocalAuthorization.test.ts` — in-memory MemoryRecordStore + real
  RecordHandlers routes + AuthorizationService + OwnershipPolicyService harness (imports at :13-15;
  store class :19). Route-level create tests exist ("stamps new project, experiment, run, and
  protocol records with the active local user" :296, "stamps the declared visibility and owner for
  lab-shared kinds" :458). **:495 currently ASSERTS the defect** (expects stamped
  `ownerUserId === 'USR-LOCAL-ADMIN'`) and **:500 asserts the inert GRP-LAB-ADMINS grant** —
  these assertions must FLIP with the ruling, they are not to be worked around.
- `server/src/security/OwnershipPolicyService.test.ts:48,68` — asserts
  `defaults.ownerUserId === 'USR-LOCAL-ADMIN'` and the GRP grant for instrument; extend/flip.
- `server/src/scripts/applyOwnershipDefaults.test.ts:51,67` — uses the same ids as fixtures
  (data-declared labOwner in test fixtures is fine; no code change needed there unless the
  declaration-shape validation added below touches its inputs).
- `server/src/api/handlers/LabSettingsHandlers.routes.test.ts` documents the fail-closed
  bootstrap-fallback behavior the fix must reuse (resolver is NOT to be changed).

## Acceptance criteria (verbatim from task list, `verified by:`)

> RED first: server test creating a record as a non-admin session user then GET/PUT as that
> user -> currently 403 (reproduces the debt), ACL ownerUserId is unresolvable + group
> absent from users/groups. GREEN: create-as-user -> owner=creating user; self read/write
> pass without any data-dir repair; no unresolvable identities stamped (lint/validate the
> ACL against the users/groups surfaces); unknown-group stamping refused honestly at
> create; server suite green; the QMS7-8-style journey needs zero ACL hand-repairs.

### GREEN criteria (concretized)

1. **Creator-as-owner, all kinds**: `defaultsForCreate` never substitutes a lab-owner user id for
   the creator at create-stamp time — `AuthorizationService.ensureOwnerPolicy` stamps
   `ownerUserId === creatorUserId` for every minted ACL (visibility may still be public per the
   declaration; ownership ≠ visibility). The `rule.owner: 'lab'` distinction may only affect
   visibility/grants, never the owner stamp.
2. **Declaration fixed, not just resolution**: the seed document no longer points ownership at an
   unresolvable identity — either `labOwnerUserId` names a seeded, active user record, or the
   field/usage is retired from the create path; AND `GRP-LAB-ADMINS` either EXISTS as a seeded
   `group` record with resolvable members, or the five `defaultGrants` are absent. One or the
   other, in DATA — not by hardcoding an empty list in TS.
3. **Resolvability checked at mint (lint/validate)**: before persisting, `ensureOwnerPolicy`
   validates `ownerUserId` against the users surface and every `group` grant against the groups
   surface (the same surfaces listed above). An unresolvable principal is REFUSED HONESTLY: no
   silent inert grant — typed, observable refusal (see OQ2 for refusal semantics).
4. **Owner-of-record can administer their record's ACL**: smallest honest rule — an
   `access-policy` record is admin-able by the owner of the resource it references
   (`resourceRef.id`), declared in ONE place (`AuthorizationService.canAccess` delegation, see
   Contracts), not branched per-handler at the call sites (`RecordHandlers.ts:940/1484`,
   `IdentityHandlers.ts:364` keep their single `canAccess(..., 'admin', ...)` call).
   Consequence: the self-lock at `AuthorizationService.ts:174-176` no longer dead-ends creators,
   and PUT /records/:id/access-policy by the creating user returns 200 without any data repair.
5. **No hardcoded identities in TS**: `USR-LOCAL-ADMIN` / `GRP-LAB-ADMINS` appear in product TS
   ONLY as the existing `LOCAL_ADMIN_USER_ID` bootstrap constant (unchanged, out of scope) and in
   TEST data. Any new default source is read from the ownership-policy record / group records.
6. **Suite + baselines**: `npm run test:run -w server` green; `npm run typecheck -w server`
   EXACTLY 33 errors carried (AS-ORCH-L1-102) — zero new; `npm run typecheck -w app` stays at its
   23-error baseline (untouched workspace); app vitest stays 61|65 (untouched).
   Handoff anchor: `.hermes/plans/handoffs/2026-10-17_lane1-tick-20261017T1320-own14-coding-own15-composing.md:87`.

## Files in scope

- `server/src/security/AuthorizationService.ts` — mint stamping (`:123-128`), resolvability
  validation + honest refusal in `ensureOwnerPolicy`, owner-of-resource delegation in `canAccess`.
- `server/src/security/OwnershipPolicyService.ts` — `defaultsForCreate` (`:153-164`) owner stamp;
  (optionally expose declared-default resolvability, per OQ2/OQ3 adjudication).
- `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml` — the declaration fix
  (`:15`, `:59-60`, `:67-68`, `:87-88`, `:95-96`, `:103-104`).
- `records/seed/identity/` — NEW seeded group record for the admin group IF OQ1 lands "seed it"
  (e.g. `GRP-LAB-ADMINS__lab-administrators.yaml`, `kind: group`, resolvable members).
- `schema/identity/ownership-policy.lint.yaml` — optionally a declared lint that defaultGrants
  reference existing principals (declarative-first home for criterion 3; TS validation still
  required because mint uses `skipLint: true` at `AuthorizationService.ts:161`).
- `server/src/security/LocalAuthorization.test.ts` — RED tests + flipped `:495`/`:500` assertions.
- `server/src/security/OwnershipPolicyService.test.ts` — flipped `:48`/`:68` + resolvability cases.
- `server/src/security/AccessControlService.test.ts` — if delegation surfaces here (per OQ3).

## Explicitly OUT of scope

- Bulk repair of already-minted bad ACLs (main 23 + lane-1 23/2 inventoried above — numbers only;
  no data-dir writes, no applyOwnershipDefaults run).
- `LocalIdentityService` / bootstrap / session machinery (reuse only; fail-closed behavior at
  `LocalIdentityService.ts:119-138` is settled — do not touch).
- Client/app work of any kind (share-surface gating is OWN-14, in flight).
- `LOCAL_ADMIN_USER_ID` semantics; `backfillOwnerPolicies` guess-nothing policy
  (`AuthorizationService.ts:208-234`) — it feeds `ensureOwnerPolicy` and inherits the fix passively.
- New ACL/role system, ACL UI changes, MCP tool changes.

## Contracts (what may change, what must not)

- `AuthorizationService.ensureOwnerPolicy(resource, ownerUserId)` — same signature; behavior: the
  persisted payload's `ownerUserId` equals the passed creator (validated resolvable), and every
  stamped `group` grant's `principalId` resolves to a `kind: group` record. Refusal path per OQ2.
- `AuthorizationService.canAccess(userId, action, record)` — one added declared rule: when `record`
  is `kind: access-policy` with a resolvable `resourceRef.id`, the REFERENCED record's owner (and,
  if adjudicated in OQ3, that record's admins) satisfies `admin` on the ACL row. No new signatures,
  no call-site branching; all existing call sites
  (`RecordHandlers.ts:940,1484`, `IdentityHandlers.ts:303,313,314,364`, routes at
  `server/src/api/routes.ts:276-277`) keep their current shape.
- `OwnershipPolicyService.defaultsForCreate` — same signature; `CreateDefaults.ownerUserId` must
  be `input.creatorUserId` (the `OwnershipScope 'lab'` remains in the data/schema as a
  visibility/grants concept; retiring the enum value is OQ1's call, not required here).
- `AccessControlService.canAccess` (pure evaluator) — unchanged unless OQ3 lands the delegation
  inside it via `CanAccessInput` (prefer AuthorizationService: it owns store access).
- Envelope/schema contract: minted ACLs must keep every field the access-policy schema declares
  (`kind: access-policy`, `recordId`, `resourceRef`, `visibility`, `ownerUserId`, `grants`) —
  ontology terms come from `schema/identity/ownership-policy.schema.yaml` / the access-policy
  schema; do not invent payload fields to smuggle resolvability state (put it in a typed error).
- The OWN-LAB-DEFAULT seed fallback at `OwnershipPolicyHandlers.ts:47-52` is LOAD-BEARING
  (AS-ORCH-L1-042, marked verbatim-keep) — do not delete or reroute it.

## First targeted check (early proof of approach)

The RED test itself is the early check — it fails before any fix exists:

```
npm run test:run -w server -- LocalAuthorization -t 'creating user owns'
```

Expected RED (before product-code change): the new test fails with the minted ACL showing
`ownerUserId: USR-LOCAL-ADMIN` (or the doc's labOwner) ≠ creator, and the creator's GET/PUT
of their new lab-kind record + its access-policy answering 403/404-403. If the test does NOT
fail this way, the approach (or the test harness user wiring) is wrong — stop and re-diagnose,
do not proceed to the fix.

## Verification commands (complete, with expected output)

1. RED (pre-fix, on the new/extended tests):
   `npm run test:run -w server -- LocalAuthorization OwnershipPolicyService`
   → FAIL on the new creator-owns assertions (defect reproduced).
2. GREEN tests: same command AFTER the fix → PASS, all pre-existing cases too (the `:495`/`:500`
   assertions flipped in the same commit).
3. Server suite: `npm run test:run -w server` → green, 0 failures.
4. Server typecheck: `npm run typecheck -w server` → exactly the 33 carried errors
   (AS-ORCH-L1-102); diff error count vs. pre-branch baseline = 0 new.
5. App untouched: `npm run typecheck -w app` → unchanged 23-error baseline (informational).
6. Declaration resolvability smoke (data check):
   `grep -c 'GRP-LAB-ADMINS' records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml`
   + `ls records/seed/identity/` → either 0 references, or a seeded group file exists.
7. If live-smoked on the lane: restart `cl-lane-stack.sh 1` FIRST (YAML-reload trap — the seed
   change is inert in a running process), target :3092 only, never :3001/:5174.

## Worker contract

- Branch off lane trunk: `wt/OWN-15-lane1-l1t<dispatch-ts>` from `cl/integration-1`
  (lane precedent: `wt/OWN-10-lane1-l1t1930` naming). Fleet coder lock applies
  (`/home/brad/.hermes/cl/appliance2-coder.pid`).
- Deliverable/report path: `~/.hermes/cl/lanes/1/own15-report-l1t<dispatch-ts>.md`;
  end marker line `OWN15 CODER DONE <sha>`.
- Stage EXACTLY the in-scope files (never `git add -A`); never touch :3001/:5174.
- Diff is TS + seed YAML: a live lane smoke requires the `cl-lane-stack.sh 1` restart (item 7 above).
- Queue note: this item sits behind OWN-14 per FIFO (task block `dispatch_gate`); rebase onto
  trunk if OWN-14 lands first — OWN-14 deletes client-side policy-root code, NO overlap with
  these server/security files is expected, but re-run check 4 after any rebase.

## Reviewer bait (expected adversarial focus — pre-empted here)

1. **The lab-owner substitution is the bug's heart**: reviewer will grep `OwnershipPolicyService.ts:158`
   for `doc.labOwnerUserId` still reaching the create stamp. Any residual path where
   `resolvedOwnerUserId` (`AuthorizationService.ts:127`) can differ from the creator must be
   intentional, covered by a test, and explained in the report.
2. **Inert-group grants are silent today** (`AccessControlService.ts:86-87`): reviewer will plant a
   nonexistent `principalId` in a declared default grant and demand an observable refusal, not a
   dropped grant or a `console.warn` swallowed into success.
3. **The self-lock**: reviewer will PUT `/api/records/ACL-<new>` as the creator and require 200,
   and separately require a NON-owner still 403s (the delegation must not turn ACLs open).
   Also: the delegation must not leak into `resolveEffectivePolicy` returning someone else's
   policy as the effective one — admin-on-ACL is not same-as-owning-the-record.
4. **Hardcode boundary**: `USR-LOCAL-ADMIN`/`GRP-LAB-ADMINS` in any non-test TS added by this diff
   is a finding, EXCEPT the pre-existing `LOCAL_ADMIN_USER_ID` bootstrap usage (untouched).
   Test files may use them freely as fixtures.
5. **Don't paper the resolver**: changing `LocalIdentityService` fallback behavior to "fix" the
   403 is a scope violation — `LabSettingsHandlers.routes.test.ts:389,490` lock the current
   fail-closed semantics; they must stay green.
6. **exactOptionalPropertyTypes / strict sites**: `server/tsconfig.json` is `strict: true`;
   `CreateDefaults`, optional `publishRole` (`OwnershipPolicyService.ts:101` conditional-spread
   house style), and the typed refusal error shape are the likely new-error spots — the 33-error
   server baseline is the tripwire (zero new errors, not "fewer/more").
7. **YAML-reload trap**: seed-YAML edits are invisible to a running server; any live verification
   without a stack restart proves nothing (reviewer will check report evidence timestamps against
   the restart).
8. **Flipped assertions**: `LocalAuthorization.test.ts:495` / `:500` and
   `OwnershipPolicyService.test.ts:48` / `:68` currently certify the defect; a diff that DELETES
   them instead of flipping them to assert the ruling is a finding.
9. **Ontology terms**: minted ACLs and the seeded group must validate against their schemas
   (`kind` const values, `principalType: group`, `status: active` users); `skipLint: true` at the
   mint means TS-side validation carries the load — reviewer will test a malformed grant end-to-end.

## Open questions (composer could not close locally)

- **OQ1 — what happens to `owner: lab` kinds' semantics?** The ruling names the CREATING user as
  owner of every new record, which empties `OwnershipScope: 'lab'` of owner-meaning (it survives
  only as visibility/grants semantics). CHECKED: schema (`ownership-policy.schema.yaml` `owner`
  enum), five kindRules in the seed, `applyOwnershipDefaults.ts:180` also consumes it.
  RECOMMENDED DEFAULT: keep the enum and all `owner: lab` rules as-is (visibility public + lab
  grants preserved), stamp the creator as owner (criterion 1), leave `labOwnerUserId` in the
  document but no longer consumed by the create path; note `applyOwnershipDefaults` keeps using it
  until a future ruling. Seed `GRP-LAB-ADMINS` as a real group record (members = the lab's admin
  users, data-declared) so the five defaultGrants resolve rather than vanish — preserving the
  multi-user admin lever the seed comment (line 50-52) intended.
- **OQ2 — refusal semantics for an unresolvable declared default at mint.** Options: (a) mint
  refuses the WHOLE create (record rollback — heavy: record is already persisted at
  `RecordHandlers.ts:860` before the mint, rollback machinery doesn't exist); (b) mint refuses the
  bad ACL (returns null, typed warning surfaced; record stays with NO acl = treated open by
  `AccessControlService.ts:64` — that's fail-OPEN, dishonest); (c) mint stamps creator-owner ACL
  with the unresolvable grants STRIPPED and the refusal reported loudly (response-level warning +
  log + test assertion), then a lint (scope above) makes the strip impossible in practice.
  RECOMMENDED DEFAULT: (c) — "refused honestly" is honored at the grant level while the record
  never ends up ownerless or open; the strip must be an explicit, observable, tested refusal, not
  coercion-time silence like today's `coerceGrant` drops.
- **OQ3 — width of the owner-of-ACL rule.** Smallest: owner-of-referenced-record satisfies `admin`
  on the ACL row. Wider alternatives: referenced record's admins too, or full delegation to the
  referenced record's policy. CHECKED: `RecordHandlers.ts:940/1484` and `IdentityHandlers.ts:364`
  all ask `canAccess(..., 'admin', ...)` so the narrow rule unblocks every observed dead-end;
  grantees' ACL-editing was never the reported debt. RECOMMENDED DEFAULT: narrow rule ONLY
  (referenced record's `ownerUserId` passes `admin` on its ACL), implemented in
  `AuthorizationService.canAccess`, declared as one rule with a name the tests cite.

## Stop boundaries

- Stop after: mint stamping fixed at source, declaration repaired (seed YAML + optional group
  seed + optional declared lint), owner-of-ACL delegation landed, RED→GREEN tests, baselines held.
- Do NOT: repair any record under either data dir; touch `LocalIdentityService`/sessions/
  credentials; change access-policy schema semantics beyond additive resolvability validation;
  add client code; run `apply:ownership-defaults` against any live data dir; extend the
  delegation beyond the single declared rule (no "admin inherits ACL" widening without a ruling).
- If the 33-error server baseline moves for reasons unrelated to in-scope files, STOP and report —
  do not "fix" unrelated tsc errors in this diff.

COMPOSER DONE OWN-15 23248
