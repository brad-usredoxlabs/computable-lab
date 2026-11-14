# REPORT — L2-P1-SEED-ENTRY-1 / unit 4 (regflag)

- Lane: 2 · Worktree: /home/brad/cl-wt/L2-P1-SEED-ENTRY-1-regflag-lane2
- Branch: cl/lane2-p1-seedentry-regflag-2140 (off base c7c1d8f4dbb1f26e205e627b7e383ec1cd2669ca)
- Item: L2-P1-SEED-ENTRY-1 (alias L2-P1-SEEDREGISTRY-DATA-1) · unit token: regflag (4 of 5: seeddefs, seeddefs2, seedreg[live], regflag, regguard)
- Tick: l2t2140 · Date: 2026-11-13

## Grounding (quoted, per profile duty)

Governing line, `.hermes/plans/architect-context-l2.md` §2.7:
"7. **Identity is a record id, never a name.** Names, labels and aliases only pre-select a candidate;"

Decision: `.hermes/plans/decisions/DEFINITION-IDENTITY-UNIQUENESS-l2-20261113.md` AMENDMENT at
c7c1d8f4 — point 1: "Offered means it exists. A registry entry may be OFFERED as bindable labware
only when its id is a store recordId"; point 2: "Not bindable is a create-door prefill, never an
option"; point 3: "No 19 new records." Scenario: prompt-1.
Both grounding files read in-tree and agree with the brief; no stale-claim conflict found.

Domain-bait check (SECOND AUTHORITY + DRAFT-TREATED-AS-COMMITTED): the declaration lives ONLY in the
labware-definition schema and in the four registry YAML data rows. No sidecar `offerable-ids.yaml`,
no TypeScript array of bindable ids, no store-record copy of the flag. `records/` is untouched
(0 files changed under records/ between base and HEAD) — writing the flag creates no record.

## Commits (base → final)

- 7737d7f57d5646bb28f983fd7bb28ea1461860d9 — L2-P1-SEED-ENTRY-1 regflag: declare offerable boolean in
  labware-definition schema (beside read_only; not required — absence means not offerable). 1 file, +3.
- 119799baa4fa033355e2fa1229b443d28ac04599 — L2-P1-SEED-ENTRY-1 regflag: mark the four store-backed
  registry entries offerable: true (24-well, 96-well, 80x2ml tube rack, single-trough 25ml). 4 files, +4.
- (report commit: this file — sha recorded in the marker appended by the next commit, per fleet
  containment shape; no history was rewritten at any point)

Total: 5 files, +7 lines (budget: files ≤ 5, lines ≤ 120 — within). No new YAML file appears.

## Changed files (exactly the 5 owned)

1. schema/workflow/labware-definition.schema.yaml — `offerable:` property added inside `properties:`,
   directly after `read_only` (which was at :90; declaration now at :93), verbatim shape per brief.
   NOT added to `required:` (verified: required block still lists only kind/id/display_name plus the
   ldefsave-u1 comment; absence is the meaningful default for the 19 catalogue-only entries).
2. schema/registry/labware-definitions/24-well-plate.yaml — `offerable: true` at line 4, directly under `recordId:` (line 3).
3. schema/registry/labware-definitions/96-well-plate.yaml — same placement.
4. schema/registry/labware-definitions/80x2ml-tube-rack.yaml — same placement.
5. schema/registry/labware-definitions/single-trough-25ml-reservoir.yaml — same placement.

Invariants: `git diff -U0` over the four registry files shows ONLY added lines (no removed or
modified line); every `recordId:`, `id:`, `display_name:`, `topology:`, `capacity:`,
`platform_aliases:` value byte-identical. 96-well-deepwell-plate.yaml and all other registry YAMLs
untouched (live seedreg unit owns that file; duplicate-writer class avoided).

## RAW evidence

### Step 1 — RED (measured at base c7c1d8f4, before any edit)

    $ grep -c '^  offerable:' schema/workflow/labware-definition.schema.yaml
    0            (exit code 1)
    $ grep -rl '^offerable:' schema/registry/labware-definitions/ | wc -l
    0

Note: root `additionalProperties: false` at labware-definition.schema.yaml:10 rejects an undeclared
`offerable` key today — a registry YAML carrying the flag would fail Ajv validation before this unit
declares it. That is the RED. (Verified in-tree: :10 `additionalProperties: false`, :90 `  read_only:`.)

Anchor re-verification (read/grep, not quoted from the brief): the four registry files carry
`recordId:` at line 3 each, with the four store-recordId values from the brief;
`server/src/registry/LabwareDefinitionRegistry.ts:82` `const DIR = resolve(__dirname,
'../../../schema/registry/labware-definitions');` unchanged and not owned here.

### After commits — the no-second-authority greps

    $ git grep -n '^offerable' -- .
    schema/registry/labware-definitions/24-well-plate.yaml:4:offerable: true
    schema/registry/labware-definitions/80x2ml-tube-rack.yaml:4:offerable: true
    schema/registry/labware-definitions/96-well-plate.yaml:4:offerable: true
    schema/registry/labware-definitions/single-trough-25ml-reservoir.yaml:4:offerable: true
    $ grep -c '^  offerable:' schema/workflow/labware-definition.schema.yaml
    1            (at line 93, inside properties:)

Exactly the four registry YAMLs plus the schema declaration; nothing else. No sidecar, no TS list.

    $ git grep -n 'lbw-def-generic-' -- server/src
(matches are ALL pre-existing files — labwareLookup.ts ALIAS_MAP, fixtures, tests, passes — none
touched by this unit; `git diff --name-status base..HEAD` lists only the 5 YAML files, so this unit
added no id list anywhere in server/src)

### VERIFY — two-direction set relation (final tree)

1. registry ∩ store recordIds:

    $ comm -12 <(grep -rh '^recordId:' schema/registry/labware-definitions/*.yaml | sed 's/^recordId: *//' | sort) \
              <(grep -rh '^recordId:' records/seed/labware-definition/*.yaml | sed 's/^recordId: *//' | sort)
    lbw-def-generic-24-well-plate
    lbw-def-generic-80x2ml-tube-rack
    lbw-def-generic-96-well-plate
    lbw-def-generic-single-trough-25ml-reservoir

   Exactly the 4 expected lines (baseline this run: registry 23 recordIds, store 38 recordIds,
   intersection 4 — re-measured after the change, unchanged).

2. offerable-set ⇄ intersection, both directions:

    $ grep -l '^offerable: true' schema/registry/labware-definitions/*.yaml \
        | xargs grep -h '^recordId:' | sed 's/^recordId: *//' | sort \
        | diff - <(comm -12 <(grep -rh '^recordId:' schema/registry/labware-definitions/*.yaml | sed 's/^recordId: *//' | sort) \
                     <(grep -rh '^recordId:' records/seed/labware-definition/*.yaml | sed 's/^recordId: *//' | sort))
    (no output — exit 0)

   Every offerable entry is a store recordId and every store-backed registry entry is declared
   offerable: same set, both directions. (Direction (ii) of amendment point 4 is fully enforceable by
   this unit's data only once regguard threads the flag into the loader; the durable test is
   regguard's.)

3. catalogue-only count:

    $ grep -L '^offerable: true' schema/registry/labware-definitions/*.yaml | wc -l
    19

### Targeted tests (final commit; no .ts changed by this unit)

    $ cd server && npx vitest run src/registry/LabwareDefinitionRegistry.test.ts src/schema/LabwareDefinitionAnchor.test.ts
    ✓ src/schema/LabwareDefinitionAnchor.test.ts  (5 tests) 150ms
    Test Files  2 passed (2)
         Tests  21 passed (21)
       Duration  3.34s
    (baseline: 21 passed / 3.50s — still 21 passed)

    $ cd server && npx vitest run src/seeds/labwareDefinition.parity.test.ts
    ✓ src/seeds/labwareDefinition.parity.test.ts  (22 tests) 14ms
    Test Files  1 passed (1)
         Tests  22 passed (22)
       Duration  606ms
    (baseline: 22 passed / 795ms — the pinned field list of the single-trough parity test does not
    include offerable; it stayed green WITHOUT editing it, confirming no pinned field changed)

### Typecheck

NOT RUN — no `.ts` file is touched by this unit (per brief: do not run `tsc --noEmit`).

### Tree state at exit

    $ git -c core.fileMode=false status --short
    (no output — clean)

## Environment note (real, for the reviewer)

This worktree had no `server/node_modules` at all (not even a broken link), so `npx vitest` initially
failed with `vitest: command not found`. The sibling seedreg worktree of this same sequence carries
`server/node_modules -> /mnt/vast/home/brad/git/computable-lab/node_modules` (a git-ignored symlink
to the canonical dependency store). I mirrored that exact symlink in this worktree (git-ignored —
`git check-ignore server/node_modules` confirms; no package was installed or downloaded; tree stays
clean). Tests ran against the shared store and produced the baseline-matching output above.

## Decisions

1. Schema property placed after `read_only` per the verbatim brief shape; single-line description
   string as given (no wrap of the description text).
2. `offerable` NOT in `required:` — absence is the meaningful default; requiring it would force all
   23 files and invert the silent default (brief step 2).
3. Data line placed directly under `recordId:` (line 4) in each of the four files; no other line
   reformatted.
4. Two commits (schema, then data) per the brief; marker convention follows fleet precedent
   (seeddefs2 report in the same sequence): report commit, then marker-append commit; marker sha =
   the commit that CONTAINS the report.

## Acceptance

Waived per brief (data/contract-only unit, no browser surface). Evidence = the two-direction
read-back pasted above.

## Re-verification commands (repo root)

    grep -c '^  offerable:' schema/workflow/labware-definition.schema.yaml            # → 1
    grep -rl '^offerable:' schema/registry/labware-definitions/ | wc -l              # → 4
    git grep -n '^offerable' -- .                                                    # → exactly 4 data rows + (schema match is 2-space indented, so not listed)
    comm -12 <(grep -rh '^recordId:' schema/registry/labware-definitions/*.yaml | sed 's/^recordId: *//' | sort) <(grep -rh '^recordId:' records/seed/labware-definition/*.yaml | sed 's/^recordId: *//' | sort)   # → 4 lines
    grep -l '^offerable: true' schema/registry/labware-definitions/*.yaml | xargs grep -h '^recordId:' | sed 's/^recordId: *//' | sort | diff - <(comm -12 <(grep -rh '^recordId:' schema/registry/labware-definitions/*.yaml | sed 's/^recordId: *//' | sort) <(grep -rh '^recordId:' records/seed/labware-definition/*.yaml | sed 's/^recordId: *//' | sort))   # → no output
    grep -L '^offerable: true' schema/registry/labware-definitions/*.yaml | wc -l    # → 19
    cd server && npx vitest run src/registry/LabwareDefinitionRegistry.test.ts src/schema/LabwareDefinitionAnchor.test.ts   # → 21 passed
    cd server && npx vitest run src/seeds/labwareDefinition.parity.test.ts           # → 22 passed

## Blockers / next actions

- None for this unit.
- Next leg: regguard (zod threading of the flag through LabwareDefinitionRegistry, the durable
  two-direction set-relation test, prefill routing is CREATE-DOOR-1's) — deliberately NOT built here
  (5-file budget; a half-threaded flag is worse than a declared one).
- No lane-stack reload needed for this unit (no loader/server code changed); a reload matters only
  when regguard lands.
