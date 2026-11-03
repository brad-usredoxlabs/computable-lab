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
