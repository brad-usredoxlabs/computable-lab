# L2-JOURNEY-DOC-1 — unit u2ui report (read-only UNVALIDATED-DRAFT leg)

Worktree `/tmp/wt-L2-JOURNEY-DOC-1-u2ui`, branch `cl/lane2-journeydoc-u2ui-1547`, base `22db030958f46526ec8306a46dc3f45979853e06`.
Lane 2. This unit is the `verified by` half of L2-JOURNEY-DOC-1 that was not yet delivered: an AI-authored
journey document displayed as an UNVALIDATED DRAFT with no actionable controls, proven by a DOM assertion.

## What was delivered

Two source files (plus this report):

- `app/src/journey/JourneyDraftCard.tsx` (161 lines) — `JourneyDraftCard({ view, diagnostics })`.
  Exports the narrow view interfaces declared in the same file (`JourneyDraftView`,
  `JourneyDraftParameterView`, `JourneyDraftStepView`, `JourneyDraftCardProps`).
- `app/src/journey/JourneyDraftCard.test.tsx` (121 lines) — RED-first targeted jsdom test, 6 cases.
- `.hermes/plans/deliverables/L2-JOURNEY-DOC-1-u2ui-report.md` (this file).

Line budget: 161 + 121 = **282 lines <= 300**. Files: 2 source + 1 report = 3 <= 3. Budget met;
no BLOCKED stop needed.

Contract points (per brief):

- Section order fixed and documented in the module header: objective, completion contract, parameters,
  steps, alternatives, assumptions, unresolved questions, diagnostics.
- Unvalidated banner: `data-testid="journey-draft-unvalidated"`, plain words:
  "UNVALIDATED DRAFT — AI-authored. Not validated, not linted, not actionable: nothing here can be
  accepted or executed."
- Diagnostics in a `<details>/<summary>` disclosure (the ONLY interactive element in the card), so the
  collapsed default does not hide a refusal.
- Non-actionability is STRUCTURAL: the render branch contains no `<button>` at all, no
  `role="button"`, no `onClick`, no `disabled`/`aria-disabled` accept affordance, no committing
  `tabIndex`. Precedent copied (read, never edited): `ChainProposalCard.tsx:241-243` — "the canAccept
  gate is structural — no Accept control exists here, bait 9".
- Unresolved parameters: the fixture row has NO `value` field (absent, never `undefined` — bait 4);
  the card renders the status plus an explicit "not yet resolved" affordance and never fabricates a
  value or unit (schema anchor `journey-document.schema.yaml:50` — "Resolved value; absent while
  status is unresolved").
- The view is a narrow render projection of the merged schema shape (`schema/workflow/journey-document.schema.yaml`,
  u1schema): no enum re-declaration, no Ajv, no validation, no `journey_id`/`revision`/`request_anchor`
  (the card draws none of those; bait 2). Strings render as strings.
- No import from `server/**`, no import from `ChainProposalCard`, no schema import, no fetch, no route,
  no mount, no new dependency, no CSS file (inline `className` strings only).
- Hardcode boundary (bait 7): the product module's only new string constants are the section headings,
  declared once in `SECTION_HEADINGS`; every id/name literal lives in the test fixture.

## Dead-code verdict pre-empted (bait 1)

This card **mounts nowhere by design**: rendering contract + DOM proof only; the mount is the
journey-compiler leg. It is intentionally unmounted at this revision, so there is no served surface to
drive — no browser receipt is claimed, and none is owed. The shipped precedent for a structural
non-actionable branch is `ChainProposalCard.tsx:241-243` (blocked compile: "no Accept control exists
here").

## Acceptance note

ACCEPTANCE: waived for a browser receipt — this unit deliberately mounts nowhere, so there is no served
surface to drive. Its observable proof is the targeted component test (the DOM assertion the item's
`verified by` demands) plus the pasted diagnostics text below. The chat mount and its browser receipt
belong to the journey-compiler leg. The card is intentionally unmounted at this revision.

## Environment note (deviation, non-code)

At run start the worktree's `app/node_modules` was a pre-existing launcher symlink to
`/mnt/vast/home/brad/git/cl-integration-2/app/node_modules`, which on NFS contains only `.vite*` cache
dirs (0 package entries; the integration-2 tree itself is missing `node_modules`) — so `npx vitest`
and `npx tsc` were unusable as materialized. I did NOT install dependencies or scaffold. To run the
mandated verify commands I temporarily re-pointed the same gitignored symlink at the local dev tree's
store (`/home/brad/git/computable-lab/app/node_modules`), whose `package.json`/`package-lock.json` are
byte-identical to this worktree's (verified by `diff`), and RESTORED the original target before exit.
`git status` stayed clean throughout (the symlink is ignored by `.gitignore:5` `node_modules`). If the
launcher re-provisions `node_modules` per-worktree, this step was a local workaround only.

## Baselines (pre-change, at base 22db0309)

- Targeted test pre-change: file does not exist (measured) →
  `No test files found, exiting with code 1` (recorded: scratch `test-before.txt`).
- `npx tsc -p . --noEmit` BEFORE: **13** pre-existing errors, none in this unit's files (scratch
  `typecheck-before.txt`). Note: the brief expected 0; the store used here (local dev tree, identical
  lockfile) is missing `ajv`/`yaml`/`prosemirror-view` transitive type packages for some pre-existing
  test/server files. Per the brief, pre-existing errors in other files were NOT fixed.

## RED (raw, pasted)

Command: `cd app && TMPDIR=/home/brad/.labmat-ncit-tmp npx vitest run src/journey/JourneyDraftCard.test.tsx`
(commit `a7b4787c` — test file only, module absent):

```
 RUN  v1.6.1 /tmp/wt-L2-JOURNEY-DOC-1-u2ui/app

(node:2745211) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
 ❯ src/journey/JourneyDraftCard.test.tsx  (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/journey/JourneyDraftCard.test.tsx [ src/journey/JourneyDraftCard.test.tsx ]
Error: Failed to resolve import "./JourneyDraftCard" from "src/journey/JourneyDraftCard.test.tsx". Does the file exist?
 ❯ TransformPluginContext._formatError .../node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:49258:41
 (stack elided: vite TransformPluginContext/normalizeUrl/transform chain)

 Test Files  1 failed (1)
      Tests  no tests
   Start at  16:08:02
   Duration  8.95s (transform 44ms, setup 917ms, collect 0ms, tests 0ms, environment 6.13s, prepare 384ms)
```

## GREEN (raw, pasted)

Same command, at final commit state (scratch `test-green-final.txt`):

```
 RUN  v1.6.1 /tmp/wt-L2-JOURNEY-DOC-1-u2ui/app

(node:2753510) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
 ✓ src/journey/JourneyDraftCard.test.tsx  (6 tests) 43ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  16:11:19
   Duration  9.90s (transform 84ms, setup 1.03s, collect 1.57s, tests 43ms, environment 5.02s, prepare 216ms)
```

## Typecheck (raw counts)

- `cd app && npx tsc -p . --noEmit` BEFORE: 13 `error TS` lines (scratch `typecheck-before.txt`).
- AFTER: 13 `error TS` lines (scratch `typecheck-after.txt`) — the same 13 pre-existing lines
  (`tabNavPlugin.ts` prosemirror-view; 3 `RecordCreatePanel*`/`ObjectWidget` ajv + implicit-any;
  5 `../server` yaml/ajv/ajv-formats). **AFTER == BEFORE; zero errors in `src/journey/**`**
  (`grep -E "journey"` on the after output: no matches).

## The change (what the DOM proof asserts)

1. `getByTestId('journey-draft-unvalidated')` present; text contains `UNVALIDATED DRAFT` and `not actionable`.
2. `queryByTestId('journey-draft-accept')` is null AND `container.querySelectorAll('button')` has length 0
   (absence is structural, not attribute-based).
3. The `diluent_volume` row (`getByTestId('journey-draft-parameter-diluent_volume')`) contains `unresolved`
   and `not yet resolved` and does NOT contain the resolved fixture value `0.5 mg`; the `salt_amount` row
   shows `resolved` + `0.5 mg`.
4. Both diagnostics render VERBATIM: exact `toBe()` equality on the two `getByTestId('journey-draft-diagnostic')`
   text contents.
5. Section order: the 7 `h2` headings in document order plus the `details summary` text, and a
   compareDocumentPosition index check over the 8 section testids → `[0,1,2,3,4,5,6,7]`.

## Mutation probe

Not owed — this is a render-path unit, not a pin-only unit. No probe claimed (per brief).

## Provenance / temporal context

- Consumes the merged schema shape (u1schema, trunk 02e2407f) without importing it: the card renders
  exactly the fields it draws and nothing else.
- Diagnostics are the lint leg's output (u2lint, live in another tree): this card takes `readonly string[]`
  and renders them verbatim; it never validates, re-orders or interprets them.
- Provenance is displayed per parameter (`user-supplied` / `ai-proposed` in the fixture) as a display
  string, exactly as the schema's `provenance` field carries it.

## Verification (repeatable, exact)

```
cd app && TMPDIR=/home/brad/.labmat-ncit-tmp npx vitest run src/journey/JourneyDraftCard.test.tsx   # → Test Files 1 passed (1) / Tests 6 passed (6)
cd app && npx tsc -p . --noEmit                                                                    # → 13 pre-existing errors, 0 in src/journey/**
git -c core.fileMode=false status --short                                                          # → empty (clean) at exit
```

## Commits (this unit, on cl/lane2-journeydoc-u2ui-1547)

- `a7b4787c` L2-JOURNEY-DOC-1 u2ui: RED — JourneyDraftCard DOM contract test
- `d6c12125` L2-JOURNEY-DOC-1 u2ui: JourneyDraftCard — read-only UNVALIDATED DRAFT render (first cut)
- `6bb20b73` L2-JOURNEY-DOC-1 u2ui: trim to output budget (282 lines <= 300); behavior/assertions unchanged
- `f0525485` L2-JOURNEY-DOC-1 u2ui: add unit report (this file in tree)
- `15955663` L2-JOURNEY-DOC-1 u2ui: exit marker attempt (marker line text botched by sed; see next)
- `<final>` L2-JOURNEY-DOC-1 u2ui: fix marker line to name f05254855a0af9a629b80e9df8c2a889146ccd9d

## Decisions

- Symlink re-point (Environment note above): justified by byte-identical lockfile + zero installs;
  original target restored. If the orchestrator objects, the verify commands are unchanged and
  re-runnable once a usable `node_modules` is provisioned.
- `(none)`/empty-array handling: every section always renders its container element (testids stable);
  the fixture exercises the non-empty path; no extra test budget owed.
- Marker commit strategy follows the lane's accepted convention (u6d4pins: a dedicated marker commit
  whose tree contains the report; the marker sha names the commit whose tree contains the report).

## Next actions / owners

- Journey-compiler leg: chat mount + browser receipt (owner: journey-compiler unit; resume condition:
  u2lint merged and this unit ACCEPT).
- u2lint (live, separate tree): once merged, its diagnostics strings flow into this card's
  `diagnostics` prop verbatim.
- No remaining blockers on this unit.

L2-JOURNEY-DOC-1 UNIT u2ui DONE f05254855a0af9a629b80e9df8c2a889146ccd9d
# git rev-parse HEAD at marker commit time:
# (pasted below after the final commit is made)
