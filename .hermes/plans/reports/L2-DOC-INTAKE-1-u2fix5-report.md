# L2-DOC-INTAKE-1 u2fix5 — advc c1 FIX-5 (test + paperwork only)

Worktree `/home/brad/cl-wt/L2-DOC-INTAKE-1-u2fix2-lane2`, branch
`cl/lane2-docintake-1-u2fix2-l2t1655`, base `9e28c220`. No production code changed.

## Test (D1/D2) — pin made variant-neutral

`server/src/ingestion/ArtifactBlobStore.test.ts`, table test "pins residual dot-segment
classes on the composed provider path": deleted the `if (c.args.artifactId === '...')`
special case and its `toContain('...')` pin. Every case now asserts (a) prefix
containment, (b) no segment equals `.` or `..`, (c) `storedPath === written`, and
(d) `resolve('/blob-root', written)` stays inside the root. No `toContain('_')` pin
added: the test states nothing about HOW dots are sanitised, so trunk's total
sanitiser variant (b2f82fd6, dots -> `_`) passes it too. `ArtifactBlobStore.test.ts:347`
(`toContain('dot-dot')`) is untouched — pre-existing pin, not the D2 subject. The edit
is line-neutral (5 insertions / 5 deletions), so `:414` and `:453` keep their meaning.

Variant check (`/tmp/u2fix5-variant-check.cjs`): both a dot-preserving and a total
sanitiser applied to the same six inputs pass (a)-(d); hostile control
`ingestion-artifacts/../../etc/passwd` fails (b) and (d) as intended.

## Paperwork (D3/D4/D5)

- u2 report `:66`: format-pin citation `ArtifactBlobStore.test.ts:414` -> `:453`
  (verified: `:414` is the `relPath.startsWith('ingestion-artifacts/')` assertion).
- u2fix4 report `:114`: commit list -> `d2b108d5` (test pin), `ce3440d7` (both
  reports), `9e28c220` (verification text + marker); `git show --stat ce3440d7`
  touches only the two report files.
- u2fix4 report `:94`: the marker names `ce3440d7` (the report commit); the marker
  line itself ships in `9e28c220`.

## Verification (raw)

    $ cd server && npx vitest run src/ingestion/ArtifactBlobStore.test.ts
     ✓ src/ingestion/ArtifactBlobStore.test.ts  (18 tests) 22ms
     Test Files  1 passed (1)
          Tests  18 passed (18)

    $ cd server && npx tsc --noEmit; echo "tsc exit=$?"
    tsc exit=0            (no output)

Baseline at `9e28c220` was also 18/18; test count unchanged. Commits: `ead89b02`
(test pin, this unit), then the report-body commit and the marker commit. The marker
names the report-body commit `3e18a488`; the marker line itself ships in the commit
after it.

L2-DOC-INTAKE-1-u2fix5 UNIT unit DONE 3e18a48803f5ddf3b2b5567b46ca9124ec33a759
