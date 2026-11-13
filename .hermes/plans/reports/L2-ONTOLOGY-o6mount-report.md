# L2-ONTOLOGY-ANCHOR-SOURCES-1 o6mount — Paperwork Report (2026-11-13)

Item: L2-ONTOLOGY-ANCHOR-SOURCES-1-o6mount-pw (unit 1 of 1, paperwork only). NO code changes in this unit.
Worktree /home/brad/cl-wt/L2-ONTOLOGY-o6mount-lane2, branch cl/lane2-ontology-o6mount-1109, base fab685053d65527021846c6dd08673747e3a3be2 (HEAD at start).

## Deliverable (code unit — DONE and MERGED before this run)
- server/src/resolve/ResolveSpine.ts seam: the local-obo tier now mounts conditionally on enabled sources.
- Branch commits ce5b6d1e (conditional mount, first pass) + fab68505 (conditional mount tests); +23/-12 across 2 files vs e26098d3.
- Trunk merge commit: cfbd64b0 (full: cfbd64b0dfd62864cb5309e7b780abe913ad19c4).

## Verification (as given in the brief — bedrock, not re-derived; not re-run this run)
- AC1: shipped registry with enabled sources -> local-obo tier still mounts (passing tests).
- AC2: all local-obo rows disabled / registry absent -> no local-obo hit (tests vs /home/brad/.ontocond-scratch/test-disabled-registry.yaml).
- AC3: wellsetSeededDrive.test.ts untouched.
- Focused check (measured 11:24 EST in this worktree): npx vitest run src/resolve/ResolveSpine.test.ts from server/ -> 17 passed (17/17).

## This unit (paperwork only)
Changed files (1): .hermes/plans/reports/L2-ONTOLOGY-o6mount-report.md (new). No .ts/.tsx/.yaml edits; no test runs; no server start; no git push.
Commits: the report commit (message 'docs(ontology-o6): paperwork report + DONE marker (code merged cfbd64b0)') + one append commit adding the exit-marker line.

## Marker notes
- Last line of this file, verbatim per brief acceptance #2: DONE L2-ONTOLOGY-ANCHOR-SOURCES-1-o6mount cfbd64b0
- The exit-marker line below names the first commit that contains this report file (the append commit that adds it is that commit's child; same shape as the u6fix3pw precedent in computable-lab-persistence.md).

## Verify
- Before: git -c core.fileMode=false status --porcelain -> empty (baseline measured 11:24 EST; re-measured clean this run).
- After: same command -> empty; git log -1 --oneline -> the docs commit for this report.

L2-ONTOLOGY-ANCHOR-SOURCES-1-o6mount-pw UNIT unit DONE ee29941b37c5b62b0e7e38ea9cd3f120beb8d344
DONE L2-ONTOLOGY-ANCHOR-SOURCES-1-o6mount cfbd64b0
