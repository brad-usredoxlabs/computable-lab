# L2-INTENTID-REDRAFT-1 — leg B (live-path surface wiring) — coder report (l2t1415)

Branch: `cl/lane2-intentid-redraft-1` (HEAD `6cc8c3b894791a8009cd613b1291b45b69a91e3d` at leg-B start;
leg A already merged into trunk ffe13273).
Worktree: /mnt/vast/home/brad/git/wt/L2-INTENTID-REDRAFT-1-lane2
Report path (unique, append-only): this file.

## 0. SCOPE (binding brief, verbatim intent)

The leg-A ANSWER-CHANNEL-1 yaml fix repaired the DATA list
(`config/drafting/shorthand-drafting.yaml:27` `surfaces: [run-workspace, event-editor]`),
but the LIVE event-editor chat posts to the legacy
`POST /api/ai/draft-events/stream` endpoint and that endpoint NEVER reads or passes a
`surface` field — so `AgentOrchestrator.ts` falls back to `surface ?? 'default'`
(`:1288`) and `surfaceDraftsShorthand('default')` is FALSE (the yaml lists only
`run-workspace` + `event-editor`). On the LIVE path the ENTIRE shorthand answer arm is
silently dead: the deterministic clarification-answer fold, the L2-INTENTID
carry/fallback capture, the repeat-ask ledger, the event_graph->shorthand refusal, and
the no-model wall. Orch first-hand evidence 2026-11-01T14:05 EDT (receipt
/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS/20261101T185646Z): the J2 run's
outgoing /api/ai/draft-events/stream bodies contain NO surface field and the backend
log shows NO fold/folded/identity-carried line on either turn.

FIX (smallest honest wiring, no policy):
1. aiClient.ts — include `surface` in the event-editor JSON body (the multipart branch
   already appends surface — this makes JSON match multipart). Keep the
   conditional-spread byte-stability discipline for the OTHER surfaces exactly as-is.
2. AIHandlers.ts draftEventsStream — read the optional `surface` from the body (JSON and
   multipart) and pass `...(surface ? { surface } : {})` to orchestrator.run
   (conditional spread; exactOptionalPropertyTypes — absent, never undefined). Absent
   surface => byte-identical legacy behavior ('default').
3. Do NOT change deriveContextCacheKey, the fold, the carry, or any YAML. Do NOT add
   surface-name literals to the server beyond what the endpoint's type already permits.

RED FIRST (server): a handler-level test (mirror AIHandlers.deckStreamError.test.ts)
driving draftEventsStream with a body carrying surface 'event-editor' + clarificationAnswers,
asserting via an orchestrator stub/spy that run() RECEIVES surface='event-editor', and that
a body WITHOUT surface leaves run()'s args byte-identical to today. RED now (surface
dropped), GREEN after the wiring. APP: a request-shape pin proving the event-editor body
now contains surface.

Owned files this leg: `app/src/shared/api/aiClient.ts`,
`server/src/api/handlers/AIHandlers.ts`,
NEW `server/src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts`,
NEW `app/src/shared/api/aiClient.eventEditorSurface.test.ts`, plus this report.

---

## 1. DEFECT SITES (re-verified first-hand at leg-B start tip, grep evidence below)

The two defect sites and the exact idiom to mirror:

aiClient.ts:279-281 — the JSON body DELIBERATELY OMITS surface for event-editor:
```
    const body = surface === 'event-editor'
      ? { prompt, context, history, ...(enableThinking !== undefined ? { enableThinking } : {}), ...answerField }
      : { prompt, surface, context, history, ...(enableThinking !== undefined ? { enableThinking } : {}), ...answerField }
```
aiClient.ts:253-255 — the multipart branch ALREADY appends surface (the asymmetry to fix):
```
    formData.append('prompt', prompt)
    formData.append('surface', surface)
    formData.append('context', JSON.stringify(context))
```
AIHandlers.ts draftEventsStream locals (:304-311) have NO `surface` declaration, and the
`orchestrator.run(...)` call (:367-377) has NO `surface` argument:
```
        const result = await orchestrator.run({
          prompt,
          context,
          ...(history ? { history } : {}),
          ...(attachments ? { attachments } : {}),
          ...(clarificationAnswers ? { clarificationAnswers } : {}),
          ...(deterministicOnly !== undefined ? { deterministicOnly } : {}),
          ...(!deterministicOnly ? { forceDraftTool: true } : {}),
          ...(enableThinking !== undefined ? { enableThinking } : {}),
          onEvent: sendEvent,
        });
```
The endpoint's body type `DraftEventsBody` (AIHandlers.ts:22-36) declares NO `surface`
field. The sibling `assistStream` already parses surface in BOTH branches and passes it:
```
        surface = fields['surface'] ?? '';        // multipart branch (:437)
        ...
        surface = body.surface;                   // JSON branch (:455)
        ...
        const result = await orchestrator.run({
          prompt,
          context: editorContext,
          surface: surface as AiSurface,          // (:553)
```
The orchestrator fallback that turns the missing surface into a dead arm
(AgentOrchestrator.ts:1288,1296):
```
      const surfaceName = surface ?? 'default';
      ...
      const shorthandSurface = surfaceDraftsShorthand(surfaceName);
```
And the DATA that `surfaceDraftsShorthand` reads (config/drafting/shorthand-drafting.yaml:27):
```
surfaces: [run-workspace, event-editor]
```
`'default'` is NOT in that list ⇒ `shorthandSurface=false` on the live event-editor path.
This is the confirmed root cause: the DATA (yaml) was fixed but the endpoint never passes
a surface for the DATA to match against.

TYPE-CLEANNESS NOTE (verified first-hand): the orchestrator `run()` input type
`AgentRequest` already declares `surface?: import('./systemPrompt.js').AiSurface`
(server/src/ai/types.ts:181-182), so passing `...(surface ? { surface } : {})` from
draftEventsStream is type-clean with NO type change. `DraftEventsBody` must gain the
optional `surface?: AiSurface` field (the endpoint's own body type) so the JSON-branch
read is typed; `AiSurface` is already defined/exported in AIHandlers.ts (:38-46). No
No surface-name literal is added to the server beyond the existing `AiSurface` union.

---

## 2. RED FIRST (server handler test)

New file `server/src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts` (mirrors the
real-handler idiom of `AIHandlers.deckStreamError.test.ts` — drives
`createAIHandlers(orchestrator).draftEventsStream` with a spy `run`). Two tests:
(1) a body carrying `surface: 'event-editor'` + `clarificationAnswers` MUST make `run()`
receive `surface='event-editor'` + the answers; (2) a body WITHOUT surface leaves `run()`
args byte-identical to today (the `surface` key ABSENT — conditional spread, never
undefined — and the key set equals the pre-fix handler's output).

RED on base (leg-B start tip `6cc8c3b8`, full raw in
`deliverables/legb-handler-red.l2t1415.txt`). Test 1 FAILS on the surface assertion (the
handler dropped surface entirely); test 2 PASSES by design (legacy byte-identity is
already correct and is the guardrail the fix must not break):

```
 ❯ src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts  (2 tests | 1 failed) 8ms
   ❯ src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts > draftEventsStream — the event-editor surface is wired to the orchestrator (leg B) > passes surface + clarificationAnswers to run() when the body carries them
     → expected false to be true // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts > draftEventsStream — the event-editor surface is wired to the orchestrator (leg B) > passes surface + clarificationAnswers to run() when the body carries them
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts:103:31
    101|     // THE DEFECT: on base the handler dropped `surface` entirely, so …
    102|     // the RED assertion (run() received no surface at all).
    103|     expect('surface' in args).toBe(true);
       |                               ^
    104|     expect(args.surface).toBe('event-editor');
    105|     // The ANSWER-CHANNEL answers ride alongside the surface (the live…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  14:44:06
   Duration  4.41s (transform 1.06s, setup 0ms, collect 2.67s, tests 8ms, environment 0ms, prepare 387ms)
```
CODER-CAPTURED: `deliverables/legb-handler-red.l2t1415.txt` (verbatim tail extracted from
the raw, not retyped — the box-drawing rules and the leading-space summary lines are
copied from the raw file).

The RED is the natural one the brief asked for: the handler dropped `surface`, so
`run()` never receives it. This is the live-path defect reproduced deterministically at
the handler seam.

---

## 2b. APP RED (request-shape pin)

New file `app/src/shared/api/aiClient.eventEditorSurface.test.ts` (mirrors the
`chatClient.test.ts` real-client + fetch-stub idiom — drives `streamAssist` with a
capturing fetch and asserts on the OUTGOING body). Three tests:
(1) event-editor + answers → legacy `/ai/draft-events/stream`, body carries
`surface:'event-editor'` + the clarificationAnswers; (2) event-editor, no answers →
surface still present, the answers key ABSENT (byte-stable); (3) a non-event-editor
surface (`run-workspace`) → body BYTE-IDENTICAL to the pre-fix shape (the
byte-stability discipline for the OTHER surfaces is preserved).

APP RED (captured against the PRE-FIX `aiClient.ts` by stashing only the aiClient fix,
keeping the untracked test; full raw in `deliverables/legb-app-red.l2t1415.txt`). Tests 1+2
FAIL on the surface assertion (`expected undefined to be 'event-editor'` — the body
carried no surface); test 3 (non-event-editor byte-identical) PASSES by design. Fix
restored via `git stash pop` after the capture.

```
 ❯ src/shared/api/aiClient.eventEditorSurface.test.ts  (3 tests | 2 failed) 10ms
   ❯ src/shared/api/aiClient.eventEditorSurface.test.ts > streamAssist — the event-editor JSON body carries its surface (leg B) > event-editor posts the legacy draft-events/stream endpoint WITH surface + clarificationAnswers
     → expected undefined to be 'event-editor' // Object.is equality
   ❯ src/shared/api/aiClient.eventEditorSurface.test.ts > streamAssist — the event-editor JSON body carries its surface (leg B) > event-editor WITHOUT answers keeps the answers key absent (byte-stable) but still carries surface
     → expected undefined to be 'event-editor' // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/shared/api/aiClient.eventEditorSurface.test.ts > streamAssist — the event-editor JSON body carries its surface (leg B) > event-editor posts the legacy draft-events/stream endpoint WITH surface + clarificationAnswers
AssertionError: expected undefined to be 'event-editor' // Object.is equality

- Expected: 
"event-editor"

+ Received: 
undefined

 ❯ src/shared/api/aiClient.eventEditorSurface.test.ts:90:26
     88|     // THE DEFECT: pre-fix this key was ABSENT for event-editor (the
     89|     // conditional-spread arm dropped it); RED on base, GREEN post-fix.
     90|     expect(body.surface).toBe('event-editor')
       |                          ^
     91|     // The ANSWER-CHANNEL answers ride the same body (conditional spre…
     92|     // present because a non-empty array was supplied).

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/shared/api/aiClient.eventEditorSurface.test.ts > streamAssist — the event-editor JSON body carries its surface (leg B) > event-editor WITHOUT answers keeps the answers key absent (byte-stable) but still carries surface
AssertionError: expected undefined to be 'event-editor' // Object.is equality

- Expected: 
"event-editor"

+ Received: 
undefined

 ❯ src/shared/api/aiClient.eventEditorSurface.test.ts:110:26
    108|     expect(calls[0]!.url).toContain('/ai/draft-events/stream')
    109|     const body = calls[0]!.body as Record<string, unknown>
    110|     expect(body.surface).toBe('event-editor')
       |                          ^
    111|     // Conditional spread discipline: absent, never undefined.
    112|     expect('clarificationAnswers' in body).toBe(false)

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Start at  14:49:30
   Duration  7.77s (transform 86ms, setup 850ms, collect 52ms, tests 10ms, environment 5.74s, prepare 409ms)
```
CODER-CAPTURED: `deliverables/legb-app-red.l2t1415.txt` (verbatim tail extracted from the
raw). This is the same defect observed from the app side: the event-editor JSON body
omitted `surface`, so the server handler could never have read one.
