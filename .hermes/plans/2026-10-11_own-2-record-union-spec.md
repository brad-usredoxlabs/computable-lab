# SPEC DRAFT — OWN-2: Register ownership-policy in the repo-wide record union
Lane 1 · wave-3 lab-ownership-and-sharing-policy · l1t0130 · drafted 2026-10-11 by cl-spec-composer
Status: PROMOTED by orchestrator 2026-10-11T0230 (anchors verified first-hand: record.schema.yaml:7 oneOf, :37 access-policy ref, flat $id :2, grep count 0). Canonical for dispatch after OWN-1 merges.

## Item + why (one line)
OWN-2: add the ONE union line that makes `ownership-policy` visible to whole-record
validation and the record browser — without it the kind is invisible to every
repo-wide consumer of `schema/core/record.schema.yaml`.
Task-list `why` verbatim: "Without the union entry the kind is invisible to whole-record
validation and the record browser. Reuses the existing identity ref block verbatim — one
line, no new machinery."

## Dependencies (binding facts)
- OWN-1 (schema trio) IS MERGED to `cl/integration-1` before this dispatch. The worker
  builds on the merged trunk; `schema/identity/ownership-policy.schema.yaml` exists at the
  worker's base commit. FIRST CHECK: `[ -f schema/identity/ownership-policy.schema.yaml ]`
  must succeed; if absent, STOP — the dispatch gate was violated, report `blocked`.
- OWN-3 is coder-serial after/before this (fleet has ONE coder) but touches DISJOINT files
  (OWN-3 = records/seed/**; OWN-2 = schema/core/record.schema.yaml). No coordination needed.
- No file overlap with QMS-8/EDITOR surfaces (plan §Reconciliation: the OWN-1..OWN-6 set is
  file-conflict-free).

## Worktree / branch convention
- Orchestrator creates the worktree; the worker never branches trunk itself.
- Branch: `wt/OWN-2-lane1-l1t0130` off `cl/integration-1` (trunk was @ 25f74aaa at spec
  time — re-anchor to the actual post-OWN-1-merge HEAD at dispatch).
- ALWAYS `git -c core.fileMode=false` for any git command in lane trees (NFS mode-bit noise).
- Never touch `/mnt/vast/home/brad/git/computable-lab`, main, or :3001/:5174/:3092/:5192
  processes.

## The edit (exact, grounded on the LANE trunk)
File (edit, +1 line): `schema/core/record.schema.yaml`

Verified lane anchors (composer read first-hand at 25f74aaa):
- `schema/core/record.schema.yaml:7` = `oneOf:` — this file IS the repo-wide record union
  ("Union schema for validating any computable-lab record", :5).
- Identity ref block: `:35` user, `:36` group, `:37` `- $ref: "../identity/access-policy.schema.yaml"`.
  The plan's "after line 37" anchor HOLDS on the lane — insert immediately after :37,
  before `:38` (`- $ref: "./training-material.schema.yaml"`).
- Union `$id` is flat: `https://computable-lab.com/schema/computable-lab/record.schema.yaml` (:2).

The verbatim plan §T2 line to add (paste exactly — two-space indent, double quotes, same
style as neighbors):

```yaml
- $ref: "../identity/ownership-policy.schema.yaml"
```

Commit message (plan §T2 verbatim): `schema: include ownership-policy in the record union`
Stage ONLY this file (`git add schema/core/record.schema.yaml`); never `git add -A`.

Out of scope: every other file. NO test file edits (OWN-4 owns the schema contract test).
NO edits to `schema/identity/ownership-policy.*` (OWN-1 owns them), `records/**`, `server/**`,
`app/**`.

## Registration-surface recon (what else enumerates kinds — verified, nothing else needs an edit)
Grepped `'access-policy'` across the lane trunk. Every other identity-kind mention is
ACL-specific and NOT a kind-registration surface; none needs an OWN-2 edit:
- `server/src/security/AuthorizationService.ts:10` ACCESS_POLICY_SCHEMA_ID const,
  `:108` SELF_MANAGING_KINDS (['user','group','access-policy']), `:176` list by kind —
  all about ACL *evaluation*, not kind registration. `ownership-policy` must NOT be added
  to SELF_MANAGING_KINDS in this wave.
- `server/src/api/routes.ts:274-275`, `IdentityHandlers.ts:106,311,356,384` — ACL admin
  route plumbing, access-policy-only.
- There is NO server-side kind→schemaId registry to update: per-record validation resolves
  the record's own `$schema` field (RecordParser path); `loadAllSchemas` auto-discovers
  `schema/**/*.schema.yaml` (SchemaLoader.ts:33 DEFAULT_PATTERNS, recursive :158; wired at
  server.ts:348,360,363 — "Loaded N schemas"). The union `oneOf` is the ONLY repo-wide
  enumeration surface; its `$id` is referenced by no code file (grep
  `computable-lab/record.schema.yaml` in server/ app/ scripts/ = 0 code hits).
- ONE test consumes the union: `server/src/schema/BiologicalTypesSchema.test.ts:27` includes
  `'core/record.schema.yaml'` in its load subset. It loads via
  `loadSchemasFromContent` + `createValidator({strict:false})` (its :100-116) and validates
  only term/plate-event ids — Ajv compiles the union lazily, so the new ref to a schema
  outside its subset does NOT break it. Verified at base: the suite passes this file today.
  Do not "fix" it. If it goes red, that is a reviewer-bait hit — see below.

## RED-first expectations
OWN-2 is a pure-data registration task (plan §T2 has no test; the TDD anchor is OWN-4).
RED here = the assertion fails before the edit:

1. RED (expect 0): run from repo root at the worker's base commit:
   `node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parse} from 'yaml'; const u=parse(readFileSync('schema/core/record.schema.yaml','utf8')); console.log((u.oneOf||[]).filter(r=>(r['$ref']||'').includes('ownership-policy')).length)"`
   -> `0` (verified by composer at 25f74aaa). If not 0, the edit already exists — STOP,
   double-dispatch.
2. Apply the +1 line. GREEN (expect 1): same command -> `1`.
3. GREEN (plan wording): `grep -n ownership-policy schema/core/record.schema.yaml` shows
   exactly ONE match.
No new test file is authored by this task; writing one violates the disjoint-files contract
with OWN-4.

## Acceptance criteria (task-list OWN-2 block, verbatim)
> verified by: grep -n ownership-policy schema/core/record.schema.yaml shows exactly one match;
> server schema tests still green after lane restart.

Operational reading on the lane (composer additions, do not substitute):
- "still green" ≠ "exit 0": the trunk schema suite ALREADY HAS 5 pre-existing failures
  (composer measured at 25f74aaa: `Test Files 2 failed | 32 passed | 5 skipped (39);
  Tests 5 failed | 278 passed | 53 skipped (336)`; FAILs in
  `EventGraphEquipmentSchema.test.ts` and `LabwarePhysicalGeometryData.test.ts`). The
  worker captures the failure FILE+TEST SET at ITS OWN base commit (post-OWN-1-merge —
  do NOT trust the numbers above, they drift) and proves NO NEW failures.
- "after lane restart" = the ORCHESTRATOR runs `cl-lane-stack.sh 1 restart` after the diff
  lands. The worker NEVER restarts the lane stack itself. Post-restart loader pickup proof
  (orchestrator): backend log still prints `Loaded N schemas` (count UNCHANGED by this
  edit — the trio already loaded via OWN-1; only the union gains a ref) and
  `npm run test:run -w server -- src/schema/` shows the same failure set as the worker's
  base capture, no more.

### First targeted check (proves the approach early)
The RED/GREEN node one-liner above (step 1→2). One command, seconds, exact.

### Full verification commands (worker runs, with expected output)
```
cd /mnt/vast/home/brad/git/cl-integration-1   # or the worker's wt/ branch checkout
grep -n ownership-policy schema/core/record.schema.yaml
#   expect: exactly 1 line: `38:- $ref: "../identity/ownership-policy.schema.yaml"`
#   (line number = old 37's successor; exact position after the access-policy ref matters)
node --input-type=module -e "...(the step-2 one-liner)..."   # expect 1
npm run test:run -w server -- src/schema/ 2>&1 | tail -20
#   expect: same failure FILE/TEST set as the worker's base capture; 278+ passing; NO new failure
npm run test:run -w server -- src/validation/ 2>&1 | tail -5
#   expect exit 0: composer measured `Test Files 4 passed (4); Tests 42 passed (42)` at
#   25f74aaa — re-capture at own base, expect no regression
```

## Lane pins (worker captures its OWN baselines at its own base commit — never trust prior numbers)
Before any edit, record in the report:
- server tsc error-line MULTISET: `npm run typecheck -w server 2>&1 | grep -E "error TS" | sort`
  (pre-existing server TS errors exist on this trunk lineage — capture the multiset, prove
  byte-identical after; this task is YAML-only so ANY drift means a bad merge base, STOP).
- app tsc error-line MULTISET: `npm run typecheck -w app 2>&1 | grep -E "error TS" | sort`
- app vitest FAIL-FILE SET: `npm run test:unit -w app 2>&1 | grep -E "^ FAIL" | sort -u`
  (or the suite's failure-file summary lines).
- server schema-suite failure set (see acceptance above) + validation-suite pass counts.
Diffs to any of these four baselines after a YAML-only change = wrong merge base or leaked
edits — STOP and report `blocked`, do not chase.

## Constraints inherited (wave-3 rules, binding)
- Plan §"Pinned decisions" D1-D13 are binding verbatim. For OWN-2 specifically: D1 (no new
  ACL system), D8 (no third role system — nothing in this task touches roles at all).
- NEVER edit `schema/identity/ownership-policy.{schema,lint,ui}.yaml` — OWN-1 owns them.
  If the merged trio looks wrong, report it; do not fix it here.
- Unresolved grants inert by design (D12): not exercised by this task, do not "help" by
  touching seed or group data — GRP-LAB-ADMINS creation is a lane DATA action (orchestrator/
  Brad), never code.
- YAML-reload trap: `tsx --watch` does NOT reload `*.schema.yaml`. Verification after the
  edit requires the orchestrator's `cl-lane-stack.sh 1 restart`. A green vitest proves
  fresh-YAML validity (vitest reads files at run time); it does NOT prove the live :3092
  server picked it up. Worker states both facts separately in the report.
- exactOptionalPropertyTypes stays on (not exercised — no TS in this diff).
- Hardcode boundary (CLAUDE.md "Non-Negotiable Rules"): this task IS the fix for one
  hardcoded policy; adding any kind-name branching in TS would violate it. Zero TS edits.
- Stop-boundary: a NEW platform gap (e.g. the union edit provably breaks an Ajv surface in
  a way the recon above did not predict) => STOP, write evidence in the report, return
  `requires-rescope` to the architect. Never absorb.

## Deliverable report
Path: `/home/brad/.hermes/cl/lanes/1/own2-report-l1t0130.wip.md`
- Mark in-progress on claim; only the orchestrator marks done.
- Contents: base commit sha, the four captured baselines, RED output (count 0), GREEN
  output (count 1 + grep), full test outputs, tsc multisets unchanged, commit sha+message,
  deviations/observations.
- End marker (lane convention, verified on ops-1c/qms8 reports): final line exactly
  `STATUS: complete` (or `STATUS: blocked` / `STATUS: requires-rescope` with the reason).

## Reviewer-bait section (adversarial-review pre-emptions)
1. Insertion point drift: the line goes AFTER the access-policy ref (:37), inside the
   identity block — not appended at file end. OneOf order is semantically irrelevant to
   Ajv but a misplaced line invites "why not here?" review churn and merge pain.
2. Duplicate registration: grep must show EXACTLY one match. A careless worker adds both a
   core and an identity-style ref, or edits a test fixture copy — any second match fails
   acceptance verbatim.
3. Quote/indent style: `"$ref":` style neighbors use double quotes, two-space indent,
   `- ` bullet. A single-quote or `+` diff artifact is a style defect.
4. The `oneOf` trap: `oneOf` requires EXACTLY ONE branch to validate. If the OWN-1 trio
   schema is too permissive it could accidentally match a foreign kind and flip another
   kind's union validation — the failure would land in whichever suite loads the union
   (BiologicalTypesSchema.test.ts). Mitigation already in place: the trio declares
   `kind: const ownership-policy` + `recordId: ^OWN-` + unevaluatedProperties:false (plan
   §T1), so cross-match is structurally impossible. If it nonetheless fires, that is an
   OWN-1 schema gap => STOP/requires-rescope, do NOT bandage the union with `anyOf`.
5. YAML-reload trap (stated above): claiming "verified live" without the orchestrator
   restart + log/curl re-check is a false-verification defect.
6. exactOptionalPropertyTypes / ontology terms: not exercised by this item — if the report
   mentions touching TS or inventing new kind nouns, that is scope creep, reject.
7. Baseline honesty: reporting "schema tests green (exit 0)" is FALSE on this trunk (5
   pre-existing failures). The correct claim is the unchanged failure SET. A reviewer
   finding an exit-0 claim should treat it as fabricated.

## Open questions (unresolved by composer)
1. Whether BiologicalTypesSchema.test.ts's lazy-compilation behavior could ever compile
   the union eagerly (Ajv internals). Composer evidence: the suite is green today with a
   union ref set that ALREADY contains cross-domain refs; lane run of the full schema suite
   confirms. Risk judged low; flagged for reviewer.
   Checked: its load path (loadSchemasFromContent), AjvValidator lazy addSchema
   (AjvValidator.ts:241-257), lane test run at 25f74aaa.
