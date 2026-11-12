# L2-PROSE-SHORTHAND-SALVAGE-1 — unit c1yamlui-fix1 (advc c1 D1+D2)

Worktree: /home/brad/cl-wt/L2-PROSE-c1yamlui-lane2 (branch cl/lane2-prose-c1yamlui)
Base: 0505664e (unit 1-3 product commits on branch: 6aa9ca94 RED pin, 6560c8fe hook relay, cd8ce7bd render)

## Scope executed
Only the two advc-c1 defects; D3/D4/D5 (report paperwork) untouched and belong to the paperwork fixer.

### D1 (MAJOR) — re-key wipe arm did not clear the recovery marker
`app/src/shared/hooks/useAiChat.ts` idle re-key arm (`if (reKeyed) {`):
- before: `setMessages([])` + `persistedIdsRef.current = new Set()` only. A recovered
  turn -> idle scope re-key -> messages 0 but `statusRecoveredFrom` still
  `{driver:'yaml-shorthand'}` -> false-positive marker on a fresh empty transcript.
- after: added `setStatusRecoveredFrom(null)` next to `setMessages([])` (mirrors
  resetChatState :947 / send reset :1265 / clearHistory :2571), with a 4-line comment.
- Diff is that one hunk only: `git diff --stat` = 1 file, 5 insertions.

### D2 (MINOR) — same-turn plain-frame clear was unwitnessed
Added ONE leg to `app/src/agent/ChatLog.recovered.d2.test.tsx`: frames
`[status(recoveredFrom: yaml-shorthand), status(plain), done]` in a single
`runTurn` -> marker null at settle. This witnesses the per-frame
`setStatusRecoveredFrom(event.recoveredFrom ?? null)` write. Pin, GREEN on
current code.

Also added (RED-first) the D1 leg: recovered turn on `endpoint='browser'`,
`scope='DECK-A'`, then `h.rerender({ scope: 'DECK-B' })` while idle -> assert
`messages` empty AND marker null. The file now mocks `../shared/api/aiThreadClient`
(getThread -> empty thread, appends no-op) so the endpoint+scope mount does no
network IO; pre-existing no-endpoint legs are unaffected.

## Commits
- A (RED, tests only): 82b29d70 `L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlui-fix1: RED - re-key wipe + same-turn frame-clear legs`
- B (GREEN, :1056 edit + this report): sha recorded in the exit marker below.
- C (marker): this appended line.

## Verification receipts

### 1. RED capture (before the :1056 edit) — exactly the new re-key leg fails
Command: `cd app && npx vitest run src/agent/ChatLog.recovered.d2.test.tsx`
```
 RUN  v1.6.1 /home/brad/cl-wt/L2-PROSE-c1yamlui-lane2/app
 ❯ src/agent/ChatLog.recovered.d2.test.tsx  (9 tests | 1 failed) 424ms
   ❯ ... > drafting-surface recovery marker — hook (useAiChat) > a thread re-key wipe clears the marker with the transcript
     → expected { driver: 'yaml-shorthand' } to be null
 FAIL  src/agent/ChatLog.recovered.d2.test.tsx > ... > a thread re-key wipe clears the marker with the transcript
AssertionError: expected { driver: 'yaml-shorthand' } to be null
 ❯ src/agent/ChatLog.recovered.d2.test.tsx:166:50
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```
(8 passed = 7 pre-existing + the new same-turn pin, which is GREEN by design.)

### 2. GREEN after the :1056 edit
Same command:
```
 ✓ src/agent/ChatLog.recovered.d2.test.tsx  (9 tests) 353ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```
Re-run after mutant restore: `9 passed (9)` again (log /tmp/c1yamlui-fix1-green2.log).

### 3. Mutation probe (D2 witness)
`:1499` temporarily mutated to `if (event.recoveredFrom) setStatusRecoveredFrom(event.recoveredFrom)`:
```
 ❯ src/agent/ChatLog.recovered.d2.test.tsx  (9 tests | 1 failed) 353ms
   ❯ ... > a plain status frame LATER IN THE SAME TURN clears the marker
     → expected { driver: 'yaml-shorthand' } to be null
 FAIL ... AssertionError: expected { driver: 'yaml-shorthand' } to be null
 ❯ src/agent/ChatLog.recovered.d2.test.tsx:141:50
      Tests  1 failed | 8 passed (9)
```
Restore proof: the line was restored to the quoted anchor
`            setStatusRecoveredFrom(event.recoveredFrom ?? null)` (now line 1504,
shifted only by the 5 added D1 lines), and `git diff app/src/shared/hooks/useAiChat.ts`
contains ONLY the :1055 hunk — no :1499 hunk. Final green re-run: 9/9.

### 4. Typecheck — environment-limited, NOT a code failure
`cd app && npx tsc --noEmit` -> rc=2, but every diagnostic is TS2307
"cannot find module" in files this unit did not touch:
`prosemirror-view` (editor/taptab/tabNavPlugin.ts), `yaml` x2 + `ajv` x3 +
`ajv-formats` (server/src/...). Cause: this worktree's deps are a shared symlink
(`app/node_modules -> /mnt/vast/home/brad/git/cl-integration-2/app/node_modules`)
missing prosemirror-view, and `server/node_modules` does not exist at all.
Baseline proof: stashed the production edit, re-ran tsc -> rc=2, and
`diff /tmp/tsc-baseline.log /tmp/tsc-after.log` is IDENTICAL. ZERO diagnostics in
either changed file. tsc rc=0 is therefore not obtainable in this worktree until
its deps are restored (owner: launcher/env provisioning); it is not caused by,
and does not hide, this unit's change.

### 5. Neighborhood regression
`npx vitest run src/shared/hooks/useAiChat src/agent/ChatLog src/agent/HarnessChatPane`
-> `Test Files 2 failed | 48 passed (50)`, `Tests 2 failed | 216 passed (218)`.
Both failures are missing-server-deps environment errors, unrelated:
- `useAiChat.card1fix5.realDrop.test.ts`: `Cannot find module './compose/composer.js'` (server/yaml shim)
- `useAiChat.card1fix5.reloadBoundary.test.ts`: `Failed to resolve import "yaml" from "../server/src/ai/shorthandChat.ts"` (server/node_modules absent)
No useAiChat/ChatLog/HarnessChatPane behavioral failure; D1/D2 file 9/9.

## Remaining blockers / next actions
- tsc rc=0 gate cannot be met by this worktree (missing deps; identical baseline).
  Orchestrator: provision `server/node_modules` + prosemirror-view, or accept the
  baseline-identical evidence above.
- Browser/advc review of the fix is still owned by the reviewer; this unit is
  implementation-complete only.
