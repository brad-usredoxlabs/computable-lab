# SPEC DRAFT — OWN-4: Schema contract test for ownership-policy (TDD anchor for the seed)
Lane 1 · wave-3 lab-ownership-and-sharing-policy · composer l1t0330 · drafted 2026-10-11
Status: PROMOTED by orchestrator 2026-10-11T0530 — dispatchable once OWN-1 (with the architect amendment) and OWN-3 are merged.
See "ORCHESTRATOR ADJUDICATIONS" at the bottom (binding).
Grounded first-hand (composer, no scout intermediary) at trunk `cl/integration-1` @
`a6e3c4c02b97080195e7cae9d21d3024f23dfbe5` (= a6e3c4c0, EDITOR-9 merge). Every path:line below
was read at that SHA. Re-anchor at dispatch HEAD (post OWN-1/OWN-2/OWN-3 merges).

## Goal (one sentence)
Pin the OWN-1 schema trio and the OWN-3 seed with a real Ajv-pipeline contract test —
`server/src/schema/OwnershipPolicySchema.test.ts` — so every later wave task can trust the
fixture: the seeded OWN-LAB-DEFAULT validates, and a schema-malformed document is rejected.

## Item + deps
- Task-list block: `~/.hermes/cl/lanes/1/task-list.md` id OWN-4 (~line 2534).
- Deps: OWN-1 (schema trio) AND OWN-3 (seed file) must be MERGED to trunk before dispatch.
  As of a6e3c4c0 the trio is NOT on disk (`schema/identity/` = access-policy, group,
  role-grant, user only; OWN-1 coder is in flight per handoff 20261011T0225) and
  `records/seed/identity/` does not exist. **GATE (mandatory first check, see below): if
  any of the four files is absent at your base, STOP and report `BLOCKED <missing paths>`
  with the `git -c core.fileMode=false log --oneline -5 -- schema/identity records/seed/identity`
  evidence — do NOT stub them, do NOT proceed.**
- Plan of record §T4 (`.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md:453-519`)
  is the word of record; this spec corrects its harness sketch against the REAL APIs (verified
  first-hand — the plan itself commands this at :517, "read SchemaRegistry.ts and use the real
  method — do not guess").

## Files
IN scope (new, exactly one): `server/src/schema/OwnershipPolicySchema.test.ts`
OUT of scope (do not touch): every schema/lint/ui YAML (OWN-1's surface — if the schema
  itself is wrong, STOP-and-report, escalate to OWN-1), `records/seed/**` (OWN-3's surface),
  all of `server/src/schema/SchemaLoader.ts`, `SchemaRegistry.ts`, `server/src/validation/**`,
  `server/src/server.ts`, `schema/core/record.schema.yaml`, anything under `app/`.
  New test file only — zero edits to existing files.

## Lane-verified anchors (composer read first-hand @ a6e3c4c0)
1. REAL registry API: `server/src/schema/SchemaRegistry.ts` — methods are
   `addSchema(entry)` (:124) and `addSchemas(entries: SchemaEntry[])` (:178).
   There is **no `add`/`addAll`** — the plan's `registry.addAll(loaded.entries)` (:480) does
   not exist. Production wiring to mirror: `server/src/server.ts:363` `schemaRegistry.addSchemas(...)`
   then :366 `createValidator()` and the :369-374 topological-order loop
   `validator.addSchema(entry.schema, entry.id)` (:373).
2. REAL validator API: `server/src/validation/AjvValidator.ts` —
   `createValidator(options?: ValidatorOptions)` (:304) takes options, **NOT a registry**
   (plan :487 `createValidator(registry)` is wrong). `validate(data, schemaId)` (:179) —
   positional `(payload, schemaId)`, **NOT** `validate({ schemaId, payload })` (plan :491 wrong).
   House pattern to copy: `EquipmentFirstClass.test.ts:26-33` (`createValidator({ strict: false })`
   + per-entry `addSchema`) and `DerivationSchemas.test.ts:37-63` (registry + topological order).
3. `loadSchemasFromContent(contents: Map<string,string>)` is SYNCHRONOUS
   (`server/src/schema/SchemaLoader.ts:203`) — returns `{ entries, errors }`; the plan's
   `await` is harmless but `expect(result.errors).toEqual([])` after loading is the house
   liveness assertion (DerivationSchemas.test.ts:56).
4. **`validator.validate` runs NO lint** — AjvValidator is pure Ajv (validate :179-202 compiles
   the schema and calls it); lint is a separate engine wired only in `server.ts:380`
   (`createLintEngine()`). Therefore the plan's test-2 as written (unsafe-fallback payload
   `{owner:'lab', visibility:'public', ...}` expected `valid:false`) would FAIL: that payload is
   schema-LEGAL (KindRule permits `owner: lab` / `visibility: public`); rejecting it is the
   LINT rule `ownership-policy-fallback-must-be-safe` (plan §T1 lint.yaml, severity error),
   which this harness cannot see. The plan pre-authorizes the substitution at :512
   ("keep only the schema-shape assertion `expect(result.errors.length).toBeGreaterThan(0)`
   for `kindRule` needing `kind`") and the task list says "do not fake lint coverage".
   Mandated resolution below (test 2 = schema-shape rejection).
5. **The `$schema` seed header — coupled risk, RATIFIED RULE, composer-grounded**: the OWN-3
   seed's line 1 `$schema: https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml`
   is MANDATED (orchestrator ratification in the promoted OWN-3 spec; RecordParser.ts:96,105-110
   requires `$schema`||`schemaId` or the file is not a record, and RecordStoreImpl.ts:216
   silently skips malformed seeds — a dropped header ships a SILENTLY-INERT seed).
   First-hand finding on "how do existing record kinds tolerate the raw `$schema` key":
   **they don't declare it — the parser STRIPS it before validation.**
   `server/src/store/RecordParser.ts:113` `const { $schema: _schema, ...withoutSchema } = rawPayload`
   (recordId is dropped only when BOTH `id` and `recordId` are present, :114-118 — the seed has
   recordId only, so recordId must stay). Every seed-validation test follows the parser:
   `DerivationSeedRecords.test.ts:70-73`, `EquipmentCapabilityData.test.ts:77-82`,
   `MechanismModelSchemas.test.ts:51-54`, `PhaseTemplateSeedRecords.test.ts:69-72`.
   **RESOLUTION RULE (binding): the test must strip exactly the `$schema` key before calling
   `validator.validate`, mirroring RecordParser.ts:113 — that is the house tolerance mechanism,
   so the live pipeline NEVER shows Ajv the raw `$schema` key. If, after stripping, the seed
   STILL fails on a `$schema`/unknown-property error (i.e. OWN-1 declared something exotic),
   the fix belongs in OWN-1's schema (like `access-policy.schema.yaml` / `user.schema.yaml`,
   which declare no `$schema` property and rely on the strip) — escalate via
   `BLOCKED needs-own-1-fix <error>`. NEVER "fix" it by dropping the seed's header line, and
   NEVER by adding an `additionalProperties` hack in your own test payload.**
6. **cwd trap**: vitest runs with cwd = `server/` (vitest.config.ts include `src/**/*.test.ts`).
   `server/schema` is a symlink to the repo `schema/` (verified) so `join(process.cwd(),'schema')`
   works (AgentActionSchema.test.ts:26) — but **`server/records` does NOT exist** (verified);
   the plan's `join(process.cwd(), SEED_PATH)` (:488) would ENOENT. House pattern for seed
   reads: repo-root resolution — `DerivationSeedRecords.test.ts:21`
   `resolve(__dirname,'..','..','..')`, `MechanismModelSchemas.test.ts:48`
   `join(REPO_ROOT,'records',relPath)`. Use `resolve(process.cwd(), '..')` or the `__dirname` form.
7. Flat-`$id` contract: the kind's `$id` is
   `https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml` — NO
   `/identity/` segment (access-policy.schema.yaml:2 is the flat-style witness; OWN-1 spec
   pins it). Assert `registry.getById(FLAT_ID)` is defined — that IS part of the contract.
   `$ref` to FAIRCommon resolves against `$id` bases, not file paths: identity neighbours use
   `$ref: "./common.schema.yaml#/$defs/FAIRCommon"` (access-policy:12, user:12, group:11) which
   resolves cleanly against the flat `$id` to common's flat `$id`
   (`schema/core/common.schema.yaml:2`). If OWN-1 shipped the plan T1 :105 text
   `$ref: "../core/common.schema.yaml#/$defs/FAIRCommon"` verbatim, it resolves to
   `.../computable-lab/core/common.schema.yaml` — an id that is NOT registered → Ajv resolution
   failure in a 2-schema subset. If your first run dies on ref resolution, that is an OWN-1
   schema defect: `BLOCKED needs-own-1-fix` with the exact Ajv error; do not rewrite their YAML.
8. Harness reference (task list names it): `server/src/schema/AgentActionSchema.test.ts:17-32`
   — SCHEMA_PATHS array + load-from-content helper; note agent-action's `$id` carries
   `/workflow/` (transport value, not a record kind) — do NOT copy that id style here.

## Baselines (recapture at YOUR base; never claim trunk is green)
- **`src/schema/` is NOT green on trunk.** Composer l1t0130 measured 2 failed files / 5 failing
  tests (`EventGraphEquipmentSchema`, `LabwarePhysicalGeometryData`) + 278 pass at the pre-merge
  trunk. Re-measure at your base:
  `npm run test:run -w server -- src/schema/ 2>&1 | tail -30`
  Record the FAILING-FILE SET (names, not bare counts) + pass count in your report. Done
  criterion = **zero NEW failing files** vs your base capture — NOT "exit 0" (this directory
  cannot exit 0; claiming so is a false claim and an adversarial-review defect).
- `src/validation/` was 42/42 exit 0 — re-run as a no-regression witness:
  `npm run test:run -w server -- src/validation/ 2>&1 | tail -5` (expect: exit 0).
- Typecheck baseline: `npm run typecheck -w server` FAILS on trunk — composer l1t0330 measured
  exactly 45 pre-existing `error TS` lines across 13 files at a6e3c4c0 (none under
  `src/schema/` or your new test). Capture the error-line multiset at your base
  (`cd server && npx tsc --noEmit 2>&1 | grep 'error TS' | sort > /tmp/own4-tsc-base.txt`);
  done criterion = your change introduces **zero new error lines** (`diff` must show none).

## First targeted check (proves the approach early — run BEFORE writing the test)
```bash
ls -la schema/identity/ownership-policy.schema.yaml schema/identity/ownership-policy.lint.yaml \
       schema/identity/ownership-policy.ui.yaml \
       records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml
```
All four present + seed line 1 is the `$schema:` header (`head -1` it) → proceed. Anything
missing → BLOCKED with evidence (gate violated; see deps above). Then a 30-second harness-liveness
probe (a scratch vitest file copying the harness against the real schema with a payload missing
`fallback`, expecting `valid:false`) — keep the output; if the probe vacuously PASSES, the
harness is not wired and you must fix the wiring before writing the contract.

## The contract to write (mandated harness; plan §T4 corrected to real APIs)
Two tests, mirroring plan §T4 intent with the REAL APIs (per plan :517 and the corrections
above). Verbatim-authoritative pieces: the flat schema-id constant, the seed path, the
`expect(result.valid, JSON.stringify(result.errors)).toBe(true)` proof-style assertion, and
the `errors.length > 0` rejection shape (plan :492, :507, :512). Sketch:

```ts
// server/src/schema/OwnershipPolicySchema.test.ts
import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = ['core/common.schema.yaml', 'identity/ownership-policy.schema.yaml'] as const;
const OWNERSHIP_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml';
const REPO_ROOT = resolve(process.cwd(), '..');            // vitest cwd = server/
const SEED_PATH = join(REPO_ROOT, 'records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml');

async function loadSeedPayload() {
  // reads the REAL file from disk — never inline a copy of the seed here
  const raw = parse(await readFile(SEED_PATH, 'utf8')) as Record<string, unknown>;
  const { $schema: _ignored, ...payload } = raw; // RecordParser.ts:113 strip; keep recordId
  return payload;
}
// load: contents Map -> loadSchemasFromContent (sync) -> expect(errors).toEqual([])
// -> createSchemaRegistry().addSchemas(result.entries)
// -> createValidator({ strict: false }) -> topological order addSchema(entry.schema, entry.id)
// (mirror server.ts:363-374 / DerivationSchemas.test.ts:37-63)

describe('ownership-policy schema contract', () => {
  it('registry exposes ownership-policy under its flat $id', /* getById(OWNERSHIP_SCHEMA_ID) defined */);
  it('accepts the seeded lab document (real file, $schema stripped like the parser)',
     /* expect(valid, JSON.stringify(errors)).toBe(true) */);
  it('rejects a kindRule entry missing `kind` (schema-shape; lint rules are NOT Ajv)',
     /* payload = a valid-shape doc whose kindRules[0] omits `kind`
        (T1 schema items required:[kind], plan :145)
        -> expect(result.valid).toBe(false); expect(result.errors.length).toBeGreaterThan(0);
        assert an error keyword 'required' surfaces (missingProperty 'kind') */);
});
```
(The two `/* */` bodies above are prose contracts, not code to paste verbatim; write them
yourself from the neighbours' idiom. Three `it()` blocks total: the registry-flat-$id probe is
cheap insurance for anchor 7. If the orchestrator prefers exactly 2 tests, fold the registry
probe into test 1's load helper as an assertion.)

Test 2 payload must be a document otherwise VALID against the schema except the missing `kind`
— include `scope: {type:'lab', id:'lab'}`, `labOwnerUserId: 'USR-LOCAL-ADMIN'`, and a
schema-legal `fallback` (owner `creator`, visibility `private`, filedTo `none`,
editRoles `['owner']`, shareTargets `['user']`). Put a one-line comment in the test stating
that fallback-SAFETY is enforced by the lint rule
`ownership-policy-fallback-must-be-safe`, not by Ajv — Ajv only enforces shape here.

## RED/GREEN evidence
OWN-4 dispatches AFTER OWN-1+OWN-3 merge, so the "RED against a missing schema" clause of the
task list is structurally covered by the gate (absent trio → BLOCKED). In-run RED proof = the
harness-liveness probe + test 2's rejection: capture RED-equivalent output (probe payload
rejected) in the report before finalizing. Then GREEN: the test file passes.

## Acceptance criteria (task-list verbatim)
"npm run test:run -w server -- src/schema/OwnershipPolicySchema.test.ts -> 2 passed (RED first
against a missing schema, then green)." — With the harness-probe variant that is 3 tests in the
file; then the run shows `3 passed`. State in the report which shape you shipped. The task-list
`verified by` line is quoted here word-for-word; the orchestrator adjudicates the count drift.

Real commands (expected outputs):
```bash
npm run test:run -w server -- src/schema/OwnershipPolicySchema.test.ts   # -> N passed, exit 0
npm run test:run -w server -- src/schema/ 2>&1 | tail -30               # -> same fail-file set
                                                                          #    as your base capture,
                                                                          #    +N more passing
npm run test:run -w server -- src/validation/ 2>&1 | tail -5            # -> exit 0 (42/42 class)
cd server && npx tsc --noEmit 2>&1 | grep -c 'error TS'                 # -> base count (45 at
                                                                          #    a6e3c4c0), ZERO new
```

## Worker contract
- Worktree/branch off lane trunk `cl/integration-1` (dispatch-time HEAD, ≥ a6e3c4c0, after
  OWN-1/OWN-2/OWN-3 merges): `wt/OWN-4-lane1-l1t<dispatch-id>`. Orchestrator owns worktree
  creation per lane convention; never branch or merge yourself. ALWAYS
  `git -c core.fileMode=false ...` (NFS mode-bit noise). Never `git add -A` — stage exactly
  `server/src/schema/OwnershipPolicySchema.test.ts` (+ your report).
- Report: write ONLY `<REPORT_PATH>` (placeholder — orchestrator substitutes the unique path,
  pattern `/home/brad/.hermes/cl/lanes/1/own4-report-l1t<dispatch-id>.wip.md`). Every command
  with VERBATIM tail output (adversarial review re-runs them; paraphrase = defect). Baseline
  captures, RED/GREEN evidence, assumptions as AS-OWN4-*. End marker exactly:
  `OWN4 CODER DONE <head-sha>`. If blocked: `BLOCKED <reason>`, preserve work committed.
- Commit message (plan §T4 :519): `test(server): ownership-policy schema contract`.
- NO lane-stack restart (orchestrator owns restarts — and none is needed: this item adds no
  YAML). NO curl against :3092/:3001/:5174/:3093/:5193/:5192. NO server edits. Read-only
  source inspection + vitest/tsc runs only.

## Reviewer bait (pre-empt these; each is a real trap on this item)
1. **$schema header laundering** — deleting/ignoring the seed header, or inlining a payload
   copy instead of reading the real seed file, makes the test vacuous. The test MUST read
   `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml` from disk (anchor 5
   resolution rule: strip `$schema` mirroring RecordParser.ts:113, keep `recordId`).
2. **Fake lint coverage** — asserting the unsafe-fallback payload is Ajv-rejected (it is not;
   anchor 4). The mandated test 2 is shape-only, with the lint/Ajv boundary commented.
3. **Plan-sketch API cargo-cult** — `registry.addAll`, `createValidator(registry)`,
   `validate({schemaId,payload})` do not exist (anchors 1-2); if you wrote them, it's a defect.
4. **cwd trap** — `process.cwd()` is `server/`; `server/records` does not exist (anchor 6).
5. **False exit-0 claim** on the whole `src/schema/` directory (it has known-red files;
   pin the zero-NEW-failing-files set instead).
6. **exactOptionalPropertyTypes is ON** (`server/tsconfig.json:13`) — in the test-2 payload
   literal, do NOT write `publishRole: undefined`; omit absent optionals entirely.
7. **YAML-reload trap** (lane rule): irrelevant to your runs (vitest reads YAML fresh from
   disk) but do not "verify" schema loading against the running :3092 stack — restarts and
   curls are orchestrator-only.
8. **Ontology terms**: this item touches no claim/context/context-role/assertion/evidence
   knowledge-layer surfaces — `docs/knowledge-layer-canonical-example.md` is NOT binding here;
   no CL: ontology ids belong in this test.
9. **Hardcode boundary**: no expected-seed content may be duplicated as literals beyond the
   tiny test-2 negative payload; the seed's truth is the file on disk.

## Open questions for orchestrator (max 3)
1. **Lint-rule coverage**: the campaign's error-severity rule
   `ownership-policy-fallback-must-be-safe` has NO test once test 2 is shape-only (Ajv cannot
   see it; verified: AjvValidator.ts:179-202 is pure Ajv, LintEngine wired only at
   server.ts:380). Confirm it is deliberately deferred (a `LintEngine`-driven test would live
   in `src/lint/`, not `src/schema/`) — or direct me to add a third test on the
   `LintEngine.test.ts` idiom instead. Checked: task list says "do not fake lint coverage";
   plan :512 pre-authorizes shape-only.
2. **OWN-1 `$ref` form is unknown until merge**: plan T1 :105 uses `../core/common.schema.yaml`
   but every identity neighbour uses `./common.schema.yaml` (resolves via flat `$id`;
   anchor 7). If OWN-1 shipped the plan text verbatim, the 2-schema subset will hit an Ajv
   ref-resolution failure and OWN-4 must `BLOCKED needs-own-1-fix`. Confirm that escalation
   route (reopen OWN-1 / small schema patch under your review) is your preferred adjudication.
3. **Baseline drift**: the 2-fail-file / 5-test / 278-pass `src/schema/` figure is l1t0130's
   measurement at pre-EDITOR-9 trunk. I forbid exit-0 claims either way and mandate a
   base recapture — but if you want a hard expected-set pinned here, re-measure post-OWN-1/2/3
   yourself; I could not (trio not on disk at a6e3c4c0, verified).

## ORCHESTRATOR ADJUDICATIONS (2026-10-11T0530, binding for the worker)
1. Lint-rule coverage: DEFERRED, confirmed. The fallback-safety rule is LintEngine surface;
   Ajv cannot see it and "do not fake lint coverage" stands. A LintEngine-driven test is NOT
   part of OWN-4; keep test 2 schema-shape-only with the boundary comment.
2. OWN-1 $ref form: RESOLVED before your dispatch — the architect ruled (2026-10-11_own-1-
   fixcycle-decision.md, 2a) and OWN-1's fix run lands $ref: "./common.schema.yaml#/$defs/
   FAIRCommon" (identity-sibling convention). Re-anchor anchor 7: if the trio on your base
   still shows ../core/, you are on a pre-fix base — BLOCKED needs-own-1-fix-merge with
   evidence, do not patch their YAML.
3. Baseline drift: worker re-measures at own base, per the Baselines section. Zero-NEW-failing-
   files is the done-gate (AS-ORCH-L1-028 ruling; exit-0 claims forbidden).
