# L2-LAB-INVENTORY-CREATE-1 — unit g3d5date (gate g3 defect D5)

Item: L2-LABINV-g3d5date · Lane 2 · worktree /home/brad/cl-wt/L2-LABINV-g3d5date-lane2
Branch: cl/lane2-labinv-g3d5date-2115 · base b8f291edeb951798821124ca4be5f5563e656d11 (verified at start)

## Defect (D5, high)
The receiving door's Arrival date control is a native `type="date"` input emitting `YYYY-MM-DD`
(MaterialReceivingDoor.tsx:189-190) and the value was copied into the claim verbatim
(MaterialReceivingDoor.tsx:114), while the claim schema declares `occurredAt` as
`format: date-time` (schema/lab/attestation.schema.yaml:165, property opens :163 — verified this run).
Every honest "known arrival" claim was refused with `expected date-time`; the honesty path was
unreachable. Client-seam defect only: schema right, form right, encoding between them missing.

## Convention chosen (the one instant law)
A stated `YYYY-MM-DD` leaves the door as the literal `${value}T00:00:00.000Z`: the DATE PART IS
THE SCIENTIST'S STATEMENT, anchored to UTC midnight.
- Not `new Date(y,m,d).toISOString()` — local midnight shifts the calendar date a day early for
  timezones east of UTC.
- No `now()` / `Date()` fallback — Q5: an unstated time is ABSENT, never manufactured.
- Applied only at claim assembly (single site, inside the existing conditional spread) — the
  controlled input keeps showing the plain date the human typed, and the `unknown` arm still
  omits `occurredAt` entirely via the unchanged `statedTime` presence guard (exactOptionalProperty
  spread shape preserved; the fix is inside the value expression, not the presence guard).

## Changed files (2 — exactly the owned scope; diff vs base: 28 insertions, 2 deletions)
1. app/src/collections/MaterialReceivingDoor.tsx — new non-exported helper
   `toOccurredAtValue(raw: string): string` (regex `^\d{4}-\d{2}-\d{2}$` → `${raw}T00:00:00.000Z`,
   else unchanged) with the convention comment, applied at the one claim-assembly site
   (`...(statedTime !== undefined ? { occurredAt: toOccurredAtValue(statedTime) } : {})`).
   No signature changes; no testid/status/text renames; no other door touched; schema untouched.
2. app/src/collections/MaterialReceivingDoor.test.tsx — the :104 pin MOVED (not deleted, not
   relaxed to substring/regex) from the old refused truth `'2026-11-01'` to the claim-schema
   contract `'2026-11-01T00:00:00.000Z'`; plus one new GREEN leg pinning the approximate arm
   (stated date encoded + approximation carried + `occurredAtStatus: 'approximate'`).

## Commits (base → HEAD)
- 67df345a7cdc09d36a75a62367cad43695aa724d — test(receiving): g3 D5 RED — stated arrival date must leave the door as a date-time
- ad09e82c1b3f8aa5cae05d65c8e36af1ba89e8aa — fix(receiving): encode the stated arrival date as an RFC3339 instant in the claim

## VERIFY — raw output

### 1. RED (committed as 67df345a, before the fix)
Command: `cd app && npx vitest run src/collections/MaterialReceivingDoor.test.tsx`
```
 ❯ src/collections/MaterialReceivingDoor.test.tsx  (12 tests | 2 failed) 271ms
   ❯ ... > sends occurredAt when the occurrence status is stated and omits it when unknown
     → expected '2026-11-01' to be '2026-11-01T00:00:00.000Z' // Object.is equality
   ❯ ... > anchors the stated arrival date on the approximate arm too, with its approximation (g3 D5)
     → expected '2026-11-01' to be '2026-11-01T00:00:00.000Z' // Object.is equality

 FAIL  ... > sends occurredAt when the occurrence status is stated and omits it when unknown
AssertionError: expected '2026-11-01' to be '2026-11-01T00:00:00.000Z' // Object.is equality
- Expected
+ Received
- 2026-11-01T00:00:00.000Z
+ 2026-11-01
 ❯ src/collections/MaterialReceivingDoor.test.tsx:104:30

 Test Files  1 failed (1)
      Tests  2 failed | 10 passed (12)
   Start at  21:29:39
   Duration  9.68s
```

### 2. GREEN (after the fix, committed as ad09e82c)
Same command:
```
 ✓ src/collections/MaterialReceivingDoor.test.tsx  (12 tests) 269ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  21:30:14
   Duration  1.67s
```
(Baseline before this unit per gate g3 report.md:81: 11/11 green on trunk 669e5950; the file now
carries 12 tests = the 11 baseline legs + 1 new approximate-arm leg, all passing.)

### 3. Mutation probe
Helper body replaced with `return raw` (unconditional), same command: `cd app && npx vitest run src/collections/MaterialReceivingDoor.test.tsx`
```
 FAIL  ... > anchors the stated arrival date on the approximate arm too, with its approximation (g3 D5)
AssertionError: expected '2026-11-01' to be '2026-11-01T00:00:00.000Z' // Object.is equality
 ❯ src/collections/MaterialReceivingDoor.test.tsx:117:30

 Test Files  1 failed (1)
      Tests  2 failed | 10 passed (12)
   Start at  21:31:33
   Duration  2.34s
```
Both moved pins fail again under the mutation (known + approximate arms), received `'2026-11-01'`.
Restored the helper; re-ran:
```
 ✓ src/collections/MaterialReceivingDoor.test.tsx  (12 tests) 297ms

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  21:31:42
   Duration  2.91s
```

### 4. Typecheck (new local function added; no existing signature changed)
Command: `cd app && ./node_modules/.bin/tsc --noEmit -p .`
Error-line count: **6** — ALL pre-existing and outside the owned files, in
`../server/src/{schema/SchemaLoader.ts,ui/UISpecLoader.ts,validation/AjvValidator.ts,validation/types.ts}`
(`Cannot find module 'yaml' / 'ajv' / 'ajv-formats'` — shared-layout type resolution, present at
base). Zero errors name MaterialReceivingDoor.tsx or its test file (grep over the full output:
no hits).

### 5. Tree status at exit
`git -c core.fileMode=false status --short` → empty.

## Notes for the reviewer
- Environment (not code): the worktree's `app/node_modules` symlink pointed at
  /mnt/vast/home/brad/git/cl-integration-2/app/node_modules, which is EMPTY on disk. Re-pointed
  the worktree-local symlink to /mnt/vast/home/brad/git/cl-integration-2/node_modules (the root
  tree with the real vitest/jsdom install, the same target the working sibling lane worktrees
  use). Nothing under /mnt/vast was modified; the symlink is gitignored, so the diff stays
  exactly the two owned files.
- AC1 (2026-11-12 → date part reads back 2026-11-12): the helper is a literal date-part
  passthrough (`${value}T00:00:00.000Z`), so the compiled/accepted record's occurredAt date part
  equals the stated date by construction; the server is untouched (server/src/receiving left as
  is, per scope). Browser-lane verification of AC1–AC3 is owned by the independent browser
  reviewer — implementation legs are done, acceptance is a separate state.
- What must NOT change — verified: unknown arm omits occurredAt (leg 'makes the unknown-status
  discard explicit: date input disabled…' passes; `statedTime` guard byte-identical),
  approximate arm carries occurredAt + approximation (new leg), disabled/cue behaviour for
  unknown status byte-identical (no diff lines near :189-:196), double-click/accept guards
  untouched (their legs pass).

## Decisions
- Followed the fleet's RED→fix→report commit discipline; no reset/amend/rebase.
- Marker sha convention follows the sibling unit of this same item (d3dt, report at
  .hermes/plans/L2-LABINV-d3dt-report.md in L2-LABINV-d3dt-lane2): the report body is committed,
  then the marker line is appended in the final docs commit and names the commit that CONTAINS
  this report (this file's body commit), which is also the descendant of the code fix commit
  ad09e82c1b3f8aa5cae05d65c8e36af1ba89e8aa.

## Next actions / blockers
- Next: orchestrator/browser reviewer runs the AC1–AC3 browser lane against the lane-2 stack
  (a fresh lane reload is needed if the gate reads from a running server; this unit changed no
  YAML, so no schema reload is required).
- Blockers: none on this unit.

L2-LABINV-g3d5date-advc-c1-l2t1852 UNIT g3d5date DONE 0876f26ad358f76335701d12cfac014a1db87a8b
