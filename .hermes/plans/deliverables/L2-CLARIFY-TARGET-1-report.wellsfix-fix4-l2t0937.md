# L2-CLARIFY-TARGET-1 — FIX RUN 4 report (adversarial cycle-3 defect closure: 1 MAJOR + 1 MINOR)

- Branch: `cl/lane2-target1-1-l2t1810`, start tip `cf349fca` (preserved WIP of fix run 3, tree CLEAN at start)
- Code commit: **`e53ddf7a946216ed8e1e9ee995ed4a05ccbfd922`** (`e53ddf7a`)
- Code message: `fix(lane2): TARGET-1 wellsfix fix4 — D1 compose row-fact + full detail line (no dropped fields) + D2 range-only 'use selected wells' affordance`
- Lane 2; no dev server start/stop, no browser, no merge/push/rebase, no other worktree; `git -c core.fileMode=false` throughout.

## RULING STATUS — the ruling file does NOT exist; DEFAULT SHAPE used for both defects

RULING path (checked first): `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/decisions/TARGET1-CYCLE3-cap-affordance-ruling-l2t0937.md`

- `read_file` returned empty — the file does not exist at that path.
- `ls -la /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/decisions/ | grep -iE "CYCLE3|TARGET1"` → no match (and the same grep on the worktree's decisions dir → no match).

**Per the dispatch: the ruling was absent, so the DEFAULT SHAPE stated per defect below was used for BOTH defects.** If a ruling lands later, it wins over this run's choices only for the files not yet committed — the D1/D2 implementation is already committed at `e53ddf7a`; any ruling-delta would be a new dispatch.

## DEFECT 1 (MAJOR) — row-fact line REPLACED `eventDetailLine` and dropped displayable fields — CLOSED (COMPOSE)

### What the defect was

At `cf349fca`, the row-fact line (added by the fix3 WIP) REPLACED the `eventDetailLine` descriptor. For `{event_type:'mix', details:{volume:75, cycles:3, labwareId}}` the card rendered `mix` + `75 uL` and the record's `· 3 cycles` was GONE from the face. `eventDetailLine` (ChatPreviewCard.tsx:62-106) had displayed it. The delta had locked the loss in with a pin in `ChatPreviewCard.rowFact.target1.test.tsx` asserting `eventDetails === null` for a mix event.

### The fix — COMPOSE, do not replace

- `proposalRowFacts.ts` stays the ONE declarative formatter — untouched by this fix (no new field-name or verb-name branch tables, no policy literals; the row-fact form stays DATA).
- `ChatPreviewCard.tsx` now COMPOSES: the row fact renders on its OWN line (new class `chat-preview__row-fact`, `data-testid="chat-preview-row-fact"`, fact FIRST) and the `eventDetailLine` descriptor stays on the face (class `chat-preview__event-details`, `data-testid="chat-preview-event-details"`, second). An event the formatter cannot represent keeps today's single `eventLabel` + `eventDetailLine` line; with neither, no line (dead chrome is not added).
- Design note on "residual detail": the already-accepted (unmodified) `ChatPreviewCard.mixedetails.uifix2.test.tsx` pins the `.chat-preview__event-details` element (by class) to the FULL descriptor — `75 uL · 3 cycles` for mix, `100 uL` for add_material. A residual-only detail line would have broken that accepted leg (the add_material residual would be empty). So the compose keeps the FULL descriptor on the face, which satisfies "render the row fact AND the detail line" and is strictly stronger for the defect (no displayable field is ever dropped).
- `ChatPreviewCard.css`: added the `.chat-preview__row-fact` rule (the row's primary checkable line; the descriptor stays the dim secondary detail line). Uses existing tokens; no `--cl-*` regression.

### Re-pin of the conflicting test

`ChatPreviewCard.rowFact.target1.test.tsx`: the pin that asserted `eventDetails === null` for the mix event was REPLACED with the composed expectation — the row-fact line (`75 uL`) AND the FULL descriptor line (`75 uL · 3 cycles`) both present, fact line first (stated order, asserted via `compareDocumentPosition`), distinct classes, and `3 cycles` present on the face. The two legs (`rowFact.target1` and `mixedetails.uifix2`) are GREEN at HEAD and do not contradict each other.

### Non-vacuous proof — mixedetails leg RED at cf349fca, GREEN at HEAD

The mixedetails test file is BYTE-UNCHANGED across the fix (receipt below), so the RED at base and GREEN at HEAD are the honest non-vacuous proof.

**RED at cf349fca** (detached worktree at `cf349fca`, `npx vitest run src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx`):

```
 RUN  v1.6.1 /tmp/l2t1810-cf349fca/app

 ❯ src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx  (4 tests | 2 failed) 36ms
   ❯ ... > a mix event shows "75 uL · 3 cycles" on the proposal card (the spec P7 arm)
     → expect(element).toHaveTextContent()

Expected element to have text content:
  3 cycles
Received:
  Proposed deck changes1 event · 0 new labwaresmix75 uLDiscardApplyDiscard
   ❯ ... > an add_material event shows its volume as { value, unit } → "100 uL"
     → expected 'B1, B2 ← 100 uL' to be '100 uL' // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
   Start at  10:27:32
   Duration  11.89s (transform 29ms, setup 1.06s, collect 39ms, environment 7.24s, prepare 130ms)

VITEST EXIT: 1
```

(The "Received" line is the defect measured verbatim: `mix75 uL` with NO `3 cycles` — exactly what the gate reported.)

**GREEN at HEAD (e53ddf7a)** (same command at the worktree):

```
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810/app

 ✓ src/agent/proposalRowFacts.test.ts  (11 tests) 4ms
 ✓ src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx  (4 tests) 42ms
 ✓ src/agent/ChatPreviewCard.rowFact.target1.test.tsx  (5 tests) 50ms
 ✓ src/agent/ChatClarification.target1.test.tsx  (13 tests) 109ms

 Test Files  4 passed (4)
      Tests  33 passed (33)
```

**Honesty receipt — mixeddetails test unchanged across the fix:**

```
$ git -c core.fileMode=false diff 16f3b403..HEAD -- app/src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx
(empty)
```

## DEFECT 2 (MINOR) — "Use selected wells" fill produced text the slot's own gate REJECTS — CLOSED (range-only affordance)

### What the defect was

`ClarifyWellTargetSlot.tsx` `useSelected` wrote `A2, A3, B2, B3` (a comma list). The slot's ONE grammar is a scalar address or rectangular range (`expandWellAddressLiteral`, parity-pinned to the server's `isWellAddressLiteral`); its own test asserted `approve.disabled === true` after the click — i.e. the affordance filled an unsubmittable value and destroyed a valid typed value.

### The fix — the fill leads to an ANSWER with the ONE grammar

- **Helper** (`wellRange.ts:116-150`): `rectangularRangeScalar(wells) → string | null`. Returns the canonical range scalar (`A2:B3`) ONLY when the selection is exactly ONE full rectangular range the ONE grammar accepts. It validates its candidate through the ONE parser (`expandWellAddressLiteral`) and requires the parser's expansion to EXACTLY equal the selection — no comma-list parsing, no `WELL_RE`/`rangeBetween` second vocabulary, no second client-side expansion. `WELL_ADDRESS_SHAPE_RE` / the server parity pin are UNCHANGED.
- **Slot** (`ClarifyWellTargetSlot.tsx`): the button renders ONLY when `selected.length > 0 && selectedRange` (a full rectangular range). It FILLS the input with the canonical range scalar via `onAnswer` (it does NOT answer itself — the scientist's own approve is the existing `onAnswer({requestId,label,value})` scalar path, so `A2:B3` passes the slot's own gate and Approve becomes enabled). A non-rectangular selection (gap / L-shape) renders NO fill button — never a silent no-op, never a comma list.
- `useOptionalWellSelection()` is no longer a dead export.

### Test re-pin — BOTH directions

`ChatClarification.target1.test.tsx` (the `D3` describe, re-pinned):
- **rectangular** selection → fill writes the canonical range scalar `A2:B3` → `onClarificationPick` NOT called by the fill (it FILLS, doesn't answer) → Approve ENABLED → approving sends `{label:'A2:B3', value:'A2:B3'}` through the existing `onAnswer` scalar path.
- **non-rectangular** selection (L-shape / gap) → NO enabled fill button (not rendered).
- plus: no context / empty selection → no fill button (the base affordance's "absent by default" behavior).

### Non-vacuous proof — the slot's own gate now ACCEPTS the fill

The defect was measured as "the slot's own gate REJECTS the fill's output." The fix makes the ONE parser's expansion of the filled scalar EXACTLY equal the selection, so the gate accepts it. Pinned in `wellRange.target1.test.ts`:

```
 ✓ src/event-editor/lib/wellRange.target1.test.ts  (26 tests)
  - 'a full 2×2 rectangle (the test seed A2/A3/B2/B3, unsorted) → the canonical scalar A2:B3'
    → rectangularRangeScalar(['B2','A2','B3','A3']) === 'A2:B3'
      AND isWellAddressLiteralShape('A2:B3') === true
      AND expandWellAddressLiteral('A2:B3') === ['A2','A3','B2','B3']   (exactly the selection)
  - 'a non-rectangular selection (an L-shape / a gap) → null (NO affordance, never a comma list)'
    → rectangularRangeScalar(['A2','A3','B2']) === null  (bounding box A2:B3 = 4 wells, selection = 3)
      AND rectangularRangeScalar(['A2','B3']) === null
      AND single-row non-contiguous → null
```

## BOUNDARY COMPLIANCE

- Only `app/src/agent/**` and `app/src/event-editor/lib/wellRange.ts` (+ its test) touched. `name-status 16f3b403..HEAD`:

```
A	.hermes/plans/deliverables/L2-CLARIFY-TARGET-1-report.wellsfix-fix3-l2t0755.md   (preserved fix3 WIP artifact — NOT touched by this run)
M	app/src/agent/ChatClarification.target1.test.tsx
M	app/src/agent/ChatPreviewCard.css
A	app/src/agent/ChatPreviewCard.rowFact.target1.test.tsx
M	app/src/agent/ChatPreviewCard.tsx
M	app/src/agent/ClarifyWellTargetSlot.tsx
A	app/src/agent/proposalRowFacts.test.ts
A	app/src/agent/proposalRowFacts.ts
M	app/src/event-editor/lib/wellRange.target1.test.ts
M	app/src/event-editor/lib/wellRange.ts
```

  (The `A`/`M` entries for the fix3 WIP files are the preserved WIP of the interrupted fix run 3 that was already on `cf349fca`; this run's own edits are the D1 compose in ChatPreviewCard.tsx/.css/rowFact test, and the D2 range-only in ClarifyWellTargetSlot.tsx/ChatClarification test/wellRange.ts/wellRange test.)
- No `server/**`, no `schema/`, no `config/`, no `goldens/`, no records touched. `realizationGolden` T1/T2 untouched (still RED as before — not a gate for this item).
- The interrupted fix3 report `.hermes/plans/deliverables/L2-CLARIFY-TARGET-1-report.wellsfix-fix3-l2t0755.md` was NOT modified (it is the preserved-evidence artifact; it appears in the name-status only as the base WIP `A`).
- Defect 4 (golden MANIFEST treeState re-pin) already authorized/merged — NOT touched.

## D-VERIFY (raw receipts, all at HEAD `e53ddf7a` after `git -c core.fileMode=false add` + commit)

### 1. `cd app && npx vitest run src/agent` — WHOLE directory

```
 Test Files  20 passed (20)
      Tests  131 passed (131)
     Errors  1 error
```

Per-file (all ✓): proposalRowFacts(11), incubateDetails.uifix3(3), mixedetails.uifix2(4), regatefix2(3), errorWall.regatefix2(3), rowFact.target1(5), ChatFocusContext(8), ChatLog.grouped.card1(6), ChatLog.d3chrome.uifix3(4), ChatClarification.target1(13), ChatLog.bothfields.uifix1(4), ChatClarificationCard.mint(7), ChatLog.answerChannel(2), ChatLog(27), HarnessChatPane.sourcesChrome(3), useSurfaceChat.chain(5), HarnessChatPane.revisionLoop(4), HarnessChatPane.clarificationEnds.regatefix2(1), HarnessChatPane(14), HarnessChatPane.threadPicker(4).

**File-count delta explained (base 18 → HEAD 20 agent test files):** the 2 NEW files are `ChatPreviewCard.rowFact.target1.test.tsx` and `proposalRowFacts.test.ts` (introduced by the preserved fix3 WIP already on `cf349fca`; this run only re-pins the rowFact test). No other test file was added/removed.

**The 1 unhandled error — PRE-EXISTING, NOT introduced by this run, does not fail any test:**

```
⎯⎯⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯⎯
TypeError: Failed to parse URL from /api/search/jsonld
This error originated in "src/agent/HarnessChatPane.clarificationEnds.regatefix2.test.tsx" test file.
...
 ❯ Module.searchJsonLd src/shared/api/jsonLdSearchClient.ts:52:21
 ❯ resolveLabware src/shared/taptab/slashMenu/resolvers.ts:492:5
 ❯ src/event-editor/right-pane/ai/ClarificationPicker.tsx:627:31

 Test Files  20 passed (20)
      Tests  131 passed (131)
```

Explanation: this is a real network `fetch('/api/search/jsonld')` inside `jsonLdSearchClient.searchJsonLd` that fires when `ClarificationPicker` resolves labware — a pre-existing environment artifact of that unrelated test file (a file I did NOT touch). It is an *unhandled rejection*, not a test failure: all 20 files / 131 tests pass, and the error is present identically at the base `16f3b403` (a detached base sweep reproduced the identical `Failed to parse URL from /api/search/jsonld` unhandled error with `Test Files 18 passed / Tests 108 passed / Errors 1 error`). It is out of this item's scope (it lives in `shared/api`, `shared/taptab`, `event-editor/right-pane/ai` — not in the D1/D2 touched set).

### 2. `npx vitest run src/event-editor/lib/wellRange.target1.test.ts`

```
 ✓ src/event-editor/lib/wellRange.target1.test.ts  (26 tests) 9ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
```

### 3. `npx tsc --noEmit` (app) — baseline 10 errors / 9 files, all pre-existing; ZERO in touched files

```
$ npx tsc --noEmit 2>&1 | grep -cE "error TS"
10
--- distinct erroring files:
src/event-editor/deck/LawnSurface.moveAcross.test.tsx(47,5):
src/event-editor/deck/PreviewActionBar.test.tsx(108,5):
src/event-editor/editorHistory.test.ts(176,34):
src/event-editor/editorHistory.test.ts(199,37):
src/event-editor/EventEditorContext.tsx(1525,29):
src/event-editor/focus/LabwareFocus.instrument.test.tsx(47,5):
src/event-editor/viewer/ViewerToolbar.tsx(55,13):
src/event-editor/viewer/Viewer.tsx(65,13):
src/ingestion/components/IngestionUploadModal.tsx(232,23):
src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx(9,19):
--- errors in ANY touched file (expect 0):
0
```

Exactly the 9 baseline files, 10 errors. Zero in any touched file (ChatPreviewCard, ClarifyWellTargetSlot, proposalRowFacts, wellRange). No new error added.

### 4. `git -c core.fileMode=false diff --stat 16f3b403..HEAD` and clean tree

```
 .hermes/plans/deliverables/L2-CLARIFY-TARGET-1-report.wellsfix-fix3-l2t0755.md |  48 ++++
 app/src/agent/ChatClarification.target1.test.tsx   | 183 +++++++++++++-
 app/src/agent/ChatPreviewCard.css                  |  17 ++
 .../agent/ChatPreviewCard.rowFact.target1.test.tsx | 264 +++++++++++++++++++++
 app/src/agent/ChatPreviewCard.tsx                  |  83 ++++++-
 app/src/agent/ClarifyWellTargetSlot.tsx            |  63 ++++-
 app/src/agent/proposalRowFacts.test.ts             | 156 +++++++++++
 app/src/agent/proposalRowFacts.ts                  | 144 +++++++++
 app/src/event-editor/lib/wellRange.target1.test.ts | 165 ++++++++++++
 app/src/event-editor/lib/wellRange.ts              | 103 +++++++
 10 files changed, 1205 insertions(+), 21 deletions(-)
```

Final tree state (after the code commit; the report file is the only uncommitted artifact and is committed by this docs commit):

```
$ git -c core.fileMode=false status --short
(clean at the code commit; only this report added by the docs commit)
```

## CHANGED FILES (this run, D1 + D2)

- `app/src/agent/ChatPreviewCard.tsx` — D1 compose (fact on own line + FULL descriptor; no replacement)
- `app/src/agent/ChatPreviewCard.css` — `.chat-preview__row-fact` rule
- `app/src/agent/ChatPreviewCard.rowFact.target1.test.tsx` — D1 re-pin (composed expectation, fact-first order)
- `app/src/agent/ClarifyWellTargetSlot.tsx` — D2 range-only affordance (button only for a full rectangle; fill = canonical scalar)
- `app/src/agent/ChatClarification.target1.test.tsx` — D2 re-pin BOTH directions
- `app/src/event-editor/lib/wellRange.ts` — `rectangularRangeScalar` helper (ONE-grammar validation)
- `app/src/event-editor/lib/wellRange.target1.test.ts` — `rectangularRangeScalar` pins + slot import-pin update

## REMAINING BLOCKERS / NEXT ACTIONS

- None blocking for THIS item. Both defects (1 MAJOR + 1 MINOR) are CLOSED and proven.
- The pre-existing `Failed to parse URL from /api/search/jsonld` unhandled rejection in `HarnessChatPane.clarificationEnds.regatefix2.test.tsx` is out of scope (lives in `shared/api`/`shared/taptab`/`event-editor/right-pane/ai`, a file not touched here; pre-existing at base). If the gate wants it cleared, it is a separate dispatch (owner: the lane that owns the JSON-LD search client / ClarificationPicker), resume condition: a ruling/assign to that module.
- A later landing of the cycle-3 cap-affordance RULING (currently absent) would supersede the DEFAULT SHAPE only for files not yet committed; the D1/D2 code is committed at `e53ddf7a`, so any ruling-delta is a fresh dispatch.

Implementation complete. Acceptance (adversarial/browser review) is a separate state owned by the independent reviewer.

---

TARGET1-WELLSFIX-FIX4 DONE e53ddf7a946216ed8e1e9ee995ed4a05ccbfd922
