# PROSE-SHORTHAND-SALVAGE — audit of "capture the text, feed it back in" and "force the tool call"

**Lane:** 2 · **Date:** 2026-11-10 · **Author:** architect (read-only audit; no product code written)
**Asked by Brad, verbatim:** *"If the model produces a shorthand that is acceptable as a command but does it as text, is there a way to capture that and feed it back in. I feel like the OLD chat window HAD that feature. I ALSO remember FORCING the LLM to make a tool call with its answer rather than allowing it to answer in prose. Can you look back through the codebase and see where this code exists and what we can do to clean it up?"*

Both features exist in this codebase. Both have been **partially dismantled by later work**, and the two dismantlings are the
same two failure buckets the chat sweep keeps measuring. This document records where the code is, what broke, and the smallest
cleanup that restores the behaviour without reintroducing hardcoded policy.

---

## 1. "Capture the text and feed it back in" — EXISTS, but it only speaks JSON

**Where:** `server/src/ai/AgentOrchestrator.ts:868` `coerceDraftArgsFromContent(content)`, called from the forced-draft arm at
`:2601`. On a hit it synthesises a tool call (`:2617`), flips `finish_reason` to `tool_calls` (`:2625`), and emits the status line
at `:2628`:

    Parsed the draft from the model's text (it did not emit a tool call); invoking agent_intent…

Supporting modules: `server/src/ai/coerceAgentIntent.ts` — `INTENT_KEYS` (`:19-41`) infers the missing `intent` discriminator from
the keys actually sent; `coerceToAgentIntentArgs` (`:85`) refuses rather than guesses when two intents' keys appear together.
`server/src/ai/draftArgDiagnostics.ts` names dropped/unknown fields and the two "produced nothing" causes.

**The break:** `coerceDraftArgsFromContent` parses only **JSON** — it calls `extractJsonObject` (`:831`), which looks for `{…}` or a
fenced block whose content `JSON.parse` accepts (`:834-852`). Since SHORTHAND-CHAT the draft is a **YAML document**
(`intentId:` + `actions[]`) carried as a string in the `shorthand` argument. A model that emits that document as text therefore
parses to `null`, the recovery is skipped, and the turn falls to the prose/retry path — which is exactly the "Draft produced no
events" wall measured in three sweeps. **The salvage feature is not missing; it is blind to the format we now ask for.**

**Why the fix is small:** the parser already exists and takes the YAML *as text* — `parseShorthandForChat(yamlText)`
(`server/src/ai/shorthandChat.ts:607`, Ajv is sole authority), consumed at `AgentOrchestrator.ts:3076`; the compiler entry is
`compileShorthandDeterministically` (`shorthandChat.ts:558`). Recovery therefore needs no new grammar:

    content → YAML candidate → parseShorthandForChat (Ajv) → { intent:'event_shorthand', shorthand: <text> } → existing arm

A candidate that fails Ajv is **refused with the validator's reason**, never silently dropped and never coerced.

## 2. "Force the tool call" — EXISTS, but two paths silently relax it to `auto`

**Where the force is set:** `AgentOrchestrator.ts:1323` and `:2214` (`forceDraftTool`), `server/src/ai/types.ts:53`
(`tool_choice?: 'auto'|'none'|'required'|{type:'function',…}`), archive note at `server/src/config/types.ts:355` describing the
original design ("tool_choice forced to compile_event_graph_draft. Predictable latency").

**Where it is released, silently:** `server/src/ai/InferenceClient.ts`

- `:112` — for a `qwen/*` model with thinking enabled, `allowAutomaticToolChoice(body)` is called unconditionally before send;
- `:151-153` — on an OpenRouter 400 whose detail mentions tool_choice + thinking, the request is retried once with the choice relaxed.

`allowAutomaticToolChoice` (`:129`) narrows `tools` to the named tool and sets `tool_choice = 'auto'`. It returns a boolean that
**nobody reads**, emits no log line, and raises no status event. So on the exact model family we run locally, the force Brad
remembers is routinely replaced by "please, if you feel like it" — and the only evidence is the downstream prose.

That is a defensible engineering compromise (Qwen refuses forced tool choice while thinking), but an unannounced one: the turn
looks like the model misbehaving rather than the platform having decided to stop insisting.

## 3. The retry that would have caught the prose is addressed to a surface nobody posts

`config/drafting/forced-tool-compliance.yaml` lists exactly two surfaces: `sequences` and `workspace.deck`.
`shorthand-drafting.yaml` documents, in its own header, that **`workspace.deck` is a surface id NO client sends** — the deck bridge
posts `event-editor`. The client's actual surface ids are `run-workspace`, `event-editor`, `analysis`, `sequences`, `knowledge`, …

Consequence: on the two live drafting surfaces, a zero-tool-call forced turn gets **no retry and no nudge** — it falls straight
through to the prose path and the honest wall. The bounded retry exists in data, fires only for `sequences`, and the entry written
for the deck never matches anything. Same defect class as the ANSWER-CHANNEL FIX already recorded in `shorthand-drafting.yaml`;
the fix landed there and was never applied to this file.

## 4. There is no user-facing "treat that text as a command" affordance

Nothing in `app/src/shared/hooks/useAiChat.ts` or `app/src/agent/ChatLog.tsx` inspects an assistant bubble for a command. The old
window's behaviour that Brad remembers is represented here **only** by the server-side recovery in §1. If we want the user to be
able to say "yes, that text — do it", it is a new, small UI affordance (a chip on a prose turn that re-posts the recovered
draft), and it should ride the same validated payload as §1 rather than a second parser.

---

## Proposed cleanup (smallest correct change, data-first)

| # | Change | Owner of the decision | Cost |
|---|--------|----------------------|------|
| C1 | Recovery accepts a **shorthand YAML document** in content: candidate extraction from fenced/bare YAML whose top level declares `intentId` + `actions`, validated by `parseShorthandForChat` before wrapping. Acceptance shapes declared in `config/drafting/` (data), not in a TS branch. Malformed ⇒ named refusal, never a silent drop. | architect spec + coder | ~half unit |
| C2 | Make the recovery visible everywhere it fires: reuse the `:2628` status line, and record `recoveredFrom: 'content-json' \| 'content-yaml'` in the result notes so a gate receipt can prove recovery happened instead of inferring it from a green turn. | coder | trivial, rides C1 |
| C3 | Fix the compliance policy's surface ids: add `run-workspace` and `event-editor` entries (one nudge each, budget 1), and annotate `workspace.deck` as the dead id it is. Pure data edit. | coder (data) | ~15 min + tests |
| C4 | Announce the tool_choice downgrade: when `allowAutomaticToolChoice` fires, log it and emit a status event naming the reason (qwen+thinking, or provider 400). No behaviour change — the compromise stays, it just stops being invisible. | coder | ~30 min |

**Deliberately NOT proposed**

- Client-side regex command parsing. A second parser over prose is the hardcoding the repo forbids, and it would disagree with Ajv.
- Compiling a recovered payload that the schema rejects. A refusal naming the field is the honest outcome.
- Forcing tool_choice by turning thinking off. That is a latency/quality trade for Brad, not a bug fix; it is only worth raising if
  C1+C3 still leave a measurable prose rate.

## Verification (what proves each one)

- C1: a fixture turn whose assistant content is a valid shorthand YAML document and carries **no** tool call yields a proposal on
  the first inference call, with `recoveredFrom: 'content-yaml'`; the identical content with a bad enum yields a named refusal and
  zero writes; JSON prose still recovers exactly as before (byte-identical status line).
- C3: a zero-tool-call forced turn on `event-editor` and on `run-workspace` each logs one retry on the second inference call and
  receives the nudge text; `sequences` behaviour is unchanged.
- C4: a qwen+thinking request that specifies a named tool logs the downgrade line and emits the status event; a request with no
  forced choice logs nothing new.

## Effect on the two live problems

- **Chat sweep flakiness (5/6, 6/6, 3/6):** C1 removes the dominant `model_no_events` bucket *when the model produced the right
  document in the wrong envelope* — which is the recoverable half of the flake. The irreducible half (model emits unrelated prose)
  remains, and the harness now names it.
- **Prompt-3 gate:** several of the journey's turns are drafting turns on `event-editor`/`run-workspace`; C3 gives them the retry
  they currently never get. C1 keeps a correct shorthand document from being thrown away.
