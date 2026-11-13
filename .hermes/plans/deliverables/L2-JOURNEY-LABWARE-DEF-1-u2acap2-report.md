# L2-JOURNEY-LABWARE-DEF-1 / unit u2acap2 — report

Item: L2-JOURNEY-LABWARE-DEF-1-u2acap2 — declare the two governed-write capability
descriptors the pilot labware-definition journey names, and pin their admission
against the merged governed-write registry.
Worktree: /home/brad/cl-wt/L2-JOURNEY-LABWARE-DEF-1-u2acap2-lane2
Branch: cl/lane2-labware-def-u2acap2-1724
Base: e24f31a815bd8be7a5a44f4c8689e85ae06dd05f
Result: DONE — 2 commits on top of base (36a63d1e is HEAD at time of this writing;
a marker commit follows this report, see EXIT below).

## STEP 0 — registry present, shape matches ANCHORS

`config/journey/governed-writes.yaml` existed at base e24f31a8 with the exact anchor
shape: one write entry, `id: records.create`, `route: POST /records`,
`handler: RecordHandlers.create`, `store: RecordStoreImpl`,
`record_kinds: [material, vendor-product]`,
`guards: [ajv-schema-validation, lint, ownership-acl]`. No mismatch; the registry
rule's additive extension was therefore applied (never a STOP).

## Environment fix (worktree plumbing, no code)

This worktree shipped without two gitignored local symlinks that every sibling lane
worktree has (confirmed in L2-CHECKPOINT-cpd1fix-lane2):
- `server/node_modules` -> symlinked to /home/brad/git/cl-integration-2/server/node_modules
  (the shared integration node_modules; contains vitest 1.6.1, tsc, tsx). This is the
  standard lane mechanism, not `npm install` — no dependency was installed.
- `server/schema` -> `../schema` (both paths are gitignored: .gitignore:5, .gitignore:52).
  Without it, `journeyCapabilities.routes.test.ts` failed at baseline with
  "scientist-intent vocabulary vocabulary file not found" (a PRE-EXISTING failure,
  measured before any edit — see VERIFY). Restored both symlinks; git tree unaffected.

## Changed files (exactly the 5 owned paths; 4 files + this report)

1. `server/src/compiler/journey/capabilityCatalogue.labwareDef.test.ts` (NEW, 132 lines,
   `// @vitest-environment node` line 1) — 4 legs (a)-(d) per brief.
2. `config/journey/capabilities/labware-definition-create.yaml` (NEW, 35 lines).
3. `config/journey/capabilities/labware-instance-place.yaml` (NEW, 38 lines).
4. `config/journey/governed-writes.yaml` (ADDITIVE ONLY, 15 lines; single-line diff:
   `record_kinds: [material, vendor-product]` -> `[material, vendor-product, labware, labware-instance]`).
   No `writes` entry added, no id renamed, `route`/`handler`/`store`/`guards`/`version`
   untouched. Still declares exactly ONE write entry.
5. this report.

Total product diff vs base: 4 files changed, 206 insertions(+), 1 deletion(-)
(`git diff --stat e24f31a8..36a63d1e`).

Descriptor contents (both): `handler_kind: governed_write`,
`handler_ref: records.create` (read from the registry file, not retyped),
`effects: [domain_mutation]`, `permissions: [journey.write]`, `availability: {}`,
`surfaces: [run-design]`, `idempotency: non_idempotent`, `retry: none`,
`reconciliation: receipt_required`, `evidence: [governed_write_receipt]`,
`status: {declared: true, implemented: false, available_now: false, browser_certified: false}`
(four separate booleans; `implemented: false` is truthful — declaration only, no write leg).
Key order copied from the shipped sibling `material-library-search.yaml`.
- definition-create: `ports.input: []`; one output `CommittedRecordReference`
  (version/record_id LAB-DEF-1/record_type labware/receipt_id RCPT-LAB-DEF-1).
- instance-place: one input port with keys exactly `[version, labware_definition_id]`
  (LabwareDefinitionReference — no record_id, no receipt_id, so a placed instance can
  never be smuggled in as its own source); one output CommittedRecordReference
  (record_type labware-instance, receipt_id RCPT-LAB-INST-1).

## RED FIRST (raw, step 1, before any product file existed — commit 69eb126b)

Command: `cd server && npx vitest run src/compiler/journey/capabilityCatalogue.labwareDef.test.ts`

```
FAIL  src/compiler/journey/capabilityCatalogue.labwareDef.test.ts > labware-definition journey capability declarations (u2acap2) > (a) admits the real shipped directory: seven descriptors, empty diagnostics
AssertionError: expected [ …(5) ] to deeply equal [ …(7) ]

- Expected
+ Received

  Array [
-   "journey.labware-definition-create",
-   "journey.labware-instance-place",
    "journey.material-library-search",
    "journey.ncbi-gene-search",
    "journey.noun-create-from-document",
    "journey.ontology-lookup",
    "journey.vendor-web-search",
  ]

 FAIL  ... > (b) cross-checks the registry with no loader: both handler_refs and output record kinds are covered
 FAIL  ... > (c) port shapes: place consumes a DEFINITION reference (no record_id, no receipt_id) and commits a labware-instance; create takes no input and commits a labware
 FAIL  ... > (d) a handler_ref one character short of the registry id is refused, admitting nothing
Error: ENOENT: no such file or directory, open '.../config/journey/capabilities/labware-definition-create.yaml'

 Test Files  1 failed (1)
      Tests  4 failed (4)
```

All four legs failed on the MISSING declarations (leg (a) on the 7-id set, (b)/(c)/(d)
on the absent files) — not on a typo.

## GREEN (raw, after steps 2-4 — commit 36a63d1e)

`cd server && npx vitest run src/compiler/journey/capabilityCatalogue.labwareDef.test.ts`:

```
 ✓ src/compiler/journey/capabilityCatalogue.labwareDef.test.ts  (4 tests) 83ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  1.52s
```

## MUTATION PROBE (raw)

Applied the one permitted mutation: deleted the `labware` token, leaving
`record_kinds: [material, vendor-product, labware-instance]`, all other lines intact.
Ran leg (b) only: `npx vitest run src/compiler/journey/capabilityCatalogue.labwareDef.test.ts -t "(b)"`:

```
 FAIL  ... > (b) cross-checks the registry with no loader: both handler_refs and output record kinds are covered
AssertionError: record_kinds of records.create ["material","vendor-product","labware-instance"] must cover output record_type 'labware' of journey.labware-definition-create: expected false to be true // Object.is equality

 ❯ src/compiler/journey/capabilityCatalogue.labwareDef.test.ts:92:9
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
```

RED naming the missing record kind, as required. Reverted verbatim with
`git checkout -- config/journey/governed-writes.yaml`; `git -c core.fileMode=false status --short`
then printed nothing (clean); line 14 reads `[material, vendor-product, labware, labware-instance]`
again. Post-revert full run of the new file: 4 passed (4).

## VERIFY (raw)

- NEW FILE: `cd server && npx vitest run src/compiler/journey/capabilityCatalogue.labwareDef.test.ts`
  -> `Tests  4 passed (4)` (raw GREEN above; no prior baseline existed — RED run is the baseline).
- SIBLING: `cd server && npx vitest run src/compiler/journey/capabilityCatalogue.test.ts`
  -> `Tests  11 passed (11)` (Duration 804ms). Matches the composer baseline
  `Tests  11 passed (11)` at e24f31a8. Count named: 11.
- ROUTES: `cd server && npx vitest run src/api/journeyCapabilities.routes.test.ts`
  - BEFORE (pre-edit baseline): first attempt FAILED with the missing-symlink error
    (environment, see above); after restoring `server/schema`: `Tests  4 passed (4)`.
  - AFTER: `Tests  4 passed (4)` (Duration 3.91s). Counts match (4 = 4), both green.
- LANE STACK :3093: UP. `curl -s localhost:3093/api/journey/capabilities` returned 200,
  `"diagnostics": []`, and FIVE capabilities (material-library-search, ncbi-gene-search,
  noun-create-from-document, ontology-lookup, vendor-web-search) — matching the composer's
  five at e24f31a8. The seven-id AC1 readback is NOT yet live because the lane-2 server
  (pid 3719161) serves /mnt/vast/home/brad/git/cl-integration-2, which has not yet merged
  this branch. The route re-reads config per request (`routes.ts:423` calls
  `loadCapabilityCatalogueDir` inside the handler; no caching, no restart needed), so the
  seven ids appear with `"diagnostics": []` immediately upon merge — re-curl is the
  one-command re-verify. I did not start, restart, or touch any stack.
- TYPECHECK: `cd server && npx tsc --noEmit 2>&1 | grep -c 'error TS'` -> `0`. (No TS
  signature changed anyway; the only .ts touched is the new test file.)
- FIVE SHIPPED DESCRIPTORS BYTE-FOR-BYTE UNCHANGED: `git diff e24f31a8..36a63d1e` on each of
  material-library-search / ncbi-gene-search / noun-create-from-document / ontology-lookup /
  vendor-web-search .yaml -> empty.
- `git -c core.fileMode=false status --short` at exit -> empty (clean tree).
- No scratch directory was created (nothing needed /tmp or the scratch path; the test
  reads only shipped files). No absolute repo paths in the test
  (`fileURLToPath(new URL('../../../../config/journey/...', import.meta.url))`).

## ACCEPTANCE CONTRACT — disposition

- AC1: satisfied at the data+admission level (7 ids, empty diagnostics, proven by leg (a)
  against the real directory and the real registry union); the live :3093 seven-id readback
  is owed at merge (owner: the lane-stack/orchestrator merge step; re-verify: curl again).
- AC2: proven by leg (d) — `records.creat` (one character short, in neither the registry
  nor AGENT_ALLOWED_TOOLS) is refused with `unknown handler id 'records.creat'` and admits
  nothing (0 capabilities); the five shipped descriptors keep admitting (sibling test 11/11
  and routes 4/4 unchanged).
- AC3: both new descriptors have `implemented: false`; `governed-writes.yaml` still declares
  exactly ONE write entry with its original route/handler/store/guards (1-line additive diff
  shown above); sibling `capabilityCatalogue.test.ts` stays green at 11 (its pre-change count).
- Browser criteria (definition record with stated geometry, anchor status, instance on the
  deck, resume on origin): NOT satisfied by this unit — they stay owed at the milestone
  gate. Not claimed.

## REVIEWER BAIT — pre-emption

1. `unevaluatedProperties: false`: both descriptors carry exactly the 15 required top-level
   keys, nothing extra; admitted by the real Ajv pipeline (leg (a)).
2. Four separate status booleans kept; `implemented: false` / `available_now: false` on both.
3. Ports are one of the six `$defs`: input port of instance-place has exactly
   `[version, labware_definition_id]` (Leg (c) asserts the key set and the absence of
   record_id/receipt_id); both output ports carry version/record_id/record_type/receipt_id
   with non-empty receipts (Leg (c) asserts record_type and non-empty receipt_id).
4. No invented handler_ref: `records.create` was read from the merged registry file; the
   test's leg (b) re-reads it, so a drift between YAML and registry goes RED.
5. No split literal: the test never types `records.create` or the record kinds as
   hand-typed expectations — leg (b) parses the registry YAML. The only string literals in
   the test are the seven capability ids (leg a), the port key names (leg c), and the
   deliberate negative fixture `records.creat` (leg d).
6. Registry mutation discipline: exactly two tokens appended to `record_kinds` on the
   existing `records.create` entry; the mutation probe proved the pin is live.
7. No stack was started or restarted; the route re-reads config per request, so no restart
   is required for AC1 at merge.
8. Hardcode boundary honored: `fileURLToPath(new URL(...))` only; no /tmp; no scratch dir.

## Next actions / remaining blockers

- Merge this branch to the lane-2 integration; then `curl -s localhost:3093/api/journey/capabilities`
  must show the seven ids with `"diagnostics": []` (no restart needed). Owner: orchestrator
  merge step.
- Units 2-3 (the write leg) can now be briefed: both declarations exist, `implemented: false`
  is the correct pre-write-leg state; the port leg flips `implemented`/`available_now` when
  the write exists.

## EXIT

Commits on this branch (oldest first):
- 69eb126b — step 1: RED-first test (4/4 failing on missing descriptors)
- 36a63d1e — steps 2-4: two descriptors + additive registry extension (4/4 GREEN)
- <this report commit> — report (sha below)
- <final marker commit> — exit marker appended

---

L2-JOURNEY-LABWARE-DEF-1-u2acap2 UNIT unit DONE 60d36d4a221d95b4dafb84db2687daaccf45c079
