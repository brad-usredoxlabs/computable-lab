# L2-ONTOLOGY-ANCHOR-SOURCES-1 — UNIT g7form (create door posture + stale banner)

Worktree: `/home/brad/cl-wt/L2-ONTOLOGY-g7form-lane2`
Branch: `cl/lane2-ontology-g7form-0925`
Base: `4de1cb85a29b891589f9400fc3bbf8be87aeb1d2`
Commits: `45563bff` (RED), `d13f20da` (product + final test revision)
Tier: routine. Continuation: no.

## Defects landed (from the leg-A browser gate)

Source: `receipts/ONTOLOGY/g7-legA-20261113T091102/report.md`, VERDICT: fix, served revision
`cl/integration-2 @ 4de1cb85`. Its CHECK A (save path) and CHECK D (durability) PASS — the 422
regression is closed; these are two client-side feedback defects on the same create surface.

- C-2 (report.md:124-131): required-field affordance suppressed on the create form —
  `.taptab-field-label[data-required="true"]::after` computed `":"` instead of the declared
  `" *"`. Mechanism measured at base: `RecordCreatePanel` rendered `ProjectionTapTabEditor`
  with no `style` prop (`RecordCreatePanel.tsx:694-702`), which defaults to `'prose'`
  (`TapTabEditor.tsx:184`) and puts `taptab--prose` on the container (`TapTabEditor.tsx:209`);
  the prose sheet deliberately replaces the asterisk with a colon (`taptab.css:451-452`). The
  form asterisk rule (`taptab.css:314-317`) already existed and is untouched.
- C-3 (report.md:132-135): the refusal banner went stale — `setError` was reset only at the
  next submit; `handleFormChange` set form data and never cleared `error`
  (`RecordCreatePanel.tsx:467` at base).

Explicitly NOT touched (out of scope from the same gate): C-1 (client id gate — decision
owed), C-4 (post-create destination — product shape), C-5/C-6 (cosmetic).

## The change (product, 15 insertions / 2 deletions in one file)

`app/src/event-editor/create/RecordCreatePanel.tsx`

1. `style="form"` on the `ProjectionTapTabEditor` of the create door. The posture is chosen
   for the create surface as a whole — no kind allowlist, no YAML, no `taptab.css` edit.
   `RecordCreatePanel.css` was NOT touched (no panel-scoped nudge was needed).
2. `handleFormChange` clears a set banner on the first author edit:
   `if (error !== null) setError(null)`, with `error` added to the `useCallback` deps. This is
   EDIT-driven only — not conditional on form validity — so honest refusals (title gate,
   schema-document-not-settled, failed spine fetch) stay visible until the author acts.
3. `data-testid="record-create-refusal"` added to the in-form `role="alert"` banner so the
   gate can address the banner the way the panel-level refusal already is named
   (`RecordCreatePanel.tsx:641`). Message text unchanged.

Untouched by design: `taptab.css` (prose keeps its colon), `TapTabEditor.tsx`,
`RecordEditPanel.tsx`, both gc16 suites, the fallback minimal-form path
(`RecordCreatePanel.tsx:703-760`), `schema/**`, `server/**`, no new dependency.

## Test (new, `app/src/event-editor/create/RecordCreatePanel.g7form.test.tsx`)

REAL `RecordCreatePanel` + REAL taptab editor (no taptab mock); only the API client is mocked.
The projection mirrors `schema/workflow/labware-definition.ui.yaml` (Display name + Identifier
`required: true`; Ontology anchor/Vendor optional). Three legs:
(a) the create door renders `.taptab--form`, never `.taptab--prose`, and the required slots
carry `data-required="true"` (optional slots do not); (b) a refused submit (422-style POST
rejection) shows the `role="alert"` banner, then a real click-to-edit → Enter commit in the
Identifier field clears it with NO second submit and NO second create call; (c) the minimal
fallback form still renders when no projection is served (AC3 guard).

## RED (raw, on the committed test revision, both product lines absent)

```
 ❯ src/event-editor/create/RecordCreatePanel.g7form.test.tsx  (3 tests | 2 failed) 1200ms
   ❯ ... > renders the FORM posture: .taptab--form (never .taptab--prose), required slots marked
     → expected null to be truthy
   ❯ ... > clears the refusal banner on the first author edit — no second submit
     → expected <div …(3)></div> to be null
AssertionError: expected null to be truthy
 ❯ src/event-editor/create/RecordCreatePanel.g7form.test.tsx:91:54
AssertionError: expected <div …(3)></div> to be null
 ❯ src/event-editor/create/RecordCreatePanel.g7form.test.tsx:109:61
      Tests  2 failed | 1 passed (3)
```

(The first RED run, at commit `45563bff` before the file was compacted to fit the output
budget, was the same result: `Tests  2 failed | 1 passed (3)`, assertion error
`expected null to be truthy` — the pre-compaction revision pinned the identical assertions.)

## Mutation probes (each on its own, product file reverted afterwards)

MUT1 — remove `style="form"` only:
```
     → expected null to be truthy
 FAIL  src/.../RecordCreatePanel.g7form.test.tsx > g7form — create door posture + banner freshness > renders the FORM posture: .taptab--form (never .taptab--prose), required slots marked
      Tests  1 failed | 2 passed (3)
```
MUT2 — remove `if (error !== null) setError(null)` only:
```
     → expected <div …(3)></div> to be null
 FAIL  src/.../RecordCreatePanel.g7form.test.tsx > g7form — create door posture + banner freshness > clears the refusal banner on the first author edit — no second submit
      Tests  1 failed | 2 passed (3)
```
Both reverted; `git status --short` clean before the product commit.

## Verification (raw)

New pins:
```
 ✓ src/event-editor/create/RecordCreatePanel.g7form.test.tsx  (3 tests) 177ms
      Tests  3 passed (3)
```

No-regression (my own count for the widget-commit file, measured here):
```
 ✓ src/event-editor/create/RecordCreatePanel.g7form.test.tsx  (3 tests) 177ms
 ✓ src/event-editor/create/RecordCreatePanel.gc16.test.tsx  (6 tests) 632ms
 ✓ src/event-editor/create/RecordCreatePanel.gc16-widget-commit.test.tsx  (10 tests) 4081ms
 Test Files  3 passed (3)
      Tests  19 passed (19)
```
`gc16.test.tsx` = 6 passed (matches the composer baseline of 6); `gc16-widget-commit.test.tsx`
= 10 passed (recorded here, not quoted from the composer).

Typecheck (`cd app && npx tsc --noEmit`, exit 2): ZERO errors naming `src/event-editor/create/`.
The four remaining errors are the documented pre-existing module-resolution failures in a
materialised worktree: `src/editor/taptab/tabNavPlugin.ts` (prosemirror-view),
`../server/src/schema/SchemaLoader.ts` + `../server/src/ui/UISpecLoader.ts` (yaml),
`../server/src/validation/AjvValidator.ts` (ajv-formats).

Diff (≤ 4 files, ≤ 140 lines requirement):
```
 .../create/RecordCreatePanel.g7form.test.tsx       | 121 +++++++++++++++++++++
 app/src/event-editor/create/RecordCreatePanel.tsx  |  17 ++-
 2 files changed, 136 insertions(+), 2 deletions(-)
```
= 2 files, 138 changed lines (121 + 15 + 2) — within budget. The report file is not counted.

## Environment note (no repo change)

The connected suites import `ajv/dist/2020.js`, which resolves in the canonical checkout via
`cl-integration-2/node_modules` but not from this worktree (its `app/node_modules` symlink has
no `ajv`, and the worktree root has no `node_modules`). To run the required no-regression
suites I created the gitignored, untracked shim
`/home/brad/cl-wt/L2-ONTOLOGY-g7form-lane2/node_modules/ajv -> /mnt/vast/home/brad/git/cl-integration-2/node_modules/ajv`.
No tracked file, no other worktree, and no shared `node_modules` was modified; `git status` is
clean apart from this ignored path.

## For the browser gate (AC)

AC1: open `/record/new/labware-definition` on :5193 — required markers are now the form-posture
` *` (Display name, Identifier) and the panel lays out label+input rows; assert
`.taptab--form` on the editor container and `data-required="true"` on those labels.
AC2: submit with Identifier empty → `[data-testid=record-create-refusal]` / `role=alert`
banner; type one character into Identifier → banner gone without a second submit.
AC3: unchanged — a valid definition still POSTs 201 and reads back with `ontology_ref`; a kind
with no projection still renders the minimal fallback form (pinned by leg (c)).

The lane stack was NOT restarted and no browser gate was run here (not this unit's job); no
YAML was edited (nothing here is data-driven).

L2-ONTOLOGY-ANCHOR-SOURCES-1 UNIT g7form DONE d13f20da3cb99cefee8b078261afd9e4c08b0279
L2-ONTOLOGY-ANCHOR-SOURCES-1-g7form UNIT unit DONE d13f20da3cb99cefee8b078261afd9e4c08b0279
