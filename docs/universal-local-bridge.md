# Universal → Local Protocol Bridge

The run workspace's Protocol tab adapts a **universal** vendor protocol (e.g. the ZymoBIOMICS MagBead
kit) into a **local** protocol that binds THIS lab's instruments, labware, and materials. This doc
explains how the pieces fit and what the four major fixes changed.

## The four problems that were fixed

1. **One-shot localization was buried.** It existed (`ProtocolLocalizationThread`) but lived in a
   collapsed `<details>` at the bottom. Opening a run with a universal protocol landed you on raw
   steps, not the localize dialogue.
2. **The AI didn't know the lab inventory.** The one-shot compiler's system prompt contained no
   instruments/labware/materials, so the small model couldn't bind to what the lab actually owns.
3. **If/then leaked into step 1.** Loading a universal protocol bypassed branch questioning, so step 1
   read "a. If using lysis rack ... b. If using lysis tubes ...".
4. **No bootstrapping.** The deck started empty; there was no "load the labwares this run uses first"
   step, so the visualization was wrong until labware was manually placed.

## Fixes

### 1+3 — One-shot is the primary load path; branches auto-ask (frontend)
`ProtocolTabPanel.tsx` now computes the source universal protocol (`availableProtocols[0]` or a
project template) and renders the one-shot `<details>` **open by default** when one is attached, and
passes the run's `humanStepsText` as the initial protocol text.

`ProtocolLocalizationThread.tsx` now:
- Keeps `protocolText` in sync with a late-arriving `initialProtocolText`.
- **Auto-runs branch-question extraction** on mount when a source protocol + text are present (once
  per source id), so the if/then branches are asked BEFORE the user reads raw step prose. The
  `handleSubmitAnswers` flow already sends the answers and derives a concrete starting step set.

### 2 — Lab inventory injected into the model context (server)
`server/src/compiler/scientistIntent/intentCompile.ts`
- Adds a `LabInventory` block (`instruments`/`labware`/`materials`) and `composeIntentPrompt`, which
  prefixes a `LAB INVENTORY` block onto the user prompt.
- `compileFromSmallLlm` applies it before the forced intent-tool call.

`server/src/api/handlers/IntentCompileFromPromptHandlers.ts`
- `loadLabInventory()` snapshots the lab-global records (equipment/instrument-definition, labware,
  material) and passes it into `compileFromSmallLlm`.
- Note: an `inventory_list` tool was NOT added to the one-shot path because `compileFromSmallLlm`
  forces `tool_choice` to the intent tool, so a second tool would be uncallable. The prompt-injection
  block is what actually reaches the model.

### 4 — Soft-first deck-load bootstrap (frontend)
`ProtocolPlanningView.tsx` (Protocol Planning mode) now renders a **"Step 0 — Load labware onto
deck"** section above the steps. It lists the lab inventory's labware records with a checkbox to
"place on deck". **Soft-first**: it's a visual callout, not a hard prerequisite — the user can skip it
and proceed to the steps.

## Files touched

- `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`
- `app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.tsx` (+ test)
- `app/src/run/protocol-planning/ProtocolPlanningView.tsx` (+ test, css)
- `server/src/compiler/scientistIntent/intentCompile.ts` (+ test)
- `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` (+ test)

## Verification

- `cd server && npx vitest run src/compiler/scientistIntent src/api/handlers/IntentCompileFromPromptHandlers.test.ts` → 20 pass
- `cd app && npx vitest run src/event-editor/right-pane/protocol src/run/protocol-planning` → 60 pass
- `cd app && npx tsc --noEmit` → 0 errors; `cd server && npx tsc --noEmit` → only the pre-existing
  `src/index.ts slugify` barrel error remains (unrelated).
