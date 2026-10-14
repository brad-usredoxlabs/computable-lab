# SPEC DRAFT — OWN-4: Schema contract test for ownership-policy (TDD anchor for the seed)
Lane 1 · wave-3 lab-ownership-and-sharing-policy · composed 2026-10-11T0330 by cl-spec-composer (l1t0330)
Status: DRAFT — orchestrator review/promotion required; NOT canonical, NOT dispatchable as-is.
Anchors grounded first-hand at trunk cl/integration-1 @ a6e3c4c02b97080195e7cae9d21d3024f23dfbe5 (a6e3c4c0).
Plan of record: .hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md §T4 (+§T1,§T3,§T2,
D1-D13). Plan is word of record; where this spec CORRECTS a plan code-sketch detail, it does so with
first-hand probe evidence cited inline — the orchestrator ratifies at promotion.

## Goal (one sentence)
Pin the OWN-1 schema trio and the OWN-3 seed with a real-pipeline contract test —
SchemaLoader -> SchemaRegistry -> AjvValidator (plus the real LintEngine for the unsafe-fallback
rule) — so every later wave task can trust the fixture.

## Item + task-list `why` (verbatim)
"The seed is the authority that later stamping reads; pinning it by test now means every later
wave task can trust the fixture." (task-list.md ~:2561, OWN-4 at ~:2548)

## Dependencies — HARD GATE, worker re-verifies at dispatch
deps: [OWN-1, OWN-3]. At spec-composition time (a6e3c4c0) NEITHER has landed:
`git -c core.fileMode=false ls-files | grep ownership-policy` -> empty;
`ls records/seed/` has NO `identity/` dir. OWN-1 was coder-in-flight at the 0330 handoff
(checkpoint: "OWN-1 coder (lock PID 2095575). On exit: ... -> MERGE"), OWN-2/OWN-3 follow.
FIRST CHECK below is therefore a BLOCK-gate: if `schema/identity/ownership-policy.schema.yaml`
or `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml` is absent at the
worker's base commit, STOP with `BLOCKED gate — OWN-1/OWN-3 not at base <sha>` and the listing
as evidence. Do NOT author the schema or the seed yourself; they are other items' files.

## Files
IN scope (new only): `server/src/schema/OwnershipPolicySchema.test.ts`
OUT of scope (do not touch): schema/identity/*.yaml trio (OWN-1), schema/core/record.schema.yaml
(OWN-2), records/seed/** (OWN-3), server.ts, any app/ file, any existing test.
Exception flag (see Watch-item W1): if the merged OWN-1 schema carries the plan-style
`../core/common.schema.yaml` ref, this test CANNOT pass — that is an OWN-1 file. Per W1 the
worker BLOCKS (or applies a orchestrator-ratified one-line fix if the promotion text says so);
by default: BLOCK, do not edit OWN-1 files.

## Lane-verified anchors (composer verified first-hand at a6e3c4c0 unless marked)
Harness references:
- `server/src/schema/AgentActionSchema.test.ts:17-32` — the content-map load pattern the plan
  points at (replayed end-to-end by composer probe: `addSchema(entry.schema, entry.id)` under
  strict:false validates cleanly).
- `server/src/schema/DerivationSeedRecords.test.ts:19-22` — repoRoot idiom
  `resolve(__dirname, '..', '..', '..', 'schema'/'records' ...)`. THIS is the correct route to
  `records/seed/...` — vitest cwd is `server/` (server/package.json:13 `test:run: vitest run`),
  there is NO `server/records/` dir (verified), and `server/schema` is a symlink to repo `schema/`
  (verified via ls -la server/) which is why the plan sketch's `join(process.cwd(),'schema')`
  works for schemas but its `join(process.cwd(), SEED_PATH)` would NOT work for the seed.
  Use repoRoot for BOTH (the symlink makes cwd-'schema' still work; repoRoot is drift-proof).
- `DerivationSeedRecords.test.ts:71-74` verbatim precedent: "Strip $schema before validation —
  RecordParser strips it at line 113 before building the envelope, so the schema
  (additionalProperties: false) never sees it."
Real APIs (the plan sketch's are wrong — corrections with evidence):
- `server/src/schema/SchemaRegistry.ts:124 addSchema(entry)`, `:178 addSchemas(entries)`,
  `:362 createSchemaRegistry()`. There is NO `addAll` — the plan §T4 sketch's
  `registry.addAll(loaded.entries)` does not compile. Use `addSchemas`.
- `server/src/validation/AjvValidator.ts:179 validate(data, schemaId)` — POSITIONAL args. The
  plan sketch's `validator.validate({ schemaId, payload })` does not compile. `createValidator`
  takes `ValidatorOptions`, not a registry (`:304`). House test pattern:
  `createValidator({ strict: false })` then per-entry `validator.addSchema(entry.schema, entry.id)`
  (AgentActionSchema.test.ts:43-44; DerivationSeedRecords uses
  `registry.getTopologicalOrder()` to add dependencies-first — use that, it's the server.ts:370-375
  runtime order).
- Lint does NOT live in the validator: AjvValidator.validate is pure Ajv (:179-202), and
  `src/validation/` (AjvValidator*, closestMatch, IdShape tests) never touches lint. So the plan's
  "rejects an unsafe fallback" assertion cannot be a schema assertion — composer probe: a doc
  with `fallback.owner: 'lab'`, `visibility: 'public'` VALIDATES fine (schema-shape is legal;
  the ERROR-severity lint rule owns the semantic). Real, non-fake lint coverage exists:
  `server/src/lint/LintSpecLoader.ts:255 loadAllLintSpecs({basePath})` (recursive `*.lint.yaml`),
  `server/src/lint/LintEngine.ts:54 addSpec(name, spec)` (spec-level schemaId stamped onto rules,
  `:118 getRules(schemaId)`, `:231 lint(data, schemaId)`; ops `equals`/`nonEmpty` supported —
  PredicateEvaluator.ts :57,:71). Harness precedent: LintEngine.test.ts.
Parse/seed-chain anchors (for the $schema resolution rule):
- `server/src/store/RecordParser.ts:45` `SCHEMA_FIELDS = ['$schema','schemaId']`; `:96` extract;
  `:105-110` fail parse if neither present; `:113` `const { $schema: _schema, ...withoutSchema }`
  STRIP. `server/src/store/RecordStoreImpl.ts:205-217` silently skips seed files whose parse fails
  ("Skip malformed seed files" :216). => the OWN-3 seed's `$schema:` header is LOAD-BEARING.

## The `$schema` header resolution rule (orchestrator-ratified rule, with composer evidence)
The seed MUST keep its mandated first line
`$schema: https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml`
(RecordParser.ts:96,105-110 requires `$schema`||`schemaId`; without it RecordStoreImpl.ts:216
silently drops the seed). NEVER fix anything by deleting the header.
Composer probe (node against repo node_modules/ajv, read-only, at a6e3c4c0) establishes how
existing record kinds tolerate the raw `$schema` key: THEY DON'T declare it — NONE of
access-policy.schema.yaml / common.schema.yaml declares a `$schema` property (grep: `$schema`
appears only as the meta-key on line 1). A payload carrying a raw `$schema` key FAILS
`unevaluatedProperties: false` in EVERY Ajv config (probe: strict:true/false x formats:true/false,
and the real access-policy schema itself rejects it: keyword `unevaluatedProperties`,
unevaluatedProperty `$schema`). The house answer is the RecordParser.ts:113 STRIP: the envelope
payload that the server validates never contains `$schema`.
RESOLUTION RULE for this test:
1. Read the seed file, parse YAML, strip `$schema` exactly as RecordParser.ts:113 does
   (`const { $schema, ...payload }`), then validate `payload`. That is the payload the store
   actually validates. Precedent verbatim: DerivationSeedRecords.test.ts:68-75.
2. Do NOT delete the seed's header line. Do NOT weaken the OWN-1 trio to let the raw key through.
3. IF the orchestrator instead wants raw-disk validation, the fix belongs in OWN-1's schema
   (declare `"$schema": { type: string }` in properties) — that is an OWN-1 file change requiring
   orchestrator sign-off, never a seed change. (No existing record kind does this today — probe.)

## Watch-item W1 — the plan §T1 `$ref` string does not resolve under Ajv (probe evidence)
Plan §T1 YAML (word of record) declares, inside a schema whose `$id` is FLAT
(`https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml`):
`- $ref: "../core/common.schema.yaml#/$defs/FAIRCommon"`.
Ajv resolves refs against `$id`, not file path. Composer probe: with that flat `$id`, registering
the schema throws `can't resolve reference ../core/common.schema.yaml#/$defs/FAIRCommon` —
strict:true (the server runtime config, AjvValidator DEFAULT_OPTIONS + server.ts:368). The
identity-kind convention resolves: access-policy.schema.yaml:12 uses `./common.schema.yaml#/$defs/FAIRCommon`,
which against the flat $id resolves to common's exact $id — probe registers and validates OK.
(The plan itself mandates the flat $id at §T1's "Convention, don't get this wrong" block; the ref
string is internally inconsistent with it.)
W1 GATE (part of the first check): `grep -n "common.schema.yaml" schema/identity/ownership-policy.schema.yaml`
- If it shows `./common.schema.yaml` -> proceed.
- If it shows `../core/common.schema.yaml` -> the schema is broken for BOTH this test and the
  real server bootstrap (server.ts:370-375 compiles every schema). BLOCK with the grep + this
  probe evidence; the orchestrator hot-fixes OWN-1 (or, if the promotion text ratifies it, the
  worker may apply the one-line ref change `../core/common.schema.yaml` -> `./common.schema.yaml`
  as a separate commit citing this section). DEFAULT: BLOCK.

## First targeted check (single command, proves the approach early)
From the worktree root:
```
test -f schema/identity/ownership-policy.schema.yaml && test -f records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml && test -f schema/identity/ownership-policy.lint.yaml && head -1 records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml && grep -n "common.schema.yaml" schema/identity/ownership-policy.schema.yaml
```
Expected: gate passes, head -1 shows the `$schema:` seed header, grep shows `./common.schema.yaml`
(else W1 -> BLOCK). Any missing file -> `BLOCKED gate — OWN-1/OWN-3 not at base`.

## The test to write (worker contract; RED first)
File: `server/src/schema/OwnershipPolicySchema.test.ts`. Harness skeleton (corrected APIs,
house idioms — adapt names freely, keep the pipeline identical to server.ts:363-375):
```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCHEMA_PATHS = ['core/common.schema.yaml', 'identity/ownership-policy.schema.yaml'] as const;
const OWNERSHIP_SCHEMA = 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml';
// (ref.schema.yaml omitted — the trio declares no ref-datatype deps; re-read the merged schema
//  and add it to SCHEMA_PATHS if OWN-1's merged text references datatypes.)

async function build() {
  const contents = new Map<string, string>();
  for (const p of SCHEMA_PATHS) contents.set(p, readFileSync(join(repoRoot, 'schema', p), 'utf8'));
  const loaded = loadSchemasFromContent(contents);
  expect(loaded.errors).toEqual([]);
  const registry = createSchemaRegistry();
  registry.addSchemas(loaded.entries);                       // SchemaRegistry.ts:178 — NOT addAll
  const validator = createValidator({ strict: false });      // house test config
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);  // server.ts:370-375 order
  }
  return validator;
}
function seedPayload() {   // strip exactly as RecordParser.ts:113 does
  const raw = load(readFileSync(join(repoRoot, 'records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml'), 'utf8')) as Record<string, unknown>;
  const { $schema: _s, ...payload } = raw;
  return payload;
}
```
The 4 tests (RED first — write them, run, watch them fail before touching anything):
1. `accepts the seeded lab document` — validator.validate(seedPayload(), OWNERSHIP_SCHEMA)
   -> valid true, with `expect(result.valid, JSON.stringify(result.errors)).toBe(true)`.
   (Composer probe of a faithful trio simulation: seed-shaped payload validates true, strict +
   formats + strip — so expect GREEN once W1/refs are sound.)
2. `lints the seeded lab document clean` — loadAllLintSpecs({ basePath: join(repoRoot,'schema') }),
   addSpec ONLY the spec named `ownership-policy` (LintSpecLoader.ts:240 specNameFromPath;
   addSpec every spec risks unrelated duplicate-rule-ID throws — LintEngine.ts:54-58 throws on
   cross-spec duplicate ids). engine.lint(seedPayload(), OWNERSHIP_SCHEMA) -> valid true, zero
   violations.
3. `rejects a document with an unsafe fallback` (the seed minus kindRules is NOT the payload —
   mutate a clone): `fallback.owner: 'lab', fallback.visibility: 'public'` ->
   schema validate MAY be true (probe: schema-shape is legal — do not assert schema-invalid,
   that would be testing a fiction), but `engine.lint(...)` -> valid FALSE with a violation whose
   ruleId is `ownership-policy-fallback-must-be-safe` (severity error, plan §T1 lint verbatim).
   This is the REAL lint coverage the task description asked to keep honest; do not fake it.
4. `rejects a document that is malformed at the schema level` — e.g. drop `scope.id` (or
   `labOwnerUserId`) -> validator.validate -> valid FALSE, errors.length > 0. (Probe: missing
   scope.id => schema-invalid true — a genuine schema-shape rejection exists; also empty
   `kindRules: []` fires lint warning `ownership-policy-requires-kind-rules` and you may assert
   warningCount if you wire it into test 3, but warnings must not flip lint valid: error-only.)
RED evidence required in the report: run before implementing the final assertions (or with a
deliberately wrong schemaId) so the suite is observed failing for the right reason — if gate
files were missing at base, the RED is the missing-file load error itself (capture it).

## Baselines (re-capture at YOUR base; do NOT claim trunk is green)
- `npm run test:run -w server -- src/schema/` is NOT green on trunk: composer l1t0130 measured
  2 failed FILES / 5 failing tests (EventGraphEquipmentSchema, LabwarePhysicalGeometryData)
  + 278 passing at an earlier base — RE-MEASURE at your base and record the fail-FILE SET +
  failing-test count VERBATIM (multiset/set evidence, not a bare claim). Your merge bar:
  ZERO NEW FAILING FILES, same or better failing-test count, your new file fully passing.
- `npm run test:run -w server -- src/validation/` -> 42/42, exit 0 (l1t0130 baseline; re-capture;
  if it moved, report the drift — do not "fix" it).
- `npm run typecheck -w server` error-line multiset at base -> after: zero new error lines.
False "exit 0" claims are a review defect: paste verbatim tail output; the adversarial reviewer
re-runs your commands, paraphrase = defect.

## Acceptance criteria (task-list verbatim, ~:2564)
"npm run test:run -w server -- src/schema/OwnershipPolicySchema.test.ts -> 2 passed (RED first
against a missing schema, then green)."
PROMOTION NOTE (ratify): with the honest lint wiring this spec expands the suite to 4 tests; the
task-list line predates the draft's probe findings (validate-sketch APIs don't compile;
unsafe-fallback is lint-owned, not schema-owned; "2 passed" should become the ratified count).

## Commands (exact, from worktree root)
- RED/GREEN: `npm run test:run -w server -- src/schema/OwnershipPolicySchema.test.ts`
  Expected RED first (gate-absent or assertion fail), then `<N> passed`.
- No-regression: `npm run test:run -w server -- src/schema/`  -> your file passes; fail-file set
  unchanged (baseline above).
- `npm run test:run -w server -- src/validation/` -> exit 0, 42/42 (or report drift).
- `npm run typecheck -w server` -> zero NEW error lines vs base multiset.
- NEVER: restart the lane stack, curl :3092/:3001/:5174/:3093/:5193 (post-merge schema-load proof
  "Loaded N schemas" +1 is the orchestrator's restart-gated check), `git add -A`.

## Worker contract
- Worktree/branch: orchestrator creates it; branch `wt/OWN-4-lane1-<WORKER_ID>` off
  `cl/integration-1` (>= post-OWN-3-merge HEAD). Always `git -c core.fileMode=false` in lane
  trees (NFS mode-bit noise). Never touch /mnt/vast/home/brad/git/computable-lab or main.
- Single commit message: `test(server): ownership-policy schema contract` (plan §T4 commit line;
  stage the exact files only).
- Deliverable: `<REPORT_PATH>` (orchestrator fills, pattern
  `/home/brad/.hermes/cl/lanes/1/own4-report-<WORKER_ID>.wip.md`) — committed in your final
  commit. Include: every command with verbatim tail output, RED evidence, baseline multisets,
  assumptions as AS-OWN4-*. End marker exactly: `OWN4 CODER DONE <head-sha>`; if blocked:
  `BLOCKED <reason>` with everything committed.
- Stop-boundary: any NEW platform gap (lint loader can't see the spec, registry/validator
  behaves unlike the anchors above, W1 fires) -> STOP, preserve, report; the architect decides.
  No loader/validator edits.

## Reviewer bait (anticipated adversarial review — pre-empt these)
- "$schema in the payload": the seed header is MANDATED and must survive; the test STRIPS it
  exactly like RecordParser.ts:113 (probe: NO schema tolerates the raw key — access-policy
  rejects it too). Deleting the seed line = instant defect. Declaring `$schema` in OWN-1 =
  out-of-scope file edit without sign-off.
- Fake API / fake lint: `registry.addAll` and `validate({schemaId,payload})` are plan-sketch
  fiction (real: addSchemas :178, validate(data, schemaId) :179). Asserting schema-rejection of
  `fallback.owner: 'lab'` is testing a fiction (probe: schema VALIDATES it) — lint owns that;
  asserting nothing there is fake coverage. Cite real rule ids.
- YAML-reload trap: irrelevant to the worker (no server verification allowed here); a green test
  proves the YAML on disk, NOT the running lane server — restart proof is orchestrator-owned.
- W1 ref-string: if the merged trio has `../core/common...`, a test that "works around" it
  (e.g. registering common under a second fake id) is a defect; BLOCK.
- Baseline honesty: src/schema/ has pre-existing failures; a diff showing you "fixed"
  EventGraphEquipmentSchema/LabwarePhysicalGeometryData = out-of-scope edit; claiming "exit 0"
  on src/schema/ overall is false — pin zero-NEW-failing-files instead.
- LintEngine.addSpec duplicate-rule-id throw: adding all specs can crash the suite; add only the
  ownership-policy spec.
- js-yaml vs yaml package: server depends on both (server/package.json:55,61); RecordParser uses
  `yaml`, DerivationSeedRecords uses `js-yaml` — either parses the seed; pick one, don't add deps.

## ADDENDUM — trunk drift observed during composition (composer re-checked live)
The instruction sha was a6e3c4c0; while this draft was being written the trunk advanced to
edd7072c. Live state at edd7072c (composer re-grounded):
- OWN-1 IS MERGED (a6c9a9a6). The merged schema's mixin ref is
  `schema/identity/ownership-policy.schema.yaml:13  - $ref: "./common.schema.yaml#/$defs/FAIRCommon"`
  — W1 CLEARED exactly as probed: the architect fix-cycle ruling (09605414) changed
  `../core/` -> `./` (identity sibling convention). Worker still re-runs the first check at
  their base; the W1-BLOCK rule stays as the safety net for any re-divergence.
- OWN-2 NOT on trunk: `grep -n ownership-policy schema/core/record.schema.yaml` -> no match
  (union line absent; does not gate this test — the test loads the trio by path, not the union).
- OWN-3 NOT on trunk: `records/seed/identity/` still absent. This remains the only hard gate
  OPEN for OWN-4 dispatch.
- OWN-5 was ALSO merged mid-session (9067df66) — irrelevant to OWN-4's files, noted for the
  orchestrator's queue.
Net effect: at current trunk, OWN-4's remaining prerequisite is OWN-3 alone; test count 4 and
the lint-coverage expansion (open Q2) are the live ratification items.

## Open questions for orchestrator (max 3)
1. W1: plan §T1's `../core/common.schema.yaml` ref cannot resolve under a flat `$id` (probe:
   throws under strict:true = server config; `./common.schema.yaml` = access-policy convention
   resolves). If OWN-1 merges the plan verbatim, this test AND server bootstrap break. Ratify the
   default (OWN-4 BLOCKs, you hot-fix OWN-1) or pre-authorize the one-line ref change in OWN-4's
   run. Checked: probe3 [3a]/[3b], access-policy.schema.yaml:12, server.ts:363-375, plan §T1.
2. Test count "2 passed" -> 4 (seed-green, seed-lints-clean, lint-rejects-unsafe-fallback,
   schema-shape-rejection): the plan's own §T4 note sanctions replacing the lint assertion; the
   probe shows schema-level rejection of an unsafe fallback is impossible. Ratify the number so
   the task-list `verified by` can be updated at promotion. Checked: AjvValidator.ts:179-202,
   probe3 [3b], LintSpecLoader.ts:255, LintEngine.ts:54/231, plan §T1 lint YAML.
3. Should test 1 ALSO validate the seed raw (with `$schema`, expecting invalid) to pin the
   strip-contract itself? Probe: raw seed with `$schema` -> invalid (unevaluatedProperties) in
   every config. I did NOT include it to keep scope at 4; say the word and the worker adds test 5
   `pins that the raw seed file requires the RecordParser strip`.
