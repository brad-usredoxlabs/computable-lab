# PROTO-AI-2/AI-8 in-scope repair — StepUpdateOp kind-change payload — REPORT (worker token l2t1730)

Branch: `wt/PROTO-AI-2-stepupdate-lane2-l2t1730` off `cl/integration-2` @ `0e798b13`.
Commit: `0aff8c38` — fix(ai-2/8): step_update kind-change carries the new kind's payload (relaxed envelope + applier hygiene). NOT merged (orchestrator merges).
Authority: Option (i) RELAXED (`PROTO-AI-9-stepupdate-kindchange-decision.md`), spec `.hermes/plans/2026-10-05_1600-PROTO-AI-2-stepupdate-kindchange-fix.md` (spec file was absent from this worktree; read from the trunk worktree copy).

## Gap re-verification (against source, before coding)
- `$defs.StepUpdateOp` (protocol-edit-op.schema.yaml @ trunk, :248-280) carried only op/stepId/label/description/notes/kind/settings with `unevaluatedProperties: false` — confirmed.
- Applier `protocolEditOps.ts` step_update case: `if (op.kind !== undefined) changes.kind = op.kind` — kind only, confirmed.
- Prompt line :124 mirrored the narrow vocabulary verbatim, confirmed. Gap real.

## Diff summary (`git show --stat 0aff8c38`)
```
 app/.../protocolEditOps.test.ts                | 110 ++++++++  (5 new kind-change tests, drift-free fixtures)
 app/.../protocolEditOps.ts                     | 123 ++++++++-  (UpdatePayloadFields type, UPDATE_PAYLOAD_FIELDS superset,
                                                                  STEP_PAYLOAD_FIELDS_BY_KIND mirror, applyOpsToStepKindChange rebuild,
                                                                  kind-absent path preserved byte-identically)
 schema/workflow/protocol-edit-op.schema.yaml   | 279 ++++++++++++++++++++-  (header ruling, $defs UpdateTarget/UpdateSource/UpdateMaterial,
                                                                  StepUpdateOp allOf per-kind whitelists, $defs/StepPayloadFields DATA registry)
 server/prompts/event-graph-agent.md            |   2 +-        (line :124 ONLY — :125 insert-owned, untouched)
 server/src/schema/ProtocolEditOpSchema.test.ts | 106 ++++++++  (8 new tests incl. drift lock)
 5 files changed, 610 insertions(+), 10 deletions(-)
```
Scope discipline: `$defs.StepInsertOp`, its prompt line :125, its tests, protocolEditValidation.ts (`ENVELOPE_FILES` — expected NO-OP, verified unchanged), lint YAML, intent dispatch, ChangesPanel: all UNTOUCHED (`git show --stat` above is the full change set).

## Mechanism implemented
Envelope (DATA, no TS policy): StepUpdateOp keeps `required:[op, stepId]` + `unevaluatedProperties:false`; `allOf:` 8 branches, each `if: {required:[kind], properties:{kind:{const:<kind>}}}` → `then: {properties:{<that kind's payload props>}}` (no then.required). Outer unevaluatedProperties does double duty via 2020-12 annotation scoping: no kind ⇒ no branch ⇒ every payload field unevaluated → rejected; kind present ⇒ only that kind's fields annotated → wrong-kind fields rejected. Payload shapes copied from protocol.schema.yaml with provenance (UpdateTarget/UpdateSource/UpdateMaterial mirror the insert defs deliberately declared separately — insert-owned descriptions untouched; working_concentration/ratio $ref the SAME shared datatypes already in ENVELOPE_FILES — zero new deps). read's whitelist EXCLUDES StepRead's object `settings` (array adjudication stands; pre-existing hazard untouched). `$defs/StepPayloadFields` encodes per-kind field lists as schema-legal array-of-enum shapes (Ajv strict-clean) — never $ref'd by an op, pure registry DATA.

Applier: op WITHOUT kind → EXACT legacy spread-merge path (byte-identical, regression-pinned). op WITH kind → step rebuilt `{...baseFields, kind, ...explicitPayloadPicks}`: base = every existing step key outside the payload superset (stepId, ordinal, label, description(+derived rich), notes, settings, executionMeta, isOptional, phaseId, phase, plannedOffset, semanticVerb, methodRequirement, executionPreference, subGraphRef — plus unknown keys, base by exclusion), op's listed base edits overriding; payload kept iff in the NEW kind's allow-set (`STEP_PAYLOAD_FIELDS_BY_KIND`, the envelope mirror): op value wins, else step's existing value; absent never written undefined; allow-set-excluded fields DROPPED; op/stepId can never leak (explicit picks, never a spread). Unknown kind string throws naming it (defensive; envelope rejects earlier in the real route).

## Superseded-field disposition (as implemented)
On a kind change every payload field NOT allowed by the NEW kind's `$defs/StepPayloadFields` set is dropped; base fields untouched. wash→mix keeps `cycles` (mix optional), drops `washVolume_uL`; any→other wipes all payload keeping `description` (base). Semantic hygiene per architect §4, proven by fixtures (b)/(d).

## Tests — RED first, real output
RED (before schema/applier change):
- server `ProtocolEditOpSchema.test.ts`: `4 failed | 56 passed (60)` — exactly the new ACCEPT×3 + DRIFT tests failed (payload-without-kind/wrong-kind/unknown-field REJECTs and `{kind:'other'}` already held).
- app `protocolEditOps.test.ts`: `4 failed | 19 passed (23)` — wash→incubate, wash→mix, mix→other, base-field-carry rebuilds failed; the no-kind regression guard passed at trunk (proves legacy behaviour).

GREEN (after change):
- `npm run test:run -w server -- src/schema/ProtocolEditOpSchema.test.ts` → **60 passed (60)**.
- `npm run test:run -w server -- ...ProtocolEditOpSchema ProtocolEdit... Recovery... submitSuggestionTool... attachedProtocol` (5 files) → **84 passed (84)**.
- `npm run test:unit -w app -- protocolEditOps.test.ts` → **23 passed (23)**.
- `npm run test:unit -w app -- src/event-editor/right-pane/protocol` (15 files incl. ChangesPanel/EditModal) → **135 passed (135)**.
- server `src/schema` broad suite AFTER: `134 failed | 209 passed | 53 skipped (416)`; BASELINE at trunk (stashed): `134 failed | 201 passed | 53 skipped (408)` — **zero NEW failures**; identical pre-existing failure set, +8 passes = my 8 new tests. (Pre-existing 134-fail baseline is a trunk condition of this checkout, not introduced here.)
- Pre-existing failures named in the targeted sweep, both VERIFIED at trunk via stash: `promptBudget.test.ts` (43015 > 12000 at trunk; now 43793 — the prompt file already exceeds its budget by ~36x pre-change; +778 chars from line :124 changes nothing about that failure's nature, but flagging the growth) and `chatbotCompile.e2e.test.ts` (1 fail, unrelated seed path).

Drift lock content: parses BOTH YAMLs; asserts `$defs/StepPayloadFields` per-kind enum sets == `protocol.schema.yaml` `$defs/StepXxx.properties` minus `kind`, minus two declared adjudications (read.settings object — realization artifact; other.description — base field). Passes; any record-def field added/renamed breaks it.

## Typecheck baseline compare
Spec brief quotes baselines 33 (server) / 47 (app); this checkout's ACTUAL pre-change baselines are **44** (server) / **40** (app) TS errors (captured at `0e798b13` before any edit: /tmp/tc-server-baseline-l2t1730.txt, /tmp/tc-app-baseline-l2t1730.txt). After change: error sets byte-IDENTICAL (`diff` empty; SERVER_TC_IDENTICAL / APP_TC_IDENTICAL). **Zero NEW typecheck errors** either direction.

## Assumptions / notes
- Applier mirror `STEP_PAYLOAD_FIELDS_BY_KIND` is the TS copy of envelope `$defs/StepPayloadFields`; the drift test locks envelope↔record. App mirror↔envelope parity is pinned behaviourally by the applier fixtures (per-kind keep/drop cases). A single runtime cross-file parity test would need app to load schema YAML — not part of this change's surface.
- `UpdateTarget` allows optional `wells` (record wash/mix/incubate/read/harvest targets declare labwareRole only; StepTransfer.target requires wells). A wash-target-with-wells delta is the record PUT's rejection, not the envelope's — consistent with the relaxed ruling; documented in the def.
- The relaxed ruling's convergent-redraft cost (incomplete delta proposes, record PUT names the missing field, dialogue redrafts) is by design (§1); browser-gate §3.6 is the orchestrator's step after the stack restart (NOT run here — YAML change, restart is orchestrator-owned and BLOCKING for me).

## Blockers
None. Stack not restarted (per instruction); all checks run against vitest/tsc directly.
