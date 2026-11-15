# L2-GC-PEAK-NAMING-1-u2pin — report

Item: L2-GC-PEAK-NAMING-1-u2pin (lane 2, tier routine, 1 of 1 unit)
Worktree: /home/brad/cl-wt/L2-GC-PEAK-NAMING-1-u1data-lane2
Branch: cl/lane2-peaknaming-u1data-l2t2640, base 3987aeb0df8de224906996c5621966fcbf59762d
Started at HEAD 2fd4b94872ed821337d8d82011bf46cec1b184cb (u1data continuation)

## What changed

One file, two edits (exactly as specified in the brief):
- server/src/registry/CompoundClassRegistry.test.ts
  1. Test title: "returns the three methyl-ester standards (GC-2 F)" -> "returns the eight methyl-ester standards (GC-2 F)" (line 101).
  2. candidates toEqual list: 3 entries -> 8 entries in yaml order:
     FAME-LOCAL:methyl-hexanoate-n6, methyl-octanoate-n8, methyl-decanoate-n10,
     methyl-myristate-n14, methyl-pentadecanoate-n15, methyl-palmitate-n16,
     methyl-heptadecanoate-n17, methyl-arachidate-n20 (lines 108-117).
- Name assertion and chebi_ids (['CHEBI:77322','CHEBI:87432','CHEBI:143577']) untouched, per brief.

Decision basis (as named in brief, not re-derived): rulings 72c48ff82 + fa9e28cd0 —
peak names live in the knowledge layer; u1data (commit 85971344a on this branch)
extended schema/registry/compound-classes/fame-medium-chain.yaml to the 8 methyl esters.

## Commits (this unit)

1. 5c181f41f — "L2-GC-PEAK-NAMING-1 u2pin GREEN: registry test pins 8 FAME candidates" (the test edit, committed first per brief)
2. <report commit sha — see marker line below> — this report
3. <marker commit sha — see marker line below> — DONE marker appended (exit contract requires appending after the report is committed)

## RED (measured, pre-edit)

Reproduced by `git stash` (test file back to 3-candidate version), run from app/:
  npx vitest run --root .. server/src/registry/CompoundClassRegistry.test.ts
  ❯ server/src/registry/CompoundClassRegistry.test.ts  (8 tests | 1 failed) 21ms
  Test Files  1 failed (1)
       Tests  1 failed | 7 passed (8)
Failure at the candidates toEqual (test expected 3, registry returns 8) — matches the brief's RED.
Then `git stash pop` restored the edit.

Note on invocation: the brief's literal `npx vitest run ../server/src/...` from app/
yields "No test files found" because the ../server path is outside app/'s vitest include
root. The equivalent invocation that runs the identical test file under the monorepo root is
`npx vitest run --root .. server/src/registry/...` from app/ (used for RED and GREEN below).

## GREEN (measured, post-edit, final commit)

From app/:
  npx vitest run --root .. server/src/registry/CompoundClassRegistry.test.ts
  ✓ server/src/registry/CompoundClassRegistry.test.ts  (8 tests)
  Test Files  1 passed (1)
       Tests  8 passed (8)

  npx vitest run --root .. server/src/registry/FameCompoundClass.test.ts
  Test Files  1 passed (1)
       Tests  3 passed (3)   (file unchanged)

## Typecheck (final commit)

`pnpm -w run typecheck`: server tsc fails with exactly the 6 pre-existing TS2339
(multipart .parts/.file: AIHandlers.ts x3, AiIngestionHandlers.ts, ExtractProtocolHandler.ts,
sequenceRoutes.ts) named in the brief; zero of them in CompoundClassRegistry.test.ts
(grep count 0). Zero delta vs trunk/bar. The server workspace's non-zero exit stops the
workspace run before app/ tsc executes (same as the brief's pre-existing note).

## AC map

1. Registry test 8 passed / 0 failed — PASS (output above).
2. FameCompoundClass.test.ts still green, file unchanged — PASS (3 passed; git diff confirms only the one test file edited).
3. Diff of the unit span (2fd4b9487..HEAD) touches exactly: server/src/registry/CompoundClassRegistry.test.ts (1 code file) + this report. (HEAD~2..HEAD from the marker commit shows only the report + marker line; the test file was committed as 5c181f41f, which is the HEAD~2 boundary.)
4. DONE marker line names unit L2-GC-PEAK-NAMING-1-u2pin and the sha of the commit that contains this report (the report commit) — see final line.

## Files

- server/src/registry/CompoundClassRegistry.test.ts (only code file, +5/-1 lines)
- .hermes/reports/L2-GC-PEAK-NAMING-1-u2pin-report.md (this report)

L2-GC-PEAK-NAMING-1-u2pin UNIT L2-GC-PEAK-NAMING-1-u2pin DONE 6d80dbbe190fa6754884a482b5fa881dbce29762
