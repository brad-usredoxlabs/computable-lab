# PROTO-AI-9 report — ChangesPanel protocol-edit diffs + AiTabPanel accept/reject wiring (UI)

lane 2 · token wip-l2t2252 · campaign ai-protocol-edit-and-router

STATUS: done

- Branch: `wt/PROTO-AI-9-lane2-l2t2252` (off `cl/integration-2` @ `dc41a4e6`)
- Commit: `7a3202e96435c68ceccf337a2790b95032e63d15` — NOT merged (orchestrator owns merge + browser-reviewer gate).

## What was built (spec + grounding-map §(e) followed exactly)

Files touched (all within owned scope; `git diff --stat`: 5 files +822/−7 plus 1 new test file):
- `app/src/event-editor/right-pane/ai/sidebarState.ts` (+ test)
  - All-optional display types per grounding-map §(e): `ProtocolStepKind`,
    `ProtocolEditSetting`, `StepFieldBeforeAfter`, `RoleBeforeAfter`,
    `ProtocolEditOp`, `ProtocolEditDiff`; optional `protocolDiff?: ProtocolEditDiff`
    on the `reviewing` state AND on the `draft-ready` action. EventGraphChange /
    ValidationGap / reducer modes / isChatEnabled / primaryActionLabel /
    headerLabel untouched (byte-identical).
  - Reducer `draft-ready` uses a CONDITIONAL spread for `protocolDiff`, so an
    event-graph draft's reviewing state never gains a `protocolDiff: undefined`
    key (pinned by a test asserting the exact key set).
- `app/src/event-editor/right-pane/ai/ChangesPanel.tsx` (+ test)
  - New optional props `protocolDiff?`, `applying?`, `applyError?`. Without them
    the event-graph panel is byte-unchanged (existing 5 tests pass untouched).
  - `protocolEditDiffFrom(proposal, protocol, attached?)` maps the schema-validated
    envelope (`AiProtocolEditProposal` from PROTO-AI-7 — reused, no second type)
    onto the display diff: target protocol named; per-op before/after hydrated
    from the attached-protocol snapshot (step text, kind, settings, anchor
    position; role add/update/remove incl. `expectedLabwareKinds` /
    `allowedInstrumentIds`); reuses the `+ / ~ / -` prefix convention.
    Unknown/unmappable ops are skipped (schema is the vocabulary authority), and a
    fully-unmappable envelope returns null → the event-graph path proceeds untouched.
  - Protocol mode: Accept/Reject labels, Accept disabled while applying, conflict
    message rendered verbatim in a `role="alert"`.
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
  - `onDraftResult` branches a `protocol_edit` emission INDEPENDENT of the
    event-graph path (before the clarification/event branches), dispatching
    `draft-ready` with `protocolDiff` — sidebar leaves `interpreting` the moment
    the proposal is shown; chat input returns (`isChatEnabled` covers reviewing).
  - The ONLY behavioural hook: `onApply` branches
    `sidebar.protocolDiff ? handleProtocolAccept() : (commit + commitPreview())`.
    `handleProtocolAccept` calls the PROTO-AI-8 applier
    `applyProtocolEdit(targetId, ops)` (validated envelope ops ride a ref, never
    re-derived from the display). Target = envelope `protocolId` override ??
    attached protocol recordId (names the target from `attachedProtocol`).
  - Duplicate Accept cannot replay: button disabled the instant Accept fires
    (`applying`) + proposal ref cleared on success + AI-8 no-op idempotence as
    backstop. On success sidebar dispatches `reset` → input ready, nothing left
    to re-Accept. On failure (incl. D4 stale sha) the message shows verbatim,
    review stays open, never stuck interpreting.
  - Reject (`handleCancelDraft`) → proposal ref nulled, applier NEVER called
    (zero mutation). Attached-protocol swap → open proposal invalidated (reset).
- `app/src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx` (new):
  7 tests — branch-independence, Accept→EXACTLY ONE applier call (+ double-click
  no-replay), D4 conflict verbatim + proposal stays open, protocolId override,
  Reject→applier never called, attached-protocol swap invalidation, event-graph
  draft unaffected.

NOT touched (per scope): server code, `protocolEditOps.ts` internals, intent
dispatch, `assistStream.ts`, `useChatThread.ts`. No rail approval surface (D1).

## RED output (verbatim tail, /tmp/ai9-red-full.log)

`npx vitest run src/event-editor/right-pane/ai/sidebarState.test.ts src/event-editor/right-pane/ai/ChangesPanel.test.tsx src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx` (pre-implementation):

```
 FAIL  src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx > AiTabPanel protocol_edit wiring > branches a protocol_edit emission into ChangesPanel review, never stuck interpreting
 FAIL  src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx > AiTabPanel protocol_edit wiring > Accept calls the applier EXACTLY ONCE with the target record + ops, then resets the sidebar
 FAIL  src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx > AiTabPanel protocol_edit wiring > a stale-sha conflict surfaces the D4 message verbatim and keeps the proposal open
 FAIL  src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx > AiTabPanel protocol_edit wiring > honours an explicit protocolId override on the envelope
 FAIL  src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx > AiTabPanel protocol_edit wiring > Reject never calls the applier and returns the input
 FAIL  src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx > AiTabPanel protocol_edit wiring > swapping the attached protocol invalidates an open proposal
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > ChangesPanel > renders the protocol diff with the target protocol named
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > ChangesPanel > renders step add/update/remove with + / ~ / - prefixes, text, kind, settings, position
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > ChangesPanel > labels the actions Accept / Reject when a protocol diff is shown, and leaves event-graph labels alone
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > ChangesPanel > disables Accept while applying and on a conflict, and shows the conflict message verbatim
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > ChangesPanel > fires onApply/onDiscard from Accept/Reject in protocol mode
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > protocolEditDiffFrom > maps envelope step ops to display ops with before hydrated from the attached protocol
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > protocolEditDiffFrom > maps labware/equipment role ops to role targets incl. expectedLabwareKinds
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > protocolEditDiffFrom > returns null when nothing maps (falls through to the event-graph path)
 FAIL  src/event-editor/right-pane/ai/ChangesPanel.test.tsx > protocolEditDiffFrom > carries position before/after and survives a missing context snapshot
 FAIL  src/event-editor/right-pane/ai/sidebarState.test.ts > sidebarState > draft-ready carries protocolDiff into the reviewing state
 Test Files  3 failed (3)
      Tests  16 failed | 19 passed (35)
```

(Example failure reasons: `TypeError: protocolEditDiffFrom is not a function`,
`AssertionError: expected undefined to deeply equal { protocol: … }`,
`Cannot find name`-class render failures on the missing props — all genuine
missing-feature failures, no weakened gate.)

## GREEN output (verbatim)

Targeted run after implementation:

```
 ✓ src/event-editor/right-pane/ai/sidebarState.test.ts  (14 tests) 4ms
 ✓ src/event-editor/right-pane/ai/ChangesPanel.test.tsx  (14 tests) 106ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.test.tsx  (15 tests) 245ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx  (7 tests) 273ms

 Test Files  4 passed (4)
      Tests  50 passed (50)
```

Full command `npm run test:unit -w app` (exact vitest invocation, full output
at /tmp/ai9-after-full.log; baseline at /tmp/ai9-baseline-full.log):

```
after :  Test Files  58 failed | 223 passed (281)
         Tests  63 failed | 1838 passed (1901)
baseline: Test Files  58 failed | 222 passed (280)
         Tests  63 failed | 1820 passed (1883)
         Errors  5 errors   (after also: Errors 5 errors)
```

- Failing-FILE set diff (baseline vs after): EMPTY — `NO NEW FAILING FILES`
  (`diff /tmp/ai9-baseline-failing-files.txt /tmp/ai9-after-failing-files.txt`
  exit 0; 58 identical entries, all pre-existing trunk failures incl. the e2e
  specs collected by vitest).
- Delta: +1 passing file (AiTabPanel.protocolEdit.test.tsx), +18 passing tests,
  failed counts identical (63/63), unhandled-error count identical (5/5).
- Baseline note: the task described "~23 pre-existing failing FILES"; the
  measured trunk baseline on this worktree is 58 failing files / 63 failing
  tests / 5 unhandled errors — the BEFORE/AFTER set-diff is the real gate and
  it proves ZERO new failures regardless.

## tsc delta

`npx tsc --noEmit -p app/tsconfig.json`:
- baseline: 56 lines (`/tmp/ai9-baseline-tsc.log`, exit 2 — all pre-existing)
- after:    56 lines (`/tmp/ai9-after-tsc.log`)
- `diff baseline after` → **TSC DELTA: NONE** (byte-identical output).

## Consequential assumptions

1. **`handleDeckLayout`'s "discipline" was read from its behaviour, not a
   symbol.** `handleDeckLayout` does not exist in the tree at `dc41a4e6`
   (grep-verified: it appears only in the task/spec text; `useChatThread.ts`
   has no deckLayout path — only `useChatThread.deckLayout.test.tsx` probes a
   future seam). I followed the discipline the task states it embodies: show
   the proposal for review, never leave the sidebar `interpreting`, reset to
   ready after the action so the input returns.
2. **The reviewed proposal's `ops` are the envelope ops VERBATIM.** Accept
   sends `AiProtocolEditProposal.ops` as stored on emission (cast to
   `ProtocolEditOp[]` at the seam); the display diff is derived only for
   rendering. This keeps "the server validated exactly what gets applied".
3. **Target protocol = envelope `protocolId` override ?? attached recordId**
   (assistStream.ts documents `protocolId` as only an override). With no
   attached protocol AND no override the emission falls through to the
   event-graph path — an unscoped protocol_edit has no truthful target.
4. **Display-type divergence from grounding-map §(e)** (documented, additive):
   `ProtocolEditOp.target.step` uses `{type:'step', stepId}` with `stepId:''`
   for a newly-inserted step (the applier mints the real id); §(e)'s
   `settings?: Setting[]` became `ProtocolEditSetting[]` (structural: settingId
   identity + best-effort label/type/value render) because the app has no
   exported `Setting` type and the envelope array is schema-owned data; role
   `before` for a role not in the snapshot degrades to `{roleId}` (truthful:
   the name only, no invented description). `ordinal` is rendered when present
   but the envelope never carries one (position is anchor-based).
5. **Conflict path keeps the review open** (Accept re-enabled, D4 message
   persistent) rather than auto-resetting — the user decides to reload; the
   spec's "truthful success/conflict state" + "never stuck interpreting" is
   satisfied because `reviewing` keeps the chat input enabled.
6. **A protocol_edit emission creates NO deck ghost preview** (returns before
   `setPreview`): its review surface is ChangesPanel, and ghosting protocol
   edits onto the deck was never specified.
7. Test file mounts the real `WorkspaceProvider`/`AiTabPanel` with mocked
   `useChatThread` (option-capture seam) and mocked `protocolEditOps` (call
   counting) + mocked `ProtocolSelectionContext` — applier behaviour itself is
   pinned by AI-8's own suite; this suite pins the WIRING (one call, target,
   ops, gate states).

## Handoff / next gate

- Orchestrator: merge `7a3202e9` into the lane stack, then dispatch
  `cl-browser-reviewer` against :5193 per the spec's acceptance criteria
  (diff shows exactly the asked ops; record UNCHANGED pre-accept via GET sha
  pair; Accept → sha advances ONCE + input ready; Reject → sha unchanged;
  labware-role request → LABWARE count +1 after accept).
- CSS: protocol rows reuse the existing `changes-panel__*` classes; no new
  ai.css rules were added (browser reviewer can flag styling if it reads badly).
