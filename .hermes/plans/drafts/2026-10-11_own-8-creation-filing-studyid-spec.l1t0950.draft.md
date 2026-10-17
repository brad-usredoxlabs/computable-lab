# OWN-8 — Creation-time filing: `filedTo: active-project` lands `links.studyId`

Status: COMPOSER DRAFT (l1t0950) — not canonical until the orchestrator promotes it.

## Goal (one sentence)

When a create request carries `body.studyId` and the ownership-policy rule for the
payload's kind declares `filedTo: active-project`, the server stamps `links.studyId`
onto the payload at creation — the rule decides, the code only applies.

## Deps and grounding

- Grounded at trunk `cl/integration-1` @ **`c49f7b45`** (worktree `/mnt/vast/home/brad/git/cl-integration-1`).
  Every path:line below is verbatim at that sha. OWN-6 project principal is merged HERE;
  **OWN-7 (ensureOwnerPolicy stamping) is NOT merged at c49f7b45** — see "Merge order".
- deps: [OWN-5 MERGED (service on trunk), OWN-7 (merge-order assumption, behavior-independent)].
  dispatch_gate QMS-8 merged — already satisfied per handoff 2026-10-11_lane1-tick-20261011T1010.
- Behavior dependency on OWN-7: **NONE.** The filing check reads the declared rule straight
  from `OwnershipPolicyService.ruleFor()`; it does not go through `AuthorizationService`,
  `ensureOwnerPolicy`, or `CreateDefaults.ownerUserId` semantics. OWN-8 is correct whether or
  not OWN-7's stamping landed.
- Plan of record: `.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md` §T8
  (lines 1054-1142), Pinned decisions D1-D13, aggregate acceptance #4 (line ~1467).
  §T8's snippet is authoritative in INTENT; two corrections are mandatory (§ "Plan errata").

## VERIFIED first-hand (path:line at c49f7b45 — orchestrator re-checked the load-bearing ones)

1. **createRecord full flow** — `server/src/api/handlers/RecordHandlers.ts`:
   - `createRecord` :354; destructures only `{ schemaId, message }` from body (:359),
     reads `request.body.payload` (:370, :394).
   - **Request user is resolved once at :378** — `const user = await resolveRequestUser(request, reply)`
     (local wrapper :116-124 delegating to `security.identityService.resolveRequestUser`).
     `user` is in scope at the insertion point. **A second `resolveRequestUser` call is FORBIDDEN.**
   - `kind` is already computed at **:408** (`payloadKind(payload)` over the NORMALIZED payload :391).
   - Provenance stamping builds fresh objects: `payloadWithProvenance` :457-464, alias
     `typedPayload` :467; parent-FAIR inheritance mutates `typedPayload` :471-486.
   - **`createEnvelope(...)` consumes `payloadWithProvenance` at :489-501** (with the
     `stampActorAs` spread at :492-494).
   - `store.create(...)` at **:511-514**; `ensureOwnerPolicy` post-create at :582-584.
   - **recordId is payload-derived, NOT handler-generated**: `extractRecordId(payload)` :399,
     and `createEnvelope` re-derives it (server/src/types/RecordEnvelope.ts:122-139). The test
     can assert `store.get('LPR-1')` directly; the plan's hedge about generated ids does not apply.
2. **CreateRecordRequest** — `server/src/api/types.ts:34-41`: `{ schemaId, payload, message? }`.
   **Parse seam / body passthrough**: `routes.ts:230` registers
   `fastify.post('/records', recordHandlers.createRecord...)` with NO fastify `schema:` and
   server.ts configures NO fastify `validatorCompiler`/`addHook('preValidation')` (the Ajv at
   server.ts:373 is the record validator, a different object). Fastify's default JSON parser
   does not strip unknown fields → an unknown `body.studyId` ALREADY reaches the handler at
   runtime; types.ts only needs the declaration.
3. **RecordHandlerSecurityOptions** — `RecordHandlers.ts:40-59` (NOT exported; optional members,
   all-absent = system works). `createRecordHandlers(store, indexManager?, identity?,
   getMaterialTracking?, lifecycleEngine?, onEventGraphMutated?, security?)` :102-115.
   Server assembly: **`server/src/server.ts:699-718`** (the task block's :699 re-anchors EXACTLY:
   `createRecordHandlers(` is :699, security options object :707-718) inside **`createServer`
   (starts :660)**, which receives `AppContext` (interface :235, `authorizationService`
   :255, ctx literal :617 — built in `initializeApp` :300).
   **Instance sharing (my recommendation, load-bearing):** OWN-7's draft
   (`.hermes/plans/drafts/2026-10-11_own-7-stamp-declared-defaults-spec.l1t0810.draft.md` :64-66,
   :133-137) constructs `const ownershipPolicyService = new OwnershipPolicyService(store);` at
   **server.ts:495** inside `initializeApp` and passes it ONLY into `AuthorizationService` —
   it does NOT widen `AppContext`. That local is out of scope at :707. So OWN-8 carries the
   widening (it already owns server.ts): add `ownershipPolicyService: OwnershipPolicyService`
   to `AppContext` (beside :255), assign the SAME instance in the ctx literal (:617-647), and
   in createServer's options object pass `ownershipPolicyService: ctx.ownershipPolicyService`.
   **ONE construction (server.ts:495), zero duplication.** Do not `new OwnershipPolicyService`
   a second time anywhere.
4. **OwnershipPolicyService public API** — `server/src/security/OwnershipPolicyService.ts`:
   - `ruleFor(kind): Promise<ResolvedKindRule | null>` **:144-150** — returns the kind rule
     with `origin {policyRecordId, source: 'kind'|'fallback'}`; fallback applies for unlisted
     kinds; **null only when no document exists**. `ResolvedKindRule.filedTo: 'none' |
     'active-project'` (FiledTo :19, KindRule.filedTo :24, coerced :92 — malformed values
     coerce to 'none', never guessed).
   - `defaultsForCreate({kind, creatorUserId}): Promise<CreateDefaults | null>` :153-164 also
     carries `filedTo` but additionally resolves `ownerUserId`/`grants` — filing needs none of
     that. **Recommendation: use `ruleFor(kind)`** — it reads the DECLARED filedTo from the rule
     with its origin, needs no creatorUserId, and cannot drift with OWN-7's owner semantics.
     (Deviation from the §T8 snippet, which used `defaultsForCreate`; see OQ1.)
5. **Schema expressibility of `links.studyId` — NOT a platform gap.**
   `schema/workflow/local-protocol.schema.yaml` (NOT schema/lab/ — task block's guess is wrong):
   - `$id` = `https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml` **:3**
     — note: NO `workflow/` segment in the id (the §T8 snippet's schemaId is WRONG, plan errata E1).
   - `links` **:119-129**: `type: object`, `additionalProperties: false`,
     properties **`studyId`**/`experimentId`/`runId` (all `type: string`). **`links.studyId`
     is first-class declarable — filing lands cleanly. No schema change needed; do not touch
     the schema.**
   - required **:18-23**: `kind, recordId, title, inherits_from, status`; `recordId` pattern
     `^LPR-[A-Za-z0-9_-]+$` :31-33 (`LPR-1` matches); `status` enum
     `[draft, active, superseded, retracted]` :176-178; `inherits_from` is a Ref
     (schema/core/datatypes/ref.schema.yaml — record refs require `kind, id, type`).
   - Seed rule (the data that drives this):
     `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml:24-29` —
     `kind: local-protocol, owner: creator, visibility: private, filedTo: active-project`
     (:27). Do NOT change it.
6. **Harness to mirror** — `server/src/security/LocalAuthorization.test.ts`: the 6-positional-
   undefined + options-object call at **:247-258** (`createRecordHandlers(store, undefined,
   undefined, undefined, undefined, undefined, { identityService, authorizationService })`),
   with local `user()`, `study()`, `reply()`, `request()` helpers (:80-130). The store class has
   been EXTRACTED to **`server/src/test-support/MemoryRecordStore.ts`** (owned by OWN-5, merged)
   — the NEW filing test imports THAT one (`../../test-support/MemoryRecordStore.js`), not the
   stale local copy still present in LocalAuthorization.test.ts:17-75. The policy-document
   fixture envelope pattern to mirror: `server/src/security/OwnershipPolicyService.test.ts`
   `docEnv()` (:11-28) — an in-memory envelope, not an on-disk YAML read.
7. **exactOptionalPropertyTypes is ON** — `server/tsconfig.json:13`.

## Scope

IN: `server/src/api/types.ts`, `server/src/api/handlers/RecordHandlers.ts` (+ NEW
`server/src/api/handlers/RecordHandlers.filing.test.ts`), `server/src/server.ts` (inject the
shared instance; AppContext widening).

EXPLICITLY OUT: `AuthorizationService.ts`, `AccessControlService.ts`, `OwnershipPolicyService.ts`
(any edit), `AccessPolicyHandlers`/`IdentityHandlers`, `routes.ts`, all schema YAML, all
`records/` data, the whole `app/` workspace, draft-copy filing (`draftCopy` :164-190 does NOT
file — out of scope, §T8 is create-only), any client that SENDS studyId (OWN-11/OWN-12 + the AI
tool path, per plan risk note).

## Acceptance criteria (verbatim from the task list, lanes/1/task-list.md:2806-2809)

```
verified by: >-
  RecordHandlers.filing.test.ts green; npm run test:run -w server -- src/api/ no regressions;
  acceptance 4 of the plan's aggregate list.
```

Aggregate acceptance #4 verbatim (plan line ~1467):
```
4. A `local-protocol` created with `studyId: STU-x` and no `links.studyId` lands with
   `links.studyId: STU-x` (unit test).
```

## The change

### 1. `server/src/api/types.ts` — plan-verbatim (:34-41 extended)

```ts
export interface CreateRecordRequest {
  schemaId: string;
  payload: unknown;
  message?: string;
  /**
   * Active project for this creation. When the ownership policy for this kind
   * says filedTo: active-project and the payload carries no studyId, the record
   * is filed into this study (links.studyId) at creation time.
   */
  studyId?: string;
}
```

### 2. `RecordHandlers.ts` — `RecordHandlerSecurityOptions` gains (plan-verbatim):

```ts
  ownershipPolicyService?: OwnershipPolicyService;
```
with a `import type { OwnershipPolicyService } from '../../security/OwnershipPolicyService.js';`
(type-only; the optional-member house style stands: absent service → no filing, system works).

### 3. The insertion — **NOT where §T8's snippet says** (see Plan errata E2)

§T8 says "immediately before `store.create(...)`" and mutates `request.body.payload`. At
c49f7b45 the envelope is built at **:489** from `payloadWithProvenance` — a write to
`request.body.payload` after :489 is a **dead write** (the envelope already captured the
older object). The stamp must produce the object `createEnvelope` consumes.

Insert between the inheritance block (ends :486) and `const envelope = createEnvelope(`
(:489), reusing `user` (:378) and `kind` (:408):

```ts
        // Declarative filing: a kind whose ownership rule declares
        // filedTo: active-project lands in the caller's project unless the
        // payload already names one. The rule decides; this code only applies.
        const filedStudyId = request.body.studyId;
        const filingRule =
          security?.ownershipPolicyService && user.userId && kind && typeof filedStudyId === 'string'
            ? await security.ownershipPolicyService.ruleFor(kind)
            : null;
        const currentLinks =
          typedPayload.links && typeof typedPayload.links === 'object'
            ? (typedPayload.links as Record<string, unknown>)
            : undefined;
        const payloadForEnvelope =
          filingRule?.filedTo === 'active-project' &&
          typeof filedStudyId === 'string' &&
          typeof currentLinks?.studyId !== 'string' &&
          typeof typedPayload.studyId !== 'string'
            ? { ...typedPayload, links: { ...(currentLinks ?? {}), studyId: filedStudyId } }
            : typedPayload;
```

Then use `payloadForEnvelope` at BOTH envelope inputs — the `stampActorAs` spread (:492-494,
currently `{ ...payloadWithProvenance, ... }`) and the plain branch (:494) → `{ ...
payloadForEnvelope, [authoringPolicy.stampActorAs]: user.userId }` / `payloadForEnvelope`.
Do NOT mutate `request.body` (the handler already treats `payload` as a normalized copy);
do NOT add a second `resolveRequestUser`; do NOT recompute `payloadKind`. Semantics kept
verbatim from the plan's condition: existing `links.studyId` wins, and a top-level payload
`studyId` string also counts as "already filed" (that path already drives parent-inheritance
at :468-469). The pre-create parent write-check (:435-441) runs BEFORE stamping and stays
untouched — filing never gates on the study's ACL (matches plan; filing ≠ sharing, §OQ5).

### 4. `server/src/server.ts` — one shared instance (anchor :495 post-OWN-7)

- `AppContext` (:235): add `ownershipPolicyService: OwnershipPolicyService;` beside
  `authorizationService` (:255); assign the SAME instance in the ctx literal (:617+).
- In `createServer`'s recordHandlers options (:707-718): `ownershipPolicyService:
  ctx.ownershipPolicyService,`.
- **Merge-order assumption:** OWN-7 lands first (deps order) so `const ownershipPolicyService
  = new OwnershipPolicyService(store);` already exists at :495 and `AuthorizationService`'s
  ctor already takes the optional 2nd param. If your base LACKS OWN-7 (check
  `grep -n "new AuthorizationService(store)" server/src/server.ts` — plain `(store)` means
  OWN-7 is absent): STOP-and-flag in the report, and only proceed construction-side by adding
  the :495 construction + AppContext plumbing WITHOUT touching AuthorizationService's ctor
  (do not recreate OWN-7's diff; the orchestrator decides sequencing).

### 5. New test `server/src/api/handlers/RecordHandlers.filing.test.ts` — RED FIRST

Mirror the LocalAuthorization.test.ts:247-258 call shape + test-support MemoryRecordStore +
the OwnershipPolicyService.test.ts `docEnv()` fixture style + that file's local `user()`,
`study()`, `reply()`, `request()` helpers (copy them; do not import across test files).
Store seeds: `user('USR-BRAD')`, a study `STU-MITO` envelope, the `docEnv()` policy document
(local-protocol rule `filedTo: active-project`; a `protocol`/fallback kind covers the negative).
Handlers:
`createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, { identityService: new LocalIdentityService(store), authorizationService: new AuthorizationService(store), ownershipPolicyService })`
— pass `new AuthorizationService(store)` WITHOUT the 2nd param so the test does NOT depend on
OWN-7's widened ctor (behavior-irrelevant here; the ensureOwnerPolicy back-fill at :582 works
either way on MemoryRecordStore).

Three tests (plan's positive + two guards that make the adversarial review bored):

1. POSITIVE (plan §T8 verbatim in intent, with errata E1/E3 applied):
```ts
  it('files a new local-protocol into the active project when the policy says so', async () => {
    // store seeded with: user USR-BRAD, OWN-LAB-DEFAULT doc (local-protocol rule
    // filedTo: active-project), study STU-MITO
    const reply1 = reply();
    await handlers.createRecord(
      request<{ Body: { schemaId: string; payload: unknown; studyId?: string } }>({
        body: {
          // E1: the REAL $id (schema/workflow/local-protocol.schema.yaml:3) — no "workflow/" segment
          schemaId: 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml',
          // E3: `status` is required (schema :18-23); inherits_from record-ref needs kind+id+type
          payload: { kind: 'local-protocol', recordId: 'LPR-1', title: 'My draft', status: 'draft',
                     inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' } },
          studyId: 'STU-MITO',
        },
        headers: {},
      }),
      reply1,
    );
    expect(reply1.statusCode).toBe(201);
    const created = await store.get('LPR-1');   // recordId is payload-derived (:399) — direct get works
    const links = (created?.payload as Record<string, unknown>).links as Record<string, unknown>;
    expect(links.studyId).toBe('STU-MITO');
  });
```
2. DOES-NOT-OVERWRITE: same create but payload already carries `links: { studyId: 'STU-EXISTING' }`
   → created record keeps `STU-EXISTING`.
3. RULE-SAYS-NONE: a kind whose rule/fallback is `filedTo: none` (e.g. `claim`, hitting the
   fallback rule, or `protocol` per the seed :30-36 — pick one, comment which) with
   `studyId: 'STU-MITO'` in the body → created payload has NO `links.studyId`. (Watch: a
   top-level `studyId` string is itself a "no-overwrite" condition — for this negative put the
   study id ONLY in `body.studyId`, not in the payload.)

Also assert in test 1 that the RESPONSE envelope (`res`/`result.envelope`) carries the same
links (guards against stamping a copy the store never saw).

## Plan errata (mandatory deviations — cite these in the commit messages)

- **E1 — wrong schemaId in §T8's snippet**: the plan writes
  `.../computable-lab/workflow/local-protocol.schema.yaml`; the real `$id`
  (schema/workflow/local-protocol.schema.yaml:3, dir `workflow/`, id WITHOUT it) is
  `https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml`
  (confirm: server/src/protocol/ProtocolContextService.ts:7 uses the same string). MemoryRecordStore
  doesn't validate so the wrong id would "pass" the test vacuously — use the real one.
- **E2 — dead-write insertion point**: §T8's "immediately before store.create + mutate
  request.body.payload" cannot work at c49f7b45 because the envelope is constructed at :489
  BEFORE :511. Use the corrected insertion above (§ "The change" item 3). Intent preserved
  exactly; mechanics fixed.
- **E3 — snippet payload missing required `status`**: schema required list :18-23 includes
  `status`; the plan's payload omits it. Keep the test payload schema-valid even though the
  in-memory store won't enforce (honest fixtures; the real store WILL validate this create live).

## Worker constraints

- Worktree branch off trunk: `wt/OWN-8-lane1-l<token>` off `cl/integration-1` (>= your base sha;
  record base sha in the report). Always `git -c core.fileMode=false` for git ops (NFS mode-bit
  noise). NEVER `git add -A` — stage exactly the task's files.
- Report: your unique path **`<REPORT_PATH>`** (orchestrator substitutes, pattern
  `~/.hermes/cl/lanes/1/reports/own8-report-l1t<token>.md`).
- **NO lane-stack restart, NO curl against :3092/:3001/:5174/:5192, NO runtime claims.** This
  is a unit-proven item. (Context you must not mistake for a defect: per carried finding
  AS-ORCH-L1-042 the seed document is not list-visible to `activeLabPolicy()` at boot — live
  filing is INERT until a separate follow-up lands. That is NOT yours to fix; do not probe it,
  do not "fix" it, mention nothing runtime about it in your report.)
- **RED first**: the filing test committed failing BEFORE the implementation; commit messages:
  `test(api): RED — creation-time filing contract (§T8)` then
  `feat(api): default filing to the active project from the ownership policy` (plan verbatim).
- **Baselines are recaptured at YOUR base, at the top of your run, and zero-NEW is the gate;
  exit-0 claims are forbidden**:
  - fail set: `npm run test:run -w server -- src/api/` captured at base before any edit
    (src/api/ HAS pre-existing failures on trunk — capture, then diff after your change);
  - typecheck error-line counts at base: `npm run typecheck -w server` / `-w app`
    (~45 / ~31 `error TS` lines at recent HEADs). Report the before/after table.
- `exactOptionalPropertyTypes` is ON — never construct `{ studyId: undefined }`; the guarded
  spread above is written for it, keep it that way.
- **Stop-boundary: a NEW platform gap = STOP and return requires-rescope to the architect.**
  (For the record, the two candidate gaps were checked and CLOSED by the composer: schema
  expressibility of `links.studyId` is FINE (item 5), and body passthrough is FINE (item 2).)

## First targeted check (early proof, before the full suite)

After RED (test 1 failing with `links` undefined — proves the seam is where you think it is),
and after the insertion, prove the approach with the single command:

```bash
npm run test:run -w server -- src/api/handlers/RecordHandlers.filing.test.ts
```
Expected GREEN: 3 passed. If test 1 fails on `reply1.statusCode` not 201, the payload is
schema-invalid at the handler's pre-checks — re-read E3, do not weaken the fixture.

## Verification (full, with expected output)

```bash
npm run test:run -w server -- src/api/handlers/RecordHandlers.filing.test.ts   # 3 passed, 0 failed
npm run test:run -w server -- src/api/          # diff vs base fail set: ZERO new failures (pre-existing failures may remain)
npm run test:run -w server -- src/security/     # 40/40 at c49f7b45 baseline (OWN-6 merged); zero new
npm run typecheck -w server 2>&1 | grep -c "error TS"   # EQUAL to your captured base count (~45), zero in RecordHandlers.ts/types.ts/server.ts
npm run typecheck -w app    2>&1 | grep -c "error TS"   # EQUAL to base (~31) — app untouched
```
No fastify boot, no lane stack, no browser gate (server-only, unit-proven).

## Worker contract

- Branch: `wt/OWN-8-lane1-l<token>` off `cl/integration-1`.
- Deliverable files (stage exactly these): `server/src/api/types.ts`,
  `server/src/api/handlers/RecordHandlers.ts`,
  `server/src/api/handlers/RecordHandlers.filing.test.ts` (new), `server/src/server.ts`.
- Report: `<REPORT_PATH>` with: base sha, RED evidence, GREEN evidence, before/after fail-set
  and typecheck-error-count tables, plan-errata citations (E1/E3 at minimum; E2 if asked).

## Reviewer bait (the edge errors this item invites — pre-empt them)

1. **The dead-write trap (E2)** — the single highest-risk defect: copying §T8's snippet verbatim
   "immediately before store.create" produces a test that PASSES only if you ALSO mutate the
   envelope, or fails confusingly. The envelope is built at :489; stamp upstream of it.
2. **The vacuous-schema trap (E1)** — with MemoryRecordStore, ANY schemaId string passes; a
   reviewer will check the schemaId against `schema/workflow/local-protocol.schema.yaml:3`'s
   `$id`. Use the real one and the real required fields (E3), or the test is decoration.
3. **exactOptionalPropertyTypes sites** — `body.studyId` is `string | undefined` under a narrow;
   don't widen types with `as string`; `links: { ...currentLinks, studyId: filedStudyId }` after
   the `typeof === 'string'` guard is the compliant shape. No `studyId: undefined` ever.
4. **No second `resolveRequestUser`** — `user` (:378) is in scope; a reviewer greps for a second
   call and for any new `security.identityService` access inside createRecord.
5. **Hardcode boundary** — the stamping code must contain NO kind name (`'local-protocol'` must
   never appear in RecordHandlers.ts), no study-id literals; the ONLY decision input is
   `filingRule?.filedTo`. If tempted to special-case by schemaId — that is the boundary the whole
   campaign exists to remove (why: OWN-7 fixed the same class at AuthorizationService:124).
6. **`ruleFor` returns the FALLBACK rule, not null, for unlisted kinds** (OwnershipPolicyService.ts:148-149)
   — the negative test works through `filedTo: 'none'` coercion (:92), not through null; and
   null only means "no document installed at all". Don't "guard" with kind allowlists.
7. **YAML-reload trap (screening only)** — the test uses an in-memory docEnv fixture; nobody
   should read `records/seed/identity/OWN-LAB-DEFAULT__*.yaml` off disk in this test or restart
   the lane stack to "prove" filing live (runtime is inert per AS-ORCH-L1-042; see Worker
   constraints).
8. **OWN-7 seam conflict** — the server.ts diff sits exactly on OWN-7's wiring seam (:495/AppContext).
   Your branch must apply cleanly on a trunk that already has OWN-7's ctor widening; if not, the
   merge-order rule above, flagged, not silently re-wired.

## Open questions for orchestrator (3)

1. **`ruleFor` vs `defaultsForCreate`.** §T8's snippet calls `defaultsForCreate`; I specified
   `ruleFor(kind)` (OwnershipPolicyService.ts:144) because filing needs only the declared
   `filedTo` and must not couple to OWN-7's owner-resolution. Both read the same rule
   (defaultsForCreate is built on ruleFor, :153-160). Rule on adopting the deviation — the plan
   snippet is otherwise kept verbatim. [Checked: service source :144-164, OWN-5 tests.]
2. **AppContext widening ownership.** OWN-7's draft (l1t0810) constructs the service at :495 but
   does NOT add it to AppContext, while OWN-10's task text assumes "AppContext gains
   ownershipPolicyService (assigned where OWN-7 constructs it)". I put the widening in OWN-8
   (it owns the server.ts inject). If you'd rather OWN-7 carry it, re-sequence and drop §4's
   AppContext bullets from this spec. [Checked: server.ts:235-268/:495/:617/:707, OWN-7 draft.]
3. **Seed list-visibility follow-up (AS-ORCH-L1-042).** The tick handoff asks composers to
   propose the materialize-at-boot / get-by-id-fallback follow-up "as a small OWN-9-era
   addition" — I deliberately did NOT fold it into OWN-8 (out of scope, runtime inert is fine
   for a unit-proven item). Please enqueue it explicitly so it doesn't evaporate; until then
   live filing (and live OWN-7 stamping) stay inert. [Checked: handoff 1010 "Carried FINDING",
   OwnershipPolicyService.ts:135-141 seed-list behavior, seed file path seed/identity/.]
