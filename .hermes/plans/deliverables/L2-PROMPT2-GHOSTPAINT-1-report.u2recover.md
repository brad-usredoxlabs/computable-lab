# L2-PROMPT2-GHOSTPAINT-1 — U2-RECOVER UNIT REPORT (Paperwork Fix L2T0905)

## Commits

| Commit | Message | Notes |
|--------|---------|-------|
| 15f180a7b7dad1c49a1e2f5cdcbb90bff16b1238 | L2-PROMPT2-GHOSTPAINT-1 u2-recover: sole-placement labwareId at the answer-fold seam | Deliverable commit — 3 files, 311 insertions(+), 1 deletion(-) |
| 8ea5d812 (branch tip) | WIP AT EXIT (launcher auto-commit, NOT gated): L2-PROMPT2-GHOSTPAINT-1 left the tree dirty; committed by cl-coder-launch.py so no work is lost. Review before accepting. | WIP sweep auto-commit — NOT part of the deliverable scope. Do NOT extend or revert. |

## Diff vs base 3d1e7bb4

### 3d1e7bb4..15f180a7 (deliverable commit)
```
 server/src/ai/AgentOrchestrator.ts                   |  15 +-
 ...handChat.recompileLabwareId.ghostpaint1.test.ts   | 249 +++++++++++++++++++++
 server/src/ai/shorthandChat.ts                       |  48 ++++
 3 files changed, 311 insertions(+), 1 deletion(-)
```

### 15f180a7..8ea5d812 (WIP auto-commit)
```
 server/src/ai/clarificationLoop.ts                   |  94 +++++++++++
 server/src/ai/debug_fold.ts                          |  65 +++++++
 server/src/ai/enrichMaterialDomains.ts               |  94 +++++++++++
 server/src/ai/materialBinding.ts                    | 221 +++++++++++++++++++++++++
 server/src/ai/materialIdentity.ts                   | 103 +++++++++++
 server/src/ai/materialRefFields.ts                   | 126 +++++++++++
 server/src/ai/mintLabelFidelity.ts                  | 145 ++++++++++++
 server/src/ai/recoverInventedMaterialFields.ts       | 147 +++++++++++
 8 files changed, 995 insertions(+)
```

### 3d1e7bb4..HEAD (total)
```
 server/src/ai/AgentOrchestrator.ts                   |  15 +-
 server/src/ai/clarificationLoop.ts                   |  94 ++++++++
 server/src/ai/debug_fold.ts                          |  65 ++++++
 server/src/ai/enrichMaterialDomains.ts               |  94 ++++++++
 server/src/ai/materialBinding.ts                    | 221 +++++++++++++++++
 server/src/ai/materialIdentity.ts                   | 103 +++++++++
 server/src/ai/materialRefFields.ts                   | 126 ++++++++++
 server/src/ai/mintLabelFidelity.ts                  | 145 ++++++++++
 server/src/ai/recoverInventedMaterialFields.ts       | 147 ++++++++++
 ...handChat.recompileLabwareId.ghostpaint1.test.ts   | 249 +++++++++++++++++++++
 server/src/ai/shorthandChat.ts                       |  48 ++++
 11 files changed, 1306 insertions(+), 1 deletion(-)
```

## Test Execution (raw output)

Test file: `server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts`
Command: `./server/node_modules/.bin/vitest run server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts`
Timestamp: 2026-11-05 ~09:07 UTC

```
The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v1.6.1 /tmp/wt-ghostpaint-u2recover

 ❯ server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts  (6 tests | 2 failed) 255ms
   ❯ server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts > L2-PROMPT2-GHOSTPAINT-1 leg 2B: applySoleDeckPlacement > B1: sole placement injects labware into well-bearing action with no identity
     → expected 0 to be greater than or equal to 1
   ❯ server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts > L2-PROMPT2-GHOSTPAINT-1 leg 2B: applySoleDeckPlacement > B2: concept-vs-formulation parity — both produce the same details.labwareId
     → Cannot read properties of undefined (reading 'details')

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts > L2-PROMPT2-GHOSTPAINT-1 leg 2B: applySoleDeckPlacement > B1: sole placement injects labware into well-bearing action with no identity
AssertionError: expected 0 to be greater than or equal to 1
 ❯ server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts:117:27
    115|     expect(result.success).toBe(true);
    116|     const events = (result.events ?? []) as unknown as Array<Record<st…
    117|     expect(events.length).toBeGreaterThanOrEqual(1);
       |                           ^
    118|     const details = events[0]!.details as Record<string, unknown>;
    119|     expect(details.labwareId).toBe('LBW-96-1');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts > L2-PROMPT2-GHOSTPAINT-1 leg 2B: applySoleDeckPlacement > B2: concept-vs-formulation parity — both produce the same details.labwareId
TypeError: Cannot read properties of undefined (reading 'details')
 ❯ server/src/ai/shorthandChat.recompileLabwareId.ghostpaint1.test.ts:162:18
    160|     const ev1 = (result1.events ?? [])[0] as unknown as Record<string,…
    161|     const ev2 = (result2.events ?? [])[0] as unknown as Record<string,…
    162|     expect((ev1!.details as Record<string, unknown>).labwareId).toBe('…
       |                  ^
    163|     expect((ev2!.details as Record<string, unknown>).labwareId).toBe('…
    164|     expect((ev1!.details as Record<string, unknown>).labwareId).toBe(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
   Start at  09:07:08
   Duration  3.70s (transform 463ms, setup 0ms, collect 3.02s, tests 255ms, environment 0ms, prepare 89ms)
```

## Defects Status

| Defect | Status | Reason |
|--------|--------|--------|
| B1: `events.length` expected >= 1 but got 0 | **PAPERWORK_OUT_OF_SCOPE** | Product code defect — `result.events` is empty at shorthandChat.recompileLabwareId.ghostpaint1.test.ts:117. Sole-placement feature does not inject labware events. Requires code fix. Owner: coder. |
| B2: `Cannot read properties of undefined (reading 'details')` | **PAPERWORK_OUT_OF_SCOPE** | Same root cause — events array is empty so `events[0]` is undefined at shorthandChat.recompileLabwareId.ghostpaint1.test.ts:162. Product code defect. Owner: coder. |

## Worktree Status

- Tracked files: clean (no dirty tracked files before this commit)
- Untracked (expected): `app/node_modules`, `server/node_modules`

## Conclusion

Both B1 and B2 are product-code defects requiring a coder to fix the sole-placement feature so it actually injects labwareId events. These are NOT evidence-trail / paperwork defects. Per the closeout policy, I cannot and will not touch product code to "fix" these.

L2-PROMPT2-GHOSTPAINT-1-u2recover UNIT report BLOCKED: B1-B2 product code defects — events array empty at shorthandChat.recompileLabwareId.ghostpaint1.test.ts:117,:162; coder must implement sole-placement injection
