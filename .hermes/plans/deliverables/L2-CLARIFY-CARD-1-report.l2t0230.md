# L2-CLARIFY-CARD-1 — lane 2 coder report (l2t0230)

## BROWSER-GATE FIX RUN (l2t1805)

Fix run for the browser-gate defects (VERDICT: fix) measured on the MERGED
surface (:5193) in `/home/brad/.hermes/cl/receipts/L2-CLARIFY-CARD-1/2026-11-02_1530-tier1/`
(REPORT.md + shots/ + dom/ + stream-*.txt). Second merge lands on top of the
branch tip — no rebase, trunk untouched.

COMMIT: 4b0cf37c — `fix(lane2): CARD-1 browser-gate fix run — D-1/D-2/D-3/D-4
(render/dedupe/label/chrome)`, parent 7a42e4f1 (branch tip, an ancestor of
trunk cl/integration-2). Files: 5 (3 product, 1 CSS, 2 tests amended).
SERVER: NOT TOUCHED (no `server/` path in the diff).

### What I read first (defect evidence, not guesswork)
- Receipts REPORT.md (gate method + D-1..D-4 attributions), determinism-summary.json,
  dom/draw*.json, dom/draw-freshpair-01/02.json (canonical slot dumps),
  dom/stream-07.txt (first-ask done payload) vs dom/stream-10.txt (repeat-ask
  done payload with the `clarification_loop:` error), shots/01-freshpair-draw-01.png,
  shots/02-freshpair-draw-02.png, shots/02-draw-02.png, shots/c1-prompt-and-card.png
  (zoomed crops for the mint row / Create button).

### Root causes (measured)
- D-1 + D-4 (one root): `ChatLog.tsx` seeded the grouped card's `shownPrompts`
  from `message.content`. The done payload puts the FIRST request's prompt
  verbatim into `clarification` (legacy seed) on a first ask (stream-07:
  `error: None`, `clarification.prompt` = req1.prompt) and the
  `clarification_loop:` escalation into `error` on a repeat ask (stream-10) —
  and useAiChat's done arm sets `content: result.error ?? … ??
  result.clarification?.prompt ?? …`. So the bubble wording FLIPS between
  wordings for an identical slot set: the exact-equality dedupe suppressed slot
  1's prompt on first-ask and printed it on repeat-ask → 2 distinct card
  hashes per 10 draws (D-1) and the question visible in bubble AND card on
  repeat-ask (D-4).
- D-2: `request.query` can arrive as the model's mint-intent DSL
  (`{mint:{label,domain}}`). The live DOM (dom/draw-02.json) shows the input
  `value` = the JS-object-literal STRING `{mint:{label:"frobnicate",domain:
  "chemical"}}` (unquoted keys — not JSON). `mintLabelFor` passed it raw into
  the mint label + the `mintLocalTermLabel(label)` preview, with Create
  enabled.
- D-3: the mint row is `display:flex; width:100%` and ai.css had NO rule for
  `__label`/`__preview`/`__create` (verified by grep) — all children default
  to `flex:0 1 auto`, so the Create button was the one that collapsed and
  wrapped its verb ("Crea/te").

### Fixes (data/identity-driven; no prompt-text sniffing; no W12/volume change)
1. **D-1/D-4 — app/src/agent/ChatLog.tsx** (`groupedShownPrompts`): the grouped
   card (requests.length > 1) gets its dedupe seed from the request set's OWN
   identity — the FIRST request's prompt — never from `message.content`.
   Same slot set ⇒ byte-identical card regardless of bubble wording; the first
   slot's question is never re-printed by the card (the bubble's plain question
   / the loop escalation already names it — no double print). The
   single-request and legacy arms keep the `message.content` seed byte-
   unchanged (the D3 "prompt prints ONCE" pin in ChatLog.test.tsx:318 is intact
   and green).
2. **D-2 — app/src/event-editor/right-pane/ai/ClarificationPicker.tsx**
   (`mintNounFromQuery`, one seeding point): recovers the prompt's noun from a
   bare string (byte-unchanged pass-through), the structured `{mint:{label|
   name}}` object, well-formed JSON of that shape, or the JS-object-literal
   string form the wire delivered (anchored on the DSL's own `mint.label`/
   `mint.name` property names — parsing a fixed contract structure, never a
   free-text/substring test). A non-mint shape falls through to '' so
   `mintAvailable` keeps the affordance honest. The search-box seed, the mint
   label state (init + the request.id reset effect), and the bounded mount-pass
   resolver input all read the SAME `seedNoun`, so the blob reaches neither
   the label, the preview, the search seed, nor the mint call.
3. **D-3 — app/src/event-editor/right-pane/ai/ai.css**: `.message-log__
   clarification-mint__create { flex: none; white-space: nowrap }` (the verb
   never wraps) + `__label`/`__preview { flex: 1 1 auto; min-width: 0 }`
   (preview also `text-overflow: ellipsis; white-space: nowrap`) so the
   flexible siblings absorb the shrinkage.

### Tests (RED-first, proven against the pre-fix code by stashing the fix)
- `app/src/agent/ChatLog.grouped.card1.test.tsx` — new D-1/D-4 unit: two
  bubble wordings (plain first-ask question vs a different loop-escalation
  sentence) over the SAME slot set render the same visible prompts; the first
  request's prompt is absent from the card in both; the second slot's prompt
  is present in both (no over-suppression). RED on pre-fix (repeat-ask printed
  the first slot's prompt), GREEN post-fix.
- `app/src/agent/ChatClarificationCard.mint.test.tsx` — new D-2 unit driving
  the REAL picker: (a) structured `{mint:{label,domain}}` object and (b) the
  JS-object-literal string both seed the label input, the honest one-source
  preview (`mintLocalTermLabel(noun)`), the search box, and the mint CALL with
  the bare noun (never the blob); (c) control — a bare noun stays byte-
  unchanged. RED on pre-fix (object form threw `(request.query ?? '').trim is
  not a function`; string form rendered the blob), GREEN post-fix.
- `app/src/agent/ChatClarificationCard.mint.test.tsx` — new D-3 unit: CSS-
  source assertion (the `ruleOf` idiom the BGATE chrome pins use,
  ChatLog.test.tsx:288; jsdom cannot measure layout) that the Create button is
  `flex: none` + `white-space: nowrap` and the label/preview siblings carry
  `min-width: 0`. RED on pre-fix (no such rules), GREEN post-fix.

### What I ran (real output)
- `npx vitest run` (app): touched + regression-locked suites —
  ChatClarificationCard.mint.test.tsx (6), ChatLog.grouped.card1.test.tsx (6),
  ChatLog.test.tsx (25), ChatLog.answerChannel.test.tsx (2),
  ChatLog.bothfields.uifix1.test.tsx (4), ChatLog.d3chrome.uifix3.test.tsx (4),
  ClarificationPicker.test.tsx (20),
  ClarificationPicker.mintrow.uifix2.fix2.test.tsx (7),
  ClarificationPicker.lifecycle.uifix2.test.tsx (7),
  ClarificationPicker.searchReplace.uifix3.test.tsx — ALL PASS. (Run 1: 6
  agent suites = 47/47; Run 2: 4 picker suites = 36/36; final combined 5-file
  re-run after commit prep = 64/64.)
- RED proof: each new unit run against the pre-fix file (git stash push of the
  single product file, vitest -t, stash pop) — all three RED as expected.
- `npx tsc --noEmit` (app): 11 errors after, 10 fail-files at base (same base,
  via stash) — `comm -23 after base` EMPTY ⇒ zero new fail-files; every
  reported error is in a file this run never touched (tabNavPlugin,
  EventEditorContext, deck/viewer tests, Viewer*, ingestion/*) — pre-existing
  trunk debt.
- Server NOT touched ⇒ no server tsc / server suites (nothing to run).

### What I did NOT run / did NOT verify
- NOT live :5193 verification (I did not drive a browser; the orch re-gates).
  The D-3 layout fix in particular is pinned by CSS-source, not measured
  layout — the reviewer's screenshot is the evidence.
- Did NOT run the full app suite (suite-load debt is trunk-side and
  lane-specific; targeted suites + tsc parity above are the evidence).
- The reviewer's ATTRIBUTED observations are untouched by design: pre-existing
  inventory-usage/records 404s; server-side `loopAskCounts` cross-thread
  reuse (that is why the loop wording appears on draw 2 of fresh threads — it
  is the server's honest escalation riding `result.error`, which the D-1 fix
  makes the card immune to, not something I change); the mint-actionability /
  zero-interception / grouped-card legs' pass criteria are locked by the
  green suites above (W12 gate semantics, never-guess, single-open, mint
  honesty all unchanged).
- 3b / volume-required / V2 bar: NOT touched (deferred by ruling).

### Residual risk / honest limit
- The mint-intent unwrap is a client-side honesty fix at the SEED point (the
  task's designated location). The underlying nondeterminism — the model
  emitting a mint DSL object vs a quoted string for the same fact (series A's
  1-vs-2-slot flip) and the server-side loopAskCounts reuse — is attributed
  to the model/server and outside this fix run's scope; the card now renders
  deterministically for whatever identical slot set it is given.

### Next (orchestrator)
- Re-gate live on :5193 with the same 10-draw instrument (criterion 3) +
  mint-honesty leg + chrome sweep; D-1 expects 10/10 identical hashes for an
  identical request set (the freshpair-style grouped arm); D-2 expects the
  noun label + honest preview even if the model re-emits the mint DSL; D-3
  expects "Create" unclipped.

---

### CORRECTION (browser-gate fix3, advc-c3 D6) — arm-scoped determinism + like-with-like tsc comparison

This section corrects two overstatements in the fix-run-2 report above. It does
NOT rewrite the history; the original wording stands as written at that run.

1. **"the card now renders deterministically for whatever identical slot set
   it is given" (above, "Residual risk / honest limit") — TRUE for the grouped
   arm, FALSE for the single-request arm at that commit.** advc-c3 D1 proved
   (and re-probed) that the single-request arm's `shownPrompts` seed was still
   `new Set([message.content])` (ChatLog.tsx:334 at ca73c3db), so the single
   arm's card DID flip with the bubble's wording (first-ask 0 prompt
   paragraphs, repeat-ask 1 — for the identical request; the gate's series A
   is 9/10 single-request draws). The fix run above therefore closed D-1/D-4
   only for the grouped arm. This run (fix3) closes the single arm: the
   prompt-ownership invariant is now "the card owns its prompt" (seed no
   longer reads message.content in EITHER arm; the bubble suppresses its
   verbatim copy) — see the fix3 section below. The corrected claim: for
   BOTH arms, the card renders deterministically for whatever identical slot
   set it is given, and each prompt sentence is on screen exactly once.

2. **"11 errors after, 10 fail-files at base — comm EMPTY ⇒ zero new
   fail-files" (above, "Verification evidence") — CONFLATES an ERROR count
   with a FILE count.** The correct like-with-like comparison at this tip:
   `npx tsc --noEmit` (app) = 11 ERROR LINES after the fix3 run, ZERO of them
   in files this run touched (ChatLog.tsx, ChatClarificationCard.tsx,
   ClarificationPicker.tsx, the two new/updated test files); the 11 errors
   are the pre-existing trunk set (tabNavPlugin, EventEditorContext,
   deck/viewer tests, Viewer*, ingestion/*). Comparing 11 error lines to 10
   fail-files was the error; the zero-new-in-touched-files conclusion is
   unchanged and re-proven in the fix3 section below (error lines to error
   lines).

### browser-gate fix3 (advc-c3 cycle 3, D1/D2/D3/D4) — what changed

- **D1 (HIGH) + D2 (MEDIUM), ONE invariant: the card OWNS its prompts.**
  `ChatLog.tsx`: both arms now pass an EMPTY `shownPrompts` seed
  (`new Set<string>()`) — the card renders every prompt ONCE (intra-card
  dedupe for a shared prompt string), independent of the bubble's wording.
  The bubble side of the invariant: `bubbleIsOwnedPrompt` suppresses the
  bubble paragraph ONLY when a typed card is rendered (unanswered, >=1 typed
  request) AND the content verbatim equals a prompt the card owns (the live
  first-ask shape, useAiChat.ts:1543 `content = result.clarification.prompt`;
  the repeat-ask bubble is the server's `clarification_loop:` text, which
  matches no prompt and prints as-is). Result: each prompt sentence is on
  screen EXACTLY ONCE — never twice (the double-print the gate measured),
  never zero (the D2 defect), in BOTH the single-request and grouped arms,
  for BOTH wordings. `ChatClarificationCard.tsx` unchanged in behaviour
  (its local-copy dedupe now runs against the empty host seed — it owns slot 1
  no longer hides it); prop contract documented. ORCH RULING 2 authorized the
  single-arm seed derivation; nothing else in the single arm changed
  (renderTypedClarification's dedupe logic, the answered row, the one-click
  path are untouched).
  Tests: `ChatLog.grouped.card1.test.tsx` — the D-1/D-4 pin now asserts the
  card is identical across first-ask/loop wordings AND each prompt sentence
  counts to EXACTLY 1 on screen in both wordings (count assertion, not
  absence); a new single-arm pin in `ChatLog.test.tsx` asserts the card
  prints the prompt in BOTH wordings (seed-independent) and total count 1;
  the pre-existing owner pin (`renders a typed clarification request…`) now
  asserts the question exactly once with the CARD owning the <p> (its intent
  is unchanged; only the DOM owner moved from bubble to card).
- **D3 (MEDIUM): the DSL unwrap is quote/escape-aware and narrow.**
  `ClarificationPicker.tsx` `mintNounFromQuery`: (a) a quoted scalar
  (`"frobnicate"`) is no longer passed through verbatim — a leading quote
  returns ''; (b) a bracketed value is a noun ONLY if it is well-formed JSON
  of the `{mint:{label|name}}` shape — a JSON array (`["frobnicate",
  "zymosolve"]`) returns '' so `mintAvailable` keeps the affordance hidden;
  (c) the JS-object-literal form (the live wire shape, receipt
  dom/draw-02.json) is parsed by a tolerant QUOTE/ESCAPE-AWARE scanner
  (`skipQuoted`/`matchBrace`/`decodeQuoted`/`objectLiteralField`) instead of
  the pre-fix `/label\s*:\s*["']([^"']*)["']/` regex — a value is read from
  its opening quote to its matching closing quote (backslash escapes
  honored), so `O'Brien extract` unwraps WHOLE, never "O"; a `{...}` literal
  must span the whole value (trailing junk is not the DSL shape); key matches
  are standalone identifiers at depth 1 only (`mints`/`xmint`/a `mint` inside
  a value never matches). Pin: a new D3 test in
  `ChatClarificationCard.mint.test.tsx` (apostrophe leg asserts the FULL label
  in the label input AND the mint CALL argument — never "O"; array + quoted
  scalar + not-DSL legs assert the affordance is hidden and the search seed
  is empty).
- **D4 (LOW): the D-2 test's leg (b) mint-call assertion was leg (a)'s call.**
  `mintLocalTerm` is not reset between legs inside the single `it` (only
  afterEach resets it), so `mock.calls[0]` was leg (a) and the assertion
  repeated the :312 check. Both legs now assert the LAST call (leg's own
  mint) and leg (b) additionally pins `toHaveBeenCalledTimes(2)`.
  Non-vacuity beyond the RED control: a MUTANT run (fixed product with a
  4-char truncation of the string-form unwrap) fails leg (b) with
  `expected 'frob' to be 'frobnicate'` — the last-call assertion pins the
  wire-form call.
- **D5 (LOW): CLOSED BY THE ORCHESTRATOR** (spec AMENDMENT 1 names ai.css in
  scope). No code change; the three selectors stay.
- **D6 (LOW): corrected above** (this section).

### Verification evidence (fix3, real output)

- RED control (fresh /tmp copy of the app, ONLY the three pre-fix product
  files restored from ca73c3db, node_modules symlinked to the shared pnpm
  store so vitest 1.6.1 resolves — same version as the worktree run):
  `npx vitest run src/agent/ChatLog.grouped.card1.test.tsx
  src/agent/ChatClarificationCard.mint.test.tsx src/agent/ChatLog.test.tsx`
  → **5 failed / 34 passed (39)**: (1) D3 pin — `expected 'O' to be
  "O'Brien extract"` (the regex truncation, the reviewer's exact probe);
  (2)+(3) grouped card1 pins — card prints only slot 2
  (`expected [ 'Which material is the solvent?' ] to deeply equal
  [ 'Which material is the clofibrate stock?', 'Which material is the
  solvent?' ]`) — slot 1 hidden, the D2 zero-print; (4) the owner pin —
  `expected undefined to be 'Which material?'` (card has no <p>); (5) the new
  single-arm D1 pin — `expected +0 to be 1` (card's prompt <p> count 0 on
  first-ask). All five FAIL pre-fix and PASS in the worktree (GREEN).
- GREEN (worktree): same 3-file command → 3 files / all pass; full acceptance
  set (3 ChatLog files + answerChannel + bothfields + d3chrome + the four
  ClarificationPicker suites) → **10 files / 85 tests, all pass**.
- `npx tsc --noEmit` (app): **11 error lines, ZERO in the six touched files**
  (the pre-existing trunk set: tabNavPlugin, EventEditorContext, deck/viewer
  tests, Viewer*, ingestion/*).
- `git diff --name-only`: six app/ paths only — NO server/, NO schema/, NO
  records/.
- NOT live :5193 (orch owns that; the reviewer's screenshot remains the
  D-3-chrome evidence). The D3-chrome CSS pin is a source assertion, not a
  measurement.

### browser-gate fix run 3 (advc-c4 cycle 4, D1/D3/D4) — what changed

Scope: ONLY the bounded defect list from the cycle-4 adversarial review
(`L2-CLARIFY-CARD-1-advc-c4-l2t2110.md`): D1 (HIGH, product code), D3 (LOW,
tests only), D4 (LOW, this report's prose). D2 of that review is CLOSED by
ORCH AMENDMENT 2 (l2t2110) and is not re-litigated here: the empty seed +
bubble-owner shape stands, `ChatLog.test.tsx` is in scope (AMENDMENT 2 §2),
and the suppression authorization is conditional on the D1 predicate below
(AMENDMENT 2 §3). No `server/`, `schema/`, `records/`, or
`app/src/event-editor/**` change; no picker ranking change; the deferred 3b
volume gate's own semantics are untouched.

- **D1 (HIGH): the bubble-suppression predicate follows what the card
  ACTUALLY RENDERS, not the request count.**
  `ChatLog.tsx`: the new module-private function
  `requestRendersPrompt(request)` = `(request.options ?? []).length > 0
  || requestHasPicker(request)` is THE ONE predicate for "a typed request
  renders a prompt". It is the render decision both arms read:
  (a) `renderTypedClarification`'s guard is now `!requestRendersPrompt(r)`
      (same rule as before, now one shared copy — no second options/picker
      check);
  (b) `bubbleIsOwnedPrompt` suppresses the bubble paragraph only when the
      content verbatim matches a prompt the card actually PRINTS — for the
      single arm (`renderTypedClarification` map) that is exactly
      `requestRendersPrompt(r)`, so a request the card renders NOTHING for
      keeps BASE behaviour: the bubble `<p>` prints the question once;
      for the grouped arm (`ChatClarificationCard`, 2+ requests + batch
      submit) the card prints EVERY slot's prompt unconditionally (its
      per-slot answer surface falls back to the parameter box), so the
      verbatim-owned prompt is card-printed and the bubble is suppressed
      there exactly as before (the card always owns the print, so the
      suppression can never zero it).
  Why it matters (the reviewer's measured delta): the server emits
  `menuProvider: 'choice'`, `options: []` for any fact whose argument
  declares no domain (shorthandChat.ts:883-887, 903-907; `volumeUl` is
  `kind: quantity` with no domain — the deferred 3b gate's shape). The
  count-keyed predicate suppressed the bubble for that shape while NOTHING
  rendered a prompt (the single arm's guard returns null; the grouped card
  never mounts for 1 request): the question went from printed ONCE (base)
  to printed ZERO times (HEAD), and the assistant row rendered as an empty
  "Assistant" label. With the render-derived predicate the card renders
  nothing for that request, so the bubble owns the question again — and no
  new parameter-input UI is invented for it (that surface belongs to the
  item that owns the 3b gate; AMENDMENT 2 §4). No prompt-text sniffing, no
  prose regex: the rule reads the request's own options/picker shape in ONE
  place shared with the render decision.
  **NEW PIN (non-vacuous):** `ChatLog.test.tsx` — "D1 (advc-c4 fix3,
  AMENDMENT 2): the unrenderable choice/options:[] request keeps its bubble
  question" uses the EXACT emitted shape (`menuProvider: 'choice'`,
  `options: []`, `content === request.prompt`) and asserts the question
  appears EXACTLY ONCE (exact-`<p>` count AND the substring backstop), the
  assistant row is not empty, and no card div renders for the shape.
  **RED (real output, BEFORE the product fix — commit `a70b5c7c`):**
  `cd app && npx vitest run src/agent/ChatLog.test.tsx`
  → `Tests 1 failed | 26 passed (27)`; the failure:
  `expected 'Assistant' to contain 'The draft omits a required value for
  …'` — the assistant row's text is literally just "Assistant" (empty
  row, 0 prints), matching the reviewer's probe (base = 1 print, HEAD = 0
  prints, 0 card divs) exactly. After the product fix the same pin is
  GREEN (part of the 40/40 below).

- **D3 (LOW): the "exactly once on screen" counters are no longer
  exact-paragraph-equality only; the grouped bubble assertion is positive.**
  `ChatLog.grouped.card1.test.tsx`: (a) the D1/D2 owner pin now ALSO counts
  SUBSTRING occurrences over `container.textContent` (`.split(text).length
  - 1`, expected 1 for both prompts) — a prompt re-printed inside a LONGER
  paragraph scores 0 for the exact-`<p>` count but is counted here; (b) the
  D-1/D-4 wording pin now carries the same substring backstops over the
  row text AND a POSITIVE bubble-presence assertion: `bubbleExists`
  (captured via `:scope > p`, the bubble paragraph being a DIRECT CHILD of
  the row — the earlier `p:not(.chat-clarification-card__prompt)` selector
  wrongly matched the card's own title `<p>` and its absence check would
  have been a false positive) is asserted `false` on first-ask (bubble
  stripped, the card owns the print) and `true` on loop-ask (bubble is the
  server's escalation text) — replacing the vacuous `bubbleContent … ?? ''`
  `not.toBe(req1.prompt)` comparison. The existing exact-count assertions
  are KEPT (both counters agree). `ChatLog.test.tsx`: the D1 single-arm pin
  gets the same substring backstop over the row text in both wordings
  (first-ask and repeat-ask, expected 1).

- **D4 (LOW): the fix3 "EXACTLY ONCE … in BOTH arms, for BOTH wordings"
  sentence is scoped to what the pins actually cover.** The sentence in the
  fix3 section (above) covered the material/labware NOUN-card shapes — the
  renderable requests the pins exercise (`/m`/`/l` pickers, the choice
  arm with options, the `options: []` + picker shape). With D1 fixed, the
  precise statement is: for every request the card RENDERS a prompt for
  (the renderable shapes above), each prompt sentence is on screen exactly
  once in both arms and both wordings; for a request the card renders
  NOTHING for — `choice`/`options: []`/no picker, the shape the server
  emits for a non-domain argument (the deferred 3b `volumeUl` gate's
  shape) — the invariant is BASE behaviour: the bubble prints the question
  once (now pinned by the new choice/options:[] pin, the THIRD wording).
  The unrenderable shape's ANSWER surface (a parameter-input card for it)
  is the known limit and belongs to the item that owns the 3b gate
  (AMENDMENT 2 §4: out of scope here).

### Verification evidence (fix run 3, real output)

- **RED (the new D1 pin, BEFORE the product fix):**
  `cd app && npx vitest run src/agent/ChatLog.test.tsx`
  → `Tests 1 failed | 26 passed (27)` — the new pin fails with
  `expected 'Assistant' to contain 'The draft omits a required value for
  "volumeUl" (missing-required). What volume should be used?'` (the row
  renders only the "Assistant" label: 0 prints, empty row — the reviewer's
  measured delta reproduced). Commit `a70b5c7c` (test only, RED state).
- **GREEN (after the D1+D3 fix):**
  `npx vitest run src/agent/ChatLog.test.tsx
  src/agent/ChatLog.grouped.card1.test.tsx
  src/agent/ChatClarificationCard.mint.test.tsx`
  → `Test Files 3 passed (3) / Tests 40 passed (40)` (39 pre-run + the new
  D1 pin).
- **Seven regression-locked suites:** answerChannel (2), bothfields.uifix1
  (4), d3chrome.uifix3 (4), ClarificationPicker.test (20),
  mintrow.uifix2.fix2 (7), lifecycle.uifix2 (7), searchReplace.uifix3 (2)
  → `Test Files 7 passed (7) / Tests 46 passed (46)` — the same counts the
  cycle-4 review measured.
- `npx tsc --noEmit` (app): **11 error lines / 10 files — ZERO in any
  touched file** (the pre-existing trunk set: tabNavPlugin, EventEditor
  Context, deck/viewer tests, Viewer*, ingestion/*; baseline 11, parity
  holds).
- `git diff --name-only 85858153..HEAD`: only
  `app/src/agent/ChatLog.tsx`, `app/src/agent/ChatLog.test.tsx`,
  `app/src/agent/ChatLog.grouped.card1.test.tsx` + this report — NO
  `server/`, NO `schema/`, NO `records/`, NO `app/src/event-editor/**`.
- Worktree CLEAN at the end of this run.
- NOT live :5193 (orchestrator-owned; this run does not claim live browser
  verification).

## FIX RUN 4 (l2t0230) — IN PROGRESS (armed; dispatch after TARGET-1 merge)

STEP 0: status clean, fast-forward merge cl/integration-2 -> 31353115 (TARGET-1 in-tree). No conflicts.

### Confirmed root causes (wire + code, measured against receipt 2026-11-02_2225-tier1)

- D2 (HIGH): dual mechanism.
  1. SERVER: ask turn persisted metadata.clarification.id = unresolved-c-d0e9c7d900 (fact id on wire), but the USER answer message was posted with metadata:{} (only the mention-token in content). So the thread carries NO persisted answered-state, and the server follow-up re-derives the same fact under a NEW id (unresolved-c-c9830ef36c) -> mounts a 2nd card. deriveContextCacheKey folds eventGraphId (systemPrompt.ts:650); answer turn eventGraphId flips null->real (receipt: ask EVG-cellrox.../answer null then EVG...), so the held-intent fold key changes and takeHeldShorthandIntent returns null -> re-extract.
  2. CLIENT: useAiChat re-keys the thread on scope change (scope derives from eventGraphId, null->real); cold reload loads the post-flip thread (2 msgs: answer sentence + re-ask) and the Answered row (derived from transcript adjacency) vanishes (count 1->0).
  Pin plan: (i) unit two-turn fixture, second turn re-derives same fact -> no 2nd card, one Answered row; (ii) render rehydrate from persisted shape (fresh mount, no in-memory carry). KEY ON fact identity/requestId already on wire, not prose/regex. Zero new schema if the store already carries it.

- D3 (BLOCKING): 10 draws -> 2 hashes. delta = ONE char of case in server clarification text (query 1 mM clofibrate in DMSO / id unresolved-c-d0e9c7d900 vs 1 mM Clofibrate in DMSO / unresolved-c-c9830ef36c). Case originates in model extraction, echoed into label/prompt/fact-id. The fold 1:1 join (shorthandChat.ts ~960-1050) uses EXACT label match so case flip also defeats identity. Fix: ONE canonical label per entity, derived deterministically from the BOUND/RESOLVED noun (or declared material label); Answered row + record label follow the same canonical string. Never lowercase arbitrary prose.
  Pin plan: ten-draw unit at server boundary -> byte-identical clarification text; answered row/label uses same canonical string.

- D4 (MEDIUM): mint row overflows card (card box x981 w520 right1501; mint row right1651 = +150px; Create x1584 w57 right1642 = 42px beyond 1600 viewport; preview scrollW388>clientW379, renders "...in the lab (new rec..."). Card .chat-log-clarification has NO overflow containment; bubble capped 85% but intrinsic mint-row content forces overflow. Fix: CSS/layout only in the card stylesheet/component; mint row inside content box 1280-1920, Create never clipped, preview wraps/ellipsises. Pin: repo CSS/source-pin idiom (comments stripped) + rendered-DOM assert preview declares wrap/ellipsis contract.

- D5 (MEDIUM): [Local] candidate row (data-testid clarification-top3-row, badge Local) label = seed+noun concat 1 mM clofibrate1 mM Clofibrate in DMSO (dom/answer-before-answer.json legacyDetail[0].rows[2]; W7/r3-14 ${seed}${noun} shape). seed=1 mM clofibrate, noun=1 mM Clofibrate in DMSO. Picking commits a durable name built from it. Fix: one entity one label; if seed and noun denote same entity render ONE, not concat. Generic (no noun special-case). Pin: unit exact-string assert on rendered row label + minted name, RED against pre-fix builder.

### D4 — DONE (commit 6b0d9786)
- Mechanism: `.message-log__clarification-picker` (ai.css) is `display:grid` with NO column constraint => the single implicit track is max-content sized; the nowrap Create verb + seeded label force the track (and the mint row's `width:100%`) 150 px wider than the card; Create button 42 px off a 1600 px viewport.
- Fix (CSS-only, card's own stylesheet ai.css): `grid-template-columns: minmax(0, 1fr)` (min 0 lets the nowrap children shrink instead of growing the track) + `max-width: 100%`. Preview keeps the deliberate ellipsis contract; Create verb stays `flex:none`+nowrap (never clips). No horizontal overflow at any width.
- Pin: new source-pin describe in `ChatClarificationCard.mint.test.tsx` ("fix4 D4"), ruleOf idiom (jsdom cannot measure layout; live visual proof is the orchestrator's browser gate).
- RED (pre-fix): `1 failed | 8 passed (9)` — AssertionError: expected picker rule to contain `grid-template-columns: minmax(0, 1fr)`.
- GREEN (post-fix): `Test Files 1 passed (1)  Tests 9 passed (9)`.

## FIX RUN 4 (resume, l2t1310)

**Gate check:** tree clean at tip `3ae31931` (branch `cl/lane2-clarifycard-1-l2t0230`) at resume start. D4 stays done (`6b0d9786`); STEP 0 trunk merge in-tree. Nothing committed this turn (see below) — the report increment is the one clean artifact landed.

**What this turn established (new evidence, not re-derivation):**

1. **D3 canonical source is NOT the fact's own `candidates` in this flow.** The receipt (`2026-11-02_2225-tier1`) has NO clofibrate spine record and NO `candidates` array populated anywhere near the clofibrate/DMSO noun (searched all `dom/*.json` + `bodies/*.json`). The clarification text (`shorthandChat.ts:898-900` prompt, `:965` query) folds the raw model-extracted `fact.label` verbatim; `factRequestId` (`:695-705`) folds `fact.label` into the id. The spine-backed canonical case is the bound/resolved NOUN's store title — but in this flow the entity is UNBOUND (no spine hit), so there is no spine title to anchor to. The `unresolved` facts (label + reason + candidates) are model-emitted via the scientist-intent tool call (`intentCompile.ts:200-245` schema), so `candidates` is model data, not spine-canonical. **This is the genuine D3 blocker: the deterministic canonical case has no in-flow source when the entity is unbound.** A naive `toLowerCase` (the only source-free option) is EXPLICITLY FORBIDDEN by the spec ("NEVER lowercase arbitrary prose") and would corrupt legitimate mixed-case labels.

2. **D2 re-ask mechanism confirmed two-sided (wire evidence):** the answer turn's context flips `eventGraphId` null→real (receipt: ask turn `eventGraphId:null`, answer turn `eventGraphId:'EVG-cellrox…'`), so `deriveContextCacheKey` (`systemPrompt.ts:648-659`) produces a new key → `takeHeldShorthandIntent` returns null → the model RE-EXTRACTS → re-derives the same fact under a NEW id (`unresolved-c-c9830ef36c` vs `unresolved-c-d0e9c7d900`). The re-derived fact's `label` case is re-rolled by the model (D3), and `factRequestId` re-hashes it, so the fold's exact-label join (`shorthandChat.ts` fold ~1090-1216) and `dropSatisfiedFacts` (`:1378-1392`, keyed on `value !== entry.label`) can never recognize it as already answered → the server re-asks. The client posts the answer sentence with `metadata:{}` and `clarificationRequests` is NEVER persisted (`useAiChat.ts:970-999` persists only the legacy `clarification`), so the Answered row (derived from `clarificationRequests` + adjacency, `ChatLog.tsx:100-102,409-417`) does not rehydrate on a cold mount of the post-flip thread.

**The two design attempts made (both REVERTED to a clean tree — not shipped unverified):**

- **D3 (server):** added `canonicalFactLabel(fact)` (`shorthandChat.ts`, after `factRequestId`) that adopts the spine candidate's exact case when a candidate is a case-insensitive EXACT match of `fact.label`, else passes through byte-identically (never lowercases prose). Wired into the rendered `prompt` + `query` only (NOT `id`/`unresolvedFact`, so the fold join is untouched). Wrote a ten-draw pin. **REVERTED** because (a) there is NO server `node_modules`/vitest in this worktree, so the pin + the 15+ existing byte-stability pins (`shorthandChat.nounShape/uifix3/target1/readingCard` tests) could not be run to confirm no regression, and (b) the canonical source (`fact.candidates`) is NOT spine-backed in the real flow (evidence 1 above) — a pin that feeds `candidates` by hand would be a false green that does not prove the real flow renders byte-identically.
- **D2 (client, `useAiChat.ts`):** added persist + rehydrate of `clarificationRequests` via the existing open `metadata` object (no schema change; the DATA field D2 needs, keyed on the wire's `requestId`/`label`). **REVERTED** because rehydrating typed `clarificationRequests` onto `restored` messages enables the typed picker arm (`ChatLog.tsx` map:535 + `renderTypedClarification:324-383`), and the D3-chrome "restored renders NEITHER picker NOR option buttons" lock (`ChatLog.tsx:272`, `:259-272`) only guards the LEGACY block arm — so this change risks resurrecting the "8 bare search boxes" defect. Making it safe requires a `restored`-guard on the typed arm (a second ChatLog edit), and the client `src/agent` suite would need to be run to confirm no regression to the 20+ existing answered-row/prompt-once pins.

**Why I stopped at a clean tree instead of shipping (turn discipline):** this run already died once on the output-token cap. Both remaining defects (D2-server, D3) are server-side and their pins cannot be run here (no server runner); the client D2 half is blocked on a `restored`-arm guard + a client run I could not complete within budget. Shipping either unverified — or claiming GREEN without a runner — is the failure mode the binding instructions forbid. I preserved the confirmed mechanism, the exact next-action code sites, and the D3 blocker in this section instead of forcing a false green.

**Remaining next actions (owner: cl-coder; resume condition per item):**

- **D3 (BLOCKING) — needs a canonical-source ruling + server runner.** The deterministic canonical case has no in-flow source when the entity is UNBOUND (evidence 1). Two viable routes, both need the orchestrator's call:
  (a) **Spine anchor (preferred, matches the spec wording "derived from the BOUND/RESOLVED noun"):** populate the fact's `candidates` with the spine's bound/resolved-noun title (canonical case) in the resolution path (`resolveNounsPass.ts` MERGE arm ~195-245, where `engineFact.candidates` is the spine-backed set), then apply the (reverted) `canonicalFactLabel` to `prompt`+`query`. Requires confirming the spine carries the noun's canonical title for the bound entity.
  (b) **Declared-material-label anchor:** a declared-material store/label (none exists today — no `declareMaterial`/`materialDeclarations` in `server/src`); this is a DATA addition and would need the orchestrator's sign-off before it is introduced.
  Then run the ten-draw pin (`byte-identical clarification text from the same prompt`) AND the 15+ existing `shorthandChat.*` byte-stability pins in a worktree that HAS `server/node_modules` (this one does not).
- **D2-server (HIGH):** on re-extraction, drop the re-derived fact the same thread already answered. The answered `requestId`/`label` is ALREADY on the wire in `clarificationAnswers` (the answer turn) and in the thread history — not prose. The fold's exact-label join + `dropSatisfiedFacts` currently miss it because the re-derived `label` case/`id` differs (D3). Once D3 canonicalizes the label, extend the answered-label ledger (`answeredClarificationLabelsFromBatch`, `shorthandChat.ts:833-843`) to also cover facts already answered in the same thread (by `requestId`/canonical label from the persisted history), so the follow-up does not re-open the card. Pin: unit two-turn fixture, second turn re-derives the same fact → NO second card, ONE Answered row.
- **D2-client (HIGH, Pin ii):** persist + rehydrate `clarificationRequests` via `metadata` (the reverted edit) AND add a `restored`-guard on the typed arm in `ChatLog.tsx` so restored cards do NOT resurrect the picker (protects the D3-chrome lock). Then run the `src/agent` suite to confirm the answered-row rehydrates on a fresh mount (no in-memory carry) and the 20+ existing pins hold.
- **D5 (MEDIUM):** the `[Local]` top3 row label = seed+noun concat (`1 mM clofibrate` + `1 mM Clofibrate in DMSO`), built from the record title in the `materialSuggestions`/`materialCandidates` path (seed = `localMaterialIdForLabel` base, noun = the `/m` search title). Render ONE label when seed and noun denote the same entity; the minted durable name = that same label (generic, no noun special-case). Pin: exact-string assert on the rendered row label AND the minted name, RED against the pre-fix builder.

**Verification status (honest):**
- `cd app && npx vitest run src/agent` — NOT run this turn (no code change shipped to test).
- `cd app && npx tsc --noEmit` — NOT run this turn (no code change shipped).
- server pins — RUNNABLE: `server/node_modules` is present and `vitest` resolves via the pnpm workspace root (`/mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vitest@1.6.1`). My earlier "no server runner" note was WRONG — server unit pins CAN be run here; I run them now for D3.
- `git -c core.fileMode=false status --porcelain` — only this report increment is modified (code edits reverted to a clean tree before committing them).

CARD1-FIX4 BLOCKED D3 needs a canonical-case source for the UNBOUND acceptance entity (clofibrate mixture blob has no spine candidates and no declared-material label in the receipt, so BOUND/RESOLVED-noun and declared-label sources are both empty); D3 candidate-anchored canonicalizer is being implemented + verified now, and D2/D5 follow one defect per turn.

## FIX RUN 5 (l2t1455)

The FIX4 BLOCKED D3 gap ("no canonical-case source for the UNBOUND acceptance
entity") was RULED by the architect (`CARD1-D3-canonical-source-l2t1430-ruling.md`).
This run IMPLEMENTS the ruling verbatim (does not re-decide it), one unit per
commit. Worked only in this worktree; TARGET-1's files, D1, and the W12/3b
volume gate untouched.

### D3 (BLOCKING) — canonical label per ruling §2/§3 — IMPLEMENTED, 5 commits

1. **Unit 1 — `canonicalLabelKey(label)`** (`server/src/materials/termId.ts`):
   NFKC -> trim -> collapse inner whitespace -> `toLocaleLowerCase('en')`
   (TS-legal form of the ruling's `('en')`; punctuation verbatim).
   `labelHash`/`labelSlug`/`localMaterialIdForLabel` redefined off it (no
   divergence). commit `c5399da2`. 9/9 termId pins green.
2. **Unit 1 type fix**: `toLowerCase('en')` -> `toLocaleLowerCase('en')`
   (defect shipped in Unit 1; V8 ignored the extra arg at runtime, vitest
   transpiles without typecheck). ASCII labels byte-identical -> digests
   unchanged, no re-pin. commit `34c08872`.
3. **Unit 2 — IDENTITY + DROP** (`shorthandChat.ts`): `factRequestId` hashes
   `canonicalLabelKey(fact.label)` (shape stays `unresolved-c-<sha1-10hex>`);
   `dropSatisfiedFacts` compares `canonicalLabelKey(...)` (non-string arm
   keeps return-true). Digest re-pinned `unresolved-c-11c1711f72` ->
   `unresolved-c-272e97981e` (recomputed independently in node). commit
   `d9ef8df5`.
4. **Unit 3 — POLICY (data, not code)**: one `canonicalLabel:` block under the
   material domain in `schema/scientist-intent/scientist-intent-vocabulary.yaml`
   (`preMintDisplay: identity-case`, `mintedDisplay: record-title`,
   `titleAdoption: scientist-phrasing-when-key-equal`) + declared in the
   meta-schema root `properties` + a PER-CALL fail-loud loader
   (`server/src/compiler/resolution/canonicalLabelPolicy.ts`, mirrors
   nounShape/assumedValues discipline; NOT the process-cached singleton;
   absent/malformed block THROWS, never a hardcoded fallback). commit
   `e5324baf`. 5 loader pins + 58 vocabulary/scientistIntent regression green;
   drift/ripOut/identityCollapse/T7d green.
5. **Unit 4 — RENDER (read-only store seam)**: `clarificationsFromUnresolvedFacts`
   now renders the ONE label token via the canonical label — the record TITLE
   when GROUNDED (STAGE A, resolved upstream by the read-only store GET) else
   the IDENTITY FORM (STAGE B, `canonicalLabelKey`); `nounPrompt` + `query`
   ride it, the `unresolvedFact` mirror keeps the RAW label (provenance). New
   exported `canonicalLabelsForFacts(facts, store)` = the read-only seam
   (`localMaterialIdForLabel` -> `store.get` -> `payload.name`, per-call,
   tolerant of read failures, never cached). `shorthandResultFromCompile`
   stays SYNC (takes an optional precomputed `canonicalLabels` map, forwards
   to both internal call sites) so TARGET-1's sync test call sites stay
   untouched; both AgentOrchestrator call sites (fold arm ~1553, shorthand arm
   ~3083, both inside `async run`) build the STAGE A map from `deps.store` and
   pass it. Test re-pins (legitimate re-derivations, ruling §5 pin #4 — the
   10-identical-fresh-draws guarantee): nounShape P1/P1c, readingCard mintable
   prompt, uifix3 x3 (query pins), e2eStubHonesty D3 bridge (applies the
   shipped STAGE B render to the extracted app/e2e stub; the canned stub stays
   byte-unchanged — the no-app-edits line holds). commit `63afcf57` (6 files).
6. **Unit 5 — SCOPE LOCK (ruling §7)**: source-grep pin
   (`server/src/materials/termId.scopeLock.test.ts`) — zero occurrences under
   `app/` (and under `app/src/` asserted on its own), and the closed set of
   mentioners === the ruling allow-list (termId definition+derivation, the
   three named shorthandChat sites, the policy loader that documents it, the
   pinning tests, and this pin itself). Any new mentioner (esp. a new app/
   file) fails the pin. commit `d0c9be7c`.

**Verification (D3 units):**
- `cd server && npx vitest run <new/edited pins>` — all green (termId 9/9;
  policy loader 5/5; scope lock 3/3; e2eStubHonesty 7/7; nounShape/readingCard/
  uifix3 re-pins green).
- Whole `server/src/ai` suite: failure set BYTE-IDENTICAL to the pristine
  `e5324baf` baseline (29 pre-existing failures, ZERO new) — proved by
  stash-and-run diff. Pre-existing failures named: `shorthandChat.cueCascade`
  T6/T7 (`expected 2 to be 1`, proven identical at pristine `10062725`) + the
  27 other pre-existing suite-A failures.
- `npx tsc --noEmit -p server`: 0 error lines (branch baseline 0; none in
  files touched).
- TARGET-1's three server-side test files untouched (verified they pin only
  `clarifyControl`/`entityType`/`actionLocation`/fold behaviour, never raw
  `query`/noun-prompt — so STAGE B render does not break them).

### D5 (MEDIUM) — exact-string pins — IN PROGRESS
[append as the unit lands]

- **U1 / D5 — CLOSED (no new pin needed; existing pins verified non-vacuous).**
  Mint/durable-name half: `server/src/api/handlers/VocabHandlers.mint.test.ts:290-339`
  (2 `it()` pins, D5 block) — `MAT-` id keys off `canonicalLabelKey`, re-mint of a
  case-variant returns the first mint's title (titleAdoption); 11/11 GREEN at HEAD.
  Row half: the `[Local]` top-3 row renders ONE label — `candidate.label` =
  `item.title` (single string, no `${seed}${noun}` concat), built by
  `materialCandidates` (app/src/shared/taptab/slashMenu/clarifyPickerRanking.ts,
  `label: item.title`) → `materialSuggestions` (resolvers.ts `label: row.label`);
  the concat is GONE from the builder. The client renders the server's one string
  (STAGE A/B seam, `shorthandChat.ts:929,1001`) — no client seam invented.
  Non-vacuity PROVEN by mutation: temporarily reintroduced `label: item.title + noun`
  → `clarifyPickerRanking.test.ts` RED `Tests 4 failed | 7 passed (11)`; reverted →
  GREEN `Tests 11 passed (11)` (clean tree). The row/durable-name pins the ruling
  §3(iii) demands already exist and are non-vacuous — nothing added.

### U2 — D2 (HIGH) server half — DONE (commit 0f7fcc47)

- Root cause (verified from receipts + code): the answer turn's context flips
  (`runId=RUN-0vbh` -> `null`, `eventGraphId` `EVG-mvy8xmjf` -> `EVG-cellrox…`),
  so the fold conversation key (`deriveContextCacheKey`, `AgentOrchestrator.ts:1312`)
  changes, `takeHeldShorthandIntent` returns null, the model re-extracts and
  re-derives the SAME fact (post-D3 `factRequestId` is canonical-stable on the
  label), and a 2nd card re-opens (`d0e9c7d900` -> `c9830ef36c`).
- Fix (server half only; NO new schema — `ThreadMessage.metadata`/store fields not
  needed because the identity is already on the wire; NO prose, NO regex over the
  question):
  - `server/src/ai/shorthandChat.ts`: new `dropAnsweredRequestIds(clarifications,
    answeredRequestIds)` — drops a re-derived fact iff its `factRequestId` is in
    the set of requestIds this request already posted as answered in
    `clarificationAnswers[].requestId` (the identity ALREADY on the wire). Mirrors
    `dropSatisfiedFacts` (fold arm) but keyed on fact identity, not on the value.
  - `server/src/ai/AgentOrchestrator.ts`: the drop is applied ONCE at the
    re-extract finalization (the held-null/fallback path that builds `compiledSh`),
    gated on `clarificationAnswers.length > 0` so a fresh ask is byte-unchanged.
    No change to the fold arm's `dropSatisfiedFacts` call site.
- RED first (proved, not asserted): with the production fix stashed, P9a FAILS
  (the 2nd card re-opens: `expect(2).toBe(0)`); with the fix, P9a PASSes.
- Pins added (`server/src/ai/AgentOrchestrator.repeatEcho.test.ts`):
  - P9a (positive): ask turn holds under key A; answer turn flips the key
    (`runId` -> `eventGraphId`, fold null), re-extract re-derives the fact; the
    on-wire requestId (captured from the ask-turn result — no module-state read)
    suppresses the re-ask: `clarificationRequests` 0, `success` true.
  - P9b (negative, different-thread/identity): a NON-matching answered requestId
    (a fresh fact the thread never answered) still mounts the card — proves the
    drop is identity-keyed and does not over-suppress.
- Verification: `npx tsc --noEmit -p server` 0 error lines (baseline 0).
  Whole `server/src/ai` suite: 29 failed | 1168 passed (1197). The 29-failure set
  is BYTE-IDENTICAL to the pristine-baseline set (diff empty) — no new failures,
  none fixed; P9a/P9b are new passing tests. `repeatEcho` file: 1 failed (P8) |
  10 passed (11) — P8 fails at baseline `7084b0a0` too (verified by stashing all
  U2 changes: `expected 1 to be +0` at line 448), i.e. a pre-existing baseline
  failure, not introduced by U2.
- Files touched (all named): `server/src/ai/shorthandChat.ts`,
  `server/src/ai/AgentOrchestrator.ts`,
  `server/src/ai/AgentOrchestrator.repeatEcho.test.ts`. No `app/` change, no
  client seam, no store/schema change.

## FIX5 U4 — verify block (raw)

Targeted vitest for every pin touched:
- `npx vitest run src/ai/AgentOrchestrator.repeatEcho.test.ts src/api/handlers/VocabHandlers.mint.test.ts`
  -> `Test Files 1 failed | 1 passed (2)`, `Tests 1 failed | 21 passed (22)`.
  The single failure is `repeatEcho > P8 (D4 guards)` at line 448 (`expected 1 to
  be +0`) — a PRE-EXISTING baseline failure: it fails identically with ALL U2
  changes stashed (pristine `7084b0a0`), so it is in the 29-set, not introduced
  here. P9a (positive D2) + P9b (negative D2) + all 11 mint pins PASS.
- Whole `server/src/ai` suite at HEAD (after U2): `Test Files 16 failed | 115
  passed (131)`, `Tests 29 failed | 1168 passed (1197)`.
- Baseline `10062725` ai-suite MEASURED DIRECTLY (detached checkout at
  `10062725`): `Tests 29 failed | 1166 passed (1195)`. The delta to HEAD is
  EXACTLY the 2 new P9a/P9b pins (1166->1168 passed, 29 failed both).
- Whole `server/src/ai` 29-failure set vs baseline `10062725`: BYTE-IDENTICAL.
  Captured the `10062725` 29-set (detached run) and the pristine-`7084b0a0`
  29-set (all U2 changes stashed) and the HEAD 29-set; `diff` of all three
  sorted `FAIL` lists is EMPTY. No new failures, none fixed. (Note: `7084b0a0`
  already carries the D3 units c5399da2..d0c9be7c from `10062725`; the D3 ai
  changes did NOT shift the ai-suite outcome set — all three sets are identical.)
- `npx tsc --noEmit -p server` -> 0 error lines (branch baseline 0).
- Both goldens (U3 re-bless): BEFORE re-bless, BOTH asserters FAILED on the
  single treeState mismatch (`7908fa38…` manifest vs `9a71c884…` actual; no
  other treeState entry drifted); AFTER re-bless (commit 4d6e71d2),
  `goldenIntentToGraph.test.ts` + `goldenProseBlobStrip.test.ts` ->
  `Tests 9 passed (9)` (mismatch empty).
- `git -c core.fileMode=false diff --stat 10062725..HEAD` at the U3 tip
  (`4d6e71d2`): 18 files changed, 1080 insertions(+), 29 deletions(-). Spans
  fix5 units 1–5 (termId + canonicalLabelPolicy + meta-schema +
  e2e/nounShape/foldNull/readingCard/sameNounDedupe/stubHonesty +
  VocabHandlers.mint) and fix5 U1–U3 (report + repeatEcho P9a/P9b +
  AgentOrchestrator drop + shorthandChat dropAnsweredRequestIds + MANIFEST
  re-bless). At this verify-block's tip the delta adds only this report section
  (+marker line). No `app/` file changed; `app/src/agent/proposalRowFacts.ts`,
  `app/src/event-editor/lib/wellRange.ts`, and the four TARGET-1 test files
  untouched.
- `git -c core.fileMode=false status --porcelain` -> CLEAN (only the untracked
  `.hermes/plans/harness/l2-suite-a/lib/__pycache__/` dir, ignored per
  assignment).

## FIX5 coverage caveats (disclosed, not defects)
- The STAGE A/B seam's `canonicalLabels` map has no asserting test: no test in
  `server/src/ai/*.test.ts` passes a `canonicalLabelsForFacts` map to the seam
  (0 hits); `shorthandChat.test.ts` carries no D3/STAGE/canonical assertions.
  `app/src/.../ClarificationPicker.test.tsx` mocks the material resolver.
- No pre-existing D2 pin existed (`second card|2nd card|re-ask|ledger` -> 0 in
  ai tests); P9a/P9b are the first.
- P8's `expected 1 to be +0` (repeatEcho:448) is a baseline failure unrelated
  to D2 (a held-intent zero-model-call assertion); U2 does not change that path
  (the 29-set is byte-identical).
