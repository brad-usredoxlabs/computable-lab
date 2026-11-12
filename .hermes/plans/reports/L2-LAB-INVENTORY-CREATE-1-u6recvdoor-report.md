# L2-LAB-INVENTORY-CREATE-1 / u6recvdoor — lane 2 report

Worktree: /home/brad/cl-wt/L2-LABINV-u6recvdoor-lane2
Branch: cl/lane2-labinv-u6recvdoor-1442 (base 040dea57)
Status: implementation COMPLETE; acceptance (browser gate) NOT claimed.

## What landed
1. RED spec `app/src/collections/MaterialReceivingDoor.test.tsx` (4 tests) — first run failed
   with "Failed to resolve import ./MaterialReceivingDoor" (module did not exist).
2. `app/src/shared/api/client.ts` — closed adapter union at compileWorkstateDraft widened:
   `'workstate' | 'analysis' | 'record-drafting' | 'chain' | 'receiving'`. No cast, no alias.
3. `app/src/collections/MaterialReceivingDoor.tsx` (new) — one modal; controlled inputs; single
   submit → `apiClient.compileWorkstateDraft({ adapter: 'receiving', intent: { operation:
   'compose-receiving', claim } })`; claim built by conditional spread (absent, never
   present-as-undefined); result panel shows draftId + reviewHash when canAccept, otherwise
   `diagnostics[].message` verbatim; no accept control and no accept call anywhere.
4. `LabCollectionView.tsx` — `+ Receive a lot` button (data-testid lab-category-receive-lot) in the
   `activeCategory === 'materials'` block + one `useState`; door mounted beside
   LabwareInstanceCreateModal. Existing three doors, chat card, and server untouched.
5. `LabCollectionView.test.tsx` — +2 tests (door mounts/opens on materials; absent on labware).

## Decisions / deviations (measured, not invented)
- Brief step 1(a) lists quantity+unit and storage location as door inputs. They are NOT in the
  receiving claim vocabulary: server/src/receiving/MaterialReceivingDraft.ts:68-86 declares
  claim.additionalProperties:false with exactly vendor, catalogNumber, productLabel, lotNumber,
  expirationDate, receivedByLabel, receivedByStatus, occurredAtStatus, occurredAt, approximation,
  evidenceFileNames, supersedesRecordId, correctionNote. Sending quantity/storage would be rejected
  by Ajv as additionalProperties — i.e. a guaranteed refusal for every correct entry. Omitted; the
  server's intent schema is the authority (schema/server read-only per scope).
- occurredAt rides only when occurredAtStatus !== 'unknown' (known: date; approximate: date +
  approximation), because the lint pairings at schema/lab/material-receiving.lint.yaml:56-124 make
  "known without occurredAt" and "approximate without occurredAt+approximation" refusals. unknown
  carries neither. This is the lint data's rule, not new policy.
- receivedBy name field appears only when receivedByStatus is known|approximate (lint :129-148:
  known receiver requires receivedBy). AC1 as literally written ("receivedByStatus known" with no
  receiver name) will therefore be refused by the server rule
  material-receiving-known-receiver-needs-receivedBy — the gate must also fill "Received by (name)".
  Flagging to the composer/gate; not patched around, because downgrading a declared status or
  inventing a receiver would be data fabrication.
- Output budget: 5 files, 362 added lines (component 187, spec 120, LC test +34, LC +17, client +4).
  Over the 300-line budget; overage is documentation + test coverage only, no extra scope. Not
  BLOCKED because the functional scope is the briefed one.

## Verification (raw)
$ cd app && npx vitest run src/collections/MaterialReceivingDoor.test.tsx
Test Files  1 passed (1) / Tests  4 passed (4) / Duration 9.01s

$ cd app && npx vitest run src/collections/LabCollectionView.test.tsx
Test Files  1 passed (1) / Tests  12 passed (12) / Duration 2.43s
(baseline 10 → +2, no drop)

$ cd app && npx tsc --noEmit 2>&1 | head -n 20
7 errors, all pre-existing module-resolution failures (prosemirror-view, yaml, ajv,
ajv/dist/2020.js, ajv-formats) outside collections; none in the touched files. Not repaired.

Mutation probe: `adapter: 'receiving'` → `'workstate'` in MaterialReceivingDoor.tsx, ran the spec:
FAIL submits ONE compile with adapter receiving ... AssertionError: expected 'workstate' to be
'receiving'; Tests 1 failed | 3 passed (4). Reverted; `git -c core.fileMode=false status --short`
clean after revert.

## Commits
29ac6879 test(ui): receiving-door spec + widen compile adapter union to receiving (u6recvdoor)
fccdc6dd feat(lab): mount Receive a lot door on /lab materials (u6recvdoor)

## Next leg (NOT in this unit)
Accept rail inside the door (POST /api/drafts/accept with reviewHash) — deliberately absent.

L2-LAB-INVENTORY-CREATE-1 UNIT u6recvdoor DONE fccdc6dde349f965b5ff05cb0348dbf5b5088585
