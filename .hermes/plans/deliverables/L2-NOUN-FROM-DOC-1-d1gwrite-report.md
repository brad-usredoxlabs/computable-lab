# L2-NOUN-FROM-DOC-1 / unit d1gwrite — governed-write registry + noun-create capability descriptor

Lane 2 · worktree `/home/brad/cl-wt/L2-NOUN-FROM-DOC-1-d1gwrite-lane2` · branch `cl/lane2-noun-from-doc-d1gwrite-1645` · base `4e8665287a9644e9a8ac3b4e9e7290309d5fe922` · 2026-11-13

Ruling: `.hermes/plans/decisions/GOVERNED-WRITE-ADMISSION-l2-20261113.md` (BINDING). Deliverable
per the ruling: the capability descriptor + the registry entry + the admission test; no new route
and no new write code. This is exactly what this unit commits.

## Decisions

1. `config/journey/governed-writes.yaml` is DATA ONLY: one entry `records.create`
   (`route: POST /records`, `handler: RecordHandlers.create`, `store: RecordStoreImpl`,
   `record_kinds: [material, vendor-product]`, `guards: [ajv-schema-validation, lint,
   ownership-acl]`, `version: "1.0.0"`). Header comment states it is the ONLY admissible source
   of a `governed_write` `handler_ref` and that adding an entry is a reviewable act.
   `RecordHandlers.create` verified at `server/src/api/handlers/RecordHandlers.ts:601`
   (`async createRecord`), bound to `POST /records` at `server/src/api/routes.ts:324`;
   `RecordStoreImpl` at `server/src/store/RecordStoreImpl.ts:86`; the dictated-mint path
   (`app/src/shared/api/client.ts:2701 createRecord -> POST /records`) matches the registry entry.
2. `capabilityCatalogue.ts` EXTENDED, not rewritten: `loadCapabilityCatalogueDir(dir, known)`
   also reads the sibling registry `join(dir, '..', 'governed-writes.yaml')` when it exists and
   unions its `writes[].id` into the known set passed to `admitCapabilityCatalogue`. ABSENT
   registry changes nothing (ENOENT path returns the base set). A registry that does not parse,
   or whose entries lack a string `id`, contributes a NAMED diagnostic
   (`governed-writes.yaml: <path>: <message>`) and admits nothing from itself. The refusal
   diagnostic at `capabilityCatalogue.ts:59` is byte-identical (verified by diff: the line does
   not appear in `git diff base..HEAD`). The three `routes.ts` call sites stay two-argument —
   the registry resolves from `dir`; `routes.ts` is untouched.
3. `config/journey/capabilities/noun-create-from-document.yaml`: one descriptor, shape copied
   from the shipped read-only `material-library-search.yaml` with the mandated deltas:
   `capability_id: journey.noun-create-from-document`,
   `implementation: { handler_kind: governed_write, handler_ref: records.create }`,
   `effects: [domain_mutation]`, `reconciliation: receipt_required`,
   `evidence: [governed_write_receipt]`, `idempotency: non_idempotent`, `retry: none`;
   `ports.output` = TWO `CommittedRecordReference` ports (`record_type: material` and
   `record_type: vendor-product`, each with `record_id` + `receipt_id` — the receipt names BOTH
   ids, per ruling point 1). `ports.input` = one `StagedDraftReference` (the proposal the person
   accepts) — it VALIDATES against `journey-port.schema.yaml:80-86` (Ajv-verified in the seed
   test: the descriptor is admitted with `diagnostics: []`), so `input: []` was not needed. No
   output port points at a draft.
4. OUT-OF-SCOPE-NOTE (required, kept minimal): the seed pin test
   `server/src/compiler/journey/capabilityCatalogueSeed.test.ts` pinned "exactly four seeded
   descriptors, all `agent_tool`" against the SHIPPED `AGENT_ALLOWED_TOOLS` only. Adding the
   mandated descriptor to `config/journey/capabilities/` (AC3: "now five files") makes the
   governed-write descriptor refuse under that old pin and the count assertion fail — the pin is
   the unit's own acceptance surface for AC3, so it was re-pinned DATA-DRIVEN: counts derived
   from the directory (not the literal 4), the known set is `AGENT_ALLOWED_TOOLS` UNION the
   registry ids read from the YAML file itself (no second authority, no handler-id literals),
   every `agent_tool` descriptor still must bind to `AGENT_ALLOWED_TOOLS` (the four read-only
   ones keep binding exactly as today), every `governed_write` descriptor must bind to a
   registry id, and the negative fixture must be absent from every registry. No product
   behaviour changed; the four shipped descriptors are byte-untouched.
5. Worktree environment: this worktree had NO `node_modules` and was missing the documented
   `server/schema` / `server/records` / `server/config` root symlinks (CLAUDE.md "Symlinks in
   server/ also point to the root"). Without them `journeyCapabilities.routes.test.ts` and
   `journeyDispatch.test.ts` fail at collection (vocabulary loader reads
   `process.cwd()/schema/scientist-intent/...`). Restored as gitignored symlinks
   (`node_modules` -> `/mnt/vast/home/brad/git/cl-integration-2/node_modules`,
   `server/node_modules` -> `/mnt/vast/home/brad/git/computable-lab/server/node_modules`,
   `server/schema|records|config` -> `../...`); no install was run; `git status` stays clean.

## Changed files (exactly these; 5 files, +260/-25 vs base)

- `config/journey/governed-writes.yaml` (NEW, 15 lines)
- `config/journey/capabilities/noun-create-from-document.yaml` (NEW, 48 lines)
- `server/src/compiler/journey/capabilityCatalogue.ts` (135 lines, +48/-1)
- `server/src/compiler/journey/capabilityCatalogue.test.ts` (214 lines, +94)
- `server/src/compiler/journey/capabilityCatalogueSeed.test.ts` (122 lines, +60/-20, see note 4)

Prohibited files untouched: `routes.ts`, `handlers/**`, `ingestion/**`, `ai/**`, `schema/**`,
the four shipped descriptors, `app/**` — verified by `git diff --name-only base..HEAD` (only the
five files above).

## Commits

- `c0a23b6a` — RED: new test cases (g)-(k) committed before the registry and the implementation
- `f1bb6b83` — GREEN: registry + descriptor + implementation + re-pinned seed test

## RED (raw, pre-change code)

RED run A (commit c0a23b6a, initial fixtures — note: fixtures (g)/(h)/(k) originally wrote the
registry file INSIDE the capabilities dir; that layout is wrong for `join(dir, '..')` and was
caught at the first GREEN attempt):

    Test Files  1 failed (1)
          Tests  3 failed | 8 passed (11)
       Duration  1.97s (transform 336ms, collect 687ms, tests 251ms, ...)

  FAIL ... (g) admits a governed_write descriptor whose handler_ref the sibling registry declares
    AssertionError: expected false to be true // Object.is equality
  FAIL ... (h) still refuses a governed_write handler_ref that is in no registry and no agent tool
    AssertionError: expected [ …(16) ] to have a length of 1 but got 16
  FAIL ... (k) registry entries without an id are named and admit nothing from the registry
    AssertionError: expected [ …(16) ] to have a length of 2 but got 16

(h)/(k) went red because the in-dir "registry" file was being loaded as a DESCRIPTOR (16 Ajv
diagnostics) — proof the pre-change code has no concept of the registry.

RED run B (base `capabilityCatalogue.ts` at 4e866528 checked out, corrected sibling-registry
fixtures — the mandated RED in the true production layout):

    Test Files  1 failed (1)
          Tests  3 failed | 8 passed (11)
       Duration  2.23s (transform 543ms, collect 1.04s, tests 254ms, ...)

  ❯ (g) admits a governed_write descriptor whose handler_ref the sibling registry declares
      → expected false to be true // Object.is equality
  ❯ (j) a registry that does not parse is named and admits nothing from itself
      → expected [ Array(1) ] to have a length of 2 but got 1
  ❯ (k) registry entries without an id are named and admit nothing from the registry
      → expected [ Array(1) ] to have a length of 2 but got 1

(g) fails on the refusal: the descriptor is REFUSED today even though the sibling registry
declares `records.create` — pre-change admission has no registry to consult, so it falls to the
`:59` diagnostic `noun-create.yaml: /implementation/handler_ref: unknown handler id 'records.create'`.
(h) (the `no.such.write` refusal) PASSES pre-change and post-change — it is the invariant pin,
not a RED case. Full raw receipts: `/home/brad/.L2-NOUN-FROM-DOC-1-d1gwrite-scratch/red-true-layout.txt`.

## MUTATION PROBE (raw)

Applied: `config/journey/governed-writes.yaml` `writes:` entries deleted (file kept, `writes: []`).
The `records.create` admission in the REAL data (seed test, real `config/journey/capabilities/`
+ real registry) goes RED:

    ❯ admits every seeded descriptor
      → expected [ Array(1) ] to deeply equal []
    AssertionError: expected [ Array(1) ] to deeply equal []
      + Array [
      +   "noun-create-from-document.yaml: /implementation/handler_ref: unknown handler id 'records.create'",
      + ]
    ❯ binds agent_tool descriptors to shipped tools and governed_write to the registry
      → expected false to be true // Object.is equality
    ❯ rejects a candidate whose handler_ref is absent from every registry, naming the dangling id
      → expected [ { …(15) }, { …(15) }, …(2) ] to have a length of 5 but got 4

    Test Files  1 failed (1)
          Tests  3 failed (3)

Then restored (`git checkout -- config/journey/governed-writes.yaml`); `git -c
core.fileMode=false status --short` empty (no product path dirty) before committing. Full raw
receipt: `/home/brad/.L2-NOUN-FROM-DOC-1-d1gwrite-scratch/probe-run-seed.txt`.

## VERIFY (raw)

1. Targeted test (post-change):

       ✓ src/compiler/journey/capabilityCatalogue.test.ts  (11 tests) 279ms
       Test Files  1 passed (1)
             Tests  11 passed (11)
          Duration  1.85s

   Baseline at 4e866528 was `1 passed (1)` / `Tests  6 passed (6)` (measured this run at
   16:44:28 before any change); ends at 11 passing, the two mandated RED cases included.
2. Wider run (all of `src/compiler/journey/` + both journey route tests):

       Test Files  20 passed (20)
             Tests  152 passed (152)

3. Typecheck (a `.ts` signature was NOT changed, but run anyway):
   `cd server && npx tsc --noEmit 2>&1 | grep -c 'error TS'` → `0`.
4. AC3 served-surface check — the real five-file directory through the same code path the route
   uses (`loadCapabilityCatalogueDir(<repo>/config/journey/capabilities, new Set(AGENT_ALLOWED_TOOLS))`):

       {
         "capabilities": [
           "journey.material-library-search",
           "journey.ncbi-gene-search",
           "journey.noun-create-from-document",
           "journey.ontology-lookup",
           "journey.vendor-web-search"
         ],
         "diagnostics": []
       }

   `GET /api/journey/capabilities` route test: `Tests  4 passed (4)` (200 with diagnostics
   behaviour unchanged).
5. `git -c core.fileMode=false status --short` → empty (clean tree) at exit.

## ACCEPTANCE CONTRACT status

- AC1: MET — registry read back shows exactly one entry `records.create` naming `POST /records`
  and `[material, vendor-product]`; the descriptor names `handler_ref: records.create` and two
  committed-record output ports, each with `receipt_id`.
- AC2: MET — case (h) pins the refusal: `no.such.write` in no registry and no agent tool is
  refused with `unknown handler id 'no.such.write'`; the registry is never a wildcard (mutation
  probe: with `writes: []` even `records.create` is refused).
- AC3: MET — the four shipped read-only descriptors admit unchanged (byte-untouched files,
  agent-tool bindings preserved in the re-pinned seed test) and the five-file directory admits
  with `diagnostics: []` (raw check above).
- Not satisfied by this unit (per contract): the noun-create journey's own end-to-end criteria
  (item `verified by` (a)-(e), incl. the Thermo 25200056 mint) stay owed at the milestone gate;
  the port leg (accept path executing the registered write, receipt naming both ids, human-task
  completion kind `governed_write`) can now be briefed.

## Next actions / remaining blockers

- None for this unit. Owner next: brief the L2-NOUN-FROM-DOC-1 port leg against the ruling's
  points (1)-(4) now that the descriptor and registry exist.
- If `server/src/compiler/journey/capabilityCatalogueSeed.test.ts` is deemed outside this unit's
  file list by review, the re-pinning (decision 4) is the minimal compensating change — AC3
  cannot hold otherwise; it changes no product behaviour.
