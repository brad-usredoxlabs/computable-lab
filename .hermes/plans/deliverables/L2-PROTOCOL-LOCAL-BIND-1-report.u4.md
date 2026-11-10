# L2-PROTOCOL-LOCAL-BIND-1 — unit u4 (browser-gate D2 read-path fix)

Lane 2 · worktree /home/brad/cl-wt/L2-LOCALBIND-u4-lane2 · branch cl/lane2-localbind-u4-l2t0055
· base eaff70d4. Browser gate FAILED item on served rev (reviews/L2-BROWSER-l2t0025.md CHECK 2):
the run's role surface never mounts.

## Diagnosis (D2)
RunProtocolStepsLoader.resolveRunProtocol read the run envelope and its PLR through
apiClient.getRecord (GET /api/records/:id). Both are tree-store records — that arm 404s, so
the resolve threw before the PLR arm ran and nothing was published. It also only looked at
protocolRef/sourceRef, so a specialized run's PLR (which names its LOCAL protocol under
localProtocolRef) resolved to null.

## Change (one seam, 1 product file + its test)
app/src/run/RunProtocolStepsLoader.tsx
- run + PLR read via apiClient.getRecordWithUI (GET /ui/record/:id) — same shape as the merged
  RunProtocolList.tsx:59-66 fix (advc-c1 D1/D2).
- protoRef precedence: pp.protocolRef ?? pp.localProtocolRef ?? pp.sourceRef. When localProtocolRef
  is the arm chosen and it carries no kind, kind is inferred as 'local-protocol'.
- local-protocol record read (inherits_from / content sha) and the steps/resource record read now
  also go through getRecordWithUI; sha comes from record.meta.
- No behaviour change to the steps endpoint (/api/protocols/:id/steps) or the published context shape.

## RED (before product change)
$ cd app && ../node_modules/.bin/vitest run src/run/RunProtocolStepsLoader.test.tsx
- Expected  Array [ "s1", ]  / + Received  Array []
  ❯ src/run/RunProtocolStepsLoader.test.tsx:313:46 (new test, steps never published)
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)

## GREEN (after product change)
$ cd app && ../node_modules/.bin/vitest run src/run/RunProtocolStepsLoader.test.tsx
 ✓ src/run/RunProtocolStepsLoader.test.tsx  (7 tests) 380ms
 Test Files  1 passed (1)
      Tests  7 passed (7)

$ cd app && ../node_modules/.bin/tsc --noEmit; echo EXIT=$?
EXIT=0

(eslint is not configured in this tree — no config file, EXIT=2 "couldn't find a configuration
file"; tsc is the type gate used here.)

## Test coverage
- New test: getRecord rejects 404 for the run/PLR (served-box behaviour), getRecordWithUI serves
  run → PLR → LPR → inherited universal; PLR payload carries ONLY localProtocolRef (no
  protocolRef/sourceRef, no kind). Asserts published steps, published resource roles
  (labwares + equipment), run-bound labware instance, the exact /ui/record call order, and that
  apiClient.getRecord was never called.
- The 6 existing tests were migrated to the /ui/record arm because they mock the seam that
  changed; their assertions are unchanged.

## Commits
e13302d6 RED — loader must serve tree-store reads + localProtocolRef
c1602290 resolve via /ui/record and honour localProtocolRef
(plus this report commit)

## Not in scope / left alone
D3 proposals UI, D1 fixtures/records, server/*, any component/UI file, RunProtocolList*.

## Next action (owner: orchestrator / browser reviewer)
Re-run the browser gate on the served rev and re-check D2 (role surface mounts, steps + resource
sections + bound labware visible). No YAML changed, so no lane-stack reload is required for this
unit; the app bundle must be rebuilt/served before live verification.
