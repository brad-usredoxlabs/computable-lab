# SPEC — PROTO-AI-9 fix (run-page chat surface) + R-Defect-1/R-Defect-2

Task: PROTO-AI-9 (lane 2). Owner: cl-senior. Trunk base: `cl/integration-2`.
Spec authored 2026-10-05T06:15 EDT by the orchestrator. Authority: architect decision
`/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-9-surface-context-decision.md` (option d:
product wiring fix INSIDE approved intent — NO Brad amendment needed).
Task id: PROTO-AI-9. Worker deliverable paths (UNIQUE — do not write any other file):
- report: `.hermes/plans/PROTO-AI-9-report.wip-l2t0615.md`
- log: `/home/brad/.hermes/cl/lanes/2/logs/PROTO-AI-9-l2t0615.log`
Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-9-lane2-l2t0615` (branch off `cl/integration-2`).

## Why (the failure being fixed)
The PROTO-AI-9 AI protocol-editing feature works end-to-end EXCEPT that the run page's chat pane
sends its request on the wrong `surface`. On the run page the workspace's active tab is
`details:<studyId>` (`app/src/event-editor/workspace/types.ts` `defaultWorkspaceState`), so
`AiTabPanel.tsx:129` derives `systemPrompt.id = workspace.project-details`, and
`server/src/ai/systemPrompt.ts:393-404` only renders the FULL event-graph template +
`formatAttachedProtocol` block + `protocol_edit` instruction region for `event-editor` /
`workspace.deck`. Result: no stepIds/roleIds/op vocabulary in the prompt (31060 chars instead of
the precheck's 53253), the model improvises an envelope, and the PROTO-AI-2 schema correctly
rejects it (`. No ops were applied`). Root cause verified read-only by the orchestrator:
- `AiTabPanel.tsx:129` `systemPromptForViewer(systemPromptKindForTab(activeTab))`;
  `:456-457` `useChatThread({ surface: systemPrompt.id, context, onDraftResult })`.
- `AiTabPanel.tsx:133-134` `editor = useOptionalEventEditor(); editorState = editor?.state ?? null`;
  `:484` `hasDeckEditor = editorState !== null` — TRUE on the run page because
  `RunWorkspacePage.tsx:126-152` wraps the pane in `EventEditorProvider` regardless of the
  workspace active tab. So the deck stack IS mounted; only the surface label lies.
- `AiTabPanel.tsx:209-210` `const activeEventGraphId = activeTab?.kind === 'deck' ? activeTab.eventGraphId : null`
  — null on the run page, so the deck template's graph fields go unfilled.
- `AiTabPanel.tsx:489-504` the KV warm path already triggers off `hasDeckEditor` and ships
  `context` + `systemPrompt.id` — the send path must stop contradicting it.
- Shared attached-protocol identity is published ONLY by `app/src/run/RunProtocolStepsLoader.tsx:134,167`
  (`sel?.setProtocol(...)`; exhaustive grep of `setProtocol(` shows no other non-test caller), so the
  run page is the ONLY page that can carry the attached-protocol block. There is NO fixture route.

## §1 The fix (surface derivation) — files: AiTabPanel.tsx
When the deck editor is mounted (`editorState !== null`) but the active workspace tab is NOT a deck
(the run-page case), the chat must send on the deck surface. Concretely:
1. Derive the SENT surface so that `hasDeckEditor === true` yields the deck viewer's id
   (`workspace.deck`, from `systemPromptKindForTab`/`systemPromptForViewer`) even when
   `activeTab.kind !== 'deck'`; otherwise keep today's behaviour (active-tab derivation) unchanged.
   `surface: systemPrompt.id` at `:457` must use the corrected id. Keep pdf/document/other tabs
   byte-identical (no deck editor mounted -> no change).
2. Make `activeEventGraphId` (`:209-210`) fall back to `editorState.eventGraphId` when the active
   tab is not a deck but a deck editor is mounted, so the deck template's `{{RUN_ID}}`/graph fields
   are filled. Do not otherwise alter the `context` object — `attachedProtocol`, the accepted-graph
   projection and `activeDeckScope` already ride along (`:204-299`).
Do NOT change the review surface (D1), any schema/lint YAML, or the server prompt logic. This is a
client wiring correction only.

## §2 R-Defect-1 / R-Defect-2 (same bounded change) — files: AiTabPanel.tsx + sidebarState.ts
Both are PRE-EXISTING event-graph review wiring (blame: `AiTabPanel.tsx:369-385` from 72347f3bb
2026-07-31 / 215138b3c 2026-09-20; `sidebarState.ts` `committing` + `Applying…` + `isChatEnabled`
from 1a461e200 2026-07-31) that AI-9's rejected-turn path now keeps hitting. Evidence:
`/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-9-rdefect-scope-finding.md`. Fix both here:
- **R-Defect-1** — a failed draft (server result carrying `error`, rendered by
  `assistStream.ts:173` as `Draft failed: …`) currently falls through `AiTabPanel.tsx:369-385` to
  `draft-ready` with `changes: []`, opening an actionable EMPTY "Review changes" panel
  (`ChangesPanel.tsx:64-106`). Required: a failed/error turn must NOT open an empty actionable
  review — return the pane to chat (`ready`) with the error visible, so the biologist can retry.
- **R-Defect-2** — the empty panel's apply runs the event-graph path (`AiTabPanel.tsx:925-935`)
  → `sidebarDispatch({type:'commit'})` → `committing` (`sidebarState.ts:213-215`), and nothing but
  cancel/reset exits `committing` (`isChatEnabled` false → chat input gone). Required: an apply with
  NO protocol proposal AND NO mounted preview must not enter `committing` (no-op / stay usable), and
  the `committing` state must have a bounded reset path so the input cannot be permanently lost.
Prefer the smallest change that satisfies both; keep the event-graph happy path (a real preview
that commits) byte-identical; no D-rule is touched.

## Orientation recon (cl-scout, SCREENING only — verify before relying)
Scouts dispatched 06:13 (A: surface derivation + tab-kind→surface map; B: AiTabPanel deck/active-tab/
context variables; C: `setProtocol(` call sites). Findings pasted here when the run completes; the
orchestrator's OWN verified file:line cites above are authoritative. Scout output is ~91%
field-accurate and is not evidence.

## Acceptance criteria (verbatim — the gate)
1. Unit tests (RED-first) prove: a UI turn with a mounted deck editor and a non-deck active tab
   sends surface `workspace.deck` (not `workspace.project-details`); a failed/error draft result
   leaves the sidebar in `ready` (no empty review); an apply with no proposal and no preview does
   not enter `committing`. `npm run test:unit -w app` (targeted files) green.
2. A UI turn on the fixture run `/runs/RUN-2026-09-19-run-vwr8` must produce a BACKEND TRACE with
   `surface=workspace.deck` and promptChars in the ~53k range (the precheck shape; `o112d1`), not
   `workspace.project-details` / ~31k. This is the acceptance of the fix BEFORE the browser gate.
3. Existing ChangesPanel / event-graph review suites stay green; app tsc has ZERO new errors vs the
   pre-change trunk baseline (record both numbers).
4. Then `cl-browser-reviewer` re-runs the UNCHANGED acceptance flows (`flowAC/plan.json`) against
   :5193: ask "add a wash step after step 3 and delete the redundant centrifuge step" → diff shows
   exactly those ops and the record is UNCHANGED pre-accept (sha before/after in trail); Accept →
   rail renumbers, sha advances ONCE, input ready; Reject → sha unchanged; a labware-role request →
   LABWARE count +1 after accept; VERDICT: accept required. (Orchestrator runs the gate, not you.)

## Files owned (write ONLY these)
`app/src/event-editor/right-pane/ai/AiTabPanel.tsx`; `app/src/event-editor/right-pane/ai/sidebarState.ts`;
their test files (`AiTabPanel.protocolEdit.test.tsx`, `sidebarState.test.ts`, or new siblings).
Do NOT touch server/, schema/, lint/ YAML, or any other app file.

## Notes / constraints
- `exactOptionalPropertyTypes` on the app: optional means absent OR a value, never `undefined` —
  use conditional spread, matching the existing style.
- Do NOT commit to any branch other than your own worktree branch; the orchestrator merges.
- Do NOT edit Brad's live tree, the export trunk checkout, or restart any stack.
- If you cannot reach criterion 2 by trace, STOP and report it as a blocker with the captured trace
  — do not claim it passed.

## assumptions:
- AS-PROTO-AI-9-W8 (prior tick, standing): the lane operates its OWN AI profile
  (`qwen3.8-thunderbeast`) via the product's config route; Brad's live config.yaml is byte-identical.
  Lane-local, reversible.
- No new assumptions in this spec; every file:line above is measured in the served checkout.

## Open evidence-debt (carry forward)
- AS-PROTO-AI-9-W7 — E2E Accept→apply proof rests on the browser gate; clears only on a receipt
  showing Accept→apply with sha-before/after evidence on a schema-VALID proposal.
