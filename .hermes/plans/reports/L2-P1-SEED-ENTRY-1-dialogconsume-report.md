# L2-P1-SEED-ENTRY-1 / unit dialogconsume — lane 2 report

Item: L2-P1-SEED-ENTRY-1 · Unit: dialogconsume (1 of 1)
Worktree: /home/brad/cl-wt/L2-P1-SEED-ENTRY-1-dialogconsume-lane2
Branch: cl/lane2-p1-seedentry-dialogconsume-0426 · Base: 4589d64da8ca3924a5124fd43463bec66a4ccc4e

## Grounding (read first-hand, quoted)

- `.hermes/plans/architect-context-l2.md:43-44` §7: "Identity is a record id, never a name. Names,
  labels and aliases only pre-select a candidate; a miss is a named unresolved slot." — the
  non-bindable line is keyed by `recordId` (`lab-db:${recordId}:unavailable` from the model); rows
  by `lab-db:${recordId}`.
- §4: "Presentation ≠ execution. A surface is where something is shown or a person acts; a
  capability is what executes. A page must never own a capability..." — the dialog renders the
  server's decision; it does not re-derive offerability.
- `decisions/DEFINITION-IDENTITY-UNIQUENESS-l2-20261113.md:79` (the superseding amendment):
  "Replace 'offered means it exists' with 'offered means its meaning is explicit.'" and `:111`:
  "Each step is a record written when the information exists. No path may silently upgrade a
  description into stock..." — a catalogue reference (description) must never be presented as
  placeable stock; it stays visible with its meaning explicit (the label + the server's reason).
- `decisions/PROMPT1-ENTRY-STATE-l2-20261113.md` (Brad option "b", "and yes on b"): consequence 2 —
  "When a noun cannot be bound, the assistant says plainly that the type is not in the system";
  the reference tier is never silently deleted (`server/src/api/labwareDefinitionSearch.ts:228-230`).

## What was done

The shipped row model (`addDeckDialogModel.ts:130 splitLabDbDeckRows`, unit offerfilter) was green
and exported but never called — SURFACE-NOT-MOUNTED. The dialog's raw `for (const hit of labDbHits)`
push made every labware-definition hit, including server-marked `offerable: false` catalogue
references, a selectable row.

Changed (exactly the 3 owned files; nothing else):

1. `app/src/types/labware.ts` (+7): `LabwareDefinitionSearchHit` gains `offerable?: boolean` and
   `offer_reason?: string`, documented as "present exactly when the server computed it;
   offer_reason rides the false branch" (mirrors `server/src/api/labwareDefinitionSearch.ts:128-133`).
2. `app/src/event-editor/deck/AddToDeckDialog.tsx` (+58/-3):
   - fetch mapping carries both fields with CONDITIONAL SPREAD
     (`...(h.offerable === undefined ? {} : { offerable: h.offerable })`, same for `offer_reason`) —
     absent stays absent (pre-marker wire shape → fails OPEN at the model); absent ≠ `undefined`.
   - row build: labware-definition hits are mapped to `AddDeckLabDbHit[]` and fed to
     `splitLabDbDeckRows`; its `rows` key-set (built from recordIds) gates the choosable `labDb`
     pushes, and each `DeckRow` is still built from the ORIGINAL rich hit so `def`/topology reach
     placement unchanged. Non-offerable hits contribute at most the model's single non-bindable
     line; they never enter `rows` or the `by` map (so `selectedRow` can never resolve to them).
   - render: `unavailableLines` render as a non-interactive `<span className="ee-dialog__nonbindable">`
     (with `aria-disabled`, the model's `Not in this lab's stock: …` label + LAB badge, and the
     server's `reason`) after the row map, inside `.ee-dialog__body`; the empty-state check
     (`isEmptyResult`) also counts the line so a sole non-offerable hit shows the line, not
     "No labware matches …", and "Add to deck" stays disabled (nothing in `by` is selectable).
   - equipment branch (`searchRecords`) untouched: those hits carry no `offerable` and stay
     choosable; DOM order catalog → lab-db → exa → ontology, `.ee-dialog__vendor-row`/`-badge`
     classes, empty-state copy, `selectedKey` reset on reopen — all unchanged.
3. `app/src/event-editor/deck/AddToDeckDialog.test.tsx` (+81): two new legs (see RED below).

NOT changed: `addDeckDialogModel.ts(.test.ts)` (0 lines, `git diff --name-only` vs base = empty),
`server/src/**`, CSS (owned-file cap: `eventEditor.css` is NOT an owned file, so the line styles
ride the existing token classes; the markup is plain and the browser gate grades behavior), no
create-door/prefill routing (that is L2-P1-CREATE-DOOR-1).

Budget: 3 files / 146 insertions + 3 deletions (≤3 files, ≤200 lines).

## Commits (order per exit contract)

1. RED  `70c0f048de8f0b98bd939d3d38966579f796e27e` — "RED dialogconsume: a server-marked
   offerable:false labware-definition hit must not render as a selectable row" (test file only,
   failing on the pre-change tree). The RED was cleanly isolable — the test rides on its own
   commit; nothing test-only re-enters the FIX commit.
2. FIX  `0efcdb772a375877d983b70ac0a603318d07ba66` — "FIX dialogconsume: AddToDeckDialog consumes
   the lab-db row model (splitLabDbDeckRows)" (wire type + dialog).

## Verification (raw, pasted)

### RED — on the pre-change tree (base 4589d64d + RED commit), targeted run only:

`cd app && npx vitest run src/event-editor/deck/AddToDeckDialog.test.tsx`

```
⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/event-editor/deck/AddToDeckDialog.test.tsx > AddToDeckDialog > a server-marked non-offerable hit is a labelled non-bindable line, never a button (dialogconsume)
AssertionError: expected <button type="button" …(2)>…(2)</button> to be null
 ❯ src/event-editor/deck/AddToDeckDialog.test.tsx:320:70
    318|     // Registry-only hit: NOT a button — a clickable row would present…
    319|     // catalogue reference as this lab's stock (the prompt-1 entry-sta…
    320|     expect(screen.queryByRole('button', { name: /Registry Only/i })).t…
       |                                                                      ^
    321|
    322|     // …but the named reference is still VISIBLE (never silently delet…

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
   Duration  13.08s
```

The registry-only `offerable: false` hit renders as a `<button>` today — exactly the measured
defect. The vacuity leg (offerable-true + marker-absent stay choosable) passes on the pre-change
tree by construction: it guards the FIX against the `if (!hit.offerable) skip` vacuity defect,
not the mounted-model defect.

### MUTATION PROBE — reverted ONLY the `splitLabDbDeckRows` call in the dialog (raw
`for (const hit of labDbHits)` push restored; wiring/render/imports left in place), ran the
test file:

```
⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/event-editor/deck/AddToDeckDialog.test.tsx > AddToDeckDialog > a server-marked non-offerable hit is a labelled non-bindable line, never a button (dialogconsume)
AssertionError: expected <button type="button" …(2)>…(2)</button> to be null
 ❯ src/event-editor/deck/AddToDeckDialog.test.tsx:320:70

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
   Duration  12.67s
```

The revert FAILS the new leg (the `offerable: false` hit renders as a button again) → the model
IS on the render path; there is no second path that re-derives the rows (and the dialog source
contains no id/alias/reason matching — only the verbatim field carry). File restored from the
pre-probe copy byte-identical (`diff` = empty, `RESTORE-IDENTICAL`) before the FIX commit;
`git status --short` clean at commit.

### FINAL COMMIT (0efcdb772a375877d983b70ac0a603318d07ba66) — on the final tree:

Targeted (brief command): `cd app && npx vitest run src/event-editor/deck/AddToDeckDialog.test.tsx`

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  04:50:58
   Duration  5.33s
```

Model untouched (brief command): `cd app && npx vitest run src/event-editor/deck/addDeckDialogModel.test.ts`

```
      Tests  9 passed (9)
   Start at  04:51:04
   Duration  1.02s
```

Typecheck (brief command): `cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"` → **17**, and
the full sorted error list is byte-IDENTICAL to the baseline captured at the start of this run
(`diff tsc-baseline.txt tsc-final.txt` = empty). NOTE ON THE BRIEF'S MEASURED BASELINE: the brief
measured 7 at 4589d64d; this worktree measures 17 at the same base — 7 of those are the brief's
named pre-existing legs (RefCombobox.ontologyref.test.tsx, RecordCreatePanel gc16 legs,
ObjectWidget.nested.test.tsx) plus 10 more `Cannot find module` lines for `yaml`/`ajv`/
`ajv-formats`/`prosemirror-view` in `../server/` and `src/editor/`, a residue of the shared-store
relink incident documented under Environment below (the server-side `yaml`/`ajv` top-level links
were dangling at run time). The governing gate is NO NEW ERROR LINES: `tsc-final` is
identical to `tsc-baseline` (both 17) — 0 introduced by this unit.

Clean tree at exit: `git -c core.fileMode=false status --short` → empty (after FIX commit).

### Bait greps (final tree)

- `grep -n 'splitLabDbDeckRows' app/src/event-editor/deck/AddToDeckDialog.tsx` → 2 hits (import
  :28, call :229).
- `git diff 4589d64d -- <3 owned files> | grep -inE 'deepwell|96-well'` → ZERO lines.
- Second-authority scan of the dialog: no `recordId.startsWith`, no id/alias lists, no
  `offer_reason` string matching — the only `offer_reason` references are the verbatim
  carry/absent-spread lines (:170, :237).

## Acceptance contract (browser gate, :5193) — what the code provides

- AC1: a server-marked `offerable: false` hit renders as the non-interactive
  `Not in this lab's stock: <label>` line + the server's stated reason; it is not a button
  (never in `rows`/`by`), and with it as the only lab-db match "Add to deck" stays disabled
  (the unit test pins the mixed case and the sole-hit empty-state interaction via
  `isEmptyResult` counting the line).
- AC2: store-backed (`offerable: true`) and marker-absent labware definitions stay selectable
  and placeable — the 5×16 topology-placement leg and the legacy-mapping leg stay green
  (14/14), so the lab tier is not emptied.
- AC3: equipment tab behaviour and the catalog → lab-db → exa DOM order are unchanged
  (order-pinning leg :139 stays green; equipment legs stay green).

Implementation is complete; acceptance (browser gate) is a separate state owned by the reviewer.

## Environment incident (shared pnpm store — NOT this worktree's files)

The worktree's `app/node_modules` symlinks to `/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`,
whose `.pnpm` resolves to `/mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm` (shared store).
At 04:34 the store's top-level package links (vitest, react, jsdom, yaml, ajv, …) were DANGLING —
`node_modules/.pnpm` and `.modules.yaml` had been rewritten at 04:26:15, 8 minutes before this
unit started, and the first vitest run failed with "Cannot find package 'vitest' imported from …
jest-dom/dist/vitest.mjs". No pnpm process was running; the relink settled by 04:37:13 and all
subsequent runs (baseline, RED, probe, final) used the intact store. This is the same shared-store
fragility recorded in `~/.hermes/specs/computable-lab-persistence.md` (2026-11-12 ENV INCIDENT).
No dependencies were installed; nothing under `/mnt/vast` or `/tmp` was modified.

## Next actions / open items

- Browser acceptance gate (AC1–AC3 on :5193) — owner: browser reviewer. Note for the gate: the
  non-bindable line's visual styling rides existing token classes (`ee-dialog__vendor-badge` etc.)
  because `eventEditor.css` is outside this unit's owned-file cap; markup and behavior are
  fully pinned by the unit tests. If the reviewer wants a dedicated `.ee-dialog__nonbindable`
  rule, that is a 1-file CSS follow-up (tokens only).
- No YAML/stack changes → no lane-stack reload required from this unit.
- Scratch dir `/home/brad/.seedentry-dialogconsume-scratch/` deleted at exit (raw run logs kept
  there during the run: red-run.txt, red-summary.txt, probe-run.txt, probe-summary.txt,
  fix-run.txt, final-*.txt, tsc-baseline.txt, tsc-final.txt, dialog-fixed.tsx).

L2-P1-SEED-ENTRY-1 UNIT dialogconsume DONE <filled after report commit>
