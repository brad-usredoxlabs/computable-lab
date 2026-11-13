# L2-JOURNEY-CHECKPOINT-1 — UNIT 5 (cpdeclare) — report

Run: cl-coder brief, lane 2. Worktree
`/home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cpdeclare-lane2`, branch
`cl/lane2-journey-checkpoint1-cpdeclare-0339`, base `821f83a666a246bac48658cfca79ac9b2435b063`.
All numbers below measured in THIS run (2026-11-13 ~04:17-04:20 EST).

## Environment note (measured, not assumed)

The brief says "node_modules is provided" — this worktree had no node_modules
at start. The sibling cpschema2 lane worktree (same base, byte-identical
pnpm-lock.yaml — verified by git hash-object) carries symlinks into the
provided vast store; I mirrored exactly those two links, nothing else:

- `node_modules -> /mnt/vast/home/brad/git/cl-integration-2/node_modules`
- `server/node_modules -> /mnt/vast/home/brad/git/computable-lab/server/node_modules`

Both paths are gitignored (`.gitignore:5-6`), so `git status` stays clean; no
install was run, no package was added.

## What landed (3 files, 118 insertions vs base — within the <=3 / <=200 budget)

- `schema/ui/surface-manifest.schema.yaml` (+19 lines): closed `checkpoint:`
  object added to the per-surface `properties`, immediately after the `gate:`
  block and before `description:` (exactly per THE CHANGE shape):
  `additionalProperties: false`, `required: [exports, restores]`, each of
  `exports`/`restores` an array with `uniqueItems: true`, items
  `{type: string, pattern: ^[a-z][a-z0-9_]*$}`. Descriptions state the prose
  semantic (exported into a checkpoint's restoration_state / read back to
  restore the surface to the exact spot) and mark themselves documentation,
  not rule text. manifestVersion stays `1.0.0` (additive optional key — no
  bump required or made).
- `config/ui/surfaces.yaml` (+6 lines): the SAME byte-identical declaration on
  the two journey surfaces only, after each surface's `gate:` block and before
  its `description:` (verified by diff against HEAD~1: two identical
  3-line insertions, lines 24-26 and 42-44; no other surface touched):
  `checkpoint: {exports: [selected_wells], restores: [selected_wells]}`.
  `selected_wells` is the only name — the proven source site is
  `app/src/shared/context/WellSelectionContext.tsx:38`
  (`selectedWells: new Set()`). No other surface got the block; opt-in is the
  contract.
- `server/src/schema/SurfaceManifestCheckpointDecl.test.ts` (NEW, 93 lines):
  first line `// @vitest-environment node`; reuses the load-Ajv-validate idiom
  from SurfaceManifestSchema.test.ts:17-30 verbatim (registry from
  `schema/ui/surface-manifest.schema.yaml`, parseYaml of the committed
  `config/ui/surfaces.yaml`, `createValidator({strict:false})`,
  topological addSchema). Five tests:
  1. committed manifest validates (errors == []) AND run-workspace +
     event-editor each carry `checkpoint.exports == ['selected_wells']` and
     `checkpoint.restores == ['selected_wells']` (drift pins against the data,
     per the hardcode-boundary allowance);
  2. SYMMETRY + shape for every surface that declares `checkpoint`: sorted
     exports == sorted restores; every name unique within its array (count
     check); every name matches `/^[a-z][a-z0-9_]*$/`;
  3. opt-in drift check: exactly the two journey surfaces declare a
     checkpoint, no other;
  4. a surface with NO checkpoint declaration is still valid (mutated copy
     with all `checkpoint` keys deleted validates clean);
  5. NEGATIVE: mutated copy with `exports: ['selected_wells']`,
     `restores: []` is rejected — the assertion message names which check
     fires. Measured (probe, scratch): Ajv itself returns valid=true on the
     mutation because the schema is shape-only by design (it cannot express
     cross-field equality; that is precisely why this contract test exists).
     So the SYMMETRY assertion is the check that fires.

## RED (step 1, before schema/manifest edits — raw vitest output)

Command: `cd server && npx vitest run src/schema/SurfaceManifestCheckpointDecl.test.ts`

```
 ❯ src/schema/SurfaceManifestCheckpointDecl.test.ts  (5 tests | 2 failed) 139ms
   ❯ … > validates the committed manifest and pins the run-workspace + event-editor checkpoint declarations
     → run-workspace must declare checkpoint.exports in config/ui/surfaces.yaml: expected undefined to deeply equal [ 'selected_wells' ]
   ❯ … > declares no other surface a checkpoint (the declaration is opt-in)
     → only the two journey surfaces declare a checkpoint: expected [] to deeply equal [ 'run-workspace', 'event-editor' ]

 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

(Raw capture: /tmp/cpdeclare-red.txt. The two failures are the declaration
pins; the negative test passed in RED because the per-surface object was
closed (`additionalProperties: false`, schema line 40) so the unknown
`checkpoint` key was itself rejected by Ajv — the schema-only/manifest-only
split the reviewer-bait section warns about is why the GREEN commit lands
schema + manifest + test together.)

## GREEN (step 2+3, after schema + manifest edits — raw vitest output)

Targeted: `cd server && npx vitest run src/schema/SurfaceManifestCheckpointDecl.test.ts`

```
 ✓ src/schema/SurfaceManifestCheckpointDecl.test.ts  (5 tests) 122ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  04:18:32
   Duration  2.13s (transform 63ms, setup 0ms, collect 560ms, tests 122ms, environment 0ms, prepare 63ms)
```

(Raw capture: /tmp/cpdeclare-green.txt.)

## Regression on the two touched-surface neighbour suites

Command: `cd server && npx vitest run src/schema/SurfaceManifestSchema.test.ts src/schema/SurfaceManifestLint.test.ts`

```
 ✓ src/schema/SurfaceManifestLint.test.ts  (5 tests) 74ms
 ✓ src/schema/SurfaceManifestSchema.test.ts  (4 tests) 109ms

 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  04:18:34
   Duration  701ms (transform 232ms, setup 0ms, collect 135ms, tests 183ms, environment 0ms, prepare 135ms)
```

(Raw capture: /tmp/cpdeclare-regression.txt.) The pinned id list in
SurfaceManifestSchema.test.ts:35 is unchanged and passes (AC3).

## Typecheck

I changed no .ts signature, but ran it anyway since a new .ts file was added:
`cd server && npx tsc --noEmit` -> **0 lines** of output, exit 0 (raw capture:
/tmp/cpdeclare-tsc.txt).

## Acceptance contract mapping (this unit's legs)

- AC1: `config/ui/surfaces.yaml` read back shows run-workspace and event-editor
  each declaring `checkpoint: {exports: [selected_wells], restores:
  [selected_wells]}` and no other surface declaring it — test 1 + test 3 pin
  exactly this against the committed file; green above.
- AC2 (negative): the copy with `restores` emptied is rejected — the failing
  assertion name when the fix is absent is
  `rejects a surface that exports state but restores nothing (asymmetry)`,
  message "an asymmetric checkpoint declaration must be caught by Ajv
  validation or the symmetry assertion"; with the declaration present, the
  symmetry assertion is the named firing check (Ajv is shape-only). Editing
  `surface-manifest.ui.yaml` was NOT done (prohibited; a row is not required).
- AC3: every surface still validates (test 1: committed manifest errors == []
  over all 20 surfaces) and the pinned id list passes unchanged (regression
  above, 9/9 including SurfaceManifestSchema.test.ts).
- ACCEPTANCE: waived for browser per the brief (data-only unit; durability
  browser legs are the item's milestone gate, not this unit).

## Budget / boundary audit

- Files: 3 (the three owned files). Insertions vs base: 118 (93 + 19 + 6),
  measured by `git diff --stat 821f83a6..HEAD -- <3 paths>`. Within <=3 /
  <=200.
- `surface-manifest.ui.yaml`, `surface-manifest.lint.yaml`, the three
  neighbour tests, the branch-only workflow schemas, ai-threads/compiler/api/
  validation dirs, app/src, records, all other schemas, /tmp, /mnt/vast: not
  opened for edit, not reformatted. /mnt/vast was read-only symlink source
  (node_modules), never modified.
- `manifestVersion` stays `1.0.0` — additive optional key; bumping would force
  a drift edit in SurfaceManifestSchema.test.ts, which is prohibited.
- Test reads `any` from YAML; Ajv is the single validation authority; the only
  TS check beyond Ajv is the symmetry assertion (cross-field equality the
  schema cannot express) — no hand-rolled shape/enum validator, no legal
  field-name list as a TS constant.
- Scratch: `/home/brad/.cpdeclare-scratch/probe.mts` (determined which check
  fires on the asymmetric mutation) — deleted at exit. Raw captures in /tmp
  are ephemeral; their summaries are pasted above verbatim.

## Commits on this branch (beyond base 821f83a6)

- `f1edeccf` — RED: cpdeclare contract test (2/5 fail at base)
- `0e323d26` — GREEN: closed checkpoint object in schema + byte-identical
  declarations on the two journey surfaces + symmetry-assertion fix (one
  commit, per the same-commit reviewer bait)
- this report commit (the marker sha below is its sha — the commit that
  CONTAINS this report)

## Next actions (owner: orchestrator / downstream units)

- Unit 6 (cpclient) may now read the declaration from data instead of
  hardcoding field names.
- Item milestone gate: durability browser legs (reload / back / second tab) —
  explicitly NOT this unit.

--- exit marker ---

L2-JOURNEY-CHECKPOINT-1 UNIT 5 DONE 3a21700ebb4d8f82dbc4f38a68edc0aa75bc2337
L2-JOURNEY-CHECKPOINT-1 UNIT cpdeclare DONE 3a21700ebb4d8f82dbc4f38a68edc0aa75bc2337
