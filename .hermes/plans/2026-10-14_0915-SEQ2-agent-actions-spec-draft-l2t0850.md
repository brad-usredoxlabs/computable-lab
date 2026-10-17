# HARNESS-SEQ-2 SPEC DRAFT — l2t0850 composer (NOT canonical; orchestrator reviews + promotes)

Item: HARNESS-SEQ-2 — "The chat drives the sequences surfaces: YAML-declared agent actions,
Ajv-validated frames, tab-aware open-surface (plan Phase 3)".
Source plan: `.hermes/plans/2026-10-11_100213-unified-harness-chat-sequences.md` (Phase 3;
constraints #2 collision, #4 AccessControlService, #6 vocabulary doors).

## Status of the ground at draft time (2026-10-14 ~09:45 EDT)

- Trunk `cl/integration-2` tip is **bf321c4c**, and **HARNESS-SEQ-1 is ALREADY MERGED**
  (merge commit 22d0bb00, zero code delta beyond eb1821e9 per the l2t0850 addendum). The
  dispatch brief said "SEQ-1 awaiting merge" — that moved while I composed. All line numbers
  below are re-anchored on the post-SEQ-1 working tree (verified `git status` clean under
  app/src/sequences and app/src/agent). **The SEQ-1 dependency is satisfied at bf321c4c.**
- Live fleet still queued ahead of this coder: W29-G2DFIX5 (fleet lock holder) and
  SHORTHAND-COMP-4 (chained). Both collide in ways named in the Collision section; the
  dispatch should branch off the trunk tip AT DISPATCH TIME, not off bf321c4c blindly.
- MANIFEST blob check (first-hand): `git rev-parse HEAD:server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
  = `83fda3b42519eed879bc5e49290e724f727be509` — matches the brief.

## Goal (one sentence)

Let the unified harness chat on `/lab/sequences` drive the surface — switch its tabs and
select library records — through declarative `agent_action` frames that the server compiles
and Ajv-validates through the EXISTING `workspace_action` seam (never a parallel emission
path), with the client executing them through the same navigation paths human clicks use
(honoring `canLeave()`), and with drafting preserved for authoring turns.

## Ground-truth findings (all verified first-hand at bf321c4c; scout output used for
screening only and marked where independently confirmed)

1. **The emission seam already exists and is surface-agnostic.** PB-CH-1's
   `workspace_action` intent + `compileWorkspaceAction.ts` is the ONE `agent_action`
   emitter: dispatch branch `server/src/ai/AgentOrchestrator.ts:2578`, emission
   `onEvent?.({ type: 'agent_action', action: compiled.action })` at `:2594`, refusal =
   `pipeline_diagnostics` with zero action (branch comment `:2566-2577`). The compiler
   (`server/src/ai/compileWorkspaceAction.ts`) validates the raw proposal against the
   registered agent-action $id (`:50 AGENT_ACTION_SCHEMA_ID`, envelope files `:55` —
   `workflow/agent-action.schema.yaml` + `core/datatypes/ref.schema.yaml`), checks surface
   membership against the DECLARATIVE registry with no TS allow-list (diagnostic codes
   `:164-171`), store-verifies record ids, resolves TERMS through `resolveSpine` filtered to
   `LOCAL_TIERS [0,1]` with the mint-affordance guard (`:233`, `:239`), rewrites
   `target.label` with the authoritative label, and RE-validates. It never emits and never
   writes (module doc `:1-36`).
2. **The forced tool on sequences ALREADY includes `workspace_action` in its menu.**
   `buildAgentIntentToolDef` carries the full intent enum
   (`server/src/ai/submitSuggestionTool.ts:453` — includes `workspace_action`); the
   sequences surface clones that same def and only PUSHES `sequence_action` onto the enum
   (`server/src/sequences/sequenceIntent.ts:5-7`, applied at
   `AgentOrchestrator.ts:1050`, def built at `:1028`). So SEQ-2 is NOT a tool-menu change —
   it is a guidance + schema-target + client-handler change.
3. **forceDraftTool on current trunk** (re-verified per dispatch_gate, NOT the 455232cf
   numbers): `AgentOrchestrator.ts:1081` (buildPrefixRequest) and `:1144` (run) —
   `surface === 'sequences' ? true : request.forceDraftTool ?? …`. Forced means
   `tool_choice` pins a call to the agent_intent tool
   (`:1124-1126`, `:1682`), and `FORCED_DRAFT_TOOL_INSTRUCTION` (`:512-533`) is pushed for
   every forced turn (`:1105`). The sequences guidance block is `:1097-1101` — it says
   "Use agent_intent with intent=sequence_action …" and says NOTHING about navigation
   intents. The no-tool-call repair loop for sequences (`:1958-1966`) and the
   `sequence_action` validation-failure repair (`:2223-2241`) both force the model back
   toward `sequence_action`. Net effect today: a "switch to the Analysis tab" turn is
   guided into `sequence_action`, fails `decodeSequenceAction`/validation, repairs twice,
   and dies with "I could not prepare a valid sequence proposal." — even though a
   schema-valid `workspace_action` would flow through `:2578` and emit TODAY (the dispatch
   branch is not surface-gated).
4. **The client already parses the frame but sequences does not consume it.**
   `app/src/shared/hooks/useAiChat.ts:186` accepts `onAgentAction?: (action:
   AiAgentActionEnvelope) => string | undefined`; frame handling at `:577-599` — a returned
   diagnostic string is appended as a system message ("Nothing was written."), and WITH NO
   handler registered the fallback message is "this page cannot apply workspace actions
   yet" (`:595-599`). Envelope types: `app/src/types/ai.ts:115-125`.
   `SequencesPage.tsx` passes **zero** `onAgentAction` (grep count 0; `useAiChat({...})` at
   `:41`). AnalysisChatPanel / AiTabPanel / PdfProtocolBuilder already ride
   `flow.handleAgentAction` (`app/src/shared/ai/useWorkstateProposalFlow.ts:179-204`) —
   that flow is the RUN-DECK executor (workstate tab store); sequences must NOT reuse it
   (it routes to OpenTabsContext/deck surfaces), but it is the shape precedent: a handler
   that returns a named diagnostic, never a guess.
5. **Human navigation paths on the post-SEQ-1 SequencesPage** (trunk lines): tabs const
   `app/src/sequences/SequencesPage.tsx:15` (`['Editor','Assay','Analysis','Setup','Import','Knowledge']`),
   tab buttons `:107` (`onClick={()=>setTab(t)}` — plain `setTab`, NOT guarded),
   `selectRecord` `:52` (`if(editorRef.current?.canLeave()===false)return;setSelected(id);setTab('Editor');setOligoSequence(id)`
   — the guard is on RECORD SELECTION only), Library click `:53` routes through
   `open→selectRecord`. `canLeave` definition:
   `app/src/sequences/SequenceEditor.tsx:56` (`!controller.state.saving && !controller.state.incomplete`),
   handle type `:8`. SEQ-1's pane is mounted `rightPane={<HarnessChatPane onReviewProposal={onSequenceProposal}/>}`
   (`SequencesPage.tsx:113`), focus published via `ChatFocusProvider` (host-derived), chat
   registered `:41`.
6. **YAML contracts, actual paths** (plan's hypotheses confirmed):
   `schema/workflow/agent-action.schema.yaml` (51 lines; `action` enum `focus|open-surface`
   `:17-22`; `target.oneOf` = protocol-step arm `:28-35` + `$ref` to
   `schema/core/datatypes/ref.schema.yaml` `:37` — that Ref datatype requires only `kind`
   (`:8-10`, kind enum `[record, ontology]` `:12-13`), so a TERM `{kind:'record',label:'…'}`
   already passes the envelope and is resolved server-side. `additionalProperties:false` at
   the envelope root `:12` (targets each carry their own). No sequences-specific target arm
   exists. Server test: `server/src/schema/AgentActionSchema.test.ts`.
   `schema/registry/surfaces/surfaces.yaml:92-97` declares `sequences`
   (`path "/sequences"`, objectTypes sequence/oligo-spec/assay-definition/analysis-run,
   selectableKinds sequence/sequence_interval/oligo-spec). Its meta-schema
   `schema/registry/surfaces/surfaces.schema.yaml` has per-surface `additionalProperties:
   false` (`:28`) with exactly these keys allowed: id/label/path/params/paths/objectTypes/
   selectableKinds/aiRole/aiEndpoint (`:29-76`), and a closed surface-id enum (`:33`).
   Interpreter `server/src/surfaces/surfaces.ts` (`SurfaceSpec :15-29`) DROPS unknown keys
   and throws on schema-invalid docs at boot; registry loaded boot-time
   (`server/src/server.ts:1168`, served `GET /api/surfaces`
   `server/src/api/routes/surfaces.ts:19`). **No `tabs`/`capabilities` key exists anywhere**
   (scout-c screened this; meta-schema read first-hand).
7. **Policy door, actual shape.** Reads on the sequences routes filter per record:
   `server/src/sequences/sequenceRoutes.ts:17`
   (`ctx.authorizationService.canAccess(user,'read',r)`); writes/reads inside
   `SequenceService.ts:23,48,92` (`canAccess` read/write + `ensureOwnerPolicy`). The door is
   `AuthorizationService.canAccess` `server/src/security/AuthorizationService.ts:102-107` →
   `AccessControlService.canAccess` (scout-a's chain; verified first-hand at :102-107).
   deck_layout and scientist-intent do NOT check policy inside the orchestrator — they are
   propose-only and the ordinary write paths (with the resolved actor) enforce at apply
   time. The assist turn ALREADY resolves the request user before the run:
   `server/src/api/handlers/AIHandlers.ts:455-461` (`resolveLedgerActor` seam, PB-CH-8),
   carried on `AgentRequest.ledgerActor` (`server/src/ai/types.ts:174-216`). The
   workspace_action compiler currently store-verifies against the UNFILTERED
   `ctx.store` (`server/src/server.ts:1155`) — a visibility check on navigation targets is
   the ONE genuine policy addition (see design + OQ2).
8. **MANIFEST/goldens scope check.** `server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
   treeState pins EXACTLY three files: `schema/scientist-intent/scientist-intent-vocabulary.yaml`,
   `schema/workflow/scientist-intent.schema.yaml`,
   `schema/registry/compile-pipelines/scientist-intent-compile.yaml`. **None of SEQ-2's YAML
   (agent-action.schema.yaml, surfaces.yaml, surfaces.schema.yaml) is pinned** → SEQ-2 needs
   NO MANIFEST re-bless. The re-hash trip is
   `goldenIntentToGraph.test.ts` `manifestHashMismatches` (`replayKernel.ts:375-386`)
   (scout-b; treeState contents read first-hand).
9. **Vocabulary doors are already the compiler's own mechanism**: term targets resolve
   through `resolveSpine` (the noun spine), tiers [0,1], mint filtered
   (`compileWorkspaceAction.ts:233-243`). SEQ-2 must NOT add label-matching code anywhere.
   Caveat: the boot spine's record provider is kind-restricted by the workstate tab-kind
   mapping (`server/src/server.ts:1181-1184` region), so an arbitrary sequence-record TERM
   may honestly return `UNRESOLVED_TERM`. The sequences chat already injects every catalog
   record `{id,kind,label}` into `surfaceContext.records`
   (`SequencesPage.tsx:39`) — same PROTO-AI-6 discipline: the model cites REAL ids from
   injected context; the compiler store-verifies them.

## The exact YAML delta

### A. `schema/workflow/agent-action.schema.yaml` — two additions to `target.oneOf`

```yaml
    # Sequences workspace: switch the surface's in-page tab (validated against the
    # DECLARED tab list at compile time; the schema enum is a fast fence kept in
    # lockstep by a compatibility test — see surfaces.yaml `tabs`).
    - type: object
      required: [ kind, tab ]
      properties:
        kind: { const: sequence-tab }
        tab: { enum: [ Editor, Assay, Analysis, Setup, Import, Knowledge ] }
      additionalProperties: false
    # Sequences workspace: focus/select a sequence-domain record by real id (the
    # compiler store-verifies; label is overwritten authoritatively).
    - type: object
      required: [ kind, recordId ]
      properties:
        kind: { const: sequence-record }
        recordId: { type: string }
        label: { type: string }
      additionalProperties: false
```

Do NOT touch the existing protocol-step arm or the `$ref` arm; do not add `surface`
requirements beyond the existing optional `surface` property (`:39-41`). The Ref `$ref`
arm already covers term-based record resolution — the `sequence-record` arm is for the
model citing a real catalog id from injected context.

### B. `schema/registry/surfaces/surfaces.yaml` — declare the tabs (data, single source)

Under the `sequences` entry (`:92-97`):

```yaml
    tabs: [ Editor, Assay, Analysis, Setup, Import, Knowledge ]
```

### C. `schema/registry/surfaces/surfaces.schema.yaml` — permit the new key

Add to the per-surface properties (`:29-76`, alongside aiRole/aiEndpoint):

```yaml
        tabs:
          type: array
          minItems: 1
          items: { type: string, minLength: 1 }
          description: >-
            In-page tab vocabulary a harness chat may drive via a sequence-tab style
            target. DECLARED here; the agent-action schema fence and any page-side
            constant must match this list (compatibility-tested, drift fails loud).
```

`additionalProperties: false` (`:28`) STAYS — without step C the boot loader throws
(verified: `surfaces.ts` validates against this meta-schema via `assertValidRegistry`).
The `id` enum (`:33`) is unchanged (no new surfaces).

Compatibility test (server, RED-first): the `sequences` entry's declared `tabs` in
surfaces.yaml, the agent-action schema's `sequence-tab.tab` enum, and
`SequencesPage.tsx`'s `tabs` const must be set-identical (the plan's risk-5 stopgap made
mechanical — YAML is king, the page const is the thing checked against it).

## Server emission design (reuse, never a parallel path)

1. **Intent**: `workspace_action` via the EXISTING forced agent_intent tool. No enum,
   tool-def, or `tool_choice` change (finding 2). Emission type: the `agent_action`
   stream frame, emitted ONLY from the `AgentOrchestrator.ts:2578` branch after
   `compileWorkspaceAction` returns `ok` — the ONE emit path pin (`:2594`) stays true.
2. **Schema validation point**: unchanged — inside `compileWorkspaceAction` (envelope
   validate `→ resolve → rewrite label → re-validate`), Ajv sole authority. New target
   arms validate automatically because the compiler validates against the registered $id.
3. **Compiler additions (minimal, in `compileWorkspaceAction.ts`)**:
   - Resolve `sequence-tab`: valid iff `tab` is in the DECLARED `tabs` list of the
     `sequences` registry entry (registry read through the already-injected
     `SurfacesRegistry`; requires the interpreter to pass `tabs` through `SurfaceSpec` —
     a data passthrough, zero policy in TS). Unknown/undeclared tab → diagnostic
     (`UNSUPPORTED_TARGET` class — extend `WorkspaceActionDiagnosticCode`, reuse the
     `pipeline_diagnostics` channel, never invent a new channel).
   - Resolve `sequence-record`: store-verify `recordId` via `deps.store.get` (the
     existing UNKNOWN_RECORD arm); authoritative label = recordLabel(). NO kind allow-list
     in TS (the store answer is the check; kinds are catalog reality).
   - Visibility (policy): see OQ2; recommended shape — optional
     `visibility?: (record: {recordId:string}) => Promise<boolean>` on
     `WorkspaceActionCompilerDeps`, wired at `AgentOrchestrator.ts:2580` from
     `request.ledgerActor` + `deps.authorizationService`; absent ⇒ skip (existing stub
     tests unchanged); present and false ⇒ new diagnostic code `TARGET_NOT_VISIBLE`
     with an explainable message, zero action. This rides
     `AuthorizationService.canAccess(actor,'read',record)` — the SAME door as
     `sequenceRoutes.ts:17` — not a parallel policy.
4. **Guidance (the forceDraftTool relaxation, correct form)**: the boolean at
   `:1081/:1144` STAYS `true` for sequences — every turn must remain a structured
   emission; relaxation means the sequences turn may satisfy itself with
   `workspace_action` instead of `sequence_action`. Implement as TEXT in the sequences
   guidance block (`AgentOrchestrator.ts:1097-1101`), one bullet, e.g.: "To switch this
   page's tab or show an existing record, use intent=workspace_action with the matching
   sequence-tab / sequence-record target — it drafts nothing and writes nothing. Use
   intent=sequence_action only for proposals (save/annotate/analyze)."
   Do NOT edit `FORCED_DRAFT_TOOL_INSTRUCTION` (`:512-533`) — W2-9 g2dfix cycle-5 is
   actively adjudicating arms in that block's vocabulary wall; touching it guarantees a
   collision and a review-cycle reopen.
   No keyword routing is added anywhere: the MODEL chooses the declared intent; the
   orchestrator dispatches by intent, never by prompt text (repo rule: no
   surface-name/keyword policy branches for the new behavior — the existing
   `surface==='sequences'` guidance-block site is the only place the new text rides, and
   it is prompt-data, not policy).
5. **What must NOT change**: the `sequence_action` branch (`:2223-2241`), its repair
   loop, `onSequenceProposal` handoff semantics, `save_sequence`/`create_oligo` →
   editor-draft behavior, and every non-sequences intent branch.

## Client handler design

- **New pure module** `app/src/sequences/applyAgentAction.ts`:
  `applyAgentAction(action: AiAgentActionEnvelope, state: { tabs: readonly string[]; selected: string; visible: RecordItem[] })`
  → `{ ok: true; message?: string } | { ok: false; reason: string }`, plus
  `effects: { setTab?: Tab; selectRecordId?: string }`. Pure: it decides, it never
  navigates. No fetches, no model calls, no policy.
- **Mount**: `SequencesPage.tsx` — pass `onAgentAction` into the EXISTING
  `useAiChat({...})` at `:41` (the option already exists, `useAiChat.ts:186`). The
  handler executes via THE SAME paths a human click uses (harness plan §5.1):
  - `sequence-tab` → `setTab(t)` (matching the unguarded tab buttons `:107` — human tab
    clicks are not draft-guarded today and the agent must not be stricter or looser);
  - `sequence-record` → call the page's `selectRecord(recordId)` (`:52`) — the guard is
    inherited structurally, not reimplemented — AND return the diagnostic string when the
    navigation did not happen (`editorRef.current?.canLeave() === false`, same `===false`
    strictness) so the chat says honestly: "You have an unsaved sequence draft — save or
    discard it in the Editor first. Nothing was changed." The human path stays silent as
    today; only the agent path must speak (useAiChat renders the returned string as a
    system message, `:577-585`).
  - Unknown target kind / unknown surface / unroutable action → return a named
    diagnostic string, ZERO state change (the `useWorkstateProposalFlow.handleAgentAction`
    discipline: "an unroutable frame is a NAMED diagnostic, never a guess").
  - `contextNote` may be appended to the chat as annotation but the focus header stays
    derived from resolved state (`ChatFocusContext` publishes from `tab`/`selected`, so a
    successful navigation moves the header with no extra wiring, no AI-label override).
- **Tab-aware open-surface** (this pass): `open-surface` with `surface: sequences` +
  `sequence-tab`/`sequence-record` target resolves WITHIN the mounted sequences surface
  (it is a single route, App.tsx routes `/sequences` + `/lab/sequences`; there is no
  per-project tab store to consult — that is the run workspace's OpenTabsContext, Phase
  4's cross-surface scope, explicitly NOT here). The handler is written so a future
  OpenTabsContext resolver can be another executor behind the same envelope.
- **Zero-policy-in-code law**: the handler branches on TARGET KIND (the contract's own
  discriminated union), never on surface names, tab names, or labels. The tab list it
  validates against comes from the page's declared/compat-tested const (OQ1).

## forceDraftTool re-verification (mechanism + where to test)

- Mechanism today (POST-SHORTHAND-COMP trunk, NOT 455232cf): `:1144` forces
  `tool_choice = {function: agent_intent}` for sequences; `:1105` appends
  `FORCED_DRAFT_TOOL_INSTRUCTION`; `:1097-1101` appends sequences guidance naming ONLY
  `sequence_action`; no-tool-call → sequences repair (`:1958-1966`) → honest failure
  string `:1965`; `sequence_action` invalid → repair twice (`:2229-2240`) then
  `success:false`. There is no path today where a sequences turn answers with
  `agent_action` (the branch would run — but the model is never told `workspace_action`
  exists on this surface, and the `EVENT-EDITOR DRAFT MODE` instruction pushes it toward
  draft verbs).
- "save this sequence GGATG…" must STILL produce `sequenceProposal`
  (`:2240 return { sequenceProposal … }` → `onSequenceProposal` → Editor draft /
  review textarea). "open the Analysis tab" must produce an `agent_action` frame,
  `success:true` with notes and ZERO `sequenceProposal`, ZERO store mutations, ZERO
  `/sequences/actions` POSTs.
- Where to test it: the REAL-MODEL check is `AgentOrchestrator.workspaceAction.test.ts`
  neighbor `AgentOrchestrator.sequencesAgentAction.test.ts` (new): scripted tool-call
  responses (intent=workspace_action, action={action:'open-surface',surface:'sequences',
  target:{kind:'sequence-tab',tab:'Analysis'}}) assert `agent_action` emitted + spy on
  store/deps proves zero mutations + zero sequenceProposal; and the regression arm
  (intent=sequence_action valid) still yields `sequenceProposal` with zero
  `agent_action`. The prompt-level half (does the model actually pick the right intent)
  is proven by the one-real-model criterion at the browser gate + the first targeted
  check below — do NOT fake it with keyword tests.

## First targeted check (run this before building anything else)

With the lane stack up on trunk tip (post-YAML restart), capture a real navigation turn
against the seam, e.g. against a catalog sequence id taken from
`curl -s localhost:3093/api/sequences/catalog`:

```
curl -sN -X POST localhost:3093/api/ai/assist/stream -H 'content-type: application/json' \
  -d '{"prompt":"focus on record <REAL-SEQ-ID>","surface":"sequences","context":{"surface":"sequences","summary":"Sequence workspace — Editor","surfaceContext":{"records":[{"id":"<REAL-SEQ-ID>","kind":"sequence","label":"<LABEL>"}]}}}'
```

Expected AFTER the schema delta + restart: an SSE `agent_action` frame for the
focus/record target (the Ref arm already validates it), or an honest
`pipeline_diagnostics` refusal naming why — BOTH outcomes prove the seam routes sequences
turns through `:2578`. Run it a second time BEFORE the schema delta with a
`sequence-record` target in the prompt vocabulary to observe the today-behavior
(repair-loop death) that the guidance fix removes. If the branch never fires for
surface=sequences, STOP and report — that falsifies the core design assumption.

## Acceptance criteria (VERBATIM from the task list)

> One real local-model conversation switches the sequences tab and selects a record through an
> Ajv-validated agent_action frame; an invalid action changes nothing and says why; regression
> test proves drafting still happens for "save this sequence" while pure navigation drafts
> nothing; canLeave() block honored. Browser gate :5193; VERDICT: accept.

## In scope / out of scope (exact paths)

IN: `schema/workflow/agent-action.schema.yaml`; `server/src/schema/AgentActionSchema.test.ts`;
`schema/registry/surfaces/surfaces.yaml`; `schema/registry/surfaces/surfaces.schema.yaml`;
`server/src/surfaces/surfaces.ts` (+ its test) — `tabs` passthrough ONLY;
`server/src/ai/compileWorkspaceAction.ts` (+`.test.ts`) — new target arms, optional
visibility hook, new diagnostic codes; `server/src/ai/AgentOrchestrator.ts` — sequences
guidance bullet (`:1097-1101`) + compiler-dep wiring at the `:2578` branch ONLY; new
`server/src/ai/AgentOrchestrator.sequencesAgentAction.test.ts`;
`app/src/sequences/applyAgentAction.ts` (+test); `app/src/sequences/SequencesPage.tsx`
(pass `onAgentAction`, reuse selectRecord/setTab); `app/e2e/sequences-harness-chat.spec.ts`
(extension of SEQ-1's own spec); tab-list compatibility test (server-side, file alongside
the surfaces registry tests).

OUT (hard): `FORCED_DRAFT_TOOL_INSTRUCTION` and `server/src/ai/submitSuggestionTool.ts`
(no enum/menu change); `server/src/ai/coerceAgentIntent.ts` (COERCION-PINS territory);
`schema/scientist-intent/*` (COMP-4's file — COLLISION); `server/src/ai/shorthandChat.ts`;
`app/src/shared/ai/useWorkstateProposalFlow.ts` (deck executor — consume NOTHING from it
beyond reading its shape); `useAiChat.ts` (the seam already exists — zero edits; if a
real gap appears, it is an open question, not a silent edit); `AgentChatPane.tsx`,
`ReviewAiPanel`, `ChatContextHeader` (run side stays byte-identical);
`app/e2e/three-pane-harness.spec.ts` (must stay UNMODIFIED and green); OpenTabsContext /
cross-surface 16S resolution (Phase 4, gated); capability-declaration grammar
(`requires/effect/reviewPolicy` — Phase 4a, OQ4); `MANIFEST.yaml` (nothing SEQ-2 touches
is pinned — finding 8; re-blessing it is FORBIDDEN churn); any write path, any new
endpoint, any new emission type, any second validator.

## Verification commands (with expected output)

- RED first (before code): `cd app && npx vitest run src/sequences/applyAgentAction` →
  module-missing RED; `npm run test:run -w server -- src/schema/AgentActionSchema.test.ts
  src/ai/compileWorkspaceAction.test.ts` → new arms RED, existing green.
- Server targeted GREEN: `npm run test:run -w server -- src/schema/AgentActionSchema.test.ts
  src/ai/compileWorkspaceAction.test.ts src/ai/AgentOrchestrator.workspaceAction.test.ts
  src/ai/AgentOrchestrator.sequencesAgentAction.test.ts src/surfaces` → ALL PASS, 0 failed.
- Server regression neighbors (g2dfix/COMP pins): `npm run test:run -w server --
  src/ai/AgentOrchestrator.shorthandChat.test.ts src/compiler/scientistIntent` → green,
  MANIFEST trip silent (finding 8). Full lane battery: `npm run test:run -w server` —
  failing-FILE SET must equal the re-measured base set (`.hermes/raws/base-*-failfiles.txt`
  discipline), zero new files.
- App unit: `cd app && npx vitest run src/agent src/sequences` → all green; and
  `cd app && npx vitest run src/event-editor/right-pane/ai src/run` → unchanged green.
- Typecheck: `npm run typecheck -w server && npm run typecheck -w app` → sorted error-line
  set-diff vs base == empty (app baseline ~23 lines per l2t0850 handoff; re-measure on
  the branch base, never reuse stale counts).
- e2e (rule 12): `cd app && npx playwright test e2e/sequences-harness-chat.spec.ts
  e2e/three-pane-harness.spec.ts --project=chromium` → all pass, the second file's
  assertions UNMODIFIED (diff-proof: `git diff` shows zero hunks in it).
- YAML reload trap: after ANY schema/surfaces YAML delta, `cl-lane-stack.sh 2 restart`
  runs with background=true (the restart is BLOCKING — prior pitfall) before testing;
  `tsx --watch` does NOT reload YAML and `compileWorkspaceAction`'s validator is a
  module-scope singleton.

### Browser-gate criteria (phrase for :5193, candidate = post-merge tip; verify served checkout first)

Leg 1 (real model, profile qwen3.8-thunderbeast active via the product route — check for
drift first): in ONE conversation at `/lab/sequences` ask
"switch to the Analysis tab" → the Analysis panel becomes visible, the chat focus header
reads the Analysis focus, the chat records an honest action line; trail contains the
`/api/ai/assist/stream` POST. Leg 2: name a REAL Library record ("show me <label>") →
Editor tab active with that record selected (Library/Editor evidence), focus header
follows. Leg 3: "save this sequence <bases>" → a proposal lands in the editor draft /
review textarea (NOT chat prose). Leg 4 (negative): a turn that yields an invalid or
unroutable action (or a record id that doesn't exist) → NO tab/selection change
(pre/post rects or aria-pressed proof) + an explainable line. Leg 5 (canLeave): with the
editor holding an unsaved/incomplete draft, request a record switch → blocked with an
honest message, draft intact. Zero-writes proof across the gate: no `POST
/sequences/actions` in the backend trail during legs 1-2 and 4-5 (propose-never-write).
VERDICT: accept with orch-viewed receipts is the gate.

The gate may NOT expect: a live clarification turn (AS-LANE2-SEQ1-CLARIFICATION-STUB-DEPTH
carries); cross-project/cross-surface tab opening or the 16S-alignment scenario (Phase 4);
any run-workspace header/pane change; an Analysis RUN being executed by any leg; a
proposal card for navigation; capability/setup suggestions from the server (Setup is only
an honest refusal target); tab labels beyond the six declared; any second chat panel or
validator.

## Worker contract

- Worktree `wt/HARNESS-SEQ-2-lane2-<ts>` off the trunk tip AT DISPATCH TIME (must already
  contain 22d0bb00; if g2dfix5/COMP-4 merged first, fine — re-anchor lines then); branch
  `cl/HARNESS-SEQ-2-lane2-<ts>`.
- Deliverables (unique paths): report
  `.hermes/plans/reports/HARNESSSEQ2-report.wip-l2t<ts>.md`; end marker
  `HARNESS-SEQ-2 DONE <sha>`; log `logs/coder-HARNESS-SEQ-2-l2t<ts>.log`; battery raws
  under `.hermes/raws/` names prefixed `seq2-<ts>-`.
- Commits: RED test commit, feat commits per concern (YAML+schema tests first, then
  compiler, then guidance+orchestrator, then client), report last (docs-only).
- Stack restart REQUIRED after YAML deltas (background!), and re-verify `:5193` serves the
  post-restart tip before any self-check in the browser.

## Collision notes (mid-flight lanes)

- **W29-G2DFIX5** (fleet lock, review write-wall YAML vocabulary): collides ONLY if SEQ-2
  touches `FORCED_DRAFT_TOOL_INSTRUCTION` or `schema/scientist-intent/*` — both banned
  above. Its merge may move AgentOrchestrator.ts line numbers around the guidance block;
  re-anchor at dispatch.
- **SHORTHAND-COMP-4** (composition vocabulary arg): touches
  `schema/scientist-intent/scientist-intent-vocabulary.yaml` (→ legitimately moves the
  MANIFEST blob from 83fda3b4 — that is THEIRs to bless, never SEQ-2's),
  `resolutionEngine.ts`, normalize/realization. SEQ-2 consumes `resolveSpine` behavior but
  changes none of it; if COMP-4's tier behavior shifts, SEQ-2's compiler tests (stubbed
  spine, per `compileWorkspaceAction.test.ts` precedent) must not hard-assume spine tier
  details. ORDERING: if SEQ-2 branches before COMP-4 merges, the eventual trunk merge may
  touch MANIFEST on their side only — SEQ-2 must not add treeState entries, so no bless
  conflict is possible.
- **Draft-tool forcing**: SEQ-2 changes the sequences guidance TEXT only; the
  `forceDraftTool=true` booleans (`:1081/:1144`), tool_choice pinning, and the coercion
  branches (`:1918-2043`, COERCION-PINS pinned) are untouched — state this in the report's
  bait audit.

## Reviewer bait (pre-empt all seven in the implementation and the report)

- B1 **exactOptionalPropertyTypes sites**: `AgentActionPayload`/`AiAgentActionEnvelope`
  optionals (`surface?`, `contextNote?`, `target?.label`) — backend payloads must OMIT
  absent keys (never `label: undefined`); the client handler returns
  `string | undefined`, not `string | ''` for "nothing to say".
- B2 **YAML-reload traps**: `compileWorkspaceAction` caches its Ajv validator at module
  scope AND the surfaces registry loads at boot — a "stale" `UNSUPPORTED_SURFACE` after a
  YAML edit is almost always a missed restart, not a code bug. Report must record restart
  before gate evidence.
- B3 **ontology/registry terms required**: the surface id is `sequences` (registry `:92`),
  tab strings must be byte-identical to the declared list (`Editor`, …, `Knowledge`), and
  the meta-schema `additionalProperties:false` (`surfaces.schema.yaml:28`) REJECTS the
  `tabs` key unless the meta-schema delta lands in the same commit — boot throws otherwise.
- B4 **hardcode boundary**: zero new surface-name or keyword branches for routing; the
  compatibility test (registry tabs ≡ schema enum ≡ page const) is the drift fence; a
  reviewer will grep for `'Editor'`/'Analysis' literals outside schema/registry/the page
  const and for `surface === 'sequences'` additions beyond the guidance site.
- B5 **canLeave() semantics**: guard fires only on `===false`, only on RECORD selection —
  a handler that blocks TAB switches is over-blocking (humans don't), one that reimplements
  the guard instead of calling `selectRecord` is drift bait; silent no-throw on block is
  the bait (agent path must return the diagnostic string).
- B6 **the ONE emit path**: any second `type: 'agent_action'` construction anywhere in
  server code, or emitting before/around `compileWorkspaceAction`, breaks the pin
  (branch comment `:2566-2572`); also double-frame idempotence — two identical tab actions
  must not double-append or corrupt state.
- B7 **MANIFEST/golden trap**: touching `schema/scientist-intent/*` (or anything in
  treeState) silently detonates `goldenIntentToGraph.test.ts` and stomps COMP-4's pending
  re-bless of blob 83fda3b4 — SEQ-2's diff must show ZERO treeState-pinned files.

## Assumptions the coder may NOT make

1. No second emission path, no new SSE event type, no client-side Ajv, no prose-parsing of
   assistant text to trigger navigation.
2. `forceDraftTool` for sequences is NOT deleted or flipped to false; navigation answering
   "without drafting" is achieved by the model choosing `workspace_action` inside the
   forced tool, per the guidance text.
3. Agent record-switching goes through the page's existing `selectRecord` — the
   `canLeave()` guard is inherited, never reimplemented, never bypassed; tab actions go
   through the page's existing `setTab` (no guard added, none removed).
4. Nothing executes: an `agent_action` never calls `sequenceApi('/actions')`, never runs
   an analysis, never writes a record. Propose/navigate, never write.
5. The run workspace's `handleAgentAction`/workstate flow, `ChatContextHeader`, and
   `three-pane-harness.spec.ts` are byte-untouched; the pane (`HarnessChatPane`) itself
   needs NO edit (the handler mounts on the page's `useAiChat` options).
6. The real model (qwen3.8-thunderbeast) is the only model the gate exercises; no test may
   encode prompt-keyword routing to fake intent selection.
7. Term resolution stays in the spine — no label substring matching in the compiler or the
   handler.
8. The schema tab-enum ↔ registry `tabs` ↔ page const equivalence is enforced by a test,
   not by a comment; if they disagree, the test fails and the YAML wins.
9. Line numbers in this spec are bf321c4c anchors — re-anchor on the branch base; if a
   cited site moved out of recognition, re-verify by reading, do not patch by memory.

## Open questions for the orchestrator (with recommendation)

- **OQ1 — where do the tab vocabulary live canonically?** Options: (a) hand-authored enum
  in agent-action.schema.yaml + compat test only (plan's "stopgap"); (b) registry `tabs`
  key (meta-schema delta) + compat test + schema fence. I could not find any existing
  `tabs` declaration anywhere (verified surfaces.yaml/surfaces.schema.yaml/surfaces.ts
  first-hand), so no precedent decides it. **Recommend (b)** — it makes the plan's "YAML is
  king" literal at the cost of a 4-line meta-schema addition, and the compat test kills the
  drift class either way.
- **OQ2 — policy door for navigation targets.** compiler store-verifies but does NOT check
  visibility today (finding 7). Options: (a) add the optional `visibility` hook wired from
  `ledgerActor` + `AuthorizationService.canAccess('read')` (deny = `TARGET_NOT_VISIBLE`
  diagnostic); (b) ship SEQ-2 with the same visibility-blindness as PB-CH-1 and file the
  gap. Scout-a confirmed the write/read door pattern; I verified the door itself first-hand.
  **Recommend (a)** — the task block explicitly says effects "must pass
  AccessControlService … explainable refusal", and absent-hook skip keeps every existing
  stubbed test honest.
- **OQ3 — guidance text placement.** One bullet at `:1097-1101` vs a new declared
  prompt-file (systemPrompt.ts sequences role `:319`). I did not find a declarative
  per-surface guidance file for sequences (block is inline). **Recommend the inline
  bullet** (smallest honest delta; a declared-guidance-file refactor is its own item).
- **OQ4 — does SEQ-2 declare ANY capabilities in surfaces.yaml?** The task title says
  "YAML-declared agent actions", the plan puts `capabilities/requires/reviewPolicy` in
  Phase 4a. **Recommend NO capability grammar this pass** (tabs only); Phase 4a keeps the
  capability gate, and inventing half a grammar now collides with it.
- **OQ5 — spine term-resolution for sequence kinds.** A pure-term record selection may
  honestly `UNRESOLVED_TERM` because the boot record provider is kind-restricted
  (finding 9; I verified the wiring site, not every tier's kind list — partial). **Recommend
  NOT extending the spine**: the injected `surfaceContext.records` list is ground truth for
  ids; if the live-model gate repeatedly fails leg 2 on term-only phrasing, file the spine
  kind-mapping extension as its own item rather than sneaking it in.

SPEC-DRAFT-DONE
