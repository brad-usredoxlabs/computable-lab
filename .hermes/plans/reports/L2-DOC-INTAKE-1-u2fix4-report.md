# L2-DOC-INTAKE-1 UNIT u2fix4 — residual D3 pins + D5/D6 paperwork

Branch `cl/lane2-docintake-1-u2fix2-l2t1655`, base `332976025742b5f175b48434c6919c6649b3aa8c`.
No YAML touched (no lane-stack reload owed), no product file edited, unit 1 of 1.

## What was pinned (D3)

One table-driven test added inside the existing `describe('safeName()')` of
`server/src/ingestion/ArtifactBlobStore.test.ts`:

`it('pins residual dot-segment classes on the composed provider path (artifactId " ..", ".. /.. ", "..."; fileName ".", "..", " .. ")')`

Six residual classes, each asserting on the recording provider's OWN recorded write
(`writeCalls[0].path`, `ArtifactBlobStore.test.ts:35`), array reset per case:
`artifactId` `' ..'`, `'.. /.. '`, `'...'` (also asserted to survive as `'...'`, not `'..'`);
`fileName` `'.'`, `'..'`, `' .. '`. Per case: (a) `written.startsWith('ingestion-artifacts/')`;
(b) `written.split('/')` contains no segment `'..'` and none `'.'` (segments, not
substring); (c) `result.storedPath === written`. Every failure message names the case
label and the composed path.

## RED-first measurement (honest)

At `33297602` **every residual class was already green** — 17 → 18 tests, 0 failures on
the first run after adding the table. The pins are missing coverage, not a product
defect; no product change was made or invented. Probe B shows their discriminating power.

    RUN  v1.6.1 /home/brad/cl-wt/L2-DOC-INTAKE-1-u2fix2-lane2/server

     ✓ src/ingestion/ArtifactBlobStore.test.ts  (18 tests) 27ms

     Test Files  1 passed (1)
          Tests  18 passed (18)
       Start at  07:12:46
       Duration  2.92s (transform 67ms, setup 0ms, collect 75ms, tests 27ms, environment 0ms, prepare 58ms)

## Mutation probes

### Probe A — target `writeCalls[0].path` → `result.storedPath` only (test file, reverted)

sha256 before == after: `d57314bf57be18cc9611bd7fe18bed2e9dc1b5d8dbb9b1c3cf80a40303985fec`;
`git status --short` after restore printed nothing.

    RUN  v1.6.1 /home/brad/cl-wt/L2-DOC-INTAKE-1-u2fix2-lane2/server
     ✓ src/ingestion/ArtifactBlobStore.test.ts  (18 tests) 20ms
     Test Files  1 passed (1)
          Tests  18 passed (18)

Stayed GREEN, and the reason is structural, not verbal: `save()` composes the path once
(`ArtifactBlobStore.ts:98`) and writes that same string (`:103`), so the two witnesses
cannot diverge in this implementation. The probe therefore does not show the table is
vacuous w.r.t. the traversal classes (Probe B does), it shows the two witnesses coincide.
Pins are kept on `writeCalls[0].path` as mandated — the provider's recorded output — plus
a per-case `expect(writeCalls.length).toBe(1)` guard.

### Probe B — delete `ArtifactBlobStore.ts:37-38` in out-of-tree scratch (evidence only)

Scratch `/home/brad/.u2fix4-scratch/` = worktree copy, no `.git`, `server/node_modules`
symlinked. Lines removed, scratch copy only, exactly these two:

    if (cleaned === '..') return 'dot-dot';
    if (cleaned === '.') return 'dot';

    ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
     FAIL  ... > safeName() > keeps the write path under the prefix when a cleaned segment becomes ".."
    AssertionError: expected false to be true // Object.is equality
     ❯ src/ingestion/ArtifactBlobStore.test.ts:327:58
        327|       expect(written.startsWith('ingestion-artifacts/')).toBe(true);

     FAIL  ... > safeName() > pins residual dot-segment classes on the composed provider path (...)
    AssertionError: artifactId " .." (cleaned-to-..): composed path x.bin: expected false to be true
     ❯ src/ingestion/ArtifactBlobStore.test.ts:376:100
        376|         expect(written.startsWith('ingestion-artifacts/'), `${c.label}…
        378|         expect(segments, `${c.label}: composed path ${written}`).not.t…

     Test Files  1 failed (1)
          Tests  2 failed | 16 passed (18)
       Duration  622ms

Worktree product file untouched at exit: `sha256sum server/src/ingestion/ArtifactBlobStore.ts`
== `git show HEAD:server/src/ingestion/ArtifactBlobStore.ts | sha256sum` ==
`624c9bd0b40d3ae8d041cd674dbbdeb5842eaff9a4bdbedd86760e8520bccf08`.

## D5 corrections

Appended to `.hermes/plans/reports/L2-DOC-INTAKE-1-u2-report.md` as
`## CORRECTIONS (advc c1 D5)` — append-only (`git diff --numstat` = 14 insertions, 0
deletions), plus the `LegacyArtifactBlobStore` raw-artifactId OBSERVATION and the SCOPE
HONESTY note (defects 5/6/8 out of unit).

## D6 paperwork

Owned new report path. The historical 8-hex `DONE a3617f71` at
`L2-DOC-INTAKE-1-u2-report.md:60` is left intact (append-only; not rewritten). Marker
below is full 40-hex, read from `git rev-parse HEAD` in this worktree.

## Verification (raw, at report commit `ce3440d7`)

    RUN  v1.6.1 /home/brad/cl-wt/L2-DOC-INTAKE-1-u2fix2-lane2/server

     ✓ src/ingestion/ArtifactBlobStore.test.ts  (18 tests) 23ms

     Test Files  1 passed (1)
          Tests  18 passed (18)

    $ git -c core.fileMode=false status --short
    (empty)

    $ git -c core.fileMode=false diff --name-only 33297602..HEAD
    .hermes/plans/reports/L2-DOC-INTAKE-1-u2-report.md
    .hermes/plans/reports/L2-DOC-INTAKE-1-u2fix4-report.md
    server/src/ingestion/ArtifactBlobStore.test.ts

Typecheck skipped by design: no `.ts` signature change and no product-file change.
Commits: `d2b108d5` (test pin), `ce3440d7` (test pin + both reports), marker commit.

## Remaining obligation

The item's only remaining obligation is the browser gate.

L2-DOC-INTAKE-1 UNIT u2fix4 DONE ce3440d7a12b67ffafe3e18ba2f0d743e72cc322
L2-DOC-INTAKE-1-u2fix4 UNIT unit DONE ce3440d7a12b67ffafe3e18ba2f0d743e72cc322
