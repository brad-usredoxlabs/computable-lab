# W2-8 A5f — declared-roles context injection on the compile-from-prompt answers branch
Item: W2-8-SAID-MEANT-SURFACE (accept-leg obligation; the A5d gate's A5.3 leg)
Lane 2 · trunk cl/integration-2 · worktree-per-coder under /mnt/vast/home/brad/git/wt/
Spec authored by orch l2t1310 2026-10-16 (rule 6c: orch diagnosis + spec; coder implements).

## Goal
The A5d browser gate's accept leg requires: family questions -> answer -> Apply&compile
-> deck review with >=1 resolvable labware -> Load deck & ghost -> pl-accept enabled ->
Accept mints the LPR with branch_resolution choices. Today the accept leg dead-ends at
"No labware resolved yet" because the one-shot compile NEVER sees the source protocol's
declared roles. Fix = inject them as data at the existing seam. Criterion unchanged.

## Orchestrator diagnosis (firsthand, 2026-10-16, live curls against :3093)
1. POST /api/intent/compile-from-prompt accepts body.sourceProtocolId
   (IntentCompileFromPromptHandlers.ts:123) but NEVER loads the protocol record.
   The answers-present branch (IntentCompileFromPromptHandlers.ts ~:296-315) calls
   compileFromSmallLlm with prompt = composeAnsweredPrompt(protocolText, answers)
   (:146-155) + labInventory only. composeIntentPrompt (compiler/scientistIntent/
   intentCompile.ts:128-141) injects only INSTRUMENTS/LABWARE/MATERIALS inventory
   sections — never the protocol's declared roles.
2. Headless reproduction A (fixture-sparse text, answers variant_a): model emitted a
   1-action macro {add_material material "Lysis Solution"} with ZERO labware refs;
   200 outcome=complete; terminalArtifacts carries NEITHER labwareAdditions NOR
   resolvedLabwares keys (compileScientistIntent.ts:331-341 emits them only from a
   NON-EMPTY resolveLabwareOutput). Client chain confirmed by source read:
   deriveDeckLabware (app/.../ProtocolLocalizationThread.tsx:116-120) -> zero rows ->
   deckPicked empty -> buildPreviewFromDraft 0 placements -> hasPreview false (
   ProtocolLocalizationThread.tsx:315-317, :670-675) -> pl-accept disabled. This IS
   the A5d receipt state ("No labware resolved yet", "Load onto deck & ghost events (0)").
3. Headless reproduction B (text naming 'microcentrifuge tube'): model DID reference
   the noun (5-action macro incl. create_container/add_material/mix/transfer) but the
   spine ambiguous-noun-barred it (candidates '1.5 mL Microcentrifuge Tube (seed)' vs
   '80-Tube Bench Rack — 1.5/2 mL' both confidence 1) -> 422 needs-clarification,
   resolvedLabwares STILL absent. So text-enrichment ALONE is not the fix; the fixture's
   roles.labwareRoles [{roleId: microcentrifuge-tube, description: 'microcentrifuge tube'}]
   is the disambiguating ground truth the model never receives.
4. The prior 21:00 adjudication ("0 labware-design records -> dead-by-empty-fixture")
   is WITHDRAWN: the resolver queries kind='labware' (compiler/labwareLookup.ts:77;
   orch-verified) and the lane DB holds 27 such records.

## Design (smallest honest change; declarative-first)
D1 SERVER HALF (only production change): on the ANSWERS-PRESENT branch ONLY, when
   body.sourceProtocolId is present, load the protocol record via the existing store
   (handler already has `const store: RecordStore = deps.store ?? ctx.store` at :197;
   store.get(id) is the repo pattern — scout-screened + orch-verified call sites).
   If it resolves to a readable kind=protocol record, append to the answered prompt a
   compact DECLARED ROLES block built DATA-DRIVEN from payload.roles per
   schema/workflow/protocol.schema.yaml (:188-198 labwareRoles/materialRoles/
   instrumentRoles; LabwareRole = roleId (:453), description (:456),
   expectedLabwareKinds (:458)): roleId + description (+ expectedLabwareKinds ids when
   present), one line each, with a framing line: the scientist declared these roles for
   this protocol — bind matching nouns to them (use the role description as the
   labware/material name when it matches). NO hardcoding of vocab, NO protocol-field
   literals beyond reading payload.roles. Absent sourceProtocolId / unreadable record /
   no roles -> EXACTLY today's behavior (byte-identical prompt; no block, no error).
   Ask branch (no answers) is UNCHANGED. The block rides composeAnsweredPrompt's output
   (extend that function or append at the call site — coder's choice, no second channel).
D2 NO client changes. pl-accept, deriveDeckLabware, buildPreviewFromDraft stay as-is:
   once terminalArtifacts carries resolvedLabwares (spine resolves the role-noun against
   kind=labware inventory), the existing chain enables accept by construction.
   If the spine still ambiguous-bars a role noun, that is evidence, not a defect to
   paper over — report it.
D3 FIXTURE TEXT is TEST DATA (Brad standing ruling). The gate sends what the Protocol
   tab holds; if the coder's RED evidence shows the fixture's humanStepsText is
   unavailable/sparse, the gate prompt may paste richer protocol text — that is a gate
   harness concern (orch handles at gate time), NOT a product change. Do not edit the
   CAN-protocol record.

## RED-first mandate (server vitest, stub inference; NEVER hit :3093)
R1 prompt-capture: answers + readable protocolId -> captured outbound prompt contains
   the declared-roles block with the record's roleIds/descriptions (no model needed —
   capture via the injected llmClient stub).
R2 regression: no sourceProtocolId, or protocol record absent -> captured prompt
   byte-identical to pre-change output for the same input.
R3 ask-branch untouched: needsAnswers path unchanged (existing tests green).
R4 unreadable/non-protocol id (wrong kind) -> behaves as absent (no block, no throw);
   loud ONLY for genuine store faults per the handler's existing error convention.
Bars: targeted vitest set + workstate/honesty parity + in-worktree sorted-set tsc
diff vs branch point (lane-exclude trap: repaired-symlink worktree only).

## Files
server/src/api/handlers/IntentCompileFromPromptHandlers.ts (+ sibling test — add to the
existing answeredPrompt test file's family, unique name allowed); NO app/, NO schema,
NO YAML beyond none. File-disjoint with live SH-QC-1S review artifacts (server/src/ai/*).

## Stop boundaries
(1) payload.roles missing/irregular on a kind=protocol record: treat as absent; if the
    schema makes that impossible, note it.
(2) If terminalArtifacts still carries no resolvedLabwares even with the block (spine
    bar), STOP AND FLAG with the captured macro + clarification payload — do NOT widen
    scope to spine disambiguation policy (that is THREAD-ASK-1 territory).
(3) Any change required in app/ or the resolver: stop boundary, report.

## Gate (orch, post-merge)
Restart lane stack, re-run orch headless reproduction A (fixture text via the Protocol
tab's actual oneShotSourceText) expecting resolvedLabwares/labwareAdditions non-empty OR
a flagged spine-bar evidence packet; then A5f = tier-2 A5d gate re-shoot (same criteria
verbatim, receipts dir new timestamp). AS-LANE2-W28-GATE1-INVALID-ACCEPT stays open until
that gate says VERDICT: accept.
