# L2-CLARIFY-PICKER-1 — implementation spec (RATIFIED by orch l2t2110; OQ rulings at bottom)

Goal: make the clarification material picker safe for the bench — the row a scientist means is
first and is the only thing Enter can commit, every row says what committing it binds, the top
three answers are one click, and the popover is never clipped — killing the wrong-material bug
(receipts §2: row-0 Enter committed the six-component `DMEM + FBS` composition where plain DMEM
was meant).

Evidence base: `~/.hermes/cl/receipts/CLARIFY-WEIRD-20261101/20261101_174042/report.md`
(W1-W5, W10, §2 repro; shots `r3-03-T1-picker-open.png`, `r3-06-T1-answered.png`,
`pr-301-geometry-picker-open.png`, `wrong-501..504`). Binding rulings:
`decisions/CLARIFY-WEIRD-routing-l2t1915-ruling.md` Q2-item-1 (amendments (a)/(b)), Q3
(never-guess: the comparator REORDERS choices, never AUTO-ANSWERS; no new vocabulary), Q4
sequencing. Line cites below verified first-hand at trunk tip `ebeda58c`.

## Ground truth (verified pin table)

| Fact | Pin @ ebeda58c |
|---|---|
| Hardcoded rank table (to DELETE) | `app/src/shared/taptab/slashMenu/resolvers.ts:706-712` `MATERIAL_CATEGORY_RANK: Record<MaterialSearchItem['category'], number>` — keys `saved-stock/vendor-reagent/prepared-material/biological-derived/concept-only` |
| Comparator | `resolvers.ts:753-757` sorts by that rank then `title.localeCompare`; formulations injected as `category:'saved-stock'` at `:719-730`; dedupe AFTER sort at `:758-763` + `dedupeSuggestionRows` `:850-860` |
| Composition detection (existing term) | `aggregateComponentTokens(title).length > 1` (`resolvers.ts:69-83`, `:777`) — the L2-TERM-1 UC-D4 rule; `AGGREGATE_JOINERS` `:56` is a sanctioned search-shape list, not a label heuristic |
| Picker | `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` (NOT app/src/chat/): `canMint` `:403-404` (material-only), `showMintRow` `:427-432`, single-open store `:66-112` (“resolver runs only when open” `:85-87`), `--above` class emitted `:535`, flip calc `:384` |
| Chat-host geometry override + its documented reason | `app/src/agent/ChatLog.css:153-167` (rule `:164`): upward overflow is NOT scroll-recoverable — the re-override exists for a reason; amendment (b) |
| Answered row (wiki-markup leak) | `app/src/agent/ChatLog.tsx:304-307` renders `Answered: {answerMessage?.content} — {question}`; the user-turn text comes from `app/src/shared/hooks/clarificationAnswerPrompt.ts:21-25` (`Use ${mentionToken} for ${target}.`, mentionToken first in the fallback chain → `[[material:MAT-…|DMEM]]`) |
| Registry clarification policy (DATA surface) | `schema/lab/material-profile.registry.yaml:22-51` — `clarification.layers.{material,material-spec,material-instance,aliquot,vendor-product}` with `label/field/question/requires`; header: “Wording is data too … code must not invent it” |
| Registry server reader | `server/src/materials/MaterialProfileRegistry.ts` — `MaterialClarificationPolicy` `:76-78`, `clarificationPolicy()` `:207`, `clarificationForLayer()` `:212` |
| Client plumbing today | `GET /materials/profiles` (`server/src/api/routes.ts:581` → `MaterialProfileHandlers.listProfiles` `:44-49`, returns `{version, profiles}` ONLY); app type `MaterialProfile` `app/src/shared/api/client.ts:280-287` carries NO clarification block; cached fetch `app/src/shared/material-intent/useMaterialProfiles.ts` |
| Focus default | `SlashSuggestionList.tsx:31` `useState(0)` — row 0 is always the focused default; `createPortal` already imported `:11` (DetailTooltip portals to body `:170`) |

## In scope (exact paths)

- `schema/lab/material-profile.registry.yaml` — extend the EXISTING `clarification:` block.
- `server/src/materials/MaterialProfileRegistry.ts` (+ its sibling test) — normalize + expose the new sub-block.
- `server/src/api/handlers/MaterialProfileHandlers.ts` (+test) — carry it on `listProfiles`.
- `app/src/shared/api/client.ts` — response type gains the optional policy (never synthesized).
- `app/src/shared/taptab/slashMenu/resolvers.ts` — delete `MATERIAL_CATEGORY_RANK`, new comparator + policy read.
- `app/src/shared/taptab/slashMenu/policy.ts` (NEW) — module-level cached loader for the declared ranking (resolvers are non-React; mirror the `useMaterialProfiles` cache idiom, expose `__reset` for tests).
- `app/src/shared/taptab/slashMenu/types.ts` — `SlashSuggestion` gains optional `canBeDefault?: boolean` + `consequence?: string`; `SlashResolverContext` unchanged.
- `app/src/shared/taptab/slashMenu/SlashSuggestionList.tsx` (+`.css`) — contains-section rendering, first-defaultable focus, portal-overflow popover.
- `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` — top-3 inline buttons, escape hatches, wire the consequence line.
- `app/src/agent/ChatLog.tsx` + `ChatLog.css` — answered-row sentence rendering (W5 fix); popover geometry.
- Tests: `resolvers.test.ts`, new `clarifyPickerRanking.test.ts` (comparator/focus), `ClarificationPicker.test.tsx` (+siblings), `ChatLog` answered-row test, server registry/handler tests.

## Explicitly OUT of scope

- `server/src/ai/AgentOrchestrator.ts` (its `clarificationPolicy()` read at `:4300` untouched), eventGraph projection, accept-time stamping — **L2-PROMPT1-GHOST-1 owns those; zero overlap allowed.**
- `ClarificationPanel.tsx` / `ProtocolLocalizationThread` (CARD-1), `ChangesPanel`/preview rows (TARGET-1), `/api/vocab/mint` server path, mint label generation (CARD-1's W7), volume/wells cards (TARGET-1), AiTabPanel.
- The wire format of `clarificationAnswerPrompt.ts` — the agent still receives `Use [[material:…]] for material.` verbatim (byte-stable agent contract); ONLY the human-facing rendering changes.
- No new vocabulary: existing ontology terms only — concept (material record), formulation (material-spec), instance, aliquot, vendor-product, Composition (badge, UC-D4), focused-default.

## Change 1 — P1 intent ranking; ranking policy becomes DATA (amendment (a))

Comparator ALGORITHM stays imperative TS (it decides no policy):
1. label-equality with the query noun (trim + case-insensitive) first;
2. rows whose label merely CONTAINS the noun collapse under a section whose label comes from the
   data-declared `contains_section_label` template (e.g. `contains "DMEM" (9)`);
3. within each band: declared family `rank` integer, then `title.localeCompare` (keep today's tie-break);
4. non-matching rows keep their declared-rank order BELOW the contains section.
The comparator REORDERS; it never auto-selects, auto-answers, or hides a candidate.

POLICY becomes DATA — extend the existing `clarification:` block in
`schema/lab/material-profile.registry.yaml` (a NEW parallel YAML for the same layers is a defect):

```yaml
clarification:
  layers:            # unchanged :26-51
    ...
  candidate_ranking:
    contains_section_label: 'contains "{label}" ({count})'
    families:                    # keyed by the EXISTING MaterialSearchItem category vocabulary
      saved-stock:        { rank: 0, can_be_default: true }
      vendor-reagent:     { rank: 1, can_be_default: true }
      prepared-material:  { rank: 2, can_be_default: true }
      biological-derived: { rank: 3, can_be_default: true }
      concept-only:       { rank: 4, can_be_default: true }
      composition:        { rank: 4, can_be_default: false }   # pseudo-family: aggregateComponentTokens(title).length > 1
```

Keying rationale (OQ2): the comparator's existing vocabulary is the SEARCH CATEGORY
(`MaterialSearchItem['category']`), and “composition” is a pseudo-family, not one of the five ref
layers — families keyed on category + the composition pseudo-family is the ruling's
“per-layer/aggregate family” read onto the vocabulary the code actually holds. A row in the
composition pseudo-family OVERRIDES its category family (UC-D4: a composition is a Composition
under any ontology). Initial ranks replicate today's observable ordering so the data edit alone
changes nothing except the composition/never-default rule; equality/contains bands do the
scientific reordering.

Server: extend `MaterialClarificationLayer`-adjacent normalization in
`MaterialProfileRegistry.ts` to accept `candidate_ranking` (integer `rank`, boolean
`can_be_default`, string `contains_section_label`; malformed => throw naming the path, mirroring
existing normalize errors); expose via the `listProfiles` payload as `candidateRanking`
(exactOptionalPropertyTypes: ABSENT when undeclared, never `undefined`, never synthesized).

Client read path: `policy.ts` fetches it once via the extended `listMaterialProfiles` and caches
(module-level, `__reset` test hook). `resolvers.ts` deletes the `MATERIAL_CATEGORY_RANK` Record
`:706-712` and its `?? 10` fallbacks `:754-755` — **grep-clean after this item: no rank numbers in
resolvers.ts.** Rule: **absent declaration => NO ranking at all** — rows keep resolver-emitted
order (backend relevance order); there is no fallback table, ever.

Focus-default rule (the red case): `SlashSuggestionList` focus index starts at the FIRST row with
`canBeDefault !== false` (rows built in resolvers from the data flag), default 0 when every row is
defaultable (slash editor byte-stable). A composition row can NEVER hold the focused default
REGARDLESS of rank values — enforcement is against the data flag, not label shape.

## Change 2 — P2 per-row commit-consequence line + answered-row sentence

Row third line (`consequence`, generated from the row's own record, no new chrome):
- non-composition: `binds material record {recordId} "{label}" (concept)` — kind-word keyed by
  mention kind (material-spec => `binds material-spec {id} (composition of N components)` when the
  row IS a composition; N = `aggregateComponentTokens(label).length`).
- Reuses the existing `detail` payload (`resolvers.ts:799-808` already carries id/kind/category);
  render inline so W3's hover-card unreachability stops mattering. Keep `detail` + DetailTooltip.

Answered row: `ChatLog.tsx:304-307` renders the human-facing sentence
`Answered: DMEM (material record MAT-dmem-ykg0)` — built from the clarification request + answer
metadata when present; fallback strips `[[type:id|label]]` mention tokens to `label (id)`. The
sent prompt text to the agent is UNCHANGED (wire byte-stability).

## Change 3 — P3 top-three inline buttons; pulldown + mint demoted to escape hatches

The card renders the top three RANKED candidates as inline buttons under the question (same
ranked list Change 1 produces; composition rows may appear in the three but never as the focused
default). Escape hatches: `None of these — search…` opens the existing popover (single-open store
unchanged) and the mint row keeps today's `showMintRow` preconditions (`:427-432`). Requires a
bounded, non-UI resolver pass on the seeded noun at card mount (OQ3): it fetches candidates for
the buttons only — it must NOT open any picker (single-open store untouched, popover still
open-on-request). `MATERIAL_PAGE`-bounded, AbortSignal on unmount.

## Change 4 — W3 geometry (amendment (b)): scroll-recoverable, never a `--above` re-flip

`ChatLog.css:153-167` and its comment STAY (upward overflow is not scroll-recoverable — the
reason is documented and the fix must respect it). Fix: when the picker popover is open inside
the chat host, render it via `createPortal` to `document.body` anchored at the field
(max-height = distance to viewport bottom, its OWN `overflow-y:auto` scrollbar + a visible
scroll affordance, closed on outside-mousedown/Escape as today). Rows become fully reachable; the
`--above` modifier is NOT re-enabled anywhere. With P3 the popover is an escape hatch, but when
opened it must show all 18 rows via its own scroll.

## RED-first unit test plan

1. Comparator order (`clarifyPickerRanking.test.ts`): fixture mirroring the 18-row DMEM card →
   exact-match `DMEM` concept row first; contains rows under the data-declared section label
   (`contains "DMEM" (n)` asserted as DATA — change the YAML in a fixture, the label moves);
   equality > contains > family rank; tie-break localeCompare preserved.
2. Never-default red case: fixture with `composition` family rank injected to 0 AND a
   composition label equal to the noun => `firstDefaultFocusIndex` (exported pure helper) still
   skips the composition row (enforced against `canBeDefault` data flag, not label shape).
3. Absent declaration => resolver output order byte-stable to input (no ranking), and a
   grep-clean source assertion that `MATERIAL_CATEGORY_RANK` is gone (idiom precedent:
   `receivingMintPin.test.ts:134`).
4. Server registry tests: `candidate_ranking` normalizes; malformed rank/can_be_default throws
   naming the path; `listProfiles` response ABSENT vs present (eOPT discipline).
5. Wiki-markup leak: render ChatLog answered card => `textContent` does NOT match
   `/\[\[material:/` and contains `DMEM` + `MAT-dmem-ykg0`.
6. Top-3 buttons: card with candidates renders ≤3 inline buttons + the search escape hatch;
   popover remains closed on mount (single-open invariant test extended).
7. Geometry: NOT unit-tested — accepted at the browser gate only (portal geometry is a rendering
   + viewport behaviour; jsdom has no layout).

## First targeted check (run this before building anything else)

`cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run src/shared/taptab/slashMenu/resolvers.test.ts`
against a RED comparator test on the 18-row DMEM fixture — it must fail today (row 0 =
composition `DMEM + FBS` per W1) and pass the moment the comparator lands. This single command
proves the approach early.

## Verification commands (expected outputs)

- `cd app && npx vitest run src/shared/taptab/slashMenu/resolvers.test.ts src/shared/taptab/slashMenu/clarifyPickerRanking.test.ts src/shared/taptab/slashMenu/receivingMintPin.test.ts src/event-editor/right-pane/ai/ClarificationPicker.test.tsx src/event-editor/right-pane/ai/ClarificationPicker.lifecycle.uifix2.test.tsx src/event-editor/right-pane/ai/ClarificationPicker.mintrow.uifix2.fix2.test.tsx src/event-editor/right-pane/ai/ClarificationPicker.searchReplace.uifix3.test.tsx` → all green (existing picker pins incl. single-open + mint-row must NOT regress).
- `cd server && npx vitest run src/materials src/api/handlers/MaterialProfileHandlers.test.ts` → green (add the new registry normalization cases).
- `npm run typecheck -w server` → zero new vs the branch base (trunk baseline of pre-existing errors is unchanged; server is `exactOptionalPropertyTypes: true`).
- `cd app && npm run typecheck` → sorted error-line diff IDENTICAL to base `ebeda58c` (zero new).
- `git -c core.fileMode=false grep -n "MATERIAL_CATEGORY_RANK" -- app server` → empty.
- YAML reload trap: after any registry YAML edit RESTART the lane-2 stack (`tsx --watch does NOT reload YAML`; NFS reload trap — restart, then health-check `:3093` before gating).

## Browser gate (verified-by, verbatim from the task list, ROUND-TRIP-GATE-1)

Live :5193 (cl-browser-reviewer, deck tab, real backend, ZERO interception of `/api/ai/**`):
prompt `Add 100 ul of DMEM` →
- exact-match `DMEM` concept row is FIRST + FOCUSED;
- Enter commits the concept record — captured REQUEST BODY names `MAT-dmem-ykg0`, not the composition (request-body artifact PAIRED with rendered-answer screenshot per surface);
- composition rows show the `composition of 6 components` consequence line;
- answered row shows the sentence, NOT `[[material:...]]` wiki-markup;
- top-3 inline buttons answer the card in one click; opening the popover shows all rows via its own scroll, nothing clipped (`pr-301` geometry re-measure: every row reachable);
- screenshots + captured bodies in the receipt dir. “Mounted DOM” alone is NOT accept evidence.

## Worker contract

- Worktree `wt/L2-CLARIFY-PICKER-1-lane2-l2t<tick>` off trunk `cl/integration-2` (base tip ≥ `ebeda58c`); branch `cl/lane2-clarifypicker-1-l2t<tick>`.
- Deliverable/report: `.hermes/plans/L2-CLARIFY-PICKER-1-report.wip-l2t<tick>.md` (unique per tick; orch promotes).
- One worker; serialize against GHOST-1 per the two-workers-max rule; NO hunks under `server/src/ai/`, eventGraph, or accept-time paths.
- Commit sequence: RED tests → data + server → comparator/picker → geometry+answered row → green.

## Reviewer bait (pre-empt these; the adversarial gate WILL look)

1. **eOPT sites** — `exactOptionalPropertyTypes` is SERVER-strict (server/tsconfig.json:13):
   `candidateRanking`/`consequence`/`canBeDefault` must be conditionally SPREAD (`...(x ? {x} : {})`),
   never `: undefined`. The app is not eOPT-strict — don't “fix” app optionals by widening to `| undefined`.
2. **YAML-reload trap** — green server tests against a stale backend prove nothing; restart before any live claim (task-list env fact).
3. **Ontology terms** — only concept / formulation(material-spec) / instance / aliquot / vendor-product / Composition / focused-default. A “recipe”, “mixture”, “bundle”, or a second word for mint-vs-pick is a defect (no-two-local-terms rule).
4. **Hardcode boundary** — the comparator algorithm in TS is fine; ANY rank integer, can-be-default rule, or section string surviving in TS is a hard stop (`MATERIAL_CATEGORY_RANK` deleted, grep-clean asserted). Do NOT widen `AGGREGATE_JOINERS` — it is a sanctioned search-shape list, not a ranking input.
5. **Dedupe order trap** — `materialSuggestions` dedupes AFTER the rank sort (`:746-763`, comment load-bearing: “the survivor is the first in rank order”). Reordering the sort silently changes WHICH duplicate survives; keep dedupe downstream of the new comparator and pin a survivor test.
6. **Slash-editor regression** — `SlashSuggestionList` serves the `/m` editor too. Focus must default to 0 when no row carries `canBeDefault: false`; `SlashMenuExtension`/`useMentionNavigation` behavior byte-stable for editor users; contains-section rows are non-focusable presentation (disabled rows must be skipped by arrow nav, never Enter-committable).
7. **Single-open invariant** — the top-3 fetch must not open popovers; the uifix2 stack-open defect (10→16 open listboxes) has pinned tests — extend, don't loosen.
8. **Never-guess** — no auto-answer, no auto-focus-commit, no hidden filter that removes candidates (contains rows are collapsed, not dropped); a card with zero candidates behaves exactly as today (mint/preconditions path untouched).
9. **Wire byte-stability** — the prompt text sent to the agent must stay `Use [[material:…|…]] for …`; only the rendered row changes. A diff touching `clarificationAnswerPrompt.ts` string shapes is a defect flag.

## Open questions for the orchestrator

1. **Plumbing to deliver the declaration to the client comparator.** Recommendation: extend `GET /materials/profiles` (already cached via the `useMaterialProfiles` idiom; `listProfiles` today returns only `{version, profiles}` — `MaterialProfileHandlers.ts:44-49` — and the app `MaterialProfile` type `client.ts:280-287` carries no clarification data). Alternative (new endpoint) is a parallel surface — disfavored. Checked: routes.ts:579-584, handlers, client types, useMaterialProfiles cache. This touches two server files the ruling's ownership sentence didn't name — confirm they're outside GHOST-1's diff before claim.
2. **Family keying: search-category vs ref-layer.** The ruling says “per-layer rank integers”, but the comparator's actual vocabulary is the five SEARCH categories (`MaterialSearchItem['category']`, resolvers.ts:706-712) and composition is a label-shape pseudo-family, not a ref layer. Recommendation: `candidate_ranking.families` keyed by category + `composition` pseudo-family under the existing `clarification:` block (spec'd above). A per-ref-layer table could not address formulation-vs-concept ordering, which is exactly W1. Checked: registry layers `:26-51`, comparator, `materialMentionKind` `:821-827`.
3. **P3 requires a resolver pass at card mount, today explicitly forbidden (“the resolver runs only when open”, ClarificationPicker.tsx:85-87 + uifix2 single-open comments :51-64).** Recommendation: a bounded, popover-closed, non-UI fetch for the top-3 buttons only; the single-open store and open-on-request semantics stay exactly as pinned. The alternative — server-side pre-ranked options on the clarification request — reaches into the gate/AgentOrchestrator, which this item must not touch.

DRAFT COMPLETE

## ORCHESTRATOR OQ RULINGS (l2t2110 — binding for the coder)

OQ1 APPROVED as recommended: extend GET /materials/profiles. VERIFIED first-hand by orch:
GHOST-1's diff (e6f31731...75a17dab) is entirely under app/graph/, app/types/ and
app/event-editor/lib/ — zero overlap with MaterialProfileHandlers.ts / routes.ts.
server/src/api/handlers/MaterialProfileHandlers.ts and server/src/materials/ are
PICKER-1-owned for this item.

OQ2 APPROVED as recommended: candidate_ranking.families keyed by the five search categories
plus the composition pseudo-family, inside the EXISTING clarification: block. The ruling's
"per-layer" intent is honored — it targets the comparator's actual vocabulary; a per-ref-layer
table cannot express the W1 formulation-vs-concept ordering.

OQ3 APPROVED as recommended: bounded, popover-closed, non-UI resolver pass at card mount for
the top-3 buttons only (MATERIAL_PAGE-bounded, AbortSignal on unmount, single-open store
untouched). The comment at ClarificationPicker.tsx:85-87 says the resolver runs only when
open — the spec amends THAT comment as part of the change. Server-side pre-ranked options are
rejected (reaches AgentOrchestrator, out of scope).
