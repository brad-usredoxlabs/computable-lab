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
