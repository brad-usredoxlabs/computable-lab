# PROTO-AI-6 report (wip-l2t0940) — Attached-protocol context injection + prompt contract

Branch `wt/PROTO-AI-6-lane2-l2t0940` off `cl/integration-2` @ `51419ada`.
Owner: cl-senior · Lane 2 · campaign ai-protocol-edit-and-router.

## What shipped

Outbound model requests from an event-editor chat now carry, WHEN AND ONLY WHEN a
protocol is attached:

1. a compact ground-truth context block (`ATTACHED PROTOCOL`): recordId + current
   content sha, every step as `ordinal | stepId | kind | label`, declared labware
   roles (`roleId — description (expectedLabwareKinds: …)`) and instrument roles
   (`roleId — description (allowedInstrumentIds: …)`), closed by
   `Cite ONLY the stepIds and roleIds listed above; never invent one.`
2. a gated `protocol_edit` instruction section living IN
   `server/prompts/event-graph-agent.md` between
   `<!-- protocol-edit:begin -->` / `<!-- protocol-edit:end -->` markers, stating
   the PROTO-AI-2 op vocabulary verbatim and the hard rules.

No attachment → NO block and NO protocol_edit guidance: the marker region is
stripped at render, and the no-attachment render is **byte-identical** to the
trunk render (KV-cache prefixes for non-attached chats unchanged — pinned by test
against `51419ada`).

## Changed files (product)

- `server/src/ai/types.ts` — `AttachedProtocolContext` (+Step/LabwareRole/
  InstrumentRole mirrors); `EditorContext.attachedProtocol?`. Optional fields
  built with conditional spread (`exactOptionalPropertyTypes` on).
- `server/src/ai/systemPrompt.ts` —
  - `formatAttachedProtocol(context)` appended to the existing `extraContexts`
    list (systemPrompt.ts:464-471 region), gated on `context.attachedProtocol`.
  - `buildSystemPrompt` render-gate on the marker region.
- `server/prompts/event-graph-agent.md` — the `protocol_edit` section (ops
  vocabulary + hard rules) inside the gated region, placed after `{{RUN_ID}}`,
  before `## Available Tools`.
- `app/src/event-editor/right-pane/ai/assistStream.ts` —
  `AssistAttachedProtocol` payload type documenting the `context.attachedProtocol`
  contract (the payload rides in `context`, so warm and real requests share ONE
  cacheable prefix; no top-level body field, no server AssistBody change —
  `AIHandlers.assistStream` already spreads `...context` into `EditorContext`).
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` — reads the shared
  `useProtocolSelection()` (identity + step concepts + declared roles, no new
  fetch), derives `attachedProtocol` (conditional spreads), folds it into the
  request `context` useMemo.
- Minimal plumbing so the payload carries REAL ids:
  - `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` — optional
    `kind` on `ProtocolStepSummary`, optional design refs on
    `ProtocolRoleSummary`, optional `sha` on `ProtocolIdentityRef`.
  - `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts` —
    `roleSummaries` carries `expectedLabwareKinds` / `allowedInstrumentIds`.
  - `app/src/run/RunProtocolStepsLoader.tsx` — publishes step `kind`, and the
    attached record's `contentSha ?? commitSha` in the identity (LPR sha captured
    during chain resolution).
  - `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — carries
    `kind` through its internal step model and context publication.
- `server/src/ai/attachedProtocol.test.ts` — NEW (the acceptance tests).

## Verified injection sites (spec orientation checked line-by-line)

- App context builder `AiTabPanel.tsx` useMemo (spec cited :167-258; drifted to
  ~:184-296 at this checkout) — confirmed no protocol payload before this change.
- Stream call `assistStream.ts` → `POST /api/ai/assist/stream` (registered
  `server/src/api/routes.ts:645`) — confirmed.
- Server fold `AIHandlers.ts` `assistStream` (spec :287 → now :287; the
  `...context` EditorContext spread at :408-415) — confirmed: `attachedProtocol`
  inside `context` flows into `EditorContext` with NO server handler change.
- Prompt render `AgentOrchestrator.ts:1032-1034` → `buildSurfaceAwarePrompt` →
  `buildSystemPrompt` — confirmed; warm path shares the same render
  (`buildPrefixRequest` :960-962), so warm and real prefixes agree.
- `extraContexts` `systemPrompt.ts:464-470` — confirmed; appender added there.
- `EditorContext` `types.ts:323-422` — confirmed no `attachedProtocol` before.
- `ProtocolSelectionContext` (NOT named in the spec) is the existing shared
  state that already holds attached identity/steps/roles (published by
  `RunProtocolStepsLoader` and `ProtocolTabPanel`) — this is the "small shared
  accessor" the spec predicted; no new fetch, no new store.
- `systemPromptForViewer.ts` untouched (spec: not the injection site).

## Captured-request evidence (mocked inference client)

`server/src/ai/attachedProtocol.test.ts` captures the outbound
`CompletionRequest` system message via a mocked `InferenceClient.completeStream`:

- ATTACHED capture contains: `ATTACHED PROTOCOL`, `PRT-000123`, sha
  `a1b2c3d4e5f6`, ALL stepIds (`lyse-cells`, `wash-2`, `read-plate`) with
  ordinal/label/kind, role list (`plate_reader_96`, `reservoir`, `plate_reader`,
  `INS-PHERA`), plus the full nine-op vocabulary and hard rules. Verbatim tail
  of the captured system message:

```
ATTACHED PROTOCOL (ground truth for protocol_edit):
- Protocol: PRT-000123 (sha a1b2c3d4e5f6)
- Steps (ordinal | stepId | kind | label):
  1 | lyse-cells | add_material | Lyse cells
  2 | wash-2 | wash | Wash x2
  3 | read-plate | read | Read plate
- Labware roles:
  - plate_reader_96 — 96-well black plate (expectedLabwareKinds: LBW-96WELL-BLACK)
  - reservoir
- Instrument roles:
  - plate_reader — BMG PHERAstar (allowedInstrumentIds: INS-PHERA)
- Cite ONLY the stepIds and roleIds listed above; never invent one.
```

- NO-ATTACHMENT capture lacks BOTH: `ATTACHED PROTOCOL`, `protocol_edit`,
  `step_insert`, `PRT-000123`, and the gating markers — all `false` in the
  captured string (test-asserted).

## Golden prompt diff (deliberate, not rubber-stamped)

- `server/prompts/event-graph-agent.md`: +20 lines (the gated section), file
  18,985 → 20,829 chars raw.
- NO-ATTACHMENT render: **0-char delta** vs `51419ada` (byte-identical; test
  pins `stripped === git show 51419ada:…`).
- ATTACHED render delta: +1,845 chars guidance + ~250-500 chars context block
  (scales with steps/roles) — the whole block only ever rides attached chats
  (Brad's smallest-block ruling).
- No stored golden/snapshot files exist for the prompt (`*.snap`: none);
  `systemPrompt.test.ts` (6) and `residentContext.test.ts` (13) pass unchanged —
  no golden test needed a content edit. The only golden-adjacent movement:
  `promptBudget.test.ts` counts the raw template file, so its printed number
  moves 39,880 → 41,781; that test RED at trunk already (39,880 > 12,000
  baseline-confirmed) and stays RED — same failure, moved number, reported not
  papered over.

## Envelope mirror check (PROTO-AI-2 parity)

Section mirrors `schema/workflow/protocol-edit-op.schema.yaml`: all nine ops;
stepId `^[a-z][a-z0-9-]*$`; roleId `^[a-z0-9][a-z0-9_-]*$` explicitly stated as
letters+digits+hyphen+underscore (never hyphen-only); `settings` ALWAYS the
Setting[] array (even kind `read`); EQUIPMENT→`allowedInstrumentIds`,
LABWARE→`expectedLabwareKinds`; no concrete-instance object; minted stepIds are
never proposed. No schema/*.yaml edited (no lane-stack restart needed; no live
check performed — no UI/visual change and no live inference on this lane).

## Test results

- `npm run test:run -w server` (targeted): `attachedProtocol.test.ts` 6/6,
  `systemPrompt.test.ts` 6/6, `residentContext.test.ts` 13/13,
  `AgentOrchestrator.test.ts` 11/11 GREEN.
- Server FULL suite before vs after: FAILING-FILE SETS IDENTICAL
  (125 files each; after = 125 failed | 472 passed, +1 file = my new green file;
  tests 278 failed | 4250 passed vs baseline 278 failed | 4244 passed). Zero new
  failures; baseline RED confirmed (~125 files at trunk with lane-shared files
  present).
- `npm run typecheck -w server`: 33 errors BEFORE == 33 AFTER (all pre-existing
  in untouched files; none in my touched files — grep clean).
- `npm run test:unit -w app` (touched app files): FAILING-FILE SETS IDENTICAL
  (48 both; 71 failed | 1818 passed both). Focused files all green:
  `AiTabPanel.test.tsx` 15, `assistStream.test.ts` 11,
  `ProtocolSelectionContext.test.tsx` 8, `protocolStepEditing.test.ts` 7,
  `protocol-selection-bridge.test.tsx` 2.
- app typecheck: 34 errors BEFORE == 34 AFTER (none in my touched files).

## Assumptions & notes (consequential)

1. **Payload rides in `context.attachedProtocol`**, not a top-level body field:
   the server already spreads `context` into `EditorContext`, and keeping it in
   `context` means the KV-cache warm path (`/ai/context/warm`, sent on every deck
   change) renders the SAME prefix as the real request. A top-level field would
   fork warm vs real renders. No AssistBody/server-handler change needed.
2. **Guidance lives in the .md template** (spec deliverable says
   `server/prompts/event-graph-agent.md` is the section's home), gated by a
   marker region stripped at render when unattached. An empty section would
   otherwise leak into all prompts. No-attachment render proven byte-identical.
3. **`kind` is best-effort**: the `/steps` endpoint carries real kinds;
   extraction-candidate fallback steps have none → rendered as `-` placeholder
   rather than inventing `other` (never invent).
4. **Block requires steps present**: identity alone (steps still loading/failed)
   yields NO block — a block with no citable ids would invite invention. Roles
   without steps likewise never render alone.
5. **sha = `meta.contentSha ?? meta.commitSha`** (same token `expectedSha`
   compares server-side, per `RecordRevisionService.token`); published by the
   loader once the record lands; block renders without sha until then (sha shown
   only when known — never invented).
6. **Per-turn freshness caveat (for PROTO-AI-7/8)**: identity/steps/roles refresh
   from the loader/ProtocolTabPanel publications; an in-session protocol EDIT
   accepted elsewhere re-fetches via existing `refetchTrigger`/records-changed
   paths, but a proposal built from a just-stale sha is exactly what the
   propose-then-stale-sha rule (stop, reload, never auto re-propose) covers.
   The applier re-checks sha; the prompt only anchors it.
7. **`protocol_edit` intent/dispatcher NOT added** (PROTO-AI-7 scope). The
   prompt states the proposal vocabulary; the model currently has no `protocol_edit`
   intent branch, so nothing can validate/apply it yet — by design of the
   campaign split. Guidance is inert-but-correct until PROTO-AI-7 wires it.
8. **`{{EXECUTION_CONTEXT}}` dead placeholder left as-is** (spec: separate call).
9. Lane-excluded shared files (per lane-exclude, e.g.
   `server/src/ai/materialRefFields.ts`) were COPIED from `cl-integration-2`
   worktree into this worktree to reach a runnable baseline; they are
   git-ignored — NOTHING outside the deliverable list + tests is committed.
10. promptBudget's 12,000-char core budget is unmet at trunk (39,880 baseline);
    this change adds raw-file +1,901 (attached chats pay +1,845). Flagged for
    Brad's budget-lowering method, not silently absorbed.

STATUS: done
