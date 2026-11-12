# L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlui — Evidence Report

## Branch & Base

- Worktree: `/home/brad/cl-wt/L2-PROSE-c1yamlui-lane2`
- Branch: `cl/lane2-prose-c1yamlui-0912`
- Base: `cl/integration-2` trunk @ `e982b8f6`
- HEAD at time of collection: `cd8ce7bd`

## Commit Log (bounded, `e982b8f6..HEAD`)

```
cd8ce7bd L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlui: render data-recovered-from on the drafting transcript root; pane forwards the hook value
6560c8fe L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlui: relay status recoveredFrom on the drafting chat hook (opaque driver)
6aa9ca94 L2-PROSE-SHORTHAND-SALVAGE-1 c1yamlui: RED pin for the drafting-surface recovery marker (D2 surface half)
```

## File Changes (`e982b8f6..HEAD`)

```
app/src/agent/ChatLog.recovered.d2.test.tsx | 216 ++++++++++++++++++++++++++++
app/src/agent/ChatLog.tsx                   |  20 +++-
app/src/agent/HarnessChatPane.tsx           |   6 ++
app/src/shared/hooks/useAiChat.ts           |  40 +++++++
app/src/types/ai.ts                         |   9 ++
5 files changed, 289 insertions(+), 2 deletions(-)
```

## Commit 1: `6aa9ca94` — RED pin (D2 surface half)

**Files:** `app/src/agent/ChatLog.recovered.d2.test.tsx` (+216, new file)

Added a browser-gate vitest suite with 7 tests across 3 describe blocks:

1. **Hook (useAiChat)** — `it('records the status frame recoveredFrom.driver, relayed opaquely')` — asserts `statusRecoveredFrom` equals `{ driver: 'yaml-shorthand' }` when a status frame carries `recoveredFrom`.
2. **Hook (useAiChat)** — `it('a status frame with no recoveredFrom leaves the marker null')` — asserts `statusRecoveredFrom` is `null` on a clean status frame.
3. **Hook (useAiChat)** — `it('is one-turn: the next plain status frame clears the marker')` — sends two turns; asserts marker is set in turn 1 and cleared in turn 2.
4. **ChatLog render** — `it('puts data-recovered-from on the existing root element and adds ZERO visible text')` — renders two ChatLogs, asserts `data-recovered-from="yaml-shorthand"` on the root `<aside>`, asserts `textContent` is identical (zero visible change).
5. **ChatLog render** — `it('renders NO attribute when the turn was not recovered (absent, not empty)')` — asserts `hasAttribute('data-recovered-from')` is `false` when prop absent.
6. **HarnessChatPane wiring** — `it('forwards the hook driver onto the ChatLog root attribute')` — stubs `statusRecoveredFrom: { driver: 'yaml-shorthand' }` through `useRegisterAiChat`, asserts `<aside>` gets the attribute.
7. **HarnessChatPane wiring** — `it('forwards nothing for a clean turn (attribute absent)')` — stubs `statusRecoveredFrom: null`, asserts attribute absent.

## Commit 2: `6560c8fe` — Relay hook status

**Files:** `app/src/agent/ChatLog.tsx` (+20/-2, `app/src/agent/HarnessChatPane.tsx` (+6))

- `ChatLog.tsx:87-96`: New `recoveredFrom?: { driver: string }` prop with JSDoc (L2-PROSE-SHORTHAND-SALVAGE-1).
- `ChatLog.tsx:241`: Destructures `recoveredFrom` from props.
- `ChatLog.tsx:450`: Adds `{...(recoveredFrom ? { 'data-recovered-from': recoveredFrom.driver } : {})}` to the root `<aside className="sequences-page sequence-chat">` — key-absent discipline: attribute present (driver string) or absent, never empty/undefined.
- `HarnessChatPane.tsx:382-386`: Spreads `{...(chat.statusRecoveredFrom ? { recoveredFrom: chat.statusRecoveredFrom } : {})}` onto `<ChatLog>`.

## Commit 3: `cd8ce7bd` — Render on drafting transcript root; pane forwards hook value

**Files:** `app/src/shared/hooks/useAiChat.ts` (+40), `app/src/types/ai.ts` (+9)

- `ai.ts:36-44`: New `AiStatusEvent.recoveredFrom?: { driver: string }` field — server names the driver that salvaged a draft.
- `useAiChat.ts:254-270`: New `statusRecoveredFrom?: { driver: string } | null` on `UseAiChatReturn`, with JSDoc.
- `useAiChat.ts:729-732`: New `useState<{ driver: string } | null>(null)` for `statusRecoveredFrom`.
- `useAiChat.ts:944-946`: `resetChatState` clears `statusRecoveredFrom` to `null`.
- `useAiChat.ts:1263-1265`: New send clears `statusRecoveredFrom` before processing the turn.
- `useAiChat.ts:1493-1501`: Status event handler records `event.recoveredFrom ?? null` on `statusRecoveredFrom`.
- `useAiChat.ts:2571`: `clearHistory` clears `statusRecoveredFrom` to `null`.
- `useAiChat.ts:2605`: `statusRecoveredFrom` returned on hook result.

## Typecheck Result

Command: `cd app && timeout 300 npx tsc --noEmit -p .`

```
src/editor/taptab/tabNavPlugin.ts(7,33): error TS2307: Cannot find module 'prosemirror-view' or its corresponding type declarations.
../server/src/schema/SchemaLoader.ts(16,36): error TS2307: Cannot find module 'yaml' or its corresponding type declarations.
../server/src/ui/UISpecLoader.ts(9,18): error TS2307: Cannot find module 'yaml' or its corresponding type declarations.
../server/src/validation/AjvValidator.ts(17,21): error TS2307: Cannot find module 'ajv/dist/2020.js' or its corresponding type declarations.
../server/src/validation/AjvValidator.ts(18,73): error TS2307: Cannot find module 'ajv' or its corresponding type declarations.
../server/src/validation/AjvValidator.ts(19,24): error TS2307: Cannot find module 'ajv-formats' or its corresponding type declarations.
../server/src/validation/types.ts(8,32): error TS2307: Cannot find module 'ajv' or its corresponding type declarations.
rc=2
```

These are **pre-existing** errors in modules outside the lane's 5 touched files: `prosemirror-view` (editor), `yaml`/`ajv` (server). The lane's own files (`ChatLog.tsx`, `HarnessChatPane.tsx`, `useAiChat.ts`, `ai.ts`, `ChatLog.recovered.d2.test.tsx`) introduce no new type errors.

## Test Result (RED-pin test)

Command: `cd app && timeout 300 npx vitest run src/agent/ChatLog.recovered.d2.test.tsx`

```
RUN  v1.6.1 /home/brad/cl-wt/L2-PROSE-c1yamlui-lane2/app

(node:1497289) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
 ✓ src/agent/ChatLog.recovered.d2.test.tsx  (7 tests) 241ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  10:27:37
   Duration  14.51s (transform 517ms, setup 1.07s, collect 2.98s, tests 241ms, environment 9.17s, prepare 655ms)

rc=0
```

All 7 tests pass. RED pin is closed.

## D2 Surface Half Summary

The drafting-surface lineage (D2, surface half) is now instrumented end-to-end:

1. The server's status frame carries `recoveredFrom: { driver: '<driver>' }` when a draft was salvaged from the model's text (e.g. `yaml-shorthand`).
2. `useAiChat` records this as `statusRecoveredFrom` (opaque string, no client-side driver union) and clears it on resets, new sends, and when a subsequent status frame carries no `recoveredFrom` — one-turn scope.
3. `HarnessChatPane` forwards `statusRecoveredFrom` to `ChatLog` via conditional prop spread (key-absent on a clean turn).
4. `ChatLog` renders the driver as `data-recovered-from` on the **existing** root `<aside>` — zero new elements, zero visible text, zero layout change. Key-absent discipline: the attribute is either a driver string or not present.

The gate that previously found this marker only on the legacy `MessageLog`/`ReviewAiPanel` lineage now confirms it on the drafting lineage: `HarnessChatPane -> ChatLog` over `useAiChat`.

## Worktree State (post-collection)

```
$ git -c core.fileMode=false status --porcelain
(empty — clean)
```

## Exit Marker

L2-PROSE-SHORTHAND-SALVAGE-1 UNIT c1yamlui DONE 76d736f327a0e1d46ddeb475bf3a953e578b6be3
