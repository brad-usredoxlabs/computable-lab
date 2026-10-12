# PROTO-AI-1 · Grounding map — ai-protocol-edit-and-router (lane 2)

Tree: `/mnt/vast/home/brad/git/wt/PROTO-AI-1-lane2` (branch `wt/PROTO-AI-1-lane2`,
HEAD `888c110e` — the spec commit on top of the `cl/integration-2` lane trunk; the spec
names trunk `1472a027` as the campaign baseline, this tree is that trunk + the spec doc).
All `file:line` citations below are into THIS tree. READ-ONLY spike: no product file touched;
`git diff` outside `.hermes/` is empty by construction (only this doc was written).

Live read-only probe (lane backend :3093, GET only): `GET /api/protocols/CAN-protocol-1788721664608/steps`
returned the steps array verbatim — confirms the step endpoints read the protocol payload
directly (server/src/api/routes/protocol-steps.ts:245). No writes were issued.

---

## (a) GATE AUDIT

### The two write paths

1. **Dedicated step endpoints** — `server/src/api/routes/protocol-steps.ts`, mounted
   at `server/src/server.ts:1446-1448` (prefix `/protocols/:protocolId/steps...`).
2. **Whole-record PUT** — `PUT /records/:id` registered at `server/src/api/routes.ts:233`
   → `RecordHandlers.updateRecord` (`server/src/api/handlers/RecordHandlers.ts:631-968`),
   which delegates persistence to `RecordStoreImpl.updateUnlocked`
   (`server/src/store/RecordStoreImpl.ts:634`), where Ajv schema validation runs
   (`server/src/store/RecordStoreImpl.ts:684`) and lint runs (`:697`).

**Critical structural fact for both paths:** every write in `protocol-steps.ts` calls
`ctx.store.update(...)` and **discards the result** — PATCH step
(`server/src/api/routes/protocol-steps.ts:367-372`), POST step (`:452-457`), DELETE step
(`:518-523`), PATCH settings (`:684-689`). Only the subgraph POST checks a store result
(`:836`). So store-level rejections (Ajv failures, the controlled-content lock at
`server/src/store/RecordStoreImpl.ts:661`) do NOT corrupt data, but the step endpoints
still answer **HTTP 200 with the "updated" object** when the store refused the write.
Any AI apply path built on these endpoints can silently no-op. (Search: `grep -n
"result.success|created.success" server/src/api/routes/protocol-steps.ts` → only :836.)

### The human editor's real write path

The human step editor does **not** use the step endpoints for text/insert/delete. Both the
edit/add modal (`app/src/event-editor/right-pane/protocol/ProtocolStepEditModal.tsx:95`)
and delete/undo (`app/src/event-editor/right-pane/protocol/ProtocolNavPanel.tsx:122,137`)
go through **whole-record PUT** (`apiClient.updateRecord` with `expectedSha`), gated purely
by the client module `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts`.
The step endpoints are used for subgraph/realization plumbing
(`app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx:1911,1927`).

### Client gate module (compared against server)

`app/src/event-editor/right-pane/protocol/protocolStepEditing.ts`:
- kind-only/inherited: `editableProtocolSteps` throws unless `payload.kind === 'protocol'` — `:33`.
- content-lock: throws when `payload.lifecycleId` && state ∈ {approved, effective,
  superseded, archived} — `:34-36`.
- ≥1 step: `deleteProtocolStep` throws when `steps.length === 1` — `:79`.
- executed-undeletable: throws when `executionMeta.startedAt || executionMeta.completedAt` — `:80-81`.
- stale anchor / duplicate id on insert — `:66-67`.
Tested in `app/src/event-editor/right-pane/protocol/protocolStepEditing.test.ts:41-51`.

### Server enforcement points found

- Executed-step DELETE guard: `server/src/api/routes/protocol-steps.ts:502-509`
  (`STEP_ALREADY_EXECUTED`; checks `executionMeta.startedAt` only — a step with only
  `completedAt` passes the server but is blocked client-side at
  `protocolStepEditing.ts:81` — asymmetry). **Confirmed** the spec's known anchor.
- NOT_A_PROTOCOL on every step endpoint: `:240-243` (GET steps), `:278-281`, `:322-325`
  (PATCH), `:418-421` (POST), `:489-492` (DELETE), `:555-558`, `:623-626`, `:668-671`, `:725-728`.
- Controlled-record lock, handler level: `RecordHandlers.ts:798-799`
  (`CONTROLLED_RECORD_LOCKED`, 409) using `controlledContent`
  (`server/src/revisions/RecordRevisionService.ts:31-35` — content hash ignoring
  state/createdAt/createdBy/updatedAt).
- Controlled-record lock, store level (covers BOTH write paths, including step endpoints):
  `RecordStoreImpl.ts:657` (append-only kinds) and `:661` (controlled content).
- ≥1 step: purely **schema-level** — `steps: { type: array, minItems: 1 }` at
  `schema/workflow/protocol.schema.yaml:301-303`, enforced by store validation on every
  PUT (and every step-endpoint write), surfaced as 422 `Validation failed` at
  `RecordHandlers.ts:866-873`. No route-level "steps.length" check exists anywhere for
  protocol steps (search: `rg "at least one step" server/src` → only
  `MaterialPrepHandlers.ts:1156` for formulations — not protocols).
- Lifecycle-transition guard on PUT: `RecordHandlers.ts:777-792` (`checkLifecycleTransition`);
  lifecycle immutability `:712-714`.

### Gaps named by the spec's CRITICAL instruction

1. **Executed-step gate is ABSENT on the whole-record PUT.** No executionMeta check exists
   in `RecordHandlers.updateRecord` (`:631-968`) or `RecordStoreImpl.updateUnlocked`.
   Search: `rg -n "executionMeta" server/src` → hits only `protocol-steps.ts` (:502-503
   guard, plus type/merge lines :64,:103,:341) and
   `server/src/execution/ExecutionMaterializer.ts:138`. Deleting an executed step via PUT
   is schema-valid (steps array has no executedness constraint) and succeeds. Since the
   human editor itself deletes via PUT (ProtocolNavPanel.tsx:122), today the ONLY guard is
   client `protocolStepEditing.ts:80-81`. An AI apply path on PUT must reimplement it or
   PROTO-AI-5 must route deletes through DELETE /steps.
2. **Content-lock is ABSENT on the dedicated step endpoints at route level**
   (`grep -in "lifecycle|state|approved|effective" server/src/api/routes/protocol-steps.ts`
   → zero hits). It is backstopped at store level (`RecordStoreImpl.ts:661`) — the write
   refuses to persist — but the step endpoint still answers 200 (result-discard bug above).
   Net: lock is server-enforced for data, NOT enforced for the response.
3. **≥1-step is not enforced at route level on either path**; backstopped by Ajv
   `minItems: 1`. On the step endpoints the 422 is swallowed into a false 200 (see
   result-discard); on PUT it is a real 422.
4. **stepId uniqueness is not schema-enforced**: the `steps` array
   (`schema/workflow/protocol.schema.yaml:301-307`) has NO `uniqueItems` (search: `grep -n
   uniqueItems schema/workflow/protocol.schema.yaml` — none within 301-307), and uniqueness
   of whole step objects ≠ unique stepIds. Server checks duplicates only in
   `POST /steps` (`protocol-steps.ts:426-429` `DUPLICATE_STEP_ID`); the whole-record PUT
   has NO duplicate-stepId check. Client checks at `protocolStepEditing.ts:67`.

### Gate table (gate → server/client/absent → file:line → note)

| Gate | Dedicated step endpoints | Whole-record PUT | Client | Server enforcement site | Note |
|---|---|---|---|---|---|
| 1. inherited / protocol-kind-only editable | SERVER (route) | SERVER (structural) | yes | `protocol-steps.ts:240-243,278-281,322-325,418-421,489-492,555-558,623-626,668-671,725-728`; PUT: schemaId pinned to existing record `RecordHandlers.ts:846-851` + `kind: const "protocol"` `schema/workflow/protocol.schema.yaml:24-25` | client `protocolStepEditing.ts:33`. PUT cannot retarget schema; step endpoints answer NOT_A_PROTOCOL. |
| 2. content-locked / controlled protocols locked | SERVER at STORE only (no route check; response lies) | SERVER (handler + store) | yes | handler `RecordHandlers.ts:798-799`; store `RecordStoreImpl.ts:661`; lock fn `RecordRevisionService.ts:31-35` | client `protocolStepEditing.ts:34-36`. Step endpoints grep to ZERO lifecycle checks; data protected by store, HTTP 200 returned anyway. |
| 3. ≥1 step must remain | SCHEMA-AJV only (false-200 on refusal) | SCHEMA-AJV only (real 422) | yes | `schema/workflow/protocol.schema.yaml:301-303` via `RecordStoreImpl.ts:684`; 422 at `RecordHandlers.ts:866-873` | No route-level count check on either path; client `protocolStepEditing.ts:79`. |
| 4. executed steps undeletable | SERVER (route, startedAt only) | **ABSENT** | yes | `protocol-steps.ts:502-509` | **GAP**: PUT path has no executedness check anywhere server-side (see gap 1); client `protocolStepEditing.ts:80-81` is the only gate on the human path; client is stricter (startedAt OR completedAt). |

---

## (b) stepId ALLOCATION

- Mint site: `app/src/event-editor/right-pane/protocol/ProtocolStepEditModal.tsx:88`:
  `` `step-${Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')}` ``
  → exact shape: `step-` + 24 lowercase hex chars (12 random bytes). Comment at `:87`
  notes getRandomValues is used because it works on plain-HTTP LAN origins.
- Schema legality: `stepId` pattern `^[a-z][a-z0-9-]*$`
  (`schema/workflow/protocol.schema.yaml:753-755`) — the minted shape satisfies it.
  (Other authoring sources use different shapes: extractor mints `step-001`
  (`server/src/protocol/ProtocolImportService.ts:162` — live example seen via :3093 GET),
  suggestions `step_N` (`server/src/protocol/ProtocolAuthoringService.ts:177`). The
  editor-minted hex form is what the AI apply path should reuse verbatim.)
- Insert helper: `insertProtocolStep(payload, anchorId, position, step)` at
  `app/src/event-editor/right-pane/protocol/protocolStepEditing.ts:63-73`:
  - gate check via `editableProtocolSteps` (`:64`),
  - stale-anchor throw (`:66`), duplicate-stepId throw (`:67`),
  - splice at anchor before/after, inheriting the anchor's `phaseId` (`:68-71`),
  - membership sync into `variants[].stepIds` / `branch_axes` conditions via
    `updateMembership` (`:49-61`),
  - full ordinal renumber 1..N (`:72`).
- Full code path for "add step": modal `save()` (`ProtocolStepEditModal.tsx:78-104`) →
  mint id (`:88`) → `insertProtocolStep` (`:94`) → `apiClient.updateRecord` whole-record
  PUT with `expectedSha` (`:83-84,95`). It does NOT use `POST /steps`.
- Collision-checking (spec open question 3): checked CLIENT-side against existing stepIds
  at `protocolStepEditing.ts:67` before the PUT. Server-side duplicate check exists ONLY
  on `POST /steps` (`protocol-steps.ts:426-429`); the whole-record PUT path the modal uses
  has no server duplicate check (see gate-table gap 4). Random 96-bit ids make collision
  negligible but the AI path should keep the client-side check.

---

## (c) SETTINGS envelope

There are **three distinct "settings" surfaces** — the AI op-envelope must not conflate them:

1. **Step-level `settings: Setting[]`** (the per-step editable parameters):
   - Shape authority: `schema/workflow/setting.schema.yaml` —
     required `[settingId, label, type]` (`:13-17`); `settingId` pattern
     `^[a-z][a-z0-9-]*$` (`:20-22`); `type` enum
     `[string, number, boolean, duration, temperature, volume, concentration, ratio, select]`
     (`:34-35`); optional `description`, `defaultValue`, `isControlled` (default false),
     `isVariable` (default true), `options` (minItems 1, used when type=select), `unit`,
     `constraints` — with `unevaluatedProperties: false` at root (`:11`).
   - Which kinds accept them: the base `ProtocolStep` declares `settings` for ALL kinds
     (`schema/workflow/protocol.schema.yaml:823-829`, items `$ref setting.schema.yaml`,
     `uniqueItems: true` at :829). No kind restriction exists server-side.
     QUIRK: `StepRead` redeclares `settings` as an OBJECT with
     `additionalProperties: true` (`:1004-1007`) inside the step-kind `oneOf`
     (`:844-853`); a `read` step carrying BOTH shapes is structurally contradictory —
     treat `read` as object-settings-only until PROTO-AI-2 adjudicates.
   - `PATCH /protocols/:id/steps/:stepId/settings`
     (`server/src/api/routes/protocol-steps.ts:649-698`) requires only
     `{ settings: Setting[] }` (`:89-92`), does **zero route validation** —
     `result.step.settings = body.settings ?? []` verbatim (`:681`) — and ignores the
     store result (`:684-689`). Invalid settings fail only at store Ajv
     (`RecordStoreImpl.ts:684`), invisible to the caller (false 200).
   - On the whole-record PUT, invalid settings produce a real **422** with
     `error: "Validation failed"` + `validation` detail
     (`RecordHandlers.ts:866-873`; lint variant `:875-882`).
   - Note drift: the server-local TS `Setting` interface
     (`protocol-steps.ts:26-37`) lists an `enum` field that the schema does NOT have
     (the schema field is `options`). The interface is not enforcement; the schema is.

2. **Cycling-program profile settings** (what the spec's ~`:748-797` anchor points at —
   confirmed in this tree): `POST /protocols/:id/steps/:stepId/subgraph`
   (`protocol-steps.ts:706-861`) validates `equipments[].settings[*]` values — NOT the
   step's `settings[]` — against the declarative cycling shape
   `{ initial: { temperature_c, duration_sec }, cycles: { count, steps: [{temperature_c,
   duration_sec}, …] } }`:
   - detector `cyclingProgramError` `:166-191` (a value is only tested if it has an
     `initial` or `cycles` key, `:170` — non-program settings pass through untouched);
   - scanner `findMalformedCyclingPrograms` `:193-205`;
   - rejection `:751-759`: **HTTP 422**, `error: 'REALIZATION_NOT_ACCEPTED'`, message
     `Step realization contains a malformed cycling program … the draft is preserved.`,
     `findings[0].code = 'malformed-cycling-program'`, `path: '/equipments'` (`:753-757`).
   - Specific messages: `:175` (initial hold numeric), `:179` (cycles.count positive),
     `:182` (≥1 cycle steps), `:187` (per-step numeric temp/duration).
   - After that gate, the realization goes through the Ajv+lint+reference gate
     `checkRealizationProposal` (`:812-825`, impl
     `server/src/api/routes/RealizationCompileGate.ts`) — same 422
     `REALIZATION_NOT_ACCEPTED` with `gate.findings` (`:819-824`).

3. **Equipment settings on the realization**: equipment entries are folded into the
   event-graph `labwares[]` as `kind:'equipment'` carrying `settings` verbatim
   (`protocol-steps.ts:763-781`, settings copy at `:778`).

---

## (d) PROMPT CONTEXT — attached-protocol trace

**Answer: NO. Today the attached protocol's step list (stepId/ordinal/label/kind) and its
declared role inventory (roleId/description/expectedLabwareKinds) are NOT injected into
the outbound model request.** The attached-protocol context block is ABSENT and
PROTO-AI-6 must create it.

Trace of the real path (event-editor chat):

1. App builds the chat context in
   `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:167-258` (`useMemo`): studyId,
   active tab, systemPrompt id/body, deck scope, the accepted event-graph projection
   (`:189-212`), `draftRevision` (`:239-246`), `graphLemur` source-candidate block
   (`:247-256`). **No protocol payload, no steps, no roles.** Search: `grep -n
   "steps|roles|labwareRoles|instrumentRoles" AiTabPanel.tsx` → only unrelated prose
   matches (:564, :708, :716).
2. It is streamed to `POST /api/ai/assist/stream` via `assistStream.ts`
   (`app/src/event-editor/right-pane/ai/assistStream.ts:23-40` — request carries
   `prompt/surface/context/history/protocolStepContext` only), route registered at
   `server/src/api/routes.ts:645`.
3. `AIHandlers.assistStream` (`server/src/api/handlers/AIHandlers.ts:287`) folds the body
   into an `EditorContext`: `{ labwares: [], eventSummary: '', vocabPackId: 'general',
   availableVerbs: [], ...context, ...(protocolStepContext …) }` (`AIHandlers.ts:408-415`).
4. `AgentOrchestrator.run` (`server/src/ai/AgentOrchestrator.ts:1033-1034`) renders the
   system prompt via `buildSurfaceAwarePrompt` → `buildSystemPrompt`
   (`server/src/ai/systemPrompt.ts:393-404, 444-471`) over the template
   `server/prompts/event-graph-agent.md` (placeholders `{{LABWARES}}` :75,
   `{{EVENT_SUMMARY}}` :78, `{{WELL_STATE_SNAPSHOT}}` :86, `{{VOCAB_PACK}}` :89,
   `{{DECK_CONTEXT}}` :92, `{{EXECUTION_CONTEXT}}` :97 — note `{{EXECUTION_CONTEXT}}`
   has NO replacer in `buildSystemPrompt` (`grep EXECUTION_CONTEXT server/src/ai` →
   zero code hits; the placeholder is dead in this tree), `{{MATERIAL_TRACKING}}` :113,
   `{{RUN_ID}}` :116).
5. The ONLY protocol-shaped blocks that can be appended are
   (`systemPrompt.ts:464-470`):
   - `formatProtocolStepContext` (`:478-490`) — ONE selected step's label+id +
     highlighted text, triggered per-turn by the `protocol-step-selection` window event
     (`AiTabPanel.tsx:561-591`; builder
     `app/src/event-editor/right-pane/ai/toSurfaceContext.ts:60-70`). It carries no
     ordinal, kind, list, or roles.
   - `formatLocalProtocolSetup` (`:499-525`) — the local-protocol PLATE-SETTING rows
     (role → binding), fed only from `StepInvestigationPanel`
     (`app/src/event-editor/right-pane/protocol/StepInvestigationPanel.tsx:170`), not the
     main chat tab.
6. `EditorContext` (`server/src/ai/types.ts:323-422`) has NO field for an attached
   protocol record, step list, or role inventory (search: the interface spans :323-422;
   `attachedProtocol` grep over `server/src/ai` → zero hits).
7. The client-side protocol knowledge that DOES exist — step summaries
   (`protocolStepEditing.ts:41-46`) and role summaries incl. labware/inventory
   (`protocolStepEditing.ts:24-30`, built from `payload.roles.labwareRoles/instrumentRoles`,
   schema `schema/workflow/protocol.schema.yaml:166-192`, `LabwareRole.expectedLabwareKinds`
   at `:424-435`) — never crosses into the chat context builder.
8. `app/src/event-editor/right-pane/ai/systemPromptForViewer.ts` is a static per-viewer
   preamble lookup (id/label/body, `:46-59`, switch at `:159-184`). It has no protocol
   block and is not the injection site; it only supplies `systemPromptId/body` that ride
   in the context (`AiTabPanel.tsx:233-234`). The context warmed at
   `AiTabPanel.tsx:396` (`warmAiContext(context, history, systemPrompt.id)`) uses the same
   protocol-less context, so warm and real requests are equally blind.

**PROTO-AI-6 edit site (recommended by this trace):** add an
`attachedProtocol?: { recordId; title?; steps: [{stepId, ordinal, label, kind,
description?}]; roles: {labwareRoles/instrumentRoles incl. expectedLabwareKinds} }` field
to `EditorContext` (`server/src/ai/types.ts` ~`:403-422`), a
`formatAttachedProtocol(context)` appender inside `extraContexts`
(`server/src/ai/systemPrompt.ts:464-470`), and populate it in the app-side context
builder (`app/src/event-editor/right-pane/ai/AiTabPanel.tsx:167-258`, which must lift the
attached-protocol payload already fetched by the protocol rail —
`ProtocolTabPanel.tsx:1000-1005,1113-1147` resolves run → plannedRunRef → protocolRef;
`ChatContextHeader.tsx:5-15` reads the same selection for its label only).

---

## (e) CHANGESPANEL contract

What the panel reads TODAY (`app/src/event-editor/right-pane/ai/ChangesPanel.tsx:3-63`):
- props `{ changes: EventGraphChange[]; warnings: ValidationGap[]; onApply; onDiscard }` (`:3-8`)
- per-change it reads ONLY `change.op` (prefix `+`/`-`/`~`, `:35-39`) and
  `change.description` (`:40`); `warnings[].severity` drives a class (`:23`) and
  `.message` renders (`:25`).
- `EventGraphChange = { op: 'add'|'modify'|'remove'; description: string; eventId?: string }`
  — `app/src/event-editor/right-pane/ai/sidebarState.ts:23-27` (`eventId` is NOT read by
  the panel).
- `ValidationGap = { code; message; severity }` — `sidebarState.ts:29-33`.
- The reviewing state carries `{ draftId, interpretation, changes, warnings, terms? }` —
  `sidebarState.ts:38-58`; reducer `draft-ready` `:123-131`.
- Mount site: `AiTabPanel.tsx:759-772`; **`onApply` is hardcoded to
  `sidebarDispatch({type:'commit'}) + editor?.actions.commitPreview()`** (`:764-767`) —
  an event-graph-only apply. Any protocol-edit proposal must branch here.
- Where changes come from today: `changesFromDraftEvents(draftedEvents)` at
  `AiTabPanel.tsx:280` (draft events → flat descriptions).

**Minimum additive contract (proposal only — do not implement):** keep `EventGraphChange`
byte-identical so event-graph review cannot break; add an OPTIONAL sibling to the
reviewing state and let the panel (or a sibling `ProtocolChangesPanel`) render it when
present. Type shape:

```ts
// sidebarState.ts additions — all optional, so every existing dispatch compiles unchanged
export type ProtocolStepKind = 'add_material'|'transfer'|'mix'|'wash'|'incubate'|'read'|'harvest'|'other'

export interface StepFieldBeforeAfter {
  label?: string
  description?: string            // step text (plain; descriptionRichText is app-only, see note)
  kind?: ProtocolStepKind
  settings?: Setting[]            // shape = (c)(1); settings identity by settingId
  ordinal?: number                // position: proposed 1..N ordinal after apply
}
export interface RoleBeforeAfter {
  roleId: string
  description?: string
  expectedLabwareKinds?: string[] // schema/workflow/protocol.schema.yaml:424-435
}
export interface ProtocolEditOp {
  op: 'add' | 'modify' | 'remove'
  target:
    | { type: 'step'; stepId: string }
    | { type: 'role'; roleKind: 'labwareRoles' | 'instrumentRoles' | 'materialRoles'; roleId: string }
  before?: StepFieldBeforeAfter | RoleBeforeAfter   // absent for op:'add'
  after?:  StepFieldBeforeAfter | RoleBeforeAfter   // absent for op:'remove'
  position?: { anchorStepId: string; relative: 'before' | 'after' }  // add: matches insertProtocolStep's anchor model
}
export interface ProtocolEditDiff {
  protocol: { recordId: string; title?: string }    // target protocol named
  ops: ProtocolEditOp[]
}
// AiSidebarState 'reviewing' gains:   protocolDiff?: ProtocolEditDiff
// SidebarAction 'draft-ready' gains:  protocolDiff?: ProtocolEditDiff
```

Why this is the minimum:
- `EventGraphChange`, `ValidationGap`, reducer modes, `isChatEnabled`,
  `primaryActionLabel`, `headerLabel` (`sidebarState.ts:148-176`) all stay untouched;
  event-graph drafts keep dispatching exactly as at `AiTabPanel.tsx:276-284`.
- Warnings reuse `ValidationGap` unchanged; `changes` can stay `[]` for a pure
  protocol-edit proposal (the reviewing mode already tolerates it, see the
  `interpretation: { operations: [] }` precedent at `AiTabPanel.tsx:279`).
- The only behavioral hook is `onApply` branching at `AiTabPanel.tsx:764-767`:
  `protocolDiff ? applyProtocolOps(...) : commitPreview()`.
- Per-op before/after + `position` covers exactly the review surface the spec names
  (step text, kind, settings, position, role add/update/remove incl.
  expectedLabwareKinds); renderer can reuse the `+ / ~ / -` prefix convention
  (`ChangesPanel.tsx:37-39`).
- NOTE: the human editor persists a `descriptionRichText: { plainText, document }`
  companion with every text edit (`ProtocolStepEditModal.tsx:89-91`). That key is NOT in
  the protocol schema (`grep -c descriptionRichText schema/workflow/protocol.schema.yaml`
  → 0; tolerated only because `ProtocolStep` itself does not set
  `additionalProperties: false`, `schema/workflow/protocol.schema.yaml:749-751` — the
  kind-specific sub-schemas do close their own objects, e.g. `:869,877`). If a
  protocol-edit op changes step text it must keep plain and rich in sync or accept a
  schema-lint conversation in PROTO-AI-2; the diff type above intentionally carries only
  `description` and should state "rich text derived, not proposed".

---

## Open questions (carried forward, with findings)

1. **Gate client-only on step endpoints AND absent on whole-record PUT?** YES —
   the executed-step-delete gate: enforced route-side only on
   `DELETE /steps/:stepId` (`protocol-steps.ts:502-509`), **absent** from
   `PUT /records/:id`; the human delete path uses the PUT and relies on
   `protocolStepEditing.ts:80-81`. This is PROTO-AI-5 work-list item #1. Secondary:
   stepId-duplicate check absent on PUT (gap 4 in (a)); ≥1-step survives only via Ajv
   `minItems` with a false-200 on the step endpoints (result-discard bug, (a) preamble).
2. **Does an attached-protocol context block exist today?** NO — absent entirely;
   the only protocol-adjacent injections are the single-step
   `protocolStepContext` (`systemPrompt.ts:478-490`) and local-protocol setup rows
   (`:499-525`). PROTO-AI-6 creates the block at the three sites named in (d).
3. **Are `insertProtocolStep`-minted ids collision-checked against existing stepIds?**
   Client-side YES (`protocolStepEditing.ts:67`); server-side only on
   `POST /steps` (`protocol-steps.ts:426-429`), never on whole-record PUT (no schema
   `uniqueItems` on `steps`, `schema/workflow/protocol.schema.yaml:301-307`).
4. **NEW — false-200 class:** every mutation in `protocol-steps.ts` except the subgraph
   POST ignores `store.update`'s result (`:367,452,518,684`). Should PROTO-AI tasks route
   AI writes through these endpoints or through PUT + dedicated guards? (PUT surfaces real
   422s; endpoints don't.)
5. **NEW — `{{EXECUTION_CONTEXT}}` placeholder** exists in
   `server/prompts/event-graph-agent.md:97` but has no replacer in
   `buildSystemPrompt` (`server/src/ai/systemPrompt.ts:455-462`) — dead placeholder;
   decide whether PROTO-AI-6 fills or removes it.
6. **NEW — `read`-step settings contradiction** between base array-settings
   (`schema/workflow/protocol.schema.yaml:823-829`) and `StepRead.settings` object
   (`:1004-1007`) needs one authoritative answer before op-envelope settings validation is
   authored.
7. **NEW — server executed-check is `startedAt`-only** (`protocol-steps.ts:503`) while the
   client also honors `completedAt` (`protocolStepEditing.ts:81`); pick one rule for the
   AI path (recommendation: the stricter client rule).

## No-product-code-change attestation

Only file created: `.hermes/plans/PROTO-AI-1-grounding-map.wip-l2t2215.md` in the worker
worktree. No git commands run against the tree (HEAD read once via `git log --oneline -1`
for tree identification; no add/commit/checkout). No dev-stack restart; only GET requests
to `:3093`. Shared checkout `/mnt/vast/home/brad/git/computable-lab` and ports
`:3001/:5174` untouched.
