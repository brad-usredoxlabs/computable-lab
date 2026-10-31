# L2-CHAT-UI-1 LEG F — in-flight-turn guard against mount-time scope-flip thread clobber

Item id: L2-CHAT-UI-1-LEGF-THREADCLOBBER
Folded under L2-CHAT-UI-1 per architect ruling (Q1: inside intent, no Brad card):
`/home/brad/.hermes/cl/lanes/2/decisions/CHATUI1-THREADCLOBBER-triage-l2t0630-ruling.md` (END-RULING, read in full before coding).
Origin: L2-CHAT-UI-1 LEG E browser gate OBS-1 (receipts
`/home/brad/.hermes/cl/receipts/L2-CHATUI1-1/20261031T0700-legE-gate/report.md` — dir is
`L2-CHAT-UI-1/20261031T0700-legE-gate/`; see c4-diag.json run + c4-diag-deck.json deck).

## Problem (verified by orch first-hand at trunk 8a456e5a)

On every scope-flipping surface (run workspace chat, deck host), a live chat turn is
destroyed ~2s after send. Mechanism (ruling, cites orch-verified):

1. Both bridges spread `scope` asynchronously: `RunSurfaceChatBridge.tsx:76` and
   `DeckSurfaceChat.tsx:172` — `...(state.eventGraphId ? { scope: state.eventGraphId } : {})`.
   Mount begins with scope `""`; the record load later flips it to the deck id.
2. The lazy-mint effect `useAiChat.ts:786-790` (deps `[endpoint, scope]`) re-resolves the
   tab thread on the flip and sets a DIFFERENT minted id (`threadTabIds.ts` mint-once is
   per (tab, scope) — correct behavior).
3. The hydration/re-key effect `useAiChat.ts:792-864` sees the changed `(scope, id)` key
   and runs the re-key reset `useAiChat.ts:807-811`: `setMessages([])` + persistedIdsRef
   clear — wiping the in-flight user bubble and streaming assistant bubble.
4. The user's POSTed question lives server-side under the OLD (scope="", id A) thread and
   can never hydrate into thread B. The GET itself is non-destructive
   (`useAiChat.ts:851` `prev.length > 0 ? prev : hydrated`); the wipe is the re-key reset.

The re-key reset is CORRECT for user-initiated switches (THREAD-SCOPED-1 bait #11: picker
switch, New thread, real deck navigation). The defect: a mount-time lazy scope resolution
is indistinguishable from a user switch, and the reset has no in-flight-turn guard.

## Invariant to pin (one sentence, binding)

Once a turn is in flight — a message is `isStreaming`, or the user message has been
minted/POSTed into a thread by send — no effect run, hydration response, OR re-key of the
`(scope, threadId)` pair may remove or replace those messages; a MOUNT-TIME lazy
resolution of a surface's thread scope (`"" -> loaded record id`, never user-initiated) is
NOT a thread switch and MUST NOT trigger the re-key wipe; user-initiated switch/New-thread
keeps the existing wipe semantics byte-for-byte.

## Owned files (HARD boundary — anything else in the diff = STOP-and-report)

- `app/src/shared/hooks/useAiChat.ts` — the guard lives in the 786-864 block. Coder's
  choice within the invariant (e.g. suppress the reset while `isStreaming`/send-minted, or
  distinguish programmatic first scope-resolution from a switch).
- ONE fix site wins. The two bridges (`app/src/run/RunSurfaceChatBridge.tsx`,
  `app/src/event-editor/deck/DeckSurfaceChat.tsx`) are permitted ONLY if gating the scope
  spread (or chat registration) until the surface's deck-scope resolves is the smaller
  shape — they already claim "derived from resolved state only"
  (DeckSurfaceChat.tsx:207-216 comment) while their scope spread does not.
- Tests only: add e.g. `app/src/shared/hooks/useAiChat.hydrationClobber.test.tsx` in the
  `useAiChat.threadScoped.test.ts` / `useAiChat.hydration.test.ts` neighborhood; playwright
  spec extending or beside `app/e2e/chatui1-leGE-surface-matrix.spec.ts`.
- NOT owned (do not touch): `HarnessChatPane.tsx` (pure consumer), `threadTabIds.ts`
  (mint-once behaved correctly), `useSurfaceChat.ts` (contains zero thread code — the
  original suspect-site attribution was WRONG, ruling §"Mechanism"), `ChatLog`, server/**.

## RED-first gate order (per references/verification-and-git-workflow.md)

1. Unit RED: mount the hook with scope `undefined`; fire a send (mock stream leaves an
   `isStreaming` assistant message + user message with a send-minted id); THEN flip the
   scope prop to `"evg-1"` with `getThread` mocked to an empty thread; assert both messages
   SURVIVE and `persistedIdsRef` is not orphaned. Must fail today (list empties).
   Red-then-green proven with the guard disabled via /tmp-backup, never `git checkout`.
   Baseline-run the hooks suite first; report before/after failing-file delta (known-fail
   set per the 10-29 handoff: surfaceContext).
2. Live RED on the lane-2 stack :5193 (the receipt's own probe as a spec): drive the run
   workspace chat composer (TipTap editor — focus + real typing), Send, poll
   `.chat-log-msg--user` / `.chat-log-msg--assistant` every ~1s for 15s; today user count
   is 0 by t=3.0s (c4-diag.json). Assert user-bubble count >= 1 CONTINUOUSLY from send
   through settle, and the settled pane still shows the user turn. Same spec on the deck
   surface. Capture console/pageerror per the verification reference.
3. Negative pin (bait #11 preserved): a user-initiated picker switch / New thread DURING
   idle STILL wipes and rehydrates — pin current behavior so the fix cannot overguard.

## Acceptance criteria (verbatim criteria for the browser gate)

- A1: run-surface chat — send a real turn; user bubble persists continuously from send
  through settle (no vanish at ~t+2s); settled pane still shows the user turn.
- A2: deck surface — same assertions (second reproduction, c4-diag-deck.json).
- A3: user-initiated thread switch / New thread while idle still wipes and rehydrates
  (existing semantics byte-preserved).
- A4: unit RED->GREEN pinned; hooks-suite failing-file delta zero NEW vs baseline; app tsc
  zero NEW vs baseline (measure at claim: trunk tip 8a456e5a, tsc baseline 10 error lines).
- Playwright gate form: `--workers=1` (item-wide ruling from LEG E advc c2).

Out of scope (do NOT widen): the deck turn's 25s streaming stall and the "draft produced
no events" wall — model/draft-emission class, already mapped
(references/ai-draft-emission-and-clarifications.md).

## Lineage to read before touching (ruling Q3)

- L2-THREAD-SCOPED-1 is THE lineage: fix run 1 commit `07e7aa70` (merged ~10-29); handoff
  `.hermes/plans/handoffs/2026-10-29_1000-lane2-threadscop-fixdone-advc2-live.md`. The
  re-key reset IS its bait #11 (`useAiChat.ts:802-811` comment); lazy mint its mint-once
  rule (`threadTabIds.ts` header, bait #7, D3 in-memory fallback); single-identity
  transport `aiThreadClient.threadHeaders` (sends `x-cl-thread-id` =
  `getThreadTabId(scope)` per call — why the send POST rode the old scope while
  rehydrate rides the new).
- STAGNANT-HEDGE: NOT related — cite only to kill the association.
- L2-CHAT-UI-1 LEG E acceptance (1d01ae78) stays DONE; this fold inherits its browser-gate
  shape + receipts convention.

## Environment

Worktree branched off trunk `cl/integration-2` tip at claim. Lane-2 stack: backend
:3093, frontend :5193. NEVER touch /mnt/vast/home/brad/git/computable-lab or
:3001/:5174. Do not restart the lane stack. Always `git -c core.fileMode=false`.
exactOptionalPropertyTypes on backend; app tests vitest, `npm run test:unit -w app` style
targeted runs from the worktree.

## Report + marker

Report at the dispatch-designated unique deliverable path, written INCREMENTALLY
(append-only, baseline section first). Final lines: `STATUS: complete` then
`L2CHATUI1-LEGF DONE <40-char tip sha>`. Commit early, commit often. STOP conditions
(owned-file boundary hit, invariant unachievable at one site): write the honest blocker
into the report and exit.
