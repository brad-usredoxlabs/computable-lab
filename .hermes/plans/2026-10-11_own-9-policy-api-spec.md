# OWN-9 SPEC — GET/PUT /settings/ownership-policy (composer draft l1t1030 — PENDING ORCH REVIEW, not canonical)

Composer draft. Grounded at trunk `cl/integration-1` @ **49d964ef** (`49d964efaeb8606feed8d64455b35e7b5acdcc54`), worktree `/mnt/vast/home/brad/git/cl-integration-1`. EVERY path:line below was re-verified by the composer at that sha (not inherited from the plan's main-side anchors).

## Goal

One sentence: expose the lab ownership-policy document as a first-class API surface — `GET /api/settings/ownership-policy` returns `{record, resolved}`, `PUT /api/settings/ownership-policy` replaces the document body, gated by `admin` on the document's OWN access-policy record (D7 — no role hardcoded in TypeScript).

## Deps / gates

- deps: OWN-7 (queued, coder LIVE on fleet lock since 10:37, expected exit ~11:40-12:10). **dispatch_gate: OWN-7 merged** (task list `deps: [OWN-7]`), plus QMS-8 already merged (25f74aaa — satisfied).
- Worker codes off **dispatch-time trunk HEAD** (>= 49d964ef). All anchors below are at 49d964ef; re-anchor if HEAD moved (anchors may shift by a few lines from OWN-7's server.ts/AuthorizationService diff).
- Plan of record: `.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md` §T9 (near-verbatim authoritative — reproduced below with every correction flagged).

## Acceptance criteria (VERBATIM from the task list, id OWN-9)

> verified by:
>   OwnershipPolicyHandlers.test.ts: GET returns seeded doc; PUT non-admin 403; PUT admin 200 +
>   store holds new payload; malformed 422. typecheck clean. Acceptance 6 of the aggregate list.
>
> files: server/src/api/handlers/OwnershipPolicyHandlers.ts (+test), routes.ts, server.ts.

Aggregate acceptance 6 (plan, verbatim): `PUT /settings/ownership-policy` as a non-admin → 403; as admin → 200 and the store holds the new body (unit test).

## Lane-verified anchors at 49d964ef (composer first-hand)

| Thing | Path:line | Fact |
| --- | --- | --- |
| Service exports | `server/src/security/OwnershipPolicyService.ts:13` `OWNERSHIP_POLICY_SCHEMA_ID`, `:15` `DEFAULT_OWNERSHIP_POLICY_RECORD_ID = 'OWN-LAB-DEFAULT'`, `:131` `class OwnershipPolicyService`, `:135` `activeLabPolicy(): Promise<OwnershipPolicyDoc \| null>`, `:106` `export function coerceOwnershipPolicy(env): OwnershipPolicyDoc \| null` | §T9's three imports exist VERBATIM. `activeLabPolicy()` returns a **coerced `OwnershipPolicyDoc`** (recordId/scope/labOwnerUserId/fallback/kindRules-map) — NOT an envelope. |
| SHIPPED FACT (AS-ORCH-L1-042, orch runtime-proved 20261011T1025) | — | `GET :3092/api/records/OWN-LAB-DEFAULT` → 200 (seed-dir file IS gettable by ID), but `activeLabPolicy()` resolves via `store.list({kind})` and is BLIND to the seed-dir file at boot. **§T9's `resolveDocument()` by-id fallback `store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID)` is LOAD-BEARING, not decoration — keep it verbatim.** Without it GET/PUT 404 on a boot-fresh lane. |
| RecordStore interface | `server/src/store/types.ts:118` `get(recordId): Promise<RecordEnvelope \| null>`; `:145` `update(options: UpdateRecordOptions): Promise<StoreResult>`; `:155` **`validate(envelope: RecordEnvelope): Promise<ValidationResult>`** | ⚠ DEVIATION (below): `validate` takes a **RecordEnvelope**, NOT `{schemaId, payload}` as §T9 sketches. `update` DOES take `{envelope, message?}` (`UpdateRecordOptions` :74-85). `StoreResult` :22-39 = `{success, envelope?, validation?, lint?, error?, commit?}`. `ValidationResult` = `{valid, errors}` (`server/src/types/common.ts:31`). |
| AuthorizationService | `server/src/security/AuthorizationService.ts:96` `canAccess(userId: string \| null \| undefined, action: AccessAction, record: RecordEnvelope): Promise<boolean>`; `:99` passes `loadProjectPolicies()` (OWN-6); `:94` ctor is **single-param at 49d964ef** (OWN-7 will add the optional service param) | §T9's call form `canAccess(user.userId, 'admin', record)` MATCHES, incl. `userId: null` (null-safe: `AccessControlService.ts:66` `if (!userId) return false` when a policy exists). |
| No-policy semantics | `server/src/security/AccessControlService.ts:63-67` | `policy: null → return true` (no ACL = open) — this is why the PUT test fixture MUST seed an ACL for the document, else the non-admin 403 test is vacuous. |
| Identity | `server/src/security/LocalIdentityService.ts:83` `resolveRequestUser(request): Promise<ResolvedRequestUser>`; `:9-14` `ResolvedRequestUser {userId: string \| null, userRecord?, isSystem, reason?}`; `:125-138` headerless fallback → first active user / bootstrap `USR-LOCAL-ADMIN` `isSystem:true` | The sketch's `identityService.resolveRequestUser(request)` is a real method — the `identityService: LocalIdentityService` dep in §T9 is correct as written (same shape as `createSignatureHandlers`, server.ts:843-847). |
| QMS-8 gate precedent (one gate, two consumers) | `server/src/api/handlers/LabSettingsHandlers.ts:139-200` (hasCredential discipline at :174-194); denial shape 403 `{error:'FORBIDDEN',message}` | QMS-8 gates the bundle switch; OWN-9 gates the document via `canAccess` (record-scoped — the D7 mechanism). QMS-8's FIX-RUN-1 credential discipline is directly relevant (see reviewer bait 1). |
| routes.ts | `server/src/api/routes.ts:133` `labSettingsHandlers?: LabSettingsHandlers;` in the options interface; registration block **:590-596** (`get('/settings/lab')` :592, `patch('/settings/lab')` :595 — QMS-8 grew the block past the plan's ":590-593"); import style: type-import at `:43` | Register OWN-9's block immediately after :596. |
| server.ts | construction `const labSettingsHandlers = createLabSettingsHandlers({ ... })` at **:817-836**; registerRoutes object entry `labSettingsHandlers,` at **:1404**; route prefix `/api` at `:1566` (`registerRoutes(instance, routeOpts)` :1461) | Construct `ownershipPolicyHandlers` right after the :836 block; add to the object beside :1404. `store`, `localIdentityService` (:493) and `authorizationService` (:495) are in scope there; ctx fields at :252/:255, `ctx.store` used throughout. |
| Test harness | `server/src/test-support/MemoryRecordStore.ts:12` exported, `implements RecordStore`, already imported by `OwnershipPolicyService.test.ts:3`; local request/reply stubs at `server/src/security/LocalAuthorization.test.ts:118-135`; ACL fixture helper `policy()` at `:104-116`; route-level harness `server/src/api/handlers/LabSettingsHandlers.routes.test.ts:48-59` (`stubRouteOptions()` + real `registerRoutes`) | MemoryRecordStore is VERIFIED exported and usable. ⚠ Its `validate()` at :62-64 **always returns `{valid:true}`** — see reviewer bait 3. |
| Baselines (composer re-captured at 49d964ef) | `npm run typecheck -w server` → **45** `error TS` lines; `-w app` → **31** | zero-NEW is the done-gate. |

## §T9 handler code (authoritative — reproduce with the flagged corrections only)

The plan block is reproduced verbatim below; deviations are marked `[DEV-n]` and specified in the Deviations section. Do NOT restructure anything else.

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { LocalIdentityService } from '../../security/LocalIdentityService.js';
import type { AuthorizationService } from '../../security/AuthorizationService.js';
import {
  DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
  OWNERSHIP_POLICY_SCHEMA_ID,
  OwnershipPolicyService,
} from '../../security/OwnershipPolicyService.js';

export interface OwnershipPolicyHandlers {
  getOwnershipPolicy(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
  putOwnershipPolicy(request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply): Promise<unknown>;
}

export function createOwnershipPolicyHandlers(deps: {
  store: RecordStore;
  service: OwnershipPolicyService;
  identityService: LocalIdentityService;
  authorizationService: AuthorizationService;
}): OwnershipPolicyHandlers {
  const { store, service, identityService, authorizationService } = deps;

  async function resolveDocument() {
    const doc = await service.activeLabPolicy();
    if (doc) return store.get(doc.recordId);
    return store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);   // LOAD-BEARING (AS-ORCH-L1-042):
    // activeLabPolicy() lists by kind and is blind to the seed-dir copy of OWN-LAB-DEFAULT at
    // boot, while get-by-ID finds it (orch runtime-proved 20261011T1025: GET
    // /api/records/OWN-LAB-DEFAULT -> 200). Without this fallback GET/PUT 404 on a boot-fresh
    // lane. Keep verbatim.
  }

  return {
    /** GET /settings/ownership-policy */
    async getOwnershipPolicy(_request, reply) {
      const record = await resolveDocument();
      const doc = await service.activeLabPolicy();
      if (!record) {
        reply.status(200);
        return { record: null, resolved: null, defaults: null };
      }
      // Defaults for the kinds the UI asks about (kind list comes from the client).
      return { record, resolved: doc };                                  // [DEV-1]
    },

    /** PUT /settings/ownership-policy — replaces the document body (admin only). */
    async putOwnershipPolicy(request, reply) {
      const user = await identityService.resolveRequestUser(request);   // [DEV-2] credential gate
      const record = await resolveDocument();
      if (!record) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: 'No ownership-policy document installed' };
      }
      if (!(await authorizationService.canAccess(user.userId, 'admin', record))) {
        reply.status(403);
        return { error: 'ACCESS_DENIED', message: `User ${user.userId ?? '(unknown)'} cannot edit the ownership policy` };
      }
      const validation = await store.validate({                          // [DEV-3] envelope form
        recordId: record.recordId,
        schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
        payload: request.body,
      });
      if (!validation.valid) {
        reply.status(422);
        return { error: 'INVALID_POLICY', validation };
      }
      const result = await store.update({
        envelope: { ...record, payload: request.body },
        message: 'Update ownership-policy',
      });
      if (!result.success) {
        reply.status(422);
        return { error: result.error ?? 'UPDATE_FAILED', validation: result.validation };
      }
      return { success: true, record: result.envelope ?? await store.get(record.recordId) };
    },
  };
}
```

`store.update({envelope, message})` MATCHES the real `UpdateRecordOptions` (types.ts:74-85) verbatim — no correction needed there. `result.envelope` is the real StoreResult field (:26). `{ ...record, payload: request.body }` spread preserves `meta` correctly under exactOptionalPropertyTypes (a spread never materializes an absent optional key — contrast the explicit `...(existing.meta !== undefined ? {meta} : {})` dance at RecordHandlers.ts:850, which is needed only because that site re-constructs rather than spreads).

### Deviations (each is the ONLY liberty; flag any further one in the report as a deviation-of-its-own)

- **DEV-1 (recommended enhancement — orchestrator adjudicates)**: on a boot-fresh lane `activeLabPolicy()` returns null while `resolveDocument()` finds the record by ID, so strict-verbatim GET answers `{record: <envelope>, resolved: null}` — `resolved` carries no origin view until the doc is in the index. If the orchestrator approves, one line fixes it honestly: `resolved: doc ?? coerceOwnershipPolicy(record)` (`coerceOwnershipPolicy` is exported at OwnershipPolicyService.ts:106; returns null for malformed → shape unchanged). Do NOT apply if not ratified; strict verbatim is compliant with the task block either way — the plan's `resolved: doc` line is not interface-wrong, only degraded on a seed-blind boot.
- **DEV-2 (credential fail-closed, security correction)**: `resolveRequestUser` falls back to the bootstrap `USR-LOCAL-ADMIN isSystem:true` for a request with NO credential (LocalIdentityService.ts:125-138). QMS-8's adversarial FIX-RUN-1 defect 1 ruled exactly this "not a credential for a privileged write" (LabSettingsHandlers.ts:53-63, :139-200). OWN-9's PUT must mirror it: compute `hasCredential` from non-empty `x-user-id` / `x-computable-user-id` / `x-cl-session` headers FIRST; no credential → 403 `ACCESS_DENIED` BEFORE consulting canAccess. Then keep D7's `canAccess(user.userId, 'admin', record)` as THE gate (one gate, two consumers — do NOT copy QMS-8's RoleResolver arms; the document IS a record, so the record-scoped ACL applies, unlike a config write). `user.userId === null` with a presented-but-unknown credential then fails closed through canAccess (policy exists → `!userId → false`, ACS :66).
- **DEV-3 (interface correction, mandatory)**: `RecordStore.validate(envelope: RecordEnvelope)` (types.ts:155; impl RecordStoreImpl.ts:868-881 validates `envelope.payload` against `envelope.schemaId`). The §T9 call `store.validate({ schemaId, payload })` does NOT typecheck. Build the envelope as in the code block: `{ recordId: record.recordId, schemaId: OWNERSHIP_POLICY_SCHEMA_ID, payload: request.body }`.

## Routes + wiring (exact insertion points, lane anchors)

`server/src/api/routes.ts` — beside the type import at :43 add `import type { OwnershipPolicyHandlers } from './handlers/OwnershipPolicyHandlers.js';`; in the options interface beside :133 add `ownershipPolicyHandlers?: OwnershipPolicyHandlers;`; after the lab block (ends :596) insert, per §T9 verbatim:

```ts
  const { ownershipPolicyHandlers } = options;
  if (ownershipPolicyHandlers) {
    fastify.get('/settings/ownership-policy', ownershipPolicyHandlers.getOwnershipPolicy.bind(ownershipPolicyHandlers));
    fastify.put('/settings/ownership-policy', ownershipPolicyHandlers.putOwnershipPolicy.bind(ownershipPolicyHandlers));
  }
```

`server/src/server.ts` — construct immediately after the `createLabSettingsHandlers({...})` block (ends :836), and add `ownershipPolicyHandlers,` to the registerRoutes object beside `labSettingsHandlers,` (:1404):

```ts
  const ownershipPolicyService = new OwnershipPolicyService(store);
  const ownershipPolicyHandlers = createOwnershipPolicyHandlers({
    store,
    service: ownershipPolicyService,
    identityService: localIdentityService,
    authorizationService,
  });
```

**OWN-7 merge-order rule**: OWN-7 (queued, may merge before this item codes) adds an OPTIONAL `OwnershipPolicyService` ctor param to `AuthorizationService` and constructs one in server.ts near :495. If OWN-7 has merged at your base, REUSE that same instance for BOTH (hoist the single `new OwnershipPolicyService(store)` to beside AuthorizationService's construction and pass it to both consumers — one instance, one truth). If OWN-7 has NOT merged when you start, construct locally beside labSettingsHandlers as above and state the merge-order assumption in the report; your server.ts hunk must stay rebaseable over OWN-7's (own lines, no edits inside its block). Do not depend on OWN-7 behavior.

## Test file — `server/src/api/handlers/OwnershipPolicyHandlers.test.ts`

RED first. Harness: `MemoryRecordStore` imported from `../../test-support/MemoryRecordStore.js` (verified exported; used by OwnershipPolicyService.test.ts:3) + the local `request()`/`reply()` stub pattern from LocalAuthorization.test.ts:118-135 (copy them into the new file — they are file-local there).

Fixture (the 403 test is VACUOUS without the ACL row — `policy: null → true`, ACS :64):
- `user('USR-OWNER')` + `user('USR-STRANGER')` envelopes (pattern at LocalAuthorization.test.ts:79-85).
- The document envelope: `{ recordId: 'OWN-LAB-DEFAULT', schemaId: OWNERSHIP_POLICY_SCHEMA_ID, payload: <a small valid ownership-policy payload — kind/recordId/title/scope{type:'lab',id:'lab'}/labOwnerUserId/fallback{owner,visibility,filedTo,editRoles,shareTargets}/kindRules[]> }`.
- `policy('ACL-OWN-LAB-DEFAULT', 'OWN-LAB-DEFAULT', 'ownership-policy', 'USR-OWNER')` — helper shape at LocalAuthorization.test.ts:104-116 (resourceRef.id must equal `OWN-LAB-DEFAULT`; `findPolicyForRecord` matches on resourceRef.id, AuthorizationService.ts:177-180). **Admin comes ONLY from this document ACL (owner or an admin grant) — never from a hardcoded role, per D7.**
- `service = new OwnershipPolicyService(store)`, `authorizationService = new AuthorizationService(store)` (single-param at 49d964ef; two-param after OWN-7 — the test works either way since the param is optional), `identityService = new LocalIdentityService(store)` (sessionStore optional).

Required cases (task block verbatim: "GET returns seeded doc; PUT non-admin 403; PUT admin 200 + store holds new payload; malformed 422"):
1. GET → 200-ish reply, `{record.recordId: 'OWN-LAB-DEFAULT', resolved.recordId: 'OWN-LAB-DEFAULT'}` (MemoryRecordStore.list-by-kind DOES see the in-map doc — the boot-blindness is a RecordStoreImpl seedDir quirk the unit test cannot reproduce; that is exactly why the fallback stays in code, cite AS-ORCH-L1-042 in a comment).
2. GET with empty store → `{record: null, resolved: null, defaults: null}`.
3. PUT as `USR-STRANGER` (`headers: {'x-user-id':'USR-STRANGER'}`) → 403 `ACCESS_DENIED`, store payload unchanged.
4. PUT with NO credential headers → 403 (DEV-2; RED against plain §T9 — this test is what forces the credential gate).
5. PUT as `USR-OWNER` with a new body → 200-ish, `store.get('OWN-LAB-DEFAULT').payload` deep-equals the new body (aggregate acceptance 6's "store holds the new body").
6. Malformed body → 422 `INVALID_POLICY`. ⚠ MemoryRecordStore.validate always returns valid:true (:62-64) — subclass/wrap the store with a scripted validate (e.g. reject when `payload.kind !== 'ownership-policy'`), or drive a real AjvValidator if cheap. A 422 test against the stock stub is VACUOUS (it would assert `toBe(false)` on a value the harness controls — the adversarial reviewer runs non-vacuity probes).
7. Route smoke (mirrors LabSettingsHandlers.routes.test.ts `stubRouteOptions()` + real `registerRoutes` + `fastify.inject`): `inject GET /settings/ownership-policy` → 200 with `{record,resolved}` — proves the ROUTE exists (QMS-7 process lesson: a service-level test passed while the shipped route was absent).

## Reviewer bait (pre-empt these)

1. **Implicit-identity admin leak**: headerless PUT resolving to bootstrap USR-LOCAL-ADMIN (isSystem:true) and passing canAccess because the doc ACL is owned by USR-LOCAL-ADMIN. DEV-2's hasCredential pre-check is the QMS-8-proven remedy; its absence is a guaranteed BLOCKER given the FIX-RUN-1 history.
2. **exactOptionalPropertyTypes sites** (tsconfig ON, server/tsconfig.json:13): `ResolvedRequestUser.userRecord?/reason?` — never assign `undefined` explicitly; `StoreResult.envelope?/validation?/error?` — read with `??`/`?? await store.get(...)`, never `= result.envelope` into a non-optional slot; `KindRule.publishRole?` — the service already spreads conditionally (:101), don't reintroduce. Do NOT touch `{ ...record }` spread semantics — safe as-is.
3. **YAML-reload trap**: N/A for the worker's unit tests (TS-only diff), but state it honestly in the report: any claim about the LIVE route on :3092 would need a lane restart the worker is forbidden to do — so make NO runtime claim (tests + greps only).
4. **Vacuity probes**: the non-admin-403 test needs the seeded document ACL (no-ACL = open, ACS :64); the 422 test needs a rejecting validate (stub always-valid). Reviewer will diff both against the mutation "remove the ACL row / use the stock stub" — both must flip the test RED.
5. **Hardcode boundary**: no `'USR-LOCAL-ADMIN'` special-case, no role string outside the ACL resolution, no kind names in handlers. The ONLY constants allowed are the imported `DEFAULT_OWNERSHIP_POLICY_RECORD_ID` / `OWNERSHIP_POLICY_SCHEMA_ID`.
6. **Ontology terms**: none required — this item touches no claim/context/assertion surfaces.
7. **by-id fallback deletion**: a reviewer may claim `resolveDocument`'s second `store.get` is dead code (MemoryRecordStore tests pass without it). It is NOT — AS-ORCH-L1-042: RecordStoreImpl's list-by-kind misses the seedDir copy at boot while get-by-ID hits it; keep verbatim with the comment.

## Worker contract

- Worktree/branch: `wt/OWN-9-lane1-<ts>` off dispatch-time trunk `cl/integration-1` (worker creates; >= 49d964ef). ALWAYS `git -c core.fileMode=false` for any git inspection (NFS mode-bit noise).
- Files (stage EXACTLY these, never `git add -A`): `server/src/api/handlers/OwnershipPolicyHandlers.ts` (new), `.../OwnershipPolicyHandlers.test.ts` (new), `server/src/api/routes.ts`, `server/src/server.ts`.
- Commit message: `feat(api): GET/PUT /settings/ownership-policy (admin-gated)`.
- RED first: write the test file, run it, see it fail, implement, green.
- Report: `<REPORT_PATH>` (orchestrator fills the unique path). Include: base sha, fail-set evidence (below), tsc counts (below), the OWN-7 merge-order state at your base (merged → instance reused / not merged → local construction), deviations applied (DEV-1 only if ratified), and honest "no runtime claims" statement.
- FORBIDDEN: restarting the lane stack (:3092/:5192), touching :3001/:5174, curl against any stack, runtime claims, editing the task list, `pnpm install`, marking own item done.
- Stop-boundary: any NEW platform gap (e.g. canAccess's shape can't express the admin gate, registerRoutes can't take the option) → STOP and return `requires-rescope` to the architect. Never absorb.

## Baselines (zero-NEW is the done-gate; exit-0 claims forbidden)

`server/src/api/` has PRE-EXISTING vitest failures and typecheck is NOT clean at recent HEADs. Composer measured AT 49d964ef: `npm run typecheck -w server` → 45 `error TS` lines; `-w app` → 31. The worker must:
1. At own base, recapture: `npm run test:run -w server -- src/api/ 2>&1 | tail -30` and `npm run typecheck -w server 2>&1 | grep -c "error TS"`.
2. At head, re-run both; the fail set must be IDENTICAL (same files/tests) and the TS count IDENTICAL (45 at 49d964ef base) with ZERO errors in the two new files + routes.ts + server.ts.
3. Report base-vs-head counts; never claim exit 0.

## Acceptance checks (real commands, from repo root of the worktree)

```bash
# first targeted check (run this EARLY — it proves the approach before the full suite):
npm run test:run -w server -- src/api/handlers/OwnershipPolicyHandlers.test.ts
#   expect: RED first (handlers file absent), then 7 passed / 0 failed

npm run test:run -w server -- src/api/ 2>&1 | tail -30        # fail set IDENTICAL base-vs-head
npm run test:run -w server -- src/security/ 2>&1 | tail -10   # expect: identical to base (no regressions; OWN-6's 40/40 if OWN-7 unmerged)
npm run typecheck -w server 2>&1 | grep -c "error TS"         # expect: identical count to own base (45 at 49d964ef), none in touched files
grep -n "settings/ownership-policy" server/src/api/routes.ts  # expect: exactly 2 (get + put registrations)
grep -n "ownershipPolicyHandlers" server/src/server.ts        # expect: 2 (construction line + registerRoutes object entry)
grep -rn "USR-LOCAL-ADMIN\|role-grant\|RoleResolver" server/src/api/handlers/OwnershipPolicyHandlers.ts   # expect: EMPTY (D7 boundary)
git status --porcelain   # expect: only the 4 contract files (+ report)
```

## Open questions for orchestrator (3)

1. **DEV-1 — `resolved: null` on a seed-blind boot.** Strict §T9 returns `{record: <envelope>, resolved: null}` on a boot-fresh lane (activeLabPolicy blind, by-id fallback hits — AS-ORCH-L1-042). Ratify the one-line `doc ?? coerceOwnershipPolicy(record)` enhancement (exported fn, OwnershipPolicyService.ts:106; no test-shape change), or hold strict verbatim and accept the degraded `resolved` until the list-by-kind seed gap is fixed platform-side? (Checked: coerceOwnershipPolicy is pure + exported; MemoryRecordStore tests unaffected either way.)
2. **DEV-2 scope — does GET need a credential pre-check too?** §T9 gates only PUT; GET /settings/lab is also ungated (routes.ts:592, handler reads no identity), so verbatim-GET is consistent with the shipped settings surface. The document is not secret (it is git-committed seed data), so I scoped the credential gate to PUT only. Confirm you don't want GET gated.
3. **OWN-7 sequencing at code time.** OWN-7's coder was LIVE at composer time (expected exit ~11:40-12:10). The spec handles both orders (instance-reuse if merged, local construction if not — §wiring). If you dispatch OWN-9 while OWN-7 is STILL unmerged, both touch server.ts in adjacent-but-distinct hunks; confirm you prefer fleet-serial (OWN-9 after OWN-7 merges, per task-list `deps: [OWN-7]`) over parallel-with-rebase. (Checked: OWN-7's server.ts edit is at :495 construction; OWN-9's at :836+/1404 — textually disjoint, but deps say serial.)


---
## ORCHESTRATOR ADJUDICATIONS (20261011T1255 tick — this block is BINDING; it supersedes the three open questions)

Base at dispatch: trunk cl/integration-1 @ 7b27011b or later (OWN-7 IS MERGED; QMS-8 merged). The draft's 49d964ef anchors were re-verified by the orchestrator at 7b27011b with these shifts: server.ts `const labSettingsHandlers = createLabSettingsHandlers({...})` is now at :819 (block ends ~:838), registerRoutes object entry `labSettingsHandlers,` at :1406, `localIdentityService` :494, `ownershipPolicyService` ALREADY CONSTRUCTED at :496, `authorizationService` :497. routes.ts anchors (:133, :590-596) unchanged. Baselines unchanged: server tsc 45 error-TS lines, app 31 (re-confirmed by the OWN-8 run at a base including OWN-7).

- OQ1 / DEV-1 (coerce fallback in GET): RATIFIED. Apply `resolved: doc ?? coerceOwnershipPolicy(record)` exactly as drafted, with a one-line comment citing AS-ORCH-L1-042 (seed-blind boot). This is the honest origin view, not a widening.
- OQ2 / GET credential gate: REJECTED — GET stays ungated, verbatim. Consistent with GET /settings/lab (routes.ts:592, ungated) and the document is committed seed data. The PUT credential pre-check (DEV-2) is MANDATORY as drafted — mirror LabSettingsHandlers.ts:183-185's header trio (x-user-id / x-computable-user-id / x-cl-session), hasCredential FIRST, 403 before canAccess. No-credential test (case 4) must be RED against plain §T9.
- OQ3 / OWN-7 sequencing: RESOLVED — OWN-7 IS MERGED at your base. The instance-reuse branch of the merge-order rule applies: server.ts ALREADY has exactly one `new OwnershipPolicyService(store)` at :496 feeding AuthorizationService (:497). REUSE THAT INSTANCE for the handlers (`service: ownershipPolicyService`); add NO second construction anywhere in server.ts. Adversarial review will grep `new OwnershipPolicyService` and expect EXACTLY 1.
- Test-case 1 note: at your base AuthorizationService's ctor is TWO-param with the second OPTIONAL — `new AuthorizationService(store)` in the test still compiles (OWN-7's optional-param discipline); keep it one-arg in the test so the test does not depend on OWN-7 behavior.
- Promotion: draft adopted as canonical at .hermes/plans/2026-10-11_own-9-policy-api-spec.md.

