# Review Deck & Labware Before One-Shot Event Ghosting

Date: 2026-09-03 · Branch: main (direct intervention)

## Problem

After a Zymo one-shot localize answers the branch Q&A, events ghost onto a
**blank canvas**: the deck has no labware set, so the review surface is empty.

Root cause (traced):
- `POST /intent/compile-from-prompt` (with answers) → `compileFromSmallLlm` →
  `compileScientistIntent` builds `TerminalArtifacts` that DO include a
  `deckLayoutPlan` (pinned/autoFilled slot→labwareHint) + `events`, but **never
  attaches `labwareAdditions`** (the `resolve_labware` pass output).
- `ProtocolLocalizationThread.ghostEvents` only reads
  `terminalArtifacts.labwareAdditions ?? []` and `labwareRequirements ?? []`
  (see `draftPreview.ts` `proposedLabware`). Both are empty on the one-shot path,
  so `buildPreviewFromDraft` computes **zero placements** — the preview passes
  `hasPreview` only because `previewEvents.length > 0`, yielding events floating
  on a blank deck.

## Decision (confirmed with Brad)

Add a dedicated **"Review deck & labware" step** AFTER branch Q&A and BEFORE any
event ghosting. AI proposes labware + a deck; the user edits/confirms via
checkboxes; events ghost ONLY onto that confirmed set. High visibility; the
"AI suggests → scientist chooses" pattern Brad wanted.

## Backend (one file + type)

`server/src/compiler/scientistIntent/compileScientistIntent.ts`
- Read the `resolve_labware` pass output and attach `labwareAdditions` (plus the
  resolved-labware list) to `terminalArtifacts`.
- Helper `toAdditionPatches(output)` mapping `AiLabwareAdditionPatch[]`.
- Extend `TerminalArtifacts` (`CompileContracts.ts`) with optional
  `labwareAdditions?: AiLabwareAdditionPatch[]` and
  `labwareRequirements?: Array<{ classCurie; deckSlot?; ... }>`.

## Frontend (ProtocolLocalizationThread)

- After a compile returns (`handleLocalize`/`handleSubmitAnswers`/
  `handleSendCorrection`), do NOT ghost immediately.
- Set `pending = { terminalArtifacts, localMacro }` and derive the suggested
  labware list (from `labwareAdditions` + `labwareRequirements`, falling back to
  a lab-inventory fetch of kind `labware` when empty) + suggested deck platform.
- Render a **Review deck** section: checkbox list of proposed labware (pre-
  checked) with their slot hints, plus a deck-platform radio when the run deck
  isn't locked. A **"Load onto deck & ghost events"** button computes the final
  additions from the checked set and calls `ghostEvents` (which now places labware
  → non-empty placements → preview has a real deck).
- When the deck is run-locked, show the locked platform read-only.

## Tests

- Backend: assert the one-shot compile retains `labwareAdditions` in terminal
  artifacts (mock `resolve_labware` output). Existing handler tests stay green.
- Frontend: reuse `ProtocolLocalizationThread.test.tsx`; update the two ghost
  assertions to click the **Review deck → Load onto deck** confirm first. The
  editor mock gains `setPlatform`.
- Verify: server + handler + scientistIntent tests pass; protocol thread suite
  passes; full app + server `tsc --noEmit` clean for changed files.

## Verification results (2026-09-03)

- Server `tsc --noEmit`: only the pre-existing `slugify` duplicate-export error
  in `src/index.ts` remains (documented, NOT mine). All changed files clean.
- App `tsc --noEmit`: clean (exit 0).
- Server tests: `IntentCompileFromPromptHandlers.test.ts` (4) +
  `scientistIntent.test.ts` (18) all pass.
- App tests: `right-pane/protocol` (41 tests incl. the new Review-deck gate
  assertions) all pass.
- The FULL server suite "71 failed" and full app suite "29 failed / 45 tests"
  are PRE-EXISTING environmental failures, NOT caused by this change:
  * server: `fatal: Unable to create '.../worktrees/main/.git/index.lock'`
    (git-backed test store collides on a stale worktree lock during parallel
    collect) + record-ID sequence drift (`expected 'GCP-000001' got
    'GCP-000003'`) from leftover records in the shared repo. Reproduced on the
    clean baseline via `git stash` — identical failures.
  * app: `ProjectionTapTabEditor` mock export missing (taptab refactor),
    `virtual:cla-ai-overlay` import, `apiClient.getProtocolContext is not a
    function`, Playwright `test.describe` leaking into the unit run, Router-
    context misuse in collection views. No failing app file imports
    `ProtocolLocalizationThread` or lives under `right-pane/protocol/`.