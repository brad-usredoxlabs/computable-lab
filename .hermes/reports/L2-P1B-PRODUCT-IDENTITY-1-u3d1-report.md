# L2-P1B-PRODUCT-IDENTITY-1 — unit u3d1 (1 of 1) — report

- tier: normal · lane 2 · branch `cl/lane2-p1b-u3d1-0530` · base `f22d4305f155fe70090c2bde5d417aeb76b8f1ae`
- worktree: `/home/brad/cl-wt/L2-P1B-PRODUCT-IDENTITY-1-u3d1-lane2`
- continuation: yes (prior p1b branch 180cbac54 already merged; work started from base f22d4305f)
- decision: `.hermes/plans/decisions/STARTER-PACK-AND-PROMPT1-l2-20261114.md` §3
- scenario: prompt-1b ("Place a Thermo Optical-Quality Imaging Plate, 384-well, black-walled,
  clear bottom (catalog number A58941) on the deck.")
- finding: browser gate r2 defect D1
  (`/home/brad/.hermes/cl/lanes/2/receipts/PROMPT1b-GATE-r2-20261117T045833/PROMPT1b-GATE-r2-report.md` §D1)

## The defect (verbatim from the gate)

> definition created on /lab/labware/new is invisible to the product form; the identity chain cannot
> be built... LabCollectionView.tsx:281-286 loads kind='labware' for the + New product definition
> select, while LabLabwareNewPage saves kind='labware-definition'. Two type stores, one door each, no
> bridge.

## Decision taken

`.hermes/plans/architect-context-l2.md` §2 (the load-bearing distinctions) governs: "a reusable
DEFINITION is saved — an identified specification with declared properties and provenance"; "a PRODUCT
is registered — manufacturer/catalogue identity tied to a definition". The product door must therefore
be able to *see* the saved definition; the product record is still its own record pointing at it (no
promotion of the definition, no schema change).

Implementation (one fetch site, no new store, no server/schema change):

- `app/src/collections/LabCollectionView.tsx` — the `showProductModal` effect now fetches
  `listRecordsByKind('labware', 200)` **and** `listRecordsByKind('labware-definition', 200)` via
  `Promise.all`, merges the two `records` arrays and dedupes by `recordId` (first occurrence wins,
  legacy `labware` rows first) before `setProductDefinitions`. `VendorProductCreateModal` and
  `LabLabwareNewPage` were NOT touched — the modal renders whatever list it is given.
- `app/src/collections/VendorProductCreateModal.test.tsx` — two new legs (e):
  1. a stubbed kind-aware `apiClient` whose `'labware'` list holds only a legacy row and whose
     `'labware-definition'` list holds `LW-TESTDEF` must render `LW-TESTDEF` as an `<option>`
     (and still list the legacy row — merge, not replacement);
  2. a recordId present in BOTH stores renders exactly once (dedupe / duplicate-key guard).

Nothing else in the tree was modified. `git diff --stat f22d4305f..HEAD` = the two files below.

## Commits (real SHAs from git)

```
41dbda0e8 test(lane2): RED — product door must list kind=labware-definition records (L2-P1B-PRODUCT-IDENTITY-1 u3d1, gate r2 D1)
31bfac91b fix(lane2): product door loads labware-definition records too, deduped (L2-P1B-PRODUCT-IDENTITY-1 u3d1, gate r2 D1)
ec9d1397e report(L2-P1B-PRODUCT-IDENTITY-1 u3d1): seam-fix report — D1 two-store merge RED->GREEN, baselines, mutation probe
(this commit) marker(L2-P1B-PRODUCT-IDENTITY-1 u3d1): DONE marker + report DONE line (names the report commit)
```

The lane's own precedent (`L2-P1B-PRODUCT-IDENTITY-1-u2d1fix`, commits f1f0a4ed6 + 0d08bad7f) puts the
DONE marker file in a commit *after* the report commit, so the marker can name a real report-commit
SHA. Followed here: the brief's "commit 3" is the report commit, and the marker commit is commit 4.

## RED-first evidence (at base f22d4305f + test commit 41dbda0e8 only)

```
$ cd app && npx vitest run src/collections/VendorProductCreateModal.test.tsx
→ expected [ '', 'LBW-LEGACY-1' ] to include 'LW-TESTDEF'
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/collections/VendorProductCreateModal.test.tsx > VendorProductCreateModal > (e) lists a definition saved as kind=labware-definition beside the labware rows (gate r2 D1)
AssertionError: expected [ '', 'LBW-LEGACY-1' ] to include 'LW-TESTDEF'
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

The rendered option set is exactly the gate's signature: legacy `labware` rows only, the
`labware-definition` record invisible. The dedupe leg is green at base by construction (base fetches
one store), so it is a forward guard, not a RED leg — proven to bite by the mutation probe below.

## GREEN evidence (final code commit 31bfac91b)

```
$ cd app && npx vitest run src/collections/VendorProductCreateModal.test.tsx src/collections/LabCollectionView.test.tsx
✓ src/collections/LabCollectionView.test.tsx  (16 tests) 250ms

 Test Files  2 passed (2)
      Tests  25 passed (25)
   Start at  00:34:00
   Duration  6.41s (transform 470ms, setup 205ms, collect 1.07s, tests 445ms, environment 5.22s, prepare 878ms)
```

Baseline at base (measured first, before any edit): `Tests 23 passed (23)` across the same two files.
Final: 25 = 23 + the two new legs. No pre-existing test changed its verdict.

## Typecheck

Baseline at base (`npx tsc --noEmit` in `app/`): **17 errors**, all pre-existing
`TS2307 Cannot find module 'yaml' / 'ajv' / 'ajv-formats'` in `../server/src/**` (workspace
module-resolution noise, untouched by this unit).

At exit: **17 errors**, and `diff` of the two error lists (position-stripped) prints `IDENTICAL` —
ZERO new errors introduced.

## Mutation probe (the dedupe leg really bites)

Removed the `seen` filter from the merged array (temporary, uncommitted), ran the dedupe leg:

```
FAIL  VendorProductCreateModal.test.tsx > (e) dedupes a recordId present in both stores — it renders once
AssertionError: expected [ 'LW-DUP', 'LW-DUP' ] to have a length of 1 but got 2
      Tests  1 failed | 8 skipped (9)
```

Restored with `git checkout -- app/src/collections/LabCollectionView.tsx`; tree clean, HEAD unchanged.

## Scope compliance

- Owned files only: `LabCollectionView.tsx` (the `showProductModal` effect) and
  `VendorProductCreateModal.test.tsx`. `VendorProductCreateModal.tsx`, `LabLabwareNewPage.tsx`,
  `server/**`, `schema/**` untouched (`git diff --stat f22d4305f..31bfac91b` = 2 files).
- No new store, no schema change, no kind migration; a vendor-product still points at the record it is
  bound to.
- Budget disclosure: the production change is 12 net lines (one effect); the test file adds 76 lines
  (two legs + kind-aware stub helper), over the brief's 60-line soft budget. The overage is helper
  scaffolding, not extra assertions — flagged here rather than hidden.

## Next actions / owner

- Orchestrator: reload the lane stack if any YAML changed (none here) and re-drive the prompt-1b
  journey milestone on :5193 for gate r3 — D1 is a live-browser claim and this unit's evidence is
  unit-level only.
- Browser reviewer: the r3 journey must show the just-saved definition present in the "+ New product"
  "Points at definition" select and a `VPR-` product record whose `labware_definition_ref` names it.
- Remaining defects D2–D5 of gate r2 are NOT in this unit's scope.


L2-P1B-PRODUCT-IDENTITY-1 UNIT u3d1 DONE ec9d1397efcd08e42dc965e187c7d3bdba017d1b
