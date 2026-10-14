# SPEC — OWN-1: Schema trio for ownership-policy (schema + lint + ui)

Item: OWN-1 · campaign lab-ownership-and-sharing-policy (wave 3, APPROVED by Brad 2026-10-10)
Status of plan of record: .hermes/plans/2026-10-10_192635-lab-ownership-and-sharing-policy.md §T1
carries the AUTHORITATIVE YAML for all three files — reproduce it verbatim. This spec wraps the
plan with worker mechanics and lane-verified anchors. D1-D13 pinned decisions are binding.

## What to build (new files ONLY — no edits to any existing file)
1. schema/identity/ownership-policy.schema.yaml   (plan §T1 block 1, verbatim)
2. schema/identity/ownership-policy.lint.yaml     (plan §T1 block 2, verbatim)
3. schema/identity/ownership-policy.ui.yaml       (plan §T1 block 3, verbatim)

HARD BOUNDARY: do NOT touch schema/core/record.schema.yaml (that is OWN-2), do NOT touch any
existing schema/lint/ui file, do NOT touch server code, no app/ edits. New files only.

## Lane-verified anchors (orchestrator verified first-hand on cl/integration-1 @ 25f74aaa)
- Auto-discovery: server/src/server.ts:348 calls loadAllSchemas({ basePath: schemaDir,
  recursive: true }) — the plan's ":355" is main-side drift; NO manifest edit is needed.
- Lint auto-discovery: server/src/lint/LintSpecLoader.ts (LINT_PATTERN '.lint.yaml', recursive
  find ~:209) — a new *.lint.yaml under schema/ is picked up with no registration.
- Flat-$id CONVENTION (verified live): schema/identity/access-policy.schema.yaml has
  $id: https://computable-lab.com/schema/computable-lab/access-policy.schema.yaml — NO /identity/
  segment. Keep the new $id and both schemaId fields EXACTLY
  https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml.
- schema/identity/ currently holds access-policy, group, role-grant, user (schema + role-grant
  lint). records/seed/identity/ does NOT exist (OWN-3 owns it — not you).

## Pins (capture at YOUR base yourself; multiset/SET equality, not bare counts)
- server tsc error-line multiset + app tsc error-line multiset at your branch base -> report.
- app vitest fail-FILE SET at base. Zero NEW failing files after your change.
- SCHEMA GOLDENS/MANIFEST WATCH: adding a schema can move a golden or manifest that enumerates
  schema files/counts. Run the schema suite (below); if a golden/manifest check moves, STOP and
  report — do NOT regenerate or "update" goldens.

## Workflow (RED-first where applicable)
There is no product behaviour to test — the "tests" are the schema/lint loader suites proving
the trio loads and validates. First run `npm run test:run -w server -- src/schema/` and the lint
loader suite at base (baseline), then add the three YAML files, then re-run: same fail-set, no
new errors, and confirm your new schema loads in the loader path used by tests (if a loader test
enumerates schema entries, note whether the new one appears — that is evidence, not a change you
make). Commit once: `schema: add ownership-policy record kind (schema + lint + ui)`.

## Acceptance criteria (task-list verbatim)
"npm run test:run -w server -- src/schema/ exits 0 (no regression); after a LANE STACK RESTART
the schema loads (server log 'Loaded N schemas' count +1) and GET /api/schemas on :3092 lists
ownership-policy. Schema alone, no behaviour yet."
NOTE: the LANE STACK RESTART and the :3092 curl are the ORCHESTRATOR's post-merge verification —
do NOT restart the lane stack, do NOT run curl against :3092/:5192, do NOT touch :3001/:5174.

## Stop boundary
New platform gap (e.g. loader rejects the trio in a way the plan's YAML cannot satisfy, or a
golden enumerates schemas and moves) -> STOP, preserve work, report `BLOCKED <reason>`; the
architect decides. Do not "fix" the loader.

## Deliverable
Report (write ONLY this path, commit it in your final commit):
/home/brad/.hermes/cl/lanes/1/own1-report-l1t0135.wip.md — per-file rationale, every command
with VERBATIM tail output (adversarial review re-runs them; paraphrase = defect), pin evidence,
assumptions (AS-OWN1-*). End marker exactly: OWN1 CODER DONE <head-sha>. If blocked:
BLOCKED <reason>, preserve everything committed.
