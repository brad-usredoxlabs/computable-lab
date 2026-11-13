# L2-JOURNEY-CHECKPOINT-1 — UNIT cpschema2 (1 of 4) — report

Run: cl-spec-composer brief 0201, lane 2. Worktree
`/home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cpschema2-lane2`, branch
`cl/lane2-journey-checkpoint1-cpschema2-0201`, base `82d51fba`.

## What landed

Two closed schema documents + ONE Ajv-backed validation seam (no store, no
route, no client — later units):

- `schema/workflow/pending-intent-checkpoint.schema.yaml` (81 lines) — draft
  2020-12, `$id` on the human-task convention, `additionalProperties: false`
  at every object level EXCEPT `restoration_state` (deliberately open, stated
  in its description; unit 3 gives surfaces their own export). Required:
  identity/lineage (checkpoint_id, journey_ref, revision, thread_ref =
  ai-threads threadId), request_anchor {message_id, verbatim_text} both
  minLength 1 (immutable by contract, same shape as
  journey-document.schema.yaml:36), pending_intent {intent_id,
  intent_revision}, `unresolved_slots` (name + semantic_type; empty array
  allowed — an unset slot is DECLARED), origin {surface, route, active_tab,
  record_revisions[]}, restoration_state, optional parent_journey_ref,
  expected_return_type = the six journey-port `$defs` names (the port
  vocabulary — journey-document's `permitted_result_types` is a free
  pattern string, so the closed vocabulary available to declare is the port
  one; a test pins the enum to journey-port.schema.yaml `$defs`), status enum
  EXACTLY [pending, resumable, resumed, cancelled, blocked],
  concurrency_version (integer, min 1), optional resume_receipt
  {receipt_id, resumed_at (date-time), resumed_by, outcome}.
- `schema/workflow/context-delta.schema.yaml` (51 lines) — closed; entry kind
  enum [unresolved-slot, proposed-addition]; canonical_value + semantic_type;
  source_records minItems 1 ({record_id, revision}); source_journey_ref,
  source_step_id; evidence (array of strings, may be empty); epistemic_status
  enum EXACTLY [observed, user-selected, inferred, proposed]; accepted_by
  {actor, at(date-time)}. Optional `request_revision`
  {changed_fields ⊆ [quantity,targets,purpose], reason} whose PRESENCE forbids
  silent injection — stated in its description, prose in `description:` keys
  only.
- `server/src/compiler/journey/checkpointContract.ts` (94 lines) — one Ajv
  (`ajv/dist/2020.js` + ajv-formats for date-time, imported as
  policySetEvaluator.test.ts does), both schemas + journey-port added BEFORE
  compile, schema dir resolved exactly like journeyDocumentLint.ts:65
  (`new URL('.', import.meta.url)` + `'../../../../schema/workflow'`).
  Exports `validateCheckpoint(doc, opts?: { messageText?: string })`,
  `validateContextDelta(doc)`, `ContractDiagnostic {code,path,message}` with
  all seven required codes. `anchor-not-verbatim` fires ONLY when
  messageText is SUPPLIED and differs (exactOptionalPropertyTypes: the option
  is absent, never forwarded as undefined). `slot-undetermined` checks
  semantic_type against the port schema's `$defs` read from disk — no baked
  vocabulary. Ajv errors map instancePath VERBATIM into `path`; no hand-rolled
  shape checks, no `as any` on parsed results.
- `server/src/compiler/journey/checkpointContract.test.ts` (74 lines) —
  asserts CODES: valid minimal checkpoint accepted; empty verbatim_text ->
  anchor-missing; mismatched messageText -> anchor-not-verbatim (and absent
  opts is NOT a failure); status "parked" -> status-invalid; unknown property
  -> unknown-property with path "/"; delta entry missing epistemic_status ->
  delta-entry-incomplete; source_records [] -> source-records-empty; absent
  accepted_by -> delta-entry-incomplete; invented label "vibes" ->
  epistemic-status-invalid. Drift tests: schema status enum ==
  CHECKPOINT_STATUSES, delta epistemic_status enum == EPISTEMIC_STATUSES,
  expected_return_type enum == EXPECTED_RETURN_TYPES == journey-port $defs.

Bootstrap note (gitignored, not part of the diff): fresh worktree needed
`node_modules` + `server/node_modules` symlinks (pnpm store on /mnt/vast, the
L2-JCC-u2loader pattern) and `server/schema -> ../schema`; resolved cleanly,
no install run.

## Acceptance — ACTUAL output (2026-11-13 ~03:00 EST)

- `npx vitest run src/compiler/journey/checkpointContract.test.ts` ->
  Test Files 1 passed (1); Tests **7 passed (7)** (61ms tests).
- `npx vitest run src/compiler/journey/journeyDocumentLint.test.ts` ->
  Tests **5 passed (5)** (58ms) — baseline unchanged.
- `npx tsc --noEmit` -> exit **0** (baseline 0).
- Both YAMLs compile under Ajv 2020-12 strict:true (the loader above compiles
  them at module load — every test proves it); additionalProperties:false
  everywhere except restoration_state.
- Diffstat (`git diff --stat 82d51fba..HEAD`): exactly 4 paths, **300
  insertions**, 0 deletions — files 81+51+94+74 = 300 lines, inside budget.

## Commits

- `25d37c25` the two schema declarations
- `29be43e5` checkpointContract.ts + test (seam + drift tests)
- (this report) paperwork commit

UNIT cpschema2 DONE
