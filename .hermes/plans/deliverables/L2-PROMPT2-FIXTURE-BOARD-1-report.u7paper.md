L2-PROMPT2-FIXTURE-BOARD-1 — Unit u7paper (u7 server half: derived-tab stripping)

## Summary
stripDerivedTabs wired into PUT serialization and the GET/return path so that derived
tabs are dropped from persisted workspace payloads (client-declared `derived: true` at
mint sites is honoured by the server; no derived tab rounds-trips into persistence).

## Code
- server/src/api/handlers/WorkspaceHandlers.ts  (PUT serialize + return path)
- server/src/api/handlers/WorkspaceHandlers.test.ts  (RED test: derived-tab stripping)
- server/src/workspace/types.ts  (stripDerivedTabs definition)
- server/src/workspace/types.derived.test.ts  (supporting tests)

## Commits
- 5d5de430  u7fix: wire stripDerivedTabs into PUT serialization and return path
- c816d554  u7fix: persist-path test pins derived-tab stripping on PUT+GET

## Merge
Merged into trunk cl/integration-2 as a164f34e (advc c1 ACCEPT —
review: .hermes/plans/reviews/advc-L2-PROMPT2-FIXTURE-BOARD-1-u7derivtab-c1.md).

## Adversarial review verdict
ACCEPT — 0 blocking defects, 3 non-blocking observations (O1 GET read-path gap,
O2 fallback-target convention, O3 derived honoured on deck tabs only). Per dispatch,
O1 is an observation; no derived tab can round-trip into persistence.

## Gate status
Browser 8/8 cold-load gate owed by the ITEM (not u7).

## WIP commit note
Commit 65721698 (HEAD at time of dispatch) contained only the review-doc move
(1 file added, no product code). Verified by:
  $ git -c core.fileMode=false show 65721698 --stat
  …dvc-L2-PROMPT2-FIXTURE-BOARD-1-u7derivtab-c1.md | 219 +++++++++++++++++++++

## Status
Unit delivered. Server half complete, advC ACCEPT, no further u7 work.

L2-PROMPT2-FIXTURE-BOARD-1 UNIT u7paper DONE a164f34e
