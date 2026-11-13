# L2-SPEC-SHEET-INGEST-1 / g6topo (gate g6 defect D1) — coder report

Worktree: /home/brad/cl-wt/L2-SPECSHEET-g6topo-lane2
Branch: cl/lane2-specsheet-g6topo-2055
Base verified: b8f291edeb951798821124ca4be5f5563e656d11 (git rev-parse HEAD at start, clean tree)
Owned files only: LabLabwareNewPage.tsx (derivation), LabLabwareNewPage.test.tsx (pins).

## Decision

`buildPayloadFromProposals` now builds an EFFECTIVE proposal list before the existing
type-coercion loop: when no proposal carries `topology.addressing`, one is appended whose
value is derived only from facts the document yielded:

  rows AND columns -> grid
  else linear_count -> linear
  else -> single

The derived proposal rides the SAME loop, so schema coercion is unchanged. If the extractor
supplied `topology.addressing`, the list is untouched (extractor wins). Provenance on the
derived proposal reuses the first proposal's sourceUrl; `passage` is empty because the value
is inferred, not quoted from the sheet.

Server/Ajv untouched. `collectInvalidRequiredPaths` untouched.

## One test expectation updated (not weakened)

The g5 leg-3a test asserted refusal `...: topology` for a sheet that proposed only
capacity. Under the mandated rule such a sheet now derives `addressing: 'single'`, so that
fixture legitimately saves; the test now pins the same refusal contract on `capacity`
(sheet with rows+columns but no capacity) and asserts exact text
`Cannot save: missing or invalid: capacity` plus no POST. The prior g5 refusal semantics are
preserved: a required field with no proposal and no derivation still refuses by name.

## Baseline (RED) — before implementation

Command: `cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx`
Raw summary: `Tests  4 failed | 27 passed (31)`
Failures:
- derives topology.addressing = grid from rows+columns and writes (g6 D1)
  AssertionError: expected "spy" to be called 1 times, but got 0 times
- derives topology.addressing = linear from linear_count alone (g6 D1) — same (0 calls)
- derives topology.addressing = single when the sheet states no array facts (g6 D1) — same (0 calls)
- refuses with a named reason when schema-required capacity has no proposal
  expected 'Cannot save: missing or invalid: topo…' to be 'Cannot save: missing or invalid: capa…'
The no-overwrite pin (extractor-supplied addressing='linear' with rows/columns) PASSED in
RED, as specified. Existing 27 tests green.

## GREEN — after implementation

`cd app && npx vitest run src/collections/LabLabwareNewPage.test.tsx`
-> `Test Files  1 passed (1)` / `Tests  31 passed (31)`

`npm run typecheck -w app` (worktree root) -> exit 0, 0 errors.

Note: worktree had empty node_modules; installed with `npm ci --no-audit --no-fund`
(lockfile unchanged, 879 packages). This is environment setup, not a code change.

## Acceptance mapping

1. grid derivation from rows+columns and record writes (createRecord called, no error) — pinned.
2. linear from linear_count; single from no array facts — pinned.
3. extractor-supplied addressing never overwritten — pinned.
4. pre-flight refusal still fires (capacity absent, topology derivable) — pinned, exact text.
5. suite 31/31 green; app typecheck 0 errors.

Browser re-gate on the lane stack remains the reviewer's step (YAML untouched, no reload needed).

## Commits

- 194c1a72 test(spec-sheet): g6 D1 pins for derived topology.addressing
- 9b1fc868d1ebb6be58910acef473f68b16a2ed6b fix(spec-sheet): derive topology.addressing from array proposals

## Next actions

Orchestrator: hand to browser review for door-B save re-gate on a real reservoir sheet.
No blockers.

L2-SPEC-SHEET-INGEST-1-g6topo UNIT DONE 9b1fc868d1ebb6be58910acef473f68b16a2ed6b
L2-SPEC-SHEET-INGEST-1 UNIT unit DONE 9b1fc868d1ebb6be58910acef473f68b16a2ed6b
