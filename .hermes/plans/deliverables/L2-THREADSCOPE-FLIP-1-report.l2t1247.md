# L2-THREADSCOPE-FLIP-1 — unit 1 of 3 (lane 2)

Branch `cl/lane2-threadscope-flip-1`, base `14211ef7` (merge-base verified; trunk tip at
dispatch was `fc84e8e8` docs-only — no merge needed).
Unit 1: the bridge scopeStatus SIGNAL + bounded settle deadline hook + its pins.
NO consumer changes (unit 2 = useAiChat gate; unit 3 = project-door hint + full matrix).

Commits (3, in order):
- `cd8ba3d2` test(lane2): RED scopeStatus pins (P-a/P-b/P-c)
- `c2dae6a5` feat(lane2): scopeStatus bridge signal + useScopeSettleDeadline
- `bf6cb84c` test(lane2): GREEN pins final form + budget comment tightening (HEAD)

## Output budget (measured vs base 14211ef7)

`git diff --numstat 14211ef7..HEAD -- app/`:
```
120  2  app/src/shared/shell/SurfaceChatBridge.door.test.tsx
   64  1  app/src/shared/shell/SurfaceChatBridge.tsx
```
Files = 2 (≤ 2). Lines added = **180** (≤ 180 — landed exactly at budget after
comment-only tightening in the final commit; no assertions changed by the trim).
Total changed = 183 (180 added + 3 deleted). The 3 deletions are the 2-line
registrar destructure edit and 1 mock-call line the test file's existing
`useSurfaceChat` mock already covered.

## Exact published context shape (the data contract)

The registrar publishes `scopeStatus` on `useSurfaceChat`'s existing options
shape via the SAME conditional-spread idiom as the `scope` line (SurfaceChatBridge.tsx:230,
kept as-is). `UseAiChatOptions` (useAiChat.ts — unit 2's file, untouched) does NOT
declare the key yet, so the key is ABSENT rather than `undefined`:

- **provisional** (scope genuinely undecided): the options carry
  `scopeStatus: 'provisional'` — an explicit key with the literal value.
- **settled** (the DEFAULT, spec §3a / brief P-c "absent = 'settled'"): the options
  carry **NO `scopeStatus` key at all**. The consumer's documented default
  (`useAiChat.ts`'s `scopeStatus?: 'settled' | 'provisional'`, absent ⇒ 'settled')
  resolves it. This is why the pins assert `expect(scopeStatus).toBeUndefined()` +
  `expect('scopeStatus' in opts).toBe(false)` for the settled shape, not a literal.

Predicate (registrar, data-only — no host-id branching, V-8):
```ts
const declaresDeck =
  entry.required_providers.includes('deck') ||
  entry.optional_providers.includes('deck')
const expectsScope = declaresDeck && (scopePending ?? true)
const deckScope = deckSlice?.scope
const settleWindowElapsed = useScopeSettleDeadline(expectsScope && deckScope == null)
const scopeStatus: 'settled' | 'provisional' =
  expectsScope && deckScope == null && !settleWindowElapsed ? 'provisional' : 'settled'
```
Publish (unchanged idiom, additive key):
```ts
useSurfaceChat({
  aiContext: collected.aiContext,
  endpoint,
  ...(scope !== undefined && isThreadSegmentSafe(scope) ? { scope } : {}),
  ...(scopeStatus === 'provisional' ? { scopeStatus } : {}),
  ...(handlers ? handlers : {}),
})
```
- Keys off the scope VALUE (`deckSlice?.scope`, the anchor at :219 `const scope =
  collected.scope`), never off the slice's presence.
- `scopePending` is a new OPTIONAL prop on `SurfaceChatBridgeProps`
  (`scopePending?: boolean`, default `true` = preserve current wire-time behaviour)
  so unit 2 can pass the decision; absent ⇒ `expectsScope` unchanged ⇒ zero
  behaviour change for existing callers.
- New separate hook `useScopeSettleDeadline(active: boolean): boolean` (NOT
  `export`ed — file-local; the brief pins the hook by behaviour via the bridge,
  not by importing it). It REUSES `DOOR_REQUIRED_RECHECK_DEADLINE_MS` (:132,
  unchanged) and is a SEPARATE timer from `useDoorRequiredRecheckDeadline`
  (that state drives the loud-fail throw — not coupled). Armed only while
  `active` (declares deck AND `deckScope == null`), so a provider-less door or an
  already-settled scope adds zero latency/timers.

P-c exact resolved shape (no settle within the deadline): the last forwarded
options have **NO `scopeStatus` key** (default `'settled'`) AND **NO `scope`
key** (absent — the server's `"_"` bucket) and the door did NOT throw (the slice
IS published; only its scope value is absent, so the loud-fail's own deadline
sees a present slice). I.e. settled-absent, decided, never provisional forever.

## RED (raw, before the bridge change — commit cd8ba3d2)

Command: `npx vitest run src/shared/shell/SurfaceChatBridge.door.test.tsx`
(full raw log: `/tmp/tsf-u1-red.txt`, 77 lines):
```
 ❯ src/shared/shell/SurfaceChatBridge.door.test.tsx  (6 tests | 3 failed) 29ms
   ❯ … > scopeStatus P-a: a deck door whose slice is scope-less on the first flush is provisional; the scope value arriving settles it
     → expected undefined to be 'provisional' // Object.is equality
   ❯ … > scopeStatus P-b: a non-deck surface is settled on the FIRST flush with zero timer advancement (no global deadline)
     → expected undefined to be 'settled' // Object.is equality
   ❯ … > scopeStatus P-c: no settle within the deadline resolves to a DECIDED settled-absent (never provisional forever)
     → expected undefined to be 'provisional' // Object.is equality

⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  … > scopeStatus P-a: …
AssertionError: expected undefined to be 'provisional' // Object.is equality

- Expected:
"provisional"
+ Received:
undefined
…
 Test Files  1 failed (1)
      Tests  3 failed | 3 passed (6)
```
(3 legacy cases passed untouched; the 3 new pins failed because the pre-change
bridge forwards no `scopeStatus` key at all.)

## GREEN (raw, after the bridge change — HEAD bf6cb84c)

Command: `npx vitest run src/shared/shell/SurfaceChatBridge.door.test.tsx`
(full raw log: `/tmp/tsf-u1-v1.txt`):
```
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/L2-THREADSCOPE-FLIP-1-lane2-l2t0550/app

(node:847352) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
 ✓ src/shared/shell/SurfaceChatBridge.door.test.tsx  (6 tests) 36ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  14:25:02
   Duration  10.34s (transform 204ms, setup 977ms, collect 2.02s, tests 36ms, environment 6.24s, prepare 596ms)
```
(Re-run after the final comment-only trim: `/tmp/tsf-u1-green-final.txt` — same,
`6 passed (6)`, 14:32:53.)

## No-regression checks

- `npx vitest run src/shared/shell` — final: 21 files / 107 tests all passing
  (base tree was 104/104; my delta is exactly +3 tests, the P-a/P-b/P-c pins).
  One transient `SurfaceIndicator.test.tsx` failure ('renders the find surface
  label on /find': `expected 'FindFind' to contain 'Find / Search'`) appeared in
  2 of the full-suite runs during this session and never reproduced on re-run.
  Diagnosed as PRE-EXISTING and UNRELATED, with measured evidence:
  - That test file imports neither `SurfaceChatBridge` nor my door test; the
    failure is a race inside `SurfaceIndicator.test.tsx`: the component renders
    a route-resolved fallback label and swaps in the mocked registry label
    (`'Find / Search'`) when the mocked `apiClient.getSurfaces()` promise
    resolves; the test asserts on the chip right after `findByTestId` without
    flushing the promise, so an unflushed registry yields the fallback text.
  - A/B measurement (3 full-suite runs on my tree, 3 with both owned files
    checked out to base 14211ef7): MY TREE 3/3 → 107/107 passed; BASE 3/3 →
    104/104 passed. Equal pass rate; the flake is timing, not my diff.
- `npx tsc --noEmit` — MY numbers: **10 `error TS` lines**, IDENTICAL to the
  orchestrator baseline at 14211ef7 (line-for-line diff = empty; all 10 in
  `src/event-editor/**` and `src/ingestion/**`, ZERO in the two touched files).
  Bar met: no new errors, zero in touched files.
- `git diff --name-only cl/integration-2...HEAD` → exactly the two owned files:
  `app/src/shared/shell/SurfaceChatBridge.door.test.tsx`,
  `app/src/shared/shell/SurfaceChatBridge.tsx`.
- `git status --porcelain --untracked-files=no` → empty.
- Existing door/throw behaviour unchanged: the 3 pre-existing door cases pass
  unedited; `useDoorRequiredRecheckDeadline` and the loud-fail throw path are
  byte-identical (the new hook is a separate timer; `scopePending` is optional
  with a default that preserves the current wire-time predicate).
- No host-id branching added (V-8); no new key in `config/chat/chat-hosts.yaml`
  (unchanged); no new dependency (unchanged); `node_modules` not touched.

## Decisions / notes

- Publish idiom: the brief says "publish `scopeStatus` on the registrar's
  existing context shape (additive field, default 'settled')". `UseAiChatOptions`
  (in the prohibited `useAiChat.ts`) does not declare the field, and tsc's
  excess-property check rejects a fresh-literal key that the target type lacks
  (verified by probe: explicit key → TS2353; conditional spread → clean). The
  bridge's own `scope` line already uses the conditional-spread idiom for the
  same reason, so `scopeStatus` is published the same way: explicit
  `'provisional'` while undecided, ABSENT (the documented default `'settled'`)
  once decided. This matches the brief's P-c parenthetical exactly ("absent =
  'settled' with no scope").
- P-b host: `record-host` (YAML `required_providers: []`,
  `optional_providers: []`, `ghost_mount: false`; base scope = the page-local
  record id). Its `AiContext.surface` is typed `'literature'` (no 'record-host'
  member on `AiSurface`), so the test base uses `surface: 'literature'` — the
  door's surface-union check is about the CONTEXT, not the host id (V-8).
- P-c host: `run-workspace` (declares `deck` required) with a PUBLISHED but
  scope-less deck slice — so the loud-fail throw does NOT fire (the slice IS
  present; only its scope value is absent), isolating the status decision.

---

# L2-THREADSCOPE-FLIP-1 — unit 2 of 3 (lane 2) — the CONSUMER gate

Base for this unit: `bf6cb84c` (unit 1 DONE). Commits: `4abc29e1` (a) RED pins;
`9298ca83` (b) gate + GREEN. No merge; no stack restart; no browser gate.

## The change (C-2/C-4)

`useAiChat.ts` now consumes `scopeStatus` (default `'settled'` — every existing
caller unchanged in behaviour):

| point | ref (final file) |
|---|---|
| `UseAiChatOptions.scopeStatus?: 'settled' \| 'provisional'` (documented) | `useAiChat.ts:446-453` |
| options destructure `scopeStatus` | `useAiChat.ts:700` |
| `scopeStatusRef` (ref, out of effect deps — settle never re-runs hydration) | `useAiChat.ts:908` |
| lazy-mint PROVISIONAL HOLD `if (scopeStatus === 'provisional') return` | `useAiChat.ts:964` |
| mint effect deps `[endpoint, scope, scopeStatus]` (settle re-run = normal path once) | `useAiChat.ts:973` |
| hydration PROVISIONAL HOLD `if (scopeStatusRef.current === 'provisional') return` | `useAiChat.ts:985` |
| hydration `!activeThread` guard (held-activation path) | `useAiChat.ts:990` |
| persist path is activation-keyed — the sync effect's `!activeThread` guard | `useAiChat.ts:1095` |
| returned `threadId` (absent while held) | `useAiChat.ts:2544` |

Holding activation holds persistence: the persist effect (`:1095`) early-returns
on `!activeThread`, so while the mint effect is held no activation exists and
nothing can be written — no separate persist gate is needed. Mid-session
widening (provisional arriving after an active thread) holds IO ONLY — the
early returns do NOT clear `activeThread`, so the pane is never emptied (C-4);
LEG F semantics unmodified.

## RED (raw, final test file vs pre-gate hook at bf6cb84c)

```
 ❯ src/shared/hooks/useAiChat.threadscope.test.ts  (3 tests | 1 failed) 20ms
   ❯ … > P-a: provisional (scope absent) => ZERO mint + ZERO thread GETs/POSTs; settle => ONE mint + ONE hydrate
     → expected 'tsfl1-id-_' to be undefined

 FAIL  src/shared/hooks/useAiChat.threadscope.test.ts > useAiChat — provisional scopeStatus gate (unit 2) > P-a: …
AssertionError: expected 'tsfl1-id-_' to be undefined
 ❯ src/shared/hooks/useAiChat.threadscope.test.ts:73:37
     71|     const { result, rerender } = renderGate()
     72|     await act(async () => {})
     73|     expect(result.current.threadId).toBeUndefined()
       |                                     ^

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```

(P-b and P-c pass PRE-gate by design — they are the zero-latency /
one-hydrate controls; P-a is the gate pin. Note the raw RED shows the hook
minting `tsfl1-id-_` under the no-scope bucket while provisional — the exact
c7 defect.)

## GREEN (raw, after the gate — commit 9298ca83)

```
 ✓ src/shared/hooks/useAiChat.threadscope.test.ts  (3 tests) 19ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

- `npx vitest run src/shared/hooks/useAiChat` → 29 passed / 2 failed (31 files),
  109 passed / 2 failed (111 tests). The 2 failures are PRE-EXISTING and
  environmental (missing `server/schema/scientist-intent/*.yaml` in this
  worktree): `useAiChat.card1fix5.realDrop.test.ts`,
  `useAiChat.card1fix5.reloadBoundary.test.ts` — identical to the clean
  baseline at bf6cb84c (verified by re-running those two files unmodified
  before any change). All other useAiChat suites GREEN UNEDITED.
- `npx vitest run src/shared/shell src/shared/hooks` → 51 passed / 2 failed
  (53 files), 218 passed / 2 failed (220) — same 2 pre-existing failures, no
  regressions. (Shell-only baseline 21 files/107 tests remains green within
  this run; the two card1fix5 failures live in the hooks dir.)
- `npx tsc --noEmit` → **10 error TS lines, 0 in touched files** — byte-
  identical to the branch baseline (diff of the two full outputs: IDENTICAL).

## Output budget (measured vs base bf6cb84c)

| file | added lines |
|---|---|
| `app/src/shared/hooks/useAiChat.ts` | 40 |
| `app/src/shared/hooks/useAiChat.threadscope.test.ts` (new) | 130 |
| **total** | **170** (≤ 170) ✓, 2 files (≤ 2) ✓ |

`git -c core.fileMode=false diff --name-only 14211ef7...HEAD` → only
`app/src/shared/hooks/useAiChat.ts`, `app/src/shared/hooks/useAiChat.threadscope.test.ts`
(unit 2) + `SurfaceChatBridge.tsx` / `SurfaceChatBridge.door.test.tsx` (unit 1).
`git -c core.fileMode=false status --porcelain --untracked-files=no` → empty.

## Pins (final test file)

- **P-a** (step 1): provisional, scope absent → `threadId` undefined, 0 thread
  GETs, 0 append POSTs, `getThreadTabId` (the ONE map) called 0 times, map `{}`;
  settle → exactly 1 mint (one map entry, the no-scope key) + 1 hydrate GET.
- **P-b**: settled first render (absent status) → hydrate on the FIRST effect
  pass, `vi.getTimerCount() === 0`, and 10 s of fake timers add no second GET.
- **P-c**: settled → mid-session provisional → settle again: hydrate GETs stay
  at exactly 1 (no double-fetch), map entry count 1, and the pane is NEVER
  cleared by the mid-session provisional (C-4; `threadId` stays the settled id).

## Decisions / notes

- The mint effect takes `scopeStatus` IN its deps (a settle flip must re-run
  the normal resolve path — C-3); the hydration effect reads the status via a
  REF kept OUT of its deps (a settle flip must NOT re-run hydration — C-3
  no double-fetch). A settle re-run of the mint that resolves to the
  ALREADY-ACTIVE (scope, id) pair skips re-activation (stable-activation guard
  in the mint effect), so hydration runs once.
- The `getThreadTabId` spy also backs the REAL header/append transport (same
  module instance via `vi.mock` boundary), so "spy not called" in the held
  phase covers both the mint and every wire path.
- The hook has no direct `fetch(`; the wire is exercised through the real
  `aiThreadClient` transport with `global.fetch` stubbed — the "fetch spy 0
  calls" pin is satisfied by the capture list (thread GETs/POSTs).

THREADSCOPE-FLIP1 UNIT2 DONE 9298ca83552113e933f28f349170efacb982af44
