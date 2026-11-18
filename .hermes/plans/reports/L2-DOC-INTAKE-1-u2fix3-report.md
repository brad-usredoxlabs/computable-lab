# L2-DOC-INTAKE-1 — u2fix3 report (u2 lineage, D1 of u2fix2 review)

Lane 2 · worktree /home/brad/cl-wt/L2-DOC-INTAKE-1-u2-lane2
Branch cl/lane2-docintake-1-u2-l2t1545
Base HEAD at start: 8cbe0ccec320c2dae44263c6499505b681418dc2 (tree clean, verified)
Fix commit: 00c853353b51f3c45334d767efa393c36a65d92e

## Scope
D1 MINOR from reviews/L2-DOC-INTAKE-u2fix2-advc-c1-l2t2345.md (:137, verdict FIX 1 at :182):
u2fix2 deleted `function safeName` in favour of `safeSegment`, but the test group title still
named `safeName()`. Renamed the PARENT describe only; no assertion, `it()` title, import or
product code touched.

Note on provenance: the `reviews/` directory is not present in this worktree, so the review file
itself could not be re-read here. D1's substance was re-established independently and first-hand
from the code: the pre-change grep returned exactly one `safeName` hit — the stale group title —
and `server/src/ingestion/ArtifactBlobStore.ts:27` defines `safeSegment` with no `safeName`
anywhere in product code.

## The change (one line, one file)
server/src/ingestion/ArtifactBlobStore.test.ts:284
  -  describe('safeName()', () => {
  +  describe('fileName segment sanitisation', () => {

Rationale for the title: both child `it()`s exercise the fileName segment produced by `save()`
(:285-299 spaces/parens stripped; :301-311 default `${artifactId}.bin`), which is exactly the
`safeSegment(args.fileName ?? ...)` call at ArtifactBlobStore.ts:97. Title spelling
("sanitisation") matches the existing British usage at :315.

## RED — before (raw)
$ cd /home/brad/cl-wt/L2-DOC-INTAKE-1-u2-lane2 && grep -rn "safeName" server/src app/src; echo "grep_rc=$?"
server/src/ingestion/ArtifactBlobStore.test.ts:284:  describe('safeName()', () => {
grep_rc=0

## GREEN — after (raw)
$ cd /home/brad/cl-wt/L2-DOC-INTAKE-1-u2-lane2 && grep -rn "safeName" server/src app/src; echo "grep_rc=$?"
grep_rc=1

## Diff scope (raw)
$ git -c core.fileMode=false diff --stat
 server/src/ingestion/ArtifactBlobStore.test.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)

## Targeted tests (raw)
$ cd /home/brad/cl-wt/L2-DOC-INTAKE-1-u2-lane2/server && npx vitest run src/ingestion/ArtifactBlobStore.test.ts
 ✓ src/ingestion/ArtifactBlobStore.test.ts  (17 tests) 14ms
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  1.31s
Matches the composer baseline (17/17); a rename changes no behaviour, so the count is unchanged.

## Not run (deliberately)
- `tsc`: no signature or type changed; brief says not required.
- Whole-directory test run: brief forbids it; targeted file only.
- Mutation probe: not applicable — acceptance here is a grep-clean title, not a behaviour pin.
  No mutation was invented or claimed.

## Untouched / still open on the branch (by design — do not read as fixed)
- O1: LegacyArtifactBlobStore.save:163 raw artifactId (pre-existing, unreachable in production).
- O2: `assertPrefix` accepts whitespace-only prefixes (compliant with stated conditions).
- D5: `dataKind: 'binary'` hardcode.
- D6: fourth DREF mint copy.
- D8: budget.

STATUS: complete

L2-DOC-INTAKE-1 UNIT u2fix3 DONE 0fd3d811bb3cc69c3eda8f0aeb23362d07e682ab
