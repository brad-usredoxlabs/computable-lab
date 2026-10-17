# SPEC DRAFT — OWN-3: Seed the default lab ownership document OWN-LAB-DEFAULT
Lane 1 · wave-3 lab-ownership-and-sharing-policy · l1t0130 · drafted 2026-10-11 by cl-spec-composer
Status: DRAFT — orchestrator review/promotion required; NOT canonical, NOT dispatchable as-is.

## Item + why (one line)
OWN-3: create `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml` — the
single declarative document the campaign exists for, seeded as a versioned, AI-editable
record (D6) rather than config.
Task-list `why` verbatim: "The document must live as a versioned, AI-editable record (D6),
not config.yaml. Lab-shared physical resources are what the campaign is FOR — per D12 they
get an admin GROUP, not one person owning everything."

## Dependencies (binding facts)
- OWN-1 (schema trio) IS MERGED before this dispatch; the seed validates against the OWN-1
  schema (`schema/identity/ownership-policy.schema.yaml`). FIRST CHECK: that file exists at
  the worker's base commit; if absent, STOP `blocked` — gate violated.
- OWN-2 (union line) is coder-serial with this item (fleet single coder); files are
  DISJOINT (`schema/core/record.schema.yaml` vs `records/seed/**`). Either order is clean.
- Real validation of this seed (Ajv against the trio + unsafe-fallback rejection) lands in
  OWN-4's test — OWN-3 does NOT author test files.

## Worktree / branch convention
- Orchestrator creates the worktree; worker never branches trunk.
- Branch: `wt/OWN-3-lane1-l1t0130` off `cl/integration-1` (trunk @ 25f74aaa at spec time —
  re-anchor to actual post-OWN-1(-2)-merge HEAD at dispatch).
- ALWAYS `git -c core.fileMode=false` in lane trees (NFS mode-bit noise).
- Never touch `/mnt/vast/home/brad/git/computable-lab`, main, :3001/:5174/:3092/:5192.

## The file to create (exact paths, grounded)
File (new dir + new file): `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml`
Filename convention verified: `RECORDID__slug.yaml`, same as existing seeds
(`records/seed/equipment/eqp-centrifuge.yaml` = `EQP-CENTRIFUGE__...` style uses
recordId-or-slug + `__`-free older forms; the `__slug` form matches the live data-dir
convention, e.g. `USR-QMS-ADMIN__untitled.yaml` seen in lane reports, and matches the plan
path verbatim — use the plan's exact filename).

Grounded seed-consumption facts (composer verified first-hand on the lane trunk):
- `records/seed/identity/` DOES NOT EXIST on the trunk (verified: `ls records/seed/` =
  equipment, equipment-capability, equipment-class, graph-components, labware,
  labware-definition, labware-definitions, materials, platforms, protocols, README.md,
  verb-definition). OWN-3 creates it.
- Seed dir resolution: `server/src/index/seedRecordsDir.ts:13-23` walks up for
  `records/seed/`; wired at `server/src/server.ts:480-486` (`resolveSeedRecordsDir()` passed
  as `seedDir` into `createRecordStore`).
- GET-by-id pickup: `server/src/store/RecordStoreImpl.ts` — `get()` falls back to
  `getSeedRecord()` (:245-249) which RECURSIVELY walks the whole seed tree
  (`findSeedRecordPath` :172-221, `getSeedRecord` :223-240 stamps `meta.commitSha:'seed'`).
  A new subdirectory is picked up with zero code changes.
- Index/browser pickup: `server/src/index/IndexManager.ts:236-259` — `rebuild()` recursively
  scans `resolveSeedRecordsDir()` and merges seeds whose recordId is absent from the lab.
  (The kind-filtered store listing at RecordStoreImpl.ts:438-446 joins
  `seedDir/<filter.kind>` and already misses existing seeds whose dir != kind name
  — materials/, protocols/ — same known behavior; the recursive paths above are the pickup
  routes that matter here.)
- PARSE REQUIREMENT (load-bearing, this is the plan-expansion below):
  `server/src/store/RecordParser.ts:94-110` — a seed file is SKIPPED (silently, "Skip
  malformed seed files" RecordStoreImpl.ts:216) unless the payload carries
  `recordId`|`id` AND `$schema`|`schemaId` (field lists at :43-45). Every existing seed has
  a `$schema:` first line (verified: eqp-centrifuge.yaml:1, prt-seed-pbs-wash.yaml:1,
  mat-seed-dmso-anhydrous.yaml:1).

## Live pickup witness (composer captured on :3092, pre-dispatch)
- `curl -s http://localhost:3092/api/records/EQP-CENTRIFUGE` -> 200 (seed pickup path works
  today through the running lane server).
- `curl -s http://localhost:3092/api/records/OWN-LAB-DEFAULT` ->
  `{"error":"NOT_FOUND","message":"Record not found: OWN-LAB-DEFAULT"}` — the exact
  before-state for the post-restart pickup check.

## The payload — plan §T3 YAML verbatim, PLUS one mandated header line
MANDATED EXPANSION (not a contradiction — the plan itself says "Seed records are plain
record payloads; same shape as other `records/seed/**` files", and every one of those files
opens with `$schema:`; without it `parseRecord` rejects the file and the seed is inert):
the delivered file's FIRST line is

```yaml
$schema: https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml
```

Flat `$id` form — verified convention: existing seeds use exactly
`$schema: https://computable-lab.com/schema/computable-lab/<kind>.schema.yaml` with no
`identity/` segment (plan §T1 convention note; access-policy.schema.yaml:2 confirms the
flat $id style). No trailing slash, unquoted (matches neighbors).

Then the plan §T3 body VERBATIM (composer machine-parsed this exact block from the plan at
25f74aaa — parses clean, 11 kindRules, 5 defaultGrants rows, fallback as below; transcribe
character-for-character, comments included):

```yaml
kind: ownership-policy
recordId: OWN-LAB-DEFAULT
title: Lab Ownership & Sharing Policy
description: >
  Default ownership/sharing rules for this lab. New drafts (protocols, local
  protocols, claims, sequences) belong to their creator and are private until
  shared. Shared resources (materials, instruments, labware, vendor products)
  belong to the lab: any member may read them, only the lab owner/grantees may
  write or operate. Local protocols created inside a project file into that
  project.
scope:
  type: lab
  id: lab
labOwnerUserId: USR-LOCAL-ADMIN
fallback:
  owner: creator
  visibility: private
  filedTo: none
  editRoles: [owner, editor]
  shareTargets: [user, group, project, lab]
kindRules:
  # ---- personal drafts: creator-private; local protocols file into the project
  - kind: local-protocol
    owner: creator
    visibility: private
    filedTo: active-project
    editRoles: [owner, editor]
    shareTargets: [project, lab, user, group]
  - kind: protocol
    owner: creator
    visibility: private
    filedTo: none
    editRoles: [owner, editor]
    shareTargets: [lab, project, user, group]
    publishRole: owner
  - kind: sequence
    owner: creator
    visibility: private
    filedTo: none
    editRoles: [owner, editor]
    shareTargets: [lab, user, group]
  - kind: claim
    owner: creator
    visibility: private
    filedTo: none
    editRoles: [owner, editor]
    shareTargets: [lab, project, user, group]
  # ---- lab-shared physical resources: readable lab-wide, written by owner/admin.
  # `defaultGrants` stamps the lab admin GROUP as admin on every lab-owned record,
  # so a multi-user lab is not bottlenecked on the single labOwnerUserId above.
  # Create GRP-LAB-ADMINS (with its members) first; an unresolved group is inert.
  - kind: material
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: material-spec
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: material-instance
    owner: creator
    visibility: private
    filedTo: active-project
    editRoles: [owner, admin]
    shareTargets: [project, user, group]
  - kind: aliquot
    owner: creator
    visibility: private
    filedTo: active-project
    editRoles: [owner, admin]
    shareTargets: [project, user, group]
  - kind: instrument
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: equipment
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: labware
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
```

Commit message (plan §T3 verbatim): `records(seed): default lab ownership & sharing policy`
Stage ONLY the new file + dir (`git add records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml`);
never `git add -A`.

Out of scope: every other file. NO test files (OWN-4), NO schema edits (OWN-1), NO union
edit (OWN-2), NO server code (OWN-7+ owns stamping), NO app/ edits. NO group record, NO
data-dir writes: GRP-LAB-ADMINS creation is a LANE DATA action owned by the
orchestrator/Brad, never code, never this seed.

## RED-first expectations
OWN-3 ships data, not tests (the TDD anchor is OWN-4's OwnershipPolicySchema.test.ts).
RED = the pickup assertions fail before the file exists:

1. RED (before creating the file), from repo root:
   `test -f records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml; echo $?`
   -> `1` (verified: dir does not exist at 25f74aaa).
   And structural RED via the real parser contract:
   `node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parse} from 'yaml'; try { const p=parse(readFileSync('records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml','utf8')); console.log('PARSED', !!p['\$schema'], p.kindRules.length) } catch(e){ console.log('MISSING') }"`
   -> `MISSING`.
2. Create dir + file ($schema line + plan body verbatim). GREEN: same command ->
   `PARSED true 11`.
3. GREEN house-shape check (mirrors RecordParser.ts:94-110 requirements): payload has
   `recordId` AND `$schema` AND `kind` — else the seed is silently inert at runtime:
   `node --input-type=module -e "import {readFileSync} from 'node:fs'; import {parse} from 'yaml'; const p=parse(readFileSync('records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml','utf8')); console.log([p.recordId,p['$schema'],p.kind,p.scope.type,p.labOwnerUserId,p.fallback.owner,p.kindRules.length].join('|'))"`
   -> `OWN-LAB-DEFAULT|https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml|ownership-policy|lab|USR-LOCAL-ADMIN|creator|11`

## Acceptance criteria (task-list OWN-3 block, verbatim)
> verified by: npm run test:run -w server -- src/validation/ green (no regression); the
> file parses as a record payload matching the T1 schema (real validation lands with
> OWN-4's test).

Operational reading on the lane (composer additions, do not substitute):
- "green (no regression)": composer measured at 25f74aaa
  `Test Files 4 passed (4); Tests 42 passed (42)`, exit 0 — RE-CAPTURE at the worker's own
  base commit; expect identical, no drift.
- "parses as a record payload matching the T1 schema": RED step 2-3 above proves parse;
  the schema-shape proof at OWN-3 time is a manual Ajv spot-check the worker MAY run (see
  first-targeted-check extension) but is NOT a committed test — OWN-4 formalizes it.
- LANE PICKUP (orchestrator-run, after the diff lands): `cl-lane-stack.sh 1 restart`, then
  `curl -s http://localhost:3092/api/records/OWN-LAB-DEFAULT` must return 200 with the
  payload (was NOT_FOUND — composer-verified pre-state). The worker does NOT restart the
  lane stack; tsx --watch does NOT reload YAML/seed files (lane rule).

### First targeted check (single early-proving command)
RED step 1's node one-liner (`MISSING`) before the file, `PARSED true 11` after — proves
the whole approach (dir, filename, parse-ability, rule count) in one command.

### Full verification commands (worker runs, expected output)
```
cd <worker worktree>
node ... (RED steps 2-3 one-liners)                       # expect `PARSED true 11`, `OWN-LAB-DEFAULT|...|11`
npm run test:run -w server -- src/validation/ 2>&1 | tail -5
#   expect exit 0, same counts as worker's base capture (composer saw 42/42 at 25f74aaa)
npm run test:run -w server -- src/seeds/ 2>&1 | tail -5
#   expect no regression (material/labware seed-count tests read their own dirs — new
#   identity/ dir cannot affect them; proves seed-tree additions don't break seed suites)
npm run test:run -w server -- src/index/ 2>&1 | tail -5
#   expect no regression (IndexManager.seedMerge.test.ts uses temp dirs, not records/seed)
npm run test:run -w server -- src/schema/ 2>&1 | tail -20
#   expect the SAME pre-existing failure FILE/TEST SET as base capture — see lane pins
```
Optional Ajv spot-check (allowed, not deliverable — no committed test): load
`core/common.schema.yaml` + `core/datatypes/ref.schema.yaml` +
`identity/ownership-policy.schema.yaml` via `loadSchemasFromContent` +
`createValidator({strict:false})` and validate the parsed seed against
`https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml`; paste the
result in the report. (Harness precedent: BiologicalTypesSchema.test.ts:100-116.) If it
FAILS validation, that is either a seed transcription error (fix) or a real OWN-1 schema
gap (STOP, requires-rescope — do NOT bend the seed to dodge the schema).

## Lane pins (worker captures at ITS OWN base commit — do not trust prior numbers)
Before any edit, record in the report:
- server tsc error-line MULTISET: `npm run typecheck -w server 2>&1 | grep -E "error TS" | sort`
- app tsc error-line MULTISET: `npm run typecheck -w app 2>&1 | grep -E "error TS" | sort`
- app vitest FAIL-FILE SET: `npm run test:unit -w app 2>&1 | grep -E "^ FAIL" | sort -u`
- server schema-suite failure set: composer measured at 25f74aaa
  `Test Files 2 failed | 32 passed | 5 skipped (39); Tests 5 failed | 278 passed | 53 skipped (336)`,
  FAILs in `EventGraphEquipmentSchema.test.ts` (3) and `LabwarePhysicalGeometryData.test.ts` (2)
  — PRE-EXISTING. "Exit 0" is NOT achievable today; the honest claim is the unchanged
  failure set. Do NOT "fix" those failures (out of scope), do NOT report exit-0.
Any drift after a seed-only addition = wrong merge base or leaked edits — STOP, `blocked`.

## Constraints inherited (wave-3 rules, binding)
- D1-D13 binding verbatim. This item specifically: D6 (document is data, in git, seeded in
  records/seed/identity/ — NOT config.yaml), D9 (the creator-private rows mirror today's
  effective behaviour and change NOTHING until OWN-7 stamping lands — transcribe, do not
  "improve" values), D12 (GRP-LAB-ADMINS is referenced before it exists; unresolved grants
  are INERT by design, never fabricate the group; group creation is a lane DATA action by
  the orchestrator, never code, never this task), D10/D11 (no per-member enumeration
  anywhere in the document — it speaks roles/groups, not people lists).
- NEVER touch `schema/identity/ownership-policy.*` (OWN-1 owns) or
  `schema/core/record.schema.yaml` (OWN-2 owns). Disjoint-file contract.
- YAML-reload trap: the seed is read fresh per process start; `tsx --watch` does NOT pick
  up new seed files mid-run. Pickup proof requires the ORCHESTRATOR's
  `cl-lane-stack.sh 1 restart` + curl. Worker proves parse/shape locally; states the
  live-pickup line as orchestrator-pending in the report.
- No hardcoded domain logic: this task IS data. Zero TS. (exactOptionalPropertyTypes
  untouched; ontology note: every kind name in the document must match an existing record
  kind — verified by composer: `claim` (schema/knowledge/claim.schema.yaml `const: "claim"`),
  `sequence` (schema/bio/sequence.schema.yaml `const: "sequence"`), `local-protocol`
  (schema/workflow/local-protocol.ui.yaml + compile-pipeline registry), protocol/material/
  material-spec/material-instance/aliquot/instrument/equipment/labware all union members in
  record.schema.yaml. Inventing a new kind noun here is a violation — CLAUDE.md rule 7.)
- Stop-boundary: NEW platform gap (e.g. seeds under a never-before-used `identity/` subdir
  provably cannot be picked up despite the recursive code paths above) => STOP with
  evidence, `requires-rescope` to architect. Never absorb, never hand-forge into the lane
  data dir as a workaround.

## Deliverable report
Path: `/home/brad/.hermes/cl/lanes/1/own3-report-l1t0130.wip.md`
- Mark in-progress on claim; only the orchestrator marks done.
- Contents: base commit sha, four captured baselines, RED outputs, GREEN outputs (steps 1-3),
  full test outputs, Ajv spot-check transcript if run, commit sha+message, explicit
  "GRP-LAB-ADMINS intentionally unresolved (D12)" line, and the live-pickup line marked
  orchestrator-pending with the exact curl.
- End marker (lane convention, verified against ops-1c/qms8 reports): final line exactly
  `STATUS: complete` (or `STATUS: blocked` / `STATUS: requires-rescope` + reason).

## Reviewer-bait section (adversarial-review pre-emptions)
1. THE MISSING `$schema` LINE: the plan's §T3 YAML block has no `$schema:` line (composer
   verified by machine-parsing the plan block itself). A literal transcriber ships a seed
   that `parseRecord` rejects (RecordParser.ts:96,105-110) and that is SILENTLY skipped at
   every pickup layer (RecordStoreImpl.ts:216 "Skip malformed seed files"). The spec
   mandates the header line above — the reviewer should check the DELIVERED file's line 1
   equals the mandated `$schema:` line, and that nothing else was added.
2. Silent-inert failure mode: because malformed seeds are skipped without error, "tests
   green" does NOT prove the seed loads. The curl pickup (200 on
   /api/records/OWN-LAB-DEFAULT post-restart) is the only end-to-end proof; the report must
   carry it (orchestrator) before done.
3. Transcription drift: any reworded comment, reordered kindRule, `editRoles` value change,
   or "helpful" vendor-product rule (the description prose mentions vendor products but the
   plan declares NO vendor-product kindRule) is a defect — D9 says mirror the plan exactly;
   the prose/kindRules mismatch is the plan's, leave it, it's on Brad's open-questions list.
4. Folded-scalar damage: `description: >` block must survive the editor (no reflow to
   double-quoted single line, no indentation change). Diff against the plan block.
5. YAML flow-map style: `defaultGrants: - { principalType: group, ... }` inline maps are
   intentional (plan verbatim, parses to 5 grant rows — composer verified). "Consistency"
   rewrites to block style churn the diff without changing semantics — reject.
6. Directory placement: `records/seed/identity/` per the plan, NOT `ownership-policies/` or
   pluralized to match materials/-protocols- style. The GET-by-id and index pickup paths are
   recursive (RecordStoreImpl.ts:183-221, IndexManager.ts:237-239) so the name is free — the
   plan chose `identity/` to mirror `schema/identity/`; keep it.
7. Fabrication bait: "creating GRP-LAB-ADMINS while I'm here" or seeding a USR-LOCAL-ADMIN
   record into the seed tree = out of scope + D12 violation + (for data dir) the
   never-code rule. Reject on sight.
8. Baseline honesty: claiming `src/schema/` exit-0 is false on this trunk (5 pre-existing
   failures, list above). The correct claim is an unchanged failure SET.
9. exactOptionalPropertyTypes: not exercised (no TS) — any TS in the diff is scope creep.

## OPEN ANCHOR / open questions
1. OPEN ANCHOR (resolved-as-expansion, orchestrator must ratify): the plan §T3 payload
   lacks `$schema:`. This spec mandates line 1 =
   `$schema: https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml`.
   Grounding: RecordParser.ts:94-110 (hard requirement), RecordStoreImpl.ts:216 (silent
   skip), all existing seeds carry the field. If the orchestrator rules "plan verbatim, no
   header", the seed is inert by construction and OWN-4's test will RED on it — recommend
   ratifying the header.
2. Whether OWN-4's test (deps OWN-1+OWN-3) should also pin `$schema` presence — composer
   checked: plan §T4's sketched test reads the seed with plain `yaml.parse` +
   `validator.validate({schemaId, payload})` (plan lines ~484-493), which validates the
   WHOLE payload including a `$schema` key against a `unevaluatedProperties:false` schema.
   Risk: the trio's top-level `unevaluatedProperties: false` + FAIRCommon mixin does NOT
   declare `$schema`, so OWN-4's own test may reject the header line. Composer could not
   settle this without running Ajv on the trio (which does not exist on the trunk yet —
   OWN-1 not merged at draft time). FLAG TO ORCHESTRATOR: if OWN-4 goes RED on the
   `$schema` key, the fix belongs in OWN-1's schema lint/ui decision, not in dropping the
   seed header — escalate, do not loop.
   Checked: plan §T1 YAML (unevaluatedProperties:false, required list), common.schema.yaml
   FAIRCommon property list (no $schema among properties), RecordParser strips `$schema`
   BEFORE envelope payload normalization (:112-119) — note the store strips it but a raw
   file-parse test like T4's does NOT.
3. Minor: filename double-underscore convention confirmed from live data-dir reports, not
   from records/seed/ (no `__` files there today); plan names the path verbatim so it
   stands regardless. Checked: plan §T3, `find records/seed -name '__*'` = none.
