# L2-P1-SEED-ENTRY-1 / unit seeddefs2 — coder report (lane 2)

k=2 re-scope of the BLOCKED seeddefs-1920 run (which exited with zero commits; both objections
resolved by the brief: 5-file budget, and the FixtureRunner red is pre-existing and excluded).

- worktree: /home/brad/cl-wt/L2-P1-SEED-ENTRY-1-seeddefs2-lane2
- branch: cl/lane2-p1-seedentry-seeddefs2-1958
- base: 63b47dd225af8d5b149d7e5a2768a94154cca385
- item: L2-P1-SEED-ENTRY-1-seeddefs2 (unit seeddefs, 2 of 2) — DATA change, tier consequential

## Grounding (quoted)

Decision `.hermes/plans/decisions/PROMPT1-ENTRY-STATE-l2-20261113.md` (Brad ruled option (b)):
"the pruning is a change to the lab-layer seed records, and any fixture or run that references those
ids must be re-pointed or reseeded in the same unit. Do not delete a definition that a run, event
graph or instance still points at without re-pointing it first."

`.hermes/plans/architect-context-l2.md` §2.7: "Identity is a record id, never a name." — applied
beyond the brief's letter: the ids must not survive in CODE either, so the absence test is
type-level (see Decisions).

## Domain-bait check (performed before deletion)

Whole-tree `grep -rnE 'lbw-def-generic-96-well-deep-plate|lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1'`
at base: 6 live hits, all inside owned files (the 2 seed YAMLs, 2 alias-map entries in
`server/src/ai/compiler/labwareLookup.ts`, 2 in the `TEST_LABWARE_ALIAS_MAP` stub in
`server/src/compiler/pipeline/fixtures/FixtureRunner.ts`) + the app catalogue entry. NO run, event,
or instance record references either id (records/ sweep is clean apart from the two seed files;
records/_index holds no line for either id). Deletion is safe; nothing had to be re-pointed to a
replacement — the hints simply become unresolved, which `labwareLookup.ts` declares as its intended
behaviour ("Missing exact definitions should stay unresolved").

## Changed files (numstat vs base 63b47dd2; budget 5 files / 200 lines — within)

| file | delta | change |
|---|---|---|
| records/seed/labware-definition/lbw-def-generic-96-well-deep-plate.yaml | -29 | deleted |
| records/seed/labware-definition/lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1.yaml | -36 | deleted |
| app/src/types/labwareDefinition.ts | -12 | NEST 2 mL deep catalogue entry removed (the 200 µL FLAT NEST entry kept) |
| server/src/ai/compiler/labwareLookup.ts | -2 | both alias-map bindings removed |
| server/src/compiler/pipeline/fixtures/FixtureRunner.ts | -2 | both TEST_LABWARE_ALIAS_MAP entries removed |
| server/src/seeds/labwareDefinition.absence.test.ts | +54 | new absence test (the one allowed test) |

Net 133 lines (54 added / 79 removed). 6 files = 5 owned product files + the one test the brief
explicitly allows ("extend … or add a focused seed test — your call").

## Decisions

1. **Alias-map removals are in-scope, not prohibited.** The brief owns "any alias-map entry pointing
   at them" and AC2 demands ZERO hits of both ids over `server/src app/src records config` at the
   tip. The two `LABWARE_ALIAS_MAP`/`TEST_LABWARE_ALIAS_MAP` entries are the only such entries.
   `FixtureRunner.ts` itself is in the prohibited directory — only its 2 alias lines were touched
   (no test file, no logic). Removing an alias key is pure re-pointing-away: the hint now resolves
   to nothing instead of a nonexistent record (a dangling identity). No test asserts those keys.
2. **The absence test is legacy-type-level, not id-named.** AC2 forbids the ids from surviving in
   the tip, so a test that spells them out would make AC2 and the test mutually exclusive. The
   ruling's invariant is "no 96-well deepwell plate in the lab's stock"; both removed records (and
   the removed catalogue entry) carried `legacy_labware_types: [deepwell_96]` and were the ONLY
   seeded/catalogue definitions with that type (verified by sweep), so type-absence implies
   id-absence and is the stronger guard: any future re-seed of a deepwell_96 definition goes RED.
   The vendored registry copy `schema/registry/labware-definitions/96-well-deepwell-plate.yaml` is
   the "not this lab's stock" catalogue tier — intentionally untouched (another live unit opens it).
3. **Commit discipline as briefed:** commit 1 = RED test; commit 2 = all deletions + alias/catalogue
   removals + test re-pin (one identity-integrity commit); commit 3 = report; commit 4 = marker.

## Evidence (all runs from repo root, real output)

Tooling note: root `npx vitest` resolves Hermes-agent's vitest 4.1.10 and fails to load the repo's
vitest 1.6.1 workspace configs (`Cannot find module 'vitest/config'`). All vitest runs used the
repo's own `server/node_modules/.bin/vitest` (v1.6.1) / `app/node_modules/.bin/vitest`; typecheck
used `npm run typecheck -w server|app`.

### Base measurements (at 63b47dd2, before any change)

- seeds suite: `Test Files 4 passed | 1 skipped (5)`, `Tests 69 passed | 10 skipped (79)`, exit 0.
  (The brief's "1 failed | 35 passed (36)" was run-1's earlier base; at THIS base the parity suite
  is green because the catalogue still matches the seeds — the parity guard goes red only when the
  two outlive each other, which is why the brief names it as the guard for removal-in-one-commit.)
- FixtureRunner.test.ts: `Test Files 1 failed (1)`, `Tests 1 failed | 2 passed (3)` —
  `AssertionError: expected 8 to be +0` at FixtureRunner.test.ts:70 (`diff.extra.length`).
  PRE-EXISTING at base, exactly as the brief predicted (diff.extra=8). Not mine; excluded from my
  green bar; untouched.
- server typecheck: exit 0. app typecheck: exit 2 with 8 pre-existing errors
  (RefCombobox.ontologyref.test.tsx TS2322 + 7 others) — the baseline.

### RED (commit 1, id-level test form, at base)

`Tests 5 failed | 70 passed | 10 skipped (85)` — the 5 failures are exactly the absence
assertions (2× seed file present, 2× recordId still carried, 1× NEST catalogue entry present).

### RED (final type-level test, at base — throwaway worktree at 63b47dd2, then removed)

`Tests 2 failed | 69 passed | 10 skipped (81)` with:
`deepwell_96 definitions still seeded: lbw-def-generic-96-well-deep-plate.yaml,
lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1.yaml: expected [ …(2) ] to deeply equal []` and
`deepwell_96 offered by the app catalogue: expected [ Array(1) ] to deeply equal []`.

### GREEN (tip, after commit 2)

- seeds suite: `Test Files 5 passed | 1 skipped (6)`, `Tests 70 passed | 10 skipped (80)`, exit 0.
- FixtureRunner.test.ts: UNCHANGED pre-existing red — `Tests 1 failed | 2 passed (3)`,
  `expected 8 to be +0` (same line, same count; the toy fixture's '96-well plate' hint resolves
  via the fuzzy token path, not the removed deepwell keys).
- `server/src/ai/compiler/labwareLookup.test.ts`: `Tests 8 passed (8)`.
- app `labwareDefinitionResolver.test.ts` (app vitest): `Tests 10 passed (10)`.

### AC1 — deletions named by git log --diff-filter=D

`git log --diff-filter=D --name-only 63b47dd2..HEAD` → commit `d082f3cf` names exactly
`records/seed/labware-definition/lbw-def-generic-96-well-deep-plate.yaml` and
`records/seed/labware-definition/lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1.yaml`. PASS.

### AC2 — zero hits at tip

`grep -rnE 'lbw-def-generic-96-well-deep-plate|lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1'
server/src app/src records config` → no output, exit 1 (no matches). PASS. (Whole-tree remainder is
only .hermes/ plan documents and the replay-harvest corpus, both out of scope and DO-NOT-READ.)

### AC4 — typecheck at final commit

- `npm run typecheck -w server`: exit 0 (PASS).
- `npm run typecheck -w app`: 8 errors; the `(file,line,code)` set is byte-identical to the base
  baseline (`diff` of both lists empty) → ZERO new errors vs the pre-existing
  RefCombobox.ontologyref.test.tsx TS2322 baseline. PASS.

### Served state (NOT re-measured — I cannot restart the lane stack; orchestrator owns the reload)

Measured before-state (brief): 43 labware-definition records, both ids HTTP 200. Expected after the
orchestrator reloads the lane stack: 41 records; both ids HTTP 404. Flagged for the orchestrator's
post-reload verification.

## Commits

- `54dcfb86` — L2-P1-SEED-ENTRY-1-seeddefs2: RED absence test (id-level form, committed as step 1)
- `d082f3cf` — L2-P1-SEED-ENTRY-1-seeddefs2: prune the two 96-well deepwell labware definitions
  from the lab-layer seed (deletions + catalogue/alias removals + test re-pinned type-level)
- report commit: this file (sha recorded in the marker below, which is appended by the next commit)

## Blockers / next actions

- None for this unit. For the orchestrator: (1) reload the lane stack and verify the served state
  (41 records, both ids 404); (2) the pre-existing FixtureRunner.test.ts red (diff.extra=8) is
  excluded from this unit's green bar and remains a separate defect to own; (3) the registry copy
  opening (make the deepwell plate openable from the catalogue tier) is the other live unit.

## Re-verification commands (from repo root)

- `server/node_modules/.bin/vitest run server/src/seeds/` → expect 70 passed | 10 skipped
- `server/node_modules/.bin/vitest run server/src/compiler/pipeline/fixtures/FixtureRunner.test.ts` → expect the unchanged pre-existing 1 failed (extra=8)
- `grep -rnE 'lbw-def-generic-96-well-deep-plate|lbw-def-opentrons-nest-96-wellplate-2ml-deep-v1' server/src app/src records config` → expect no matches
- `npm run typecheck -w server` → expect exit 0
