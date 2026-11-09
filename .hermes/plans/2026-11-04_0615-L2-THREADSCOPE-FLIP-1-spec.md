# SPEC-OF-RECORD — L2-THREADSCOPE-FLIP-1 (lane 2) — PROMOTED

Status: **SPEC-OF-RECORD (binding for the coder claim)**. Promoted by the orchestrator (tick l2t0550) 2026-11-04T06:05 EST
from the reviewed composer draft. Binding authority above this spec remains
`decisions/CARD1-D2B-SCOPEKEY-l2t0435-ruling.md` (Q1 C-1..C-4, Q2, Q3, Q4 allowlist, RE-RUN OBLIGATIONS) — this spec makes
that ruling coder-executable and never widens it.

PROMOTION REVIEW RECORD (orchestrator, first-hand):
- Ruling + item text read at source; contract and allowlist transcribed, not relayed.
- Code cites re-measured on trunk `fc4acd17`: `useAiChat.ts` lazy-mint :937-941, switch/new :906-921, listThreadsForChat
  :927-930; `SurfaceChatBridge.tsx` scope :218-219, guard/spread :227-232, `DOOR_REQUIRED_RECHECK_DEADLINE_MS` :132,
  loud-fail throw :274-281; `threadTabIds.ts` map key :89-91 + mint-on-read :100-109; `DeckChatSlice.tsx` scope publish
  :151; `config/chat/chat-hosts.yaml` project-deck-tab `optional_providers: [deck]` + three provider-less doors;
  `useSurfaceChat` spreads `...options` (:37) — so NO `app/src/agent/**` file is required.
- Baselines measured by the orchestrator: four named tests **4 files / 14 tests PASS** on `fc4acd17`;
  `app npx tsc --noEmit` **rc=2, 10 `error TS` lines / 12 output lines, ZERO in any touched file**. §6.4 was corrected
  from the draft's "exit 0 / empty output" to this measured delta bar before promotion.
- Composer run: `logs/speccomp-THREADSCOPE1-l2t0550.log` (COMPOSER_EXITED rc=0). Draft provenance:
  `~/.hermes/cl/lanes/2/drafts/spec-L2-THREADSCOPE-FLIP-1-l2t0550.md`.

DISPATCH DISPOSITION: item stays `todo`; claim is blocked only on a free fleet slot and on L2-CLARIFY-TARGET-1 no longer
being live on `app/src/agent/**`. `useAiChat.ts` is shared with L2-CLARIFY-CARD-1's D2-leg re-gate — the spec forbids
restructuring the hydration/sync effects for exactly that reason.

---

# SPEC-OF-RECORD DRAFT — L2-THREADSCOPE-FLIP-1 (lane 2, tick l2t0550)

Status: DRAFT for orchestrator review (not dispatchable until promoted).
Binding input: `decisions/CARD1-D2B-SCOPEKEY-l2t0435-ruling.md` (Q1 contract C-1..C-4, Q2 item boundary,
Q4 allowlist, RE-RUN OBLIGATIONS). This spec makes that contract coder-executable; it does not re-open it.
Reproduction: `~/.hermes/cl/receipts/L2-CLARIFY-CARD-1/2026-11-04_0435-c7/` (REPORT.md criterion 3,
`trail-reloaddiag.json`, `trail-picker.json`, `dom/picker-isolation.json`).
All line numbers below were re-measured on trunk `cl/integration-2` @ `fc4acd17` on 2026-11-04 at 05:50-05:57
EST. Read with `git -c core.fileMode=false` (NFS fileMode trap).

## 1. GOAL

Make the chat thread's `(scope, threadId)` key a function of the surface's SETTLED identity instead of
wire-time slice-publication timing, by holding the lazy-mint effect, the hydration GET and the sync POSTs
while the door's scope is still PROVISIONAL, releasing on the slice's scope value or on the existing bounded
deadline.

## 2. DEFECT + ROOT CAUSE (verified at source, not relayed)

The key is resolved by WHEN the effects run, not by what the surface is.

- `useAiChat.ts:937-941` — the lazy-mint effect calls `resolveTabThreadId(scope)` on `[endpoint, scope]`.
  `scope` is whatever the bridge handed over at that render.
- `SurfaceChatBridge.tsx:218-219` `const scope = collected.scope`, then `:227-232` forwards it as
  `...(scope !== undefined && isThreadSegmentSafe(scope) ? { scope } : {})`. **"Not yet decided" and
  "decided to be absent" collapse into the same absence** — that is the hole.
- `collectSurfaceContext.ts:139-163` (READ-ONLY, see §4) — the deck arm returns the slice's scope only when
  the slice carries one (`:156`), and the base arm returns `base.scope` (`:171`). So the collected scope for
  the same door is: `undefined`/`studyId` before the deck state loads, `EVG-…` after.
- `DeckChatSlice.tsx:151` publishes `...(state.eventGraphId ? { scope: state.eventGraphId } : {})`, `:238`
  publishes the bundle on every render; `state.eventGraphId` arrives asynchronously from
  `EventEditorContext.tsx:1514-1537`. The bundle is published **scope-less first**, then with the scope —
  the slice's *presence* is not the signal, its *scope value* is. `SurfaceSliceStore.tsx:151-158` documents
  the window (the publisher's ref write and the registrar's read are split across a commit, "a beat after"),
  so `collected.scope` is provisional at first mount.
- `threadTabIds.ts:100-109` mints once per map key (`""` for absent scope, `:89-91`); `aiThreadClient`
  `threadHeaders()` attaches the id per request. Both are CORRECT. They faithfully key on the value they
  are handed; the value is the defect.

Measured consequence (receipts, not theory): live session POSTs to `/api/ai/threads/event-editor` with
`x-cl-thread-scope: null`, thread `9ebdc7b8…`, messages 1→2 (`trail-reloaddiag.json` steps 34-38); after the
slice lands the same pane reads with `x-cl-thread-scope: EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b`,
thread `bf650cce…`, `messages: 0` (steps 24-27); the sessionStorage map at that instant holds THREE keys for
ONE surface — `{"STU-scratch":"76f10ed8…","":"9ebdc7b8…","EVG-cellrox-…":"bf650cce…"}` (step 40). The
6-message thread `472ff3b5` is intact under `"_"` (REPORT.md criterion 3). Picking it in the picker
(`trail-picker.json`) re-reads it under `EVG` → still 0. Cold mount and live session derive different keys
for the same surface; nothing is corrupted server-side.

**Explicitly NOT the defect and NOT to be touched:** `threadTabIds.ts`, `aiThreadClient.ts`,
`server/src/ai-threads/**` (including the `"_"` bucket and `AiThreadStore`'s key). A fix that reaches for
them has misread C-1..C-4.

## 3. IMPLEMENTATION CONTRACT (C-1..C-4 as executable requirements)

C-1 (unchanged, restated): a conversation is `(userId, endpoint, scope, threadId)`; `scope` is the surface's
instance identity as a pure function of (route, loaded-record state) — for the deck door the loaded
`state.eventGraphId`; an unsaved deck has NO scope (`"_"`). Never a function of publication timing.
C-2 (the work): while the scope is PROVISIONAL the pane must NOT hydrate and must NOT persist.
C-3: cold-mount derivation === live-session derivation; the tab-id map is written once per (tab, settled
scope).
C-4: no provisional writes, ever; LEG F semantics unmodified (it protects a turn across a flip; C-2 makes
the flip impossible before the first write).

### 3a. Decision (a) — the settled/provisional signal at the bridge seam

Recommended shape (coder may pick an equivalent; C-2's observable behaviour is the contract, not this
encoding):

- `SurfaceChatBridge.tsx` computes and passes a status alongside the value:
  `useSurfaceChat({ … , scopeStatus: 'settled' | 'provisional', ...(safeScope !== undefined ? { scope: safeScope } : {}) })`
- `UseAiChatOptions` gains `scopeStatus?: 'settled' | 'provisional'` (documented default `'settled'`).

Predicate in the registrar (all inputs already live there, `SurfaceChatBridge.tsx:178-219`):

    declaresDeck   = entry.required_providers.includes('deck') || entry.optional_providers.includes('deck')
    expectsScope   = declaresDeck && (props.scopePending ?? true)
    deckScope      = deckSlice?.scope              // the slice's SCOPE VALUE, never the slice's presence
    windowElapsed  = useScopeSettleDeadline(expectsScope && deckScope == null)
    scopeStatus    = expectsScope && deckScope == null && !windowElapsed ? 'provisional' : 'settled'
    safeScope      = scope !== undefined && isThreadSegmentSafe(scope) ? scope : undefined

Rules that fall out, all of them load-bearing:
- **Provider-less doors settle immediately.** `record-host`, `artifact-host`, `registry-host` declare
  `required_providers: []` / `optional_providers: []` (`config/chat/chat-hosts.yaml:147-153,161-167,175-181`)
  → `declaresDeck` false → `scopeStatus` is `'settled'` on the FIRST render and the new deadline hook is
  never armed. Zero added latency.
- **A published-but-scope-less slice is still provisional** for a door that declares deck. This is the
  routed-deck case (`DeckChatSlice` publishes before `state.eventGraphId` resolves). Predicating on
  `deckSlice == null` alone does NOT fix the defect.
- **An unsafe segment stays settled-absent**, never provisional: the dots-only refusal
  (`RegistryHostPage.surfaceChat.test.tsx`) is a decided fact, not a pending one.
- **`scopePending` (new, optional prop on `SurfaceChatBridgeProps`)** lets a door narrow the window without
  touching the collector: `ProjectWorkspacePage.tsx:132` passes
  `scopePending={!ws.ready || eventGraphId != null || (activeTab?.kind === 'deck' && activeTab.eventGraphId != null)}`
  (`eventGraphId` is the route param read at `:61`; `ws.ready`/`ws.state` at `:106-107`). Why: this door's
  deck provider is OPTIONAL (`chat-hosts.yaml:125-131`), it renders on every project tab, and a fresh deck
  canvas legitimately has no id until first Accept (`ProjectWorkspacePage.tsx:262-272`, `bindDeckTab`) —
  without the hint the page would hold hydration for the full deadline on every non-deck tab and every
  fresh canvas. With it: pending only while a deck record is named and not yet loaded.
- **Bounded release path**: a door that declares deck and whose slice never carries a scope (misconfig, a
  run deck with no persisted graph, a load error) settles when the window elapses — `scopeStatus` flips to
  `'settled'` with whatever the collector says (`studyId`, or absent → `"_"`). No hang, no throw added; the
  existing loud-fail (`SurfaceChatBridge.tsx:274-281`) is untouched and keeps its own 5 s timer.

New hook (in `SurfaceChatBridge.tsx`, next to `useDoorRequiredRecheckDeadline`): a SEPARATE
`useScopeSettleDeadline(active: boolean): boolean` reusing `DOOR_REQUIRED_RECHECK_DEADLINE_MS`
(`SurfaceChatBridge.tsx:132`, 5000). Do not fold it into `useDoorRequiredRecheckDeadline`
(`:150-158`) and do not reuse its `elapsed` state: that state drives a throw and its `required` argument is
the YAML's `required_providers` fact.

### 3b. Decision (b) — where the hold lives in `useAiChat.ts` and what it gates

    const scopeStatus  = options.scopeStatus ?? 'settled'      // default keeps every existing caller intact
    const scopeSettled = scopeStatus === 'settled'

Gate exactly these five sites (each early-returns while `!scopeSettled`):
1. **lazy-mint effect** (`:937-941`) — no `resolveTabThreadId(scope)` → no map entry, `activeThread` stays
   null → the hydration effect's existing `if (!activeThread) return` (`:952`) also holds.
2. **hydration GET** (`:943-1054`) — no `getThread` while provisional; `hydratedRef` stays false.
3. **sync POSTs** (`:1056-1114`) — no `appendThreadMessage` while provisional.
4. **`switchThread` / `newThread`** (`:906-921`) — both write the map (`writeTabThreadMapEntry` /
   `mintTabThreadEntry`); no-op while provisional.
5. **`listThreadsForChat`** (`:927-930`) — `listThreads` → `threadHeaders()` → `getThreadTabId()`, which
   MINTS on read (`threadTabIds.ts:100-109`); return `Promise.resolve([])` while provisional. Opening the
   picker must not mint under a provisional scope.

Release: when `scopeStatus` flips to `'settled'`, the lazy-mint effect runs once with the settled `scope`,
writes `cl.ai-thread-tab-ids[settledScope]` once, the hydration effect fires ONE GET for that key, and the
sync effect POSTs each unsynced message once. A turn sent during the hold keeps its messages in memory; on
release they POST to the settled thread (the `prev.length > 0` guard at `:1041` keeps them across the
empty-thread GET). LEG F's refs (`turnInFlightRef` `:863`, `persistedScopeRef` `:870`, `deferredReKeyRef`
`:877`) and the deferral branch (`:975-990`) are untouched.

C-3/C-4 consequences to pin: the map holds exactly ONE entry for the surface per settled scope (never `""`
or `studyId` alongside `EVG-…` for a routed deck); a thread is never written under a provisional/absent
scope when the door declares providers; cold mount and live session produce the same `(scope, threadId)`.

## 4. OWNED FILES (Q4 allowlist) — nothing else

IN SCOPE (edit only these):
- `app/src/shared/hooks/useAiChat.ts` (+ new test file `useAiChat.scopeSettle.test.ts`)
- `app/src/shared/shell/SurfaceChatBridge.tsx` (+ new test `SurfaceChatBridge.scopeSettle.test.tsx` or the
  deck-level one below; `SurfaceChatBridge.door.test.tsx` may gain a leg, its existing three legs stay green)
- `app/src/shared/context/SurfaceSliceStore.tsx`
- `app/src/event-editor/projects/ProjectWorkspacePage.tsx`
- `app/src/event-editor/deck/DeckChatSlice.tsx` (+ new test `DeckSurfaceChat.scopeSettle.test.tsx`)
- tests for the above.

OUT OF SCOPE — touching any of these returns the item:
`app/src/shared/api/threadTabIds.ts`, `app/src/shared/api/aiThreadClient.ts`, `server/src/ai-threads/**`,
`app/src/shared/lib/collectSurfaceContext.ts` (read-only seam: the bridge reads `collected.scope` and
`deckSlice.scope` directly — do NOT add a status field to `CollectorDeckSlice`),
`app/src/agent/**` (L2-CLARIFY-TARGET-1 owns that tree while live: `useSurfaceChat.ts` passes `...options`
through, so the new option needs no edit there; the agent-tree tests are RUN, never edited),
`config/chat/chat-hosts.yaml` (no new keys; derive from existing `required_providers`/`optional_providers`),
`app/src/event-editor/EventEditorContext.tsx`, `app/src/shared/shell/DeckHostPage.tsx`, `schema/**`.

File-overlap note: `useAiChat.ts` is shared with L2-CLARIFY-CARD-1's D2-leg re-gate. This item adds an
option and three guards; it must not restructure the hydration/sync effects. No `app/src/agent/**` file is
required, so the item is dispatchable as one unit the moment a fleet slot frees.

## 5. RED-FIRST PINS (non-vacuity graded; all must fail on pre-fix code where marked RED)

Harness pattern: copy the fake header-keyed fetch router from `DeckSurfaceChat.threadScope.test.tsx:80-130`
and `useAiChat.threadScoped.test.ts:46-90` (real `aiThreadClient`, real mint, `aiClient` mocked). Pre-fix
"RED" = the assertions fail on trunk `fc4acd17` (vitest does not typecheck, so an unknown option is inert).

- **P1 (RED) — no IO while provisional, exactly one GET after settle.** Hook-level: `scopeStatus:
  'provisional'` → after two macrotask flushes assert `capture.length === 0` (no `/api/ai/threads/**`) and no
  `cl.ai-thread-tab-ids` entry. Rerender with `{ scope: 'EVG-x', scopeStatus: 'settled' }` → exactly ONE GET,
  header `x-cl-thread-scope: EVG-x`, exactly one map key `EVG-x`. Pre-fix: a scope-less GET fires immediately.
- **P2 (RED) — same surface derives the same key live vs cold.** Bridge-level (`host="event-editor"` +
  `DeckChatSlice`, mocked `useEventEditor` whose `eventGraphId` appears one tick after mount): the first
  thread IO carries `x-cl-thread-scope === EVG-…` and the map holds exactly ONE key. Unmount, keep
  sessionStorage, remount with the same late-scope ordering → same `(scope, threadId)`, still one key.
  Pre-fix: first GET is scope-less and the map ends with `""` + `EVG-…`. This is the D2(b) mechanism pinned.
- **P3 (RED) — bounded release, no traffic before the deadline.** Same door, editor state never publishes
  `eventGraphId`: assert zero thread IO before `vi.advanceTimersByTime(DOOR_REQUIRED_RECHECK_DEADLINE_MS)`,
  then exactly one GET (settled-absent: no scope header) and one map key `""`. Pre-fix: IO fires on the
  first flush → RED.
- **P4 (guard) — provider-less door settles immediately.** `host="record-host"` (or `registry-host`) with a
  base scope: the hydration GET fires on the first flush with ZERO timer advancement, header = the record id,
  one map key. Must pass pre- and post-fix (this is the no-latency-regression pin).
- **P5 (RED) — no thread written under a provisional/absent scope when the door declares providers.**
  Provisional deck door: fire a send and open the picker → assert zero `POST /api/ai/threads/**`, zero
  `GET /api/ai/threads/**/threads` (listThreads), zero map entries. Release → the message POSTs exactly once
  under `EVG-…`. Pre-fix: the POST and the picker's listThreads both fire with no scope → RED.
- **P6 (guard) — project door on a non-deck tab.** `host="project-deck-tab"`, `scopePending={false}`,
  base scope `STU-x`: GET on the first flush with `x-cl-thread-scope: STU-x`, one map key, no timer advance.
- **P7 (regression) — LEG F and the four named tests stay green**: `useAiChat.threadScoped.test.ts`,
  `aiThreadClient.promote.test.ts`, `DeckSurfaceChat.threadScope.test.tsx`,
  `HarnessChatPane.threadPicker.test.tsx` (all four verified green on `fc4acd17`: 4 files / 14 tests). Never
  edit these; if one fails, STOP and report — the fix, not the pin, is wrong.

## 6. VERIFICATION (paste raw output into the report)

CODER-SIDE, in this order:

1. **First targeted check** (proves the approach before any other work):
   `cd <wt>/app && npx vitest run src/event-editor/deck/DeckSurfaceChat.scopeSettle.test.tsx`
   Expected: RED on the untouched tree (P2/P3/P5 fail), then green after the bridge+hook change. Paste both
   runs. (Measured: a single file run costs ~5-21 s cold; `npx` works, node v26.7.0, node_modules are
   symlinks — **never `npm install`**.)
2. **Named pins + new pins**:
   `npx vitest run src/shared/hooks/useAiChat.scopeSettle.test.ts src/shared/hooks/useAiChat.threadScoped.test.ts src/shared/api/aiThreadClient.promote.test.ts src/event-editor/deck/DeckSurfaceChat.scopeSettle.test.tsx src/event-editor/deck/DeckSurfaceChat.threadScope.test.tsx src/agent/HarnessChatPane.threadPicker.test.tsx src/shared/shell/SurfaceChatBridge.door.test.tsx`
   Expected: `Test Files N passed (N)`, `Tests M passed (M)` — every listed file present, zero failures.
3. **Full app suite baseline + delta** (procedure, not a carried number): at STEP 0, before editing, run
   `cd <wt>/app && npx vitest run` and record the two totals verbatim in the report; run it again at the end.
   Expected: post totals = base totals + the new tests, and NO previously-passing test red. If the base tip
   already has reds, list them by file and prove they are unchanged (do not adopt them silently).
4. **Typecheck** (measured bar, NOT "clean"): `cd <wt>/app && npx tsc --noEmit`.
   Bar measured on trunk `fc4acd17` by the orchestrator 2026-11-04T06:02 EST: **rc=2, exactly 10
   `error TS` lines / 12 output lines**, all in `src/event-editor/**` / `src/ingestion/**`, **ZERO in any
   file this item touches** (`src/shared/**`, `src/event-editor/deck/DeckChatSlice.tsx`,
   `src/shared/shell/SurfaceChatBridge.tsx`, `src/event-editor/projects/ProjectWorkspacePage.tsx`,
   `useAiChat.ts`). Re-measure at YOUR merged base tip and state the numbers you measured; the bar is
   **no new error lines and zero errors in touched files** — do not expect empty output.
5. **Scope diff**: `git -c core.fileMode=false diff --name-only cl/integration-2...HEAD` → only §4 files
   (+ the new test files). Paste the list.
6. **Clean tree**: `git -c core.fileMode=false status --porcelain --untracked-files=no` → empty, AND
   `git -c core.fileMode=false status --porcelain app/src server/src` → empty (untracked files allowed only
   outside `*/src`). Note: the trunk carries 7 pre-existing untracked artifacts (`app/harness-*.mjs`,
   `app/d1-c3-*.png|json`, `server/.artifacts/shqa3-replay/…`) — do not delete them, do not let them mask a
   real change.

ORCH-SIDE (not the coder's; the coder must not attempt browser work):
- **D2-leg-only browser re-gate on the merged revision** — the gate that also unblocks L2-CLARIFY-CARD-1:
  fresh D2 conversation (new thread, answer, follow-up, COLD reload, Answered row present, card absent),
  request bodies carrying `x-cl-thread-scope: EVG-…` on the FIRST message.
- SUITE-A **D3 deck-scope leg** (deck A → B → A returns A intact).
- **CHATHOST harness sweep** (header present-or-held at first POST).
- **Trunk-journey deck probes** (`project-deck-tab` door).
- **Thread-picker legs** (picker switch persists the pointer under the settled scope).

## 7. DATA / PROVENANCE NOTE

No migration, no backfill, no rescue of `472ff3b5` or of any thread already written under `"_"`: those
threads stay where they are and every re-score runs a FRESH D2 conversation. The fix prevents new
mis-bucketed writes only. No new id class, no new local term, no new vocabulary, no schema/ontology change:
the scope value already exists (`state.eventGraphId`, amendment A-1).

## 8. DISPATCH MECHANICS (worker contract)

- Worktree: `/mnt/vast/home/brad/git/wt/L2-THREADSCOPE-FLIP-1-lane2-l2t0550`
- Branch: `cl/lane2-threadscope-flip-1`, created off `cl/integration-2` (trunk `fc4acd17`). If the trunk has
  advanced at launch, merge its tip into the branch and re-measure (§6.3) before the first RED run.
- Report (append-only): `.hermes/plans/deliverables/L2-THREADSCOPE-FLIP-1-report.<tick>.md` where `<tick>` is
  the launch tick of this run.
- Small commits, one per unit: (1) the hook option + gates + hook pin; (2) the bridge predicate + deadline
  hook + `scopePending` + bridge pin; (3) the `ProjectWorkspacePage` hint; (4) report/verification.
- End marker, exactly one line at the end of the report:
  `THREADSCOPE-FLIP1 DONE <40-char sha>` or `THREADSCOPE-FLIP1 BLOCKED <one-line reason>`.
- Anti-output-cap turn discipline: write the report incrementally (one section per commit), never buffer it
  for a single final turn; paste command tails, not full logs.
- `node_modules` are symlinks to the main checkout: never run `npm install`/`pnpm install`; if a dependency
  looks missing, report BLOCKED.

## 9. REVIEWER BAIT (pre-empt these in the code comments and the report)

1. **"Slice published" is not "scope settled", and required-only is not "declares deck".** The routed deck
   publishes a scope-less slice first (`DeckChatSlice.tsx:151`), and `project-deck-tab` declares deck as
   OPTIONAL (`chat-hosts.yaml:125-131`) — predicate on `deckSlice?.scope` for every door declaring deck in
   `required_providers ∪ optional_providers`, or the `STU-scratch → EVG` flip (trail step 40) survives.
2. **Default must be `'settled'`.** `scopeStatus` absent ⇒ settled; anything else changes every existing
   `useAiChat` caller and turns the four named tests red.
3. **The map mints on READ.** `getThreadTabId` writes (`threadTabIds.ts:100-109`); gate `listThreadsForChat`,
   `switchThread`, `newThread` too, not just the two persistence effects.
4. **`hydratedRef` has no re-render.** The GET's `.finally` sets `hydratedRef.current = true` without a
   `setState` (`:1047-1049`); for an EMPTY thread `setMessages` never runs, so a turn that settles during
   the hold may not re-trigger the sync effect. P5 must exercise "send during the hold, then release".
5. **Do not reuse the loud-fail timer.** `useDoorRequiredRecheckDeadline`'s `elapsed` state drives
   `ChatDoorMisconfiguredError`; the scope window needs its own hook/state (`SurfaceChatBridge.door.test.tsx`
   pins the throw at exactly `DOOR_REQUIRED_RECHECK_DEADLINE_MS`).
6. **No host-id branching (V-8).** Derive from `entry.required_providers` / `optional_providers` (DATA),
   never `host === 'event-editor'`.
7. **Do not add a bundle/collector field.** `CollectorDeckSlice` lives in `collectSurfaceContext.ts`
   (out of scope); read `deckSlice.scope` in the registrar instead.
8. **Optional-property discipline.** `exactOptionalPropertyTypes` is OFF (`app/tsconfig.json` has `strict`
   only), but this codebase forbids `key: undefined`: keep the conditional-spread idiom for `scope`
   (`SurfaceChatBridge.tsx:230`) and pass `scopeStatus` explicitly, never `undefined`.
9. **YAML is loaded once at import** (`config/chat/chat-hosts.yaml` → door registry). Adding a key would
   need a registry-type change outside the allowlist; there is no reload path. Do not touch the YAML.
10. **Unsafe scopes stay settled-absent** — the dots-only refusal pin must not be reclassified as provisional.
11. **Run door bound.** `run-workspace` requires deck and has no base scope; if its deck slice is
    legitimately scope-less, the hold lasts to the deadline. State the measured release time in the report;
    the orchestrator's CHATHOST sweep covers the wire behaviour.
12. **No rescue, no migration, no server change** (§7). A diff touching `server/**` is a misread.

## 10. OPEN QUESTIONS (only where the ruling does not decide; recommended default in bold)

1. **How does the bridge learn that a deck slice is EXPECTED on an optional-deck door?** The ruling's C-2
   keys on "declared providers", but `project-deck-tab` declares deck as optional and renders on every
   project tab. Recommended: the new `scopePending` prop, supplied by `ProjectWorkspacePage` as
   `!ws.ready || eventGraphId != null || (activeTab?.kind === 'deck' && activeTab.eventGraphId != null)`
   (route + loaded-record state only — no new timing input). Alternative if the orchestrator prefers zero new
   props: declare-based hold, accepting up to the deadline of blank chat on non-deck project tabs.
2. **Which deadline does the scope window use?** Recommended: reuse
   `DOOR_REQUIRED_RECHECK_DEADLINE_MS` (5000) in a separate hook — no new constant, literal reading of C-2's
   "the existing bounded deadline". Consequence to accept: a record load slower than 5 s settles absent and
   then re-keys. Alternative: a dedicated shorter constant, which needs an explicit ruling because it trades
   correctness for latency.
3. **Unsaved-deck / load-error release.** A deck that will never carry a scope (fresh canvas with no id, or a
   graph load that failed) currently releases only at the deadline. Recommended: leave it to the deadline —
   the bridge has no synchronous signal that distinguishes "still loading" from "will never load", and adding
   one means editing `EventEditorContext.tsx` (out of scope). If review wants an immediate release, that is a
   follow-up item, not a widening of this one.

END-SPEC-DRAFT
