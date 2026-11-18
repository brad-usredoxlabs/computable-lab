# L2-DOC-INTAKE-1 u2fix6 — reconcile the :347 'dot-dot' literal pin

Worktree `/home/brad/cl-wt/L2-DOC-INTAKE-1-u2fix2-lane2`, base `1bb70273`. TEST-ONLY:
`ArtifactBlobStore.ts` is not in the diff.

## Change
`server/src/ingestion/ArtifactBlobStore.test.ts` (../evil.txt test): dropped
`toContain('dot-dot')` and its placeholder comment. The pin is now the accepted
variant-neutral shape — prefix containment, no `.`/`..` segment, no root escape —
plus `segments.toContain('ING-001')`, so a cleaned segment cannot consume the
artifactId level. That containment is the collapse-vs-passthrough tooth.

## Verification (scratch `/home/brad/u2fix6-scratch`, never the candidate)
- candidate: `npx vitest run src/ingestion/ArtifactBlobStore.test.ts` -> 18 passed (18);
  `npx tsc --noEmit` -> exit 0.
- mutant A (three `'dot-dot'` arms deleted from the branch sanitiser): targeted test RED —
  `expected [ 'ingestion-artifacts', 'evil.txt' ] to include 'ING-001'`; suite 4 failed /
  14 passed. The brief's "18/18 before the fix" did not reproduce: the literal mutant is
  already killed at this HEAD by four prefix pins.
- trunk variant (`b2f82fd6` `safeSegment`, total sanitise, dots -> `_`): 18/18 GREEN.
  Pre-fix test under the same variant was 1 failed / 17 passed, sole failure at `:347`.

Commits: `5db98bd7` (test pin), then this report commit and the marker commit.

L2-DOC-INTAKE-1-u2fix6 UNIT unit DONE 0938f20a614919d4c67d3942a82e2a3eb2cfd611
