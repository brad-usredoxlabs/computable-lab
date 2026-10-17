# SPEC (DRAFT l1t1930) — OWN-10: AI tools `ownership_policy_get` / `ownership_policy_update` (dual-registered)

Campaign: lab-ownership-and-sharing-policy, wave 3. Canonical plan §T10:
`.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md` (§T10, lines 1249-1363).
Task: OWN-10, lane 1 task-list. Deps: OWN-9 — **MERGED** (trunk 3c27e218).

BASE: trunk `cl/integration-1` @ **3c27e218**. Every path:line below was re-anchored by the
composer at this SHA (worktree `/mnt/vast/home/brad/git/cl-integration-1`, read-only). The §T10
code snippets in the plan are the design intent, **not drop-in code** — they contain two known
defects (DEV-3 validate shape, seed-trap) called out below; the OWN-9 handler is the corrected
word of record for both.

## Goal (one sentence)

Give the AI two dual-registered MCP tools — `ownership_policy_get` (read the resolved lab
ownership & sharing policy document) and `ownership_policy_update` (validate-first,
read-modify-write of `labOwnerUserId` / `fallback` / `kindRules` onto the CURRENT payload, with
the model told to confirm with the user before writing and the user's `reason` recorded in the
commit message) — reusing the existing `dualRegister` + `ToolRegistry` machinery with zero new
tooling and zero new identity paths.

## Files IN scope (exactly these three paths; a 4th file = reject)

1. NEW `server/src/mcp/tools/ownershipPolicyTools.ts` — `registerOwnershipPolicyTools(server, ctx, registry?)`,
   two `dualRegister` calls per §T10 (adapted per the corrections below).
2. NEW `server/src/mcp/tools/OwnershipPolicyTools.test.ts` — MaterialsAiTools.test.ts harness pattern.
3. EDIT `server/src/mcp/tools/index.ts` — import + call `registerOwnershipPolicyTools(server, ctx, registry)`
   **immediately after `registerRecordTools`** (anchor: `index.ts:42`, the `registerRecordTools(server, ctx, registry);`
   line inside `registerAllTools`, function spans :41-78 at 3c27e218).

## Explicitly OUT of scope

- **`server.ts`: NO EDITS.** The task-list `files:` line lists it "(AppContext)" but that work
  already shipped with OWN-7/OWN-9: `AppContext.ownershipPolicyService` is declared at
  `server/src/server.ts:261` (with OWN-9's merge-resolved doc comment), the single
  `new OwnershipPolicyService(store)` construction is at `:501` (reused by `AuthorizationService`
  at `:502`), and it is exposed on the ctx at `:645`. The MCP path gets ctx whole via
  `McpServerFactory.ts:34` (`registerAllTools(server, ctx, toolRegistry)`). Verified: the only
  server.ts changes needed would be duplicates — do NOT construct a second service (exactly-1
  construction is an OWN-9 adversarial gate that still holds).
- `routes.ts`, `OwnershipPolicyHandlers.ts` (OWN-9 shipped: GET/PUT `/settings/ownership-policy`
  registered at `routes.ts:602-603`).
- `schema/identity/ownership-policy.*.yaml` (T1 shipped), the seed record, app/ (OWN-11/OWN-12's),
  anything in `src/security/` (read-only reuse), `materialsAiTools.ts` (reference only).
- No knowledge-layer involvement: this item does not touch claim/context/context-role/assertion/
  evidence/mechanism-model, so `docs/knowledge-layer-canonical-example.md` is NOT binding here
  (checked the item's surface: it is identity-kind policy tooling).

## Acceptance criteria (verbatim from the task list)

> verified by: OwnershipPolicyTools.test.ts green; acceptance 7 of the aggregate list; the tool
> refuses an invalid kindRules payload naming what failed.

And the task description, verbatim-relevant parts:

> New server/src/mcp/tools/ownershipPolicyTools.ts per §T10: dualRegister get + update; update
> replaces labOwnerUserId/fallback/kindRules onto the current payload, validates first, records
> `reason` in the commit message, and tells the model to confirm with the user before writing.
> ACTOR RULE: read materialsAiTools.ts for how the existing write-capable tool obtains the actor
> and gate the write through that SAME path (admin on the document, D7); if no actor is reachable
> in the tool context, the admin check stays at the API layer — do NOT invent an identity path.
> Register in mcp/tools/index.ts after registerRecordTools. Test on the MaterialsAiTools.test.ts
> harness (initializeApp + ToolRegistry): read returns the resolved doc; malformed update refused.

## The ACTOR RULE — recon result, decided (this is the item's one real design question, now closed)

Read `server/src/mcp/tools/materialsAiTools.ts` at 3c27e218. Verdict: **no session actor exists
anywhere in the tool context.** Specifically:

- `material_compile_intent` — the only write-adjacent materials tool — takes `actor` as an
  **optional free-text argument** (`materialsAiTools.ts:76`, passed through at `:156`) used only
  as provenance metadata (`provenance.actor`, asserted in `MaterialsAiTools.test.ts:94`). It is a
  label the MODEL supplies, not an authenticated identity — never fed to `canAccess`.
- No file under `server/src/mcp/` references `resolveRequestUser`, `x-user-id`,
  `authorizationService`, or any session user (composer grepped all of `server/src/mcp` at
  3c27e218 — zero hits). `ToolRegistry` handlers receive only `args`
  (`server/src/ai/ToolRegistry.ts:17-24`), and `dualRegister`'s registry wrapper even passes
  `{} as never` as the MCP callback's second parameter (`server/src/mcp/tools/dualRegister.ts:41`).
- The existing write-capable precedent, `record_update` (`server/src/mcp/tools/recordTools.ts:91-127`),
  writes through `ctx.store.update` with NO ACL check at tool level.

Therefore, per the plan's own instruction and the orchestrator's brief: **the D7 admin gate stays
at the API layer.** `PUT /settings/ownership-policy` (`OwnershipPolicyHandlers.ts:90-110`)
enforces it for humans/UI: DEV-2 credential gate (`:55-70`, `:97-105` fail-closed before
canAccess), then D7 `authorizationService.canAccess(userId, 'admin', record)` (`:107`,
AuthorizationService.ts:102), then DEV-3 envelope validate (`:113-117`). The tools follow the
`recordTools` precedent (store-level write, same `store.update` the handler calls) and the plan's
§T10 mitigation: the update tool's **description tells the model to describe the change to the
user and get confirmation before calling** (§T10 wording, plan line 1300), and `reason` is
recorded in the commit message for git-level attribution.

HARD CONSTRAINT for the coder and the reviewer: do NOT import `AuthorizationService`,
`LocalIdentityService`, or `FastifyRequest` into `ownershipPolicyTools.ts`, do NOT add an
`actor`/`userId` zod arg and pretend it is auth, do NOT call `resolveRequestUser`. Any identity
machinery appearing in the tool file is a reject — the tool context has no credential to gate on,
and inventing one is forbidden by the plan verbatim (plan line 1337: "Do not invent an identity
path").

## Implementation requirements for `ownershipPolicyTools.ts`

Follow §T10 (plan lines 1253-1331) with these THREE corrections, each load-bearing:

1. **DEV-3 validate shape (MANDATORY).** §T10's snippet calls
   `store.validate({ schemaId, payload })` — that does not compile: `RecordStore.validate` takes a
   full `RecordEnvelope` (`server/src/store/types.ts:155`, recordId required). Use the OWN-9
   corrected shape (`OwnershipPolicyHandlers.ts:113-117`):
   `store.validate({ recordId: current.recordId, schemaId: OWNERSHIP_POLICY_SCHEMA_ID, payload })`.
2. **resolveDocument must mirror the handler's load-bearing by-id fallback.**
   `activeLabPolicy()` lists by kind (`OwnershipPolicyService.ts:135-141`) and is **blind to the
   seed-dir copy** of OWN-LAB-DEFAULT at boot (the seed lives under `records/seed/identity/`,
   list-merge reads `seedDir/<kind>/` per `RecordStoreImpl.ts:437-441`) while get-by-id finds it
   (`RecordStoreImpl.ts:244-246` → `getSeedRecord`) — AS-ORCH-L1-042, orch runtime-proved. Both
   tools must resolve: `const doc = await ctx.ownershipPolicyService.activeLabPolicy();
   const record = doc ? await ctx.store.get(doc.recordId) : await ctx.store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);`
   and the GET tool returns `jsonResult({ record, resolved: doc ?? coerceOwnershipPolicy(record) })`
   (DEV-1 shape, `OwnershipPolicyHandlers.ts:85`), errorResult only when BOTH are null. Import
   `coerceOwnershipPolicy` too.
3. **The seed-record write trap (this is what makes the test design mandatory).**
   `store.update` fails with `Record not found` for a seed-only record
   (`RecordStoreImpl.ts:638-644`: `findRecordPath` scans the repo only; the seed copy is a
   separate read path). So on a boot-fresh store the update tool will (correctly) refuse with a
   clean `errorResult('No ownership-policy document installed; create OWN-LAB-DEFAULT first.')`
   when `store.get` returned only a seed envelope and update comes back `success:false` — surface
   `result.error` honestly; never report `success:true` on a failed update. The test must
   `store.create` the document into the tmp records dir first (§T10's test does exactly this,
   plan line 1344).

Update semantics (non-negotiable, from the task description): **read-modify-write, not blind
replace** — spread the current payload, then overwrite exactly `labOwnerUserId`, `fallback`,
`kindRules` from args (`fallback`/`kindRules` themselves are full replacements per §T10). Validate
FIRST; invalid → `errorResult` naming what failed (`Invalid policy: ${JSON.stringify(validation.errors)}`
carries the JSON-Schema instancePaths — the acceptance "naming what failed" is met by including
`validation.errors`, assert on it in the test). Then `store.update({ envelope: { ...current, payload },
message })` with `message = args.reason ? \`Update ownership-policy: ${args.reason}\` : 'Update ownership-policy'`
(plan line 1322; `UpdateRecordOptions.message` is the git commit message,
`server/src/store/types.ts:79-80`, applied at `RecordStoreImpl.ts:719-724`). Return
`jsonResult({ success: result.success, record: result.envelope ?? await ctx.store.get(current.recordId), validation: result.validation })`.

Zod shapes per §T10 verbatim (KindRuleSchema with `kind/owner/visibility/filedTo/editRoles/shareTargets`
required + optional `publishRole`; update takes `kindRules` array, `fallback` =
`KindRuleSchema.omit({ kind: true })`, `labOwnerUserId`, optional `reason`). Descriptions per §T10
verbatim — including get's "Call this before proposing a change." and update's "Requires admin on
the document. Describe the change to the user and get confirmation before calling this." zod is v4
(`server/package.json:62`, `^4.3.6`) — `z.toJSONSchema` via dualRegister is v4-native, fine.

No hardcoded policy values, no kind strings, no user ids in the tool file — the only constants are
the imported `DEFAULT_OWNERSHIP_POLICY_RECORD_ID` / `OWNERSHIP_POLICY_SCHEMA_ID`
(`OwnershipPolicyService.ts:13-15`) (D7/D9 hardcode boundary; OWN-9 reviewer enforced the same).

## Test requirements — `server/src/mcp/tools/OwnershipPolicyTools.test.ts`

Harness: copy `MaterialsAiTools.test.ts:11-45` — `initializeApp(repoRoot, { recordsDir:
'tmp/ownership-policy-tools-test/records', logLevel: 'silent' })`, `new ToolRegistry()`,
`registerOwnershipPolicyTools(new McpServer({ name: 'test-ownership-policy', version: '1.0.0' }), ctx, registry)`,
`afterAll` rm -rf the tmp dir. **Not** MemoryRecordStore (its `validate` is an always-valid stub —
OWN-9 reviewer bait; the real RecordStoreImpl gives real Ajv validation for free here).

Required cases (§T10 test, plan lines 1343-1355):

1. **READ**: `store.create` a minimal-but-valid OWN-LAB-DEFAULT envelope (schemaId
   `OWNERSHIP_POLICY_SCHEMA_ID`, payload valid against the T1 schema — required: kind, recordId,
   title, scope{type:'lab',id:'lab'}, labOwnerUserId, fallback; include a `local-protocol`
   kindRule with `filedTo: 'active-project'` mirroring
   `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml`). Call
   `registry.get('ownership_policy_get')!.handler({})`; parse the text content; assert
   `resolved.kindRules['local-protocol'].filedTo === 'active-project'` (resolved IS the coerced
   doc: `kindRules` is a keyed map, `OwnershipPolicyService.ts:115-120` — NOT the array form).
2. **MALFORMED REFUSED, NAMING WHAT FAILED**: `update.handler({ kindRules: [{ kind: 'protocol' }],
   fallback: { owner:'creator', visibility:'private', filedTo:'none', editRoles:[], shareTargets:[] },
   labOwnerUserId:'USR-LOCAL-ADMIN' })` — the kindRules entry lacks all five required KindRule
   fields. Assert the result text matches `/Invalid policy/` AND names the failing path (assert
   `/kindRules/` appears in the text — validation.errors carries instancePaths). Also assert the
   document on disk did NOT change (`store.get('OWN-LAB-DEFAULT')` payload still has
   `local-protocol`). **Why this is non-vacuous: the ToolRegistry path bypasses zod entirely** —
   `dualRegister.ts:39-43` calls the handler with raw args, no zod parse — so the refusal must
   come from the handler's validate-first step, which is exactly what the test proves. A zod-only
   guard would let this through.
3. **HAPPY WRITE + reason + no-blind-replace** (recommended, cheap, strong): valid update that
   adds a `material` rule; assert `success:true`, then re-read via `ownership_policy_get` and
   assert the new rule is present AND a field NOT named by the update (e.g. the existing
   `title`/`description`/`scope`) survived — proving the read-modify-write spread over a blind
   replace (mutation probe: dropping the `...current.payload` spread must flip this RED). `reason`
   rides `message` — verifiable by reading `message` construction in source (asserting the git
   commit text through the embedded repo is out of scope for the unit test).

RED-FIRST: commit the test file FIRST, before `ownershipPolicyTools.ts` exists. The import will
fail to resolve — that is a STRUCTURAL RED (suite fails to collect, `Failed to load
./ownershipPolicyTools.js`); say so verbatim in the RED commit message (`test(mcp): RED —
ownership-policy AI tool contract (§T10) — structural RED: module absent`), following the OWN-13
structural-RED precedent in this lane. Then implement → green → commit
`feat(mcp): AI tools to read and edit the ownership policy` (plan line 1363).

## First targeted check (run THIS before writing anything else)

From the repo root of your worktree, after committing the structural-RED test:

```bash
npm run test:run -w server -- src/mcp/tools/OwnershipPolicyTools.test.ts 2>&1 | tail -15
```

Expected: FAIL with `Failed to load ./ownershipPolicyTools.js` (structural RED — proves the
harness, the file path, and vitest pickup all line up). If instead it passes, your test is
vacuous. If it errors on `initializeApp` itself, stop — harness assumption broken.

## Full verification commands (with expected output)

```bash
# 1. The new suite — expected: 3 passed | 0 failed (or 2 if you skip case 3; do not skip)
npm run test:run -w server -- src/mcp/tools/OwnershipPolicyTools.test.ts

# 2. Tool-surface regression — expected: no NEW failures vs base
npm run test:run -w server -- src/mcp/tools

# 3. Zero-NEW done gate, server typecheck — expected: prints exactly 45
#    (composer re-counted 45 first-hand at 3c27e218; OWN-9 merge notes "tsc 45 = baseline")
cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"

# 4. Security done-gate — expected: Test Files 6 passed, Tests 41 passed
#    (composer re-ran both commands above at 3c27e218: 45 and 41/41)
cd server && npx vitest run src/security

# 5. app workspace untouched — baseline 31 preserved by construction (no app/ files in scope);
#    sanity: git diff --name-only against base shows ONLY the 3 in-scope files
git -c core.fileMode=false diff --name-only 3c27e218
```

`exactOptionalPropertyTypes` is ON (`server/tsconfig.json:13`) — every optional field needs the
conditional-spread house style (`...(args.reason !== undefined ? { message: ... } : {})` or the
ternary-to-string form above; never assign `undefined` to an optional property). OWN-9 shipped
both patterns — copy them.

## Worker contract

- Branch off trunk: `wt/OWN-10-lane1-l1t<dispatch-ts>` (lane precedent:
  `wt/OWN-9-lane1-l1t1255`, `wt/OWN-8-lane1-l1t1150`), base `cl/integration-1` @ 3c27e218+.
- Worktree: the lane fleet-lock protocol applies (`/home/brad/.hermes/cl/appliance2-coder.pid`).
- Deliverable/report path pattern: `~/.hermes/cl/lanes/1/own10-report-l1t<dispatch-ts>.md`;
  end-marker line `OWN10 CODER DONE <sha>`.
- Stage EXACTLY the three in-scope files (never `git add -A`); never touch :3001/:5174; TS-only
  diff → no lane-stack restart needed (the YAML-reload trap applies only if you re-verify live
  against :3092 — this item ships no YAML).

## Reviewer bait (expected adversarial focus, pre-empted here)

1. **Identity invention** — any `canAccess`/`resolveRequestUser`/`userId`-arg in the tool file
   contradicts the ACTOR RULE recon above; the correct answer is documented in the file header
   comment (gate lives at `OwnershipPolicyHandlers.ts:90-110`; tool surface mirrors
   `recordTools.ts:91-127` precedent). Reviewer should ALSO check the opposite: that the update
   description really does carry the confirm-with-user sentence (plan line 1300) and `reason`
   really reaches `message`.
2. **Blind replace** — mutation probe: delete the `...current.payload` spread, happy-write case 3
   must go RED (title/description loss).
3. **The §T10 validate snippet does not compile** (DEV-3) — a coder pasting plan text verbatim
   adds a tsc error; baseline must stay 45. Envelope form is mandatory.
4. **Seed-trap** — a test that relies on the boot seed being writable is broken; the test must
   `store.create` first (MaterialsAiTools.test.ts:25-37 pattern), and the tool must return a clean
   errorResult (not a crash, not a false success) when update reports `success:false` on a
   seed-only store.
5. **Registry path bypasses zod** (`dualRegister.ts:41`) — the malformed-update refusal must come
   from `store.validate`, not from zod; check the test would still fail if the validate-first block
   were deleted (non-vacuity mutation probe).
6. **Second OwnershipPolicyService construction** — forbidden; `ctx.ownershipPolicyService` only
   (server.ts:501 is the exactly-1 site). Any server.ts diff in this item's branch is itself a
   finding.
7. **No hardcoded policy/kind/user values** in the tool module; imports from
   `OwnershipPolicyService.ts` only. `USR-LOCAL-ADMIN` may appear ONLY as test data.
8. **exactOptionalPropertyTypes sites** — optional `reason`, optional `publishRole`, `result.validation`
   spread: conditional-spread house style or new error-TS sites appear (baseline parity check #3).
9. **YAML-reload trap** — N/A for shipping (TS-only), but if the coder smoke-tests through the
   live lane MCP surface they must restart `cl-lane-stack.sh 1` first and target :3092 only.

## Open questions (composer could not close locally; ≤3)

- **OQ1 — project-scope documents are not AI-addressable.** The T1 schema allows
  `scope.type: project` docs (`ownership-policy.schema.yaml`), but both tools only resolve the
  active LAB doc (via `activeLabPolicy()`/by-id), exactly as §T10 specifies. If a project-override
  doc ever exists, the tool silently ignores it. Checked: §T10 intent, `activeLabPolicy`
  (OwnershipPolicyService.ts:135-141), OWN-9 handler scope. Default taken: ship lab-only per plan;
  flag for architect only if project overrides arrive.
- **OQ2 — tool-write vs D7 wording.** The task text says "gate the write ... (admin on the
  document, D7)" but its own fallback clause then says the gate stays at the API layer when no
  actor is reachable — and the recon shows NO actor is reachable in any MCP tool context. This
  spec takes the fallback branch (documented above with evidence). If the orchestrator instead
  wants the tool to route writes THROUGH the HTTP handler (e.g. via an injected `putOwnershipPolicy`
  callable), that is a contract change to §T10 and needs an adjudication — checked:
  materialsAiTools.ts, recordTools.ts, dualRegister.ts, ToolRegistry.ts, AgentOrchestrator.ts
  (no userId anywhere in the AI loop; provenance actor is the literal `'ai-agent'`,
  AgentOrchestrator.ts:530).
- **OQ3 — `resolved` shape for a malformed installed doc.** If the stored record is corrupt,
  `coerceOwnershipPolicy` returns null and get returns `{ record, resolved: null }` (DEV-1 shape
  carried over) rather than an error. Matches OWN-9 GET semantics; flagged so the reviewer doesn't
  class it as a silent-failure defect — checked OwnershipPolicyHandlers.ts:77-85.

## Recon provenance

Scout was NOT used for this spec: every load-bearing fact (AppContext field, registration
anchors, validate signature, seed write-path, tool-actor absence, baselines 45/41-41) was
verified by the composer first-hand at 3c27e218 via read_file/grep/tsc/vitest runs in the lane
worktree (read-only ops + tmp test dirs only; nothing under git was modified; baselines re-measured
2026-10-11 ~19:56 EDT: `npx tsc --noEmit | grep -c 'error TS'` → 45; `npx vitest run src/security`
→ 6 files / 41 tests passed).
