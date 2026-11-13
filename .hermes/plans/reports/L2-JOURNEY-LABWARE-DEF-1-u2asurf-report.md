# L2-JOURNEY-LABWARE-DEF-1 / unit u2asurf — report

Item: L2-JOURNEY-LABWARE-DEF-1
Unit: u2asurf (1 of 1 — surface-admission leg)
Worktree: /home/brad/cl-wt/L2-JOURNEY-LABWARE-DEF-1-u2asurf-lane2
Branch: cl/lane2-journey-labware-def-1-u2asurf-1759
Base (trunk): 0c4d1542917f0d60eda245ed996c522ba4c4a183
Lane: 2

## GOAL (restated)
Admit the already-UI-declared `record-create` work surface into the work-surface
registry by replacing the registry's closed id `enum` with the `pattern` that already
exists, so a journey `human_task` declaring `surface: record-create` lints instead of
being refused `journey_human_task_surface_unknown`. The registry stays the refuser for
pattern-invalid / absent ids; only the closed allow-list is removed.

## CONTEXT (architect-context-l2.md, section read)
Read §2 (the load-bearing distinctions) + the decision path named by the brief.
Governing line honored: surface identity is a controlled vocabulary enforced in the
registry (DATA) + Ajv (single structural authority, repo rule #3), never a hardcoded
allow-list in TypeScript (repo rule #1). The closed `enum` in surfaces.schema.yaml WAS
the surviving allow-list; this unit removes it and keeps the open `pattern`. The
registry, not TypeScript, remains the refuser. If the repository disagreed with the
context file, the repository wins — it did not; the loader (surfaces.ts:69-71) already
states "There is deliberately NO id allow-list in TypeScript," so the schema enum was
the one surviving allow-list and its removal is consistent with the declared doctrine.

## DECISIONS
1. Remove the closed `enum` (surfaces.schema.yaml:33); KEEP `pattern: '^[a-z][a-z0-9-]*$'`
   (surfaces.schema.yaml:32). Deleting both would be a silent authority removal
   (REVIEWER BAIT #3). The pattern is now the sole id constraint; Ajv still validates it.
2. Append ONE surface entry (DATA) to surfaces.yaml after the `sequences` block:
   - id: record-create
   - label: "Record create"
   - path: "/record/new/:nodeType"  (NOT the UI route's `:parentId?` — the loader binds
     EXACTLY the path tokens, surfaces.ts:91-96; an unbound optional token throws at load.
     REVIEWER BAIT #1.)
   - params: { nodeType: record }
   - objectTypes: [record]
   - selectableKinds: []
   - aiRole: "author a new record in place"
   - (no `paths:` key)
3. `:nodeType` objectType binding = `record` (the objectType that fills the token).
   Grounding, not a guess: the loader contract (surfaces.ts:81-98) requires `params` to
   map each `:token` to a non-empty objectType string and to bind EXACTLY the path tokens;
   `/record/new/:nodeType` has exactly one token. The token is filled with the record kind
   being authored (study/experiment/run/claim/…) — CreateMenu.tsx:39 (`/record/new/claim`),
   RecordRegistryPage.tsx:509, WorkspaceTabStrip.tsx:203, urlSession.ts:142-147. The object
   under authoring is always a RECORD (route family `/record/new/`, RecordCreatePanel authors
   `kind: nodeType` records). The registry's `objectTypes`/`params` values are OPEN strings —
   precedent in the same file: `sequence`, `oligo-spec`, `assay-definition`, `analysis-run`
   (surfaces.yaml:95) are all registry-only types NOT in the closed `ContextObjectType`
   union (ContextDescriptor.ts:9-19), so a registry value outside that union is legal and
   does not invent a record kind. `selectableKinds: []` is schema-legal (empty list; the
   `project` precedent at surfaces.yaml:75) and invents no record kinds (REVIEWER BAIT #5).
4. `aiRole` present (required-by-usage string, non-empty), NOT `undefined`
   (exactOptionalPropertyTypes, REVIEWER BAIT #2). `params` present (deep-linkable).
   `tabs` ABSENT (omitted, not undefined).
5. Contingent 4th file (server/src/surfaceContext/SurfaceContext.ts union) NOT needed:
   `npm run typecheck` (npx tsc --noEmit) is 0 errors on the final commit. The new id is
   pure YAML DATA; the loader casts `id as SurfaceId` (surfaces.ts:75) and
   validateHumanTaskContract takes `surface: string` (humanTaskContract.ts:30). SurfaceContext.ts
   remains PROHIBITED and untouched.
6. Output budget honored: 3 files (≤4), 97 net lines (1 deletion + 9 additions + 87 new
   = 97, ≤120).

## CHANGED FILES (exactly 3; all within SCOPE owned list)
- schema/registry/surfaces/surfaces.schema.yaml  (-1 line: deleted closed enum at :33; kept pattern at :32)
- schema/registry/surfaces/surfaces.yaml        (+9 lines: one record-create entry after sequences)
- server/src/surfaces/surfaces.recordCreate.test.ts (+87 lines, new pin)
`git diff --name-only 0c4d1542 HEAD` → exactly these 3 paths (verified).
NO product .ts file edited; NO prohibited file opened (surfaces.ts, the four pre-existing
test files, config/ui/surfaces.yaml, server/src/compiler/journey/**, config/journey/** all
untouched).

## NOT CHANGED (verified)
- The 11 pre-existing surface ids/labels/paths, the `sequences` tabs entry, the loader
  (surfaces.ts), and the four pre-existing test files — all untouched (diff shows only the
  3 owned paths).
- The pin asserts the 11 pre-existing ids are still declared (admission = extension).

## VERIFICATION (raw outputs)

Environment: node_modules symlinked from the sibling u2adecl-lane2 worktree (gitignored;
`git check-ignore node_modules server/node_modules` → both ignored, so they are NOT
committed). No dependencies installed, no worktree scaffolding.

### TRUE BASELINE at 0c4d1542 (clean tree, measured)
`cd server && npx vitest run src/surfaces/`:
    Test Files  3 passed (3)
           Tests  13 passed (13)
Base `npx tsc --noEmit`: exit 0, 0 output lines.
NOTE (stale brief baseline): the brief's nominal baseline "Test Files 1 failed | 3 passed
(4); Tests 5 failed | 20 passed (25)" references `server/src/surfaces/surfacesAjv.test.ts`.
That file is ABSENT at base 0c4d1542 in this worktree (verified via `git ls-tree` /
`git cat-file 0c4d1542:server/src/surfaces/surfacesAjv.test.ts` → not in the tree; the
branch's `src/surfaces/` has only 3 test files at base). So the TRUE base here was
3 files / 13 tests GREEN, not 4 files / 5 failed. My honest delta is measured against the
TRUE base (see below). The "2 pre-existing legacy failures (event-editor / 8 legacy
surfaces)" and the "3 arbitrary-surface / no-TS-allow-list failures" cited in the brief
do not exist in this worktree's base — nothing to decrease, nothing was added.

### STEP 1 — RED (no product edit yet)
`cd server && npx vitest run src/surfaces/surfaces.recordCreate.test.ts`:
    Test Files  1 failed (1)
           Tests  4 failed | 1 passed (5)
Failing as expected: (a) record-create exists, (b) path/params, (c) zero diagnostics —
all fail because the registry lacks record-create. (d) passes (the refuser already refuses
an absent id). Raw (c) failure:
    AssertionError: expected [ { …(3) } ] to deeply equal []
      "message": "step complete-definition human_task declares surface 'record-create',
        which the work-surface registry does not declare",
      "rule": "journey_human_task_surface_unknown"

### STEP 2 — removed enum, kept pattern (boot-regression gate)
`cd server && npx vitest run src/surfaces/` (schema only changed):
    Test Files  1 failed | 3 passed (4)
           Tests  4 failed | 14 passed (18)
The 3 pre-existing test files STILL PASS → no meta-schema / boot regression; Ajv validates
the pattern-only schema and the registry still loads. The 4 failures are the pin's
(a)/(b)/(c) (registry still lacks the entry). (d) + all pre-existing tests pass.

### STEP 3 — appended registry entry; pin + suite
`cd server && npx vitest run src/surfaces/surfaces.recordCreate.test.ts`:
    Test Files  1 passed (1)
           Tests  5 passed (5)
`cd server && npx vitest run src/surfaces/`:
    Test Files  4 passed (4)
           Tests  18 passed (18)
DELTA vs TRUE base: base 3 files / 13 tests (green) → final 4 files / 18 tests (green).
+1 pin file, +5 tests. Failures: 0 → 0 (none added, none removed). "Failures decreased,
none added" holds vacuously (base had none); the shipped-registry pin proves the
record-create entry is loaded through the real loader + Ajv, not a fixture.

### MUTATION PROBE (re-add closed enum)
Temporarily re-added `enum: [record-create-removed]` to surfaces.schema.yaml (the new
entry in place), then:
`cd server && npx vitest run src/surfaces/surfaces.recordCreate.test.ts`:
    Error: surfaces registry invalid: data/surfaces/0/id must be equal to one of the
      allowed values, … data/surfaces/11/id must be equal to one of the allowed values
    Test Files  1 failed (1)
           Tests  no tests
→ FAILS at registry load (Ajv enum refusal, ×12 surfaces). Confirms the pin is the real
shipped-registry refuser. Reverted before committing.
Revert proof:
    git -c core.fileMode=false status --short  →  (empty, 0 lines)
    git diff --stat                             →  (empty)
After revert, pin re-run:
    Test Files  1 passed (1); Tests  5 passed (5)

### TYPECHECK (final commit)
`cd server && npx tsc --noEmit` → exit 0, 0 output lines. (The new id is YAML DATA; the
loader casts `id as SurfaceId`; validateHumanTaskContract takes `surface: string`. The
contingent 4th file SurfaceContext.ts was NOT needed and remains untouched.)

### CLEAN TREE AT EXIT
`cd /home/brad/cl-wt/L2-JOURNEY-LABWARE-DEF-1-u2asurf-lane2 && git -c core.fileMode=false status --short`
→ empty (0 lines).

## SCRATCH / HYGIENE
Scratch dir: /home/brad/.u2asurf-scratch/ (red.txt, pin-green.txt, suite-green.txt,
mutation.txt, base-tsc.txt, final-tsc.txt) — outside the worktree, deleted at exit.
No scratch files in the worktree or /tmp.

## COMMITS (history, no rewrite)
- d4bc642a  u2asurf step1: RED pin for record-create work-surface admission
- 09112c5b  u2asurf step2: remove closed id enum, keep open pattern
- 06171516  u2asurf step3: admit record-create into the work-surface registry
- (this report committed after the above; marker references the report-body commit below)

## ACCEPTANCE (waived — data-registry unit)
Observable proven by the pin (step 4 of THE CHANGE): GET /api/surfaces will return a
record-create entry (the served registry is the same schema/registry/surfaces/surfaces.yaml
loaded at boot), and the u2adecl journey lint pin flips from refused
(journey_human_task_surface_unknown) to accepted (zero diagnostics for a human_in_the_loop
step on record-create). Item-level browser gate covers LABWARE-DEF-1 Units AC1-AC3.

## NEXT ACTIONS / REMAINING BLOCKERS
- None for this unit. u2adecl's journey document (config/journey/declarations/
  labware-definition.yaml) can now lint against the open registry; that file is owned by
  u2adecl/u2acap, not this unit. u2b/u3 (pilot journey document / return leg) are unblocked.
- Owner of any future browser acceptance of the record-create surface itself: the item-level
  browser gate (not this unit).
- No domain-contract change; the change is confined to registry DATA + its structural
  schema (enum → pattern), both within the approved scope.

---

L2-JOURNEY-LABWARE-DEF-1-u2asurf UNIT u2asurf DONE 5c5f05a6459fb8660459facfaf1275892ab60bce
