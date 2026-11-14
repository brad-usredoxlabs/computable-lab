# Report — L2-JOURNEY-LABWARE-DEF-1 / unit u3defprefill

Unit: **u3defprefill** — the record-create door opens a NON-SPINE kind with the noun
prefilled: `/record/new/labware-definition?prefillName=96-well%20deepwell%20plate`
seeds the kind's SCHEMA-DECLARED label slot (`display_name`) and injects NO `title`
key the schema does not declare.

Worktree: `/home/brad/cl-wt/L2-JOURNEY-LABWARE-DEF-1-u3defprefill-lane2`
Branch: `cl/lane2-journey-labware-def-1-u3defprefill-1830`  Base: `e9c707f11e9f8142c0779cdefd2215d1554525ab`
Lane: 2

## Grounding (decision + scenario)
- Governing line quoted from `.hermes/plans/architect-context-l2.md` §2.4:
  "**Presentation ≠ execution.** A surface is where something is shown or a person
  acts; a capability is what executes. A page must never own a capability, and a
  capability must never require one page."
- §2.15 (never invent a value) + §2.7 (name pre-selection is never identity): seeding
  `title` on a `additionalProperties:false` schema that declares `display_name` is
  fabricated value → the unit resolves the slot from the SERVED schema document and
  never invents a key.
- No second authority: `LabLabwareNewPage.tsx` (u1nounprefill's page) was NOT opened,
  edited, or imported; no shared URLSearchParams helper was created — the query is
  read in place in `RecordHostPage` (the u1nounprefill lazy-init pattern).

## Changed files (3; within budget files<=4)
1. `app/src/shared/shell/RecordHostPage.createPrefill.test.tsx` (NEW, 237 lines) — the pin.
2. `app/src/shared/shell/RecordHostPage.tsx` (+16) — read `?prefillName=` ONCE in a lazy
   `useState` initialiser (trim, cap 120); pass to panel as NEW prop `prefillLabel`
   (conditional spread `...(prefillLabel ? { prefillLabel } : {})`, never
   `prefillLabel={undefined}`). `draftTitle` (spine title seed) untouched.
3. `app/src/event-editor/create/RecordCreatePanel.tsx` (+43) — added `prefillLabel?:
   string` beside `draftTitle`. Two new effects: (a) a resolution effect keyed on the
   settled SERVED schema doc (non-spine only) resolves the label slot from the doc's
   declared `properties` — `title` if declared, else `display_name`, else null (seed
   NOTHING, never invent a key); (b) a seeding effect that runs AFTER the doc settles
   and writes the noun into only that resolved slot, preserving the spine seeds and id
   mint. No kind-name branch — a second non-spine kind gets the same behaviour from its
   own served schema.

Product delta: 59 added lines (numstat 43+16). Within the lines<=140 product budget.

## TDD evidence
### STEP 1 RED (test only, no product edit) — raw:
- Stashed both product files, ran the pin:
  `Test Files 1 failed (1)`, `Tests 1 failed | 1 passed (2)`
  Failure: `AssertionError: expected '' to be '96-well deepwell plate'` (case (a));
  case (b) passed (trivially, nothing seeds yet).
- Full raw saved: `/home/brad/.u3defprefill-scratch/red_receipt.raw`

### STEP 2 GREEN — raw:
- `cd app && npx vitest run src/shared/shell/RecordHostPage.createPrefill.test.tsx`
  → `Test Files 1 passed (1)`, `Tests 2 passed (2)`  (re-verified on FINAL commit `c8398492`)

### Mutation A (second mechanism — seed literal `title` for non-spine kinds) — raw:
- Patched resolution to `const field = 'title'`; ran pin →
  `Test Files 1 failed (1)`, `Tests 1 failed | 1 passed (2)` — case (a) FAILS (the
  schema-declared `display_name` slot is empty; the fabricated `title` is a 422).
- Reverted. `git -c core.fileMode=false status --short` → only the 3 real paths, no
  stray product path. Raw saved: `/home/brad/.u3defprefill-scratch/mutationA.raw`

### Mutation B (vacuous guard — delete the `prefillName` read) — raw:
- Patched the host initialiser to `return ''`; ran pin →
  `Test Files 1 failed (1)`, `Tests 1 failed | 1 passed (2)` — case (a) FAILS with
  `expected '' to be '96-well deepwell plate'`. No other source seeds it.
- Reverted. Raw saved: `/home/brad/.u3defprefill-scratch/mutationB.raw`

## Baselines (measured in this environment)
- `surfaceChat.test.tsx` → `Test Files 1 passed (1)`, `Tests 1 passed (1)`  (matches
  composer baseline 1/1).
- `gc16.test.tsx` → `Test Files 1 failed (1)`, `Tests no tests` —
  `Error: Failed to resolve import "ajv/dist/2020.js"`. **This is a pre-existing
  ENVIRONMENTAL gap, not a regression from this unit.** Proof: with both product
  files stashed (tree == base), the identical `Failed to resolve import "ajv/..."`
  occurs. Root cause: `app/node_modules` symlinks to
  `/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`, which has NO top-level
  `ajv` and no `.pnpm` (ajv is a transitive dep, not hoisted). The composer's 6/6
  baseline was measured in an environment where `ajv` resolves. My 3 changed files
  do not import ajv and are absent from the tsc error set. This unit does NOT touch
  `RecordCreatePanel.gc16.test.tsx` (prohibited).
- `tsc --noEmit` → 14 errors BOTH at base (stashed) and on the final commit
  `c8398492`; `diff <(sort base) <(sort final)` → **ZERO delta**. None of the 14
  reference `RecordHostPage` or `createPrefill`. They are: the known pre-existing
  `RefCombobox.ontologyref.test.tsx` TS2322 (named in handoff 1815:36) + TS2307
  missing modules `ajv/dist/2020.js`, `yaml`, `prosemirror-view` in the symlinked
  store (environmental). Raw: `/home/brad/.u3defprefill-scratch/tsc_final.log`.

## What did NOT change (invariants preserved)
- Spine seeds (`initial[idField]`, state/status/parent), the id mint (:423/:497), the
  projection-marked readonly identity slot, the unserved-kind loud refusal — all
  untouched. `draftTitle` lines (:448-451) left byte-identical.
- Tab-strip registration (:131-141) untouched; `CreateNodeType` not widened;
  `recordCreateTabId` untouched.
- `LabLabwareNewPage.tsx`, `workspace/types.ts`, `SchemaTree.tsx`, `schema/**`,
  `config/**`, `server/**`, `RecordCreatePanel.gc16.test.tsx` — all untouched.
- No kind-name branch (`if (nodeType === 'labware-definition')`) anywhere.

## Next actions / remaining blockers (owner: orchestrator)
- ITEM-level browser gate (accumulated LABWARE-DEF-1 AC1–AC3 bundle) stays owed to the
  orchestrator; this unit merges on its own evidence. AC1 (submit → `GET /records/:id`)
  is exercised by the browser gate, not this unit's pin (the pin asserts the built
  payload's keys; the round-trip POST is the capability, not the surface).
- gc16's 6/6 cannot be reproduced in this worktree's node_modules store (missing ajv).
  If the orchestrator wants gc16 re-verified, the lane stack needs the shared store
  repopulated with ajv (transitive dep) — out of this unit's scope (no dep install
  permitted here). The stash proof documents the gap is environmental.

## Commit history (this run)
- `464142df` — u3defprefill: step1 RED pin
- `c8398492` — u3defprefill: step2 GREEN (the fix)  ← FINAL commit
- (report commit follows; sha recorded in the marker below)

L2-JOURNEY-LABWARE-DEF-1-u3defprefill UNIT L2-JOURNEY-LABWARE-DEF-1-u3defprefill DONE 11f9ac5c05c4543fb412b1f42abeacffac774292
