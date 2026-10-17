# OWN-7 — ensureOwnerPolicy stamps the DECLARED defaults (kill the hardcoded 'private')

Composer draft l1t0810 (2026-10-11). Drafted at lane trunk HEAD **c49f7b45** (composer's
`git -c core.fileMode=false rev-parse HEAD` at drafting time; OWN-2 f6e52565 + EDITOR-9-fix2
edd7072c + OWN-5 9067df66 + OWN-3 seed a711e818 + OWN-6 c49f7b45 all MERGED). Every anchor below
is re-anchored by the composer first-hand at that sha — the task block's :101/:124/:126 were
verified at an EARLIER HEAD and have SHIFTED by OWN-6's diff (see anchors).

## Goal (one sentence)

Replace the hardcoded `visibility: 'private'` / `grants: []` inside
`AuthorizationService.ensureOwnerPolicy` with values read from the OWNERSHIP POLICY DOCUMENT via
the merged `OwnershipPolicyService.defaultsForCreate({kind, creatorUserId})`, so behaviour changes
by editing YAML — while the no-document fallback stays creator-private with NO grants (plan D9).

## Deps / dispatch state

- deps: [OWN-5] — MERGED (9067df66). `OwnershipPolicyService` is on trunk.
- dispatch_gate: QMS-8 merged — VERIFIED (25f74aaa is an ancestor of c49f7b45).
- **OWN-6 interaction WARNING is RESOLVED at this HEAD**: OWN-6 (project principal) is MERGED
  (c49f7b45, adversarial ACCEPT l1t0855). `coercePolicy` now accepts `'project'`
  (AuthorizationService.ts:49) and `canAccess` passes `projectPolicies` (:99-100). Anchor against
  THIS shape. If the orchestrator re-dispatches on a base where OWN-6 is somehow absent, the §T7
  test must not depend on project membership semantics — but at c49f7b45 it does not (the test
  uses user + group principals only, per plan D12).
- OWN-3 seed document OWN-LAB-DEFAULT is MERGED (a711e818):
  `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml` (instrument → owner: lab,
  visibility: public, defaultGrants GRP-LAB-ADMINS:admin — matches the §T7 fixture).
- OWN-4 / OWN-8 / OWN-9 are downstream; OWN-8 depends on this item's service-instance landing.

## Lane-verified anchors (composer-verified at c49f7b45; re-anchor at dispatch-time HEAD)

AuthorizationService (`server/src/security/AuthorizationService.ts`, 224 lines):
- imports block :1-9 (`AccessControlService`, `AccessAction`, `AccessPolicyRecord`,
  `GroupRecord`, `ProjectPolicyIndex`). `AccessGrant` and `Visibility` are NOT yet imported —
  the change adds both as type imports.
- `coercePolicy` admits project principals at :49 (OWN-6 landed; do not touch).
- class :93; **constructor :94** — `constructor(private readonly store: RecordStore) {}` (single
  param today; gains the optional second).
- `canAccess` :96-101 (passes `projectPolicies` — OWN-6 shape).
- **`ensureOwnerPolicy` :103** (task block said :101 at an earlier HEAD).
- **Hardcoded constants: `visibility: 'private'` :126, `ownerUserId,` :127, `grants: [],` :128**
  (task block said :124/:126 — shifted +2 by OWN-6's ProjectPolicyIndex import).
- `meta.createdBy: ownerUserId` :139 — STAYS the creator (who stamped), only the payload's
  `ownerUserId` becomes the declared owner.
- `store.create({ envelope, message, skipLint: true })` :143-147 (unchanged).
- `backfillOwnerPolicies` :193+ calls `ensureOwnerPolicy` :215 — shares the changed code path
  (see reviewer bait).

OwnershipPolicyService public API — REAL trunk shape (`server/src/security/OwnershipPolicyService.ts`),
NOT the plan sketch (they agree here, verified):
- class :131, `constructor(private readonly store: RecordStore) {}` :132.
- `activeLabPolicy(): Promise<OwnershipPolicyDoc | null>` :135 — lists kind
  `ownership-policy`, prefers scope.type 'lab'.
- `ruleFor(kind): Promise<ResolvedKindRule | null>` :144 — origin `{policyRecordId, source:
  'kind' | 'fallback'}`.
- **`defaultsForCreate(input: { kind: string; creatorUserId: string }): Promise<CreateDefaults | null>`
  :153** — THE method. `CreateDefaults` (:49-56) = `{ ownerUserId, visibility: Visibility,
  filedTo, grants: AccessGrant[], origin }`. Null = nothing declared (no document / malformed).
- `shareTargetsFor(kind)` :167 (not used here).
- `DEFAULT_OWNERSHIP_POLICY_RECORD_ID = 'OWN-LAB-DEFAULT'` :15 (exported, unused so far).
- `coerceGrant` admits 'project' at :78 (OWN-6 widened the OWN-5-pinned seam — do NOT re-widen).

server.ts wiring (`server/src/server.ts`):
- **`const authorizationService = new AuthorizationService(store);` :495** (task block's ~:495
  confirmed; plan's :507 is main-side).
- boot backfill call :500 (`backfillOwnerPolicies(LOCAL_ADMIN_USER_ID)`) — runs AFTER the
  construction site; ordering unchanged.
- seed dir resolved :480 (`resolveSeedRecordsDir()` → `seedDir` into `createRecordStore` :485).
- security imports cluster :150-157 (`AuthorizationService` import at :157) — add the
  `OwnershipPolicyService` import there.

Seed-document runtime reach (composer-verified — matters for tests AND for the wiring's honesty):
- `RecordStoreImpl.get()` falls back to a RECURSIVE seed walk (`getSeedRecord` :223-240,
  `findSeedRecordPath` :172) → `get('OWN-LAB-DEFAULT')` works by id.
- `RecordStoreImpl.list({kind})` merges seeds ONLY from `join(seedDir, filter.kind)`
  (:438-441). The seed file lives under `records/seed/identity/`, NOT `records/seed/
  ownership-policy/` → **`store.list({kind:'ownership-policy'}) does NOT see the seeded document
  on a bare data repo**, and `activeLabPolicy()` is list-based. Consequence: the server.ts wiring
  is unit-test-correct but behaviourally inert at boot until the document is materialized or a
  get-by-id fallback is added (open question 1). The §T7 unit test is UNAFFECTED:
  `MemoryRecordStore.list` filters by `payload.kind` in-memory, so an explicit fixture record IS
  found. **The §T7 test must therefore build a store containing the policy document EXPLICITLY
  (the plan's test does exactly this) — it does not and must not rely on records/seed/**.
  Checked: RecordStoreImpl.ts:172-240/:438-446, IndexManager.ts:236-259 (index-only merge, no
  materialization), server.ts:601-612 (ensureSeedProtocols is the precedent for materialization).

Test file (`server/src/security/LocalAuthorization.test.ts`, 406 lines, 11 tests):
- LOCAL `class MemoryRecordStore` :17 — the file keeps its own stub (OWN-5 extracted a
  test-support copy but deliberately did NOT rewrite this file; the plan's §T7 test uses the
  LOCAL class — keep it, do not churn to `../test-support/`).
- helpers: `user(id)` :79, `study` :87, `experiment` :95, `policy` :103. NO `group()` helper —
  build the GRP-LAB-ADMINS record inline (style precedent: OWN-6's test at :355-362).
- describe :135. The 11 `it()`s: :136, :146, :157, :168, **:184 creates-an-owner-policy**,
  :194 (RecordHandlers filter/block — goes through ensureOwnerPolicy via create), :245,
  **:299 stamps-non-policy-root-kinds**, :318 backfill, :345 (OWN-6 §T6 seam), :388 backfill
  no-guess. The ensureOwnerPolicy-touching tests (**:184, :194, :245, :299, :318, :388**) build
  stores with NO ownership-policy record → the fallback path (`defaults === null` →
  `'private'`/creator/`[]`) MUST keep them green. Confirmed by reading all six stores.

Explicitly OUT of scope: OwnershipPolicyService.ts (any edit), AccessControlService.ts,
RecordStoreImpl.ts, IndexManager.ts, records/seed/**, schema/**, IdentityHandlers.ts,
RecordHandlers.ts, app/**, anything HTTP/runtime.

## Verbatim-authoritative (plan §T7 is word of record; reproduce exactly)

Constructor (`server/src/security/AuthorizationService.ts`):
```ts
export class AuthorizationService {
  constructor(
    private readonly store: RecordStore,
    private readonly ownershipPolicy?: OwnershipPolicyService,
  ) {}
```

Inside `ensureOwnerPolicy`, replace `visibility: 'private'` / `ownerUserId` / `grants: []` with:
```ts
    const defaults = this.ownershipPolicy
      ? await this.ownershipPolicy.defaultsForCreate({ kind: resourceKind, creatorUserId: ownerUserId })
      : null;
    const visibility: Visibility = defaults?.visibility ?? 'private';
    const resolvedOwnerUserId = defaults?.ownerUserId ?? ownerUserId;
    const grants: AccessGrant[] = defaults?.grants ?? [];
```
then use `visibility`, `resolvedOwnerUserId` and `grants` in the payload (`grants: []` →
`grants`), keeping the honest fallback comment VERBATIM (the adversarial review checks it):
```ts
    // Fallback when no ownership-policy document is installed mirrors the
    // pre-existing behaviour (creator-private, no grants) so a bare repo never
    // widens access. The document is the authority; see plan D9.
```

Wiring — `server/src/server.ts` (anchor :495 at c49f7b45), import beside the other
`./security/...` imports (:150-157):
```ts
  const ownershipPolicyService = new OwnershipPolicyService(store);
  const authorizationService = new AuthorizationService(store, ownershipPolicyService);
```

RED-first test — append INSIDE the existing `describe` in
`server/src/security/LocalAuthorization.test.ts`, plan §T7 verbatim BELOW, plus the fixture
records the plan's prose mandates (the snippet's store list omits them; the prose above the plan
block requires them): `GRP-LAB-ADMINS` with `memberUserIds: ['USR-ADMIN-2']`, plus
`user('USR-ADMIN-2')` and `user('USR-STRANGER')` records. Add the
`OwnershipPolicyService` import to the test file. Do not otherwise touch existing tests:
```ts
  it('stamps the declared visibility and owner for lab-shared kinds', async () => {
    const store = new MemoryRecordStore([
      user('USR-BRAD'),
      user('USR-LOCAL-ADMIN'),
      {
        recordId: 'OWN-LAB-DEFAULT',
        schemaId: 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml',
        payload: {
          kind: 'ownership-policy',
          recordId: 'OWN-LAB-DEFAULT',
          title: 'Lab policy',
          scope: { type: 'lab', id: 'lab' },
          labOwnerUserId: 'USR-LOCAL-ADMIN',
          fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
          kindRules: [
            { kind: 'instrument', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
          ],
        },
      } as RecordEnvelope,
    ]);
    const authorization = new AuthorizationService(store, new OwnershipPolicyService(store));
    const instrument = {
      recordId: 'INS-MITO-SPECIAL',
      schemaId: 'https://computable-lab.com/schema/computable-lab/instrument.schema.yaml',
      payload: { kind: 'instrument', id: 'INS-MITO-SPECIAL', name: 'Grant-funded imager' },
    } as RecordEnvelope;

    const stamped = await authorization.ensureOwnerPolicy(instrument, 'USR-BRAD');

    expect((stamped?.payload as Record<string, unknown>).visibility).toBe('public');
    expect((stamped?.payload as Record<string, unknown>).ownerUserId).toBe('USR-LOCAL-ADMIN');
    // Declared lab-visible => a stranger can read it.
    expect(await authorization.canAccess('USR-STRANGER', 'read', instrument)).toBe(true);
    // MULTI-USER: the declared admin GROUP administers it — not just labOwnerUserId.
    expect((stamped?.payload as Record<string, unknown>).grants).toEqual([
      { principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' },
    ]);
    expect(await authorization.canAccess('USR-ADMIN-2', 'admin', instrument)).toBe(true);   // member of GRP-LAB-ADMINS
    expect(await authorization.canAccess('USR-STRANGER', 'admin', instrument)).toBe(false); // not a member
  });
```
(Worker: add the group/user fixture records to the constructor array; they are required for the
D12 group-admin assertions to be non-vacuous — a missing GRP-LAB-ADMINS makes the
`USR-ADMIN-2`-admin assertion pass for the WRONG reason... no: it makes it FAIL. Either way a
missing group is caught, but the fixture must match the plan prose, not just the snippet.)

## Worker constraints

- Branch off DISPATCH-TIME trunk HEAD of `cl/integration-1`:
  `wt/OWN-7-lane1-<your-tag>` (e.g. `wt/OWN-7-lane1-l1tXXXX`). Commit sequence: RED test, then
  implementation+wiring. Suggested: `test(security): RED — declared-defaults stamping contract
  (§T7)`, `feat(security): owner-policy stamping follows the ownership-policy document`.
- Stage EXACT files only (never `git add -A`): `server/src/security/AuthorizationService.ts`,
  `server/src/security/LocalAuthorization.test.ts`, `server/src/server.ts`.
- Unique report path: `<REPORT_PATH>` (orchestrator substitutes; suggested
  `/home/brad/.hermes/cl/lanes/1/own7-report-l1t<tag>.md`). Report must contain: base sha, base
  fail-file/fail-test set + error-TS counts (baselines below), RED evidence excerpt (the new test
  failing on `visibility` before wiring), GREEN evidence, zero-NEW-error-line table, OWN-6/OWN-3
  merge state observed at base, and any STOP justification.
- NO lane-stack restarts, NO curl against :3092/:3001/:5174/:5192, NO git writes to trunk, NO
  runtime/behaviour claims of any kind. This diff is TS-only — it needs no restart when merged.
- Stop-boundary: (a) any NEW platform gap → STOP, `requires-rescope` to the architect via the
  orchestrator (do NOT absorb); (b) any urge to make `activeLabPolicy()` fall back to
  get-by-id, materialize the seed doc, or change `OwnershipPolicyService`/`AccessControlService`
  — that is OUT OF SCOPE, record the finding in the report and stop; (c) any need to change
  ensureOwnerPolicy's response shape or its SELF_MANAGING_KINDS set → architect.

## Baselines (recapture at your own base — zero-NEW is the done-gate; exit-0 claims forbidden)

Pre-existing failures exist and drift between merges. At the LAST captured base (edd7072c): server
`src/schema` had a 2-file / 5-test failing set; `npm run typecheck -w server` ~50 error-TS lines,
`-w app` ~17. OWN-3/OWN-6 merged since — recapture YOUR base:
1. `git -c core.fileMode=false rev-parse HEAD` — record sha.
2. `npm run test:run -w server 2>&1 | tee /tmp/own7-base-tests.txt` — record the FAIL file/test
   set exactly.
3. `npm run typecheck -w server 2>&1 | grep -c "error TS"` and same `-w app` — record counts
   (`exactOptionalPropertyTypes` is ON — server/tsconfig.json:13).
The correct claim is an UNCHANGED failure SET/count against your base, never "green".

## First targeted check (proves the approach early)

After writing ONLY the §T7 test (before any implementation), run:
```bash
npm run test:run -w server -- src/security/LocalAuthorization.test.ts
```
Expected RED: `1 failed | 11 passed` — the failure must be the new test with
`expected 'private' to be 'public'` (and the ownerUserId/grants assertions), NOT an import/syntax
error. An import-time failure means the fixture shape is wrong — fix the test, not the service.

## Acceptance checks (verbatim from the task list, then the real commands)

Task list OWN-7 `verified by` verbatim: "npm run test:run -w server --
src/security/LocalAuthorization.test.ts all green (new test RED before wiring); pre-existing
private-by-default tests still pass (their stores have no policy document); acceptance 1-3 + 9-10
of the plan's aggregate list."

Commands + expected (from the worktree root, `git -c core.fileMode=false` for any git):
1. `npm run test:run -w server -- src/security/LocalAuthorization.test.ts`
   → `Test Files 1 passed; Tests 12 passed` (11 pre-existing + §T7), RED captured first.
2. `npm run test:run -w server -- src/security/`
   → ALL passed (AccessControlService, LocalAuthorization, OwnershipPolicyService 8, Identity —
   the whole security dir is this change's blast radius).
3. `npm run test:run -w server 2>&1 | tee /tmp/own7-after-tests.txt`
   → fail set BYTE-IDENTICAL to step-2 baseline (the src/schema-style pre-existing set), zero new.
4. `npm run typecheck -w server 2>&1 | grep -c "error TS"` → count EQUAL to base (server ~50
   class); same for `-w app` (~17 class; this diff touches no app file so app must be identical).
5. Hard-boundary greps:
   `grep -n "visibility: 'private'\|grants: \[\]" server/src/security/AuthorizationService.ts`
   → zero hits inside `ensureOwnerPolicy` payload (the literals survive ONLY in the
   `?? 'private'` / `?? []` fallbacks beside the D9 comment);
   `grep -n "D9" server/src/security/AuthorizationService.ts` → comment present;
   `grep -n "new AuthorizationService(store, ownershipPolicyService)" server/src/server.ts` → 1 hit.
6. Aggregate-list coverage (plan §"Tests / validation"): acceptance 2 (instrument stamps
   public + labOwnerUserId) and 10's T7 half (GRP-LAB-ADMINS member can admin, stranger cannot)
   are carried by the §T7 test; 1 and 9 are OWN-5's merged suite — re-run them via check 2 and
   quote the count in the report.

## Reviewer bait (the likely edge errors for this item — pre-empt them)

- **exactOptionalPropertyTypes (ON)**: the plan's snippet uses `??` ternaries into EXPLICIT
  properties — keep that exact shape. Do NOT spread `...defaults` into the payload or make
  payload fields optional; `grants: AccessGrant[]` is required by `coercePolicy` and
  `AccessPolicyRecord` (AccessControlService.ts:17). Add `type AccessGrant` and `type
  Visibility` to the existing import from `./AccessControlService.js` (:3-9) — `Visibility` is
  exported there (:3, OWN-5). Do NOT re-declare either type.
- **YAML-reload trap (inverted here)**: `tsx --watch` does not reload YAML — but OWN-7's diff is
  TS-only, so no restart is needed and the worker must not request one; the orchestrator owns
  post-merge restart timing. Do not add/modify ANY YAML; if you feel YAML is needed, that is a
  stop-boundary signal (finding, not a fix).
- **Ontology terms**: none required — this is security, not the knowledge layer; do not touch
  claim/context/assertion surfaces.
- **Hardcode boundary**: the DONE state is "the system works identically with the document
  removed (fallback) and changes behaviour by editing YAML". The literal `'private'` survives
  exactly once, in the D9-commented fallback — a reviewer finding a second `'private'` in
  ensureOwnerPolicy (or `grants: []`) means the fix is incomplete. A reviewer finding the D9
  comment reworded = plan-fidelity defect (verbatim check).
- **Backfill shares the path**: `backfillOwnerPolicies` → `ensureOwnerPolicy` (:215). With the
  service wired, boot backfill would apply DECLARED defaults to pre-existing records the day the
  document becomes list-visible. Today it is inert (open question 1), but say so honestly in the
  report; do not "guard" backfill with special-casing — the document is the authority for
  backfill too (D9's migration story is OWN-12's explicit dry-run, not a code carve-out).
- **meta vs payload**: `meta.createdBy: ownerUserId` (:139) must remain the CREATOR; only
  `payload.ownerUserId` becomes the lab owner. Swapping them breaks the backfill owner rule and
  audit semantics.
- **Test non-vacuity**: the §T7 fixture MUST include `GRP-LAB-ADMINS` (memberUserIds
  `['USR-ADMIN-2']`) and the two user records — the plan's snippet omits them but its prose
  mandates them; without the group the `USR-ADMIN-2` admin assertion fails (red herring) or,
  worse, a "make it pass" temptation to drop the assertion. Do not weaken any of the six
  assertions. Do not switch the test file to `../test-support/MemoryRecordStore` (churn rule;
  the file's local class is what the plan's test binds to).
- **Optional param discipline**: the ctor param is OPTIONAL — all six existing one-arg
  `new AuthorizationService(store)` sites in the test file and any other caller must compile and
  pass untouched. `server.ts` is the ONLY production call-site to widen.
- **`defaults` is computed once** before the payload literal (single `await`), not inline per
  field — two calls would double-list the store and could interleave differently under a real
  store.

## Open questions for orchestrator (3)

1. **Seed document is invisible to `activeLabPolicy()` at boot (runtime wiring inert).**
   `activeLabPolicy()` (OwnershipPolicyService.ts:135) resolves via `store.list({kind:
   'ownership-policy'})`; `RecordStoreImpl.list` merges seeds only from `seedDir/<kind>`
   (:438-441) and the seed lives at `records/seed/identity/` — so on a bare lane data repo the
   wired service finds NO document (get-by-id works via the recursive walk :245-249;
   IndexManager.rebuild merges it INDEX-only :236-259, no materialization). Checked:
   RecordStoreImpl :172-240/:438-446, IndexManager :236-259, OWN-3 spec's own acknowledgment of
   the kind-dir gap (its pickup claims were for index/browser, not service list),
   `ensureSeedProtocols` precedent (server.ts:601-612). §T7 is unaffected (in-memory store).
   Recommendation: ship OWN-7 as scoped (unit-proven wiring) and enqueue a follow-up — either a
   materialization-at-boot beside the protocols precedent, or a documented get-by-id fallback on
   `DEFAULT_OWNERSHIP_POLICY_RECORD_ID` (:15, exported, currently unused) in OWN-9's surface.
   Either is OUT of OWN-7's file list.
2. **Boot backfill semantics once the document IS list-visible.** `server.ts:500`
   `backfillOwnerPolicies` stamps lab-shared kinds (material/material-spec/aliquot/… per
   BACKFILL_KINDS) with DECLARED defaults — i.e. PUBLIC — the moment Q1 is fixed, which touches
   D9's "no silent behaviour change" line. I checked BACKFILL_KINDS (AuthorizationService
   :199-205) vs the seed's lab-shared rules and they overlap. This item deliberately does not
   guard it (document-is-authority); flag for the architect to confirm whether D9 wants the
   migration task (OWN-12) sequenced BEFORE the seed-reachability fix ships runtime effect.
3. **§T7 fixture fidelity.** The plan snippet's store list omits GRP-LAB-ADMINS/USR-ADMIN-2/
   USR-STRANGER but its prose mandates them, and the snippet's `fallback.editRoles: ['owner']`
   differs from the merged seed's `['owner','editor']`. I specced: snippet verbatim + prose
   fixtures added, fallback left as-snippet (test fixture ≠ seed file; OWN-4 pins the seed).
   Approve, or rule that the test fixture must mirror the seed YAML verbatim instead.

COMPOSER DONE /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/drafts/2026-10-11_own-7-stamp-declared-defaults-spec.l1t0810.draft.md
