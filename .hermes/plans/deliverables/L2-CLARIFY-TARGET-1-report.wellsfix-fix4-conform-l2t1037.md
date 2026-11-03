# L2-CLARIFY-TARGET-1 — fix run 4 CONFORMANCE delta (l2t1037)

Lane: 2 · Worktree: `/mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810`
Branch: `cl/lane2-target1-1-l2t1810`
Code commit: **`b822a3b994f7dedc375ef9ebb576abcdd7c9b87c`** (on `f1c5ce0e`; diff base `e53ddf7a`)
Docs commit: this file (see end of report)
Spec of record: `.hermes/plans/decisions/TARGET1-CYCLE3-cap-affordance-ruling-l2t0937.md`
(read in full; it WINS over this dispatch where they disagree)

## Task

Complete the ALREADY-AUTHORIZED fix run 4 (cycle 4, no new cycle). A binding architect
ruling (l2t0937) landed AFTER the predecessor's dispatch and BEFORE its commit; the
predecessor could not see it. Its delta (`e53ddf7a`) was functionally close but did NOT
match two binding shapes. This commit brings the delta INTO conformance. Scope is
locked: no new features, no refactors beyond the named points.

## Defect D1 — Q3 shape (A) COMPOSE, ONE line

**Ruling clause (binding, verbatim anchors):** Q3: "the row renders **ONE** detail
line that IS the checkable fact… the fact is rendered where the detail line used to
be, with the detail line's fields that the fact did not carry riding the same line
(RESIDUAL, joined with ' · '), inside the **EXISTING** `chat-preview__event-details`
element, which **KEEPS** `data-testid="chat-preview-row-fact"`" — shape (A) COMPOSE,
NOT (B) REPLACE. Worked faces: mix `{volume:75, cycles:3}` → exactly `75 uL · 3
cycles`; add_material `{wells:[B1,B2], volume}` → exactly `B1, B2 ← 100 uL`.
`eventDetailLine` must accept a caller-supplied exclusion of the fact-carried fields,
declared in ONE place by the fact formatter. No field text twice on a row; no field
that displayed before the delta may be GONE.

**Predecessor state (defect):** the fact was rendered on its OWN line (a new
`.chat-preview__row-fact` span) + the FULL `eventDetailLine` as a SECOND line —
duplicating `75 uL` on one row and dropping the second `data-testid`.

**Fix (this commit):**
- `app/src/agent/proposalRowFacts.ts` — the fact formatter now returns
  `{ text, carried }`; `carried` names the `eventDetailLine` fields the fact already
  shows. The carried set is declared in ONE place (the formatter), not re-declared at
  the call site.
- `app/src/agent/ChatPreviewCard.tsx` — `eventDetailLine(event, excluded?)` accepts
  the caller-supplied exclusion and emits only the RESIDUAL. The row renders ONE
  detail line = fact + residual (joined ` · `; residual absent when the fact carries
  everything) inside the EXISTING `chat-preview__event-details` element, which KEEPS
  `data-testid="chat-preview-row-fact"`. The predecessor's second span is gone.
  aria-label keeps `${verb} ${fact}` with the fact unchanged.
- `app/src/agent/ChatPreviewCard.css` — the now-unused `.chat-preview__row-fact`
  block is dropped; the composed single line keeps the row's text colour via the
  testid attribute (no new `--cl-*` tokens).
- `app/src/agent/ChatPreviewCard.rowFact.target1.test.tsx` — re-pinned to the SINGLE
  element reading `75 uL · 3 cycles` with `[data-testid="chat-preview-event-details"]`
  NULL on that row; the no-double-line guard survives (the leg is NOT deleted).
- `app/src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx` — the mix leg is
  BYTE-UNCHANGED and passes AS WRITTEN (ruling: "goes GREEN on that arm unmodified");
  the add_material leg is re-pinned ONLY to the exact composed string `B1, B2 ← 100 uL`
  (no loosening, no containment matchers).
- `app/src/agent/proposalRowFacts.test.ts` — the four formatter legs re-pinned to the
  `{ text, carried }` shape (`text` values unchanged; `carried` pinned per worked
  face).

**Measured evidence (D1):**
- Worked face 1 (mix): single row element `chat-preview-event-details` (testid
  `chat-preview-row-fact`) reads exactly `75 uL · 3 cycles` (unit + rowFact pin;
  the predecessor's duplicate `75 uL` second line is gone — uifix2 mix leg green
  unmodified, and the rowFact no-double-line guard green).
- Worked face 2 (add_material): single row element reads exactly `B1, B2 ← 100 uL`
  (uifix2 leg re-pinned to the exact string; `75 uL`-style duplication impossible —
  the residual is empty).
- No field gone: the mix's `3 cycles` rides the residual (the mutation check below
  proves a replace-only branch drops it).
- W13 aria-label pin GREEN (four distinct rows, `${verb} ${fact}` unchanged —
  `proposalRowFacts.test.ts` + rowFact test green in the suite run below).

## Defect D2 — Q2 option (a) DISABLED + verbatim reason

**Ruling clause (binding, verbatim anchors):** Q2: option (a) — the button is
**DISABLED** (not hidden), the label names the selection as `Use selected wells
(A2, A3, C1)` / `Use selected wells (A2:B3)`, plus the verbatim reason line
"Selection isn't a rectangular range — type it as a well address or range (e.g.
A2:B3)." Rectangular → ENABLED, label `Use selected wells (A2:B3)` (the range literal
that WILL be filled), click → input `A2:B3`, Approve ENABLED, `onClarificationPick`
NOT called (fill, not answer). Single well → `Use selected wells (B2)`, fills `B2`.
Helper stays in `wellRange.ts` only, renamed to the ruling's suggested
`rectangularRangeFromWells(wells: readonly WellId[]): string | null` (returns
`A2:B3`-style corners, null for non-rectangular/unshaped). NO second regex /
expansion grammar anywhere outside that file. Placeholder `A2:B3` and aria-label
stay unchanged. Do NOT edit the spec file.

**Predecessor state (defect):** the button was HIDDEN on non-rectangular selections
and the rectangular case was labeled `selected.join(', ')` (`Use selected wells
(A2, A3, B2, B3)`).

**Fix (this commit):**
- `app/src/event-editor/lib/wellRange.ts` — the helper is RENAMED to
  `rectangularRangeFromWells(wells: readonly WellId[]): string | null`:
  `A2:B3`-style corners for a multi-well full rectangle (sorted top-left:
  bottom-right, via the existing `rowLabelToIndex` / `indexToRowLabel`), the bare
  address `B2` for the single-well degenerate 1×1 (never `B2:B2`), null for
  non-rectangular or unshaped members. ONE grammar: reuses `WELL_ADDRESS_SHAPE_RE`
  / `rowLabelToIndex` / `indexToRowLabel`, validates the candidate through
  `expandWellAddressLiteral`, and requires the parser's expansion to exactly equal
  the selection. The old `rectangularRangeScalar` export is GONE (no residue).
- `app/src/agent/ClarifyWellTargetSlot.tsx` — the button renders for EVERY
  non-empty selection (visible, never hidden). Rectangular → ENABLED, label EXACTLY
  `Use selected wells (A2:B3)`; click → input `A2:B3`; Approve ENABLED;
  `onClarificationPick` NOT called. Non-rectangular → RENDERED + `disabled`, label
  `Use selected wells (A2, A3, C1)` + the ruling's reason line VERBATIM;
  `fireEvent.click` leaves the input UNCHANGED (pre-typed `A2` survives; Approve
  stays enabled for it). Single well → `Use selected wells (B2)`, fills `B2`,
  Approve enabled. Placeholder `A2:B3` and aria-label unchanged.
- `app/src/event-editor/lib/wellRange.target1.test.ts` — unit legs for the helper:
  full rectangle → `A2:B3`; single well → `B2` (NOT `B2:B2`); hole → null; unshaped
  member → null; parity legs untouched and stay GREEN.
- `app/src/agent/ChatClarification.target1.test.tsx` — the old assertions
  (`input.value === 'A2, A3, B2, B3'` + `approve.disabled === true`) are REPLACED
  in the SAME commit (no residue); new legs pin the three ruling cases + the
  never-written input on a disabled click.
- Spec file NOT edited (documentation drift per the ruling).

**Measured evidence (D2):**
- Rectangular {A2,A3,B2,B3}: button enabled, label EXACTLY `Use selected wells
  (A2:B3)`; click → input `A2:B3`, Approve ENABLED, `onClarificationPick` NOT
  called (pins green in the suite run below).
- Non-rectangular {A2,A3,C1}: button RENDERED + `disabled`, label `Use selected
  wells (A2, A3, C1)` + reason line VERBATIM; `fireEvent.click` leaves the input
  UNCHANGED (`A2` pre-typed survives; Approve stays enabled for it).
- Single well {B2}: label `Use selected wells (B2)`, click fills `B2`, Approve
  enabled.
- Helper unit legs: `A2:A3/B2:B3 → 'A2:B3'`; `['B2'] → 'B2'`; hole `['A2','A3','B3']
  → null`; unshaped `['A2','X9'] → null`; parity 19/19 legs untouched GREEN.

## Verify (raw output)

### V1 — `cd app && npx vitest run src/agent` (WHOLE directory)

```
❯ src/agent/HarnessChatPane.threadPicker.test.tsx  (4 tests) 500ms

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

Vitest caught 1 unhandled error during the test run.
This might cause false positive tests. Resolve unhandled errors to make sure your
tests are not affected.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Unhandled Rejection ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
TypeError: Failed to parse URL from /api/search/jsonld
This error originated in "src/agent/HarnessChatPane.clarificationEnds.regatefix2.
test.tsx" test file. It doesn't mean the error was thrown inside the file itself,
but while it was running.
The latest test that might've caused the error is "the turn ends on the done frame
without any host re-render: the clarification renders, Cancel is gone, Send
re-enables". It might mean one of the following:
- The error was thrown, while Vitest was running this test.
- If the error occurred after the test had been completed, this was the last
documented test before it was thrown.
Caused by: TypeError: Invalid URL: /api/search/jsonld
 ❯ new URLImpl ../node_modules/.pnpm/whatwg-url@16.0.1/node_modules/whatwg-url/lib/
URL-impl.js:21:13
 ❯ Object.exports.setup ../node_modules/.pnpm/whatwg-url@16.0.1/node_modules/
whatwg-url/lib/URL.js:54:12
 ❯ new URL ../node_modules/.pnpm/whatwg-url@16.0.1/node_modules/whatwg-url/lib/
URL.js:115:22
 ❯ new Request node:internal/deps/undici/undici:12893:25
 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 Test Files  20 passed (20)
      Tests  132 passed (132)
     Errors  1 error
   Start at  11:01:57
   Duration  10.36s
```

WHOLE directory: **20 files / 132 tests FULLY GREEN** (predecessor: 20 / 131; the
+1 is the new `hole → null` helper unit leg — no leg deleted).

**Pre-existing unhandled rejection (noted separately, per the dispatch):** `TypeError:
Failed to parse URL from /api/search/jsonld`, originating in
`src/agent/HarnessChatPane.clarificationEnds.regatefix2.test.tsx` (latest documented
test: "the turn ends on the done frame without any host re-render…"). It is a
relative-URL `new Request` from the json-ld search client (
`src/shared/api/jsonLdSearchClient.ts:52` → `src/shared/taptab/slashMenu/resolvers.ts
:492` → `ClarificationPicker.tsx:627`) — PRE-EXISTING (present in the predecessor's
green run; `jsonLdSearchClient.ts` / `ClarificationPicker.tsx` are OUT of the
in-scope file set and NOT touched by this commit). It does not fail any test (132
passed).

### V2 — `npx tsc --noEmit` (sort-diff vs baseline)

Baseline was captured BEFORE the source edits (`/tmp/l2t1037-tsc-baseline.txt`).

```
$ npx tsc --noEmit 2>&1 | grep -E "error TS" | sort > /tmp/l2t1037-tsc-after.txt
$ sort -u baseline > baseline.sorted; sort -u after > after.sorted
$ diff baseline.sorted after.sorted
1d0
< src/agent/ClarifyWellTargetSlot.tsx(59,36): error TS2305: Module
  '"../event-editor/lib/wellRange"' has no exported member 'rectangularRangeScalar'.
8d6
< src/event-editor/lib/wellRange.target1.test.ts(38,3): error TS2305: Module
  '"./wellRange"' has no exported member 'rectangularRangeScalar'.
```

The after-set is the expected baseline EXACTLY: **10 errors / 9 files** (the two
`<`-only lines are transient TS2305s the in-flight predecessor tree produced before
the rename completed; neither file is in the baseline set and neither is touched by
this commit — the helper exists and both files compile clean in the committed tree).

```
=== after-set files (10 errors / 9 files) ===
src/event-editor/deck/LawnSurface.moveAcross.test.tsx
src/event-editor/deck/PreviewActionBar.test.tsx
src/event-editor/editorHistory.test.ts
src/event-editor/EventEditorContext.tsx
src/event-editor/focus/LabwareFocus.instrument.test.tsx
src/event-editor/viewer/ViewerToolbar.tsx
src/event-editor/viewer/Viewer.tsx
src/ingestion/components/IngestionUploadModal.tsx
src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx
```

**ZERO in the touched files** — all 9 are pre-existing `event-editor` /
`ingestion` modules (none is in the in-scope set; none is in `src/agent` except the
two transient lines above, which are NOT in the after-set).

### V3 — mutation check (revert ONLY the precedence branch to replace-only)

Command (applied to `app/src/agent/ChatPreviewCard.tsx`, the
`if (rowFact)` branch only — `detail ? \`$${rowFact.text} · ${detail}\` :
rowFact.text` → `` `${rowFact.text}` ``, then):

```
$ npx vitest run src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx \
      src/agent/ChatPreviewCard.rowFact.target1.test.tsx
 ❯ src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx  (4 tests | 1 failed) 37ms
 ❯ src/agent/ChatPreviewCard.rowFact.target1.test.tsx  (5 tests | 1 failed) 47ms

⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx >
 ChatPreviewCard — L2-SUITE-A-uifix2 B: the mix volume/cycles are human-readable on
 the card > a mix event shows "75 uL · 3 cycles" on the proposal card (the spec P7
 arm)
Error: expect(element).toHaveTextContent()

Expected element to have text content:
  3 cycles
Received:
  Proposed deck changes1 event · 0 new labwaresmix75 uLDiscardApplyDiscard
 ❯ src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx:98:18

 Test Files  2 failed (2)
      Tests  2 failed | 7 passed (9)
```

Reverting ONLY the precedence branch to replace-only turns the mixedetails mix leg
RED (the `3 cycles` residual drops off the face — exactly the predecessor's defect)
**and** the rowFact composed-line leg RED. The conformed branch was then restored and
the suite re-run GREEN (V1).

### V4 — no second `[A-P]`-class regex literal outside `wellRange.ts`

```
$ git diff e53ddf7a..HEAD -- '*.ts' '*.tsx' '*.css' \
    | grep -nE '^\+.*\[\s*[A-P][A-Za-z]*\s*\]' \
    | grep -vE '^\+\s*[0-9]+:\s*(//|\*| \*|/\*)'
grep-exit=1   # 1 = no match = PASS
```

Empty. The only `[A-P]`-class regex literal in the delta is in
`app/src/event-editor/lib/wellRange.ts` (the ONE-grammar home).

### V5 — `git diff --stat e53ddf7a..HEAD` + CLEAN tree at the end

```
$ git diff --stat e53ddf7a..HEAD
 ...26-11-03_0315-L2-CHATHOST-CONSOLIDATE-1-spec.md | 734 +++++++++++++++++++++
 ...0-L2-appliance2-coder-serialization-evidence.md |  96 +++
 ...1-03_0510-L2-TARGET1-manifest-rehash-grading.md |  51 ++
 .../ENGINE-ADMISSION-TIMEOUT-BRAD-CARD-l2t0555.md  |  43 ++
 ...TARGET1-CYCLE3-cap-affordance-ruling-l2t0937.md | 171 +++++
 .../TARGET1-MANIFEST-REBLESS-auth-l2t0830.md       | 136 ++++
 ...LARIFY-TARGET-1-report.wellsfix-fix4-l2t0937.md | 247 +++++++
 .../handoffs/2026-11-03_0335-lane2-tick-l2t0255.md | 142 ++++
 .../handoffs/2026-11-03_0415-lane2-tick-l2t0305.md | 145 ++++
 .../handoffs/2026-11-03_0435-lane2-tick-l2t0410.md | 204 +++++
 .../handoffs/2026-11-03_0515-lane2-tick-l2t0450.md | 180 +++++
 .../handoffs/2026-11-03_0605-lane2-tick-l2t0555.md | 160 +++++
 .../handoffs/2026-11-03_0615-lane2-tick-l2t0610.md | 188 +++++
 .../handoffs/2026-11-03_0725-lane2-tick-l2t0710.md | 193 +++++
 .../handoffs/2026-11-03_0745-lane2-tick-l2t0745.md | 165 +++++
 .../handoffs/2026-11-03_0820-lane2-tick-l2t0755.md | 158 +++++
 .../handoffs/2026-11-03_1000-lane2-tick-l2t0937.md | 119 ++++
 app/src/agent/ChatClarification.target1.test.tsx   |  97 ++-
 app/src/agent/ChatPreviewCard.css                  |  23 +-
 .../ChatPreviewCard.mixedetails.uifix2.test.tsx    |   5 +-
 .../agent/ChatPreviewCard.rowFact.target1.test.tsx |  37 +-
 app/src/agent/ChatPreviewCard.tsx                  | 118 ++--
 app/src/agent/ClarifyWellTargetSlot.tsx            |  92 +-
 app/src/agent/proposalRowFacts.test.ts             |  39 +-
 app/src/agent/proposalRowFacts.ts                  |  56 +-
 app/src/event-editor/lib/wellRange.target1.test.ts |  74 +-
 app/src/event-editor/lib/wellRange.ts              |  46 +-
 27 files changed, 3512 insertions(+), 207 deletions(-)
```

(The 17 `.hermes/plans/…` files are the trunk-merge docs pulled in by the
predecessor's `f1c5ce0e` merge — NOT part of this delta. This commit's OWN stat is
`10 files changed, 380 insertions(+), 207 deletions(-)`: the 5 in-scope app source
files + their 4 tests + `ChatPreviewCard.css`.)

```
$ git status --porcelain
(empty = CLEAN tree at the end)
```

## Scope file set (the 10 files this commit touches)

- `app/src/agent/ChatPreviewCard.tsx` (D1: compose ONE line; `eventDetailLine`
  exclusion)
- `app/src/agent/proposalRowFacts.ts` (D1: `{ text, carried }`)
- `app/src/agent/ChatPreviewCard.css` (D1: drop unused `.chat-preview__row-fact`)
- `app/src/agent/ChatPreviewCard.rowFact.target1.test.tsx` (D1: re-pin single element)
- `app/src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx` (D1: add_material leg
  re-pinned to exact composed string; mix leg BYTE-UNCHANGED)
- `app/src/agent/proposalRowFacts.test.ts` (D1: re-pin `{ text, carried }`)
- `app/src/event-editor/lib/wellRange.ts` (D2: `rectangularRangeFromWells`)
- `app/src/event-editor/lib/wellRange.target1.test.ts` (D2: helper unit legs)
- `app/src/agent/ClarifyWellTargetSlot.tsx` (D2: always-render disabled+reason)
- `app/src/agent/ChatClarification.target1.test.tsx` (D2: new pins, no residue)

A file outside this set would be a cap-tripwire failure — the diff confirms exactly
these 10. No server files, no spec edits, no golden/record/YAML changes, no
merge/push/rebase. `realizationGolden` T1/T2 stay RED (out of scope, untouched).

## Remaining blockers

None. All five verify steps pass. The pre-existing unhandled rejection (V1,
`/api/search/jsonld` in `HarnessChatPane.clarificationEnds.regatefix2.test.tsx`) is
out of the in-scope file set and is documented for the record.

TARGET1-WELLSFIX-FIX4-CONFORM DONE b822a3b994f7dedc375ef9ebb576abcdd7c9b87c
