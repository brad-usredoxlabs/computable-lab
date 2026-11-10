# L2-PROTOCOL-LOCAL-BIND-1 — unit u1fix (u1 adversarial fixer)

- Worktree: /home/brad/cl-wt/L2-PROTOCOL-LOCALBIND-u1fix-lane2
- Branch: cl/lane2-protocol-localbind-1-u1fix-l2t2355
- Base: e8bc99a0 (u2 tip; carries u1+u2 lineage for one cumulative advc)
- Fixes: advc-c1 D1 (roles read off local-protocol) and D2 (labware arm keyed on
  invented `definitionRef.id` + `labwareType` category instead of `envelope.recordId`);
  D3 test gap (no positive labware leg, invalid inline-roles fixture).
- Owned files touched (exactly the three in scope):
  - server/src/protocol/roleBindingProposal.ts
  - server/src/protocol/roleBindingProposal.test.ts
  - this report
- Diff size: 2 product files, 85 insertions / 24 deletions (budget 3 files / 180 lines).

## Decisions

1. D1 — roles are resolved by `declaredRolesOf(store, protocolId)`: load the
   local-protocol, and if it declares no `roles` of its own (defensive branch),
   follow `inherits_from.id` with a plain `store.get` and read `roles` from the
   universal `protocol` payload. Mirrors
   RunPlanBindingPasses.ts:124-144 (`inherits_from.id` -> load canonical protocol).
   No declarations anywhere -> `{}` -> the protocol entry is emitted with
   `roles: []`, as before; no role is invented.
2. No `RecordRevisionService` / `revisionRef` threading: `store.get(id)` is
   sufficient and keeps the dependency surface at `Pick<RecordStore,'get'|'list'>`
   (no `{ revisionRef: undefined }` exactOptionalPropertyTypes hazard at all).
3. D2 — the labware arm now compares each declared value to `envelope.recordId`
   only, mirroring the material arm. `definitionRef` (exists in no schema/record)
   and the `labwareType` category comparison are both deleted; no alias kept.
   `protocol.schema.yaml:460` already says "compatible labware designs (recordIds)".
   No YAML edited (no lane-stack reload needed).
4. Unchanged: `BindingCandidate` key set, `candidateOf`, sort order (`byRecordId`),
   `stateOf` (>1 -> ambiguous), `ambiguous`/`unbound` reason wording, route/handler.
5. Tests now build the schema-valid pair (local-protocol with `inherits_from` +
   universal `protocol` with `roles`). Two labware pins: a positive leg
   (real seed recordId `lbw-seed-plate-96-flat` -> `proposed`) and a category
   negative leg (declared `'plate'` must NOT match a labware whose
   `labwareType: 'plate'`). The original negative leg (missing kind -> `unbound`
   with a reason) is preserved.
6. Environment note: this worktree had no `node_modules`; I created the same
   symlink the sibling worktrees use (`server/node_modules ->
   /home/brad/git/cl-integration-2/server/node_modules`) and listed
   `app/node_modules` / `server/node_modules` in `.git/info/exclude` so the tree
   stays clean. No installs, no scaffolding; scratch lives in
   /home/brad/.localbind-u1fix-scratch/ (outside git).

## Receipts (raw)

### RED first — new fixture/tests on unfixed code (commit 614ed390)

Command: `cd server && timeout 180 npx vitest run src/protocol/roleBindingProposal.test.ts`

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-PROTOCOL-LOCALBIND-u1fix-lane2/server

 ❯ src/protocol/roleBindingProposal.test.ts  (6 tests | 6 failed) 6ms
   ❯ ... > proposes a single vendor-product matching one allowed material concept
     → Cannot read properties of undefined (reading 'state')
   ❯ ... > is ambiguous with every candidate and no default when two vendors match
     → Cannot read properties of undefined (reading 'state')
   ❯ ... > proposes the labware whose recordId a role declares as an expected kind
     → Cannot read properties of undefined (reading 'state')
   ❯ ... > does not treat a labwareType category as a declared recordId
     → Cannot read properties of undefined (reading 'state')
   ❯ ... > reports unbound with a reason when a declared labware kind has no record
     → Cannot read properties of undefined (reading 'state')
   ❯ ... > does not search when a role declares no selector at all
     → Cannot read properties of undefined (reading 'state')

 Test Files  1 failed (1)
      Tests  6 failed (6)
```

`roles: []` on every protocol is the D1 symptom (the fixture's declarations are
reachable only through `inherits_from`), so `roles[0]` is undefined.

### GREEN after D1+D2 (commit 138cec79)

```
 ✓ src/protocol/roleBindingProposal.test.ts  (6 tests) 5ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  1.75s
```

### Mutation probe (a) — revert D1 (read roles from the local-protocol payload only)

```
 ❯ src/protocol/roleBindingProposal.test.ts  (6 tests | 6 failed) 8ms
   ❯ ... > proposes the labware whose recordId a role declares as an expected kind
     → Cannot read properties of undefined (reading 'state')
 Test Files  1 failed (1)
      Tests  6 failed (6)
```
Positive leg fails with `roles: []` — the pin is live. Restored before the next probe
(`git checkout -- server/src/protocol/roleBindingProposal.ts`, `grep -c MUTATION` -> 0).

### Mutation probe (b) — revert D2 (compare `labwareType` instead of recordId)

```
 ❯ src/protocol/roleBindingProposal.test.ts  (6 tests | 2 failed) 9ms
   ❯ ... > proposes the labware whose recordId a role declares as an expected kind
     → expected 'unbound' to be 'proposed'
   ❯ ... > does not treat a labwareType category as a declared recordId
     → expected 'proposed' to be 'unbound'
 Test Files  1 failed (1)
      Tests  2 failed (2)
```
Both labware pins go RED under the inverted semantics; restored before typecheck.

### Typecheck

`cd server && timeout 300 npx tsc --noEmit` -> `TSC_EXIT=0`, no output.

### Real-seed probe (same shape as advc PROBE F2; scratch script, not in git)

`vite-node /home/brad/.localbind-u1fix-scratch/probe.ts` — real
`records/seed/protocols/prt-seed-biological-transfer.yaml`, all real
`records/seed/labware/*.yaml`, plus a local-protocol `LPR-bio-transfer-v1` with
`inherits_from: {kind: record, id: prt-seed-biological-transfer, type: protocol}`:

```
{"protocols":[{"protocolId":"LPR-bio-transfer-v1","roles":[
 {"roleId":"source","roleKind":"labware","state":"proposed",
  "candidates":[{"recordId":"lbw-seed-tuberack-mixed-4x50ml-6x15ml","recordKind":"labware",
                 "label":"Generic 10-Tube Falcon Rack, 4×50 mL + 6×15 mL (seed)"}]},
 {"roleId":"plate","roleKind":"labware","state":"proposed",
  "candidates":[{"recordId":"lbw-seed-plate-96-flat","recordKind":"labware",
                 "label":"Generic 96 Well Plate, Flat Bottom (seed)"}]},
 {"roleId":"biological","roleKind":"material","state":"unbound","candidates":[],
  "reason":"no material or vendor-product record matches role 'biological' allowedMaterialIds: biological"},
 {"roleId":"topping_medium","roleKind":"material","state":"unbound","candidates":[],
  "reason":"no material or vendor-product record matches role 'topping_medium' allowedMaterialIds: medium"}]}]}
```

Roles are no longer `[]`; both labware roles bind to the real seed records by
recordId. The material roles stay `unbound` because the shipped declarations use
semantic tokens (`biological`, `medium`) that match no record and no vendor-product
records exist — the known O2/O3 seeding gap, deliberately NOT "fixed" here (no
fuzzy/semantic matching, no invented records). Material/vendor arms are proven by
fixtures only.

## State

- Tree clean at exit (see status receipt in the marker commit).
- No blockers. Next: advc re-review of the cumulative u1+u2 branch; the
  clarify/UI legs remain separate units.

L2-PROTOCOL-LOCAL-BIND-1 UNIT u1fix DONE f20cc71aa2bb7c3792dd44cf1168ed696069185c
L2-PROTOCOL-LOCAL-BIND-1-u1fix UNIT unit DONE f20cc71aa2bb7c3792dd44cf1168ed696069185c
