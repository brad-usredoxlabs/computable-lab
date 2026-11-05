# L2-CLARIFY-TARGET-1 — UI-gate fix run 1 (lane 2, tick l2t0400)

Branch: cl/lane2-target1-1-l2t1810 · base: b7be88d4 (cl/integration-2 merged, STEP 0 fast-forward, clean)
Binding docs: spec :108-113; ruling TARGET1-UIGATE-fix1-ruling-l2t1200 (verbatim in-tree);
gate 2026-11-03_112138 (§Defects 1-3); CHATHOST-CONSOLIDATE-1 20261103T180254Z §D2 (D4).

## UI-GATE FIX 1

(appended as each defect lands)

### Baselines (measured at merged tip b7be88d4)

- tsc app: **10** `error TS` lines (trunk baseline; none in any file I touch).
- tsc server: **0** `error TS` lines (measured at the merged tip, not carried forward).
- goldens (two asserters at base tip): **9 passed / 2 files**
  (`goldenIntentToGraph.test.ts` + `goldenProseBlobStrip.test.ts`).
- D1 golden-safety note: the MANIFEST vocabulary treeState pin is `9a71c884…` at the merged
  base tip (the documented re-bless the addendum requires — not a byte-identical assumption).
  My D1 fix lives entirely in `server/src/ai/**` (AI-path demotion upstream of the compile) and
  touches NONE of the MANIFEST treeState pins nor any golden fixture, so the compiler/goldens
  stay byte-identical BY CONSTRUCTION; the D1 pin asserts the MANIFEST hashes are unchanged.

### D2 — "Use selected wells" host data prop (ruling Q2 / R2.2) — DONE

Root cause: the slot's only product mount of `WellSelectionProvider` is `PlateCanvas`'s own
subtree; the deck's real selection lives in `EventEditorContext.state.selection`, so on the live
deck the slot always saw `null` and rendered neither button nor reason line. The existing unit
pins pass only because `ChatClarification.target1.test.tsx` wraps the slot in a real provider
(test-scoped-past-the-defect).

Fix (ruling R2.2 verbatim): the HOST (`HarnessChatPane`, the card's composer) supplies the
selection as DATA. It reads the optional seam `useOptionalEventEditor()` (null-safe on a
non-deck host), maps `editor?.state.selection` at the seam to a **plain sorted `readonly
string[]`** of well addresses (the prop TYPE is the plain array — never `WellSelection`/
`WellSelectionContextValue` — so the pane's public API acquires no event-editor type), and threads
ONE optional prop `selectedWells?` through `ChatLog` -> `ClarifyWellTargetSlot` (single-request
arm) and `ChatLog` -> `ChatClarificationCard` -> `ClarifyWellTargetSlot` (grouped card). Inside
the slot the prop takes precedence when supplied; `useOptionalWellSelection()` stays the fallback
so no existing caller or test breaks. No surface-name branching in the slot, no app-wide provider
mount, no second selection state, no second expander (the host reuses what the deck already
publishes — it does not re-derive expansion logic).

Pin `app/src/agent/HarnessChatPane.selectedWells.target1.test.tsx`: renders the HOST PATH with a
REAL selection (mocking `useOptionalEventEditor` only — NOT a `WellSelectionProvider` wrapped
around the slot).
- RED (pre-fix): 3 selection-bearing cases FAILED (3 failed | 2 passed) — the pre-fix host never
  read the editor and never threaded a prop, so the slot's context fallback saw null and rendered
  no button (the non-deck-host cases correctly render no button both ways).
- GREEN (post-fix): **5 passed (5)**.
- No regression: `ChatClarification.target1.test.tsx` (14) + `ChatLog.test.tsx` (27) +
  `HarnessChatPane.test.tsx` (14) = 55 passed.

Commit: `TARGET1 fix1/D2: host supplies the deck selection to the target-well slot (ruling Q2)`.

### D3 — proposal row Discard/Restore toggle inert — DONE

Root cause (two wiring facts):
(1) RE-RENDER — `AiPanelContext.paneRelevantSignature` omitted `previewEventStates`; the pane
    (`HarnessChatPane`) is a CONSUMER that re-renders ONLY on the registration bump, so a per-row
    `setPreviewEventState` (pending<->rejected) never changed the signature, never bumped, and the
    pane kept the stale pending row.
(2) HEADER COUNT — `ChatPreviewCard` counted the header as `events.length` (total staged); a
    dropped row is still in `previewEvents`, so the header never reflected the real dropped state.

Fix: the signature serializes the per-event states deterministically (sorted by eventId) so a
state flip bumps exactly once; the header counts the ACTIVE (non-dropped) events. The toggle's
write path is the EXISTING `chat.setPreviewEventState` (the rowFact-guarded seam) — no new store,
no new event type.

Pin `app/src/agent/ChatPreviewCard.dropRestore.target1.test.tsx`: renders the FAITHFUL topology —
a stateful chat-owning host (a `useState` Map + a `setPreviewEventState` that builds a NEW Map,
exactly `useAiChat.ts:1120`) and the pane as SIBLINGS under one `AiPanelProvider` (separate
subtrees, so the pane sees the change ONLY through the registration bump — not host re-render
propagation; the rowFact pin uses a static map and covers only render-from-a-given-state).
- RED (pre-fix): after a real click on the row toggle the row stayed stale
  (`'chat-preview__event'` not dropped, header `'1 event'`).
- GREEN (post-fix): **1 passed (1)** — drop -> `Restore` + dimmed class + header `0 events`,
  restore -> back to `1 event`.
- No regression: `src/agent` 147 passed. The pre-existing failures in
  `protocol-ide`/`sequences`/`run/RunWorkspacePage.surface`/`shared/hooks` are IDENTICAL with and
  without this change (stash-verified: same file set 13 failed / 105 passed either way; the one
  `run` failure fails identically on the clean base). My change touches `src/agent` +
  `AiPanelContext`; none of those depend on it.

Commit: `TARGET1 fix1/D3: the row Discard toggle actually drops and restores the staged row`.

### D1 — demote unstated quantities (ruling Q1 / R1.1-R1.7)

**R1.1/R1.2 (the demote seam) — DONE, PRESERVED (not gated):** predecessor commit `1e9b1867`
shipped `server/src/ai/demoteUnstatedQuantities.ts` (218 ln) + `.test.ts` (7 tests) + the ONE
seam hook in `AgentOrchestrator.ts` (+55, between `parseShorthandForChat` and
`shorthandResultFromCompile`) + a 2-line `HarnessChatPane.selectedWells.target1.test.tsx`
tweak. I did NOT rewrite the preserved module; I built on it.

**R1.3(B) data hygiene + R1.3 provenance truth — DONE (this run).** The model copied the
frozen example's `volumeUl: 100` into its documents, so the declared-required sweep saw the
slot "present" and stayed silent (the chip missed 6/10). The number's ONE home is the declared
data policy, not a prompt example.

Neutralised all three model-facing example sites (no other example content changed;
`foldAnswersIntoShorthand` + its tests untouched per R1.6):
  - `server/src/ai/submitSuggestionTool.ts:645` (the frozen few-shot)
  - `server/src/ai/shorthandChat.ts:1658` (malformed-shorthand repair prompt)
  - `server/src/ai/shorthandChat.ts:1691` (empty-shorthand repair prompt)

R1.3 provenance truth (same commit): with the number gone from the examples the chip's visible
`(assumed)` provenance line could no longer cite the example (it would be a lie).
`config/drafting/shorthand-drafting.yaml:102` `source:` now names the real home
`'declared assumed-values policy (config/drafting/shorthand-drafting.yaml)'`. The user-visible
question wording at `:101` is byte-unchanged (the binding EXACT string).

Test pins updated to the new hygiene truth (RED-first):
  - `assumedQuantities.test.ts` data⇄example lint: asserts the example carries NO volume
    number (not that it equals the data) + the data value.
  - `shorthandContractDisclosure.test.ts` repair-prompt anchor: asserts the example carries NO
    volume number.
  - `shorthandChat.assumedValue.target1.test.ts`: shared `DATA.source` fixture line mirrors the
    new data home. **NOTE (R1.6 boundary, flagged for the orchestrator):** that file also carries
    the Change-3 fold pins; the fold assertions read only `DATA.value`/`DATA.unit`, never
    `DATA.source`, so the `foldAnswersIntoShorthand` seam and its coverage are byte-identical —
    only the fixture's source string (shared with the Change-2 stamp test) moves. No fold
    code or fold coverage touched.

RED (source stashed, pins kept): **3 failed | 23 passed (26)**
  - `assumedValue`: `clarifyControl.source` expected the NEW string, got the old (the stamp reads
    the real YAML via `loadAssumedQuantities()`).
  - `contractDisclosure`: repair prompt still matched `/volumeUl:\s*\d/`.
  - `assumedQuantities`: few-shot example still matched `/volumeUl:\s*\d/`.
GREEN (fixed source): **26 passed (26)** — 3 files, all green.
Full `npx vitest run src/ai` failing set is byte-identical to the merged-base baseline
(40 pre-existing, 0 new — verified by `comm` on normalised names).

Commit: `1b4768f4` (D1 R1.3(B)+R1.3).

**R1.5 — DONE, commit `8608cf5f`.** Zero-option requests render a typed-answer input.

First-hand verification (required by the task before fixing): the task pointed at
`ChatLog.tsx:286` (the legacy block arm). Measured: that arm DOES branch on
`options.length === 0` but it renders NO input (the legacy `message-log__clarification`
box with no options and no submit). Crucially the live 1/10 case does NOT flow through
`:286` at all — the done arm (`useAiChat.ts:1703`) sets BOTH `clarification` and
`clarificationRequests`, so `ChatLog.tsx:532`'s legacy arm is suppressed (it requires
`!(clarificationRequests?.length)`) and the request routes to the typed single arm
(`renderTypedClarification`, `:549`), which bailed at the `requestRendersOwnedPrompt`
guard (`:355`) → `null`. So the live zero-option request rendered NOTHING (question on
screen via the bubble, no actionable control) — the gap is real and is in the TYPED arm,
not the `:286` legacy block.

Fix (bounded, UI-side, no server change) in `app/src/agent/ChatLog.tsx`:
- Extended the SHARED `requestRendersOwnedPrompt` predicate (THE ONE render decision
  used by both the single-request guard and the bubble-suppression arm) with a third arm:
  `options.length === 0 && !hasDeclaredSlot && !requestHasPicker` → the request owns a
  prompt. `requestHasPicker` is false for `menuProvider:'choice'` (`resolverFor` returns
  null, `ClarificationPicker.tsx:47/1-43`), so the live shape now passes the guard.
  Because the predicate is shared, the bubble is suppressed — the question prints
  EXACTLY ONCE (on the card), not twice (the D2 one-print law the reviewer probed).
- Restructured `renderTypedClarification`'s answer surface into ONE else-if chain
  (slot → options → picker → typed box), mirroring the grouped card's own final fallback
  (`ChatClarificationCard.tsx:242-249`). The final arm renders `ParameterAnswerInput` —
  the SAME component the grouped card falls back to (one vocabulary for the typed
  answer). The answer rides the EXISTING `onClarificationPick` sink via
  `clarificationAnswerPrompt` (the same wire the options/picker arms use — no second
  answer path, no server change). No new component state, no surface-name branching, no
  new dependency. The legacy `:286` block arm is byte-untouched (its zero-options
  'renders nothing' lock at `ChatLog.test.tsx:103` still passes).

Pin (`app/src/agent/ChatLog.test.tsx`):
- Re-scoped the advc-c4 D1 (fix3, AMENDMENT 2) pin that previously locked the pre-R1.5
  "renders nothing" behavior for exactly this shape (its own comment called the volume
  surface "OUT of scope here"; R1.5 re-scopes it). The invariants it locked are
  preserved — question on screen exactly once (now on the card), row not empty — with the
  print owner moved bubble→card (same move as the D2 fix) and the typed input now
  asserted present + actionable (input present, submit present, input inside the card).
- New R1.5 interaction pin: typing a value + submitting rides back through the existing
  `onClarificationPick` sink with the canonical wire `Use <value> for <target>.`
  (entityType ?? kind), carrying requestId + value/label; submit disabled until a value
  is typed; field clears on submit.

jsdom note: the R1.5 pin is a DOM/behavioral pin (the input is present and the answer
rises through the sink). jsdom has no layout engine, so it does not assert geometry —
that is the D4 Playwright assertion's job.

RED-then-GREEN (stashed ONLY `app/src/agent/ChatLog.tsx`, keeping the pins):
- RED (pre-fix source): `npx vitest run src/agent/ChatLog.test.tsx` =
  **2 failed | 26 passed (28)** — both R1.5 pin tests fail exactly as designed:
  `expected null not to be null` (no card rendered for the zero-option request) and
  `Cannot read properties of null (reading 'querySelector')` (no typed input).
- GREEN (fix restored): **28 passed (28)** in `ChatLog.test.tsx`; full
  `npx vitest run src/agent` = **24 files / 148 tests all pass** (baseline was 147;
  +1 new R1.5 interaction pin). The only unhandled rejection
  (`Failed to parse URL from /api/search/jsonld`) is PRE-EXISTING environmental noise —
  it reproduces in isolation in `HarnessChatPane.clarificationEnds.regatefix2.test.tsx`
  (untouched by this run) and does not fail that test.

Commit: `8608cf5f` (D1 R1.5).

**R1.7 — DONE, commit `e7868089`.** Golden safety pin: the three MANIFEST treeState files are
unchanged by this fix (no re-bless).

Ruling R1.7 (packet item 4): NO first-turn golden bytes change, NO re-bless — PROVIDED the
demotion lives in `server/src/ai/**` and the fix touches NONE of the MANIFEST treeState pins.
The AI-path demotion lives upstream of the compile, so the compiler + goldens stay
byte-identical BY CONSTRUCTION. This commit adds the orch-owned "no re-bless required"
evidence pin — ONE new test file, NO MANIFEST edit, NO `schema/**` edit (both forbidden):

  `server/src/compiler/scientistIntent/goldens/goldenNoRebless.target1.test.ts`

It asserts, at this tip, that each of the three files equals BOTH (a) its MANIFEST treeState
pin (manifest did not move AND file did not drift) and (b) the LITERAL sha256 measured at the
merged base tip `b64e7f9a` and confirmed unchanged by this fix. A re-bless of any of the three
(a file change OR a manifest-pin move) fails the pin and forces explicit acknowledgment. It
reuses the existing `replayKernel.sha256File` / `manifestTreePath` / `loadManifest` machinery
(the same raw-bytes convention as the manifest ledger) — no parallel hasher.

Measured baseline at my merged tip (this run's own measurement, not carried from a pre-merge
tip):
- `sha256sum` of the three files == their MANIFEST treeState pins EXACTLY:
  - `schema/scientist-intent/scientist-intent-vocabulary.yaml` = `9a71c884…` (MANIFEST:96)
  - `schema/workflow/scientist-intent.schema.yaml`             = `78682999…` (MANIFEST:121)
  - `schema/registry/compile-pipelines/scientist-intent-compile.yaml` = `b91ef3b4…` (MANIFEST:133)
- `git log b64e7f9a..HEAD -- <the three paths>` is EMPTY (the fix commits touched none of them).
- Both golden asserters at my merged tip: `goldenIntentToGraph.test.ts` +
  `goldenProseBlobStrip.test.ts` = **2 files / 9 tests all pass**.

RED-then-GREEN (temporarily appended 1 byte to the vocabulary file — it is tracked and
unmodified, so `git checkout --` restores it byte-exact; `schema/**` is NOT edited by the fix):
- RED: `npx vitest run …/goldenNoRebless.target1.test.ts` = **1 failed (1)** —
  "schema/scientist-intent/scientist-intent-vocabulary.yaml drifted from its MANIFEST treeState
  pin (manifest 9a71c884… vs actual 6dad129a…)".
- GREEN: after `git checkout -- schema/...vocabulary.yaml` (sha256sum-verified back to
  9a71c884…, `git status` clean) the pin = **1 passed (1)**.

Commit: `e7868089` (D1 R1.7).

### D4 — option rows overflow the AI pane (addendum 2) — DONE, commit `74ae4805`

**Measured defect (CHATHOST-CONSOLIDATE-1 §D2, all 6 hosts, viewport 1440×900,
turn B on the event-editor/deck host):** the picker's option rows ran past the
pane's right edge and were clipped — the mint row (badge "New", label "DMEM",
preview `Create material record "DMEM" in the lab (new rec…`) + its Create
button. Receipt measurement: card right edge `1501`, the mint row ~150 px
wider than the card, the Create button ~42 px past the 1440 px viewport.

**Attribution (correction of the pre-compaction "fix4 was inert" claim):** the
gate that measured the defect served revision `c9687463`
(20261103T180254Z); `git merge-base c9687463 6b0d9786` = `31353115` = fix4's
parent — i.e. **fix4 was ABSENT from the gated build** (it reached this lane
only via the STEP 0 merge `b64e7f9a`), so the captured overflow is the
pre-fix4 state. The "fix4 was inert" claim is retracted; it was simply not
present in the gated tree.

**Mechanism (measured against the post-fix4 tree at this lane's tip):** fix4
clamped the picker's grid TRACK (`.message-log__clarification-picker`:
`grid-template-columns: minmax(0, 1fr)` + `max-width: 100%`), but the picker's
GRID ITEMS are content-box: `width: 100%` + padding + border and NO
`min-width: 0` (and there is no global `box-sizing: border-box` reset —
`app/src/index.css:12-51` has none), so each item exceeds the clamped track by
padding + border (~18 px + 2 px) under its default automatic minimum
(`min-width: auto`). The mint row's Create button is `flex: none` (the last
flex item), so it lands exactly at the overflow — past the card edge. The
bubble (`.chat-log-msg`, a flex item of `align-items: flex-start`) then
overflows `.sequence-chat-messages` (`overflow-x: hidden`) — the silent clip
the gate captured. (The children-level label/preview/top3-label rules were
already `min-width: 0`-disciplined; the load-bearing clamps were one level up:
the grid items/tracks, the card root, and — for the deck host — the card the
panel mounts the picker inside, `ProtocolIdeShell.tsx:521`.)

**Defect shape (measured, from the CHATHOST receipt): `singleCards: 1`,
`groupedCards: 0`** — the single-request TYPED arm (`.chat-log-clarification`)
carrying the picker's mint row. The grouped card (`.chat-clarification-card`)
carried no measured overflow; its clamps below are a defensive sibling fix,
stated as such.

**Fix (min-width:0 + wrapping discipline only — no redesign, no new state, no
surface branching; markup/testids/labels/semantics unchanged):**

`app/src/event-editor/right-pane/ai/ai.css`:
- `.message-log__clarification-mint`    += `box-sizing: border-box`, `min-width: 0`
- `.message-log__clarification-search`  += `box-sizing: border-box`, `min-width: 0`
- `.message-log__clarification-top3`    += `min-width: 0`
- `.message-log__clarification-option`  += `box-sizing: border-box`, `min-width: 0`, `overflow-wrap: anywhere`
- `.message-log__clarification-card`    += `min-width: 0` (the deck panel mounts the picker inside this card)

`app/src/agent/ChatLog.css` (defensive — the grouped/sibling surface):
- `.chat-clarification-card`           += `min-width: 0`
- `.chat-clarification-card__option`   += `box-sizing: border-box`, `min-width: 0`, `overflow-wrap: anywhere`

**Pins (both mandated by the dispatch):**

1. **jsdom structural pin** — `app/src/agent/ChatClarification.d4overflow.uifix1.test.tsx`
   (7 tests). **jsdom performs NO layout** (no CSS box calculation) — so this
   asserts the STRUCTURAL CONTRACT the geometry rests on, in two parts:
   (a) the declared CSS discipline — `min-width: 0` / `box-sizing: border-box`
   / `overflow-wrap` on the load-bearing nodes (the grid items, the card root,
   the grouped-card root + option rows), with the fix4 track clamp they depend
   on and the children's shrink discipline (the part that was absent pre-fix);
   (b) the markup contract — the mint row is a DIRECT grid item of the picker
   root (one row, `.message-log__clarification-mint`), its Create button is ON
   THAT SAME ROW (`[data-testid="clarification-mint-create"]`), inside the
   typed-arm card (`.chat-log-clarification`) inside the assistant bubble
   (`.chat-log-msg`), with the mint-row/preview/search testids + labels intact.
2. **1440×900 geometry assertion** — appended to the EXISTING Playwright matrix
   spec `app/e2e/chatui1-leGE-surface-matrix.spec.ts` (a new leg): the created
   option row + its Create button lie FULLY inside the pane's bounding box
   (0.5 px sub-pixel epsilon) and the button inside the 1440 px viewport. It
   drives the MODERN `clarificationRequests` done-payload wire (the matrix's
   existing `clarify` stub mode is the LEGACY option shape, which renders the
   legacy block arm, not the picker): a new `'clarify-mint'` stub mode carries
   the measured defect shape — a single `'/m'` request with zero options,
   `allowCreateLocal`, seeded query `'DMEM'` (deterministic mint label via
   `mintNounFromQuery(query)` = `query.trim()`), singleCards:1 /
   groupedCards:0. Viewport via `page.setViewportSize({ width: 1440, height: 900 })`
   (the Playwright config sets none). **EVIDENCE STATUS: RED by construction
   pre-merge — the gate that measured the defect (rev `c9687463`) pre-dates
   fix4, and the item clamps are not in trunk yet; this leg is graded by the
   ORCHESTRATOR's post-merge browser gate. This run does NOT run the browser
   gate (FORBIDDEN).**

**RED-then-GREEN (the jsdom pin genuinely binds):**

- RED: `git -c core.fileMode=false stash push -- app/src/event-editor/right-pane/ai/ai.css app/src/agent/ChatLog.css`
  (the pin file stays; the CSS reverts to pre-fix) + `npx vitest run src/agent/ChatClarification.d4overflow.uifix1.test.tsx`
  = **4 failed | 3 passed (7)** — the 4 CSS-discipline tests fail on the exact assertions, e.g.
  `expected '.message-log__clarification-mint {…}' to contain 'box-sizing: border-box'`
  and `expected '.message-log__clarification-card {…}' to contain 'min-width: 0'`
  (the fix4 track-clamp + children-shrink + markup tests pass pre-fix — the
  track clamp was already in place / structural).
- GREEN: `git -c core.fileMode=false stash pop` (CSS restored) → the same command
  = **7 passed (7)**.
- Full app `src/agent` suite at this tip: **25 files / 155 tests, ALL PASS**
  (pre-D4 baseline 24 files / 148 — the new file adds 7). The one unhandled
  rejection (`/api/search/jsonld`, originating in
  `HarnessChatPane.clarificationEnds.regatefix2.test.tsx`) is the PRE-EXISTING
  environmental noise recorded before D4 (it reproduces in isolation on that
  untouched file; every file of this commit passes).
- app `npx tsc --noEmit`: **10 error lines / 12 output lines — exactly the
  trunk baseline — ZERO in the touched files.**

Commit: `74ae4805` (D4 uifix1).

---

## VERIFY BEFORE EXIT (raw, at tip `74ae4805`)

### `cd server && npx vitest run src/ai`

```
 Test Files  19 failed | 113 passed (132)
      Tests  40 failed | 1167 passed (1207)
     Errors  2 errors
```

The 40 failing test names are the PRE-EXISTING baseline set — proven
byte-identical to the baseline captured before any of this run's commits
(normalized-name diff: 40 = 40, empty both directions). My touched server
files (`submitSuggestionTool.ts`, `shorthandChat.ts`,
`shorthandContractDisclosure.test.ts`, `assumedQuantities.test.ts`,
`goldenNoRebless.target1.test.ts`) are NOT among the 40.

### `cd server && npx tsc --noEmit`

```
(no output — 0 lines)
```

ZERO errors, ZERO in touched files.

### `cd app && npx vitest run src/agent`

```
 Test Files  25 passed (25)
      Tests  155 passed (155)
```

ALL PASS (pre-D4 baseline was 24 files / 148 — the new D4 pin file adds 7).
One pre-existing unhandled rejection (`/api/search/jsonld`, originating in
the untouched `HarnessChatPane.clarificationEnds.regatefix2.test.tsx`) —
recorded before D4; reproduces in isolation on that file.

### `cd app && npx tsc --noEmit`

```
10 error lines / 12 output lines (exactly the trunk baseline) — ZERO in the
touched files (d4overflow pin, matrix spec, ai.css, ChatLog.css, ChatLog.tsx,
ChatLog.test.tsx)
```

### `git -c core.fileMode=false diff --stat 1e9b1867..HEAD` (base = pre-merge tip)

```
 .../2026-11-04_0615-L2-THREADSCOPE-FLIP-1-spec.md  | 334 +++++++
 ...6-11-04_0640-L2-PROMPT2-FIXTURE-BOARD-1-spec.md | 845 +++++
 .../handoffs/2026-11-04_0445-lane2-tick-l2t0435.md | 279 ++++
 .../handoffs/2026-11-04_0545-lane2-tick-l2t0510.md | 135 +++
 .../handoffs/2026-11-04_0620-lane2-tick-l2t0550.md | 139 +++
 .../handoffs/2026-11-04_0645-lane2-tick-l2t0630.md | 121 +++
 .../harness/l2-trunk-journeys/run-journeys.py      |  64 +-
 .../l2-trunk-journeys/test-channel-selfcheck.py    | 492 +++++
 .../plans/harness/l2-trunk-journeys/ui-drive.cjs   |  72 +-
 app/e2e/chatui1-leGE-surface-matrix.spec.ts        | 102 +-
 .../ChatClarification.d4overflow.uifix1.test.tsx   | 241 +++++
 app/src/agent/ChatLog.css                          |  20 +
 app/src/agent/ChatLog.test.tsx                     | 119 +-
 app/src/agent/ChatLog.tsx                          |  54 +-
 app/src/event-editor/right-pane/ai/ai.css          |  41 +
 config/chat/chat-hosts.manifest.yaml               |  22 +
 config/chat/chat-hosts.yaml                        |  24 +
 config/drafting/shorthand-drafting.yaml            |   2 +-
 .../ai/shorthandChat.assumedValue.target1.test.ts  |   7 +-
 server/src/ai/shorthandChat.ts                     |   2 -
 server/src/ai/shorthandContractDisclosure.test.ts  |   6 +-
 server/src/ai/submitSuggestionTool.ts              |   1 -
 .../compiler/resolution/assumedQuantities.test.ts  |  12 +-
 .../goldens/goldenNoRebless.target1.test.ts        |  79 +
 24 files changed, 3156 insertions(+), 57 deletions(-)
```

(The `.hermes/plans/**` + `config/chat/**` + `l2-trunk-journeys/**` lines are
the STEP 0 trunk merge `b64e7f9a`, not this run's work. This run's own
changes: the app/e2e, app/src/agent, app/src/event-editor, config/drafting,
and server/src lines above.)

### `git -c core.fileMode=false status --porcelain`

```
?? .hermes/plans/deliverables/L2-CLARIFY-TARGET-1-report.uifix-gate1-l2t0400.md
?? .hermes/plans/harness/l2-suite-a/lib/__pycache__/
```

Clean after committing (the report is untracked by design; the pycache path
pre-existed).

---

TARGET1-UIFIX1 DONE 74ae4805582cfeff7f37d17a2a84c802f6e3b24d

---

## ADVERSARIAL CYCLE-5 FIX (declaration-level D4 pin)

`cl-adversarial-reviewer` cycle 5 (`reviews/L2-CLARIFY-TARGET-1-advc-c5-l2t1245.md`,
VERDICT: fix) — one MEDIUM defect: `ruleOf()` sliced the raw CSS source
(including `/* … */` comments) and the pins used `toContain`, so a comment that
merely MENTIONS a declaration satisfied the pin. The D4 rules in `ai.css` and
`ChatLog.css` carry explanatory comments that literally contain the pinned
declaration text (e.g. `ai.css:445`'s comment contains `min-width: 0`). The
fix makes the pin declaration-level: `ruleOf()` strips block comments from the
sliced rule body before the assertions run.

**The change (exact `ruleOf` diff — the ONLY change, in the owned test file):**

```
@@ -105,7 +105,14 @@ describe('L2-CLARIFY-TARGET-1 (uifix1 D4) — the option rows stay inside the pa
   const ruleOf = (source: string, file: string, selector: string): string => {
     const at = source.indexOf(selector)
     expect(at, `${file} must define ${selector}`).toBeGreaterThan(-1)
-    return source.slice(at, source.indexOf('}', at))
+    // Strip /* … */ comments from the rule body before asserting (advc c5
+    // defect 1): these rules carry explanatory comments that literally
+    // contain the pinned declaration text, so a comment that merely
+    // MENTIONS a declaration must never satisfy the pin — the assertions
+    // run on declarations only.
+    return source
+      .slice(at, source.indexOf('}', at))
+      .replace(/\/\*[\s\S]*?\*\//g, '')
   }
```

All 7 assertions, the RED-first pins, and the test names are byte-unchanged.
No product-code change. One commit: `4ae12b8c`
`test(target1): D4 pin asserts declarations, not comment text (advc c5 defect 1)`;
`git -c core.fileMode=false diff --name-only 74ae4805..HEAD` = exactly
`app/src/agent/ChatClarification.d4overflow.uifix1.test.tsx`.

**Declaration-level mutation proofs (throwaway copy under `/tmp/t1advcfix` —
never in the worktree; CSS mutated, comments left INTACT, so a comment that
merely mentions the declaration can no longer satisfy the pin):**

- Mutation A — `ai.css`: deleted ONLY the `box-sizing: border-box` (was line
  642) and `min-width: 0` (was line 643) declarations from
  `.message-log__clarification-mint`; its explanatory comment (which contains
  both texts) left intact. RAW:

```
 ❯ src/agent/ChatClarification.d4overflow.uifix1.test.tsx  (7 tests | 1 failed) 60ms
   ❯ … > the mint row (the measured defect row) is a border-box 100% grid item with NO automatic minimum — padding/border no longer add to the track width
     → expected '.message-log__clarification-mint {\n …' to contain 'box-sizing: border-box'

 FAIL  … > the mint row (the measured defect row) is a border-box 100% grid item with NO automatic minimum — padding/border no longer add to the track width
AssertionError: expected '.message-log__clarification-mint {\n …' to contain 'box-sizing: border-box'

- Expected
+ Received

- box-sizing: border-box
+ .message-log__clarification-mint {
+   
+   display: flex;
+   align-items: center;
+   gap: 6px;
+   width: 100%;
+   margin-top: 4px;
+   padding: 6px 8px;
+   border: 1px dashed var(--cl-border);
+   border-radius: 4px;
+   background: var(--cl-bg-elev-2);
+   color: var(--cl-text);
+   font: inherit;
+   font-size: 12px;
+   cursor: pointer;
+   text-align: left;
+

 ❯ src/agent/ChatClarification.d4overflow.uifix1.test.tsx:126:18
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```

  (comment still present in the slice — it no longer counts. Under the OLD
  substring-level `ruleOf` this exact mutation stayed 7/7 green — the measured
  hole.)
- Mutation B (separate run, ChatLog.css only mutated) — deleted ONLY the
  `box-sizing: border-box` (was line 233) and `min-width: 0` (was line 234)
  declarations from `.chat-clarification-card__option`; its comment (which
  contains both texts) left intact. RAW:

```
 FAIL  … > the grouped card (the defensive sibling surface) has the same discipline: the card root drops the automatic minimum and its option rows wrap instead of overflowing
AssertionError: expected '.chat-clarification-card__option {\n …' to contain 'box-sizing: border-box'

- Expected
+ Received

- box-sizing: border-box
+ .chat-clarification-card__option {
+   
+   overflow-wrap: anywhere;
+   display: block;
+   width: 100%;
+   text-align: left;
+   background: none;
+   border: 1px solid var(--cl-border);
+   border-radius: 4px;
+   padding: 4px 6px;
+   margin: 2px 0;
+   color: var(--cl-text);
+   cursor: pointer;
+

 ❯ src/agent/ChatClarification.d4overflow.uifix1.test.tsx:152:20
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```

**GREEN (unmutated tree, worktree tip after restore):**
- `npx vitest run src/agent/ChatClarification.d4overflow.uifix1.test.tsx` →
  **7 passed (7)** (also 7/7 in the pristine /tmp copy — `diff -rq` clean).
- `npx vitest run src/agent` → **Test Files 25 passed (25) / Tests 155
  passed (155)**, 1 pre-existing unhandled jsonld rejection (expected).
- `npx tsc --noEmit` → **10 `error TS` lines** (baseline), **0** in this file.

Full raw logs: `/tmp/t1advcfix/red-both.raw` (mutation A),
`/tmp/t1advcfix/red-B-only.raw` (mutation B), `/tmp/t1advcfix/tsc.out`.

TARGET1-UIFIX1 ADVCFIX DONE 4ae12b8c19357670c08b1832379ee68ece77e371
