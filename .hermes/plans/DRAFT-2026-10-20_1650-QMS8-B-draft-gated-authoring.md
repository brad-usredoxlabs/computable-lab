# SPEC DRAFT — QMS8-B: Draft-gated registry authoring (instrument/equipment lint authoring blocks + real registry-ops grant)

Status: DRAFT composed by cl-spec-composer 2026-10-20 16:50, lane 1, trunk cl/integration-1 (docs head 39759413, code head 7eb72222). NOT canonical until the orchestrator promotes it. All file:line evidence below was read first-hand in /mnt/vast/home/brad/git/cl-integration-1 at compose time; :3092 liveness probed live.

## Goal (one sentence)

Under POL-REGULATED (and POL-TRACKED), creating or materially editing an instrument/equipment record requires the actor to hold the `author` role scoped to the `registry-ops` lifecycle (or be system/local-admin), declared entirely in the two lint YAML files, with POL-SANDBOX/POL-NOTEBOOK friction untouched — and Brad gets a real, API-minted `GRANT-BRAD-REGOPS` so he can still run the happy lap.

## Orientation recon — composer-verified answers (coder may trust these; each was read in the worktree)

### Q1 — Actor context is lifecycle-AGNOSTIC (confirmed)

`server/src/lint/AuthoringGuard.ts:14-24` — ActorContext shape, verbatim:

```ts
export interface ActorContext {
  userId: string | null;
  isSystem: boolean;
  isLocalAdmin: boolean;
  /** Roles resolved for the actor (empty when no resolver is wired). */
  roles: string[];
}
```

The call site builds it in `checkAuthoringPolicy` (RecordHandlers.ts:351-368) and calls `roleResolver.rolesFor(user.userId)` **with no lifecycleId argument** (RecordHandlers.ts:360-363). By contrast the lifecycle-transition leg on update resolves **scoped**: `rolesFor(user.userId, nextLifecycleId)` (RecordHandlers.ts:1080-1083). `RoleResolver.rolesFor(userId, lifecycleId?)` (server/src/security/RoleResolver.ts:17-30) already supports lifecycle scoping: a grant with `lifecycleId` is excluded when the query names a different lifecycle (line 24); an unscoped grant is a superset that always matches (line 23-24, no early-continue when `grantLifecycle === undefined`).

**Consequence (the exact wrong-scope bug the task anticipated):** with today's unscoped call, Brad's `GRANT-DEMO-AUTHOR` (author, lifecycleId `document-controlled-signing` — verified on lane disk at `~/.computable-lab-lane1/worktrees/main/records/role-grant/GRANT-DEMO-AUTHOR__untitled.yaml`) would satisfy a bare `role: author` authoring requirement on instrument/equipment even though it is inert for registry-ops. The live gate's probe (1) is designed to catch precisely this.

### Q2 — AuthoringGuard is policy-bundle-BLIND (confirmed); no data-declared conditional exists for authoring blocks

`checkAuthoringPolicy` (RecordHandlers.ts:351-368) never consults `security.getPolicySettings` — the authoring legs (create: :612-615, update: :992-1005) fire the policy unconditionally. `getPolicySettings` IS wired on the same security bag (server.ts:780-782; declared at RecordHandlers.ts:47 returning `{ enforceTransitionRoles }` only) and resolves the LIVE bundle per call (`ctx.appConfig?.lab?.policyBundleId ?? ... ?? 'POL-SANDBOX'`). There is NO existing lint-DSL mechanism making an `authoring:` block policy-conditional: the record-rule `when:` predicate (types.ts:330) scopes record-content rules only, not the actor-side block, and lint DSL predicates all evaluate record payloads (types.ts:21-301) — no bundle predicate anywhere in `schema/**` (grep of all `*.lint.yaml` for bundle references: none).

### Q3 — The proven precedent: schema/identity/role-grant.lint.yaml (whole file, 31 lines)

The ONLY wired `authoring:` block on this trunk. Exact DSL shape (copy this shape; invent no fields):

```yaml
lintVersion: 1
schemaId: "https://computable-lab.com/schema/computable-lab/role-grant.schema.yaml"
rules: []
authoring:
  denyCode: GRANT_FORBIDDEN
  require:
    anyOf:
      - systemActor: true
      - localAdmin: true
      - role: admin
  guardWhenChanged:
    - roles
    - userId
  stampActorAs: grantedBy
```

Wiring is real on this trunk (OPS-1's "unwired" note is stale, corrected in the QMS8-A task note): server.ts:777 `getAuthoringPolicy: (schemaId) => ctx.lintEngine.authoringPolicyForSchema(schemaId)`; live probe 2026-10-20 (QMS8-A description): BRAD POST role-grant → 403 GRANT_FORBIDDEN, admin POST accepted with grantedBy auto-stamped.

### Q4 — Legal `require` forms and where the DSL is (and is NOT) validated

`AuthoringRequirement` (server/src/lint/types.ts:356-365): exactly four shapes — `{systemActor: true}`, `{localAdmin: true}`, `{role: <string>}`, `{userId: <string>}`. `AuthoringPolicy` (types.ts:371-380): `require.anyOf: AuthoringRequirement[]` (required), `denyCode?`, `guardWhenChanged?: string[]`, `stampActorAs?`. Semantics (AuthoringGuard.ts:30-46): one-of (OR), unknown shapes fail closed, empty anyOf fails closed.

Validator reality: `LintSpecLoader.ts` performs NO Ajv validation (grep: 0 ajv/validate hits) — it loads YAML, normalizes legacy rule predicates, and hands typed specs to LintEngine. `LintEngine.authoringPolicyForSchema` (LintEngine.ts:78-85) matches on `spec.schemaId === schemaId` (exact string equality — the new blocks' `schemaId` MUST exactly equal the instrument/equipment schema `$id`, verified present at the top of each schema file). `schemaId: undefined` would match EVERY kind — never ship that on these files.

### Q5 — registry-ops declares exactly `author` and `approver` (confirmed)

`schema/core/lifecycles/registry-ops.lifecycle.yaml`: `roles: [author (Activate), approver (Archive)]`, states draft(initial) → active → archived(terminal); transitions draft→active role `author`, [draft,active]→archived role `approver`. `schema/registry/registry-kinds.registry.yaml` covers `equipment` and `instrument` (lines 10, 14) under `lifecycleId: registry-ops`, `defaultState: draft`; create-time stamping runs at RecordHandlers.ts:671-700 via `getKindLifecycleCoverage()` (server.ts:789). Note the stamp runs AFTER the create-leg authoring gate (:612 vs :671), so at gate time the payload typically has NO lifecycleId — the scoping fix must not assume one (see required end-state 2c).

### Q6 — guardWhenChanged precedent: role-grant.lint.yaml only (:26-28)

Interpreter: `authoringGuardFiresOnUpdate` (AuthoringGuard.ts:53-66). Semantics that matter: **paths are TOP-LEVEL payload keys only** (`previousPayload?.[p]` — dotted paths silently never match); undeclared/empty ⇒ guard fires on EVERY update; comparison is `JSON.stringify` with null-fold. No other lint file uses it.

## The two decisions the task pre-framed

### D1 (task-mandated minimum, NOT a Brad question): per-lifecycle role scoping

The task rules: "if not [lifecycle-scoped], extending the actor context to resolve roles against the covered kind's lifecycle ... is the MINIMUM code change." Q1 confirmed it is needed. Spec (concrete, no new concepts — reuses RoleResolver's existing second parameter, exactly as the transition leg already does at :1082):

1. `AuthoringGuard.ts` — ActorContext UNCHANGED (roles is already just the resolver's answer). No change to `authoringPolicyPasses`.
2. `RecordHandlers.ts` `checkAuthoringPolicy` (:351-368): add a third parameter `lifecycleId?: string`; pass it to `rolesFor`: `await security.roleResolver.rolesFor(user.userId, lifecycleId)` (keep the `security?.roleResolver && user.userId` guard, keep `roles: []` fallback). exactOptionalPropertyTypes: pass the param through as `string | undefined` in the call position (rolesFor already declares `lifecycleId?: string` — fine), do NOT add optional props to object literals.
3. Create leg (:612-615): resolve the scope BEFORE the gate as
   `const declared = typeof payloadObject(request.body.payload).lifecycleId === 'string' ? (request.body.payload as ...).lifecycleId : undefined;`
   `const scope = declared ?? security?.getKindLifecycleCoverage?.()?.entryFor(String(payloadKind(request.body.payload) ?? ''))?.lifecycleId;`
   and pass `scope` in. Kind/lifecycle names stay data — coverage entry + payload only, zero literals. (An actor declaring a WRONG lifecycleId will hit LIFECYCLE_COVERAGE_MISMATCH 422 later at :680-685; the 403-before-422 ordering for a wrong-lifecycleId AND unauthorized actor is accepted.)
4. Update leg (:992-1005): scope = `payloadObject(request.body.payload).lifecycleId ?? payloadObject(existing.payload).lifecycleId` (mirrors the transition leg's nextPayload resolution at :1080).
5. Unit tests must prove: grant `author@document-controlled-signing` alone does NOT pass the equipment-create gate; grant `author@registry-ops` does; an UNSCOPED grant (no lifecycleId) DOES pass (RoleResolver.ts:23 superset semantics — do not "fix" that); role-grant's own gate passes/fails exactly as before (role-grant payload has no lifecycleId and role-grant is not coverage-covered ⇒ scope undefined ⇒ today's behavior, byte-identical).

### D2 (BRAD DECISION REQUIRED — recommend option B; task forbids picking silently)

Q2 confirmed the guard never sees the bundle. The task's no-regression clause ("the blocks must deny only when the policy demands it") plus verified-by (2) ("create friction returns [under POL-SANDBOX] per the chosen bundle semantics") make the two declared options:

- **Option A — authoring blocks always bite regardless of bundle.** Cheapest, but it BREAKS the POL-SANDBOX zero-friction promise (sandbox.policy-bundle.yaml:4 "Zero friction. All QMS checks allow.") and makes verified-by (2) a guaranteed failure. The task says Brad rules if this is chosen; we do NOT recommend it.
- **Option B (RECOMMENDED) — bundle-aware authoring predicate, data declares / code interprets.** Follows the exact `enforceTransitionRoles` precedent already living in this handler (:1084: bundle setting consulted at the guard site). Concretely, all optional fields (exactOptionalPropertyTypes-safe):
  1. `AuthoringPolicy` gains `gateOnPolicySetting?: string` (types.ts) — the name of a compiler policy setting; the gate fires only when that setting resolves to `'deny'` under the ACTIVE bundle. Undeclared ⇒ always fires (role-grant keeps its bundle-blind privilege-escalation behavior — REQUIRED, do not let a sandbox sleep the grant guard).
  2. `CompilerPolicySettings` (server/src/policy/types.ts) gains `authoringGate?: PolicyDisposition` with `authoringGate: 'allow'` in `DEFAULT_COMPILER_POLICY_SETTINGS` (near :129 where enforceTransitionRoles:'allow' sits). Optional key + default ⇒ zero ripple into existing object literals/tests.
  3. Bundles: `regulated.policy-bundle.yaml` and `tracked.policy-bundle.yaml` get `authoringGate: deny`; `sandbox.policy-bundle.yaml` and `notebook.policy-bundle.yaml` get `authoringGate: allow` (explicit for legibility).
  4. `AuthoringGuard.ts` gains one generic helper, e.g. `authoringGateActive(policy, settings): boolean` — reads `policy.gateOnPolicySetting` (absent ⇒ true active) and `settings[key] === 'deny'`. Zero domain literals; the key is supplied by YAML.
  5. `RecordHandlers.ts`: widen the security accessor type (:47) to `{ enforceTransitionRoles: PolicyDisposition; authoringGate?: PolicyDisposition }` (server.ts:780 already returns the full resolved settings — wiring-compatible as-is); in BOTH authoring legs, skip the gate when `!authoringGateActive(policy, security?.getPolicySettings?.())`. server.ts should need NO change — verify by typecheck, not assumption.
  6. Both new lint blocks declare `gateOnPolicySetting: authoringGate`.
- Option C (do not propose anew, recorded for completeness): a `whenPolicy` lint predicate inside `require.anyOf` — rejected: `require` entries are actor-side requirements evaluated by `actorSatisfiesRequirement`; folding a bundle check into OR-semantics changes the meaning (an admin passes even where the bundle doesn't gate; a non-admin is checked even when the bundle allows) — wrong shape.

**If the new disposition name or the per-block opt-in shape is wrong, that is Brad's call — coder STOPs and reports, does not improvise.**

## Required end-state

### 1. Data: schema/lab/instrument.lint.yaml (rewrite; today it is a 5-line stub, `rules: []`)

```yaml
# Authoring policy for Instrument records (QMS8-B, draft-gated authoring).
lintVersion: 1
schemaId: "https://computable-lab.com/schema/computable-lab/instrument.schema.yaml"
rules: []
authoring:
  denyCode: INSTRUMENT_AUTHORING_FORBIDDEN
  gateOnPolicySetting: authoringGate        # fires only when active bundle says deny
  require:
    anyOf:
      - systemActor: true
      - localAdmin: true
      - role: author
  guardWhenChanged:
    - name
    - domain
    - class
    - manufacturer
    - model
    - serial
    - equipmentRef
    - location
    - capabilities
```

### 2. Data: schema/lab/equipment.lint.yaml (NEW FILE — verified absent; equipment.lint.yaml does not exist on trunk)

Same shape; `denyCode: EQUIPMENT_AUTHORING_FORBIDDEN`; guardWhenChanged =
`name, equipmentClassRef, instrumentRef, manufacturer, model, serialNumber, assetTag, location, settings, executionBackends, readiness`.
Deliberately EXCLUDED from guardWhenChanged: `notes` (annotation ≠ re-authoring the spec of the record), `status`/`state`/`lifecycleId` (state changes are the lifecycle transition's own role check, enforced separately under enforceTransitionRoles; and `status` is retired by QMS8-C — do not name a field a later task deletes). The field lists are composer judgment; Brad may strike at review. Top-level keys verified against the two schema property lists (equipment.schema.yaml :19-109, instrument.schema.yaml :16-126).

Both `schemaId` strings copy verbatim from the schema `$id` headers (exact-match lookup, LintEngine.ts:80). No `stampActorAs` (task does not ask for it; records already carry createdBy).

### 3. Code (only what D1 + recommended D2 need)

- `server/src/lint/types.ts` — `gateOnPolicySetting?: string` on AuthoringPolicy.
- `server/src/lint/AuthoringGuard.ts` — generic `authoringGateActive` helper.
- `server/src/policy/types.ts` — `authoringGate?: PolicyDisposition` + default.
- `server/src/api/handlers/RecordHandlers.ts` — scoped rolesFor (D1) + gate-active check (D2B) in the two authoring legs (:612 create, :992 update). NO other handler changes.
- `schema/core/policy-bundles/*.policy-bundle.yaml` — one `authoringGate` line each.
- server.ts: expected ZERO changes (verify via typecheck; server.ts:780 already hands the full settings object).

### 4. Explicitly OUT of scope

- `schema/identity/role-grant.lint.yaml` — unchanged (behaviorally frozen by its suite; it must NOT gain gateOnPolicySetting).
- `schema/lint/lint-v1.schema.yaml` — do NOT model `authoring:` there (see reviewer bait #6).
- app/ frontend (QMS8-A owns the settings surface, in-progress at l1t1640 — do not touch its files).
- `lifecycleMiddleware.ts` status fallback, schema status removal (QMS8-C owns all of that).
- Extending the coverage set to person/training-record/etc. (task default: instrument+equipment only; Brad may name more at spec review — see OQ-2).
- Any edit to grant files on disk under `~/.computable-lab-lane1` (minting goes through the API).

### 5. Data (lane runtime, via API — NOT the code repo)

Mint `GRANT-BRAD-REGOPS` on :3092 as USR-QMS-ADMIN (holds `role: admin` via GRANT-QMS8-ADMIN — verified on lane disk; passes role-grant create gate through the unscoped `role: admin` check; the 2026-10-20 live probe already proved admin POSTs accepted with grantedBy stamped):

```
curl -s -X POST localhost:3092/api/records -H 'content-type: application/json' \
  -H 'x-user-id: USR-QMS-ADMIN' -d '{"schemaId":"https://computable-lab.com/schema/computable-lab/role-grant.schema.yaml","payload":{"kind":"role-grant","recordId":"GRANT-BRAD-REGOPS","userId":"USR-BRAD","roles":["author"],"lifecycleId":"registry-ops","notes":"QMS8-B draft-gated registry authoring: real (non-DEMO) author@registry-ops grant for USR-BRAD so the happy lap stays exercisable. Lane test data per A4."}}'
```

Readback MUST show `grantedBy: USR-QMS-ADMIN` (stampActorAs honesty — this is why it is minted, not hand-forged) and `lifecycleId: registry-ops`. Do NOT widen GRANT-DEMO-AUTHOR.

## RED-first test plan

New suite `server/src/api/handlers/RecordHandlers.instrumentAuthoring.test.ts`, built on the exact harness of `RecordHandlers.roleGrant.test.ts` (loads the REAL lint YAML from disk, :28-39 pattern; mock store; `getAuthoringPolicy` accessor returns the parsed blocks by schemaId). RED BEFORE code; the inversion commit says so. Cases:

1. **RED discriminator**: POL-REGULATED-equivalent settings (`authoringGate: 'deny'`), actor holds ONLY `author@document-controlled-signing` (the GRANT-DEMO-AUTHOR shape), POST instrument → 403 `INSTRUMENT_AUTHORING_FORBIDDEN`. Fails on current code (unscoped rolesFor passes it) — this single case is the per-lifecycle-scope proof.
2. Same actor, grant `author@registry-ops` (or unscoped grant — assert both) → passes, record created.
3. `authoringGate: 'allow'` (sandbox-equivalent) + no roles at all → no gate, create proceeds (bundle semantics).
4. localAdmin / systemActor pass under deny; random role fails; empty-payload no-op update never fires unless a guardWhenChanged key changed (AuthoringGuard.ts:60-64 semantics); changing `notes` only → gate does NOT fire; changing `name` → fires.
5. Mirror equipment cases on the equipment lint file (denyCode EQUIPMENT_AUTHORING_FORBIDDEN).
6. **role-grant regression**: with the real role-grant lint + `authoringGate: 'allow'` settings, non-admin create STILL 403s (block is bundle-independent — `gateOnPolicySetting` undeclared).
7. Lint-file contract tests: both files parse; `authoring.require.anyOf` matches the three declared shapes; schemaId equals the schema `$id`; guardWhenChanged entries are top-level property names of the respective schema.

## Verified by (mirrors the task block verbatim; every command from the worktree root; lane stack :3092/:5192; NEVER touch :3001/:5174)

First targeted check (run this EARLY, before polishing anything): after writing the two lint files + restart (`bash ~/.hermes/cl/lanes/1/cl-lane-stack.sh 1 restart` — tsx --watch does NOT reload YAML), switch the bundle and probe:

```
curl -s -X PATCH localhost:3092/api/config -H 'content-type: application/json' -H 'x-user-id: USR-QMS-ADMIN' -d '{"lab":{"policyBundleId":"POL-REGULATED"}}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3092/api/records -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' -d '<equipment payload copied from an existing lane EQP-* record, new id EQP-QMS8B-PROBE1, status kept (schema still requires it — QMS8-C retires it later)>'
# expect 403 AND body error == EQUIPMENT_AUTHORING_FORBIDDEN — BEFORE the scope fix this returns 200 (GRANT-DEMO-AUTHOR leaks through). Seeing that 200 first is the live RED.
```

(1) **Live RED→GREEN on :3092 under POL-REGULATED**: BRAD (holding only GRANT-DEMO-AUTHOR) POST equipment draft → **403 + EQUIPMENT_AUTHORING_FORBIDDEN**; instrument likewise; mint GRANT-BRAD-REGOPS (above); POST `EQP-QMS8B-PROBE2` → **200, payload.state == "draft"** (coverage stamp). (2) **POL-SANDBOX returns friction**: as admin via the wired selector PATCH `{"lab":{"policyBundleId":"POL-SANDBOX"}}` (configHandlers gates + audits this route, :351+; admin = USR-QMS-ADMIN) → BRAD create friction-free with ZERO new grants. NOTE: under the task's chosen Option B this is the expected semantics; if the review keeps Option A, this row changes and only Brad may sign it. (3) **Existing suites green UNCHANGED**:
`pnpm --filter server exec vitest run src/governance/governanceStrictness.test.ts src/governance/denialMessageBoundary.test.ts src/lifecycle/denialMessage.test.ts src/api/handlers/RecordHandlers.roleGrant.test.ts src/governance/registryOpsLifecycle.test.ts src/api/handlers/RecordHandlers.instrumentAuthoring.test.ts`
(4) **Zero-friction beyond the role check**: the author-role-holder 200 in (1) carries no approval/signature demand — response is a plain create; deny message names only the role gap, no invented steps. Typecheck: pin the baseline at claim time (`npm run typecheck -w server 2>&1 | grep -c 'error TS'` and save the error SET), require **delta-zero new errors** (server has pre-existing baseline errors; app/tsconfig has no exactOptionalPropertyTypes but server/tsconfig.json:13 does). Housekeeping at handoff time: restore POL-SANDBOX and report it; all probe records/grant are lane TEST DATA (A4).

## Worker contract

- Worktree `/mnt/vast/home/brad/git/wt/QMS8-B-lane1-l1t<claim>`, branch `cl/lane1-qms8b-l1t<claim>` off `cl/integration-1` HEAD at claim time (≥ 7eb72222). All git via `-c core.fileMode=false`.
- Deliverable paths unique per run: report `~/.hermes/cl/lanes/1/qms8b-report-l1t<claim>.md`; commit message starts `feat(qms8b): draft-gated registry authoring (RED-first inversion of ...)`.
- QMS8-A is LIVE in flight (settings/permissions surface) — if trunk moves under you, rebase only your files; do not reconcile their files.
- Fleet rule: one live coder; YAML edits ⇒ restart the lane stack before ANY live probe.

## Boundaries / stop rules (return requires-architect / Brad, do not absorb)

- Any pressure to make the grant guard (role-grant) bundle-conditional, or to add a global "authoring off" switch that sleeps it — privilege-escalation regression, STOP.
- Coverage widening (person/training-record/...) beyond what Brad names — STOP.
- The scoped-roles change making role-grant's own gate behave differently — STOP (it must be byte-identical).
- A live probe contradicts this spec's predictions — report first-hand evidence, do not paper over.
- Lint DSL: `guardWhenChanged` dotted paths don't work (top-level keys only, AuthoringGuard.ts:60-64); `schemaId` mismatch ⇒ silent no-gate; do not "fix" by loosening LintEngine.

## Reviewer bait (the likely edge errors for THIS item — pre-empt them)

1. **exactOptionalPropertyTypes (server/tsconfig.json:13)**: new members are all optional (`gateOnPolicySetting?`, `authoringGate?`, `lifecycleId?` param). Do not construct ActorContext/settings literals with explicit `undefined` values.
2. **YAML-reload trap**: tsx --watch does NOT reload lint/policy-bundle YAML — every live probe table row above requires a stack restart first, and the bundle switch is read live only through `getPolicySettings`' per-call resolution (server.ts:779-783).
3. **The demo-grant leak**: any test that "passes" with an author@document-controlled-signing grant under registry-ops scope is a FALSE green — that is the core defect. Also assert the unscoped-grant-superset case still passes (RoleResolver.ts:23 — superset semantics are intentional, per the file's header comment).
4. **Hardcode boundary (principles §9, :63-73)**: zero kind/lifecycle/role literals in TS — scoping flows from payload + coverage entry only; `authoringGateActive` reads a YAML-named key. A reviewer should be able to rip the two lint files and see the gates vanish, and rip `authoringGate` from the bundles and see friction vanish.
5. **First-file match**: `authoringPolicyForSchema` returns the FIRST spec whose schemaId matches (LintEngine.ts:79-83) — do not add a second lint file for the same schemaId.
6. **lint-v1 meta-schema trap**: lint-v1.schema.yaml has `additionalProperties: false` (:394) and does NOT model `authoring:` — an all-files Ajv validation would flag even the shipped role-grant file. Existing suites validate a `{lintVersion, rules}` PROJECTION only (Wave2ConstraintVocabularyRules.test.ts:190-198, ProtocolLintRules precedent). Do NOT add whole-file meta-schema validation and do NOT extend lint-v1 unless Brad orders it (recorded as OQ-4 housekeeping).
7. **Denial body shape**: authoring denials return `{error: <denyCode>, message}` at 403 (RecordHandlers.ts:365-367, :1004) — assert on `error`, not on a `code` field (rejections in this codebase have no code field — wave-2 env fact).
8. **403-before-422**: the create gate runs before coverage stamping/mismatch checks and before validation — probe payloads with a wrong lifecycleId will 403 first when unauthorized; don't chase this as a defect.
9. **Bundle restore discipline**: leaving the lane on POL-REGULATED poisons every later gate run; the handoff must show POL-SANDBOX restored (GET /api/config).

## Unresolved questions (Brad-gated)

- **OQ-1 — D2 option (DECISION REQUIRED by the task itself).** Recommendation: Option B (per-block `gateOnPolicySetting: authoringGate`, new bundle disposition, sandbox/notebook allow / regulated+tracked deny), rationale above. The task forbids silently choosing Option A ("Brad ruling needed at spec time if the latter — STOP AND REPORT"). What I checked: AuthoringGuard/RecordHandlers are bundle-blind (Q2), sandbox bundle declares level-0 zero friction, `enforceTransitionRoles` precedent at RecordHandlers.ts:1084 + server.ts:780 wiring.
- **OQ-2 — Kind coverage.** Task default is instrument+equipment; the coverage file also lists person, equipment-class, training-record, competency-authorization, calibration-record under registry-ops. Authoring gates on those are "Brad's call, default: instrument+equipment only this task" — confirm the default stands (mechanism makes widening a YAML-only change per kind thereafter). What I checked: registry-kinds.registry.yaml:8-14, task block files-note.
- **OQ-3 — guardWhenChanged field lists** (spec'd per-kind above from the schema property lists; `notes` excluded, `status` excluded because QMS8-C retires it). Strike or adjust at review; the mechanism is agnostic.
- **OQ-4 — (housekeeping, not blocking)** model `authoring:` in lint-v1.schema.yaml in a future item so the actor-side DSL is schema-validated like record rules; deliberately out of this task to keep role-grant's green suite and the Ajv-projection precedent untouched.

Files in scope (final list): schema/lab/instrument.lint.yaml; schema/lab/equipment.lint.yaml (new); schema/core/policy-bundles/{regulated,tracked,sandbox,notebook}.policy-bundle.yaml; server/src/lint/{types.ts,AuthoringGuard.ts}; server/src/policy/types.ts; server/src/api/handlers/RecordHandlers.ts (two legs + accessor type only); server/src/api/handlers/RecordHandlers.instrumentAuthoring.test.ts (new); lane data via API: GRANT-BRAD-REGOPS + probe records (test data, A4).

STATUS: draft-complete
