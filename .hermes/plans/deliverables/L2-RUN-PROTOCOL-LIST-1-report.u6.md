# L2-RUN-PROTOCOL-LIST-1 — unit u6 report

Lane 2 · worktree /home/brad/cl-wt/L2-RUNPROTO-u6-lane2 · branch
cl/lane2-runproto-u6-attachdetach-l2t2230 · base 7b71911d5430e9d5234ed5a7b86fccb050cea872

## Unit
Wire the run surface's protocol list to the shipped attach/detach endpoints:
add/remove a protocol from the run surface, with list state taken from the
server's returned `protocolRefs` (labels from the re-read PLR record).

## Decisions
- Mutation id = PLANNED-RUN id. `readRunProtocols()` keeps the existing
  run -> `plannedRunRef` -> PLR resolution and returns the resolved PLR id,
  which is held in state (`plannedRunId`) and used to build the URLs. The run
  record id is never used as the endpoint id.
- Empty state: the component renders `null` only when no PLR can be resolved
  (unchanged). With a resolved PLR it always renders the heading + "Add
  protocol", even when `refs.length === 0`; the `<ol>` is hidden.
- Read-back, not optimism: on a successful mutation the server's
  `protocolRefs` ids are mapped through a FRESH `readRunProtocols()` read
  (`orderRefs(ids, freshRefs)`), so order/dedupe are the server's and labels
  are the record's. Ids with no label in the fresh read fall back to the raw
  id; picker labels are never used for the list.
- Picker candidates come from `apiClient.listRecordsByKind('local-protocol')`
  on first open; no protocol id/label/vendor is hardcoded.
- Mutation failure (non-2xx, network, bad JSON) leaves the rendered list
  untouched; read failure at load still blanks the list (unchanged
  best-effort semantics).
- Component stays context-free: nothing published into
  `ProtocolSelectionContext`.
- `protocolRefsOf` / `runProtocolRefs.ts` untouched.
- exactOptionalPropertyTypes: POST body is only built after a non-empty
  `selectedId` guard; body is `{ protocolId }` with a real string.

## Files changed (owned only)
- `app/src/run/RunProtocolList.tsx` (178 lines)
- `app/src/run/RunProtocolList.test.tsx` (198 lines)

No third file. `server/**`, `schema/**`, `runProtocolRefs.ts`,
`RunWorkspacePage.tsx`, `client.ts`, `*.yaml` untouched.

Test-file note: the two existing render tests now read the row label from the
label `<span>` (`labelText`) instead of `li.textContent`, because each row now
also contains its "Remove" button. Their assertions (exact labels, order,
lead marker) are unchanged in strength.

## RED (base component + new tests)
Command: `cd app && npx vitest run src/run/RunProtocolList.test.tsx`
```
→ Unable to find an accessible element with the role "button" and name "Add protocol"
 FAIL  src/run/RunProtocolList.test.tsx > RunProtocolList > attaches to the PLANNED RUN and re-reads the list from the server
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Add protocol"
 FAIL  src/run/RunProtocolList.test.tsx > RunProtocolList > renders the attach control for a run with no protocols yet
TestingLibraryElementError: Unable to find role="button" and name "Add protocol"
 FAIL  src/run/RunProtocolList.test.tsx > RunProtocolList > detaches from the PLANNED RUN and re-reads the list from the server
TestingLibraryElementError: Unable to find role="button" and name "Remove Beta"
Tests  6 failed | 7 passed (13)
```
(6 = the 4 new behaviour tests plus the 2 render tests whose label lookup now
expects the span.)

## GREEN
`cd app && npx vitest run src/run/RunProtocolList.test.tsx`
```
 Test Files  1 passed (1)
      Tests  13 passed (13)
```
`cd app && npx vitest run src/run/RunWorkspacePage.surface.test.tsx`
```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```
`cd app && npx tsc --noEmit`
```
13
0            # error lines mentioning RunProtocolList
```
Environment note: this worktree's `app/node_modules` symlink pointed at an
empty tree, so nothing could run and `npx` fetched vitest 5.x. Repointed the
existing (untracked) symlink at the populated `/mnt/vast/home/brad/git/cl-integration-1/app/node_modules`
(vitest 1.6.0) — no install. In THAT environment the base commit also yields
13 tsc error lines (identical file, `diff` empty: missing root-level modules
`ajv`/`yaml`/`prosemirror-view` plus 3 pre-existing TS7006 in
`RecordCreatePanel.tsx`); the brief's 10-line baseline was measured under a
different node_modules layout. Added lines attributable to this change: 0.
The symlink remains pointed at cl-integration-1 so the reviewer can run the
suites; it is untracked and was untracked at start.

## Commits
- 4df38056 L2-RUN-PROTOCOL-LIST-1 u6: RED tests for run-surface attach/detach
- 728a4b48 L2-RUN-PROTOCOL-LIST-1 u6: wire RunProtocolList attach/detach to /runs/:plannedRunId/protocols

## Next actions / handoff
- Browser/adversarial review owns acceptance; no Playwright journey was added
  (unit brief only, no authorized lane stack from this seat).
- Reviewer checks: POST/DELETE target the PLR id; empty run shows Add; list
  state from server refs; no hardcoded protocol ids; failed mutation keeps list.

L2-RUN-PROTOCOL-LIST-1 UNIT u6 DONE 728a4b48223a7804a22c0a37f984febe9ece3899
L2-RUN-PROTOCOL-LIST-1-u6 UNIT unit DONE 728a4b48223a7804a22c0a37f984febe9ece3899
