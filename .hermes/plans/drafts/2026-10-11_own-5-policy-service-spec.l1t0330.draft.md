# SPEC DRAFT — OWN-5: OwnershipPolicyService — pure resolver with origin traces
Lane 1 · wave-3 lab-ownership-and-sharing-policy · composed 2026-10-11T0330 by cl-spec-composer (l1t0330)
Status: DRAFT — orchestrator review/promotion required; NOT canonical, NOT dispatchable as-is.
Anchors grounded first-hand at trunk cl/integration-1 @ a6e3c4c02b97080195e7cae9d21d3024f23dfbe5 (a6e3c4c0).
Plan of record: .hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md §T5 (D1-D13 binding,
esp. D11 per-creator evaluation, D12 defaultGrants). Plan §T5 carries the verbatim service + test code —
reproduce it, subject to the ONE correction in "Correction C1" below (ratify at promotion).

## Goal (one sentence)
Ship OwnershipPolicyService — a pure, store-reading resolver of the lab's declared ownership
defaults with per-answer origin traces — plus the extracted MemoryRecordStore test support and
the exported `Visibility` type, RED-first via the 8 §T5 tests.

## Item + task-list `why` (verbatim)
"Resolution logic must be pure and explainable ("WHY is this record private? because
OWN-LAB-DEFAULT kindRule says so") so the UI and AI can cite origin. Reuses the house
PolicyProfileService resolution/origin pattern rather than inventing a second resolver idiom."
(task-list.md ~:2587, OWN-5 at ~:2570)

## Dependencies
NONE (task-list: "deps: none — pure service + test-support extraction; queue slot opens when the
coder slot frees"). Independent of OWN-1/2/3/4: OWN-5 hardcodes the schema-id/kind CONSTANTS
(§T5 code) and reads envelopes from a MemoryRecordStore — it needs no schema file, no seed file,
no server wiring. It can dispatch in any order relative to OWN-1..OWN-4. File-set is disjoint
from OWN-6 (AccessControlService.ts is touched by BOTH — see Worker contract rebase note) and from
QMS-8 (already merged at 25f74aaa).

## Files
IN scope:
- new `server/src/test-support/MemoryRecordStore.ts` — verbatim extract of the stub class at
  `server/src/security/LocalAuthorization.test.ts:17-77` (composer verified: class opens :17
  `class MemoryRecordStore implements RecordStore {`, closes :77; implements get, getByPath,
  getWithValidation, list (kind/schemaId/idPrefix/offset/limit filters), create, update, delete,
  validate, lint, exists over a `Map<string, RecordEnvelope>`; constructor takes
  `records: RecordEnvelope[] = []`). Export it as `export class MemoryRecordStore`. Adjust ONLY
  the relative import specifiers if needed (the class body imports types from
  `../types/RecordEnvelope.js` and `../store/types.js` — same depth from src/test-support/, so
  the specifiers carry over UNCHANGED). Do NOT rewrite LocalAuthorization.test.ts to use the
  extraction (plan §T5: avoid churn) — the local class stays where it is.
- new `server/src/security/OwnershipPolicyService.ts` — plan §T5 verbatim (subject to C1).
- new `server/src/security/OwnershipPolicyService.test.ts` — plan §T5 verbatim (subject to C1),
  8 tests.
- EDIT ONLY: `server/src/security/AccessControlService.ts` — EXPORT ONLY:
  `export type Visibility = 'private' | 'shared' | 'public';` and change the inline union in
  `AccessPolicyRecord.visibility` (AccessControlService.ts:13 today reads
  `visibility: 'private' | 'shared' | 'public';` — composer verified) to `visibility: Visibility;`.
  No behaviour change, no other edits to that file.
OUT of scope (explicit): `AuthorizationService.ts` — OWN-5 does NOT wire the service anywhere.
Constructor TODAY: `AuthorizationService.ts:93 constructor(private readonly store: RecordStore) {}`
(composer verified) — adding the optional OwnershipPolicyService ctor param is OWN-7's file with a
QMS-8-merge dispatch gate; do NOT touch it here. Also out: server.ts, routes/handlers, app/,
schema YAML, any existing test other than nothing.

## Lane-verified anchors (composer verified first-hand at a6e3c4c0)
- Stub extraction range: `server/src/security/LocalAuthorization.test.ts:17-77` (file is 363
  lines; class boundaries :17 open / :77 close confirmed by sed; :79+ are helper fns
  `user()`/`study()`/`experiment()`/`policy()` — NOT part of the extraction).
- `server/src/store/types.ts:114 export interface RecordStore` — the stub implements it;
  `RecordEnvelope` at `server/src/types/RecordEnvelope.ts` (recordId/schemaId/payload/meta?),
  re-exported from store/types.ts:17 (plan §T5 test imports it from '../types/RecordEnvelope.js'
  — that path exists, verified).
- Origin-trace pattern to mirror (NOT to reuse types — different domain):
  `server/src/policy/types.ts:9 POLICY_SCOPE_ORDER = ['organization','lab','project','run'] as const`
  and `:66-71 interface PolicySettingOrigin { profileId; scope; scopeId; priority }`;
  `server/src/policy/PolicyProfileService.ts:152 settingOrigin(profile)` stamps an origin per
  resolved setting, `:244` rationale cites `origin.profileId`. OWN-5's analogue is
  `ResolvedKindRule.origin = { policyRecordId, source: 'kind' | 'fallback' }` (plan §T5 verbatim).
  v1 resolves LAB scope only — activeLabPolicy() picks scope.type==='lab' first (plan code).
- AccessControlService.ts:1 `AccessRole` union is exactly the six roles the plan's `ACL_ROLES`
  lists; `AccessGrant` :4-8 is `{ principalType: 'user' | 'group'; principalId: string; role:
  AccessRole }` — see Correction C1 (the plan's test fixture and coercion use `project`).
- exactOptionalPropertyTypes IS ON: `server/tsconfig.json:13`. The plan §T5 code is already
  EOPT-clean (`...(publishRole !== undefined ? { publishRole } : {})` at the KindRule coercion,
  plan §T5) — keep that idiom; never `publishRole: undefined`.
- `server/src/security/AuthorizationService.ts:93` ctor unchanged (OWN-7 lands the wiring).

## Correction C1 — AccessGrant has no 'project' principalType YET (the one thing to fix in §T5 code)
The plan §T5 fixture doc declares `defaultGrants: [{ principalType: 'group', ... }]` — that is
fine as-is. But §T5's `coerceGrant` accepts `principalType === 'project'` and the §T5 TYPE layer
types grants as `AccessGrant` from AccessControlService. AccessControlService.ts:5 today is
`principalType: 'user' | 'group'` (composer verified; OWN-6 widens it to include 'project').
Under OWN-5's verbatim code `principalType !== 'user' && !== 'group' && !== 'project'` narrows to
'group'|'user' fine, and `role: role as AccessGrant['role']` compiles. THE ACTUAL BREAK: at
:710 the plan returns `{ principalType, ... }` typed as AccessGrant — after the three-way guard
principalType is `'user'|'group'|'project'`, which is NOT assignable to AccessGrant's
`'user'|'group'` -> typecheck error under tsc.
Resolution (smallest honest change, ratify at promotion): in OWN-5, drop 'project' from the
coerceGrant accept-branch (guard: `principalType === 'user' || principalType === 'group'`,
else return null — a 'project' grant in the document is DROPPED, never guessed, consistent with
"malformed declarations are dropped"; OWN-6 widens AccessGrant and a follow-up accepts project
grants). Alternative if orchestrator prefers: `principalType: principalType as 'user'|'group'`
cast AFTER the guard excludes 'project' — equivalent, weaker. None of the 8 §T5 tests uses a
'project' grant, so test outcomes are identical either way; `npm run typecheck -w server` is the
arbiter. Do NOT touch AccessControlService.ts's principalType union (that is OWN-6's line).

## The 8 §T5 tests — the RED-first contract (list verbatim from plan §T5 describe block)
1. `resolves a kind rule with its origin` — ruleFor('instrument'): owner 'lab', visibility
   'public', origin `toEqual({ policyRecordId: 'OWN-LAB-DEFAULT', source: 'kind' })`.
2. `falls back for an unlisted kind` — ruleFor('claim') (not in kindRules): visibility
   'private', origin.source 'fallback'.
3. `resolves create defaults: lab-owned kinds use the lab owner user` —
   defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' }): ownerUserId
   'USR-LOCAL-ADMIN' (the doc's labOwnerUserId, NOT the creator), visibility 'public'.
4. `resolves create defaults: creator-owned kinds file into the active project` —
   defaultsForCreate local-protocol/USR-BRAD: ownerUserId 'USR-BRAD', filedTo 'active-project'.
5. `returns null when no document is installed (no declared defaults)` — empty store:
   ruleFor -> null, defaultsForCreate -> null. (No document -> NO invented defaults.)
6. `carries the declared default grants (multi-user: the lab admin group)` (D12 verbatim) —
   instrument defaults `grants` toEqual
   `[{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }]` — carried
   verbatim; unresolved group is inert by design (D12), the resolver neither resolves nor drops
   a well-formed group grant.
7. `evaluates creator-owned defaults PER USER — two authors get two private records` (D11
   verbatim) — local-protocol as USR-A -> ownerUserId 'USR-A'; as USR-B -> ownerUserId 'USR-B';
   BOTH `grants` toEqual [].
8. `reports the allowed share targets for a kind` — shareTargetsFor('instrument') toEqual
   `['user', 'group', 'lab']` (declaration order preserved — do not sort).
docEnv() fixture: plan §T5 verbatim (OWN-LAB-DEFAULT envelope, lab scope, labOwnerUserId
USR-LOCAL-ADMIN, creator/private fallback, kindRules local-protocol + instrument-with-D12-grant).
Malformed-drop behaviour ("dropped, never guessed") is in the coercion helpers (plan code:
coerceGrant/coerceKindRule return null on garbage; coerceOwnershipPolicy null on non-matching
kind/missing recordId/labOwnerUserId/fallback) — the 8 tests are the contract; do not add
snapshot-style extra tests beyond C1 handling.

## Baselines (re-capture at YOUR base; do NOT claim trunk is green)
- `npm run typecheck -w server`: capture the FULL tsc error-line multiset at your branch base
  BEFORE your edits, and app tsc separately (`npm run typecheck` covers both workspaces).
  Bar: zero NEW error lines after; the AccessControlService Visibility change must be
  zero-delta. Paste multisets in the report.
- `npm run test:run -w server -- src/security/` — capture the fail-file SET + failing-test count
  verbatim at base (trunk src/schema/ is known NOT green — composer l1t0130: 2 failed files /
  5 failing tests, EventGraphEquipmentSchema + LabwarePhysicalGeometryData, 278 pass, at an
  earlier base — re-measure, do not copy). Bar: zero NEW failing files; your new file 8/8.
- `src/security/LocalAuthorization.test.ts` specifically must stay green (you extract FROM its
  file but do not edit the file — if you touch it at all, it must still pass identically).
- `npm run test:run -w server -- src/validation/` -> 42/42 exit 0 (l1t0130 baseline; re-capture).
False "exit 0" claims are a review defect — verbatim tails only; reviewer re-runs your commands.

## Commands (exact, from worktree root)
- RED (expect module-not-found / all fail):
  `npm run test:run -w server -- src/security/OwnershipPolicyService.test.ts`
- GREEN (expect `8 passed`): same command after implementation.
- Extraction sanity (stub compiles + old test untouched):
  `npm run test:run -w server -- src/security/LocalAuthorization.test.ts` -> same pass count as base.
- No-regression: `npm run test:run -w server -- src/security/` -> fail-file set unchanged.
- `npm run typecheck -w server` -> zero new error lines vs base multiset.
- NEVER: restart the lane stack (orchestrator owns restarts), curl :3092/:3001/:5174/:3093/:5193,
  `git add -A`, touch AuthorizationService.ts/server.ts/app/.

## Worker contract
- Worktree/branch: orchestrator creates it; branch `wt/OWN-5-lane1-<WORKER_ID>` off
  `cl/integration-1` (a6e3c4c0 at composition; re-anchor to actual HEAD at dispatch). Always
  `git -c core.fileMode=false` in lane trees (NFS mode-bit noise).
- OWN-6 file overlap: both items touch AccessControlService.ts. OWN-6 adds a `project` member to
  AccessPrincipalType (its own plan §T6 names the union widening). Your Visibility export sits at
  the top of the file; a textual conflict is a one-line rebase at merge time — keep your diff to
  exactly the two planned lines, never restructure the file, and the overlap stays trivial.
- Commits (plan §T5): test-first RED commit optional; final commit
  `feat(server): OwnershipPolicyService resolves declared ownership defaults`; stage the exact
  4 files.
- Report: `<REPORT_PATH>` (orchestrator fills, pattern
  `/home/brad/.hermes/cl/lanes/1/own5-report-<WORKER_ID>.wip.md`), committed in the final commit:
  RED output, GREEN output, baseline multisets/fail-sets, the C1 resolution you applied,
  assumptions AS-OWN5-*. End marker exactly: `OWN5 CODER DONE <head-sha>`; blocked:
  `BLOCKED <reason>`, everything committed.
- Stop-boundary: new platform gap (RecordStore surface doesn't match the stub, Visibility change
  cascades type errors beyond the export site, vitest can't resolve '../test-support/') -> STOP,
  preserve, report. No service-injection, no AuthorizationService edits, no task-list edits.

## Reviewer bait (anticipated adversarial review — pre-empt these)
- exactOptionalPropertyTypes sites (ON at server/tsconfig.json:13): `publishRole` MUST stay
  conditional-spread (`...(publishRole !== undefined ? { publishRole } : {})`); `origin` and
  optional CreateDefaults fields must never receive explicit `undefined`. One
  `publishRole: undefined` = typecheck failure the reviewer WILL probe.
- Verbatim extraction test: reviewer diffs test-support/MemoryRecordStore.ts against
  LocalAuthorization.test.ts:17-77 — any "improvement" (extra filtering, sort, async rewrite)
  to the stub is a defect; it must be the same code. Also verify LocalAuthorization.test.ts is
  byte-identical (no import refactor sneak-in).
- The plan's code imports RecordEnvelope from `'../store/types.js'` in the SERVICE and
  `'../types/RecordEnvelope.js'` in the TEST — both paths exist (store/types.ts:17 re-export);
  don't "unify" them, and don't fight the reviewer over it.
- C1 boundary: dropping 'project' in coerceGrant is the hardcode-honest choice; casting past the
  guard is the alternative. Widening AccessControlService's union instead = OWN-6's file line =
  defect. Reviewer will ask "why is project dropped when the document enum allows it?" — answer:
  AccessGrant can't hold it until OWN-6; "dropped, never guessed" is the plan's own rule; D12's
  inertness covers unresolved ids, C1 covers unsupported types.
- Pure-resolver boundary: no caching beyond per-call store.list (plan code lists with
  `{ kind, limit: 100 }` — keep the limit; a reviewer may probe pagination at >100 docs: v1
  accepts it, flag as known limitation, do NOT invent pagination); no visibility enforcement here
  (that's AccessControlService — this service only REPORTS); no 'lab' visibility enum (D2).
- D11 trap: an implementation that caches defaults across calls or ignores creatorUserId is a
  defect — test 7 catches it; test 3 catches owner:'lab' leaking the creator.
- Origin honesty: origin.source must be 'kind' vs 'fallback' per ACTUAL lookup path
  (ruleFor checks doc.kindRules[kind] first); hardcoding 'kind' = defect.
- YAML-reload trap doesn't bite here (no YAML authored) but: the service reads DATA at runtime;
  any temptation to seed-READ from records/seed in the resolver is wrong — it reads the store.

## ADDENDUM — trunk drift observed during composition (composer re-checked live)
The instruction sha was a6e3c4c0; the trunk advanced to edd7072c WHILE this draft was composed,
and OWN-5 has ALREADY BEEN DISPATCHED AND MERGED (c54fb495 feat, merged 9067df66, adversarial
ACCEPT l1t0555) by another composer cycle (l1t0520). Live re-grounding at edd7072c confirms this
spec's content is correct-as-shipped, which validates it for the record and for any re-open:
- `AccessControlService.ts:3` now exports `Visibility`; AccessPolicyRecord.visibility uses it.
- `server/src/test-support/MemoryRecordStore.ts` exists (73 lines, the :17-77 extraction).
- `OwnershipPolicyService.ts:78` shipped C1's spec'd DEFAULT exactly:
  `if (principalType !== 'user' && principalType !== 'group') return null;` with comment
  `// 'project' principal lands with OWN-6` — no cast, union untouched (OWN-6's line intact).
- `OwnershipPolicyService.test.ts` has 8 tests; RED commit e4b2014c precedes the feat commit.
ACTION FOR ORCHESTRATOR: this draft is likely SUPERSEDED — do not dispatch a second OWN-5 run.
It stands as the ratified contract text (and the C1 ruling is now precedent for OWN-6's widening).

## Open questions for orchestrator (max 3)
1. C1: 'project' grants are coercible in the plan's code but untypeable in today's AccessGrant
   (`'user'|'group'`, AccessControlService.ts:5; OWN-6 widens it). Spec'd default: drop
   'project' in coerceGrant until OWN-6 lands (zero test delta). Alternative: cast past guard.
   Or should OWN-5 preemptively take the union widening and OWN-6 rebase? Checked: ACS:1-46,
   plan §T5/§T6, §T6 files list ("AccessPrincipalType +" is OWN-6's).
2. test-support extraction: task-list says extract verbatim AND leave the original test
   untouched — so the class exists TWICE on trunk by design (plan §T5 sanctions it: "avoid
   churn"). Confirm reviewer bar = "identical duplicate, no edit to the test file", not
   "test file should import from test-support" (that migration would be a 5th file and churn).
   Checked: LocalAuthorization.test.ts:17-77 boundaries, plan §T5 line 527.
3. Does OWN-5's dispatch need to wait for OWN-6's file to settle (both edit
   AccessControlService.ts)? I claim the two-line Visibility export makes the overlap trivial
   either order; flag if the orchestrator wants OWN-5 merged strictly before OWN-6 is claimed.
   Checked: git log (no open ACS edits at a6e3c4c0 — ACS last touched well before QMS-8; QMS-8
   did not touch it), OWN-6 task block (:2607 lists its own ACS changes).
