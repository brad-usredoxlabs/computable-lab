# L2-ONTOLOGY-ANCHOR-SOURCES-1 — unit anchor-d1fix (1 of 1) — DONE report

Worktree: /home/brad/cl-wt/L2-ONTOLOGY-anchord1fix-lane2
Branch:   cl/lane2-ontology-anchor-d1fix-0715 (base d1b375548c313e42d1a40bc6365c82c28338181c)
Lane:     2

## Defect (browser gate g4 LEG 3 DEFECT 1)

A labware-definition created through /record/new/labware-definition 400'd on
save: POST /api/records -> `payload must contain recordId or id field`
(server/src/api/handlers/RecordHandlers.ts:669). Root cause: the create form
exposed `$.id` as readonly in schema/workflow/labware-definition.ui.yaml, and
the client mints no id for non-spine kinds (GC-16 D-A;
app/src/event-editor/create/RecordCreatePanel.tsx:204 — untouched by design;
the handler never mints an id either, lines 664-671).

## Fix (data-only UI-spec seam, no TypeScript)

Files (2, within OWNED set; output budget met — 14 insertions + 1 deletion
across the two commits, within the <=40 lines / <=2 files budget):

1. schema/workflow/labware-definition.ui.yaml — `$.id` field: `readonly: true`
   -> `required: true` + `placeholder: "e.g. lbw-def-my-plate@v1"`, with one
   comment line noting WHY (author-supplied stable id, GC-16 D-A: client
   mints no knowledge ids). Mirrors the execution-plan precedent
   (schema/workflow/execution-plan.ui.yaml:26-29).
2. server/src/ui/LabwareDefinitionUiSpec.test.ts — one new `it(...)` inside
   the existing describe: walks `result.spec.form.sections[].fields[]` via the
   real createUISpecLoader for `path === '$.id'` and asserts
   `readonly !== true` and `required === true`. Existing style followed
   (real file read + real loader).

NOT touched: labware-definition.schema.yaml (lines 11-15 already list `id` in
top-level `required:`, so UI now matches schema), RecordCreatePanel.tsx,
server handlers, any other ui.yaml, ontology resolve code.

## Verification (all measured in this worktree, 2026-11-13 ~07:32 EST)

Environment note: this worktree materialized without node_modules (the
fleet pattern per sibling worktrees). Restored the fleet-standard symlink
`server/node_modules -> /mnt/vast/home/brad/git/cl-integration-2/node_modules`
(identical to L2-LABMAT-D1fix-lane2; package.json files identical across the
workspaces, lockfile vitest 1.6.1). node_modules is gitignored (root
.gitignore line 5-6); git status clean except the 2 owned files.

Command: `cd <worktree>/server && npx vitest run src/ui/LabwareDefinitionUiSpec.test.ts`

- BASELINE (HEAD = base d1b37554, before any edit):
  `Test Files  1 passed (1)` / `Tests  4 passed (4)` — matches brief baseline.
- RED (commit 1, fbc709b623d1a9afd2bbecd9bc71841127081eb5 — test only):
  `FAIL  src/ui/LabwareDefinitionUiSpec.test.ts > labware-definition ui spec — ontology anchor field (LEG 2) > the $.id Identifier field is authorable (not readonly) and required`
  `AssertionError: expected true not to be true // Object.is equality` at LabwareDefinitionUiSpec.test.ts:87
  `Test Files  1 failed (1)` / `Tests  1 failed | 4 passed (5)`
- GREEN (commit 2, 3a8889f361482f01caca5d5794114c57e0581e01 — yaml fix):
  `✓ src/ui/LabwareDefinitionUiSpec.test.ts  (5 tests)`
  `Test Files  1 passed (1)` / `Tests  5 passed (5)`

Typecheck: `cd <worktree>/server && npx tsc --noEmit` -> rc=0 (baseline rc=0,
unchanged; no TypeScript changed).

## Commits

- fbc709b623d1a9afd2bbecd9bc71841127081eb5 — test only (RED pin; RED failure line in message)
- 3a8889f361482f01caca5d5794114c57e0581e01 — yaml fix (GREEN 5/5 in message)
- this report commit — carries the report + DONE marker

## Acceptance status

1. Save seam fixed at the data/spec level (form now authors + requires the id
   the handler demands; anchor CURIE save verified at the browser gate —
   separate from this unit's scope).
2. LabwareDefinitionUiSpec.test.ts: 5/5 PASS with the new not-readonly +
   required assertion. RED->GREEN order proven by commit order above.
3. No TypeScript files changed; server tsc rc=0 unchanged.

Remaining blocker (owner: browser gate / orchestrator): none from this unit.
Live browser verification of a full save with an author-supplied Identifier
and a confirmed ontology anchor belongs to the g4 LEG 3 re-gate (lane-stack
reload required after YAML change per fleet rules).

---
L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT anchor-d1fix DONE <report-commit-sha>
