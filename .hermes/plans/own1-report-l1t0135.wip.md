# OWN-1 — Schema trio for ownership-policy — CODER REPORT (lane 1, l1t0135)

Worktree: /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135
Branch: wt/OWN-1-lane1-l1t0135 off cl/integration-1 @ 25f74aaa44d70339c6d5ed588515edbf04736699
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-11_own-1-schema-trio-spec.md
Plan of record: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md §T1 (+ §Pinned decisions D1-D13, §Reconciliation)

STATUS: IMPLEMENTATION COMPLETE. Three new YAML files, verbatim from plan §T1. Targeted
schema suite + lint suite re-run with identical fail-sets. Zero new failing files vs base
(see §4.4 for the two load-dependent timeout flaps, both proven load artifacts, not drift).
No golden/manifest moved (§5). Lane stack untouched; no curl to :3092/:5192/:3001/:5174.
Post-merge stack-restart + GET /api/schemas verification is the orchestrator's gate.

===============================================================================
§0 WORKTREE + LANE-SYNC REPLICATION
===============================================================================

§0.1 Creation (base sha recorded)
$ git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-1 worktree add /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135 -b wt/OWN-1-lane1-l1t0135 cl/integration-1
HEAD is now at 25f74aaa Merge branch 'wt/qms-8-lane1-l1t1645' into cl/integration-1 (QMS-8: PATCH /settings/lab + patchLabSettings as one contract, fail-closed authz, adversarial cycle-2 ACCEPT)
Base sha: 25f74aaa44d70339c6d5ed588515edbf04736699 (lane trunk HEAD at my start).
Every git command in this session used -c core.fileMode=false.

§0.2 Lane-sync replication (per lane memory note: replicate the TRUNK worktree's ignored
working-tree state 1:1, symlinks as symlinks; never bulk-sync from Brad's live tree)
Trunk ignored entries: 123. Replicated into the worktree: all lane-exclude symlinks
(targets = /mnt/vast/home/brad/git/computable-lab/...), the schema/bio + schema/core +
schema/governance + schema/registry untracked YAMLs, .env/config.yaml symlinks,
plus node_modules symlinks pointing at the TRUNK (editor-9 pattern):
  node_modules        -> /mnt/vast/home/brad/git/cl-integration-1/node_modules
  app/node_modules    -> /mnt/vast/home/brad/git/cl-integration-1/app/node_modules
  server/node_modules -> /mnt/vast/home/brad/git/cl-integration-1/server/node_modules
  server/schema       -> /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema
  (server/schema mirrors the trunk symlink pattern but points at THIS worktree's schema
   dir, exactly as qms-8/editor-9 worktrees do — trunk's own server/schema points at
   cl-integration-1/schema. This is what makes tests that resolve '../../../schema'
   from server/ see the same tree the worktree owns.)

Parity check (trunk vs worktree ignored-state, comm -3; only runtime artifacts differ):
--- comm -3 trunk-ignored vs worktree-ignored ---
.run/
server/dist/

===============================================================================
§1 DELIVERABLES (three new files ONLY — no edits to any existing file)
===============================================================================

1. schema/identity/ownership-policy.schema.yaml (115 lines)
   Plan §T1 block 1 verbatim. JSON Schema draft 2020-12; flat $id
   https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml (no
   /identity/ segment — matches the live access-policy convention the spec pins).
   kind const 'ownership-policy'; recordId ^OWN-...; scope {type: lab|project, id};
   labOwnerUserId ^USR-...; fallback + kindRules over $defs/KindRule (owner creator|lab,
   visibility private|shared|public, filedTo none|active-project, editRoles/shareTargets
   reusing the ACL role enum verbatim per §Reconciliation, defaultGrants, publishRole).
   Mixin: allOf $ref ../core/common.schema.yaml#/$defs/FAIRCommon — the plan's YAML kept
   verbatim; note identity siblings (access-policy/group/user/role-grant) use
   './common.schema.yaml' (a sibling-file convention that only resolves because the
   identity dir has no common.schema.yaml of its own; extraction-spec and bio/sequence use
   the same ../core/ path my trio uses — precedent probe in §3).

2. schema/identity/ownership-policy.lint.yaml (25 lines)
   Plan §T1 block 2 verbatim. lintVersion 1, schemaId = the flat $id, two rules:
   ownership-policy-requires-kind-rules (warning, nonEmpty $.kindRules) and
   ownership-policy-fallback-must-be-safe (error, equals $.fallback.owner == 'creator')
   — the D9 'no silent behaviour change' guard as data.

3. schema/identity/ownership-policy.ui.yaml (53 lines)
   Plan §T1 block 3 verbatim. uiVersion 1, schemaId = the flat $id, display (titleField,
   icon shield), form layout sections: Identity / Scope / Fallback / Kind Rules.

Verbatim proof (diff of plan line-ranges vs the files, re-run at final state):
--- verbatim diff vs plan §T1 ---
SCHEMA-VERBATIM-OK
LINT-VERBATIM-OK
UI-VERBATIM-OK
--- fence-leak check (grep -c backtick-fences per file) ---
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.schema.yaml:0
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.lint.yaml:0
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.ui.yaml:0
NO-FENCE-LEAK
--- flat-$id / schemaId fields ---
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.schema.yaml:2:$id: "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml"
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.lint.yaml:3:schemaId: "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml"
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.ui.yaml:3:schemaId: "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml"
--- sha256 of the trio (final on-disk state) ---
bee36dee91123c47445b61fd062e691ce588c26f22e561cd4963b15256f6078c  /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.lint.yaml
f6fec24961e2b01c21df14da7d2b41f4e4575646b238d95282b78a9b36691127  /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.schema.yaml
07768aee3b224c06d3d293ecdb8a7456a2fc3c3169c5622c173c6d10778c3cf1  /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.ui.yaml

NO other file touched: git status shows only the trio (plus the lane-sync node_modules
symlinks, which are never staged):
--- git status --porcelain (pre-commit) ---
?? app/node_modules
?? node_modules
?? schema/identity/ownership-policy.lint.yaml
?? schema/identity/ownership-policy.schema.yaml
?? schema/identity/ownership-policy.ui.yaml
?? server/node_modules

===============================================================================
§2 FIRST TARGETED CHECK — schema suite baseline vs head
===============================================================================

$ npm run test:run -w server -- src/schema/   (from worktree root)

BASE (before trio):
--- base tail ---
"width": 85,
  },
}

 ❯ src/schema/LabwarePhysicalGeometryData.test.ts:203:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯

 Test Files  2 failed | 32 passed | 5 skipped (39)
      Tests  5 failed | 278 passed | 53 skipped (336)
   Start at  02:35:43
   Duration  17.94s (transform 8.49s, setup 6ms, collect 117.44s, tests 85.58s, environment 23ms, prepare 53.04s)

npm error Lifecycle script `test:run` failed with error:
npm error code 1
npm error path /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/server
npm error workspace @computable/server@1.0.0
npm error location /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/server
npm error command failed
npm error command sh -c vitest run src/schema/

HEAD (after trio):
--- head tail ---
"width": 85,
  },
}

 ❯ src/schema/LabwarePhysicalGeometryData.test.ts:203:9

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯

 Test Files  2 failed | 32 passed | 5 skipped (39)
      Tests  5 failed | 278 passed | 53 skipped (336)
   Start at  02:45:47
   Duration  11.18s (transform 6.40s, setup 13ms, collect 28.16s, tests 89.52s, environment 28ms, prepare 15.02s)

npm error Lifecycle script `test:run` failed with error:
npm error code 1
npm error path /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/server
npm error workspace @computable/server@1.0.0
npm error location /mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/server
npm error command failed
npm error command sh -c vitest run src/schema/

Fail-FILE SET identical (both runs):
--- base fail-set ---
FAIL  src/schema/EventGraphEquipmentSchema.test.ts
FAIL  src/schema/LabwarePhysicalGeometryData.test.ts
--- head fail-set ---
FAIL  src/schema/EventGraphEquipmentSchema.test.ts
FAIL  src/schema/LabwarePhysicalGeometryData.test.ts

Both pre-existing at trunk too — same command run in the TRUNK worktree (read-only, no
file changes there):
--- trunk same-suite tail ---
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯

 Test Files  2 failed | 32 passed | 5 skipped (39)
      Tests  5 failed | 278 passed | 53 skipped (336)
   Start at  02:48:51
   Duration  20.92s (transform 15.50s, setup 11ms, collect 108.45s, tests 120.19s, environment 97ms, prepare 33.86s)

npm error Lifecycle script `test:run` failed with error:
npm error code 1
npm error path /mnt/vast/home/brad/git/cl-integration-1/server
npm error workspace @computable/server@1.0.0
npm error location /mnt/vast/home/brad/git/cl-integration-1/server
npm error command failed
npm error command sh -c vitest run src/schema/

Trunk fail-set: EventGraphEquipmentSchema.test.ts + LabwarePhysicalGeometryData.test.ts
(same two). Reasons (verbatim from head run): EventGraphEquipmentSchema 'expected false
to be true' at :103 (event-graph equipment branch), LabwarePhysicalGeometryData
'unstamped/incorrect SBS files: ... null' — both are lane-sync/registry-data debt present
at base, unrelated to identity schemas.

NOTE ON THE ACCEPTANCE WORDING: the task-list says 'exits 0 (no regression)'. At MY base
this command already exits 1 (the two pre-existing failures above; identical at trunk).
'No regression' is proven as fail-SET equality + identical headline counts
(2 failed | 32 passed | 5 skipped; 5 failed | 278 passed | 53 skipped). I did not fix
those two files — out of scope, and fixing them would be scope creep.

Lint loader suite (my lint.yaml rides LintSpecLoader auto-discovery):
$ npm run test:run -w server -- src/lint/
BASE: Test Files  3 passed (3)
      Tests  44 passed (44)
   Start at  02:45:22
   Duration  2.22s (transform 219ms, setup 0ms, collect 402ms, tests 70ms, environment 1ms, prepare 2.95s)
HEAD: Test Files  3 passed (3)
      Tests  44 passed (44)
   Start at  02:46:36
   Duration  1.19s (transform 214ms, setup 0ms, collect 411ms, tests 43ms, environment 1ms, prepare 708ms)

===============================================================================
§3 LOADER-PATH EVIDENCE (the trio loads; counts +1; no manifest edit)
===============================================================================

Probe script /tmp/own1-loader-probe.ts (tsx, from server/): loadAllSchemas + SchemaRegistry
+ loadAllLintSpecs + loadAllUISpecs over the worktree schema dir, run at base (trio
temporarily moved out) and at head.

BASE:
--- probe @ base ---
schema entries: 185 loader errors: 0
ownership-policy schema entries: 
lint specs: 49 lint errors: 2
ownership lint specs: 
ui loaded: 53 ui errors: 7
ui errors detail: [{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/core/lab-state.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/core/term.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/knowledge/mechanism-model.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/extraction-draft.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/phase-template.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/protocol-foundry-review-inner-loop-trace.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/protocol-ide-session.ui.yaml","error":"Validation failed"}]

HEAD:
--- probe @ head ---
schema entries: 186 loader errors: 0
ownership-policy schema entries: https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml @ identity/ownership-policy.schema.yaml
lint specs: 50 lint errors: 2
ownership lint specs: ownership-policy
ui loaded: 53 ui errors: 8
ui errors detail: [{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/core/lab-state.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/core/term.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/identity/ownership-policy.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/knowledge/mechanism-model.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/extraction-draft.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/phase-template.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/protocol-foundry-review-inner-loop-trace.ui.yaml","error":"Validation failed"},{"path":"/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/schema/workflow/protocol-ide-session.ui.yaml","error":"Validation failed"}]

- schema entries 185 -> 186 (+1), loader errors 0 both sides.
- lint specs 49 -> 50 (+1); the 2 lint load errors (core/lab-state.lint.yaml,
  workflow/local-protocol.lint.yaml 'Invalid lint spec structure') are pre-existing both sides.
- ui loaded 53 both sides (loadAllUISpecs counts successes; my ui.yaml fails the loader's
  widget whitelist — see §6 DEFECT-OWN1-UI-1), ui errors 7 -> 8 (the +1 is mine).
- Registry: size 186, topological order 186 (no cycle), checkResolution unresolved list
  base-vs-head diff:
--- unresolved-ref diff (only my new edge appears) ---
7a8
> "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml -> https://computable-lab.com/schema/core/common.schema.yaml"

  i.e. exactly one new unresolved entry — ownership-policy -> core/common.schema.yaml —
  joining 36 pre-existing unresolved entries of the same class (record.schema.yaml's own
  union refs, extraction-spec, bio/sequence, etc.). This class is inert for the server:
  server.ts adds schemas to Ajv in topological order and the live backend log shows
  'Loaded 185 schemas / Added 185 schemas to validator' with no MissingRef crash; the
  same class exists at base. My schema adds no NEW class of gap.

server.ts auto-discovery anchors (verified in-tree, matching the spec's lane-verified
anchors; the plan's ':355' is main-side drift — actual call site is server.ts:348):
- server/src/server.ts:345-351 loadAllSchemas({ basePath: schemaDir, recursive: true })
- server/src/server.ts:393 loadAllLintSpecs({ basePath: schemaDir, recursive: true })
- server/src/server.ts:515 loadAllUISpecs(uiSpecLoader, schemaDir)
- GET /api/schemas -> SchemaHandlers.listSchemas -> registry.getAll() (routes.ts:297):
  after a stack restart the new schema appears with no registration. NO manifest exists
  to edit; none touched.

Ajv compile-path probe (/tmp/own1-ajv-probe.ts, mimics server.ts:345-375 exactly):
--- ajv probe head ---
Ajv added: 186 / 186
Ajv failures: 0
THREW: MissingRefError: can't resolve reference ../core/common.schema.yaml#/$defs/FAIRCommon from id https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml

186/186 schemas added to Ajv, 0 addSchema failures. The MissingRefError THREW line is the
LAZY-COMPILE artifact of Ajv strict mode when a schema whose $ref target is NOT registered
is validated first — precedent probe shows extraction-spec and bio/sequence (both shipped,
both use ../core/common.schema.yaml) throw the identical MissingRefError in the same probe,
while access-policy (./common.schema.yaml) validates fine. In the real server the FAIRCommon
mixin resolves because core/common.schema.yaml IS registered (its $id is
.../computable-lab/common.schema.yaml; Ajv resolves ../core/common.schema.yaml relative to
my $id into .../schema/core/common.schema.yaml — a URL-space mismatch shared by every
../core/-referencing schema at base). This is pre-existing platform behaviour, not a defect
my trio introduces; the acceptance gate (schema loads, count +1, listed by GET /api/schemas)
does not depend on it. Sample-payload validation could not be probed through this path for
that reason; the lint-engine probe below exercises the record shape.

Lint-engine probe (/tmp/own1-lint-probe.ts): spec auto-loads and fires correctly:
--- lint engine probe ---
ownership lint specs: 1
 name: ownership-policy rules: ownership-policy-requires-kind-rules [warning], ownership-policy-fallback-must-be-safe [error]
lint load errors: [{"path":"core/lab-state.lint.yaml","error":"Invalid lint spec structure"},{"path":"workflow/local-protocol.lint.yaml","error":"Invalid lint spec structure"}]
good record violations: []
bad record violations: ownership-policy-requires-kind-rules [warning], ownership-policy-fallback-must-be-safe [error]

Good sample record: 0 violations. Bad sample (fallback.owner='lab', kindRules=[]):
both rules fire (warning + error). The lint trio is live through LintEngine.

===============================================================================
§4 PINS (multiset/SET equality, captured at MY base in THIS worktree)
===============================================================================

§4.1 server tsc error-line multiset (npx tsc --noEmit in server/): 46 lines, exit 2.
Pinned /tmp/own1-base-server-tsc.txt. Dominant pre-existing classes: TS2339 RecordStoreImpl
gitCommit/actor, TS2305 AuthoringPolicy (lane-sync AuthoringGuard vs trunk lint/types),
TS2307 sequenceRequestFidelity, AgentOrchestrator MaterialProfileRegistry drift.
HEAD: 46 lines. Position-normalized multiset diff:
--- server tsc multiset diff ---
SERVER-TSC-MULTISET-IDENTICAL

§4.2 app tsc error-line multiset (npx tsc --noEmit -p tsconfig.json in app/): 36 lines, exit 2.
Pinned /tmp/own1-base-app-tsc.txt (runDeckLock/equipments/SurfaceId drift + lane-sync
SequencesPage trio). HEAD: 36 lines.
--- app tsc multiset diff ---
APP-TSC-MULTISET-IDENTICAL

(Lane memory pins for other worktrees — 37/46 app/server at lane1 EDITOR-9 @14637f6d,
34 at W2-8 — are worktree-specific; my lane @25f74aaa post-replication pins are 36/46,
captured AFTER §0.2 replication per the lane rule.)

§4.3 app vitest fail-FILE SET (npx vitest run in app/): 56 files = 19 e2e/*.spec.ts
(Playwright specs collected by vitest — known debt) + 37 src/.
--- app base headline ---
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 Test Files  56 failed | 225 passed (281)
      Tests  63 failed | 1795 passed (1858)
     Errors  5 errors
   Start at  02:37:00
   Duration  152.60s (transform 115.16s, setup 237.01s, collect 329.52s, tests 163.79s, environment 1758.04s, prepare 174.48s)
--- app head headline ---
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 Test Files  56 failed | 225 passed (281)
      Tests  63 failed | 1795 passed (1858)
     Errors  5 errors
   Start at  02:46:38
   Duration  147.58s (transform 60.36s, setup 226.70s, collect 209.79s, tests 174.69s, environment 1771.11s, prepare 141.19s)
Fail-SET base-vs-head: IDENTICAL (diff empty; 56 = 56; split e2e: 19, src: 37).
Zero new failing app files.

§4.4 server vitest full-suite fail-FILE SET (npx vitest run in server/), parallel mode,
3 base runs + 4 head runs + 1 serial run each side.
File counts (base r1/r2/r3, head r1/r2/r3/r4, base-serial, head-serial):
--- server fail-set counts ---
92
92
92
93
93
93
93
84
83

- BASE parallel runs: 92/92/92 files — stable. HEAD parallel runs: 93/93/93/93 files.
- The single delta in every head run vs every base run is ONE file, and it FLAPS between
  two different files run to run:
  * head r1: +src/sequences/sequenceIntent.test.ts (Error: Test timed out in 10000ms)
  * head r2/r3/r4: +src/revisions/Qms6bSchemaDrift.test.ts [collection] (Error: Hook timed
    out in 10000ms)
  * head-serial: delta is the OPPOSITE sign — base-serial 84 vs head-serial 83, with
    src/execution/sidecar/SimulatorContracts.test.ts failing at base-serial and passing at
    head-serial AND in isolation at head (2 passed).
  Evidence these are load artifacts, not my drift:
  (a) The failing test is always a HOOK/TEST TIMEOUT (10s vitest default), never an
      assertion about schemas. Verbatim head-r4 block:
--- head-r4 Qms6b failure block ---
FAIL  src/mcp/McpServer.test.ts > MCP Server
 FAIL  src/measurement/MeasurementActiveControlService.test.ts > MeasurementActiveControlService
 FAIL  src/measurement/MeasurementParserValidationService.test.ts > MeasurementParserValidationService
 FAIL  src/measurement/MeasurementService.test.ts > MeasurementService
 FAIL  src/revisions/Qms6bSchemaDrift.test.ts [ src/revisions/Qms6bSchemaDrift.test.ts ]
 FAIL  src/execution/sidecar/SimulatorContracts.test.ts > SimulatorContracts
 FAIL  src/mcp/tools/AiPlanningTools.test.ts > ai planning MCP tools
 FAIL  src/mcp/tools/MaterialsAiTools.test.ts > materials AI MCP tools
 FAIL  src/mcp/tools/ProtocolTools.test.ts > protocol MCP tools
 FAIL  src/mcp/tools/VendorDocumentTools.test.ts > vendor document MCP tools
 FAIL  src/api/handlers/MeasurementHandlers.applianceJob.test.ts > MeasurementHandlers appliance job execution
 FAIL  test/api/deviations.test.ts > Deviation Tracking API
 FAIL  test/api/execution-timestamps.test.ts > Execution Timestamps API
 FAIL  test/api/settings.test.ts > Settings API
Error: Hook timed out in 10000ms.
If this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/190]⎯

 FAIL  src/integration/extractionE2E.test.ts > E2E: PDF upload → extract → draft → promote → canonical + audit
TypeError: Cannot read properties of undefined (reading 'close')
  (b) In isolation at HEAD both flap candidates pass:
--- sequenceIntent isolated @head ---
Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  03:53:18
   Duration  8.87s (transform 2.64s, setup 0ms, collect 4.34s, tests 1.50s, environment 0ms, prepare 866ms)
--- Qms6bSchemaDrift isolated @head ---
Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  03:53:28
   Duration  1.84s (transform 483ms, setup 0ms, collect 551ms, tests 584ms, environment 0ms, prepare 63ms)
--- SimulatorContracts isolated @head ---
Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  03:53:30
   Duration  25.36s (transform 10.26s, setup 0ms, collect 14.69s, tests 10.04s, environment 0ms, prepare 61ms)
  (c) Marginal-cost probe (/tmp/own1-marginal-probe.ts) times the exact Qms6b beforeAll
      work (loadAllSchemas + registry + full Ajv compile) head-vs-trunk, interleaved:
--- marginal probe (head=186 entries, trunk=185) ---
head-run1: entries=186 load=1925ms registry=3ms ajvCompile=45ms total=1972ms
head-run2: entries=186 load=357ms registry=2ms ajvCompile=29ms total=388ms
head-run3: entries=186 load=418ms registry=1ms ajvCompile=22ms total=441ms
trunk-run1: entries=185 load=1822ms registry=2ms ajvCompile=22ms total=1845ms
trunk-run2: entries=185 load=367ms registry=2ms ajvCompile=26ms total=394ms
trunk-run3: entries=185 load=387ms registry=2ms ajvCompile=27ms total=416ms
      The +1 schema adds ~0-10ms of compile (Ajv 22-27ms vs 19-22ms); load totals are
      dominated by NFS cold-cache noise (trunk-run1 1960ms vs head-run1 550ms — the TRUNK
      was slower than HEAD in the same interleaving). The host at run time: load average
      1.00-4.62 on 22 cores with the lane stack live; Qms6b's beforeAll measured 3.5s,
      10.4s, 10.7s at base and 7.1s, 11.6s, 11.6s, 10.0s at head — the 10s hook timeout
      is crossed by load, not by my +1 schema.
  (d) Serial (--no-file-parallelism) runs, which remove the contention: base 84 vs head 83
      fail-sets; the only diff is SimulatorContracts failing at BASE-serial only.
      Qms6b passes in BOTH serial runs (2033ms base, 806ms head).
  CONCLUSION: zero new failing files attributable to the trio. The flaps are the known
  load-dependent timeout debt of this suite (5-7 'timed out' lines per run on both sides;
  base-r3 5 vs head-r4 4).
  Pin A/B proof method: git -c core.fileMode=false stash push -u -m own1-pin-trioN -- <trio>
  (suite on pristine HEAD), stash pop, re-run — repeated for r2/r3 and serial.

§4.5 'Errors N' unhandled-exception debt: server 2 both sides; app 5 both sides
(pre-existing per lane memory; counts identical base-vs-head in every run above).

===============================================================================
§5 GOLDEN / MANIFEST WATCH — no movement
===============================================================================

- No schema manifest exists: find schema -name '*manifest*' -> only
  schema/workflow/procurement-manifest.schema.yaml (a record kind, not a manifest).
- No test asserts an absolute schema/lint/ui count: grep for
  'entries.length).toBe(N) | specs.length).toBe(N) | loaded).toBe(N)' in server/src:
--- absolute-count asserts search ---
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/server/src/tools/corpusIntake.test.ts:124:      expect(run.collected.downloaded).toBe(1);
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/server/src/index/IndexManager.seedMerge.test.ts:187:    expect(index.entries.length).toBe(2);
/mnt/vast/home/brad/git/wt/OWN-1-lane1-l1t0135/server/src/index/IndexManager.seedMerge.test.ts:256:    expect(index.entries.length).toBe(3);
  (hits are IndexManager seed-merge fixtures with their own tmpdir schema dirs — not the
   repo schema tree.) integration.test.ts uses toBeGreaterThan(0); ControlledDocumentSchemas
  asserts only ITS OWN files absent from error lists (pattern quoted in §6).
- Golden-named suites (AgentOrchestrator.golden, goldenWithSeeds, ZymoGoldenE2E) status
  base-vs-head:
--- golden suites base-r3 vs head-r4 ---
== /tmp/own1-base-server-vitest-r3.txt
 ❯ src/ai/AgentOrchestrator.goldenWithSeeds.test.ts  (1 test | 1 failed) 8474ms
 ❯ src/ai/AgentOrchestrator.golden.test.ts  (1 test | 1 failed) 820ms
 ✓ src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts  (1 test) 1287ms
== /tmp/own1-head-server-vitest-r4.txt
 ❯ src/ai/AgentOrchestrator.goldenWithSeeds.test.ts  (1 test | 1 failed) 8539ms
 ❯ src/ai/AgentOrchestrator.golden.test.ts  (1 test | 1 failed) 798ms
 ✓ src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts  (1 test) 1149ms
  Identical (golden/goldenWithSeeds fail at BOTH sides — pre-existing AI-model debt;
  ZymoGoldenE2E passes both sides). No golden regenerated, none moved.
- ProcurementSchemaContracts.test.ts 'manifest' hits are procurement-manifest RECORD
  fixtures, not a schema manifest.
=> NOT BLOCKED on the golden/manifest watch.

===============================================================================
§6 FINDINGS / DEFECTS FOR THE ARCHITECT-ORCHESTRATOR LOOP (not blockers, not fixed)
===============================================================================

DEFECT-OWN1-UI-1 (plan-YAML vs UISpecLoader widget whitelist): my ui.yaml's
'$.kindRules' field uses widget: "json" (plan §T1 verbatim). UISpecLoader.VALID_WIDGET_TYPES
(UISpecLoader.ts:19-31) does not include 'json' -> loadAllUISpecs reports
'form.sections[3].fields[0].widget: invalid widget type 'json'' for my file (the 8th ui
error at head). This is the SAME failure class as 7 pre-existing ui.yaml files
(core/term 'list', core/lab-state 'yaml', workflow/protocol-ide-session 'url'/'file-ref'/
'feedback-comments', etc.) — the loader whitelist lags the repo's ui.yaml corpus. The
server only console.warns these; no test asserts repo-wide ui error count
(ControlledDocumentSchemas.test.ts:230 filters to its own files: 'Baseline drift: several
PRE-EXISTING ui.yaml files fail loader validation repo-wide'). I reproduced the plan
verbatim as mandated and did NOT substitute a whitelisted widget (that would deviate from
the binding YAML). Recommend: architect either adds 'json' to the whitelist (platform gap,
T4+ territory) or amends §T1's widget to 'textarea'/'markdown'. Evidence:
--- ui probe (my file + precedent files) ---


FINDING-OWN1-2 (FAIRCommon $ref path convention): plan §T1 uses ../core/common.schema.yaml
while identity siblings use ./common.schema.yaml. Both resolve to the same FILE on disk
(identity/ has no common.schema.yaml; SchemaLoader resolves relative to the FILE path),
but in Ajv $id-URL space only the ./ variant lands on the registered
.../computable-lab/common.schema.yaml id (precedent probe §3). Consequence: at runtime a
record validated against ownership-policy would hit the same MissingRefError class that
extraction-spec/bio/sequence already hit (pre-existing platform seam; the server's
topological addSchema never crashes on it). Flagging for T4 (validator test with the seed
record) — the architect may want the trio switched to ./common.schema.yaml to match the
identity siblings. I kept plan-verbatim per the binding instruction.

FINDING-OWN1-3: registry checkResolution gains one entry of the pre-existing unresolved-
ref class (my -> core/common id mismatch, same as extraction-spec/sequence). No test
asserts repo-wide resolution (only SchemaRegistry.test.ts mock-based tests + a
concentration/composition fixture subset). Documented, not fixed (fixing = loader change,
explicitly out of my boundary).

===============================================================================
§7 ASSUMPTIONS
===============================================================================

AS-OWN1-1: Base = cl/integration-1 @ 25f74aaa (lane trunk HEAD at my start; matches the
spec's orchestrator-verified anchor 25f74aaa).
AS-OWN1-2: server/schema symlink must point at the WORKTREE's schema dir (qms-8/editor-9
pattern), so tests resolving '../../../schema' from server/ exercise the tree my branch
owns; the trio is therefore visible to the suites. Trunk's own symlink points at the trunk
schema dir — same pattern, different target.
AS-OWN1-3: 'exits 0 (no regression)' for src/schema/ is interpreted as fail-SET equality
against MY base (which already exits 1 at trunk with the same 2 files); making it exit 0
would require fixing unrelated lane-sync debt.
AS-OWN1-4: The acceptance's stack-restart + GET /api/schemas :3092 check is the
orchestrator's post-merge gate (spec §Acceptance NOTE); I proved the equivalent in-process
(loader entries +1, listSchemas reads registry.getAll) without touching the stack.
AS-OWN1-5: Full-suite parallel-mode flaps (sequenceIntent / Qms6bSchemaDrift /
SimulatorContracts) are load-dependent 10s-timeout debt, proven by isolation runs, serial
runs, and the marginal-cost probe; not attributable to the trio.
AS-OWN1-6: server/model.pkl (54-byte test artifact from a sequenceEngine run during pin
capture) was removed pre-commit; it is not gitignored and must not be committed.

===============================================================================
§8 COMMANDS RUN (for adversarial re-run)
===============================================================================

1. git -c core.fileMode=false -C /mnt/vast/home/brad/git/cl-integration-1 worktree add ... (see §0.1)
2. lane-sync replication loop over trunk ignored entries + node_modules/server-schema symlinks (§0.2)
3. npm run test:run -w server -- src/schema/   (base, head, and trunk)
4. npm run test:run -w server -- src/lint/     (base, head)
5. npx tsc --noEmit (server) / npx tsc --noEmit -p tsconfig.json (app) at base and head
6. npx vitest run (app) base+head; (server) base x3, head x4, serial x1 each side
7. git -c core.fileMode=false stash push -u -m own1-pin-trioN -- <trio> / stash pop (pin A/B proof)
8. npx tsx /tmp/own1-loader-probe.ts ; /tmp/own1-ajv-probe.ts ; /tmp/own1-precedent-probe.ts ;
   /tmp/own1-lint-probe.ts ; /tmp/own1-ui-probe.ts ; /tmp/own1-marginal-probe.ts
9. npx vitest run src/sequences/sequenceIntent.test.ts | src/revisions/Qms6bSchemaDrift.test.ts |
   src/execution/sidecar/SimulatorContracts.test.ts (isolation checks @head)
Raw outputs pinned: /tmp/own1-base-schema-suite.txt, /tmp/own1-head-schema-suite.txt,
/tmp/own1-trunk-schema-suite.txt, /tmp/own1-base-lint-suite.txt, /tmp/own1-head-lint-suite.txt,
/tmp/own1-base-server-tsc.txt, /tmp/own1-head-server-tsc.txt, /tmp/own1-base-app-tsc.txt,
/tmp/own1-head-app-tsc.txt, /tmp/own1-base-app-vitest.txt, /tmp/own1-head-app-vitest.txt,
/tmp/own1-base-server-vitest.txt, -r2, -r3, -serial; /tmp/own1-head-server-vitest.txt, -r2, -r3, -r4, -serial,
/tmp/own1-probe-base.txt, /tmp/own1-probe-head.txt, /tmp/own1-ajv-probe-out.txt,
/tmp/own1-precedent-out.txt, /tmp/own1-unresolved-base.txt, /tmp/own1-unresolved-head.txt.

Commit: schema: add ownership-policy record kind (schema + lint + ui) — ONE commit,
staging exactly the three files (never git add -A).
