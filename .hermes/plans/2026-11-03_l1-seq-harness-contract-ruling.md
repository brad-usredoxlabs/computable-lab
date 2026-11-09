# RULING — L1-SEQ-HARNESS-CONTRACT (l1t1700) — sequences/forced-tool action contract: who owns the target-less `open-surface`, and the answer path

Ruling by: computable-lab architect (lane 1 request, orphaned cross-lane contract question).
Date: 2026-11-03 (EST). Requesting context: lane-1 tick 297TH defect packet
`.hermes/plans/2026-11-03_crosslane-seq-harness-action-contract-defect.md`, receipts
`~/.hermes/cl/receipts/L1-SEQ-QA-PROBE-1/l1t1645/`.

## 0. What I verified myself (trunk `cl/integration-1` @ `aa6488f8`)

Every anchor in the brief was re-opened. Confirmed:

- `server/src/ai/compileWorkspaceAction.ts` step 2 is **registry membership only** ("NO TS allow-list",
  file header lines 22-23); a target-less `open-surface` to a registered surface compiles `ok:true` —
  pinned by `compileWorkspaceAction.test.ts:305` ("a registered surface id compiles open-surface with no
  target"). SERVER SAYS VALID. ✔
- `app/src/sequences/applyAgentAction.ts:79-88` returns `ok:false` with the named refusal "The workspace
  action carried no target, so nothing could be routed. Nothing was changed."; pinned by
  `applyAgentAction.test.ts:208-215`. CLIENT SAYS INVALID. ✔ Both pins are deliberate. The live model
  emits exactly this envelope (README table: 10/15 target-less or malformed; 0/6 answers; 1 question turn
  silently navigated via `target {kind:"sequence-tab", tab:"Editor"}`). ✔
- The pin: `AgentOrchestrator.ts:1181` and `:1259-1260` — `surface === 'sequences'` hardwires
  `forceDraftTool = true` and `runPreflight = false`; `:1957` pins `tool_choice` to
  `{function: agent_intent}` — no prose arm exists on `/sequences`. SEQ2FIX2 D5 (`:1632` comment) is
  deliberate. ✔
- Breadth: `/analysis` 2/2 target-less, zero `text` frames (README §Breadth). Not sequences-only. ✔

Corrections/additions to the packet the ruling depends on:

1. The note at `AgentOrchestrator.ts:3046-3047` is NOT generic narration. It is the SEQ2FIX2 D4
   sequences-specific NEUTRAL line, deliberately verb-free/target-free because a valid frame can still be
   refused client-side (D4: "the client's applied/refused line is the source of truth"). Any fix must keep
   that invariant; the lie is not the sentence's design, it is that a frame the client can *never* apply
   (target-less, same-surface) reaches it as "valid".
2. **An answer path already exists in the menu.** `submitSuggestionTool.ts:447` — the `agent_intent`
   intent enum already carries `query_workstate_history`, a query/answer intent: the SERVER compiles the
   answer and emits a `ledger_answer` frame; the client renders it (`assistStream.ts:541-549`). The menu
   doc comment (`:425`, "never a free prose answer") shows the house pattern for adding capability to a
   forced surface: **extend the intent menu, never unpin `tool_choice`.**
3. The client's stream parser already has `text_delta` (`assistStream.ts:475`) — rendering answer text is
   not a missing mechanism; producing it on forced surfaces is.
4. `surfaces.yaml` `sequences` declares `tabs: [Editor, Assay, Analysis, Setup, Import, Knowledge]` and
   `aiRole: "sequence authoring and reproducible analysis"`. The guidance block
   (`AgentOrchestrator.ts:1204-1213`) already reads `tabs` from the registry (data, not literals). No new
   YAML key is needed for the fixes below; if a per-surface "open-surface requires target" declaration is
   ever wanted, `surfaces.yaml` is its home — a TS branch is not.

## (a) Ruling — R2 + R3 are required; R1 is rejected

**R1 rejected.** Turning the client's named refusal into a cheerful no-op contradicts a deliberate,
tested decision ("a target-less action is a NAMED refusal, not a silent no-op") and, per the packet's own
analysis, only fixes messaging: every measured turn stays a dead end. It is the one remedy that makes the
server's lie survivable instead of impossible. `applyAgentAction.ts` and its refusal pin do NOT move.

**R2 required — the server owns the envelope contract.** The two layers disagree because the server
compiles as valid an action the requesting page can never apply. The exact single-valued rule, which
preserves every legitimate use of a target-less `open-surface`:

> A target-less `open-surface` whose `surface` equals the surface of the requesting turn is a compiler
> diagnostic (`MISSING_TARGET`, message naming the surface's DECLARED tabs read from the registry entry —
> data, per the existing `:1204` pattern, e.g. "You are already on sequences — name the tab (one of
> Editor, Assay, …) or a real record id"). Target-less `open-surface` to a *different* registered surface
> stays valid (cross-surface navigation is legitimate and is what `compileWorkspaceAction.test.ts:305`
> actually demonstrates with `surface:'analysis'` from a non-analysis request).

This makes the server agree with the client where they met (same surface, no target = invalid), keeps the
client's refusal as defense-in-depth for any other unrouteable frame, and stops "Action sent" being
emitted for an action nobody can apply. The `compileWorkspaceAction.test.ts:305` expectation is updated to
the same-surface case; that is amending the contradictory contract itself, not weakening a criterion. The
gap-turn behaviour of surfacing raw Ajv dumps as the user-visible answer must be replaced by the
actionable diagnostic text — never validator internals.

**R3 required — and it rides the existing menu.** R2 alone still leaves 0/6 — the north-star defect is
SILENCE, and silence remains. The remedy follows the house pattern (precedent #2 above), not unpinning
`tool_choice` (which would break the warm-prefix/real-request identical-tool-block contract,
`:1919-1921`, and SEQ2FIX2's structured-emission design for no measured gain):

> Add ONE new intent to the existing forced `agent_intent` menu (e.g. `answer`), carrying a short
> `text` field; on forced surfaces the server emits its content on the same user-visible chat channel the
> pane already renders (verify which channel `/sequences` shows — likely the notes/text path — as spec
> step 1, do not guess). The sequences guidance block (data-read from the registry, `:1204` pattern)
> gains one rule: a question — anything not naming an action verb, declared tab, or record id — uses
> `intent=answer` grounded in the injected surface context (`aiRole`, declared tabs, records). No second
> forced tool. No unpinned prose. Zero extra inference calls (friction-first: the answer is emitted in the
> SAME forced call that was already happening).

The `Editor`-navigation-on-a-question turn is then also fixed by construction: with an `answer` arm and a
routing rule, the model stops routing questions as workspace_action; and if it still emits a
declared-tab target on a question, that frame is valid and the D4 client line stays the source of truth —
unchanged behaviour, no new criterion weakened.

**File boundaries (exact split):**
- Server, R2: `server/src/ai/compileWorkspaceAction.ts` (+ `compileWorkspaceAction.test.ts`, diagnostic
  path), the sequences result-note branch `server/src/ai/AgentOrchestrator.ts:3046` untouched as to D4
  wording (it simply stops receiving unapplicable frames).
- Server, R3: `server/src/ai/submitSuggestionTool.ts` (enum + description + coercion + its tests),
  `server/src/ai/AgentOrchestrator.ts` (intent handling → visible frame; sequences guidance block).
- Client, R3 only: the sequences chat mount (`app/src/sequences/SequencesPage.tsx` /
  `app/src/event-editor/right-pane/ai/assistStream.ts` shared parser) — render the answer frame. Spec
  step 1 must confirm which channel the pane actually displays.
- Frozen: `app/src/sequences/applyAgentAction.ts` + `applyAgentAction.test.ts` (named refusal stays).

Scope note: because the `answer` intent is on the shared menu, `/analysis` and every other forced-tool
surface gain answerability for free; a follow-up live probe of `/analysis`'s rendering (UNVERIFIED per the
packet) belongs to lane 2's corpus-scout loop, not to this task's acceptance.

## (b) R3 is inside the approved scope — no Brad card

The packet deferred R3 to "Brad/architect authority"; this ruling exercises the architect half, under the
Brad-BINDING record of 2026-11-02 ("proceed WITHOUT approval cards unless ABSOLUTELY ambiguous; cards only
when the ambiguity is irreducible from repo evidence"). It is reducible:

- Brad's north star (binding, 2026-11-01/03, recorded in lane 2's header and the architect's own memory):
  the AI chat drives prominence/context/narrowing/layout over the existing machinery, and **SILENCE is the
  defect**. A chat pane that answers 0/6 direct questions is silence, full stop. "Answer the question" is
  therefore already Brad's intent; only "action-only by design" would contradict the recorded ruling, and
  nothing in either lane's approvals says that.
- Repo evidence closes it too: `query_workstate_history` is an approved answered intent on the SAME menu,
  and the universal-chat standard (one chat pane on every surface, AI-left bubbles, SOP r12) treats the
  pane as conversational everywhere — `/sequences` is the outlier, not a designed exception.
- The shape choice (menu intent vs. unpinned prose) is an engineering decision inside delegated authority,
  and the house pattern decided it (§0 add.2).

For the record, the ONE question the packet proposed, verbatim — rendered moot by the above and to be
asked ONLY if anyone proposes to make chat action-only as a product position: *"should the sequences chat
be able to answer a question, or is it action-only by design?"*

## (c) Lane assignment — LANE 2 files, owns, and moves the files

The defect's center of gravity is lane 2's machinery on both trunks:
`server/src/ai/submitSuggestionTool.ts`, `server/src/ai/AgentOrchestrator.ts`,
`server/src/ai/compileWorkspaceAction.ts`, the sequences guidance, the chat parser — the harness lineage
(`HARNESS-SEQ-1/2`, `L2-CHAT-UI-1`, `CHATHOST-*`) and the north star (Corpus2 on `:5193`) are all lane 2.
Lane 2's trunk already leads (`cl/integration-2` @ `d79fc2f4` carries +467 lines of `AgentOrchestrator.ts`
not on lane 1's); fixing on lane 1 would guarantee a merge war in the very file lane 2 runs on.

- **LANE 2** files ONE task in `~/.hermes/cl/lanes/2/task-list.md` (suggested id `SEQ-ANSWER-CONTRACT-1`)
  covering R2+R3 as one unit — they share the acceptance round trip and cannot be verified separately.
  Files it will move on `cl/integration-2`: `server/src/ai/compileWorkspaceAction.ts`(+test),
  `server/src/ai/submitSuggestionTool.ts`(+tests), `server/src/ai/AgentOrchestrator.ts`(+affected
  orchestrator tests), `app/src/sequences/SequencesPage.tsx` and/or
  `app/src/event-editor/right-pane/ai/assistStream.ts` (+ any chat-rendering test). Gate per
  ROUND-TRIP-GATE-1: live stream, zero interception of `/api/ai/**`, request-body artifact +
  rendered-answer screenshot on `:5193`.
- **LANE 1** files NO task, touches no code (the 297TH packet's "no lane-1 code touched" stance holds).
  Lane 1's orchestrator: record this ruling in its next handoff, cite the lane-2 task id once filed, and
  re-run the `l1t1645` probe suite against `:3092` after the lane-2 fix propagates through trunk sync as
  an independent confirmation (the receipts are the gate input; this lane does not re-grade them itself).
- This ruling is the sole cross-lane authority on the contract; neither lane's orchestrator re-litigates
  R1/R2/R3 in code. Neither lane duplicates: one task, in lane 2, full stop.

## (d) Acceptance criterion (one sentence, browser-gradeable)

In a live, zero-interception round trip on the fixed stack's `/sequences` chat (real model, request body
captured as receipt), asking "In one short sentence, say what this sequences workspace is for." renders a
user-visible AI answer naming what the workspace is for, and "Switch to the Assay tab." (real records
context) visibly lands the Assay tab — and on ANY of these turns the pane never shows
"Action sent — see the workspace.", a target-less-action refusal, or raw validator text with nothing else
on screen: a question gets a user-visible answer, a navigation gets a real navigation or an honest,
actionable, user-language refusal — never silence dressed as success.

END-RULING
