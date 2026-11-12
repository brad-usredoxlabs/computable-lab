# L2-DOC-INTAKE-1 — unit u2fix2 report

Branch: cl/lane2-docintake-1-u2-l2t1545 (existing fix run, no new worktree/branch)
Base at hand-off: 81a62f84aef4bf9f9b32d2c5d5882a14d756b6eb
Owned files touched: server/src/ingestion/ArtifactBlobStore.ts,
server/src/ingestion/ArtifactBlobStore.test.ts, this report.

## Defects closed
- D7 (MINOR): artifactId was interpolated raw at the stored-path join; safeName could
  let '..' survive as a whole segment, leaving resolvePath's containment check as the
  only guard.
- D4 (MINOR): `...(format ? { format } : {})` was dead (formatForPath always returns a
  non-empty string) and its "pin" claimed key ABSENCE while asserting format === 'bin'.
  The comment claiming exactOptionalPropertyTypes safety was false.

## Shipped shape (reviewer bait answer)
`format` is ALWAYS PRESENT as a string ('bin' when the name has no extension). It is
not optional and is never undefined; `format?: never undefined` never arises. The
payload stays `Record<string, unknown>`, so no exactOptionalPropertyTypes interaction.

## Changes
1. ArtifactBlobStore.ts
   - `safeName` replaced by `safeSegment(value, fallback = 'artifact')`: collapse
     non-[A-Za-z0-9._-] runs to '-', collapse dot runs ('.{2,}', so no '..' survives
     anywhere), strip leading/trailing dots and hyphens, fall back when empty.
   - Applied to `args.artifactId` at the stored-path join (and to fileName, as before;
     the existing 'artifact.bin' fallback is preserved via the fallback argument).
   - `assertPrefix(prefix)` called ONCE in the constructor: rejects empty, '.', '..',
     and any '/' or '\\'; error message quotes the offending value. Callers untouched;
     no device id, mount path or '.ingestion-artifacts' literal added.
   - Dead `...(format ? { format } : {})` deleted; `format` emitted unconditionally;
     stale exactOptionalPropertyTypes comment replaced with the true statement.
2. ArtifactBlobStore.test.ts
   - New `describe('path segment validation')`:
     * traversal artifactId ('../../etc/passwd') -> 3 segments, no '..', no leading '/',
       second segment === 'etc-passwd';
     * table pin: '..' -> 'artifact', 'a/../b' -> 'a-.-b', '' -> 'artifact', each with
       exactly 3 segments and no '..' in the segment;
     * `new ArtifactBlobStore(storage, '../evil', recorder)` throws a message naming
       '../evil'.
   - Recorder test renamed to 'emits format as a present string for extension and
     extensionless names'; asserts `'format' in payload === true` and values 'csv' / 'bin'
     for both shapes.

## Invariants preserved
resolveDevice() laziness (construction does not resolve a device), legacy READ-ONLY
fall-through, DREF-ID minting, recorder payload keys, save()/loadBase64() signatures,
the three prohibited callers, schema/, app/, config/.

## Verification (raw)
RED before the product change (tests-only commit d68a9c5b):

    FAIL  ... path segment validation > sanitises artifactId into a single segment with no .. and no leading slash
    - Expected
    + Received
    - ..
    + ../etc/passwd/x.pdf
    FAIL  ... path segment validation > collapses whole-segment dots, .. runs and empty ids to a safe segment
    AssertionError: expected [ 'x.pdf' ] to have a length of 3 but got 1
    FAIL  ... path segment validation > throws naming the prefix when it is not a single non-empty path segment
    AssertionError: expected [Function] to throw an error
    Test Files  1 failed (1)
         Tests  3 failed | 14 passed (17)

GREEN after the product change (b2f82fd6):

    $ cd server && npx vitest run src/ingestion/ArtifactBlobStore.test.ts
     ✓ src/ingestion/ArtifactBlobStore.test.ts  (17 tests) 26ms
     Test Files  1 passed (1)
          Tests  17 passed (17)

Typecheck (run once, at the end):

    $ cd server && npx tsc --noEmit
    error TS2688: Cannot find type definition file for 'semver'.
      The file is in the program because:
        Entry point for implicit type library 'semver'

Exactly the one pre-existing baseline line; no new diagnostics. The semver gap was not
"fixed".

## Mutation probe (pin is not vacuous)
Mutated ONLY the product line added in this unit, reverting to raw interpolation:

    -    const storedPath = join(this.prefix, safeSegment(args.artifactId), fileName);
    +    const storedPath = join(this.prefix, args.artifactId, fileName);

    $ cd server && npx vitest run src/ingestion/ArtifactBlobStore.test.ts
    FAIL  src/ingestion/ArtifactBlobStore.test.ts > ArtifactBlobStore — storage-backed > path segment validation > sanitises artifactId into a single segment with no .. and no leading slash
    AssertionError: expected '../etc/passwd/x.pdf' not to contain '..'
    FAIL  src/ingestion/ArtifactBlobStore.test.ts > ... > collapses whole-segment dots, .. runs and empty ids to a safe segment
    AssertionError: expected [ 'x.pdf' ] to have a length of 3 but got 1
    Test Files  1 failed (1)
         Tests  2 failed | 15 passed (17)

Product line restored before commit. `git status --short` after restore showed only
`M server/src/ingestion/ArtifactBlobStore.ts`; after commit the tree was clean.

## Commits
- d68a9c5b tests (RED pins)
- b2f82fd6 product fix
- this report

## Next actions / not in this unit
D5 (hardcoded dataKind: 'binary'), D6 (fourth DREF mint copy), D8 (budget) remain out of
scope by design. The u2fix1b BLOCKED escalation (IngestionWorker vendor_formulation_html)
is untouched and still needs an orchestrator decision.
L2-DOC-INTAKE-1 UNIT u2fix2 DONE 60ccd65ffe7e85e7df702c2dd9c1b12e5b608c9e
