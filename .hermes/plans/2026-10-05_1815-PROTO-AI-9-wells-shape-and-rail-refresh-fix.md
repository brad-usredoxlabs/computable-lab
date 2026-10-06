# PROTO-AI-9 in-scope repair — wells-shape prompt fix + post-accept rail refresh

Lane 2 · campaign `ai-protocol-edit-and-router` · trunk `cl/integration-2` @ **`0e798b13`**.
Two small, independent, IN-SCOPE fixes that together make AI-9's own verbatim acceptance criterion
reachable. Owner: cl-senior (token **l2t1815**). ONE worker. Branch off `cl/integration-2`.

## Provenance (read before coding)
- **Architect decision (ADOPTED, authoritative for Part 1)**:
  `/home/brad/.hermes/cl/lanes/2/decisions/PROTO-AI-9-stepinsert-wells-gap-decision.md` — Option (a),
  a **PROMPT/DATA** fix, **WITHIN the campaign's approved intent** (no Brad amendment). §3.1 is the
  exact change; §3.2 forbids any code change; §5 lists what must NOT change.
- **UI gate (adopted)**: `/home/brad/.hermes/cl/receipts/PROTO-AI-9/2026-10-05_1712/report.md` —
  `VERDICT: fix`. **D1** = the wash flow never reaches the ChangesPanel because the model emits
  `wells` in the wrong SHAPE (this spec's Part 1). **D2** = after an accepted `labware_add`, the left
  rail still renders `Labware4` until a page reload (Part 2).
- Prior rulings (do not re-litigate): `decisions/PROTO-AI-9-stepinsert-payload-decision.md`,
  `decisions/PROTO-AI-9-stepupdate-kindchange-decision.md`.

## Oriented anchors (verified by the orchestrator @ `0e798b13`; confirm by reading)
- `$defs.WellSelector` `schema/workflow/protocol-edit-op.schema.yaml:112-150` is a `oneOf` of
  **OBJECT** forms ONLY: `{kind:"all"}` | `{kind:"explicit",wells:[…]}` |
  `{kind:"range",range:{start,end}}` | `{kind:"region",region}`. A bare array or `null` is
  REJECTED. `StepInsertOp` requires `wells` for `wash`/`add_material`/`mix`/`harvest` and inside
  `transfer` source/target.
- `server/prompts/event-graph-agent.md` — the `protocol_edit` block is the marker-gated region
  `<!-- protocol-edit:begin -->` (**:118**) … `<!-- protocol-edit:end -->` (**:137**).
  - **:124** = the `step_update` bullet. **:125** = the `step_insert` bullet (per-kind REQUIRED
    payload list naming `wells` but never its SHAPE).
  - **:132** = the ASK rule ("If a required payload value is unknown, ASK the user … never guess
    numbers or role names") — PRESERVE VERBATIM.
  - The only wells-SHAPE guidance in the whole template is the EVENT-GRAPH **array** form
    (Well Ranges :365-379, Event Detail Schemas `"wells": ["A1","A2"]` :393/:438-448). Both the
    draft path and the protocol_edit path render the SAME template
    (`server/src/ai/systemPrompt.ts:402-404, 444-483`), so the array examples actively compete.
- **Rail refresh mechanism**: `app/src/run/RunProtocolStepsLoader.tsx:119-123` listens for the
  window event **`cl:records-changed`** and refills the rail (`setResources`/`setSteps`/bindings)
  via its `refreshKey`. **Human** protocol-edit paths all dispatch it after a successful write
  (e.g. `ProtocolStepEditModal.tsx:99`, `ProtocolTabPanel.tsx:1394,1417,1921,1938`,
  `ProtocolNavPanel.tsx:130,144,164,193`). The **AI** accept path does NOT:
  `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` `handleProtocolAccept` (**`:607-633`**,
  apply at **`:617`**) never fires it → stale badge until reload. That is D2.

---

## Part 1 — the wells-SHAPE prompt fix (architect §3.1). ONE file:
`server/prompts/event-graph-agent.md`, inside the `protocol_edit` block ONLY (:118-137).

Add, as **prompt DATA**, ALL of the following (the architect's four mandated items):

1. **The WellSelector OBJECT shape statement**, written at BLOCK level (covers `wells` in every op,
   including the sibling kind-change payload, without a second edit). State the four object forms
   with one inline example each:
   - `{ "kind": "all" }`
   - `{ "kind": "explicit", "wells": ["A1","A2"] }`
   - `{ "kind": "range", "range": { "start": "A1", "end": "H12" } }`
   - `{ "kind": "region", "region": "<name>" }`
   and state plainly that a **bare array or `null` is a REJECTION** on this path.
2. **The disambiguation line**: the "Well Ranges" and "Event Detail Schemas" sections describe the
   **EVENT-GRAPH DRAFT** path only, where `wells` is a plain array; on the `protocol_edit` path
   `wells` is **ALWAYS** the WellSelector object.
3. **The default**: when the user asks for a step WITHOUT naming wells, use `{ "kind": "all" }`;
   use `explicit`/`range` only for wells the USER named.
4. **Op-tag restatement**: the op names are exactly the listed strings; `insert_after`/`delete`
   style tags are invalid — position is the `afterStepId`/`beforeStepId` FIELDS, deletion is the
   `step_delete` op.

### Part 1 constraints (hard)
- **Pure INSERTION of new lines.** This file's line **:124** is being edited CONCURRENTLY by another
  live lane-2 worker (the `StepUpdateOp.kind` kind-change repair, token l2t1730). Do **NOT** modify,
  reflow, reorder or delete line :124 (the `step_update` bullet) or line :125 (the `step_insert`
  bullet) — add your shape content as NEW lines (e.g. a new block-level paragraph/sub-bullets) so
  the two edits merge cleanly. The orchestrator merges and resolves any conflict.
- PRESERVE :132 verbatim (the ASK rule). Never weaken "never guess numbers" — `cycles` stays a
  number the model must ASK for when the user didn't state it (do NOT add any numeric default).
- **NO code change**: per architect §3.2, `schema/workflow/protocol-edit-op.schema.yaml`,
  `server/src/ai/protocolEditValidation.ts`, `AgentOrchestrator.ts`, `protocolEditOps.ts`,
  `ProtocolEditOpSchema.test.ts` are UNCHANGED. No TypeScript may default/coerce/normalize `wells`.
  Do NOT touch the event-graph sections (:365-448 stay — correct for their path).

## Part 2 — post-accept rail refresh (gate defect D2). ONE file:
`app/src/event-editor/right-pane/ai/AiTabPanel.tsx`.

In `handleProtocolAccept` (**`:607-633`**), after `await applyProtocolEdit(...)` (**:617**) succeeds,
fire the SAME refresh signal every human protocol-write path fires:

```ts
window.dispatchEvent(new CustomEvent('cl:records-changed'))
```

Place it in the SUCCESS branch only (it must NOT fire on the D4 stale-sha / error branch — a failed
apply wrote nothing and must not refresh). Cite the convention you are mirroring in a code comment
(`ProtocolStepEditModal.tsx:99` etc.). This makes `RunProtocolStepsLoader` refill the rail so the
LABWARE count reflects the accepted write WITHOUT a page reload.

### Part 2 constraints
- Do NOT change `protocolEditOps.ts` (AI-8 applier), the ChangesPanel render contract, the
  `cl:records-changed` mechanism itself, or any other file.
- Keep any new sidebarState behaviour untouched.

---

## Acceptance (RED-first; prove each with REAL output in your report)
**Part 1**
- The prompt file's `protocol_edit` block contains all four items above; `git diff` shows ADDED
  lines only, with :124/:125/:132 byte-unchanged (state this explicitly in the report).
- Run the existing server prompt / AI test suites that cover
  `server/prompts/event-graph-agent.md` (e.g. golden prompt tests, `npm run test:run -w server` for
  the prompt/ai files). Report NEW failures only; a deliberate golden-prompt update is allowed but
  the diff must be shown (no rubber-stamp).

**Part 2**
- RED-first unit test in the AI panel suite (`AiTabPanel*.test.tsx`): a SUCCESSFUL protocol accept
  dispatches `cl:records-changed` (spy on `window.dispatchEvent` or add/remove a listener);
  a FAILED accept (stale-sha path) dispatches NOTHING. Prove the test FAILS before the change.
- `npm run test:unit -w app` (or the repo's app test runner) for the touched suite: report NEW
  failures only.

**Typecheck** (measure in your worktree; report the compare)
- `npm run typecheck -w server` and `npm run typecheck -w app`: **no NEW errors** vs trunk
  `0e798b13`. (Pristine-worktree baselines reported last tick: server 44, app 40 — re-measure and
  report; the +N lane-exclude-symlink errors are pre-existing and outside your files.)

## Out of scope (do NOT touch)
- The sibling kind-change repair (l2t1730) and its files/regions.
- Any schema/lint YAML; the intent dispatch; `AgentOrchestrator`; `coerceAgentIntent`; the applier.
- The gate's D3 (cosmetic) and the pre-existing WorkspaceTabStrip duplicate-key warning.

## Deliverable (UNIQUE paths)
- Worktree: `/mnt/vast/home/brad/git/wt/PROTO-AI-9-wellsfix-lane2-l2t1815`, branch
  `wt/PROTO-AI-9-wellsfix-lane2-l2t1815` off `cl/integration-2` @ `0e798b13`.
- Worker report: `.hermes/plans/PROTO-AI-9-wellsfix-report.wip-l2t1815.md` (unique; do NOT touch any
  canonical report or other `.wip` file).
- Commit on your branch. Do **NOT** merge (the orchestrator merges). Do NOT edit the task list.
- End your FINAL message with exactly one line: `PROTO-AI-9 WELLSFIX EXITED code=0`.

## Post-merge (orchestrator, not you)
Restart :3093 (prompt is per-request but lane convention), pre-check ×3 (architect §4.2), then the
cl-browser-reviewer wash gate on :5193 (architect §4.3).
